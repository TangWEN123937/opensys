"""
OpenSys Reviewer 审查者节点（独立质检员）

Reviewer 是多代理协作中的"独立外审专家"，负责：
1. 审查 Executor 的产出物质量
2. 输出结构化审查结果：pass / fail / replan
3. **完全隔离上下文**：只看结构化审查包，不看对话历史和执行过程

审查包（Review Package）三段式结构：
- 任务要求（pipeline phase description + 审查清单）
- 背景摘要（用户需求 + 前置阶段成果概述，系统自动生成）
- 产出物（纯最终输出，不含中间过程）
- 对话历史 / memory / project 背景 / skill 指令 / AI 思考过程

使用 Tier 2 模型（REVIEWER_MODEL_NAME），审查任务不需要最强模型。
"""

import json
from typing import Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from ..model_manager import get_base_llm, is_structured_output_blocked, block_structured_output
from .. import config


# ==================== 结构化输出 Schema ====================

class SubtaskFeedback(BaseModel):
    """单个子任务的审查反馈"""
    subtask_id: str = Field(description="子任务 ID，如 subtask_1")
    passed: bool = Field(description="该子任务是否通过")
    issue: str = Field(default="", description="未通过的原因（通过时留空）")
    fix_suggestion: str = Field(default="", description="具体的改正建议（通过时留空）")


class ReviewSchema(BaseModel):
    """Reviewer 审查结果的结构化输出 schema"""
    result: str = Field(description="审查结论：pass(>=7分) / fail(5-6分需返工) / adjust(3-4分后续步骤需调整) / replan(<=2分方向错误)")
    score: int = Field(ge=1, le=10, description="质量评分 1-10")
    feedback: str = Field(description="1-3句总评")
    issues: list[str] = Field(default_factory=list, description="发现的问题列表")
    suggestions: list[str] = Field(default_factory=list, description="改进建议列表")
    subtask_feedback: list[SubtaskFeedback] = Field(
        default_factory=list,
        description="按子任务分别给出的审查反馈（未通过时必填）"
    )


# ==================== Reviewer System Prompt ====================

REVIEWER_SYSTEM_PROMPT = """你是质量审查 API。用户会发送一个审查包，你直接返回 JSON 审查结果。

严格规则：
1. 你只能输出一个 JSON 对象，第一个字符必须是 {，最后一个字符必须是 }
2. 禁止输出任何非 JSON 内容（禁止解释、禁止分析、禁止思考过程、禁止 markdown）
3. 审查包中“三、产出物”部分就是完整的产出物，你不需要也无法查看任何外部文件
4. 直接根据审查包中提供的内容进行评判

JSON 格式：
{"result":"pass","score":8,"feedback":"总体评价","issues":[],"suggestions":[],"subtask_feedback":[]}

字段：
- result: pass(>=7分,满足要求) / fail(5-6分,需返工) / adjust(3-4分,当前阶段产出可用但后续步骤需调整) / replan(<=2分,方向完全错误需全量重规划)
- score: 1-10
- feedback: 1-3句总评
- issues: 问题列表(pass时可空)
- suggestions: 建议列表
- subtask_feedback: 按子任务分别给出的审查反馈（未通过时必填）
  每项格式: {"subtask_id":"subtask_1","passed":false,"issue":"未通过原因","fix_suggestion":"具体改正建议"}
  已完成的子任务 passed=true，issue 和 fix_suggestion 留空

审查要求：
- 必须逐个审查每个子任务的产出物，对照任务要求和审查清单检查
- 未通过时，必须在 subtask_feedback 中指明每个子任务的具体问题和改正方向
- 已完成的子任务设为 passed=true，返工时不需要重做
- 满足核心要求即 pass，不要过度要求"""


# ==================== Reviewer 节点函数 ====================

