"""
OpenSys LangGraph 核心图

定义 AI Agent 的执行流程图：
    用户输入 → LLM 推理 → 风险评估 → [审批] → 工具执行 → LLM 继续/结束

核心节点：
    - agent_node: 调用 LLM 生成回复或工具调用
    - risk_assessment: 评估工具调用的风险等级
    - approval_node: 暂停等待用户审批（使用 interrupt）
    - tool_node: 执行已批准的工具调用

条件路由：
    - agent_router: LLM 输出后判断是结束还是需要调用工具
    - risk_router: 根据风险等级决定直接执行还是走审批
    - approval_router: 审批通过/拒绝/修改后的路由
"""

from typing import Literal

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage, RemoveMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode
from langgraph.types import interrupt, Command

from .state import AgentState
from .tools import all_tools
from .security import assess_risk, format_approval_request
from .context_compression import compress_context, summarize_old_messages
from .vector_store import VectorStoreManager, slice_conversation_turns
from .model_manager import get_llm, get_base_llm, clean_messages, apply_claude_message_cache
from .utils import sanitize_text
from . import config


# ==================== 系统提示词 ====================

SYSTEM_PROMPT = """你是 OpenSys AI Agent，一个运行在隔离 Docker 容器内的智能助手。

## 你的能力
你可以通过工具在容器内执行任何操作：
- `run_terminal`: 执行终端命令（ls、grep、apt、pip、git 等任何命令）
- `write_and_run_script`: 编写并执行脚本（Python、Bash、Node.js）
- `ask_user`: 当你需要用户提供信息或帮助时，暂停并提问
- `write_todos`: 创建和管理任务清单（复杂任务时使用）
- `search_scripts`: 搜索脚本知识库，查找已有的相似脚本（编写脚本前先搜索，避免重复编写）

## 工作原则
1. **先了解再操作**：执行前先查看环境信息（ls、cat、pwd 等）
2. **渐进式执行**：复杂任务拆分为小步骤，逐步完成
3. **错误恢复**：命令失败时先分析错误输出，尝试修复；多次失败后请求用户帮助
4. **安全意识**：危险操作前说明风险和影响，等待审批后再执行
5. **清晰汇报**：每步操作说明目的，完成后汇报结果

## 注意事项
- 你运行在容器内，有独立的文件系统和网络（通过代理访问外网）
- 所有操作都会被审计日志记录
- 部分操作需要用户审批才能执行（系统会自动判断）
- 使用中文与用户交流

## 记忆管理（update_memory 工具）
你有一个跨对话持久化的记忆文档。在对话中发现以下类型的重要信息时，使用 update_memory 工具记录：
- 用户明确表达的偏好或习惯（如编码风格、工具偏好）
- 项目相关的重要技术决策或架构变更
- 需要跨对话记住的关键事实（如用户名、常用路径）

**⚠️ 先读后写规则（必须遵守）：**
1. 修改记忆前**必须**先调用 `update_memory(action='read')` 查看现有内容
2. 确认现有内容后，再决定用 `action='append'`（追加）还是 `action='rewrite'`（重写章节）
3. 优先使用 `append` 追加，只在需要精简或修正时才用 `rewrite`
4. **绝不要跳过读取步骤直接写入**，否则会被安全拦截

**注意：不要频繁调用此工具，只在确实发现值得长期记住的信息时才使用。**
如果记忆文档接近上限，先 read 查看，再用 rewrite 精简旧内容。
"""


# ==================== 模型获取 ====================

def _get_model_name_from_state(state: AgentState) -> str:
    """从 state.model_config 中获取 model_name，未设置则用默认值"""
    mc = state.get("model_config") or {}
    return mc.get("model_name") or config.DEFAULT_MODEL_NAME


# ==================== 图节点定义 ====================

def _load_memory() -> str:
    """加载 memory.md 记忆文档内容（如果存在）"""
    if config.MEMORY_FILE.exists():
        try:
            content = config.MEMORY_FILE.read_text(encoding="utf-8").strip()
            if content:
                char_count = len(content)
                limit_info = f"（当前 {char_count}/{config.MEMORY_MAX_CHARS} 字符）"
                return f"\n\n## 📝 用户记忆 {limit_info}\n{content}"
        except Exception:
            pass
    return ""


