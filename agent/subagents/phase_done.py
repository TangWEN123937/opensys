"""
OpenSys Phase Done 阶段推进器节点

phase_done 是流水线的"交通信号灯"，负责：
1. 根据 review_result 决定下一步动作
2. pass → 推进 current_phase + 1
3. fail → 回退 current_phase - 1（返工），受 rework_count 上限约束
4. replan → 设置 needs_replan=True，触发 Advisor 重新规划
5. 超限 → escalate 到主代理，请求用户介入

死循环兜底（设计文档 4.5）：
- rework_count >= EXECUTOR_MAX_REWORK → escalate
- phase_attempt_count >= MAX_PHASE_ATTEMPTS → 强制跳过或 escalate
"""

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.types import interrupt

from .. import config


async def phase_done_node(state: dict) -> dict:
    """
    阶段推进器节点：根据审查结果推进/回退/replan/escalate

    决策矩阵（按优先级）：
    0. 无 review_result + 阶段非 reviewer 类型 → 需要审查（路由到 reviewer）
    1. review_result == "replan" → 设置 needs_replan
    2. review_result == "fail" + 未超限 → rework（重新执行当前阶段）
    3. review_result == "fail" + 超限 → escalate（通知用户介入）
    4. review_result == "pass" → 推进 current_phase + 1
    5. 阶段卡死检测 → escalate 或跳过

    Returns:
        State 更新字典
    """
    review_result = state.get("review_result")
    current_phase = state.get("current_phase", 0)
    rework_count = state.get("_rework_count", 0)
    phase_attempts = state.get("_phase_attempt_count", 0)

    pipeline = state.get("pipeline", {})
    phases = pipeline.get("phases", [])
    phase = phases[current_phase] if current_phase < len(phases) else {}
    phase_name = phase.get("name", f"Phase {current_phase + 1}")
    method = phase.get("method", "agent")

    # === 场景零：阶段执行完毕但未经审查 → 根据 phase.review 决定是否触发审查 ===
    # review 字段控制：true（默认）= 需要审查，false = 跳过审查直接通过
    # method="reviewer" 的阶段始终跳过（不能自己审自己）
    need_review = phase.get("review", True)  # 默认需要审查（向后兼容）
    if review_result is None and method != "reviewer" and need_review:
        # 检查是否有产出物可审查（避免空审查）
        has_deliverable = _check_has_deliverable(state)
        if has_deliverable:
            print(f"[Phase-Done] Phase {current_phase + 1} ({phase_name}) 未审查，路由到 Reviewer")
            return {
                "phase_status": "needs_review",
                # 不清理任何计数器，保持原状态让 reviewer 审查
            }
        else:
            # 没有产出物（可能阶段失败了），标记 fail
            print(f"[Phase-Done] Phase {current_phase + 1} ({phase_name}) 无可审查产出物，标记 fail")
            review_result = "fail"
            state["review_feedback"] = "阶段未产生可审查的产出物"
    elif review_result is None and (method == "reviewer" or not need_review):
        # 跳过审查 → 直接视为 pass，推进到下一阶段
        if not need_review:
            print(f"[Phase-Done] Phase {current_phase + 1} ({phase_name}) review=false，跳过审查直接通过")
        review_result = "pass"

    # === 场景一：Reviewer 返回 replan ===
    if review_result == "replan":
        new_rework_count = rework_count + 1
        feedback = state.get("review_feedback", "")

        # 兜底：连续 replan 超过返工上限 → interrupt 让用户决定
        if new_rework_count >= config.EXECUTOR_MAX_REWORK:
            # 无人值守模式：自动通过，继续执行
            if state.get("unattended"):
                auto_count = state.get("_unattended_auto_count", 0) + 1
                if auto_count > config.UNATTENDED_MAX_AUTO_INTERRUPTS:
                    print(f"[Phase-Done] 无人值守超限 ({auto_count})，强制终止 pipeline")
                    result = _handle_user_decision(
                        {"action": "abort"}, current_phase, phase_name, feedback, state
                    )
                    result["_unattended_auto_count"] = auto_count
                    return result
                print(f"[Phase-Done] 无人值守模式，replan 达上限，自动通过 [{auto_count}/{config.UNATTENDED_MAX_AUTO_INTERRUPTS}]")
                result = _handle_user_decision(
                    {"action": "pass"}, current_phase, phase_name, feedback, state
                )
                result["_unattended_auto_count"] = auto_count
                return result
            print(f"[Phase-Done] replan 次数达上限 ({new_rework_count})，interrupt 请求用户介入")
            user_decision = interrupt({
                "type": "escalation",
                "reason": "replan_loop",
                "display": (
                    f"⚠️ **Phase {current_phase + 1} ({phase_name}) 连续重新规划 {new_rework_count} 次仍未通过**\n\n"
                    f"**最近审查反馈**：{feedback}\n\n"
                    f"请选择下一步操作："
                ),
                "options": ["直接通过", "给出修改意见", "跳过此阶段", "终止任务"],
            })
            return _handle_user_decision(
                user_decision, current_phase, phase_name, feedback, state
            )

        # 构造 advisor_context，供 Advisor 做增量重规划
        # 包含：用户原始需求、已完成阶段进度摘要、replan 原因
        replan_reason = state.get("review_feedback", "Reviewer 建议重新规划")
        original_context = state.get("advisor_context") or {}
        user_request = original_context.get("user_request", "")

        # 如果原始 advisor_context 已被清空，从 messages 中提取用户原始需求
        if not user_request:
            for msg in state.get("messages", []):
                if isinstance(msg, HumanMessage) and msg.content:
                    user_request = msg.content
                    break

        # 构建已完成阶段的进度摘要
        progress_lines = []
        for idx, p in enumerate(phases):
            if idx < current_phase:
                progress_lines.append(f"  ✅ Phase {idx + 1} ({p.get('name', '?')}): 已完成")
            elif idx == current_phase:
                progress_lines.append(f"  ❌ Phase {idx + 1} ({p.get('name', '?')}): 执行失败，需要重新规划")
        existing_progress = "\n".join(progress_lines) if progress_lines else ""

        return {
            "needs_replan": True,
            "replan_reason": replan_reason,
            "advisor_context": {
                "user_request": user_request,
                "background": f"这是第 {new_rework_count + 1} 次规划尝试，前一次在 Phase {current_phase + 1} ({phase_name}) 遇到问题",
                "constraints": [],
                "existing_progress": existing_progress,
                "replan_reason": replan_reason,
            },
            "advisor_called": False,  # 重置，允许 Advisor 重新处理
            "review_result": None,
            "review_feedback": None,
            "_review_subtask_feedback": None,
            "_rework_count": new_rework_count,
            "_phase_attempt_count": 0,
            "_agent_phase_tool_rounds": 0,
        }

    # === 场景 1.5：Reviewer 返回 adjust（后续步骤需调整，增量重规划） ===
    # 当前阶段产出物可用，但后续步骤需修改。保留已完成阶段，只让 Advisor 重规划剩余部分。
    if review_result == "adjust":
        feedback = state.get("review_feedback", "")

        # 构造 advisor_context，标记 mode=adjust + adjust_from_phase
        original_context = state.get("advisor_context") or {}
        user_request = original_context.get("user_request", "")

        # 如果原始 advisor_context 已被清空，从 messages 中提取用户原始需求
        if not user_request:
            for msg in state.get("messages", []):
                if isinstance(msg, HumanMessage) and msg.content:
                    user_request = msg.content
                    break

        # 当前阶段视为通过（产出物可用），需要调整的是 current_phase + 1 及之后
        adjust_from = current_phase + 1

        # 构建已完成阶段的进度摘要（含当前阶段，标为通过）
        progress_lines = []
        for idx, p in enumerate(phases):
            if idx <= current_phase:
                progress_lines.append(f"  ✅ Phase {idx + 1} ({p.get('name', '?')}): 已完成")
        existing_progress = "\n".join(progress_lines) if progress_lines else ""

        # 构建原剩余阶段信息，供 Advisor 参考
        remaining_phases_info = []
        for idx, p in enumerate(phases):
            if idx > current_phase:
                remaining_phases_info.append(
                    f"  Phase {idx + 1} ({p.get('name', '?')}): {p.get('description', '')}"
                )
        remaining_info = "\n".join(remaining_phases_info) if remaining_phases_info else "无后续阶段"

        print(
            f"[Phase-Done] Phase {current_phase + 1} ({phase_name}) "
            f"审查结果=adjust，保留已完成阶段，增量重规划 Phase {adjust_from + 1} 起"
        )

        return {
            "needs_replan": True,
            "replan_reason": feedback,
            "advisor_context": {
                "user_request": user_request,
                "mode": "adjust",  # 增量模式标记
                "adjust_from_phase": adjust_from,  # 从哪个阶段开始重规划（0-indexed）
                "background": (
                    f"当前 Phase {current_phase + 1} ({phase_name}) 的产出物可用，"
                    f"但 Reviewer 认为后续步骤需要调整"
                ),
                "constraints": [],
                "existing_progress": existing_progress,
                "remaining_phases": remaining_info,
                "replan_reason": feedback,
            },
            "advisor_called": False,  # 重置，允许 Advisor 重新处理
            # 关键：当前阶段视为通过，推进到下一阶段
            "current_phase": adjust_from,
            "phase_status": "pending",
            "review_result": None,
            "review_feedback": None,
            "_review_subtask_feedback": None,
            "_rework_count": 0,
            "_phase_attempt_count": 0,
            "_agent_phase_tool_rounds": 0,
        }

    # === 场景二：Reviewer 返回 fail ===
    if review_result == "fail":
        new_rework_count = rework_count + 1
        feedback = state.get("review_feedback", "")

        if new_rework_count >= config.EXECUTOR_MAX_REWORK:
            # 无人值守模式：自动通过，继续执行
            if state.get("unattended"):
                auto_count = state.get("_unattended_auto_count", 0) + 1
                if auto_count > config.UNATTENDED_MAX_AUTO_INTERRUPTS:
                    print(f"[Phase-Done] 无人值守超限 ({auto_count})，强制终止 pipeline")
                    result = _handle_user_decision(
                        {"action": "abort"}, current_phase, phase_name, feedback, state
                    )
                    result["_unattended_auto_count"] = auto_count
                    return result
                print(f"[Phase-Done] 无人值守模式，rework 达上限，自动通过 [{auto_count}/{config.UNATTENDED_MAX_AUTO_INTERRUPTS}]")
                result = _handle_user_decision(
                    {"action": "pass"}, current_phase, phase_name, feedback, state
                )
                result["_unattended_auto_count"] = auto_count
                return result
            # 兜底：interrupt 让用户决定
            print(f"[Phase-Done] fail 返工次数达上限 ({new_rework_count})，interrupt 请求用户介入")
            user_decision = interrupt({
                "type": "escalation",
                "reason": "rework_loop",
                "display": (
                    f"⚠️ **Phase {current_phase + 1} ({phase_name}) 返工 {new_rework_count} 次仍未通过审查**\n\n"
                    f"**最近审查反馈**：{feedback}\n\n"
                    f"请选择下一步操作："
                ),
                "options": ["直接通过", "给出修改意见", "跳过此阶段", "终止任务"],
            })
            return _handle_user_decision(
                user_decision, current_phase, phase_name, feedback, state
            )

        # 正常回退：标记 rework，将审查反馈注入消息让执行者知道问题
        # 根据结构化子任务审查详情，只将未通过的子任务标记为 rework，已通过的保持 done
        sf_data = state.get("_review_subtask_feedback", [])
        updated_subtasks = _mark_failed_subtasks_for_rework(
            state.get("subtasks", []), feedback, sf_data
        )

        result = {
            "phase_status": "rework",
            "_rework_count": new_rework_count,
            "review_result": None,
            # 保留 review_feedback 供 executor 直接读取（不再清空）
            "_review_subtask_feedback": None,
            "_agent_phase_tool_rounds": 0,
            "messages": [AIMessage(
                content=(
                    f"🔄 **Phase {current_phase + 1} ({phase_name}) 审查未通过**，"
                    f"第 {new_rework_count}/{config.EXECUTOR_MAX_REWORK} 次返工。\n\n"
                    f"**审查反馈**：{feedback}\n\n"
                    f"**要求**：请根据以上反馈修复问题后重新提交。"
                )
            )],
        }
        if updated_subtasks:
            result["subtasks"] = updated_subtasks
        return result

    # === 场景三：通过（review_result == "pass"）→ 推进 ===
    # 阶段卡死检测
    new_phase_attempts = phase_attempts + 1
    if new_phase_attempts >= config.MAX_PHASE_ATTEMPTS:
        is_required = phase.get("required", True)
        if not is_required:
            # 非 required 阶段，强制跳过
            return {
                "current_phase": current_phase + 1,
                "phase_status": "pending",
                "_rework_count": 0,
                "_phase_attempt_count": 0,
                "_agent_phase_tool_rounds": 0,
                "review_result": None,
                "review_feedback": None,
                "_review_subtask_feedback": None,
                "subtasks": None,
                "messages": [AIMessage(
                    content=(
                        f"⏭️ Phase {current_phase + 1} ({phase_name}) 执行超时，"
                        f"已自动跳过（非必须阶段）。"
                    )
                )],
            }

        # 无人值守模式：自动跳过卡死阶段
        if state.get("unattended"):
            auto_count = state.get("_unattended_auto_count", 0) + 1
            fb = state.get("review_feedback", "")
            if auto_count > config.UNATTENDED_MAX_AUTO_INTERRUPTS:
                print(f"[Phase-Done] 无人值守超限 ({auto_count})，强制终止 pipeline")
                result = _handle_user_decision(
                    {"action": "abort"}, current_phase, phase_name, fb, state
                )
                result["_unattended_auto_count"] = auto_count
                return result
            print(f"[Phase-Done] 无人值守模式，阶段卡死，自动跳过 [{auto_count}/{config.UNATTENDED_MAX_AUTO_INTERRUPTS}]")
            result = _handle_user_decision(
                {"action": "skip"}, current_phase, phase_name, fb, state
            )
            result["_unattended_auto_count"] = auto_count
            return result
        # required 阶段卡死 → interrupt 让用户决定
        print(f"[Phase-Done] 阶段卡死 ({new_phase_attempts} 次)，interrupt 请求用户介入")
        user_decision = interrupt({
            "type": "escalation",
            "reason": "phase_stuck",
            "display": (
                f"⚠️ **Phase {current_phase + 1} ({phase_name}) 已执行 {new_phase_attempts} 次仍未成功**\n\n"
                f"该阶段为必须阶段，无法自动跳过。\n\n"
                f"请选择下一步操作："
            ),
            "options": ["直接通过", "给出修改意见", "跳过此阶段", "终止任务"],
        })
        return _handle_user_decision(
            user_decision, current_phase, phase_name,
            state.get("review_feedback", ""), state
        )

    # 正常推进到下一阶段
    next_phase = current_phase + 1
    total_phases = len(phases)

    if next_phase >= total_phases:
        # 全部完成 — 重置 advisor_called，允许同一 thread 中后续新任务再次触发 Advisor
        # 设置 _pipeline_just_done=True，防止 agent 汇报轮次误触发新规划
        # 重置 _advisor_call_count，防止跨任务累积导致新任务的 Advisor 被限流
        return {
            "current_phase": next_phase,
            "phase_status": "done",
            "advisor_called": False,
            "_advisor_call_count": 0,
            "_rework_count": 0,
            "_phase_attempt_count": 0,
            "_agent_phase_tool_rounds": 0,
            "_pipeline_just_done": True,
            "review_result": None,
            "review_feedback": None,
            "_review_subtask_feedback": None,
            "subtasks": None,
            "messages": [AIMessage(
                content=f"🎉 所有 {total_phases} 个阶段已完成！请汇总成果并交付给用户。"
            )],
        }

    # 推进到下一阶段
    next_name = phases[next_phase].get("name", f"Phase {next_phase + 1}") if next_phase < total_phases else "?"
    return {
        "current_phase": next_phase,
        "phase_status": "pending",
        "_rework_count": 0,
        "_phase_attempt_count": 0,
        "_agent_phase_tool_rounds": 0,
        "review_result": None,
        "review_feedback": None,
        "_review_subtask_feedback": None,
        "subtasks": None,
        "messages": [AIMessage(
            content=(
                f"✅ Phase {current_phase + 1} ({phase_name}) 完成，"
                f"进入 Phase {next_phase + 1} ({next_name})。"
            )
        )],
    }