async def reviewer_node(state: dict) -> dict:
    """
    Reviewer 审查者节点：构建结构化审查包 → 独立审查 → 输出 pass/fail/replan

    审查包构建流程：
    1. 从 pipeline.phases[current] 获取任务要求
    2. 从 advisor_context + 前置阶段信息自动生成背景摘要
    3. 从 messages 中提取纯产出物（最终输出，不含执行过程）
    4. 组装审查包，发送给独立的 Reviewer LLM

    Reviewer 完全不看对话历史，只看审查包，确保客观独立。

    Returns:
        State 更新字典（review_result, review_feedback）
    """
    pipeline = state.get("pipeline", {})
    phases = pipeline.get("phases", [])
    current = state.get("current_phase", 0)
    phase = phases[current] if current < len(phases) else {}
    rework_count = state.get("_rework_count", 0)

    # === 1. 提取产出物（纯最终输出，不含执行过程） ===
    deliverable = _extract_deliverable(state)
    if not deliverable:
        return {
            "review_result": "fail",
            "review_feedback": "未发现可审查的产出物，阶段可能未正常完成。",
            "messages": [AIMessage(content="🔍 审查：未找到产出物，标记为不通过。")],
        }

    # === 2. 构建背景摘要（脱离对话上下文的独立概述） ===
    context_summary = _build_context_summary(state, phase, phases, current)

    # === 3. 构建审查清单（含 skill 匹配） ===
    checklist = _build_review_checklist(phase)

    # === 4. 组装结构化审查包 ===
    review_package = _build_review_package(
        phase=phase,
        context_summary=context_summary,
        checklist=checklist,
        deliverable=deliverable,
        rework_count=rework_count,
        prev_feedback=state.get("review_feedback", ""),
    )

    print(f"[Reviewer] 审查包已构建 | Phase {current + 1}: {phase.get('name', '?')} "
          f"| 产出物 {len(deliverable)} 字 | 背景摘要 {len(context_summary)} 字")

    # === 5. 调用 Tier 2 LLM（不绑定工具，纯 JSON 输出） ===
    base_llm = get_base_llm(config.REVIEWER_MODEL_NAME)
    messages = [
        SystemMessage(content=REVIEWER_SYSTEM_PROMPT),
        HumanMessage(content=review_package),
    ]

    # 优先使用 with_structured_output 强制 JSON 输出
    review = await _invoke_structured(base_llm, messages, model_name=config.REVIEWER_MODEL_NAME)

    if not review:
        # 结构化输出失败，fallback 到普通调用 + 手动解析
        print(f"[Reviewer] 结构化输出失败，fallback 到普通调用...")
        try:
            response = await base_llm.ainvoke(messages)
            response_text = response.content if hasattr(response, "content") else str(response)
            print(f"[Reviewer] fallback 原始输出前 500 字符: {response_text[:500]}")
            review = _parse_review_json(response_text)
        except Exception as e:
            print(f"[Reviewer] fallback 调用失败: {e}")

    if not review:
        # 全部失败，返回 fail（不放行低质量产出）
        print(f"[Reviewer] 所有解析策略均失败，返回 fail")
        return {
            "review_result": "fail",
            "review_feedback": "审查结果解析失败，请检查 Reviewer 模型输出格式。",
            "messages": [AIMessage(content="🔍 审查结果解析异常，标记为不通过，需要重新执行。")],
        }

    result = review.get("result", "pass")
    feedback = review.get("feedback", "")
    score = review.get("score", 7)
    issues = review.get("issues", [])
    suggestions = review.get("suggestions", [])
    subtask_feedback = review.get("subtask_feedback", [])

    # === 7. 当 fail 且 subtask_feedback 为空时，自动生成 fallback 反馈 ===
    if result == "fail" and not subtask_feedback:
        subtask_feedback = _generate_fallback_subtask_feedback(
            state.get("subtasks", []), issues, feedback
        )
        print(f"[Reviewer] subtask_feedback 为空，已生成 fallback（{len(subtask_feedback)} 个子任务）")

    # === 8. 构建详细反馈（含子任务级别指正，供 rework 时注入 executor） ===
    detailed_feedback = _build_detailed_feedback(feedback, subtask_feedback)

    # === 9. 格式化审查结果消息 ===
    display = _format_review_display(phase, result, score, feedback, issues, suggestions, subtask_feedback)

    # === 10. 序列化 subtask_feedback 供 phase_done 使用（结构化数据，不依赖文本解析） ===
    serialized_sf = [
        sf if isinstance(sf, dict) else sf.model_dump() if hasattr(sf, 'model_dump') else {}
        for sf in subtask_feedback
    ]

    return {
        "review_result": result,
        "review_feedback": detailed_feedback,
        "_review_subtask_feedback": serialized_sf,
        "messages": [AIMessage(content=display)],
    }