def _load_user_prompt() -> str:
    """加载 user_prompt.md 用户自定义提示词（如果存在）\n\n    此文件由用户维护，AI 不可修改。内容追加到 system prompt 末尾。"""
    if config.USER_PROMPT_FILE.exists():
        try:
            content = config.USER_PROMPT_FILE.read_text(encoding="utf-8").strip()
            if content:
                return f"\n\n{content}"
        except Exception:
            pass
    return ""


def _build_system_prompt(state: AgentState) -> str:
    """构建系统提示词，动态注入记忆文档和当前 todos 状态（纯同步，保证 prompt 稳定以利用厂商 token 缓存）"""
    prompt = SYSTEM_PROMPT

    # 注入用户自定义提示词（任务分解、调试铁律、验证规范等）
    prompt += _load_user_prompt()

    # 注入 memory.md 记忆文档
    prompt += _load_memory()

    # 如果有任务清单，追加到 system prompt 末尾
    todos = state.get("todos")
    if todos:
        todo_lines = ["\n\n## 📋 当前任务清单"]
        status_emoji = {"pending": "⏳", "in_progress": "🔄", "completed": "✅"}
        priority_emoji = {"high": "🔴", "medium": "🟡", "low": "⚪"}
        for t in todos:
            s = status_emoji.get(t.get("status", "pending"), "❓")
            p = priority_emoji.get(t.get("priority", "medium"), "")
            content = t.get("content", "")
            todo_lines.append(f"- {s} {p} [{t.get('id', '?')}] {content}")

        # 统计
        total = len(todos)
        completed = sum(1 for t in todos if t.get("status") == "completed")
        in_progress = sum(1 for t in todos if t.get("status") == "in_progress")
        todo_lines.append(f"\n进度：{completed}/{total} 完成，{in_progress} 进行中")
        todo_lines.append("请继续执行当前 in_progress 的任务，完成后用 write_todos 标记为 completed。")

        prompt += "\n".join(todo_lines)

    return prompt


# ==================== 向量化检索与入库 ====================

async def _retrieve_conversation_memory(query: str, thread_id: str) -> str:
    """
    检索本线程的历史对话记忆，格式化为可注入消息列表的文本

    仅在超阈值入库时调用（不在每次 LLM 调用时执行），避免 system prompt 不稳定。
    检索范围限制为当前 thread_id，不跨线程共享。

    Args:
        query: 用户最近输入（作为检索 query）
        thread_id: 当前对话线程 ID（限制检索范围）

    Returns:
        格式化的历史记忆文本，空字符串表示无结果或失败
    """
    if not query or not thread_id:
        return ""

    try:
        vs = VectorStoreManager()
        try:
            results = await vs.search_conversations(
                query=query,
                thread_id=thread_id,  # 只检索本线程
            )
        finally:
            await vs.close()
    except Exception as e:
        print(f"[向量检索] 对话记忆检索失败: {e}")
        return ""

    if not results:
        return ""

    # 格式化检索结果（用于包装为 HumanMessage）
    lines = []
    for item in results:
        doc = item.get("document", "")
        distance = item.get("distance", 0)
        similarity = 1 - distance
        # 只保留相似度 > 0.3 的结果（过滤噪音）
        if similarity < 0.3:
            continue
        if len(doc) > 500:
            doc = doc[:500] + "..."
        lines.append(f"- {doc}")

    if not lines:
        return ""

    return "\n".join(lines)


def _extract_latest_user_query(messages: list) -> str:
    """
    从消息列表中提取最新的用户输入（用于向量检索 query）

    Args:
        messages: 消息列表

    Returns:
        最新用户输入文本，未找到返回空字符串
    """
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            content = msg.content
            if isinstance(content, str):
                # 跳过系统通知
                if content.startswith("[系统通知]") or content.startswith("[以下是之前对话的摘要]"):
                    continue
                return content
            elif isinstance(content, list):
                # 多模态消息：提取文本部分
                for item in content:
                    if isinstance(item, dict) and item.get("type") == "text":
                        text = item.get("text", "")
                        if text and not text.startswith("[系统通知]"):
                            return text
    return ""