def _handle_user_decision(
    user_decision: dict,
    current_phase: int,
    phase_name: str,
    feedback: str,
    state: dict,
) -> dict:
    """
    统一处理用户在 escalation interrupt 中的选择。

    用户选项：
    - "直接通过" / action="pass"   → 强制通过当前阶段，推进到下一阶段
    - "给出修改意见" / action="feedback" → 将用户意见注入 messages，再次 rework
    - "跳过此阶段" / action="skip"  → 跳过当前阶段
    - "终止任务" / action="abort"   → 标记 pipeline 终止

    Args:
        user_decision: interrupt 返回的用户决策（dict 或 str）
        current_phase: 当前阶段索引
        phase_name: 当前阶段名称
        feedback: 最近的审查反馈
        state: 当前 State

    Returns:
        State 更新字典
    """
    # 兼容多种返回格式
    if isinstance(user_decision, str):
        action = user_decision.strip()
        user_feedback = ""
    elif isinstance(user_decision, dict):
        action = user_decision.get("action", "")
        user_feedback = user_decision.get("feedback", "")
    else:
        action = str(user_decision)
        user_feedback = ""

    pipeline = state.get("pipeline", {})
    phases = pipeline.get("phases", [])

    # === 直接通过 ===
    if action in ("直接通过", "pass", "1"):
        next_phase = current_phase + 1
        total_phases = len(phases)
        if next_phase >= total_phases:
            return {
                "current_phase": next_phase,
                "phase_status": "done",
                "_rework_count": 0,
                "_phase_attempt_count": 0,
                "_agent_phase_tool_rounds": 0,
                "review_result": None,
                "review_feedback": None,
                "subtasks": None,
                "messages": [AIMessage(
                    content=f"👤 用户手动通过 Phase {current_phase + 1} ({phase_name})。\n"
                            f"🎉 所有 {total_phases} 个阶段已完成！"
                )],
            }
        next_name = phases[next_phase].get("name", "?") if next_phase < total_phases else "?"
        return {
            "current_phase": next_phase,
            "phase_status": "pending",
            "_rework_count": 0,
            "_phase_attempt_count": 0,
            "_agent_phase_tool_rounds": 0,
            "review_result": None,
            "review_feedback": None,
            "subtasks": None,
            "messages": [AIMessage(
                content=(
                    f"👤 用户手动通过 Phase {current_phase + 1} ({phase_name})，"
                    f"进入 Phase {next_phase + 1} ({next_name})。"
                )
            )],
        }

    # === 给出修改意见 ===
    if action in ("给出修改意见", "feedback", "2") or user_feedback:
        opinion = user_feedback or action
        return {
            "phase_status": "rework",
            "_rework_count": 0,  # 重置计数器，允许再次尝试
            "_phase_attempt_count": 0,
            "_agent_phase_tool_rounds": 0,
            "review_result": None,
            "review_feedback": None,
            "messages": [HumanMessage(
                content=(
                    f"[用户反馈] 关于 Phase {current_phase + 1} ({phase_name})：\n\n"
                    f"{opinion}\n\n"
                    f"请根据以上用户意见修改后重新提交。"
                )
            )],
        }

    # === 跳过此阶段 ===
    if action in ("跳过此阶段", "skip", "3"):
        next_phase = current_phase + 1
        total_phases = len(phases)
        if next_phase >= total_phases:
            return {
                "current_phase": next_phase,
                "phase_status": "done",
                "_rework_count": 0,
                "_phase_attempt_count": 0,
                "_agent_phase_tool_rounds": 0,
                "review_result": None,
                "review_feedback": None,
                "subtasks": None,
                "messages": [AIMessage(
                    content=f"⏭️ 用户选择跳过 Phase {current_phase + 1} ({phase_name})。\n"
                            f"🎉 所有 {total_phases} 个阶段已完成！"
                )],
            }
        next_name = phases[next_phase].get("name", "?") if next_phase < total_phases else "?"
        return {
            "current_phase": next_phase,
            "phase_status": "pending",
            "_rework_count": 0,
            "_phase_attempt_count": 0,
            "_agent_phase_tool_rounds": 0,
            "review_result": None,
            "review_feedback": None,
            "subtasks": None,
            "messages": [AIMessage(
                content=(
                    f"⏭️ 用户选择跳过 Phase {current_phase + 1} ({phase_name})，"
                    f"进入 Phase {next_phase + 1} ({next_name})。"
                )
            )],
        }

    # === 终止任务 ===
    if action in ("终止任务", "abort", "4"):
        # 将 current_phase 推到末尾，确保 pipeline_router 判定为"全部完成"并路由到 agent
        total_phases = len(phases)
        return {
            "current_phase": total_phases,
            "phase_status": "aborted",
            "pipeline": None,  # 清空 pipeline，彻底终止流水线
            "_rework_count": 0,
            "_phase_attempt_count": 0,
            "_agent_phase_tool_rounds": 0,
            "review_result": None,
            "review_feedback": None,
            "subtasks": None,
            "needs_replan": False,
            "messages": [AIMessage(
                content=f"🛑 用户选择终止任务（在 Phase {current_phase + 1} — {phase_name}）。"
            )],
        }

    # === 无法识别 → 当作用户给出修改意见 ===
    return {
        "phase_status": "rework",
        "_rework_count": 0,
        "_phase_attempt_count": 0,
        "_agent_phase_tool_rounds": 0,
        "review_result": None,
        "review_feedback": None,
        "messages": [HumanMessage(
            content=(
                f"[用户反馈] 关于 Phase {current_phase + 1} ({phase_name})：\n\n"
                f"{action}\n\n"
                f"请根据以上用户意见修改后重新提交。"
            )
        )],
    }


