"""
OpenSys Executor 执行者节点

Executor 负责执行 Dispatcher 拆分的子任务。
核心特点：
1. 使用 Tier 2 小模型（EXECUTOR_MODEL_NAME），快速便宜
2. 支持并行执行（asyncio.gather 同组子任务）
3. 隔离上下文：只获得 phase description + skill 指令 + 子任务描述
4. 每个子任务独立调用 LLM，互不干扰

上下文分配（设计文档 4.3）：
- ❌ 对话历史
- ❌ memory
- ✅* project 背景（通过 advisor_context 间接获取的精简版）
- ❌ pipeline 进度
- ✅ skill 指令
- ❌ 审查清单
- ❌ 产出物
"""

import asyncio
import json

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.prebuilt import ToolNode

from ..model_manager import get_llm
from ..skill_loader import load_skill_content
from ..tools import run_terminal, write_and_run_script, web_tool
from .. import config

# Executor 可用的工具子集（不含 ask_user、write_todos、update_memory、request_planning 等交互类工具）
_EXECUTOR_TOOLS = [run_terminal, write_and_run_script, web_tool]
_executor_tool_node = ToolNode(_EXECUTOR_TOOLS)

# Executor 单个子任务最大工具调用轮数（防止无限循环）
_MAX_TOOL_ROUNDS = 5


# ==================== Executor System Prompt ====================

EXECUTOR_SYSTEM_PROMPT = """你是 OpenSys 的任务执行者（Executor），负责执行分配给你的子任务。

## 你的角色
你是一个专注于执行的工作者。你收到一份工单，按照要求完成它。
不需要考虑全局规划，只需要把手头的任务做好。

## 执行原则
1. **严格按照工单执行**：不要自行扩展范围
2. **输出要具体**：代码要完整可运行，文本要完整可用
3. **遇到阻塞说明原因**：如果缺少关键信息无法继续，说明缺什么
4. **不要输出多余内容**：不需要寒暄、不需要解释为什么这样做

## 工具使用约束
1. **搜索要有明确目标**：每次搜索前明确你要找什么，搜到后立即停止
2. **不要重复搜索**：如果已经搜到了需要的信息，不要再次搜索相同内容
3. **最多 3 次搜索**：单个子任务搜索不超过 3 次，搜到关键信息后就开始整理输出
4. **直接输出实质内容**：不要输出“我将开始搜索”“让我查找”等过程描述，直接给出结果

## 输出格式
直接输出任务成果。如果是代码，用代码块包裹。如果是文本，直接输出。
在最后一行标注任务状态：
- `[STATUS: DONE]` — 任务完成
- `[STATUS: BLOCKED]` — 缺少信息无法完成，说明原因
"""


# ==================== Executor 节点函数 ====================