async def vectorize_old_messages(
    messages: list,
    thread_id: str = "",
    trigger_messages: int = None,
    trigger_tokens: int = None,
    keep_messages: int = None,
) -> dict | None:
    """
    当消息数/token 超阈值时，将旧对话切片入向量库，然后从 checkpoint 中删除

    替代原来的 summarize_old_messages（不再调用 LLM 做摘要，零额外 Token）

    流程：
    1. 检查是否需要触发（消息数或 token 超阈值）
    2. 将旧消息按完整交互轮次切片
    3. 批量入库到 ChromaDB conversation_memory 集合
    4. 返回 RemoveMessage 列表，让 checkpoint 删除旧消息

    Args:
        messages: 当前消息列表（不含 SystemMessage）
        thread_id: 对话线程 ID
        trigger_messages: 触发入库的消息数阈值
        trigger_tokens: 触发入库的 token 阈值
        keep_messages: 入库后保留的最近消息数

    Returns:
        state update dict（包含 RemoveMessage），或 None（不需要入库）
    """
    trigger_messages = trigger_messages or config.VECTOR_TRIGGER_MESSAGES
    trigger_tokens = trigger_tokens or config.VECTOR_TRIGGER_TOKENS
    keep_messages = keep_messages or config.VECTOR_KEEP_MESSAGES

    # 过滤掉 SystemMessage
    non_system = [m for m in messages if not isinstance(m, SystemMessage)]

    # 检查是否需要触发
    msg_count = len(non_system)
    if msg_count <= trigger_messages:
        total_chars = sum(_estimate_chars(m) for m in non_system)
        estimated_tokens = total_chars // 3
        if estimated_tokens <= trigger_tokens:
            return None

    # 找到安全分割点（不打断 AI + ToolMessage 配对）
    split_idx = _find_safe_split(non_system, keep_messages)
    if split_idx <= 0:
        return None

    old_messages = non_system[:split_idx]
    print(f"[向量化入库] 触发：总 {msg_count} 条消息，入库前 {split_idx} 条")

    # 将旧消息按轮次切片
    turns = slice_conversation_turns(old_messages)

    if turns:
        # 批量入库到向量库
        try:
            vs = VectorStoreManager()
            try:
                stored = await vs.store_conversation_turns(
                    thread_id=thread_id,
                    turns=turns,
                )
                print(f"[向量化入库] 成功入库 {stored} 个对话轮次")
            finally:
                await vs.close()
        except Exception as e:
            print(f"[向量化入库] 入库失败: {e}")
            # 入库失败时回退到摘要压缩（不丢失数据）
            return None

    # 构建 RemoveMessage 删除旧消息（让 checkpoint 瘦身）
    remove_msgs = [
        RemoveMessage(id=m.id)
        for m in old_messages
        if hasattr(m, "id") and m.id
    ]

    print(f"[向量化入库] 从 checkpoint 移除 {len(remove_msgs)} 条旧消息")

    # 检索本线程历史记忆，包装为 HumanMessage 注入（类似原摘要逻辑）
    user_query = _extract_latest_user_query(messages)
    memory_text = await _retrieve_conversation_memory(user_query, thread_id)
    if memory_text:
        memory_msg = HumanMessage(
            content=f"[以下是从本对话历史中检索到的相关记忆]\n{memory_text}\n[记忆结束，以下是最近的对话]"
        )
        remove_msgs.append(memory_msg)
        print(f"[向量化入库] 已注入历史记忆摘要（{len(memory_text)} 字符）")

    return {"messages": remove_msgs}


def _estimate_chars(msg) -> int:
    """估算消息字符数（简化版）"""
    content = getattr(msg, "content", "")
    if isinstance(content, str):
        return len(content)
    elif isinstance(content, list):
        return sum(
            len(item.get("text", "")) if isinstance(item, dict) else len(str(item))
            for item in content
        )
    return 0


