"""
OpenSys FastAPI 应用

提供 HTTP + WebSocket 接口：
- POST /chat          — 发送消息（SSE 流式输出）
- POST /chat/approve  — 提交审批结果（恢复 interrupt）
- GET  /conversations — 获取对话列表
- GET  /conversations/{thread_id}/history — 获取对话历史
- DELETE /conversations/{thread_id} — 删除对话
- GET  /health        — 健康检查
- WS   /ws/{thread_id} — WebSocket 实时对话
"""

import json
import uuid
import asyncio
from typing import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Literal, Union

import aiosqlite
from langgraph.types import Command
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage, AIMessageChunk

from ..graph import compile_graph
from ..db.manager import DatabaseManager
from ..utils import sanitize_text
from ..safe_saver import SafeAsyncSqliteSaver
from .. import config


# ==================== 请求/响应模型 ====================

class ChatRequest(BaseModel):
    """对话请求"""
    query: str = Field(..., description="用户消息内容")
    thread_id: Optional[str] = Field(default=None, description="对话线程 ID（为空则新建对话）")


class ApprovalRequest(BaseModel):
    """审批请求"""
    thread_id: str = Field(..., description="对话线程 ID")
    action: Literal["approved", "rejected", "modified"] = Field(..., description="审批结果")
    modified_command: Optional[str] = Field(default=None, description="修改后的命令（action=modified 时使用）")


class ConversationResponse(BaseModel):
    """对话信息响应"""
    thread_id: str
    title: str
    status: str
    message_count: int
    created_at: str
    updated_at: str


# ==================== 全局单例 ====================

# 数据库管理器
db = DatabaseManager()

# LangGraph checkpointer（与 db 共用 SQLite 文件）
_saver: Optional[SafeAsyncSqliteSaver] = None
_compiled_graph = None


async def get_saver() -> SafeAsyncSqliteSaver:
    """获取 SafeAsyncSqliteSaver 单例（自动清理 surrogate 字符）"""
    global _saver
    if _saver is None:
        conn = await aiosqlite.connect(str(config.DB_PATH))
        _saver = SafeAsyncSqliteSaver(conn)
        await _saver.setup()
    return _saver


async def get_graph():
    """获取编译后的图单例"""
    global _compiled_graph
    if _compiled_graph is None:
        saver = await get_saver()
        _compiled_graph = compile_graph(checkpointer=saver)
    return _compiled_graph


# ==================== 应用生命周期 ====================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用启动和关闭时的生命周期管理"""
    # 启动
    await db.initialize()
    await get_saver()
    await get_graph()
    print("✅ OpenSys Agent 已启动")
    print(f"   模型: {config.DEFAULT_MODEL_PROVIDER}/{config.DEFAULT_MODEL_NAME}")
    print(f"   数据库: {config.DB_PATH}")
    print(f"   授权等级: {config.DEFAULT_AUTH_LEVEL}")

    yield

    # 关闭
    await db.close()
    if _saver:
        await _saver.conn.close()
    print("🔴 OpenSys Agent 已关闭")


# ==================== 创建 FastAPI 应用 ====================

app = FastAPI(
    title="OpenSys AI Agent",
    description="渐进式授权 AI Agent 系统",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS 配置（开发阶段允许所有来源）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== API 路由 ====================

@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "ok", "model": config.DEFAULT_MODEL_NAME}