# ==================== 辅助函数 ====================

async def _invoke_structured(llm, messages: list, model_name: str = "") -> Optional[dict]:
    """
    使用 with_structured_output 强制 LLM 输出结构化 JSON

    优先使用 LangChain 的 with_structured_output 机制（底层走 function_calling 或 json_mode），
    如果模型不支持则返回 None，由调用方 fallback 到手动解析。

    对已知不支持的模型（thinking 模式等）直接跳过，避免浪费请求。

    Args:
        llm: 基础 LLM 实例
        messages: 消息列表
        model_name: 模型名称（用于黑名单缓存）

    Returns:
        审查结果字典，失败返回 None
    """
    # 检查全局黑名单：该模型之前已确认不支持 structured_output
    if is_structured_output_blocked(model_name):
        print(f"[Reviewer] 模型 {model_name} 在黑名单中，跳过 structured_output")
        return None

    try:
        structured_llm = llm.with_structured_output(ReviewSchema)
        result = await structured_llm.ainvoke(messages)
        if result and isinstance(result, ReviewSchema):
            review_dict = result.model_dump()
            print(f"[Reviewer] 结构化输出成功: result={review_dict['result']}, score={review_dict['score']}")
            return review_dict
        # 有些模型返回的是 dict 而不是 Pydantic 对象
        if result and isinstance(result, dict) and "result" in result:
            print(f"[Reviewer] 结构化输出成功(dict): result={result['result']}, score={result.get('score')}")
            return result
    except NotImplementedError:
        print(f"[Reviewer] 当前模型不支持 with_structured_output，跳过")
        block_structured_output(model_name)
    except Exception as e:
        error_str = str(e)
        print(f"[Reviewer] 结构化输出异常: {e}")
        # 检测 thinking 模式不支持 tool_choice 的错误，加入全局黑名单
        if "tool_choice" in error_str and "thinking" in error_str:
            print(f"[Reviewer] 检测到 thinking 模式不兼容，将 {model_name} 加入黑名单")
            block_structured_output(model_name)
    return None


def _detect_file_refs(text: str) -> set[str]:
    """
    从文本中检测文件路径引用（通用策略）

    匹配规则：
    1. 相对路径：./xxx/yyy.ext（任意扩展名）
    2. 绝对路径：/app/xxx/yyy.ext、/tmp/xxx/yyy.ext 等
    3. 从 "文件已写入"、"saved to"、"output:" 等上下文提示中提取路径

    只返回文件系统中实际存在的文件路径，避免误匹配。

    Returns:
        检测到的真实文件路径集合
    """
    import re
    from pathlib import Path

    refs = set()

    # 模式 1：匹配带扩展名的相对路径（./开头）
    for m in re.finditer(r'(\./[^\s`\'"<>|]+\.\w+)', text):
        refs.add(m.group(1).rstrip('.,;:)]}。，；：）】'))

    # 模式 2：匹配带扩展名的绝对路径（/app、/tmp、/home、/output 等）
    for m in re.finditer(r'(/(?:app|tmp|home|output|data|var)[^\s`\'"<>|]*\.\w+)', text):
        refs.add(m.group(1).rstrip('.,;:)]}。，；：）】'))

    # 过滤：只保留文件系统中实际存在的文件
    verified = set()
    for fpath in refs:
        try:
            p = Path(fpath)
            if p.exists() and p.is_file():
                verified.add(fpath)
        except (OSError, ValueError):
            pass

    return verified


def _is_text_file(path) -> bool:
    """
    判断文件是否为文本文件（排除图片、压缩包等二进制文件）

    通过读取前 512 字节，检测是否包含 NULL 字节来判断。
    文本文件几乎不会包含 \\x00，二进制文件（图片、zip 等）通常在前几个字节就有。

    Args:
        path: Path 对象

    Returns:
        True 表示是文本文件，可以安全 read_text()
    """
    try:
        with open(path, 'rb') as f:
            chunk = f.read(512)
        # NULL 字节是二进制文件的典型标记
        return b'\x00' not in chunk
    except (OSError, IOError):
        return False


