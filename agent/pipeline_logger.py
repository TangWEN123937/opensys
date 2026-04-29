"""
OpenSys Pipeline 质量诊断日志模块

自动收集 pipeline 执行过程中的失败/返工/异常案例，记录为结构化 JSON 日志。
用于事后分析哪个环节经常出问题，指导 Skill 和 Workflow 的迭代优化。

日志文件位置：data/logs/pipeline_diagnosis.jsonl（追加写入，一行一条记录）

每条日志包含：
- 时间戳、thread_id、pipeline 名称
- 事件类型（review_fail / rework / replan / escalation / executor_error / browser_error / tool_loop / dispatch_fallback 等）
- 阶段/子任务定位信息
- 详细上下文（审查反馈、错误信息、评分、issues 等）
- skill 和 workflow 名称（方便按技能维度统计）
"""

import json
import os
import time
from datetime import datetime
from typing import Any, Optional

from . import config

# 日志文件路径（JSONL 格式，一行一条 JSON 记录）
_LOG_FILE = config.LOG_DIR / "pipeline_diagnosis.jsonl"

# 是否启用 pipeline 诊断日志（默认开启）
_ENABLED = os.getenv("OPENSYS_PIPELINE_LOG_ENABLED", "true").lower() != "false"


def log_event(
    event_type: str,
    *,
    thread_id: str = "",
    pipeline_name: str = "",
    workflow_template: str = "",
    phase_index: int = -1,
    phase_name: str = "",
    phase_method: str = "",
    skill_name: str = "",
    subtask_id: str = "",
    subtask_description: str = "",
    rework_count: int = 0,
    review_score: int = 0,
    review_result: str = "",
    feedback: str = "",
    issues: Optional[list[str]] = None,
    subtask_feedback: Optional[list[dict]] = None,
    error: str = "",
    details: Optional[dict[str, Any]] = None,
) -> None:
    """
    记录一条 pipeline 诊断日志。

    Args:
        event_type: 事件类型，如 review_fail / rework / replan / adjust /
                    escalation / executor_error / executor_blocked /
                    browser_error / browser_timeout / browser_continuation /
                    tool_loop / tool_blocked / dispatch_fallback / dispatch_fail
        thread_id: 对话线程 ID
        pipeline_name: pipeline 名称（通常是 domain 或 user_request 前 50 字符）
        workflow_template: 使用的工作流模板名称
        phase_index: 阶段索引（0-based）
        phase_name: 阶段名称
        phase_method: 阶段执行方式（agent/executor/browser/reviewer 等）
        skill_name: 当前阶段关联的 skill 名称
        subtask_id: 子任务 ID（executor 相关事件）
        subtask_description: 子任务描述（截断到 200 字符）
        rework_count: 当前返工次数
        review_score: Reviewer 评分（1-10）
        review_result: Reviewer 审查结论（pass/fail/adjust/replan）
        feedback: 审查反馈或错误描述
        issues: Reviewer 发现的问题列表
        subtask_feedback: 子任务级审查反馈
        error: 异常/错误信息
        details: 额外自定义字段
    """
    if not _ENABLED:
        return

    record = {
        "timestamp": datetime.now().isoformat(),
        "epoch": time.time(),
        "event_type": event_type,
        "thread_id": thread_id,
        "pipeline_name": pipeline_name,
        "workflow_template": workflow_template,
        # 阶段定位
        "phase_index": phase_index,
        "phase_name": phase_name,
        "phase_method": phase_method,
        "skill_name": skill_name,
        # 子任务定位
        "subtask_id": subtask_id,
        "subtask_description": subtask_description[:200] if subtask_description else "",
        # 状态数据
        "rework_count": rework_count,
        "review_score": review_score,
        "review_result": review_result,
        # 文本详情
        "feedback": feedback[:2000] if feedback else "",
        "issues": issues or [],
        "subtask_feedback": subtask_feedback or [],
        "error": error[:1000] if error else "",
    }

    # 合并额外自定义字段
    if details:
        record["details"] = details

    # 移除空值字段（减少日志体积）
    record = {k: v for k, v in record.items() if v or v == 0}

    try:
        with open(_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as e:
        # 日志写入失败不影响主流程
        print(f"[PipelineLog] 写入失败: {e}")


def _extract_pipeline_info(state: dict) -> dict:
    """
    从 State 中提取 pipeline 的定位信息（公共辅助函数）。

    Returns:
        包含 thread_id, pipeline_name, workflow_template, phase_index,
        phase_name, phase_method, skill_name 的字典
    """
    pipeline = state.get("pipeline") or {}
    phases = pipeline.get("phases", [])
    current = state.get("current_phase", 0)
    phase = phases[current] if current < len(phases) else {}

    # 从 advisor_context 提取 user_request 作为 pipeline_name
    advisor_ctx = state.get("advisor_context") or {}
    user_request = advisor_ctx.get("user_request", "")
    pipeline_name = user_request[:50] if user_request else pipeline.get("domain", "")

    return {
        "thread_id": state.get("thread_id", ""),
        "pipeline_name": pipeline_name,
        "workflow_template": pipeline.get("template_used", ""),
        "phase_index": current,
        "phase_name": phase.get("name", ""),
        "phase_method": phase.get("method", ""),
        "skill_name": phase.get("skill", ""),
    }


# ==================== 快捷记录函数 ====================
# 提供面向场景的快捷函数，减少调用方的样板代码


def log_review(state: dict, review: dict) -> None:
    """
    记录 Reviewer 审查结果（无论通过与否都记录，方便统计评分分布）。

    Args:
        state: 当前 AgentState
        review: Reviewer 输出的审查结果字典（含 result, score, feedback, issues, subtask_feedback）
    """
    result = review.get("result", "")
    # 只在非 pass 或 score 较低时记录（pass 且 >= 8 分的不记录，减少噪声）
    score = review.get("score", 10)
    if result == "pass" and score >= 8:
        return

    info = _extract_pipeline_info(state)
    # 序列化 subtask_feedback（可能是 Pydantic 对象）
    sf = review.get("subtask_feedback", [])
    sf_dicts = []
    for item in sf:
        if isinstance(item, dict):
            sf_dicts.append(item)
        elif hasattr(item, "model_dump"):
            sf_dicts.append(item.model_dump())

    log_event(
        event_type=f"review_{result}" if result else "review_unknown",
        **info,
        rework_count=state.get("_rework_count", 0),
        review_score=score,
        review_result=result,
        feedback=review.get("feedback", ""),
        issues=review.get("issues", []),
        subtask_feedback=sf_dicts,
    )


def log_rework(state: dict, new_rework_count: int, feedback: str) -> None:
    """记录返工事件（phase_done 中 fail → rework 路径）。"""
    info = _extract_pipeline_info(state)
    log_event(
        event_type="rework",
        **info,
        rework_count=new_rework_count,
        feedback=feedback,
    )


def log_replan(state: dict, new_rework_count: int, reason: str) -> None:
    """记录全量重规划事件（phase_done 中 replan 路径）。"""
    info = _extract_pipeline_info(state)
    log_event(
        event_type="replan",
        **info,
        rework_count=new_rework_count,
        feedback=reason,
    )


def log_adjust(state: dict, feedback: str) -> None:
    """记录增量重规划事件（phase_done 中 adjust 路径）。"""
    info = _extract_pipeline_info(state)
    log_event(
        event_type="adjust",
        **info,
        feedback=feedback,
    )


def log_escalation(state: dict, reason: str, user_decision: str = "") -> None:
    """
    记录 escalation 事件（超限后请求用户介入）。

    Args:
        state: 当前 AgentState
        reason: 升级原因（replan_loop / rework_loop / phase_stuck）
        user_decision: 用户最终选择（pass/feedback/skip/abort）
    """
    info = _extract_pipeline_info(state)
    log_event(
        event_type="escalation",
        **info,
        rework_count=state.get("_rework_count", 0),
        feedback=f"原因: {reason}",
        details={"escalation_reason": reason, "user_decision": user_decision},
    )


def log_executor_error(
    state: dict,
    task: dict,
    error: str,
    error_type: str = "exception",
) -> None:
    """
    记录 Executor 子任务执行异常/失败/阻塞。

    Args:
        state: 当前 AgentState
        task: 子任务字典
        error: 错误信息
        error_type: 错误类型（exception / blocked / max_rounds）
    """
    info = _extract_pipeline_info(state)
    log_event(
        event_type=f"executor_{error_type}",
        **info,
        subtask_id=task.get("id", ""),
        subtask_description=task.get("description", ""),
        rework_count=state.get("_rework_count", 0),
        error=error,
    )


def log_browser_event(
    state: dict,
    event_type: str,
    task: str = "",
    error: str = "",
    details: Optional[dict] = None,
) -> None:
    """
    记录浏览器任务事件（失败/超时/续行等）。

    Args:
        state: 当前 AgentState
        event_type: 事件子类型（browser_error / browser_timeout / browser_continuation）
        task: 浏览器任务描述
        error: 错误信息
        details: 额外信息（如续行次数、步数等）
    """
    info = _extract_pipeline_info(state)
    log_event(
        event_type=event_type,
        **info,
        feedback=task[:500] if task else "",
        error=error,
        details=details,
    )


def log_tool_loop(state: dict, tool_signature: str, count: int) -> None:
    """记录工具死循环检测事件。"""
    info = _extract_pipeline_info(state)
    log_event(
        event_type="tool_loop",
        **info,
        error=f"连续 {count} 次相同调用: {tool_signature}",
        details={"tool_signature": tool_signature, "consecutive_count": count},
    )


def log_tool_blocked(state: dict, tool_name: str, reason: str) -> None:
    """记录工具调用被权限拦截事件。"""
    info = _extract_pipeline_info(state)
    log_event(
        event_type="tool_blocked",
        **info,
        error=f"{tool_name}: {reason}",
        details={"tool_name": tool_name, "block_reason": reason},
    )


def log_dispatch_event(
    state: dict,
    event_type: str,
    error: str = "",
    details: Optional[dict] = None,
) -> None:
    """
    记录 Dispatcher 相关事件（结构化输出失败、JSON 解析失败等）。

    Args:
        state: 当前 AgentState
        event_type: 子类型（dispatch_fallback / dispatch_fail）
        error: 错误信息
        details: 额外信息
    """
    info = _extract_pipeline_info(state)
    log_event(
        event_type=event_type,
        **info,
        error=error,
        details=details,
    )