async def executor_node(state: dict) -> dict:
    """
    Executor 执行者节点：按并行组执行子任务，收集结果

    执行流程：
    1. 读取 State.subtasks
    2. 按 parallel_group 分组
    3. 同组子任务 asyncio.gather 并行执行
    4. 不同组顺序执行
    5. 收集所有结果，更新 subtasks 状态

    Returns:
        State 更新字典
    """
    subtasks = state.get("subtasks", [])
    if not subtasks:
        return {"phase_status": "done"}

    pipeline = state.get("pipeline", {})
    phases = pipeline.get("phases", [])
    current = state.get("current_phase", 0)
    phase = phases[current] if current < len(phases) else {}

    # === 加载当前阶段 skill 内容 ===
    skill_content = ""
    skill_name = phase.get("skill")
    if skill_name:
        skill_content = load_skill_content(skill_name) or ""

    # === 构建共享上下文（解决子任务上下文隔离问题） ===
    # 优先使用 Dispatcher 产出的 phase_context（更全面准确）
    phase_context = ""
    if subtasks and subtasks[0].get("_phase_context"):
        phase_context = subtasks[0]["_phase_context"]
        print(f"[Executor] 使用 Dispatcher phase_context ({len(phase_context)} 字符)")
    # fallback：旧的代码层上下文拼接
    shared_context = _build_shared_context(state, phases, current) if not phase_context else ""

    # === 收集审查反馈（rework 时注入给子任务） ===
    rework_feedback = ""
    rework_count = state.get("_rework_count", 0)
    if rework_count > 0:
        # 优先从 state 直接读取详细审查反馈（含子任务级别指正）
        rework_feedback = state.get("review_feedback", "") or ""
        # fallback：从 messages 中提取最近的审查反馈消息
        if not rework_feedback:
            for msg in reversed(state.get("messages", [])):
                content = getattr(msg, "content", "") or ""
                if "审查反馈" in content or "审查未通过" in content:
                    rework_feedback = content
                    break

    # === 按 parallel_group 分组 ===
    groups = _group_subtasks(subtasks)

    # === 顺序执行每个组，组内并行 ===
    all_results = {}
    for group_id in sorted(groups.keys()):
        group_tasks = groups[group_id]
        # 只执行 pending 或 rework 状态的子任务（已完成的不重做）
        pending = [t for t in group_tasks if t.get("status") in ("pending", "rework")]

        if not pending:
            continue

        # 收集已完成的同组子任务结果（供后续子任务参考）
        completed_outputs = {}
        for t in group_tasks:
            if t.get("status") == "done" and t.get("output"):
                completed_outputs[t["id"]] = t["output"][:2000]

        # 上一组已完成的结果也收集（跨组依赖）
        for prev_gid in sorted(groups.keys()):
            if prev_gid >= group_id:
                break
            for t in groups[prev_gid]:
                if t.get("status") == "done" and t.get("output"):
                    completed_outputs[t["id"]] = t["output"][:2000]

        # 并行执行同组子任务
        coros = [
            _execute_single_subtask(
                task, phase, skill_content,
                phase_context=phase_context,
                shared_context=shared_context,
                rework_feedback=rework_feedback if task.get("status") == "rework" else "",
                completed_outputs=completed_outputs,
            )
            for task in pending
        ]
        results = await asyncio.gather(*coros, return_exceptions=True)

        for task, result in zip(pending, results):
            if isinstance(result, Exception):
                task["status"] = "failed"
                task["output"] = f"执行异常: {str(result)}"
            else:
                task["status"] = result.get("status", "done")
                task["output"] = result.get("output", "")
            all_results[task["id"]] = task

    # === 更新所有子任务状态 ===
    updated_subtasks = []
    for st in subtasks:
        if st["id"] in all_results:
            updated_subtasks.append(all_results[st["id"]])
        else:
            updated_subtasks.append(st)

    # === 汇总执行结果到 messages（供 Reviewer 审查） ===
    summary = _summarize_results(updated_subtasks, phase)

    return {
        "subtasks": updated_subtasks,
        "phase_status": "done",
        "messages": [AIMessage(content=summary)],
    }


# ==================== 单任务执行 ====================