def _extract_deliverable(state: dict) -> str:
    """
    从 State.messages 中提取纯产出物（最终输出）

    提取策略（按优先级）：
    1. 检测消息中引用的文件路径 → 自动读取文件完整内容（核心改进）
    2. 收集 AIMessage 的最终文本输出（排除中间思考）
    3. 收集 ToolMessage 中有实质内容的输出

    排除的内容：
    - 状态推进消息（"Phase X 完成"、"进入 Phase Y"）
    - 审查结果消息（"审查结果"）
    - 返工通知消息（"审查未通过"）
    - AI 中间思考（带 tool_calls 的 AIMessage）

    收集策略：从消息末尾往前扫描，直到遇到阶段分界标记。

    Returns:
        纯产出物文本
    """
    from pathlib import Path
    from langchain_core.messages import ToolMessage

    messages = state.get("messages", [])
    current_phase = state.get("current_phase", 0)

    # 需要跳过的状态消息前缀
    _skip_prefixes = ("✅ Phase", "🔄", "🔍 **审查结果", "🔍 审查", "🎉 所有", "⏭️ Phase")

    # === 第一遍：收集消息内容，同时检测文件引用 ===
    parts = []
    file_refs = set()  # 检测到的文件路径

    for msg in reversed(messages):
        content = msg.content if hasattr(msg, "content") and msg.content else ""
        if not isinstance(content, str):
            content = str(content)

        # 遇到上一阶段的推进标记，停止收集
        if isinstance(msg, AIMessage) and (
            f"Phase {current_phase} " in content
            or f"进入 Phase {current_phase + 1}" in content
        ):
            break

        # 跳过状态消息
        if any(content.startswith(p) for p in _skip_prefixes):
            continue

        # 检测文件路径引用（通用策略：任何看起来像路径的字符串）
        file_refs.update(_detect_file_refs(content))

        # 收集 AIMessage 的最终输出（排除带 tool_calls 的中间消息）
        if isinstance(msg, AIMessage) and content and not getattr(msg, "tool_calls", None):
            parts.append(content)
        # 收集 ToolMessage 中关键结果（文件写入、脚本执行等）
        elif isinstance(msg, ToolMessage) and content:
            tool_name = getattr(msg, "name", "")
            # 检测工具输出中的文件引用
            file_refs.update(_detect_file_refs(content))
            # 只收集有实质内容的工具输出（跳过简短的确认消息）
            if len(content) > 30:
                truncated = content[:3000] if len(content) > 3000 else content
                parts.append(f"[{tool_name} 输出] {truncated}")

        # 最多收集 10 条，控制审查包大小
        if len(parts) >= 10:
            break

    parts.reverse()

    # === 第二遍：自动读取引用的文件内容 ===
    # 当产出物是"文件已写入xxx"时，Reviewer 需要看到实际文件内容而非描述
    file_contents = []
    for fpath in sorted(file_refs):
        try:
            p = Path(fpath)
            if not (p.exists() and p.is_file() and p.stat().st_size > 0):
                continue
            # 跳过二进制文件（图片、压缩包等）
            if not _is_text_file(p):
                print(f"[Reviewer] 跳过非文本文件: {fpath}")
                continue
            text = p.read_text(encoding="utf-8", errors="replace")
            # 截断过长文件（保留前 8000 字，足够审查）
            if len(text) > 8000:
                text = text[:8000] + f"\n\n... [文件过长，已截断，总共 {len(text)} 字符]"
            file_contents.append(f"### 📄 文件内容: {fpath}\n```\n{text}\n```")
            print(f"[Reviewer] 已读取产出物文件: {fpath} ({p.stat().st_size} bytes)")
        except Exception as e:
            print(f"[Reviewer] 读取文件 {fpath} 失败: {e}")

    # === 组装最终产出物 ===
    result_parts = []
    if file_contents:
        # 文件实际内容优先（这是 Reviewer 最需要看到的）
        result_parts.extend(file_contents)
    if parts:
        # 附上 AI 的总结描述（作为补充上下文）
        result_parts.append("### 执行者输出摘要\n" + "\n\n---\n\n".join(parts))

    return "\n\n".join(result_parts) if result_parts else ""


