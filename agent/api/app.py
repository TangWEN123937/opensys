"""
OpenSys FastAPI 应用

提供 HTTP + WebSocket 接口：
- POST /chat          — 发送消息（SSE 流式输出，支持 unattended 无人值守模式）
- POST /chat/approve  — 提交审批结果（恢复 interrupt）
- GET  /conversations — 获取对话列表
- GET  /conversations/{thread_id}/history — 获取对话历史
- DELETE /conversations/{thread_id} — 删除对话
- POST /schedules     — 创建定时任务（自动同步到 crontab）
- GET  /schedules     — 查询定时任务列表
- GET  /schedules/{id} — 获取单个定时任务详情
- PUT  /schedules/{id}/pause  — 暂停定时任务
- PUT  /schedules/{id}/resume — 恢复定时任务
- DELETE /schedules/{id} — 删除定时任务
- POST /schedules/{id}/run — 手动/cron 触发执行定时任务
- GET  /health        — 健康检查
- WS   /ws/{thread_id} — WebSocket 实时对话
"""

import json
import re
import uuid
import asyncio
import subprocess
from pathlib import Path
from datetime import datetime
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
    unattended: bool = Field(default=False, description="无人值守模式：自动处理所有审批/确认（定时任务使用）")
    force_planning: bool = Field(default=False, description="强制开启规划模式：跳过 Agent 直入 Advisor（等效 /plan）")


