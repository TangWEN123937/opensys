"""
OpenSys Pre/Post Tool Hook 机制

在工具执行前后注入检查逻辑，将 prompt 中的"口头规则"变为代码层面的"自动锁"。
在 graph.py 的 safe_tool_node 中调用，不改变图结构。

Hook 类型：
  PreToolUse — 工具执行前检查，可拦截（返回 ToolMessage 替代执行）
  PostToolUse — 工具执行后处理（surrogate 清理、审计增强等）

与 security.py 的关系：
  security.py → 在 risk_assessment_node 中判断是否需要审批（执行前的"门卫"）
  hooks.py    → 在 safe_tool_node 中做精细检查（通过审批后、执行前的"最后一关"）
"""

from langchain_core.messages import AIMessage, ToolMessage

from .permissions import (
    check_path_permission,
    check_command_permission,
    extract_paths_from_command,
)
from .utils import sanitize_text


# ==================== PreToolUse Hooks ====================

async def run_pre_hooks(state: dict) -> list[ToolMessage]:
    """
    工具执行前的检查 Hook 链

    检查最后一条 AIMessage 的所有 tool_calls，逐个过权限检查。
    被拦截的工具调用会生成一条 ToolMessage（content = 拦截原因），
    替代实际执行，让 Agent 知道操作被系统拒绝。

    Args:
        state: 当前 AgentState

    Returns:
        被拦截的 ToolMessage 列表（空列表 = 全部放行）
    """
    messages = state.get("messages", [])
    if not messages:
        return []

    last_message = messages[-1]
    if not isinstance(last_message, AIMessage):
        return []

    tool_calls = getattr(last_message, "tool_calls", [])
    if not tool_calls:
        return []

    blocked_messages = []

    for tc in tool_calls:
        tool_name = tc.get("name", "")
        args = tc.get("args", {})
        tool_call_id = tc.get("id", "")

        # 对每个 tool_call 执行权限检查
        block_reason = _check_tool_call(tool_name, args)

        if block_reason:
            # 拦截：生成替代 ToolMessage
            blocked_messages.append(ToolMessage(
                content=f"[系统拦截] {block_reason}\n此操作被权限规则禁止，请换一种方式。",
                tool_call_id=tool_call_id,
            ))
            print(f"[Hook] PreToolUse 拦截: {tool_name} — {block_reason}")

    return blocked_messages


def _check_tool_call(tool_name: str, args: dict) -> str | None:
    """
    检查单个工具调用是否被权限规则拦截

    Args:
        tool_name: 工具名称
        args: 工具参数

    Returns:
        None — 放行
        str — 拦截原因
    """
    if tool_name == "run_terminal":
        command = args.get("command", "")
        if not command:
            return None

        # 检查命令级权限（permissions.yaml command_deny）
        deny_reason = check_command_permission(command)
        if deny_reason:
            return deny_reason

        # 提取命令中的目标路径，检查路径级权限
        target_paths = extract_paths_from_command(command)
        for path in target_paths:
            path_reason = check_path_permission(path)
            if path_reason:
                return path_reason

    elif tool_name == "write_and_run_script":
        # 检查脚本内容中是否有写入被禁路径的操作
        script_content = args.get("script_content", "")
        if script_content:
            # 从脚本内容中提取可能的路径操作
            target_paths = extract_paths_from_command(script_content)
            for path in target_paths:
                path_reason = check_path_permission(path)
                if path_reason:
                    return path_reason

    # ask_user / write_todos / update_memory 不做权限检查
    return None


# ==================== PostToolUse Hooks ====================