def _build_context_summary(state: dict, phase: dict, phases: list, current: int) -> str:
    """
    构建背景摘要——让 Reviewer 了解最少必要的背景信息

    背景摘要包含：
    1. 用户原始需求（一句话）
    2. 前置阶段的完成概述（哪些已完成，做了什么）
    3. 如果是返工，附上上一次审查的反馈

    不包含：对话历史、memory、AI 的思考过程

    Returns:
        简要背景摘要文本
    """
    parts = []

    # 1. 用户原始需求
    advisor_ctx = state.get("advisor_context") or {}
    user_request = advisor_ctx.get("user_request", "")
    if user_request:
        parts.append(f"**用户需求**：{user_request[:300]}")

    # 2. 前置阶段概述
    if current > 0:
        prev_summary = []
        for i in range(min(current, len(phases))):
            p = phases[i]
            prev_summary.append(f"  Phase {i + 1} ({p.get('name', '?')})：{p.get('description', '?')[:80]}")
        if prev_summary:
            parts.append("**已完成的阶段**：\n" + "\n".join(prev_summary))

    # 3. 整体任务领域
    domain = state.get("pipeline", {}).get("domain", "")
    if domain:
        parts.append(f"**任务领域**：{domain}")

    return "\n\n".join(parts) if parts else "无额外背景信息"


def _build_review_package(
    phase: dict,
    context_summary: str,
    checklist: str,
    deliverable: str,
    rework_count: int = 0,
    prev_feedback: str = "",
) -> str:
    """
    组装结构化审查包——Reviewer 唯一看到的输入

    三段式结构：
    1. 背景摘要（最少必要的上下文）
    2. 任务要求 + 审查清单（评判标准）
    3. 产出物（被审查的内容）

    Returns:
        格式化的审查包文本
    """
    sections = []

    # --- 第一段：背景摘要 ---
    sections.append(f"## 一、背景摘要\n{context_summary}")

    # --- 第二段：任务要求 ---
    task_section = f"## 二、任务要求\n"
    task_section += f"**当前阶段**：Phase {phase.get('id', '?')} — {phase.get('name', '?')}\n"
    task_section += f"**阶段描述**：{phase.get('description', '无')}\n\n"
    task_section += f"**审查清单**：\n{checklist}"
    sections.append(task_section)

    # --- 返工提示（如果是重做） ---
    if rework_count > 0 and prev_feedback:
        sections.append(
            f"## ⚠️ 返工说明（第 {rework_count} 次返工）\n"
            f"上次审查反馈：{prev_feedback}\n"
            f"请重点检查上次反馈中提到的问题是否已修复。"
        )

    # --- 第三段：产出物 ---
    sections.append(f"## 三、产出物\n{deliverable}")

    # --- 结尾指令 ---
    sections.append("请对照任务要求和审查清单，客观评审以上产出物，直接输出 JSON 结果。")

    return "\n\n".join(sections)


def _build_review_checklist(phase: dict) -> str:
    """
    根据阶段类型生成审查清单

    优先从 data/skills/review-* 目录加载匹配的审查 skill 文件，
    匹配不到时回退到通用审查项。

    Args:
        phase: 当前阶段定义

    Returns:
        审查清单文本
    """
    name = phase.get("name", "").lower()
    description = phase.get("description", "")
    subtasks = phase.get("subtasks", [])

    # === 尝试加载审查 skill 文件 ===
    skill_text = _load_review_skill(name, description)

    # === 构建阶段任务要求（让 Reviewer 知道具体该检查什么） ===
    task_context = []
    if description:
        task_context.append(f"**阶段任务描述**：{description}")
    if subtasks:
        task_context.append("**子任务列表**：")
        for st in subtasks:
            if isinstance(st, dict):
                task_context.append(f"  - {st.get('description', st.get('id', '?'))}")
            else:
                task_context.append(f"  - {st}")

    parts = []
    if task_context:
        parts.append("\n".join(task_context))
    if skill_text:
        parts.append(skill_text)
    else:
        # 回退：通用审查项
        parts.append(_build_generic_checklist(name))

    return "\n\n".join(parts)


