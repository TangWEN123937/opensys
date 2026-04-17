"""
request_planning 工具 — Agent 触发 Advisor 规划

当 Agent 判断任务较为复杂、需要多步骤规划时，调用此工具。
工具本身不执行任何操作，只是将 advisor_context（工作交接单）写入 State，
然后 agent_router 检测到 advisor_context 有值，将流程路由到 Advisor 节点。

使用 LangGraph 的 Command(update=...) 直接更新 State 字段，
同时包含 ToolMessage（LangGraph 要求每个 tool_call 必须有对应的 ToolMessage）。
"""

from typing import Any, Annotated

from langchain_core.tools import tool
from langchain_core.tools.base import InjectedToolCallId
from langchain_core.messages import ToolMessage
from langgraph.types import Command


@tool
def request_planning(
    user_request: str,
    background: str = "",
    constraints: str = "",
    tool_call_id: Annotated[str, InjectedToolCallId] = "",
) -> Command[Any]:
    """当任务较为复杂、需要多步骤规划时，调用此工具请求 Advisor 顾问进行专业规划。

    调用时机：
    - 任务涉及多个步骤或多个文件
    - 需要分阶段完成（如先调研再执行再审查）
    - 内容创作、软件开发、数据分析等需要流程规划的场景

    不要调用的情况：
    - 简单问答或单步操作
    - 已经在执行 pipeline 中的阶段时

    Args:
        user_request: 用户的核心需求（你总结的精简版，不要照搬原文）
        background: 项目/任务背景信息（来自对话历史、project.md、memory.md 等）
        constraints: 约束条件（用逗号分隔多个约束，如"字数不超过2000,使用中文,面向技术读者"）
        tool_call_id: LangChain 自动注入的工具调用 ID（不暴露给 LLM）
    """
    # 构建 advisor_context（工作交接单）
    advisor_context = {
        "user_request": user_request,
        "background": background,
        "constraints": [c.strip() for c in constraints.split(",") if c.strip()] if constraints else [],
        "existing_progress": "",
        "replan_reason": "",
    }

    # 构建反馈摘要
    constraint_list = advisor_context["constraints"]
    summary = (
        f"📋 规划请求已提交给 Advisor 顾问\n"
        f"  需求: {user_request[:100]}{'...' if len(user_request) > 100 else ''}\n"
        f"  约束: {', '.join(constraint_list) if constraint_list else '无'}"
    )

    # 通过 Command 直接更新 State，触发 agent_router → advisor 分支
    # 必须包含 ToolMessage，否则 LangGraph 会报错（每个 tool_call 必须有对应 ToolMessage）
    # 重置 advisor_called=False：同一 thread 中上一个 pipeline 完成后 advisor_called 仍为 True，
    # 如果不重置，agent_router 检查 `not advisor_called` 会拦住新的规划请求，导致无法进入 Advisor。
    # 同时清理已完成 pipeline 的残留状态，确保新任务从干净状态开始。
    # 注意：只清理 advisor_called，pipeline 残留由 Advisor 节点在创建新 pipeline 时覆盖。
    return Command(update={
        "advisor_context": advisor_context,
        "advisor_called": False,
        "messages": [ToolMessage(content=summary, tool_call_id=tool_call_id)],
    })
