"""
OpenSys Agent 状态定义

定义 LangGraph StateGraph 使用的状态结构。
所有节点共享此状态，通过 reducer 函数管理消息列表的更新。
"""

from typing import Optional, Literal
from typing_extensions import TypedDict, Annotated
from langgraph.graph import add_messages
from langchain_core.messages import BaseMessage


def _last_value(existing, new):
    """
    并发安全的 LastValue reducer：同一 step 内多个工具更新同一 key 时取最后一个值。
    原生 LastValue 通道在并发更新时会抛 INVALID_CONCURRENT_GRAPH_UPDATE 错误，
    此 reducer 通过显式取最新值避免该问题。
    """
    return new


class AgentState(TypedDict):
    """
    OpenSys Agent 全局状态

    核心字段:
        messages: 对话消息列表（LangGraph 自动管理追加/更新）
        auth_level: 当前授权等级（0-4）
        pending_command: 等待审批的命令内容
        risk_level: 当前操作的风险等级
        approval_result: 用户审批结果
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

    # --- 动态模型切换（通过 CLI /model 命令或 API 参数设置） ---
    # {"model_name": "deepseek-chat"}
    # 完整配置从 MODEL_PRESETS 自动获取（含 isvision、thinking_model 等）
    model_config: Optional[dict]

    # --- P3 多代理协作字段 ---

    # Agent 给 Advisor 的情况摘要（结构化的"工作交接单"）
    # {"user_request": "...", "background": "...", "constraints": [...], "existing_progress": "...", "replan_reason": "..."}
    # 使用 _last_value reducer：防止 request_planning 与其他工具并发更新时冲突
    advisor_context: Annotated[Optional[dict], _last_value]

    # Advisor 产出的流水线（含 domain, template_used, phases 列表）
    pipeline: Optional[dict]

    # 当前执行到哪个阶段（0-indexed）
    current_phase: int

    # 当前阶段状态
    phase_status: Optional[Literal["pending", "executing", "done", "rework", "failed"]]

    # Dispatcher 拆分的子任务列表
    subtasks: Optional[list[dict]]

    # Reviewer 审查结果
    # pass: 通过 / fail: 返工 / adjust: 后续步骤需调整（增量重规划）/ replan: 全量重规划
    review_result: Optional[Literal["pass", "fail", "adjust", "replan"]]

    # Reviewer 审查反馈
    review_feedback: Optional[str]

    # 是否需要重新规划
    needs_replan: bool

    # 重新规划的原因
    replan_reason: Optional[str]

    # Advisor 是否已被调用过（防止同一轮重复触发）
    advisor_called: bool

    # --- P3 内部计数器（死循环兜底用，下划线前缀表示不对外暴露） ---

    # 当前阶段的返工次数（Executor ↔ Reviewer 循环计数）
    _rework_count: int

    # 本次会话 Advisor 被调用的累计次数
    _advisor_call_count: int

    # 当前阶段被 pipeline_router 路由的次数（阶段卡死检测）
    _phase_attempt_count: int

    # 最近 N 次工具调用名称（PostToolUse Hook 循环检测用）
    _recent_tool_calls: Optional[list[str]]

    # Pipeline 模式下 agent 当前阶段的工具调用轮次（越界防护用，阶段推进时归零）
    _agent_phase_tool_rounds: int

    # Reviewer 返回的结构化子任务审查反馈（供 phase_done 精确标记 rework 子任务）
    # 格式: [{"subtask_id": "subtask_1", "passed": false, "issue": "...", "fix_suggestion": "..."}]
    _review_subtask_feedback: Optional[list[dict]]

    # --- 无人值守模式（定时任务/自动化调用时启用） ---
    # 启用后所有 interrupt 自动处理：审批自动通过、pipeline 自动确认、escalation 自动跳过
    unattended: bool

    # 无人值守模式下自动处理 interrupt 的累计次数（死循环兜底）
    # 达到 UNATTENDED_MAX_AUTO_INTERRUPTS 上限时强制终止 pipeline
    _unattended_auto_count: int

    # Pipeline 刚完成标记（防止汇报轮次误触发新规划）
    # phase_done 设为 True → agent 汇报时 agent_router 据此拦截 request_planning
    # agent_node 入口检测到新 HumanMessage 时清除，同时清空旧 pipeline/phase_status/todos
    _pipeline_just_done: bool

    # --- 任务输出目录 ---
    # 每次 pipeline 创建时由 Advisor 生成独立目录（如 output/20260420_1435_排水管网论文/）
    # 包含 output/ 和 downloads/ 子目录，所有阶段共享此目录
    # Executor/Browser 通过此字段确定文件存放路径
    _task_dir: Optional[str]

    # --- 浏览器下载文件追踪 ---
    # 浏览器节点下载的文件绝对路径列表（多次 browser_node 调用时累积追加）
    # 后续节点（Executor/Agent）可直接读取此字段获取文件路径，无需从文本解析
    # 新对话开始时清空（同时清理下载目录中的旧文件）
    downloaded_files: Optional[list[str]]