def _load_review_skill(phase_name: str, phase_description: str) -> str:
    """
    从 data/skills/review-* 目录加载匹配的审查 skill 文件

    匹配规则：检查 skill 的 triggers 关键词是否出现在阶段名称或描述中

    Returns:
        审查 skill 正文（去除 frontmatter），或空字符串
    """
    import yaml
    from pathlib import Path

    skills_dir = Path(config.DATA_DIR) / "skills"
    if not skills_dir.exists():
        return ""

    combined_text = f"{phase_name} {phase_description}".lower()

    for skill_dir in sorted(skills_dir.iterdir()):
        if not skill_dir.is_dir() or not skill_dir.name.startswith("review-"):
            continue
        skill_file = skill_dir / "SKILL.md"
        if not skill_file.exists():
            continue

        try:
            content = skill_file.read_text(encoding="utf-8")
            # 解析 frontmatter
            if content.startswith("---"):
                parts = content.split("---", 2)
                if len(parts) >= 3:
                    meta = yaml.safe_load(parts[1])
                    body = parts[2].strip()
                    triggers = meta.get("triggers", [])
                    # 检查触发词是否匹配阶段
                    if any(t.lower() in combined_text for t in triggers):
                        print(f"[Reviewer] 已匹配审查 skill: {skill_dir.name}")
                        return body
        except Exception as e:
            print(f"[Reviewer] 加载审查 skill {skill_dir.name} 失败: {e}")

    return ""


def _build_generic_checklist(name: str) -> str:
    """回退用的通用审查清单"""
    items = [
        "- [ ] 产出物是否完整（没有遗漏的部分）",
        "- [ ] 产出物是否满足阶段描述的要求",
        "- [ ] 产出物质量是否达到可用标准",
    ]

    if any(kw in name for kw in ("execute", "implement", "code", "develop")):
        items.extend([
            "- [ ] 代码是否可运行（语法正确、无明显错误）",
            "- [ ] 代码风格是否一致",
            "- [ ] 是否有明显的逻辑错误",
        ])

    if any(kw in name for kw in ("write", "content", "draft", "撰写")):
        items.extend([
            "- [ ] 文本逻辑是否连贯",
            "- [ ] 是否有明显的事实错误",
            "- [ ] 语言风格是否统一",
        ])

    if any(kw in name for kw in ("research", "分析", "调研")):
        items.extend([
            "- [ ] 分析是否有数据/证据支撑",
            "- [ ] 结论是否合理",
        ])

    return "\n".join(items)


def _parse_review_json(text: str) -> dict | None:
    """
    从 LLM 输出中提取审查结果 JSON

    Args:
        text: LLM 原始输出

    Returns:
        审查结果字典，失败返回 None
    """
    if not text:
        return None

    import re

    # 预处理：剥离 <think>...</think> 标签（DeepSeek 等模型的思考过程标签）
    cleaned = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
    # 也处理未闭合的 <think> 标签（模型可能只输出了开头）
    cleaned = re.sub(r'<think>.*$', '', cleaned, flags=re.DOTALL).strip()

    # 对原始 text 和清理后的 cleaned 都尝试解析
    for candidate in [cleaned, text.strip()]:
        if not candidate:
            continue

        # 尝试 1：直接解析
        try:
            result = json.loads(candidate)
            if isinstance(result, dict) and "result" in result:
                return result
        except json.JSONDecodeError:
            pass

        # 尝试 2：提取 ```json ``` 代码块
        json_block = re.search(r'```(?:json)?\s*\n(.*?)\n\s*```', candidate, re.DOTALL)
        if json_block:
            try:
                result = json.loads(json_block.group(1).strip())
                if isinstance(result, dict) and "result" in result:
                    return result
            except json.JSONDecodeError:
                pass

        # 尝试 3：找最外层 { } 之间的内容
        first_brace = candidate.find("{")
        last_brace = candidate.rfind("}")
        if first_brace >= 0 and last_brace > first_brace:
            try:
                result = json.loads(candidate[first_brace:last_brace + 1])
                if isinstance(result, dict) and "result" in result:
                    return result
            except json.JSONDecodeError:
                pass

    print(f"[Reviewer] 无法解析审查结果 JSON，原始输出前 500 字符: {text[:500]}")
    return None