async def run_post_hooks(state: dict, result: dict) -> dict:
    """
    工具执行后的处理 Hook 链

    实现：
    1. surrogate 字符清理（从原 safe_tool_node 迁移过来）
    2. 连续相同工具调用检测（死循环兜底）

    Args:
        state: 当前 AgentState
        result: ToolNode 执行结果（{"messages": [ToolMessage, ...]}）

    Returns:
        处理后的 result（可能新增警告/中断消息和 _recent_tool_calls 更新）
    """
    if not isinstance(result, dict):
        return result

    # === 1. surrogate 字符清理 ===
    for msg in result.get("messages", []):
        if isinstance(msg, ToolMessage) and isinstance(msg.content, str):
            msg.content = sanitize_text(msg.content)

    # === 2. 连续相同工具调用检测 ===
    loop_update = _detect_tool_loop(state)
    if loop_update:
        # 合并 _recent_tool_calls 更新到 result
        if "_recent_tool_calls" in loop_update:
            result["_recent_tool_calls"] = loop_update["_recent_tool_calls"]
        # 如果有警告/中断消息，追加到 messages
        if "messages" in loop_update:
            result.setdefault("messages", []).extend(loop_update["messages"])

    return result


def _detect_tool_loop(state: dict) -> dict | None:
    """
    检测连续相同工具调用（Agent ↔ tools 死循环兜底）

    规则：
    - 连续 3 次调用同一工具 → 注入警告消息
    - 连续 5 次调用同一工具 → 注入强制中断请求消息

    Args:
        state: 当前 AgentState

    Returns:
        更新字典（含 _recent_tool_calls 和可能的警告消息），无变化返回 None
    """
    messages = state.get("messages", [])
    if not messages:
        return None

    last_message = messages[-1]
    if not isinstance(last_message, AIMessage):
        return None

    tool_calls = getattr(last_message, "tool_calls", [])
    if not tool_calls:
        return None

    # 提取当前调用的工具名+参数摘要（区分"相同工具不同参数"和"完全相同的重复调用"）
    tc = tool_calls[0]
    current_tool = tc.get("name", "")
    if not current_tool:
        return None

    # 用工具名+参数的排序 key=value 拼接作为指纹（截断防止过长）
    args = tc.get("args", {})
    args_fingerprint = ",".join(f"{k}={str(v)[:60]}" for k, v in sorted(args.items()))
    call_signature = f"{current_tool}({args_fingerprint[:200]})"

    # 获取最近工具调用记录
    recent = list(state.get("_recent_tool_calls", []) or [])
    recent.append(call_signature)
    # 只保留最近 5 条
    if len(recent) > 5:
        recent = recent[-5:]

    update = {"_recent_tool_calls": recent}

    # 检测连续完全相同的调用（工具名+参数都一样才算循环）
    is_unattended = state.get("unattended", False)
    if len(recent) >= 5 and len(set(recent[-5:])) == 1:
        # 连续 5 次完全相同调用 → 强制中断请求
        from langchain_core.messages import HumanMessage
        if is_unattended:
            # 无人值守模式：强制结束当前阶段，不能只发警告（Agent 会忽略）
            print(f"[Hook] 工具循环检测(无人值守): {current_tool} 连续 5 次，强制结束当前阶段")
            update["messages"] = [HumanMessage(
                content=(
                    f"[系统强制终止] 🛑 连续 5 次以相同参数调用 {current_tool}，"
                    "检测到死循环。无人值守模式下强制结束当前阶段。"
                    "请立即停止当前操作，输出已有结果，不要再调用任何工具。"
                )
            )]
            # 标记阶段为需要审查（让 phase_done 跳过或终止）
            update["review_result"] = "fail"
            update["review_feedback"] = f"工具死循环：{current_tool} 连续 5 次完全相同调用"
        else:
            update["messages"] = [HumanMessage(
                content=(
                    f"[系统通知] ⚠️ 你已连续 5 次以相同参数调用 {current_tool}，"
                    "检测到可能的死循环。请使用 ask_user 请求用户介入，"
                    "或换一种方式处理。"
                )
            )]
        print(f"[Hook] 工具循环检测: {current_tool} 连续 5 次相同调用，强制中断")
    elif len(recent) >= 3 and len(set(recent[-3:])) == 1:
        # 连续 3 次完全相同调用 → 注入警告
        from langchain_core.messages import HumanMessage
        update["messages"] = [HumanMessage(
            content=(
                f"[系统警告] 你已连续 3 次以相同参数调用 {current_tool}，"
                "请检查是否陷入循环。如果参数不同则属于正常多步操作，可忽略此警告。"
            )
        )]
        print(f"[Hook] 工具循环检测: {current_tool} 连续 3 次相同调用，发出警告")

    return update