def _find_safe_split(messages: list, keep: int) -> int:
    """找到安全分割点，不打断 AI + ToolMessage 配对"""
    target = len(messages) - keep
    if target <= 0:
        return 0

    idx = target
    while idx > 0:
        msg = messages[idx]
        if isinstance(msg, ToolMessage):
            idx -= 1
            continue
        if isinstance(msg, AIMessage) and getattr(msg, "tool_calls", None):
            idx -= 1
            continue
        break

    return max(idx, 0)


async def agent_node(state: AgentState, run_config: RunnableConfig) -> dict:
    """
    Agent 节点：调用 LLM 生成回复或工具调用

    执行流程：
    1. 图片渐进压缩（同步，原地修改消息内容）
    2. 消息清理（修复不完整工具调用序列 + 视觉/非视觉 content 格式转换）
    3. 向量化入库（超阈值时将旧对话存入 ChromaDB + 检索本线程记忆注入 HumanMessage，零 Token 消耗）
       - 若向量化失败，回退到 LLM 摘要压缩（兜底）
    4. 构建动态 system prompt（注入 todos 状态，不含向量检索，保证 prompt 稳定以利用厂商缓存）
    5. Claude 多轮对话增量缓存（原地修改 HumanMessage 添加 cache_control）
    6. 调用 LLM 生成回复
    """
    model_name = _get_model_name_from_state(state)
    llm = get_llm(model_name)
    messages = list(state["messages"])

    # --- 第一步：图片渐进压缩（每次 LLM 调用前执行） ---
    compress_context(messages)

    # --- 第二步：消息清理（修复不完整工具调用序列 + content 格式转换） ---
    messages = clean_messages(messages, model_name)

    # --- 第三步：向量化入库（优先）或摘要压缩（兜底） ---
    # 从 LangGraph RunnableConfig 中获取 thread_id（用于向量入库标记 + 本线程检索）
    thread_id = (run_config.get("configurable") or {}).get("thread_id", "")

    # 优先尝试向量化入库（零 LLM Token 消耗）
    vector_update = await vectorize_old_messages(messages, thread_id=thread_id)

    if vector_update:
        # 向量化成功：从消息中移除旧消息，然后继续 LLM 调用
        remove_ids = {
            m.id for m in vector_update["messages"]
            if hasattr(m, "id") and isinstance(m, RemoveMessage)
        }
        # 构建移除旧消息后的消息列表（含注入的记忆 HumanMessage）
        remaining_msgs = [m for m in messages if not (hasattr(m, "id") and m.id in remove_ids)]
        # 将 vector_update 中非 RemoveMessage 的消息（记忆 HumanMessage）插到前面
        memory_msgs = [m for m in vector_update["messages"] if not isinstance(m, RemoveMessage)]
        remaining_msgs = memory_msgs + remaining_msgs

        # 构建 system prompt + 剩余消息，调用 LLM
        system_prompt = _build_system_prompt(state)
        llm_messages = [SystemMessage(content=system_prompt)]
        for m in remaining_msgs:
            if not isinstance(m, SystemMessage):
                if hasattr(m, "content") and isinstance(m.content, str):
                    m.content = sanitize_text(m.content)
                llm_messages.append(m)

        apply_claude_message_cache(model_name, llm_messages)
        response = await llm.ainvoke(llm_messages)
        if hasattr(response, "content") and isinstance(response.content, str):
            response.content = sanitize_text(response.content)

        # 返回：RemoveMessage（checkpoint 瘦身）+ 记忆 HumanMessage + AI 回复
        vector_update["messages"].append(response)
        return vector_update

    # 向量化未触发或失败 → 回退到 LLM 摘要压缩（兜底）
    base_llm = get_base_llm(model_name)
    summary_update = await summarize_old_messages(messages, base_llm)
    if summary_update:
        remove_ids = {m.id for m in summary_update["messages"] if hasattr(m, 'id') and isinstance(m, RemoveMessage)}
        compressed_msgs = [m for m in messages if not (hasattr(m, 'id') and m.id in remove_ids)]
        summary_msgs = [m for m in summary_update["messages"] if not isinstance(m, RemoveMessage)]
        compressed_msgs = summary_msgs + compressed_msgs

        system_prompt = _build_system_prompt(state)
        llm_messages = [SystemMessage(content=system_prompt)]
        for m in compressed_msgs:
            if not isinstance(m, SystemMessage):
                if hasattr(m, "content") and isinstance(m.content, str):
                    m.content = sanitize_text(m.content)
                llm_messages.append(m)

        apply_claude_message_cache(model_name, llm_messages)
        response = await llm.ainvoke(llm_messages)
        if hasattr(response, "content") and isinstance(response.content, str):
            response.content = sanitize_text(response.content)

        summary_update["messages"].append(response)
        return summary_update

    # --- 第四步：构建消息列表（动态 system prompt + 历史消息） ---
    system_prompt = _build_system_prompt(state)
    new_messages = [SystemMessage(content=system_prompt)]
    for m in messages:
        if not isinstance(m, SystemMessage):
            # 清理所有消息 content 中的 surrogate 字符（防止 LLM 引用后导致序列化失败）
            if hasattr(m, "content") and isinstance(m.content, str):
                m.content = sanitize_text(m.content)
            new_messages.append(m)

    # --- 第五步：Claude 多轮对话增量缓存（原地修改消息） ---
    apply_claude_message_cache(model_name, new_messages)

    # --- 第六步：调用 LLM ---
    response = await llm.ainvoke(new_messages)

    # --- 清理响应中的无效 surrogate 字符（防止下游序列化报错） ---
    if hasattr(response, "content") and isinstance(response.content, str):
        response.content = sanitize_text(response.content)

    return {"messages": [response]}