@app.post("/chat")
async def chat_stream(request: ChatRequest):
    """
    发送消息并获取 SSE 流式响应

    如果 AI 需要执行工具且风险等级不是 safe，
    流会发送 approval_request 事件并暂停，
    客户端需要调用 /chat/approve 提交审批结果后再重新调用 /chat 继续。
    """
    graph = await get_graph()

    # 新建或继续对话
    thread_id = request.thread_id or str(uuid.uuid4())
    is_new = request.thread_id is None

    # 记录对话
    await db.create_conversation(thread_id)

    # 配置
    graph_config = {
        "configurable": {"thread_id": thread_id}
    }

    # 输入
    graph_input = {
        "messages": [HumanMessage(content=request.query)],
        "auth_level": config.DEFAULT_AUTH_LEVEL,
    }

    async def generate() -> AsyncGenerator[str, None]:
        """SSE 流式生成器"""
        # 发送 thread_id（客户端需要保存用于后续请求）
        yield _sse_event("thread_id", {"thread_id": thread_id, "is_new": is_new})

        try:
            async for event in graph.astream_events(
                graph_input, config=graph_config, version="v2"
            ):
                kind = event.get("event", "")
                data = event.get("data", {})

                # LLM 流式 token
                if kind == "on_chat_model_stream":
                    chunk = data.get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        yield _sse_event("token", {"content": sanitize_text(chunk.content)})

                    # 深度思考内容（DeepSeek Reasoner 等模型）
                    if chunk and hasattr(chunk, "additional_kwargs"):
                        reasoning = chunk.additional_kwargs.get("reasoning_content")
                        if reasoning:
                            yield _sse_event("reasoning", {"content": sanitize_text(reasoning)})

                # 工具调用开始
                elif kind == "on_tool_start":
                    tool_name = event.get("name", "")
                    yield _sse_event("tool_start", {"tool_name": tool_name})

                # 工具调用结束
                elif kind == "on_tool_end":
                    tool_name = event.get("name", "")
                    output = data.get("output", "")
                    yield _sse_event("tool_end", {
                        "tool_name": tool_name,
                        "output": str(output)[:2000],  # 截断过长输出
                    })

            # 流结束后检查是否有 interrupt（LangGraph v2 中 interrupt 可能不抛异常）
            state = await graph.aget_state(graph_config)
            if state.next:  # 有待恢复的节点 → interrupt 被触发
                interrupts = []
                for task in state.tasks:
                    if hasattr(task, 'interrupts') and task.interrupts:
                        interrupts.extend(task.interrupts)
                if interrupts:
                    interrupt_data = interrupts[0].value if interrupts[0] else {}
                    yield _sse_event("approval_request", {
                        "thread_id": thread_id,
                        "data": interrupt_data,
                    })
                    return

            # 正常完成
            yield _sse_event("done", {"thread_id": thread_id})

        except Exception as e:
            error_msg = str(e)
            # 兜底：检查异常是否是 interrupt（部分 LangGraph 版本会抛异常）
            if "interrupt" in error_msg.lower() or "GraphInterrupt" in error_msg:
                try:
                    state = await graph.aget_state(graph_config)
                    if state.next:
                        interrupts = []
                        for task in state.tasks:
                            if hasattr(task, 'interrupts') and task.interrupts:
                                interrupts.extend(task.interrupts)
                        if interrupts:
                            interrupt_data = interrupts[0].value if interrupts[0] else {}
                            yield _sse_event("approval_request", {
                                "thread_id": thread_id,
                                "data": interrupt_data,
                            })
                            return
                except Exception:
                    pass

            yield _sse_event("error", {"message": sanitize_text(error_msg)})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/chat/approve")
async def approve_action(request: ApprovalRequest):
    """
    提交审批结果，恢复被 interrupt 暂停的图执行

    审批通过后，客户端应重新调用 /chat 继续获取流式输出。
    """
    graph = await get_graph()

    graph_config = {
        "configurable": {"thread_id": request.thread_id}
    }

    # 验证当前状态是否有待恢复的 interrupt
    state = await graph.aget_state(graph_config)
    if not state.next:
        raise HTTPException(400, "该对话没有待审批的操作")

    # 构造审批回复
    resume_value = {
        "action": request.action,
    }
    if request.modified_command:
        resume_value["modified_command"] = request.modified_command

    # 记录审批到审计日志
    await db.log_audit(
        event_type="approval",
        thread_id=request.thread_id,
        details=resume_value,
        result=request.action,
    )

    # 使用 Command(resume=...) 恢复图执行
    # 客户端需要重新调用 /chat（不带 query）来获取后续流式输出
    # 这里先更新状态，让后续的 stream 能继续
    try:
        # 恢复 interrupt 并执行
        result = await graph.ainvoke(
            Command(resume=resume_value),
            config=graph_config,
        )
        return {
            "status": "ok",
            "action": request.action,
            "thread_id": request.thread_id,
            "message": "审批已提交，对话将继续执行",
        }
    except Exception as e:
        raise HTTPException(500, f"恢复执行失败: {str(e)}")


@app.get("/conversations")
async def list_conversations():
    """获取所有对话列表"""
    conversations = await db.list_conversations()
    return {"conversations": conversations}


@app.delete("/conversations/{thread_id}")
async def delete_conversation(thread_id: str):
    """删除指定对话"""
    saver = await get_saver()
    try:
        # 删除 LangGraph checkpoint
        await saver.adelete_thread(thread_id)
        # 标记对话为已归档
        await db.conn.execute(
            "UPDATE conversations SET status = 'archived' WHERE thread_id = ?",
            (thread_id,),
        )
        await db.conn.commit()
        return {"status": "ok", "message": f"对话 {thread_id} 已删除"}
    except Exception as e:
        raise HTTPException(500, f"删除对话失败: {str(e)}")


@app.get("/conversations/{thread_id}/history")
async def get_conversation_history(thread_id: str):
    """获取指定对话的消息历史"""
    saver = await get_saver()
    graph_config = {"configurable": {"thread_id": thread_id}}

    try:
        state = await _compiled_graph.aget_state(graph_config)
        if not state or not state.values:
            return {"messages": []}

        messages = state.values.get("messages", [])
        history = []
        for msg in messages:
            entry = {"id": getattr(msg, "id", ""), "content": ""}
            if isinstance(msg, HumanMessage):
                entry["role"] = "user"
                entry["content"] = msg.content if isinstance(msg.content, str) else str(msg.content)
            elif isinstance(msg, AIMessage):
                entry["role"] = "ai"
                entry["content"] = msg.content if isinstance(msg.content, str) else str(msg.content)
                if msg.tool_calls:
                    entry["tool_calls"] = msg.tool_calls
            elif isinstance(msg, ToolMessage):
                entry["role"] = "tool"
                entry["content"] = msg.content[:2000] if msg.content else ""
                entry["tool_name"] = getattr(msg, "name", "")
            else:
                continue
            history.append(entry)

        return {"thread_id": thread_id, "messages": history}

    except Exception as e:
        raise HTTPException(500, f"获取历史失败: {str(e)}")