async def _execute_single_subtask(
    task: dict,
    phase: dict,
    skill_content: str,
    phase_context: str = "",
    shared_context: str = "",
    rework_feedback: str = "",
    completed_outputs: dict = None,
) -> dict:
    """
    执行单个子任务（带工具执行循环）

    执行流程（ReAct 模式）：
    1. 构建 prompt → 调用 LLM
    2. 如果 LLM 返回 tool_calls → 执行工具 → 把结果反馈给 LLM → 继续循环
    3. 如果 LLM 返回纯文本 → 任务完成
    4. 最多循环 _MAX_TOOL_ROUNDS 轮，防止无限调用

    Args:
        task: 子任务定义（含 description 和 guidance）
        phase: 当前阶段定义
        skill_content: 技能指令内容
        phase_context: Dispatcher 产出的阶段上下文摘要（整体框架 + 用户要求 + 前序结论）
        shared_context: 共享上下文 fallback（用户需求 + 前序阶段摘要）
        rework_feedback: 审查反馈（rework 时注入，告知如何修改）
        completed_outputs: 已完成子任务的输出（供当前子任务参考）

    Returns:
        {"status": "done"|"blocked", "output": "..."}
    """
    # 构建 Executor prompt
    system_parts = [EXECUTOR_SYSTEM_PROMPT]

    if skill_content:
        system_parts.append(f"\n## 技能指令\n{skill_content}")

    system_prompt = "\n".join(system_parts)

    # 构建 user_prompt：注入完整上下文，解决子任务上下文隔离问题
    prompt_parts = []

    # 阶段上下文摘要（Dispatcher 产出，含整体框架 + 用户要求 + 前序结论）
    if phase_context:
        prompt_parts.append(f"## 阶段背景\n{phase_context}")
    elif shared_context:
        # fallback：旧的代码层上下文拼接
        prompt_parts.append(shared_context)

    # 工单核心信息
    prompt_parts.append(
        f"## 工单\n"
        f"- 阶段: {phase.get('name', '?')} — {phase.get('description', '')}\n"
        f"- 子任务: {task.get('description', '?')}"
    )

    # 执行指导（Dispatcher 为每个子任务单独给出的具体指导）
    guidance = task.get("guidance", "") or ""
    if guidance:
        prompt_parts.append(f"## 执行指导\n{guidance}")

    # 已完成子任务的结果（供参考，避免重复搜索）
    if completed_outputs:
        ref_parts = ["## 其他子任务已获取的信息（请直接利用，不要重复搜索）"]
        for tid, output in completed_outputs.items():
            ref_parts.append(f"### {tid} 的结果摘要\n{output[:1500]}")
        prompt_parts.append("\n".join(ref_parts))

    # rework 审查反馈（告知问题和改正方向）
    if rework_feedback:
        prompt_parts.append(
            f"## ⚠️ 返工说明\n"
            f"上次审查未通过，以下是审查反馈，请针对性修改：\n\n{rework_feedback}"
        )

    user_prompt = "\n\n".join(prompt_parts)

    # 获取带工具绑定的 Executor LLM（绑定 executor 专用工具子集）
    from ..model_manager import get_base_llm
    base_llm = get_base_llm(config.EXECUTOR_MODEL_NAME)
    executor_llm = base_llm.bind_tools(_EXECUTOR_TOOLS)

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ]

    # === 工具执行循环（ReAct 模式） ===
    all_outputs = []  # 收集所有轮次的文本输出
    tool_round = 0

    while tool_round < _MAX_TOOL_ROUNDS:
        try:
            response = await executor_llm.ainvoke(messages)
        except Exception as e:
            print(f"[Executor] 子任务 {task.get('id', '?')} LLM 调用失败: {e}")
            return {"status": "failed", "output": f"LLM 调用异常: {e}"}

        # 收集 LLM 的文本输出
        text_content = response.content if hasattr(response, "content") else ""
        if text_content and isinstance(text_content, str) and text_content.strip():
            all_outputs.append(text_content)

        # 检查是否有 tool_calls
        tool_calls = getattr(response, "tool_calls", None) or []
        if not tool_calls:
            # 无工具调用 → 任务完成
            break

        tool_round += 1
        print(f"[Executor] 子任务 {task.get('id', '?')} 工具调用轮 {tool_round}: "
              f"{[tc.get('name', '?') for tc in tool_calls]}")

        # 把 AI 消息加入对话历史
        messages.append(response)

        # 执行工具调用并收集结果
        try:
            tool_result = await _executor_tool_node.ainvoke(
                {"messages": messages}
            )
            # ToolNode 返回 {"messages": [ToolMessage, ...]}
            tool_messages = tool_result.get("messages", []) if isinstance(tool_result, dict) else []
            messages.extend(tool_messages)

            # 收集工具输出中的关键内容（供最终产出物使用）
            for tm in tool_messages:
                if isinstance(tm, ToolMessage) and tm.content:
                    tc_content = tm.content if isinstance(tm.content, str) else str(tm.content)
                    # 收集有实质内容的工具输出（跳过极短确认消息）
                    if len(tc_content) > 20:
                        all_outputs.append(f"[工具输出] {tc_content[:3000]}")
        except Exception as e:
            print(f"[Executor] 子任务 {task.get('id', '?')} 工具执行失败: {e}")
            # 工具执行失败，构造错误 ToolMessage 让 LLM 知道
            for tc in tool_calls:
                messages.append(ToolMessage(
                    content=f"工具执行失败: {e}",
                    tool_call_id=tc.get("id", "unknown"),
                ))

    if tool_round >= _MAX_TOOL_ROUNDS:
        print(f"[Executor] 子任务 {task.get('id', '?')} 达到最大工具调用轮数 ({_MAX_TOOL_ROUNDS})")

    # === 汇总所有输出 ===
    # 如果 LLM 每轮都只返回 tool_calls 没有文本，all_outputs 可能为空
    # 此时从消息历史中提取最后几条有内容的消息作为 fallback
    if not all_outputs:
        fallback_parts = []
        for msg in reversed(messages[2:]):  # 跳过 system+user
            content = getattr(msg, "content", "") or ""
            if not isinstance(content, str):
                content = str(content)
            if content.strip() and len(content) > 20:
                fallback_parts.append(content[:3000])
            if len(fallback_parts) >= 3:
                break
        fallback_parts.reverse()
        if fallback_parts:
            all_outputs = fallback_parts
            print(f"[Executor] 子任务 {task.get('id', '?')} 无直接输出，从消息历史提取了 {len(fallback_parts)} 条 fallback")

    output = "\n\n".join(all_outputs) if all_outputs else "（无输出）"

    # 检测状态标记
    status = "done"
    if "[STATUS: BLOCKED]" in output:
        status = "blocked"

    return {"status": status, "output": output}