def risk_assessment_node(state: AgentState) -> dict:
    """
    风险评估节点：检查 LLM 的工具调用，评估风险等级

    读取最后一条 AI 消息的 tool_calls，
    根据命令内容和当前授权等级判定风险。
    """
    last_message = state["messages"][-1]
    tool_calls = getattr(last_message, "tool_calls", [])
    auth_level = state.get("auth_level", config.DEFAULT_AUTH_LEVEL)

    risk = assess_risk(tool_calls, auth_level)

    # 生成待审批命令描述（用于审批节点展示）
    pending = ""
    if risk != "safe" and tool_calls:
        pending = format_approval_request(tool_calls, risk)

    return {
        "risk_level": risk,
        "pending_command": pending,
        "approval_result": None,  # 重置审批结果
        "modified_command": None,
    }


def approval_node(state: AgentState) -> dict:
    """
    审批节点：暂停执行，等待用户审批

    使用 LangGraph interrupt() 暂停图执行。
    用户通过 WebSocket/CLI 回复审批结果后继续。
    """
    pending = state.get("pending_command", "")
    risk_level = state.get("risk_level", "moderate")

    # 使用 interrupt 暂停，等待用户回复
    user_response = interrupt({
        "type": "approval_request",
        "risk_level": risk_level,
        "description": pending,
        "options": ["approved", "rejected", "modified"],
    })

    # 解析用户回复
    if isinstance(user_response, dict):
        result = user_response.get("action", "rejected")
        modified = user_response.get("modified_command", None)
    elif isinstance(user_response, str):
        # 简单字符串回复：approved / rejected
        result = user_response.strip().lower()
        if result not in ("approved", "rejected", "modified"):
            result = "approved" if result in ("y", "yes", "是", "批准", "确认", "ok") else "rejected"
        modified = None
    else:
        result = "rejected"
        modified = None

    return {
        "approval_result": result,
        "modified_command": modified,
    }


def rejection_node(state: AgentState) -> dict:
    """
    拒绝节点：用户拒绝操作，通知 AI

    向消息历史追加一条系统消息，告知 AI 操作被拒绝，
    让 AI 继续对话（可能换个方式或询问用户）。
    """
    pending = state.get("pending_command", "")
    # 告知 AI 操作被拒绝
    rejection_msg = HumanMessage(
        content=f"[系统通知] 用户拒绝了以下操作，请换一种方式或询问用户：\n{pending}"
    )
    return {
        "messages": [rejection_msg],
        "pending_command": None,
        "risk_level": None,
        "approval_result": None,
    }


