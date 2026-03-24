"""
OpenSys Agent 状态定义

定义 LangGraph StateGraph 使用的状态结构。
所有节点共享此状态，通过 reducer 函数管理消息列表的更新。
"""

from typing import Optional, Literal
from typing_extensions import TypedDict, Annotated
from langgraph.graph import add_messages
from langchain_core.messages import BaseMessage


class AgentState(TypedDict):
    """
    OpenSys Agent 全局状态

    核心字段:
        messages: 对话消息列表（LangGraph 自动管理追加/更新）
        auth_level: 当前授权等级（0-4）
        pending_command: 等待审批的命令内容
        risk_level: 当前操作的风险等级
        approval_result: 用户审批结果
        todos: 任务计划清单（write_todos 工具管理）
    """
    # --- 对话消息（LangGraph 核心，使用 add_messages reducer 自动管理） ---
    messages: Annotated[list[BaseMessage], add_messages]

    # --- 授权与审批 ---
    # 当前授权等级：0=观察者, 1=受限, 2=标准, 3=信任, 4=自主
    auth_level: int

    # 等待审批的命令描述（用于审批节点展示给用户）
    pending_command: Optional[str]

    # 当前操作的风险评估：safe=免审批, moderate=需审批, dangerous=高危必审
    risk_level: Optional[Literal["safe", "moderate", "dangerous"]]

    # 用户审批结果
    approval_result: Optional[Literal["approved", "rejected", "modified"]]

    # 用户修改后的命令（当 approval_result == "modified" 时有值）
    modified_command: Optional[str]

    # --- 任务计划（write_todos 工具通过 Command(update=...) 更新） ---
    # 每个 todo: {"id": "1", "content": "...", "status": "pending/in_progress/completed", "priority": "high/medium/low"}
    todos: Optional[list[dict]]

    # --- 动态模型切换（通过 CLI /model 命令或 API 参数设置） ---
    # {"model_name": "deepseek-chat"}
    # 完整配置从 MODEL_PRESETS 自动获取（含 isvision、thinking_model 等）
    model_config: Optional[dict]