def _format_review_display(
    phase: dict,
    result: str,
    score: int,
    feedback: str,
    issues: list,
    suggestions: list,
    subtask_feedback: list = None,
) -> str:
    """
    格式化审查结果为用户友好的展示文本

    Args:
        subtask_feedback: 按子任务分别给出的审查反馈列表

    Returns:
        格式化的 Markdown 文本
    """
    result_emoji = {"pass": "✅", "fail": "❌", "adjust": "🔧", "replan": "🔄"}.get(result, "❓")
    result_text = {"pass": "通过", "fail": "不通过（需返工）", "adjust": "后续步骤需调整", "replan": "需全量重规划"}.get(result, result)

    lines = [
        f"🔍 **审查结果** — Phase {phase.get('id', '?')}: {phase.get('name', '?')}\n",
        f"  {result_emoji} **{result_text}** | 评分: {score}/10",
        f"  📝 {feedback}",
    ]

    if issues:
        lines.append("\n  **发现的问题：**")
        for issue in issues:
            lines.append(f"  - ⚠️ {issue}")

    if suggestions:
        lines.append("\n  **改进建议：**")
        for sug in suggestions:
            lines.append(f"  - 💡 {sug}")

    # 按子任务分别展示审查反馈
    if subtask_feedback:
        lines.append("\n  **子任务审查详情：**")
        for sf in subtask_feedback:
            sf_dict = sf if isinstance(sf, dict) else sf.model_dump() if hasattr(sf, 'model_dump') else {}
            sid = sf_dict.get("subtask_id", "?")
            passed = sf_dict.get("passed", True)
            if passed:
                lines.append(f"  - ✅ {sid}: 通过")
            else:
                issue = sf_dict.get("issue", "")
                fix = sf_dict.get("fix_suggestion", "")
                lines.append(f"  - ❌ {sid}: {issue}")
                if fix:
                    lines.append(f"    → 改正建议: {fix}")

    return "\n".join(lines)


def _generate_fallback_subtask_feedback(
    subtasks: list, issues: list, feedback: str
) -> list:
    """
    当 Reviewer LLM 未返回 subtask_feedback 时，自动生成 fallback 反馈。

    策略：将所有 issues 合并为统一问题描述，标记所有子任务为未通过。
    这比"静默全部 rework 但无说明"要好——至少 executor 能看到问题描述。

    Args:
        subtasks: 当前子任务列表（来自 state）
        issues: Reviewer 指出的问题列表
        feedback: Reviewer 总评

    Returns:
        fallback 的子任务反馈列表
    """
    if not subtasks:
        return []

    # 合并 issues 为统一问题描述
    combined_issues = "; ".join(issues) if issues else feedback or "审查未通过，需要改进"

    result = []
    for st in subtasks:
        sid = st.get("id", "?")
        result.append({
            "subtask_id": sid,
            "passed": False,
            "issue": combined_issues,
            "fix_suggestion": "请根据总体审查反馈改进产出物质量",
        })
    return result


def _build_detailed_feedback(feedback: str, subtask_feedback: list) -> str:
    """
    构建详细反馈文本（含子任务级别指正），供 rework 时注入 executor。

    Args:
        feedback: 总体反馈
        subtask_feedback: 子任务反馈列表

    Returns:
        格式化的详细反馈文本
    """
    parts = [feedback]

    if subtask_feedback:
        parts.append("\n子任务审查详情：")
        for sf in subtask_feedback:
            sf_dict = sf if isinstance(sf, dict) else sf.model_dump() if hasattr(sf, 'model_dump') else {}
            sid = sf_dict.get("subtask_id", "?")
            passed = sf_dict.get("passed", True)
            if passed:
                parts.append(f"- {sid}: ✅ 通过（不需要重做）")
            else:
                issue = sf_dict.get("issue", "")
                fix = sf_dict.get("fix_suggestion", "")
                parts.append(f"- {sid}: ❌ {issue}")
                if fix:
                    parts.append(f"  改正建议: {fix}")

    return "\n".join(parts)