# ==================== 条件路由函数 ====================

def agent_router(state: AgentState) -> Literal["risk_assessment", "__end__"]:
    """
    Agent 节点后的路由：

    - 如果 LLM 返回 tool_calls → 去风险评估
    - 如果 LLM 只返回文本 → 结束（回复用户）
    """
    last_message = state["messages"][-1]
    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        return "risk_assessment"
    return "__end__"


def risk_router(state: AgentState) -> Literal["tools", "approval"]:
    """
    风险评估后的路由：

    - safe → 直接执行工具
    - moderate / dangerous → 走审批流程
    """
    risk = state.get("risk_level", "moderate")
    if risk == "safe":
        return "tools"
    return "approval"


def approval_router(state: AgentState) -> Literal["tools", "rejection", "agent"]:
    """
    审批节点后的路由：

    - approved → 执行工具
    - modified → 执行工具（用修改后的命令）  # TODO: Phase 2 实现命令替换
    - rejected → 通知 AI 被拒绝
    """
    result = state.get("approval_result", "rejected")
    if result in ("approved", "modified"):
        return "tools"
    return "rejection"


# ==================== 构建图 ====================

def build_graph() -> StateGraph:
    """
    构建 OpenSys Agent 的 LangGraph StateGraph

    流程图：
        START → agent → [有tool_calls?]
                            ├─ 否 → END（文本回复）
                            └─ 是 → risk_assessment → [风险等级?]
                                                        ├─ safe → tools → agent（继续循环）
                                                        └─ moderate/dangerous → approval → [审批结果?]
                                                                                            ├─ approved → tools → agent
                                                                                            ├─ modified → tools → agent
                                                                                            └─ rejected → rejection → agent
    """
    # 创建工具执行节点（包装 ToolNode，对所有工具输出做 surrogate 清理）
    _raw_tool_node = ToolNode(all_tools)

    async def safe_tool_node(state: AgentState) -> dict:
        """工具执行包装器：执行后清理所有 ToolMessage 中的 surrogate 字符"""
        result = await _raw_tool_node.ainvoke(state)
        # result 通常是 {"messages": [ToolMessage, ...]}
        if isinstance(result, dict):
            for msg in result.get("messages", []):
                if isinstance(msg, ToolMessage) and isinstance(msg.content, str):
                    msg.content = sanitize_text(msg.content)
        return result

    tool_node = safe_tool_node

    # 构建 StateGraph
    graph = StateGraph(AgentState)

    # --- 添加节点 ---
    graph.add_node("agent", agent_node)
    graph.add_node("risk_assessment", risk_assessment_node)
    graph.add_node("approval", approval_node)
    graph.add_node("rejection", rejection_node)
    graph.add_node("tools", tool_node)

    # --- 添加边 ---

    # 入口：START → agent
    graph.add_edge(START, "agent")

    # agent 之后：条件路由（有 tool_calls → 风险评估，无 → 结束）
    graph.add_conditional_edges("agent", agent_router)

    # 风险评估之后：条件路由（safe → 工具执行，其他 → 审批）
    graph.add_conditional_edges("risk_assessment", risk_router)

    # 审批之后：条件路由（approved → 执行，rejected → 通知 AI）
    graph.add_conditional_edges("approval", approval_router)

    # 工具执行完成后 → 回到 agent（继续对话/执行下一步）
    graph.add_edge("tools", "agent")

    # 拒绝后 → 回到 agent（让 AI 重新考虑）
    graph.add_edge("rejection", "agent")

    return graph


def compile_graph(checkpointer=None):
    """
    编译图，返回可执行的 CompiledGraph

    Args:
        checkpointer: 检查点持久化器（AsyncSqliteSaver），用于对话记忆

    Returns:
        编译后的可执行图
    """
    graph = build_graph()
    return graph.compile(checkpointer=checkpointer)