# ==================== 辅助函数 ====================

def _group_subtasks(subtasks: list[dict]) -> dict[int, list[dict]]:
    """
    按 parallel_group 分组

    Args:
        subtasks: 子任务列表

    Returns:
        {group_id: [subtask, ...]}
    """
    groups = {}
    for task in subtasks:
        group = task.get("parallel_group", 0)
        if group not in groups:
            groups[group] = []
        groups[group].append(task)
    return groups


def _summarize_results(subtasks: list[dict], phase: dict) -> str:
    """
    汇总子任务执行结果为可读文本

    Args:
        subtasks: 执行后的子任务列表
        phase: 当前阶段定义

    Returns:
        汇总文本
    """
    lines = [
        f"## Phase {phase.get('id', '?')}: {phase.get('name', '?')} — 执行结果\n"
    ]

    done_count = sum(1 for t in subtasks if t.get("status") == "done")
    total = len(subtasks)
    lines.append(f"完成: {done_count}/{total}\n")

    for task in subtasks:
        status_emoji = {"done": "✅", "blocked": "🚫", "failed": "❌"}.get(task.get("status", ""), "❓")
        lines.append(f"### {status_emoji} {task.get('id', '?')}: {task.get('description', '')}\n")
        output = task.get("output", "（无输出）")
        # 截断过长的输出（保留足够内容供 Reviewer 审查）
        if len(output) > 5000:
            output = output[:5000] + "\n... (输出已截断)"
        lines.append(output)
        lines.append("")

    return "\n".join(lines)


def _build_shared_context(state: dict, phases: list, current_phase: int) -> str:
    """
    构建子任务共享上下文，解决子任务上下文隔离问题。

    包含：
    1. 用户原始需求（从 messages 中提取第一条 HumanMessage）
    2. 前序已完成阶段的实际产出物（而非仅阶段描述）
    3. Pipeline 全局信息

    Args:
        state: 当前 State
        phases: 所有阶段列表
        current_phase: 当前阶段索引

    Returns:
        格式化的上下文文本
    """
    parts = []

    # === 1. 提取用户原始需求 ===
    user_request = ""
    messages = state.get("messages", [])
    for msg in messages:
        if hasattr(msg, "type") and msg.type == "human":
            content = msg.content if isinstance(msg.content, str) else str(msg.content)
            # 跳过系统注入的消息
            if content.startswith("[系统通知]"):
                continue
            user_request = content[:500]
            break

    if user_request:
        parts.append(f"## 用户需求\n{user_request}")

    # === 2. 前序已完成阶段的实际产出物 ===
    if current_phase > 0:
        prev_outputs = _extract_previous_phase_outputs(messages, phases, current_phase)
        if prev_outputs:
            parts.append(prev_outputs)

    # === 3. Pipeline 全局信息 ===
    pipeline = state.get("pipeline", {})
    domain = pipeline.get("domain", "")
    if domain:
        parts.append(f"## 项目领域\n{domain}")

    # === 4. 浏览器下载的文件（前序 browser_node 产出） ===
    downloaded = state.get("downloaded_files")
    if downloaded:
        dl_lines = "\n".join(f"  - {f}" for f in downloaded)
        parts.append(f"## 已下载的文件\n以下文件由浏览器节点下载，可直接通过路径读取：\n{dl_lines}")

    return "\n\n".join(parts) if parts else ""


