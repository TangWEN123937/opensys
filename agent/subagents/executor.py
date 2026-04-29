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
from ..skill_loader import load_skill_content, load_skill_with_meta
from ..utils import ensure_str_content
from ..tools import run_terminal, write_and_run_script, web_tool
from .. import config
from ..pipeline_logger import log_executor_error

# Executor 可用的工具子集（不含 ask_user、update_memory、request_planning 等交互类工具）
_EXECUTOR_TOOLS = [run_terminal, write_and_run_script, web_tool]
_executor_tool_node = ToolNode(_EXECUTOR_TOOLS)

# Executor 单个子任务最大工具调用轮数（防止无限循环）
_MAX_TOOL_ROUNDS = 8


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
5. **生成式任务不搜索**：如果技能指令标明"禁止搜索"或你的工具列表中没有 web_tool，则不得搜索互联网。直接基于上下文素材和向量库检索结果生成内容
6. **文件输出**：如果技能指令要求保存文件，必须用 write_and_run_script 写入指定路径，这是产出物的唯一交付方式

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

    # === 加载当前阶段 skill 内容和元数据 ===
    skill_content = ""
    skill_meta = {}
    skill_name = phase.get("skill")
    if skill_name:
        skill_content, skill_meta = load_skill_with_meta(skill_name)
        skill_content = skill_content or ""

    # === 根据 skill 元数据动态调整工具集 ===
    # no_web_tool: true 时移除 web_tool（硬约束：防止 LLM 忽视"禁止搜索"指令）
    no_web = str(skill_meta.get("no_web_tool", "")).lower() == "true"
    if no_web:
        executor_tools = [t for t in _EXECUTOR_TOOLS if t != web_tool]
        executor_tool_node = ToolNode(executor_tools)
        print(f"[Executor] 技能 '{skill_name}' 标记 no_web_tool=true，已移除 web_tool")
    else:
        executor_tools = _EXECUTOR_TOOLS
        executor_tool_node = _executor_tool_node

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

    # === 判断执行模式：串行 vs 并行 ===
    is_sequential = phase.get("method") == "executor_sequential"
    if is_sequential:
        print(f"[Executor] 串行模式：子任务将逐个顺序执行，每个子任务能读取前序子任务的产出文件")

    # === 按 parallel_group 分组 ===
    groups = _group_subtasks(subtasks)

    # === 顺序执行每个组，组内根据模式决定并行/串行 ===
    all_results = {}
    # 串行模式下，累积所有前序子任务的产出文件路径
    sequential_prior_files = []  # [(subtask_id, [file_path, ...]), ...]
    for group_id in sorted(groups.keys()):
        group_tasks = groups[group_id]
        # 只执行 pending 或 rework 状态的子任务（已完成的不重做）
        pending = [t for t in group_tasks if t.get("status") in ("pending", "rework")]

        if not pending:
            # 串行模式下，已完成的子任务也要收集产出文件（供后续子任务参考）
            if is_sequential:
                for t in group_tasks:
                    if t.get("output_files"):
                        sequential_prior_files.append((t["id"], t["output_files"]))
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

        if is_sequential:
            # === 串行模式：组内子任务也逐个执行 ===
            for task in pending:
                print(f"[Executor] 串行执行: {task.get('id', '?')} - {task.get('description', '')[:50]}")
                result = await _execute_single_subtask(
                    task, phase, skill_content,
                    phase_context=phase_context,
                    shared_context=shared_context,
                    rework_feedback=rework_feedback if task.get("status") == "rework" else "",
                    completed_outputs=completed_outputs,
                    prior_output_files=sequential_prior_files,
                    tools=executor_tools,
                    tool_node=executor_tool_node,
                )
                if isinstance(result, Exception):
                    task["status"] = "failed"
                    task["output"] = f"执行异常: {str(result)}"
                    task["output_files"] = []
                    log_executor_error(state, task, str(result), "exception")
                else:
                    task["status"] = result.get("status", "done")
                    task["output"] = result.get("output", "")
                    task["output_files"] = result.get("output_files", [])
                    if task["status"] == "blocked":
                        log_executor_error(state, task, "子任务阻塞: 缺少关键信息无法继续", "blocked")
                    elif task["status"] == "max_rounds":
                        log_executor_error(state, task, f"工具调用轮数用尽 ({_MAX_TOOL_ROUNDS} 轮)", "max_rounds")
                        task["status"] = "done"
                all_results[task["id"]] = task
                # 收集当前子任务产出文件，供下一个子任务参考
                if task.get("output_files"):
                    sequential_prior_files.append((task["id"], task["output_files"]))
                # 将当前子任务输出也加入 completed_outputs（供同组后续子任务使用）
                if task.get("output"):
                    completed_outputs[task["id"]] = task["output"][:2000]
        else:
            # === 并行模式：同组子任务 asyncio.gather 并行执行 ===
            coros = [
                _execute_single_subtask(
                    task, phase, skill_content,
                    phase_context=phase_context,
                    shared_context=shared_context,
                    rework_feedback=rework_feedback if task.get("status") == "rework" else "",
                    completed_outputs=completed_outputs,
                    tools=executor_tools,
                    tool_node=executor_tool_node,
                )
                for task in pending
            ]
            results = await asyncio.gather(*coros, return_exceptions=True)

            for task, result in zip(pending, results):
                if isinstance(result, Exception):
                    task["status"] = "failed"
                    task["output"] = f"执行异常: {str(result)}"
                    task["output_files"] = []
                    log_executor_error(state, task, str(result), "exception")
                else:
                    task["status"] = result.get("status", "done")
                    task["output"] = result.get("output", "")
                    task["output_files"] = result.get("output_files", [])
                    if task["status"] == "blocked":
                        log_executor_error(state, task, "子任务阻塞: 缺少关键信息无法继续", "blocked")
                    elif task["status"] == "max_rounds":
                        log_executor_error(state, task, f"工具调用轮数用尽 ({_MAX_TOOL_ROUNDS} 轮)", "max_rounds")
                        task["status"] = "done"
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
    prior_output_files: list = None,
    tools: list = None,
    tool_node: ToolNode = None,
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
        prior_output_files: 串行模式下前序子任务的产出文件 [(subtask_id, [path, ...]), ...]
        tools: 当前阶段可用的工具列表（可能已根据 skill 元数据动态调整）
        tool_node: 对应的 ToolNode 实例

    Returns:
        {"status": "done"|"blocked", "output": "..."}
    """
    # === 执行前快照：记录 output_dir + drafts_dir 当前文件状态（用于执行后检测新增/修改的文件） ===
    task_dir = task.get("_task_dir", "")
    task_output_dir = f"{task_dir}/output" if task_dir else "/app/output"
    task_drafts_dir = f"{task_dir}/drafts" if task_dir else "/app/output"
    _pre_snapshot_output = _snapshot_dir(task_output_dir)
    _pre_snapshot_drafts = _snapshot_dir(task_drafts_dir)

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

    # 工单核心信息（task_dir / task_output_dir 已在快照阶段声明）
    task_downloads_dir = f"{task_dir}/downloads" if task_dir else "/app/data/downloads"
    prompt_parts.append(
        f"## 工单\n"
        f"- 阶段: {phase.get('name', '?')} — {phase.get('description', '')}\n"
        f"- 子任务: {task.get('description', '?')}\n"
        f"- 终稿输出目录: `{task_output_dir}`（仅存放最终交付物）\n"
        f"- 草稿目录: `{task_drafts_dir}`（章节草稿、调研报告等过程文件保存到此处）\n"
        f"- 下载目录: `{task_downloads_dir}`（下载文件存放于此）"
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

    # 串行模式下注入前序子任务的产出文件路径（让后续子任务能用 run_terminal 读取前面章节的内容）
    if prior_output_files:
        import os
        prior_parts = [
            "## 前序子任务已产出的文件（串行模式）",
            "以下是前面子任务已写入的文件，你可以用 `run_terminal` 执行 `cat <文件路径>` 读取其内容，"
            "以确保章节编号、引用编号、术语定义、数据引用等与前面章节保持一致。"
        ]
        for tid, files in prior_output_files:
            file_names = [f"`{f}`" for f in files if os.path.isfile(f)]
            if file_names:
                prior_parts.append(f"- **{tid}**: " + ", ".join(file_names))
        prompt_parts.append("\n".join(prior_parts))

    # rework 时注入上次产出物（让 Executor 能看到自己前一次写了什么，做增量修改而非盲目重写）
    if rework_feedback:
        prev_text, prev_source = _get_previous_output_for_rework(task, task_output_dir)
        if prev_text:
            if prev_source == "file":
                # 从文件读取到的完整正文（论文/综述/报告等）→ 增量修改
                prompt_parts.append(
                    f"## 上次产出物（你前一次执行此子任务写入的文件内容）\n"
                    f"请在此基础上做**增量修改**，不要从零开始重写。"
                    f"只修改审查反馈中指出的问题部分，保留没有问题的内容。\n\n"
                    f"{prev_text}"
                )
            else:
                # 来自 task["output"]（工具执行日志/stdout）→ 仅供参考，不要求增量修改
                prompt_parts.append(
                    f"## 上次执行记录（仅供参考）\n"
                    f"以下是你前一次执行此子任务时的输出日志，可帮助你了解上次做了什么、哪里出了问题。"
                    f"请根据审查反馈重新执行，不必保留上次的错误做法。\n\n"
                    f"{prev_text}"
                )

        # rework 审查反馈（告知问题和改正方向）
        prompt_parts.append(
            f"## ⚠️ 返工说明\n"
            f"上次审查未通过，以下是审查反馈，请针对性修改：\n\n{rework_feedback}"
        )

    user_prompt = "\n\n".join(prompt_parts)

    # 获取带工具绑定的 Executor LLM（绑定动态工具子集，可能已移除 web_tool）
    effective_tools = tools if tools is not None else _EXECUTOR_TOOLS
    effective_tool_node = tool_node if tool_node is not None else _executor_tool_node
    from ..model_manager import get_base_llm
    base_llm = get_base_llm(config.EXECUTOR_MODEL_NAME)
    executor_llm = base_llm.bind_tools(effective_tools)

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

        # 收集 LLM 的文本输出（兼容 Anthropic list 格式）
        text_content = ensure_str_content(response.content) if hasattr(response, "content") else ""
        if text_content and text_content.strip():
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
            tool_result = await effective_tool_node.ainvoke(
                {"messages": messages}
            )
            # ToolNode 返回 {"messages": [ToolMessage, ...]}
            tool_messages = tool_result.get("messages", []) if isinstance(tool_result, dict) else []
            messages.extend(tool_messages)

            # 收集工具输出中的关键内容（供最终产出物使用）
            for tm in tool_messages:
                if isinstance(tm, ToolMessage) and tm.content:
                    tc_content = ensure_str_content(tm.content)
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
        # 注意：此处无法直接访问 state，通过上层 executor_node 记录

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
    # 工具轮次用尽时记录详情（通过 print 通知上层，实际日志由上层 executor_node 记录）
    if tool_round >= _MAX_TOOL_ROUNDS:
        status = "max_rounds"  # 上层会根据此状态记录日志

    # === 检测子任务执行期间新增/修改的文件（同时扫描 output/ 和 drafts/） ===
    # 传入子任务描述+指导作为 hint，过滤并行子任务写入的无关文件
    task_hint = f"{task.get('description', '')} {task.get('guidance', '')}"
    output_files = _detect_output_files(task_output_dir, _pre_snapshot_output, task_hint=task_hint)
    drafts_files = _detect_output_files(task_drafts_dir, _pre_snapshot_drafts, task_hint=task_hint)
    all_output_files = output_files + drafts_files

    return {"status": status, "output": output, "output_files": all_output_files}


# ==================== 辅助函数 ====================

def _snapshot_dir(dir_path: str) -> dict[str, float]:
    """
    快照目录中所有文件的修改时间，用于执行前后对比检测新增/修改的文件。

    Args:
        dir_path: 目录路径

    Returns:
        {文件绝对路径: mtime} 字典，目录不存在时返回空字典
    """
    import os
    snapshot = {}
    if not dir_path or not os.path.isdir(dir_path):
        return snapshot
    for entry in os.scandir(dir_path):
        if entry.is_file():
            snapshot[entry.path] = entry.stat().st_mtime
    return snapshot


def _detect_output_files(
    dir_path: str, pre_snapshot: dict[str, float], task_hint: str = ""
) -> list[str]:
    """
    对比执行前快照，检测子任务执行期间新增或修改的文件。

    并行子任务共享输出目录时，其他子任务写入的文件也会被检测到（累积污染）。
    通过 task_hint（子任务的 description + guidance）过滤：
    - 只返回文件名在 task_hint 中出现过的文件（精确匹配）
    - 如果精确匹配为空，fallback 返回所有变化文件（兼容无 hint 场景）

    Args:
        dir_path: 输出目录路径
        pre_snapshot: 执行前的文件快照 {path: mtime}
        task_hint: 子任务描述+指导文本，用于过滤属于本子任务的文件

    Returns:
        新增/修改的文件绝对路径列表
    """
    import os
    if not dir_path or not os.path.isdir(dir_path):
        return []
    changed = []
    for entry in os.scandir(dir_path):
        if not entry.is_file():
            continue
        path = entry.path
        mtime = entry.stat().st_mtime
        # 新增文件（不在快照中）或已修改文件（mtime 变化）
        if path not in pre_snapshot or mtime > pre_snapshot[path]:
            changed.append(path)

    if not changed:
        return []

    # 并行子任务过滤：只保留文件名在 task_hint 中出现的文件
    if task_hint and len(changed) > 1:
        hint_lower = task_hint.lower()
        matched = [f for f in changed if os.path.basename(f).lower() in hint_lower]
        if matched:
            print(f"[Executor] 检测到 {len(changed)} 个变化文件，过滤后保留 {len(matched)} 个: "
                  f"{[os.path.basename(f) for f in matched]}")
            return matched
        # 匹配不到则 fallback 返回全部（兼容无固定命名场景）

    if changed:
        print(f"[Executor] 检测到 {len(changed)} 个新增/修改文件: {[os.path.basename(f) for f in changed]}")
    return changed


# rework 时上次产出物的最大注入长度（字符数）
_REWORK_OUTPUT_MAX_CHARS = 6000


def _get_previous_output_for_rework(task: dict, output_dir: str) -> tuple[str, str]:
    """
    获取 rework 子任务的上次产出物内容，供 Executor 参考。

    返回值区分两种来源类型：
    - "file"：从文件读取到的完整正文（论文/综述/报告等），适合增量修改
    - "output"：来自 task["output"] 的 LLM/工具日志，仅供参考不要求增量修改

    优先级：
    1. 从 task["output_files"] 直接读取（确定性路径，Executor 自动记录）
    2. 回退到 task["output"]（LLM 输出 + 工具 stdout 拼接）

    Args:
        task: 子任务字典（含 output / output_files / id 等字段）
        output_dir: 任务输出目录路径（当前未使用，保留兼容性）

    Returns:
        (text, source_type)：产出物文本（已截断）和来源类型（"file" / "output"），
        ("", "") 表示无可用产出
    """
    import os

    # 策略1：从 task["output_files"] 直接读取（确定性，不靠猜测）
    output_files = task.get("output_files") or []
    file_parts = []
    for fpath in output_files:
        try:
            if not os.path.isfile(fpath) or os.path.getsize(fpath) == 0:
                continue
            with open(fpath, "r", encoding="utf-8", errors="replace") as fh:
                content = fh.read()
            if content.strip():
                file_parts.append(f"### 文件: {os.path.basename(fpath)}\n{content}")
        except Exception:
            continue

    if file_parts:
        combined = "\n\n".join(file_parts)
        if len(combined) > _REWORK_OUTPUT_MAX_CHARS:
            combined = combined[:_REWORK_OUTPUT_MAX_CHARS] + "\n... (已截断，完整内容见产出文件)"
        return combined, "file"

    # 策略2：回退到 task["output"]（工具执行日志 / LLM 输出拼接）
    previous_output = task.get("output", "") or ""
    if previous_output:
        truncated = previous_output[:_REWORK_OUTPUT_MAX_CHARS]
        if len(previous_output) > _REWORK_OUTPUT_MAX_CHARS:
            truncated += "\n... (已截断)"
        return truncated, "output"

    return "", ""


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
        # 附上产出文件路径（确定性引用，供 Reviewer 和后续环节使用）
        task_files = task.get("output_files") or []
        if task_files:
            import os
            file_names = [os.path.basename(f) for f in task_files]
            lines.append(f"**产出文件**: {', '.join(f'`{n}`' for n in file_names)}\n")
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
            content = ensure_str_content(msg.content)
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
        content = ensure_str_content(msg.content)
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
            content = ensure_str_content(msg.content)
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