class ApprovalRequest(BaseModel):
    """审批/介入请求"""
    thread_id: str = Field(..., description="对话线程 ID")
    action: str = Field(..., description="操作类型：approved/rejected/modified/revise/pass/feedback/skip/abort")
    modified_command: Optional[str] = Field(default=None, description="修改后的命令（action=modified 时使用）")
    feedback: Optional[str] = Field(default=None, description="用户修改意见（action=feedback 时使用）")


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

    # 配置（recursion_limit 防止无限循环）
    graph_config = {
        "configurable": {"thread_id": thread_id},
        "recursion_limit": config.RECURSION_LIMIT,
    }

    # 输入（无人值守模式传入 unattended=True，所有 interrupt 自动处理）
    graph_input = {
        "messages": [HumanMessage(content=request.query)],
        "auth_level": config.DEFAULT_AUTH_LEVEL,
        "unattended": request.unattended,
    }

    # 强制开启规划模式：预设 advisor_context，Agent 节点短路跳转到 Advisor
    if request.force_planning:
        graph_input["advisor_context"] = {
            "user_request": request.query,
            "background": "用户通过前端开关主动开启规划模式",
            "constraints": [],
            "existing_progress": "",
            "replan_reason": "",
        }

    # LangGraph 图节点名称集合（用于过滤 on_chain_start/end 只取节点级事件）
    _GRAPH_NODES = {
        "agent", "risk_assessment", "approval", "rejection", "tools",
        "advisor", "browser", "dispatcher", "executor", "reviewer", "phase_done",
    }

    async def generate() -> AsyncGenerator[str, None]:
        """SSE 流式生成器"""
        # 订阅全局事件总线（接收 skill_loaded / browser_step 等事件）
        from ..event_bus import subscribe, unsubscribe
        _event_queue = subscribe()

        # 发送 thread_id（客户端需要保存用于后续请求）
        yield _sse_event("thread_id", {"thread_id": thread_id, "is_new": is_new})

        # 上一次发送的阶段编号（去重，避免重复推送 phase_update）
        _last_phase_idx = -1

        # --- 合并队列：将 astream_events 和 event_bus 合并到一个队列 ---
        # browser-use 使用自己的 LLM（不经过 LangChain），其执行期间
        # astream_events 不会产出事件，但 event_bus 中的 browser_step 需要实时推送。
        # 通过后台协程将 astream_events 写入 _merged_queue，主循环同时消费两个源。
        _merged_queue: asyncio.Queue = asyncio.Queue()
        _SENTINEL = object()  # 标记 astream_events 结束

        async def _stream_to_queue():
            """后台任务：将 astream_events 写入合并队列"""
            try:
                async for event in graph.astream_events(
                    graph_input, config=graph_config, version="v2"
                ):
                    await _merged_queue.put(("graph", event))
            except Exception as e:
                await _merged_queue.put(("error", e))
            finally:
                await _merged_queue.put(("done", _SENTINEL))

        _stream_task = asyncio.create_task(_stream_to_queue())

        try:
            while True:
                # 同时等待：合并队列（astream_events）和事件总线（browser_step 等）
                # 使用短超时轮询 event_bus，避免 browser_step 延迟
                try:
                    source, payload = await asyncio.wait_for(_merged_queue.get(), timeout=0.1)
                except asyncio.TimeoutError:
                    # 超时：检查 event_bus 中是否有待推送事件
                    while not _event_queue.empty():
                        try:
                            bus_event = _event_queue.get_nowait()
                            yield _sse_event(bus_event["type"], bus_event)
                        except asyncio.QueueEmpty:
                            break
                    continue

                # astream_events 结束
                if source == "done":
                    break

                # astream_events 异常
                if source == "error":
                    raise payload

                # 先消费 event_bus 中累积的事件（browser_step 优先推送）
                while not _event_queue.empty():
                    try:
                        bus_event = _event_queue.get_nowait()
                        yield _sse_event(bus_event["type"], bus_event)
                    except asyncio.QueueEmpty:
                        break

                # 处理 astream_events 事件
                event = payload
                kind = event.get("event", "")
                data = event.get("data", {})

                # --- 节点进入/退出事件（从 on_chain_start/end 过滤图节点） ---
                if kind == "on_chain_start":
                    chain_name = event.get("name", "")
                    if chain_name in _GRAPH_NODES:
                        yield _sse_event("node_enter", {"node": chain_name})
                        # 检查是否有阶段变化（从输入 state 提取）
                        inp = data.get("input", {})
                        if isinstance(inp, dict):
                            _cur = inp.get("current_phase")
                            _pipeline = inp.get("pipeline")
                            if _cur is not None and _pipeline and _cur != _last_phase_idx:
                                _last_phase_idx = _cur
                                _phases = _pipeline.get("phases", [])
                                _ph_name = _phases[_cur].get("name", "") if _cur < len(_phases) else ""
                                _ph_method = _phases[_cur].get("method", "") if _cur < len(_phases) else ""
                                yield _sse_event("phase_update", {
                                    "current_phase": _cur,
                                    "total_phases": len(_phases),
                                    "phase_name": _ph_name,
                                    "phase_method": _ph_method,
                                    "phase_status": inp.get("phase_status", ""),
                                })
                    continue

                if kind == "on_chain_end":
                    chain_name = event.get("name", "")
                    # 调试：记录所有 on_chain_end 的 name 和 output 结构
                    _out = data.get("output", {})
                    _out_keys = list(_out.keys()) if isinstance(_out, dict) else type(_out).__name__
                    print(f"[API-Debug-ALL] on_chain_end name='{chain_name}' output={_out_keys}")
                    if chain_name in _GRAPH_NODES:
                        yield _sse_event("node_exit", {"node": chain_name})
                        # 对于不触发 on_chat_model_stream 的 subagent 节点
                        # （如 browser_node 内部用 browser-use 自己的 LLM 循环，
                        #   advisor/executor/reviewer 返回的结构化 AIMessage 也同理），
                        # 需要从 on_chain_end 的输出 state 中提取最终 AIMessage 推送给前端，
                        # 否则用户在聊天框看不到这些节点的执行结果/总结。
                        if chain_name in _SUBAGENT_NODES:
                            output = data.get("output", {})
                            msg_content = _extract_last_ai_message(output)
                            # 调试日志：确认 subagent 节点的 AIMessage 是否被正确提取
                            print(f"[API-Debug] subagent on_chain_end: node={chain_name} "
                                  f"output_keys={list(output.keys()) if isinstance(output, dict) else type(output).__name__} "
                                  f"msg_len={len(msg_content)}")
                            if msg_content:
                                yield _sse_event("token", {
                                    "content": sanitize_text(f"\n\n{msg_content}\n")
                                })
                    continue

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

            # 推送事件总线中累积的事件（如 skill_loaded）
            while not _event_queue.empty():
                try:
                    bus_event = _event_queue.get_nowait()
                    yield _sse_event(bus_event["type"], bus_event)
                except asyncio.QueueEmpty:
                    break

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
        finally:
            # 清理后台 stream task 和事件订阅
            if not _stream_task.done():
                _stream_task.cancel()
                try:
                    await _stream_task
                except (asyncio.CancelledError, Exception):
                    pass
            unsubscribe(_event_queue)

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
    提交审批结果并以 SSE 流式返回后续执行事件

    使用 Command(resume=...) 恢复被 interrupt 暂停的图执行，
    通过 SSE 实时推送后续节点进入/退出、token、工具调用等事件，
    与 /chat 的 SSE 格式完全一致。
    """
    graph = await get_graph()

    graph_config = {
        "configurable": {"thread_id": request.thread_id},
        "recursion_limit": config.RECURSION_LIMIT,
    }

    # 验证当前状态是否有待恢复的 interrupt
    state = await graph.aget_state(graph_config)
    if not state.next:
        raise HTTPException(400, "该对话没有待审批的操作")

    # 检测 interrupt 类型，构造相应的 resume 值
    # ask_user interrupt 期望接收纯文本字符串（用户回复）
    # approval_request / pipeline_confirmation 等期望接收 dict（含 action 字段）
    interrupt_type = None
    for task in state.tasks:
        if hasattr(task, 'interrupts') and task.interrupts:
            iv = task.interrupts[0].value
            if isinstance(iv, dict):
                interrupt_type = iv.get("type")
            break

    if interrupt_type == "ask_user":
        # ask_user 工具：resume 值直接作为 ask_user 的返回值给 LLM
        # 用户的回复内容在 feedback 字段中
        resume_value = request.feedback or request.action
    else:
        # approval_request / pipeline_confirmation 等：保持 dict 格式
        resume_value = {
            "action": request.action,
        }
        if request.modified_command:
            resume_value["modified_command"] = request.modified_command
        if request.feedback:
            resume_value["feedback"] = request.feedback

    # 记录审批到审计日志
    await db.log_audit(
        event_type="approval",
        thread_id=request.thread_id,
        details={"type": interrupt_type, "action": request.action, "feedback": request.feedback},
        result=request.action,
    )

    # LangGraph 图节点名称集合（与 /chat 一致）
    _GRAPH_NODES = {
        "agent", "risk_assessment", "approval", "rejection", "tools",
        "advisor", "browser", "dispatcher", "executor", "reviewer", "phase_done",
    }

    async def generate() -> AsyncGenerator[str, None]:
        """SSE 流式生成器：恢复 interrupt 后持续推送事件"""
        from ..event_bus import subscribe, unsubscribe
        _event_queue = subscribe()

        # 发送 thread_id（客户端需要确认）
        yield _sse_event("thread_id", {"thread_id": request.thread_id, "is_new": False})

        _last_phase_idx = -1

        # --- 合并队列：同 /chat 端点，确保 browser_step 实时推送 ---
        _merged_queue: asyncio.Queue = asyncio.Queue()
        _SENTINEL = object()

        async def _stream_to_queue():
            """后台任务：将 astream_events 写入合并队列"""
            try:
                async for event in graph.astream_events(
                    Command(resume=resume_value), config=graph_config, version="v2"
                ):
                    await _merged_queue.put(("graph", event))
            except Exception as e:
                await _merged_queue.put(("error", e))
            finally:
                await _merged_queue.put(("done", _SENTINEL))

        _stream_task = asyncio.create_task(_stream_to_queue())

        try:
            while True:
                # 同时等待合并队列和事件总线
                try:
                    source, payload = await asyncio.wait_for(_merged_queue.get(), timeout=0.1)
                except asyncio.TimeoutError:
                    # 超时：消费 event_bus 中的实时事件
                    while not _event_queue.empty():
                        try:
                            bus_event = _event_queue.get_nowait()
                            yield _sse_event(bus_event["type"], bus_event)
                        except asyncio.QueueEmpty:
                            break
                    continue

                # astream_events 结束
                if source == "done":
                    break

                # astream_events 异常
                if source == "error":
                    raise payload

                # 先消费 event_bus 累积事件
                while not _event_queue.empty():
                    try:
                        bus_event = _event_queue.get_nowait()
                        yield _sse_event(bus_event["type"], bus_event)
                    except asyncio.QueueEmpty:
                        break

                # 处理 astream_events 事件
                event = payload
                kind = event.get("event", "")
                data = event.get("data", {})

                # --- 节点进入/退出事件 ---
                if kind == "on_chain_start":
                    chain_name = event.get("name", "")
                    if chain_name in _GRAPH_NODES:
                        yield _sse_event("node_enter", {"node": chain_name})
                        inp = data.get("input", {})
                        if isinstance(inp, dict):
                            _cur = inp.get("current_phase")
                            _pipeline = inp.get("pipeline")
                            if _cur is not None and _pipeline and _cur != _last_phase_idx:
                                _last_phase_idx = _cur
                                _phases = _pipeline.get("phases", [])
                                _ph_name = _phases[_cur].get("name", "") if _cur < len(_phases) else ""
                                _ph_method = _phases[_cur].get("method", "") if _cur < len(_phases) else ""
                                yield _sse_event("phase_update", {
                                    "current_phase": _cur,
                                    "total_phases": len(_phases),
                                    "phase_name": _ph_name,
                                    "phase_method": _ph_method,
                                    "phase_status": inp.get("phase_status", ""),
                                })
                    continue

                if kind == "on_chain_end":
                    chain_name = event.get("name", "")
                    # 调试：记录所有 on_chain_end
                    _out = data.get("output", {})
                    _out_keys = list(_out.keys()) if isinstance(_out, dict) else type(_out).__name__
                    print(f"[API-Debug-APPROVE] on_chain_end name='{chain_name}' output={_out_keys}")
                    if chain_name in _GRAPH_NODES:
                        yield _sse_event("node_exit", {"node": chain_name})
                        # 同 /chat 端点：对 browser/advisor 等 subagent 节点
                        # 从 on_chain_end 的输出中提取最终 AIMessage 推送给前端
                        if chain_name in _SUBAGENT_NODES:
                            output = data.get("output", {})
                            msg_content = _extract_last_ai_message(output)
                            print(f"[API-Debug-APPROVE] subagent node={chain_name} msg_len={len(msg_content)}")
                            if msg_content:
                                yield _sse_event("token", {
                                    "content": sanitize_text(f"\n\n{msg_content}\n")
                                })
                    continue

                # LLM 流式 token
                if kind == "on_chat_model_stream":
                    chunk = data.get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        yield _sse_event("token", {"content": sanitize_text(chunk.content)})
                    if chunk and hasattr(chunk, "additional_kwargs"):
                        reasoning = chunk.additional_kwargs.get("reasoning_content")
                        if reasoning:
                            yield _sse_event("reasoning", {"content": sanitize_text(reasoning)})

                # 工具调用
                elif kind == "on_tool_start":
                    yield _sse_event("tool_start", {"tool_name": event.get("name", "")})
                elif kind == "on_tool_end":
                    yield _sse_event("tool_end", {
                        "tool_name": event.get("name", ""),
                        "output": str(data.get("output", ""))[:2000],
                    })

            # 流结束后检查是否有新的 interrupt
            state = await graph.aget_state(graph_config)
            if state.next:
                interrupts = []
                for task in state.tasks:
                    if hasattr(task, 'interrupts') and task.interrupts:
                        interrupts.extend(task.interrupts)
                if interrupts:
                    interrupt_data = interrupts[0].value if interrupts[0] else {}
                    yield _sse_event("approval_request", {
                        "thread_id": request.thread_id,
                        "data": interrupt_data,
                    })
                    return

            # 推送事件总线中累积的事件
            while not _event_queue.empty():
                try:
                    bus_event = _event_queue.get_nowait()
                    yield _sse_event(bus_event["type"], bus_event)
                except Exception:
                    break

            yield _sse_event("done", {"thread_id": request.thread_id})

        except Exception as e:
            error_msg = str(e)
            # 兜底：检查是否是 interrupt
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
                                "thread_id": request.thread_id,
                                "data": interrupt_data,
                            })
                            return
                except Exception:
                    pass
            yield _sse_event("error", {"message": f"恢复执行失败: {error_msg}"})
        finally:
            # 清理后台 stream task 和事件订阅
            if not _stream_task.done():
                _stream_task.cancel()
                try:
                    await _stream_task
                except (asyncio.CancelledError, Exception):
                    pass
            unsubscribe(_event_queue)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/conversations")
async def list_conversations():
    """获取所有对话列表"""
    conversations = await db.list_conversations()
    return {"conversations": conversations}


@app.delete("/conversations/{thread_id}")
async def delete_conversation(thread_id: str):
    """删除指定对话（软删除：归档 DB 记录 + 清理 LangGraph checkpoint）"""
    try:
        # 1. 软删除 DB 对话记录
        deleted = await db.delete_conversation(thread_id)
        if not deleted:
            raise HTTPException(404, f"对话 {thread_id} 不存在或已被删除")

        # 2. 清理 LangGraph checkpoint 数据
        saver = await get_saver()
        try:
            await saver.adelete_thread(thread_id)
        except Exception as e:
            # checkpoint 清理失败不影响对话归档
            print(f"[API] 清理 checkpoint 时出错: {e}（对话记录已归档）")

        return {"status": "ok", "message": f"对话 {thread_id} 已删除"}
    except HTTPException:
        raise
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


# ==================== 定时任务管理 API ====================

class ScheduleRequest(BaseModel):
    """创建定时任务请求"""
    name: str = Field(..., description="任务名称")
    query: str = Field(..., description="发送给 Agent 的消息内容")
    cron_expr: str = Field(..., description="cron 表达式，如 '0 9 * * *' 表示每天9点")
    once: bool = Field(default=False, description="是否为一次性任务（执行一次后自动停用）")


@app.post("/schedules")
async def create_schedule(request: ScheduleRequest):
    """创建定时任务"""
    task_id = await db.create_scheduled_task(
        name=request.name,
        query=request.query,
        cron_expr=request.cron_expr,
        once=request.once,
    )
    # 同步更新系统 crontab
    await _sync_crontab()
    return {"status": "ok", "task_id": task_id, "message": f"定时任务 '{request.name}' 已创建"}


@app.get("/schedules")
async def list_schedules(status: str = ""):
    """查询定时任务列表"""
    tasks = await db.list_scheduled_tasks(status=status)
    return {"schedules": tasks}


@app.get("/schedules/{task_id}")
async def get_schedule(task_id: int):
    """获取单个定时任务详情"""
    task = await db.get_scheduled_task(task_id)
    if not task:
        raise HTTPException(404, f"定时任务 {task_id} 不存在")
    return task


@app.put("/schedules/{task_id}/pause")
async def pause_schedule(task_id: int):
    """暂停定时任务"""
    ok = await db.update_scheduled_task_status(task_id, "paused")
    if not ok:
        raise HTTPException(404, f"定时任务 {task_id} 不存在")
    await _sync_crontab()
    return {"status": "ok", "message": "任务已暂停"}


@app.put("/schedules/{task_id}/resume")
async def resume_schedule(task_id: int):
    """恢复定时任务"""
    ok = await db.update_scheduled_task_status(task_id, "active")
    if not ok:
        raise HTTPException(404, f"定时任务 {task_id} 不存在")
    await _sync_crontab()
    return {"status": "ok", "message": "任务已恢复"}


@app.delete("/schedules/{task_id}")
async def delete_schedule(task_id: int):
    """删除定时任务"""
    ok = await db.delete_scheduled_task(task_id)
    if not ok:
        raise HTTPException(404, f"定时任务 {task_id} 不存在")
    await _sync_crontab()
    return {"status": "ok", "message": "任务已删除"}


def _write_schedule_log(
    task: dict,
    thread_id: str,
    start_time: datetime,
    end_time: datetime,
    run_result: str,
    final_state: Optional[dict],
    error_trace: Optional[str] = None,
) -> Optional[Path]:
    """
    将一次定时任务的执行过程写入独立日志文件（data/logs/schedules/）。
    文件名：schedule_{task_id}_{safe_name}_{YYYYMMDD_HHMMSS}.log
    内容：元信息头部 + 完整 messages 流水（Human / AI / Tool）+ 结束摘要。
    任何异常都不会中断主流程（定时任务继续记录 DB）。
    """
    try:
        # 清理任务名中不适合文件名的字符
        safe_name = re.sub(r"[^\w\u4e00-\u9fa5-]+", "_", task.get("name", "unnamed"))[:40] or "unnamed"
        ts = start_time.strftime("%Y%m%d_%H%M%S")
        log_dir = config.LOG_DIR / "schedules"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_path = log_dir / f"schedule_{task['id']}_{safe_name}_{ts}.log"

        duration = (end_time - start_time).total_seconds()

        lines = []
        lines.append("=" * 80)
        lines.append(f"定时任务执行日志")
        lines.append("=" * 80)
        lines.append(f"任务 ID     : {task['id']}")
        lines.append(f"任务名称    : {task.get('name')}")
        lines.append(f"cron 表达式 : {task.get('cron_expr')}")
        lines.append(f"一次性任务  : {bool(task.get('once'))}")
        lines.append(f"thread_id   : {thread_id}")
        lines.append(f"开始时间    : {start_time.strftime('%Y-%m-%d %H:%M:%S')}")
        lines.append(f"结束时间    : {end_time.strftime('%Y-%m-%d %H:%M:%S')}")
        lines.append(f"耗时        : {duration:.2f} 秒")
        lines.append(f"执行结果    : {run_result}")
        lines.append("")
        lines.append("—— 原始指令（query） ——")
        lines.append(task.get("query", ""))
        lines.append("")
        lines.append("=" * 80)
        lines.append("执行消息流水")
        lines.append("=" * 80)

        # 从 final_state 中提取 messages 序列
        messages = (final_state or {}).get("messages") or []
        if not messages:
            lines.append("（无消息记录，可能是任务被超时/异常中断）")
        else:
            for i, msg in enumerate(messages, 1):
                mtype = type(msg).__name__
                content = getattr(msg, "content", "") or ""
                tool_calls = getattr(msg, "tool_calls", None) or []
                name = getattr(msg, "name", None)

                lines.append(f"\n[{i}] <{mtype}>" + (f" name={name}" if name else ""))
                if content:
                    lines.append(content if isinstance(content, str) else str(content))
                # AI 消息可能包含工具调用
                for tc in tool_calls:
                    tc_name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", "?")
                    tc_args = tc.get("args") if isinstance(tc, dict) else getattr(tc, "args", {})
                    try:
                        args_str = json.dumps(tc_args, ensure_ascii=False, default=str)
                    except Exception:
                        args_str = str(tc_args)
                    lines.append(f"  → 工具调用: {tc_name}({args_str})")

        # 错误堆栈（如有）
        if error_trace:
            lines.append("")
            lines.append("=" * 80)
            lines.append("异常堆栈")
            lines.append("=" * 80)
            lines.append(error_trace)

        lines.append("")
        lines.append("=" * 80)
        lines.append(f"结束 — {run_result}")
        lines.append("=" * 80)

        log_path.write_text("\n".join(lines), encoding="utf-8")
        return log_path
    except Exception as e:
        # 日志写入失败不应影响定时任务主流程
        print(f"[Scheduler] 写入日志文件失败: {e}")
        return None


@app.post("/schedules/{task_id}/run")
async def run_scheduled_task(task_id: int):
    """
    手动或 cron 触发执行定时任务。
    内部调用 /chat（无人值守模式），执行完毕后记录结果。
    一次性任务执行后自动标记 done 并同步 crontab。
    每次执行会在 data/logs/schedules/ 下生成独立日志文件，方便复盘。
    """
    task = await db.get_scheduled_task(task_id)
    if not task:
        raise HTTPException(404, f"定时任务 {task_id} 不存在")
    if task["status"] not in ("active", "paused"):
        raise HTTPException(400, f"定时任务 {task_id} 状态为 {task['status']}，无法执行")

    graph = await get_graph()
    thread_id = str(uuid.uuid4())
    await db.create_conversation(thread_id)

    graph_config = {
        "configurable": {"thread_id": thread_id},
        "recursion_limit": config.RECURSION_LIMIT,
    }
    graph_input = {
        "messages": [HumanMessage(content=task["query"])],
        "auth_level": config.DEFAULT_AUTH_LEVEL,
        "unattended": True,
    }

    run_result = "success"
    final_state: Optional[dict] = None
    error_trace: Optional[str] = None
    start_time = datetime.now()
    try:
        # 全局超时保护：定时任务最长执行 UNATTENDED_TIMEOUT_SECONDS 秒
        # 防止 Agent 在浏览器操作或工具调用中永久卡住
        final_state = await asyncio.wait_for(
            graph.ainvoke(graph_input, config=graph_config),
            timeout=config.UNATTENDED_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        run_result = f"timeout: 超过 {config.UNATTENDED_TIMEOUT_SECONDS}s 强制终止"
        print(f"[Scheduler] 任务 {task_id} 执行超时，强制终止")
    except Exception as e:
        import traceback
        run_result = f"failed: {str(e)[:200]}"
        error_trace = traceback.format_exc()
        print(f"[Scheduler] 任务 {task_id} 执行失败: {e}")
    end_time = datetime.now()

    # 超时/异常时也尝试从 checkpointer 读取中间 state，尽量保留已产生的消息
    if final_state is None:
        try:
            snapshot = await graph.aget_state(graph_config)
            if snapshot and snapshot.values:
                final_state = snapshot.values
        except Exception as e:
            print(f"[Scheduler] 读取中间 state 失败: {e}")

    # 写入独立日志文件（复盘用）
    log_path = _write_schedule_log(
        task=task,
        thread_id=thread_id,
        start_time=start_time,
        end_time=end_time,
        run_result=run_result,
        final_state=final_state,
        error_trace=error_trace,
    )

    # 记录执行结果
    await db.update_scheduled_task_run(task_id, run_result, thread_id)

    # 一次性任务执行后自动标记 done 并同步 crontab
    if task["once"]:
        await db.update_scheduled_task_status(task_id, "done")
        await _sync_crontab()

    # 审计日志
    await db.log_audit(
        event_type="scheduled_task",
        thread_id=thread_id,
        details={
            "task_id": task_id,
            "name": task["name"],
            "once": task["once"],
            "log_file": str(log_path) if log_path else None,
        },
        result=run_result,
    )

    return {
        "status": "ok",
        "task_id": task_id,
        "thread_id": thread_id,
        "result": run_result,
        "log_file": str(log_path) if log_path else None,
    }


async def _sync_crontab():
    """
    将数据库中 active 状态的定时任务同步到系统 crontab。
    每个任务对应一行 crontab，通过 curl 调用本地 /chat API（无人值守模式）。
    """
    tasks = await db.list_scheduled_tasks(status="active")
    lines = [
        "# === OpenSys 定时任务（自动生成，勿手动修改） ===\n",
    ]
    for t in tasks:
        # 通过 /schedules/{id}/run 端点触发，内部处理无人值守模式和一次性任务标记
        line = (
            f'{t["cron_expr"]} '
            f"curl -s --max-time 900 -X POST "
            f"http://localhost:8000/schedules/{t['id']}/run "
            f">> /var/log/opensys-scheduler.log 2>&1"
            f"  # task_id={t['id']} name={t['name']}\n"
        )
        lines.append(line)

    # 写入 crontab（覆盖当前用户的全部 crontab）
    crontab_content = "".join(lines)
    proc = subprocess.run(
        ["crontab", "-"],
        input=crontab_content,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        print(f"[Scheduler] crontab 同步失败: {proc.stderr}")
    else:
        print(f"[Scheduler] crontab 同步成功，共 {len(tasks)} 个活跃任务")


# ==================== WebSocket 实时对话 ====================

@app.websocket("/ws/{thread_id}")
async def websocket_chat(websocket: WebSocket, thread_id: str):
    """
    WebSocket 实时对话端点

    消息协议（JSON）：
    客户端 → 服务端:
        {"type": "user_message", "content": "..."}
        {"type": "approval", "action": "approved/rejected/modified/revise", "modified_command": "...", "feedback": "..."}

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
                feedback = raw.get("feedback")

                # 检测 interrupt 类型，构造相应的 resume 值
                interrupt_type = None
                ws_state = await graph.aget_state(graph_config)
                for task in ws_state.tasks:
                    if hasattr(task, 'interrupts') and task.interrupts:
                        iv = task.interrupts[0].value
                        if isinstance(iv, dict):
                            interrupt_type = iv.get("type")
                        break

                if interrupt_type == "ask_user":
                    # ask_user 工具：resume 值是用户回复的纯文本
                    resume_value = feedback or action
                else:
                    # approval_request / pipeline_confirmation 等：dict 格式
                    resume_value = {"action": action}
                    if raw.get("modified_command"):
                        resume_value["modified_command"] = raw["modified_command"]
                    if feedback:
                        resume_value["feedback"] = feedback

                # 记录审批
                await db.log_audit(
                    event_type="approval",
                    thread_id=thread_id,
                    details={"type": interrupt_type, "action": action, "feedback": feedback},
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
    # LangGraph 图节点名称集合
    _WS_GRAPH_NODES = {
        "agent", "risk_assessment", "approval", "rejection", "tools",
        "advisor", "browser", "dispatcher", "executor", "reviewer", "phase_done",
    }
    _ws_last_phase_idx = -1

    try:
        async for event in graph.astream_events(
            graph_input, config=graph_config, version="v2"
        ):
            kind = event.get("event", "")
            data = event.get("data", {})

            # --- 节点进入/退出事件 ---
            if kind == "on_chain_start":
                chain_name = event.get("name", "")
                if chain_name in _WS_GRAPH_NODES:
                    await websocket.send_json({"type": "node_enter", "node": chain_name})
                    # 检查阶段变化
                    inp = data.get("input", {})
                    if isinstance(inp, dict):
                        _cur = inp.get("current_phase")
                        _pipeline = inp.get("pipeline")
                        if _cur is not None and _pipeline and _cur != _ws_last_phase_idx:
                            _ws_last_phase_idx = _cur
                            _phases = _pipeline.get("phases", [])
                            _ph_name = _phases[_cur].get("name", "") if _cur < len(_phases) else ""
                            _ph_method = _phases[_cur].get("method", "") if _cur < len(_phases) else ""
                            await websocket.send_json({
                                "type": "phase_update",
                                "current_phase": _cur,
                                "total_phases": len(_phases),
                                "phase_name": _ph_name,
                                "phase_method": _ph_method,
                                "phase_status": inp.get("phase_status", ""),
                            })
                continue

            if kind == "on_chain_end":
                chain_name = event.get("name", "")
                if chain_name in _WS_GRAPH_NODES:
                    await websocket.send_json({"type": "node_exit", "node": chain_name})
                continue

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


# ==================== 系统配置文件 API ====================

# 三个用户可编辑的系统配置文件
_SYSTEM_CONFIG_FILES = {
    "memory": {
        "filename": "memory.md",
        "label": "AI 记忆",
        "description": "AI 的长期记忆，包含用户偏好、项目上下文、重要事实。AI 会参考这里的内容来理解你的习惯。",
    },
    "user_prompt": {
        "filename": "user_prompt.md",
        "label": "行为规则",
        "description": "AI 的工作规范，定义调试流程、任务管理、验证规范等。修改这里可以改变 AI 的工作方式。",
    },
    "project": {
        "filename": "project.md",
        "label": "项目声明",
        "description": "项目背景信息，注入到 AI 的系统提示中。填写项目概述、技术栈、目录结构等，让 AI 更懂你的项目。",
    },
}


@app.get("/system-configs")
async def list_system_configs():
    """
    列出所有可编辑的系统配置文件

    返回文件名、标签、描述、是否存在等元信息，供前端展示。
    """
    from ..config import DATA_DIR
    result = []
    for key, meta in _SYSTEM_CONFIG_FILES.items():
        filepath = Path(DATA_DIR) / meta["filename"]
        result.append({
            "key": key,
            "filename": meta["filename"],
            "label": meta["label"],
            "description": meta["description"],
            "exists": filepath.is_file(),
            "char_count": filepath.stat().st_size if filepath.is_file() else 0,
        })
    return {"configs": result}


@app.get("/system-configs/{key}")
async def get_system_config(key: str):
    """
    读取指定系统配置文件内容

    供前端 Monaco 编辑器展示和编辑。
    """
    from ..config import DATA_DIR
    if key not in _SYSTEM_CONFIG_FILES:
        raise HTTPException(404, f"配置文件 '{key}' 不存在，可选项: {list(_SYSTEM_CONFIG_FILES.keys())}")
    meta = _SYSTEM_CONFIG_FILES[key]
    filepath = Path(DATA_DIR) / meta["filename"]
    if not filepath.is_file():
        return {"key": key, "filename": meta["filename"], "label": meta["label"], "content": ""}
    try:
        content = filepath.read_text(encoding="utf-8")
    except Exception as e:
        raise HTTPException(500, f"读取配置文件失败: {e}")
    return {"key": key, "filename": meta["filename"], "label": meta["label"], "content": content}


class SystemConfigUpdateRequest(BaseModel):
    """系统配置文件更新请求"""
    content: str = Field(..., description="更新后的文件完整内容")


@app.put("/system-configs/{key}")
async def update_system_config(key: str, request: SystemConfigUpdateRequest):
    """
    保存系统配置文件内容

    直接覆盖写入对应文件，前端 Monaco 编辑器保存时调用。
    """
    from ..config import DATA_DIR
    if key not in _SYSTEM_CONFIG_FILES:
        raise HTTPException(404, f"配置文件 '{key}' 不存在")
    meta = _SYSTEM_CONFIG_FILES[key]
    filepath = Path(DATA_DIR) / meta["filename"]
    try:
        filepath.write_text(request.content, encoding="utf-8")
    except Exception as e:
        raise HTTPException(500, f"保存配置文件失败: {e}")
    return {"status": "ok", "message": f"配置文件 '{meta['label']}' 已保存", "path": str(filepath)}


# ==================== 技能管理 API ====================

@app.get("/skills")
async def list_skills():
    """
    列出所有可用技能（遍历 data/skills/ 目录）

    返回每个技能的名称、路径、描述、分类等元数据，供前端展示技能标签。
    """
    from ..skill_loader import discover_skills
    all_skills = discover_skills()
    result = []
    for s in all_skills:
        meta = s["metadata"]
        result.append({
            "dir_name": s["dir_name"],
            "category": s["category"],
            "name": meta.get("name", s["dir_name"]),
            "description": meta.get("description", ""),
            "summary": meta.get("summary", ""),
            "target_role": meta.get("target_role", "agent"),
            "triggers": meta.get("triggers", []),
            "path": str(s["skill_path"]),
            "char_count": s["char_count"],
        })
    return {"skills": result}


@app.get("/skills/{name}")
async def get_skill(name: str):
    """
    获取指定技能的完整文件内容（含 front matter + 正文）

    供前端 Monaco 编辑器展示和编辑。
    """
    from ..skill_loader import discover_skills
    all_skills = discover_skills()
    for s in all_skills:
        if s["dir_name"] == name:
            try:
                content = s["skill_path"].read_text(encoding="utf-8")
            except Exception as e:
                raise HTTPException(500, f"读取技能文件失败: {e}")
            return {
                "dir_name": s["dir_name"],
                "name": s["metadata"].get("name", s["dir_name"]),
                "path": str(s["skill_path"]),
                "content": content,
            }
    raise HTTPException(404, f"技能 '{name}' 不存在")


class SkillUpdateRequest(BaseModel):
    """技能文件更新请求"""
    content: str = Field(..., description="更新后的 SKILL.md 完整内容")


@app.put("/skills/{name}")
async def update_skill(name: str, request: SkillUpdateRequest):
    """
    保存技能文件内容（小白编辑用）

    直接覆盖写入对应 SKILL.md，前端 Monaco 编辑器保存时调用。
    """
    from ..skill_loader import discover_skills
    all_skills = discover_skills()
    for s in all_skills:
        if s["dir_name"] == name:
            try:
                s["skill_path"].write_text(request.content, encoding="utf-8")
            except Exception as e:
                raise HTTPException(500, f"保存技能文件失败: {e}")
            return {"status": "ok", "message": f"技能 '{name}' 已保存", "path": str(s["skill_path"])}
    raise HTTPException(404, f"技能 '{name}' 不存在")


class SkillCreateRequest(BaseModel):
    """新建技能请求"""
    dir_name: str = Field(..., description="技能目录名（英文，如 my-new-skill）")
    category: str = Field("", description="分类目录名（可选，如 browser）。为空则创建在 skills/ 根目录下")
    content: str = Field("", description="SKILL.md 初始内容（可选，为空时生成模板）")


# 新建技能的默认模板
_SKILL_TEMPLATE = """---
name: {name}
description: 请在此填写技能描述
target_role: agent
triggers: []
---

# {name}

请在此编写技能的操作指南（SOP）。

## 操作步骤

1. 步骤一
2. 步骤二

## 注意事项

- 注意事项一

## 常见错误

| 错误现象 | 解决方法 |
|---------|---------|
| 示例错误 | 示例解决方法 |
"""


@app.post("/skills")
async def create_skill(request: SkillCreateRequest):
    """
    新建技能目录和 SKILL.md 文件

    在 data/skills/ 下创建新的技能目录，生成初始 SKILL.md 文件。
    如果指定了 category，则创建在 data/skills/{category}/{dir_name}/ 下。
    """
    import re as _re
    from .. import config as _cfg

    # 校验目录名（只允许英文、数字、连字符）
    if not _re.match(r'^[a-zA-Z0-9][a-zA-Z0-9_-]*$', request.dir_name):
        raise HTTPException(400, "技能目录名只能包含英文字母、数字、连字符和下划线，且不能以符号开头")

    # 确定目标路径
    skills_dir = _cfg.SKILLS_DIR
    if request.category:
        if not _re.match(r'^[a-zA-Z0-9][a-zA-Z0-9_-]*$', request.category):
            raise HTTPException(400, "分类目录名格式不合法")
        target_dir = skills_dir / request.category / request.dir_name
    else:
        target_dir = skills_dir / request.dir_name

    # 检查是否已存在
    if target_dir.exists():
        raise HTTPException(409, f"技能目录 '{request.dir_name}' 已存在")

    # 创建目录和文件
    try:
        target_dir.mkdir(parents=True, exist_ok=True)
        skill_file = target_dir / "SKILL.md"
        content = request.content if request.content.strip() else _SKILL_TEMPLATE.format(name=request.dir_name)
        skill_file.write_text(content, encoding="utf-8")
    except Exception as e:
        raise HTTPException(500, f"创建技能失败: {e}")

    return {
        "status": "ok",
        "message": f"技能 '{request.dir_name}' 已创建",
        "dir_name": request.dir_name,
        "category": request.category,
        "path": str(target_dir / "SKILL.md"),
    }


@app.delete("/skills/{name}")
async def delete_skill(name: str):
    """
    删除指定技能（整个目录）

    会删除技能目录及其下所有文件，操作不可逆。
    """
    import shutil
    from ..skill_loader import discover_skills

    all_skills = discover_skills()
    for s in all_skills:
        if s["dir_name"] == name:
            skill_dir = s["skill_path"].parent
            try:
                shutil.rmtree(skill_dir)
            except Exception as e:
                raise HTTPException(500, f"删除技能目录失败: {e}")
            return {"status": "ok", "message": f"技能 '{name}' 已删除", "path": str(skill_dir)}
    raise HTTPException(404, f"技能 '{name}' 不存在")


# ==================== 流程图拓扑 API ====================

@app.get("/graph/topology")
async def get_graph_topology():
    """
    返回 LangGraph 流程图的静态拓扑结构（节点 + 边）

    供前端 React Flow 画流程图。节点和边的定义与 build_graph() 保持一致。
    """
    # 11 个节点定义
    nodes = [
        {"id": "agent", "label": "Agent 主代理", "type": "core"},
        {"id": "risk_assessment", "label": "风险评估", "type": "core"},
        {"id": "approval", "label": "审批", "type": "core"},
        {"id": "rejection", "label": "拒绝", "type": "core"},
        {"id": "tools", "label": "工具执行", "type": "core"},
        {"id": "advisor", "label": "Advisor 顾问", "type": "pipeline"},
        {"id": "browser", "label": "Browser 浏览器", "type": "pipeline"},
        {"id": "dispatcher", "label": "Dispatcher 调度", "type": "pipeline"},
        {"id": "executor", "label": "Executor 执行", "type": "pipeline"},
        {"id": "reviewer", "label": "Reviewer 审查", "type": "pipeline"},
        {"id": "phase_done", "label": "Phase Done 推进", "type": "pipeline"},
    ]
    # 固定边 + 条件边
    edges = [
        # 核心循环
        {"source": "__start__", "target": "agent", "label": "入口"},
        {"source": "tools", "target": "agent", "label": "工具完成"},
        {"source": "rejection", "target": "agent", "label": "拒绝反馈"},
        # agent_router 条件边（4 分支）
        {"source": "agent", "target": "risk_assessment", "label": "有工具调用", "type": "conditional"},
        {"source": "agent", "target": "advisor", "label": "需要规划", "type": "conditional"},
        {"source": "agent", "target": "phase_done", "label": "阶段完成", "type": "conditional"},
        {"source": "agent", "target": "__end__", "label": "对话结束", "type": "conditional"},
        # risk_router 条件边
        {"source": "risk_assessment", "target": "tools", "label": "safe", "type": "conditional"},
        {"source": "risk_assessment", "target": "approval", "label": "需审批", "type": "conditional"},
        # approval_router 条件边
        {"source": "approval", "target": "tools", "label": "通过", "type": "conditional"},
        {"source": "approval", "target": "rejection", "label": "拒绝", "type": "conditional"},
        # Pipeline 固定边
        {"source": "browser", "target": "phase_done", "label": ""},
        {"source": "dispatcher", "target": "executor", "label": ""},
        {"source": "executor", "target": "phase_done", "label": ""},
        {"source": "reviewer", "target": "phase_done", "label": ""},
        # pipeline_router 条件边（6 分支）
        {"source": "advisor", "target": "agent", "label": "method=agent", "type": "conditional"},
        {"source": "advisor", "target": "browser", "label": "method=browser", "type": "conditional"},
        {"source": "advisor", "target": "dispatcher", "label": "method=executor", "type": "conditional"},
        {"source": "advisor", "target": "reviewer", "label": "需审查", "type": "conditional"},
        {"source": "advisor", "target": "advisor", "label": "replan", "type": "conditional"},
        {"source": "advisor", "target": "__end__", "label": "结束", "type": "conditional"},
        # phase_done → pipeline_router
        {"source": "phase_done", "target": "agent", "label": "method=agent", "type": "conditional"},
        {"source": "phase_done", "target": "browser", "label": "method=browser", "type": "conditional"},
        {"source": "phase_done", "target": "dispatcher", "label": "method=executor", "type": "conditional"},
        {"source": "phase_done", "target": "reviewer", "label": "需审查", "type": "conditional"},
        {"source": "phase_done", "target": "advisor", "label": "replan", "type": "conditional"},
        {"source": "phase_done", "target": "__end__", "label": "全部完成", "type": "conditional"},
    ]
    return {"nodes": nodes, "edges": edges}


# ==================== 辅助函数 ====================

def _sse_event(event_type: str, data: dict) -> str:
    """格式化 SSE 事件"""
    return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


# Subagent 节点集合：这些节点的内部 LLM 调用不会触发顶层的 on_chat_model_stream，
# 或返回的是结构化 AIMessage（非流式），因此需要在 on_chain_end 时手动提取 AIMessage 推送给前端。
_SUBAGENT_NODES = {"browser", "advisor", "dispatcher", "executor", "reviewer"}


def _extract_last_ai_message(output) -> str:
    """
    从节点输出中提取最后一条 AIMessage 的文本内容。

    LangGraph 节点返回的 output 可能是：
    - dict 形式：{"messages": [AIMessage(...)]}
    - 列表形式：[AIMessage(...)]
    - 单个 AIMessage 对象
    """
    from langchain_core.messages import AIMessage

    try:
        # 情况 1：dict（包含 messages 字段）
        if isinstance(output, dict):
            msgs = output.get("messages") or []
            if not isinstance(msgs, list):
                msgs = [msgs]
        elif isinstance(output, list):
            msgs = output
        else:
            msgs = [output]

        # 从后往前找最后一条 AIMessage
        for msg in reversed(msgs):
            if isinstance(msg, AIMessage):
                content = msg.content
                # content 可能是 str 也可能是 list（多模态）
                if isinstance(content, str) and content.strip():
                    return content
                if isinstance(content, list):
                    # 合并所有 text 片段
                    parts = [
                        item.get("text", "") if isinstance(item, dict) else str(item)
                        for item in content
                    ]
                    joined = "".join(parts).strip()
                    if joined:
                        return joined
    except Exception as e:
        print(f"[API] _extract_last_ai_message 失败: {e}")
    return ""