def _mark_failed_subtasks_for_rework(
    subtasks: list, feedback: str, sf_data: list = None
) -> list:
    """
    根据审查反馈，只将未通过的子任务标记为 rework，已通过的保持 done。

    优先使用结构化 subtask_feedback 数据（sf_data），若不可用则 fallback 到文本解析。

    Args:
        subtasks: 当前子任务列表
        feedback: 审查详细反馈文本（fallback 用）
        sf_data: 结构化的子任务审查反馈列表（优先用）

    Returns:
        更新后的子任务列表（如果有变化），空列表表示无需更新
    """
    if not subtasks:
        return []

    # === 策略 1：从结构化数据标记（优先） ===
    if sf_data:
        # 构建 subtask_id → passed 映射
        sf_map = {}
        for sf in sf_data:
            sid = sf.get("subtask_id", "")
            if sid:
                sf_map[sid] = sf.get("passed", True)

        if sf_map:
            rework_ids = []
            for st in subtasks:
                sid = st.get("id", "")
                passed = sf_map.get(sid, True)  # 未在反馈中提及的默认通过
                if not passed and st.get("status") == "done":
                    st["status"] = "rework"
                    rework_ids.append(sid)
            print(f"[Phase-Done] 需返工的子任务: {rework_ids}")
            return subtasks

    # === 策略 2：从 feedback 文本解析（fallback） ===
    passed_ids = set()
    failed_ids = set()
    for line in feedback.split("\n"):
        line = line.strip()
        if not line.startswith("- "):
            continue
        # 格式: "- subtask_1: ✅ 通过" 或 "- subtask_1: ❌ 原因"
        if "✅" in line and "通过" in line:
            parts = line.split(":")
            if len(parts) >= 2:
                sid = parts[0].replace("- ", "").strip()
                passed_ids.add(sid)
        elif "❌" in line:
            parts = line.split(":")
            if len(parts) >= 2:
                sid = parts[0].replace("- ", "").strip()
                failed_ids.add(sid)

    # 如果无法解析子任务反馈，全部标记为 rework（向后兼容）
    if not passed_ids and not failed_ids:
        for st in subtasks:
            if st.get("status") == "done":
                st["status"] = "rework"
        return subtasks

    # 只将未通过的标记为 rework，通过的保持 done
    for st in subtasks:
        sid = st.get("id", "")
        if sid in passed_ids:
            # 已通过，保持 done
            st["status"] = "done"
        elif sid in failed_ids or st.get("status") == "done":
            # 明确失败的 或 未在反馈中提及的已完成任务 → rework
            st["status"] = "rework"

    rework_ids = [st["id"] for st in subtasks if st.get("status") == "rework"]
    if rework_ids:
        print(f"[Phase-Done] 需返工的子任务: {rework_ids}")

    return subtasks


def _check_has_deliverable(state: dict) -> bool:
    """
    检查当前阶段是否有可审查的产出物

    简单检测：最近的 AIMessage 是否有实质内容（非空且非纯状态消息）

    Returns:
        True 如果有产出物
    """
    from langchain_core.messages import AIMessage

    messages = state.get("messages", [])
    # 检查最近 5 条消息中是否有 AIMessage 包含实质内容
    for msg in reversed(messages[-5:]):
        if isinstance(msg, AIMessage) and msg.content:
            content = msg.content if isinstance(msg.content, str) else str(msg.content)
            # 跳过纯状态消息
            if content.startswith("✅ Phase") or content.startswith("🔄"):
                continue
            # 有实质内容（超过 50 字符）
            if len(content) > 50:
                return True
    return False