# 前序阶段产出物提取时，单个阶段产出物的最大截取字符数
_MAX_PHASE_OUTPUT_CHARS = 3000


def _extract_previous_phase_outputs(
    messages: list, phases: list, current_phase: int
) -> str:
    """
    从 messages 中提取前序阶段的实际产出物内容。

    识别策略：
    - Executor 阶段产出格式: "## Phase X: name — 执行结果"
    - Agent 阶段产出: 阶段推进消息 "✅ Phase X" 之前最近的 AIMessage
    - 阶段推进消息本身作为分隔标记

    Args:
        messages: 全部消息列表
        phases: 所有阶段定义
        current_phase: 当前阶段索引

    Returns:
        格式化的前序阶段产出物文本
    """
    from langchain_core.messages import AIMessage

    # 识别阶段推进分隔标记的位置：
    # phase_done_node 在推进时产出 "✅ Phase N (name) 完成" 格式的消息
    # 通过这些标记定位每个阶段的产出物区间
    phase_boundaries = []  # [(phase_idx, msg_list_index)]
    for idx, msg in enumerate(messages):
        if not isinstance(msg, AIMessage):
            continue
        content = msg.content if isinstance(msg.content, str) else str(msg.content)
        # 匹配阶段推进消息
        if content.startswith("✅ Phase ") and "完成" in content:
            # 提取阶段号（"✅ Phase 2 (xxx) 完成" → phase_idx=1）
            try:
                phase_num = int(content.split("Phase ")[1].split(" ")[0].split("(")[0])
                phase_boundaries.append((phase_num - 1, idx))  # 转为 0-indexed
            except (ValueError, IndexError):
                pass

    parts = ["## 前序阶段产出物"]

    for phase_idx in range(current_phase):
        p = phases[phase_idx] if phase_idx < len(phases) else {}
        p_name = p.get("name", f"Phase {phase_idx + 1}")

        # 找到该阶段推进标记的位置
        boundary_idx = None
        for b_phase, b_msg_idx in phase_boundaries:
            if b_phase == phase_idx:
                boundary_idx = b_msg_idx
                break

        if boundary_idx is None:
            # 没有推进标记，只显示阶段描述
            parts.append(f"### Phase {phase_idx + 1}: {p_name}\n（产出物不可用）")
            continue

        # 在推进标记之前向回搜索该阶段的实质性 AIMessage 产出
        output_text = ""
        for search_idx in range(boundary_idx - 1, max(boundary_idx - 10, -1), -1):
            msg = messages[search_idx]
            if not isinstance(msg, AIMessage):
                continue
            content = msg.content if isinstance(msg.content, str) else str(msg.content)
            # 跳过状态标记消息
            if (content.startswith("✅ Phase") or content.startswith("🔄")
                    or content.startswith("⏭️") or content.startswith("🛑")):
                continue
            # 找到实质内容（长度 > 50 字符）
            if len(content) > 50:
                output_text = content
                break

        if output_text:
            # 截断过长的产出物，保留核心内容供后续阶段参考
            if len(output_text) > _MAX_PHASE_OUTPUT_CHARS:
                output_text = output_text[:_MAX_PHASE_OUTPUT_CHARS] + "\n... (已截断)"
            parts.append(f"### Phase {phase_idx + 1}: {p_name}\n{output_text}")
        else:
            parts.append(f"### Phase {phase_idx + 1}: {p_name}\n{p.get('description', '?')} — ✅ 已完成")

    return "\n\n".join(parts)
