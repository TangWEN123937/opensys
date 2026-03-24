"""
write_todos Tool — 任务计划管理

当 AI Agent 遇到复杂任务（>=3 步）时，使用此工具创建和管理任务清单。
任务清单存储在 LangGraph State 的 todos 字段中，跨轮次持久化。

设计参考：AI_JOIN 项目的 DynamicModelMiddleware 中的 write_todos 实现，
但适配了 OpenSys 的 LangGraph StateGraph 架构（通过 Command(update=...) 更新 state）。
"""

from typing import Any, Annotated, Literal

from langchain_core.tools import tool
from langchain_core.tools.base import InjectedToolCallId
from langchain_core.messages import ToolMessage
from langgraph.types import Command
from pydantic import BaseModel, Field


class Todo(BaseModel):
    """单个任务项"""
    id: str = Field(description="任务唯一标识（如 '1', '2', '3'）")
    content: str = Field(description="任务描述，应包含涉及的文件路径和验证方式")
    status: Literal["pending", "in_progress", "completed"] = Field(
        description="任务状态：pending=待执行, in_progress=执行中, completed=已完成"
    )
    priority: Literal["high", "medium", "low"] = Field(
        default="medium",
        description="优先级：high=高, medium=中, low=低"
    )


# write_todos 工具描述（注入到 LLM 的工具定义中）
WRITE_TODOS_TOOL_DESCRIPTION = """
使用此工具创建和管理当前工作会话的任务清单。仅在复杂多步骤任务（>=3步）时使用，简单任务请直接完成。

使用规则：
- 开始任务时标记为 in_progress，完成后立即标记为 completed
- 可随时添加新任务或删除不再需要的任务
- 创建清单时应将第一个任务设为 in_progress
- 遇到阻碍时保持 in_progress 并创建新任务描述问题
- 只有真正完成的任务才能标记为 completed
- 每个任务的 content 中应包含涉及的文件路径和验证方式
- 标记 completed 时，必须在 content 末尾附加验证结果，例如：
  "✅ 实现 get_file_tree 工具 [tools/context_tools.py] | 验证：调用成功，返回 15 个文件"
"""


@tool(description=WRITE_TODOS_TOOL_DESCRIPTION)
def write_todos(
    todos: list[Todo],
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command[Any]:
    """创建和管理当前工作会话的任务清单。

    Args:
        todos: 完整的任务列表（每次调用传入全量列表，覆盖旧的）
        tool_call_id: LangChain 自动注入的工具调用 ID（不暴露给 LLM）

    Returns:
        Command 更新 state 中的 todos 字段，并包含 ToolMessage
    """
    # 序列化 todos 为 dict 列表存入 state
    todos_data = [t.model_dump() for t in todos]

    # 构建状态摘要（用于 ToolMessage 反馈）
    total = len(todos_data)
    completed = sum(1 for t in todos_data if t["status"] == "completed")
    in_progress = sum(1 for t in todos_data if t["status"] == "in_progress")
    pending = total - completed - in_progress

    summary = f"📋 任务清单已更新：共 {total} 项（✅ {completed} 完成 | 🔄 {in_progress} 进行中 | ⏳ {pending} 待执行）"

    return Command(
        update={
            "todos": todos_data,
            "messages": [ToolMessage(content=summary, tool_call_id=tool_call_id)],
        },
    )