# ==================== WebSocket 实时对话 ====================

@app.websocket("/ws/{thread_id}")
async def websocket_chat(websocket: WebSocket, thread_id: str):
    """
    WebSocket 实时对话端点

    消息协议（JSON）：
    客户端 → 服务端:
        {"type": "user_message", "content": "..."}
        {"type": "approval", "action": "approved/rejected/modified", "modified_command": "..."}

    服务端 → 客户端:
        {"type": "token", "content": "..."}          — AI 流式 token
        {"type": "reasoning", "content": "..."}      — 深度思考内容
        {"type": "tool_start", "tool_name": "..."}   — 工具调用开始
        {"type": "tool_end", "tool_name": "...", "output": "..."} — 工具调用结束
        {"type": "approval_request", "data": {...}}  — 审批请求
        {"type": "done"}                             — 完成
        {"type": "error", "message": "..."}          — 错误
    """
    await websocket.accept()
    graph = await get_graph()
    graph_config = {"configurable": {"thread_id": thread_id}}

    # 确保对话记录存在
    await db.create_conversation(thread_id)

    try:
        while True:
            # 接收客户端消息
            raw = await websocket.receive_json()
            msg_type = raw.get("type", "")

            if msg_type == "user_message":
                content = raw.get("content", "")
                if not content:
                    continue

                graph_input = {
                    "messages": [HumanMessage(content=content)],
                    "auth_level": config.DEFAULT_AUTH_LEVEL,
                }

                # 流式输出
                await _stream_to_websocket(
                    graph, graph_input, graph_config, websocket
                )

            elif msg_type == "approval":
                action = raw.get("action", "rejected")
                resume_value = {"action": action}
                if raw.get("modified_command"):
                    resume_value["modified_command"] = raw["modified_command"]

                # 记录审批
                await db.log_audit(
                    event_type="approval",
                    thread_id=thread_id,
                    details=resume_value,
                    result=action,
                )

                # 恢复执行并流式输出
                await _stream_to_websocket(
                    graph, Command(resume=resume_value), graph_config, websocket
                )

    except WebSocketDisconnect:
        print(f"[WebSocket] 客户端断开: {thread_id}")
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


async def _stream_to_websocket(graph, graph_input, graph_config, websocket: WebSocket):
    """将图的流式输出转发到 WebSocket"""
    try:
        async for event in graph.astream_events(
            graph_input, config=graph_config, version="v2"
        ):
            kind = event.get("event", "")
            data = event.get("data", {})

            if kind == "on_chat_model_stream":
                chunk = data.get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    await websocket.send_json({
                        "type": "token",
                        "content": sanitize_text(chunk.content),
                    })
                if chunk and hasattr(chunk, "additional_kwargs"):
                    reasoning = chunk.additional_kwargs.get("reasoning_content")
                    if reasoning:
                        await websocket.send_json({
                            "type": "reasoning",
                            "content": sanitize_text(reasoning),
                        })

            elif kind == "on_tool_start":
                await websocket.send_json({
                    "type": "tool_start",
                    "tool_name": event.get("name", ""),
                })

            elif kind == "on_tool_end":
                await websocket.send_json({
                    "type": "tool_end",
                    "tool_name": event.get("name", ""),
                    "output": str(data.get("output", ""))[:2000],
                })

        # 流结束后检查是否有 interrupt（LangGraph v2 中 interrupt 可能不抛异常）
        state = await graph.aget_state(graph_config)
        if state.next:  # 有待恢复的节点 → interrupt 被触发
            interrupts = []
            for task in state.tasks:
                if hasattr(task, 'interrupts') and task.interrupts:
                    interrupts.extend(task.interrupts)
            if interrupts:
                await websocket.send_json({
                    "type": "approval_request",
                    "data": interrupts[0].value if interrupts[0] else {},
                })
                return

        await websocket.send_json({"type": "done"})

    except Exception as e:
        error_msg = str(e)
        # 兜底：检查异常是否是 interrupt
        if "interrupt" in error_msg.lower() or "GraphInterrupt" in error_msg:
            try:
                state = await graph.aget_state(graph_config)
                if state.next:
                    interrupts = []
                    for task in state.tasks:
                        if hasattr(task, 'interrupts') and task.interrupts:
                            interrupts.extend(task.interrupts)
                    if interrupts:
                        await websocket.send_json({
                            "type": "approval_request",
                            "data": interrupts[0].value if interrupts[0] else {},
                        })
                        return
            except Exception:
                pass

        await websocket.send_json({"type": "error", "message": sanitize_text(error_msg)})


# ==================== 辅助函数 ====================

def _sse_event(event_type: str, data: dict) -> str:
    """格式化 SSE 事件"""
    return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
