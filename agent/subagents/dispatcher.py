"""
OpenSys Dispatcher 调度器节点

Dispatcher 负责将 pipeline 中 method=executor/executor_parallel/executor_sequential 的阶段拆分为子任务。
它分析当前阶段的 description 和 skill，通过 LLM 拆分出可独立执行的子任务列表。

核心职责：
1. 读取当前阶段定义（来自 pipeline.phases[current_phase]）
2. LLM 拆分子任务（JSON 列表）
3. 标记依赖关系（哪些可并行，哪些有先后顺序）
4. 写入 State.subtasks，流转到 executor 节点

使用 Tier 2 小模型（EXECUTOR_MODEL_NAME），因为拆分逻辑相对简单。
"""

import json
from typing import Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from ..model_manager import get_base_llm, is_structured_output_blocked, block_structured_output
from ..utils import ensure_str_content
from .. import config
from ..vector_store import VectorStoreManager
from ..pipeline_logger import log_dispatch_event


# ==================== 结构化输出 Schema ====================

class SubtaskSchema(BaseModel):
    """单个子任务的结构化 schema"""
    id: str = Field(description="唯一标识，格式为 subtask_N")
    description: str = Field(description="清晰具体的执行指令")
    guidance: str = Field(default="", description="执行指导：告诉 Executor 怎么做、参考什么、质量要求等")
    depends_on: list[str] = Field(default_factory=list, description="依赖的子任务 id 列表")
    parallel_group: int = Field(default=0, description="并行组编号")


class DispatchResult(BaseModel):
    """Dispatcher 拆分结果的结构化输出 schema"""
    phase_context: str = Field(description="阶段上下文摘要：整体框架/大纲 + 用户核心要求 + 前序阶段关键结论，所有子任务共享")
    subtasks: list[SubtaskSchema] = Field(description="子任务列表，1-5 个")


# ==================== Dispatcher System Prompt ====================

DISPATCHER_SYSTEM_PROMPT = """你是 OpenSys 的任务调度器（Dispatcher），负责将一个阶段任务拆分为可独立执行的子任务。

## 你的职责
1. 理解用户需求和前序阶段的关键结论，提取出“阶段上下文摘要”供所有子任务共享
2. 将当前阶段拆分为 1-5 个子任务，每个子任务附带具体的执行指导
3. 标记子任务之间的依赖关系和并行分组

## 输出格式
输出一个 JSON 对象，包含 phase_context 和 subtasks：

```json
{{
  "phase_context": "阶段上下文摘要：包含整体框架/大纲、用户核心要求、前序阶段关键结论",
  "subtasks": [
    {{
      "id": "subtask_1",
      "description": "子任务描述（要具体、可执行）",
      "guidance": "执行指导：怎么做、参考什么、质量要求、注意事项",
      "depends_on": [],
      "parallel_group": 0
    }}
  ]
}}
```

## 字段说明

### phase_context（所有子任务共享）
从对话历史和前序阶段产出物中提取的摘要，必须包含：
- **整体框架/大纲**：当前任务的全局结构（如文章大纲、代码架构、调研维度等）
- **用户核心要求**：风格、字数、受众、技术约束等关键要求
- **前序阶段关键结论**：之前阶段已确认的决策、已收集的数据摘要等

### subtasks[…].guidance（每个子任务特有）
告诉 Executor 怎么执行这个子任务，必须包含：
- **具体要求**：需要覆盖的内容点、实现的功能点
- **参考素材**：应该参考前序阶段的哪些产出物
- **质量标准**：字数要求、风格要求、代码规范等
- **注意事项**：与其他子任务的衝接点、边界条件等

### 其他字段
- `id`: 唯一标识，格式为 subtask_N
- `description`: 清晰具体的执行指令，Executor 看到就能执行
- `depends_on`: 依赖的子任务 id 列表（空列表=无依赖）
- `parallel_group`: 并行组编号（同一组的子任务可同时执行，不同组顺序执行）

## 拆分原则
- 简单任务不要过度拆分（1 个子任务也是合法的）
- 每个子任务应该是一个完整的工作单元
- 有数据依赖的子任务不能放在同一并行组
- 最多 5 个子任务（避免过度拆分增加协调成本）
- **guidance 要具体有用**：不要写空洞的套话，要基于对话历史中的实际信息给出具体指导

## 特殊约束：论文写作类任务
当阶段是论文正文撰写（writing）时：
- **摘要（abstract）和全文合并必须放在最后一个子任务**，parallel_group 最大，与正文章节不并行
- 摘要是全文内容的浓缩，必须在所有正文章节完成后才能撰写
- 正文章节可以并行撰写（同一 parallel_group）

## 串行执行模式（executor_sequential）
当阶段的执行方式为 executor_sequential 时：
- 子任务将按顺序逐个执行（不并行），每个子任务能读取前面子任务的产出文件
- **每个子任务必须放在不同的 parallel_group**（从 0 递增），保证严格顺序执行
- 后面的子任务应在 guidance 中明确说明需要与前面章节保持一致的要素（如章节编号、引用编号、术语定义、数据引用等）
- 这种模式特别适合需要全局一致性的任务（如论文写作、长文档生成）

### ❗ 文件命名硬规则（严格遵守，禁止自由命名）
子任务 description 和 guidance 中必须使用以下固定文件名，**禁止使用 introduction.md、current_status.md 等语义化名称**：

| 章节 | 固定文件名 |
|---|---|
| 第一章（引言） | chapter_1.md |
| 第二章 | chapter_2.md |
| 第三章 | chapter_3.md |
| 第四章 | chapter_4.md |
| 第五章 | chapter_5.md |
| 第六章 | chapter_6.md |
| 第七章 | chapter_7.md |
| 摘要 + 关键词 | abstract.md |
| 全文合并稿 | paper_draft.md |

- description 格式示例：「撰写第一章 引言 → 输出 chapter_1.md」
- guidance 中必须写明：「将内容保存到 chapter_1.md」
- 一个子任务负责多章时，分别写入对应的 chapter_N.md（如「输出 chapter_5.md + chapter_6.md」）
"""


# ==================== Dispatcher 节点函数 ====================

async def dispatcher_node(state: dict) -> dict:
    """
    Dispatcher 调度器节点：读取当前阶段 → LLM 拆分子任务 → 写入 State

    Returns:
        State 更新字典（subtasks 列表）
    """
    pipeline = state.get("pipeline", {})
    phases = pipeline.get("phases", [])
    current = state.get("current_phase", 0)

    if current >= len(phases):
        # 不应该到这里，安全回退
        return {"phase_status": "done"}

    phase = phases[current]

    # === 向量库检索：为写作类阶段注入文献资料 ===
    vector_context = await _retrieve_vector_context_for_phase(phase, state)

    # === 构建 Dispatcher prompt ===
    user_prompt = _build_dispatcher_prompt(phase, state, vector_context=vector_context)

    # === 调用 Tier 2 LLM（不绑定工具，纯 JSON 输出） ===
    base_llm = get_base_llm(config.DISPATCHER_MODEL_NAME)
    messages = [
        SystemMessage(content=DISPATCHER_SYSTEM_PROMPT),
        HumanMessage(content=user_prompt),
    ]

    # 优先使用 with_structured_output 强制 JSON 输出
    phase_context, subtasks = await _invoke_structured_dispatch(
        base_llm, messages, model_name=config.DISPATCHER_MODEL_NAME
    )

    if subtasks is None:
        # 结构化输出失败，fallback 到普通调用 + 手动解析
        print(f"[Dispatcher] 结构化输出失败，fallback 到普通调用...")
        # 记录 Dispatcher 结构化输出失败诊断日志
        log_dispatch_event(state, "dispatch_fallback", error="结构化输出失败，回退到普通调用")
        try:
            response = await base_llm.ainvoke(messages)
            # Anthropic 返回 list 格式 content，需统一转为 str
            response_text = ensure_str_content(response.content) if hasattr(response, "content") else str(response)
            print(f"[Dispatcher] fallback 原始输出前 300 字符: {response_text[:300]}")
            phase_context, subtasks = _parse_dispatch_json(response_text)
        except Exception as e:
            print(f"[Dispatcher] fallback 调用失败: {e}")

    if not subtasks:
        # 解析失败，生成一个默认子任务（整个阶段作为一个任务）
        # 记录 Dispatcher 解析完全失败诊断日志
        log_dispatch_event(state, "dispatch_fail", error="所有解析策略均失败，回退到默认单子任务")
        subtasks = [{
            "id": "subtask_1",
            "description": phase.get("description", "执行当前阶段任务"),
            "depends_on": [],
            "parallel_group": 0,
            "status": "pending",
        }]
    else:
        # 给每个子任务加上 status、注入 phase_context
        for st in subtasks:
            st["status"] = "pending"

    # 将 phase_context 注入每个子任务（Executor 读取时取第一个即可）
    if phase_context:
        for st in subtasks:
            st["_phase_context"] = phase_context
        print(f"[Dispatcher] phase_context 已注入 ({len(phase_context)} 字符)")

    # 将任务目录路径注入每个子任务
    task_dir = state.get("_task_dir", "")
    if task_dir:
        for st in subtasks:
            st["_task_dir"] = task_dir

    return {
        "subtasks": subtasks,
        "phase_status": "executing",
    }


# ==================== 向量库检索 ====================

# 需要注入向量库文献资料的阶段方法列表（写作、综述等生成式任务）
_VECTOR_INJECT_METHODS = {"executor_parallel", "executor", "executor_sequential"}

# 向量库检索 top-k（Dispatcher 层注入基础资料）
_DISPATCHER_VECTOR_TOP_K = 15

# 向量库检索结果最大字符数（防止 prompt 超限）
_MAX_VECTOR_CONTEXT_CHARS = 4000


async def _retrieve_vector_context_for_phase(phase: dict, state: dict) -> str:
    """
    为写作类阶段从向量库检索相关文献资料

    仅在以下条件都满足时检索：
    1. 阶段 method 属于 _VECTOR_INJECT_METHODS
    2. 向量库中有已入库的文档 chunks

    检索策略：用阶段 description + 用户原始需求作为 query

    Args:
        phase: 当前阶段定义
        state: 当前 State

    Returns:
        格式化的文献资料文本，空字符串表示无结果或不需要检索
    """
    method = phase.get("method", "")
    if method not in _VECTOR_INJECT_METHODS:
        return ""

    try:
        vs = VectorStoreManager()
        try:
            # 检查向量库是否有文档
            doc_count = vs.get_document_count()
            if doc_count == 0:
                print("[Dispatcher] 向量库为空，跳过文献检索")
                return ""

            # 构建检索 query：阶段描述 + 用户需求
            query_parts = []
            phase_desc = phase.get("description", "")
            if phase_desc:
                query_parts.append(phase_desc)

            # 从消息中提取用户原始需求
            from langchain_core.messages import HumanMessage as HM
            for msg in state.get("messages", []):
                if isinstance(msg, HM):
                    content = ensure_str_content(msg.content)
                    if len(content) > 10 and not content.startswith("[系统通知]"):
                        query_parts.append(content[:300])
                        break  # 只取第一条用户消息

            query = " ".join(query_parts)
            if not query:
                return ""

            # 从向量库检索相关文献片段
            results = await vs.search_documents(
                query=query,
                top_k=_DISPATCHER_VECTOR_TOP_K,
            )

            if not results:
                print("[Dispatcher] 向量库检索无结果")
                return ""

            # 格式化检索结果
            lines = []
            total_chars = 0
            for i, item in enumerate(results, 1):
                meta = item.get("metadata", {})
                source = meta.get("source_file", "未知来源")
                section = meta.get("section", "")
                distance = item.get("distance", 0)
                similarity = round(1 - distance, 3) if distance else 1.0

                # 过滤低相关度结果
                if similarity < 0.3:
                    continue

                doc_text = item.get("document", "")
                # 截断过长片段
                if len(doc_text) > 800:
                    doc_text = doc_text[:800] + "..."

                entry = f"**[{i}] {source}**"
                if section:
                    entry += f" | {section}"
                entry += f" | 相关度: {similarity}\n{doc_text}"
                lines.append(entry)

                total_chars += len(entry)
                if total_chars >= _MAX_VECTOR_CONTEXT_CHARS:
                    lines.append(f"... (共 {len(results)} 条结果，已截断)")
                    break

            if not lines:
                return ""

            result_text = "\n\n".join(lines)
            print(f"[Dispatcher] 向量库检索到 {len(lines)} 条文献片段 ({len(result_text)} 字符)")
            return result_text

        finally:
            await vs.close()
    except Exception as e:
        print(f"[Dispatcher] 向量库检索失败: {e}")
        return ""


# ==================== 辅助函数 ====================

async def _invoke_structured_dispatch(llm, messages: list, model_name: str = "") -> tuple[str, Optional[list[dict]]]:
    """
    使用 with_structured_output 强制 LLM 输出结构化结果（含 phase_context + subtasks）

    Args:
        llm: 基础 LLM 实例
        messages: 消息列表
        model_name: 模型名称（用于全局黑名单缓存）

    Returns:
        (phase_context, subtasks) 元组，失败时返回 ("", None)
    """
    # 检查全局黑名单：该模型之前已确认不支持 structured_output
    if is_structured_output_blocked(model_name):
        print(f"[Dispatcher] 模型 {model_name} 在黑名单中，跳过 structured_output")
        return "", None

    try:
        structured_llm = llm.with_structured_output(DispatchResult)
        result = await structured_llm.ainvoke(messages)
        if result and isinstance(result, DispatchResult):
            phase_context = result.phase_context or ""
            subtasks = [s.model_dump() for s in result.subtasks]
            print(f"[Dispatcher] 结构化输出成功: {len(subtasks)} 个子任务, context={len(phase_context)}字符")
            return phase_context, subtasks
        # 有些模型返回 dict
        if result and isinstance(result, dict) and "subtasks" in result:
            phase_context = result.get("phase_context", "") or ""
            print(f"[Dispatcher] 结构化输出成功(dict): {len(result['subtasks'])} 个子任务")
            return phase_context, result["subtasks"]
    except NotImplementedError:
        print(f"[Dispatcher] 当前模型不支持 with_structured_output，跳过")
        block_structured_output(model_name)
    except Exception as e:
        error_str = str(e)
        print(f"[Dispatcher] 结构化输出异常: {e}")
        # 检测 thinking 模式不支持 tool_choice 的错误，加入全局黑名单
        if "tool_choice" in error_str and "thinking" in error_str:
            print(f"[Dispatcher] 检测到 thinking 模式不兼容，将 {model_name} 加入黑名单")
            block_structured_output(model_name)
    return "", None


def _build_dispatcher_prompt(phase: dict, state: dict, vector_context: str = "") -> str:
    """
    构建 Dispatcher 的用户 prompt

    注入完整上下文（用户需求 + 前序产出物 + 对话历史关键内容 + 向量库文献），
    让 Dispatcher LLM 能提取出高质量的 phase_context 和 guidance。

    Args:
        phase: 当前阶段定义
        state: 当前 State
        vector_context: 向量库检索到的文献资料（可为空）

    Returns:
        格式化的用户 prompt
    """
    from langchain_core.messages import AIMessage, HumanMessage

    parts = []

    # === 1. 当前阶段信息 ===
    parts.append(f"## 当前阶段")
    parts.append(f"- 阶段 ID: {phase.get('id', '?')}")
    parts.append(f"- 名称: {phase.get('name', '?')}")
    parts.append(f"- 描述: {phase.get('description', '?')}")
    parts.append(f"- 执行方式: {phase.get('method', 'executor')}")

    skill = phase.get("skill")
    if skill:
        parts.append(f"- 技能: {skill}")

    # === 2. Pipeline 全局信息（含所有阶段概览） ===
    pipeline = state.get("pipeline", {})
    phases = pipeline.get("phases", [])
    current = state.get("current_phase", 0)
    parts.append(f"\n## Pipeline 全局信息")
    parts.append(f"- 领域: {pipeline.get('domain', '?')}")
    parts.append(f"- 当前阶段: {current + 1}/{len(phases)}")
    # 阶段概览（让 Dispatcher 看到全局结构）
    if phases:
        parts.append("- 阶段概览:")
        for i, p in enumerate(phases):
            marker = " 👈 当前" if i == current else (" ✅" if i < current else "")
            parts.append(f"  {i + 1}. {p.get('name', '?')} — {p.get('description', '?')}{marker}")

    # === 3. 对话历史中的关键上下文（用户需求 + 交互确认 + 前序产出物） ===
    messages = state.get("messages", [])
    context_parts = _extract_conversation_context(messages, phases, current)
    if context_parts:
        parts.append(f"\n## 对话历史关键内容（请从中提取 phase_context）")
        parts.append(context_parts)

    # === 4. 向量库文献资料（如有） ===
    if vector_context:
        parts.append(f"\n## 向量知识库检索结果\n以下是从已入库文献中检索到的相关片段，请在 phase_context 中包含这些文献资料的摘要，并在各子任务的 guidance 中指明可用的文献支撑。\n{vector_context}")

    # === 5. 执行提示 ===
    if phase.get("method") == "executor_parallel":
        parts.append(f"\n⚡ 该阶段支持并行执行，请尽量拆分为可并行的子任务。")
    elif phase.get("method") == "executor_sequential":
        parts.append(
            f"\n🔗 该阶段为串行执行模式，子任务将按顺序逐个执行。"
            f"\n每个子任务能读取前面子任务的产出文件，因此必须严格顺序排列（每个子任务独立 parallel_group）。"
            f"\n后续子任务的 guidance 中应明确指出需要与前面子任务保持一致的内容（章节编号、引用编号、术语等）。"
        )

    parts.append("\n请根据以上信息，输出包含 phase_context 和 subtasks 的 JSON 对象。"
                 "\nphase_context 必须从上方对话历史中提取实际内容，不要编造。"
                 "\n每个子任务的 guidance 必须基于实际上下文给出具体指导。")

    return "\n".join(parts)


# 对话历史中提取的最大字符数（防止 token 超限）
_MAX_CONTEXT_CHARS = 6000


def _extract_conversation_context(
    messages: list, phases: list, current_phase: int
) -> str:
    """
    从对话历史中提取关键上下文，供 Dispatcher LLM 理解全貌。

    提取策略：
    1. 用户所有 HumanMessage（需求、补充、确认）
    2. 前序阶段的 AIMessage 产出物（通过阶段推进标记定位）
    3. 总量控制在 _MAX_CONTEXT_CHARS 以内

    Args:
        messages: 全部消息列表
        phases: 所有阶段定义
        current_phase: 当前阶段索引

    Returns:
        格式化的上下文文本
    """
    from langchain_core.messages import AIMessage, HumanMessage

    parts = []
    total_chars = 0

    # --- 用户消息（需求 + 补充 + 确认） ---
    user_parts = []
    for msg in messages:
        if not isinstance(msg, HumanMessage):
            continue
        content = ensure_str_content(msg.content)
        # 跳过系统注入消息
        if content.startswith("[系统通知]") or content.startswith("[用户反馈]"):
            continue
        if len(content) > 10:  # 跳过极短消息
            user_parts.append(content[:800])  # 每条最多 800 字符

    if user_parts:
        user_text = "\n---\n".join(user_parts[:5])  # 最多 5 条用户消息
        if len(user_text) > 2000:
            user_text = user_text[:2000] + "\n... (已截断)"
        parts.append(f"### 用户需求和交互记录\n{user_text}")
        total_chars += len(user_text)

    # --- 前序阶段产出物 ---
    if current_phase > 0 and total_chars < _MAX_CONTEXT_CHARS:
        # 找阶段推进标记位置
        phase_boundaries = []  # [(phase_idx, msg_list_index)]
        for idx, msg in enumerate(messages):
            if not isinstance(msg, AIMessage):
                continue
            content = ensure_str_content(msg.content)
            if content.startswith("✅ Phase ") and "完成" in content:
                try:
                    phase_num = int(content.split("Phase ")[1].split(" ")[0].split("(")[0])
                    phase_boundaries.append((phase_num - 1, idx))
                except (ValueError, IndexError):
                    pass

        prev_parts = []
        for phase_idx in range(current_phase):
            if total_chars >= _MAX_CONTEXT_CHARS:
                break
            p = phases[phase_idx] if phase_idx < len(phases) else {}
            p_name = p.get("name", f"Phase {phase_idx + 1}")

            # 找该阶段推进标记位置
            boundary_idx = None
            for b_phase, b_msg_idx in phase_boundaries:
                if b_phase == phase_idx:
                    boundary_idx = b_msg_idx
                    break

            if boundary_idx is None:
                prev_parts.append(f"**Phase {phase_idx + 1} ({p_name})**：（产出物不可用）")
                continue

            # 在推进标记之前向回搜索实质性 AIMessage
            output_text = ""
            for search_idx in range(boundary_idx - 1, max(boundary_idx - 15, -1), -1):
                msg = messages[search_idx]
                if not isinstance(msg, AIMessage):
                    continue
                content = ensure_str_content(msg.content)
                if (content.startswith("✅ Phase") or content.startswith("🔄")
                        or content.startswith("⏭️") or content.startswith("🛑")):
                    continue
                if len(content) > 50:
                    output_text = content
                    break

            if output_text:
                remaining = _MAX_CONTEXT_CHARS - total_chars
                truncated = output_text[:min(2000, remaining)]
                if len(output_text) > len(truncated):
                    truncated += "\n... (已截断)"
                prev_parts.append(f"**Phase {phase_idx + 1} ({p_name}) 产出物**：\n{truncated}")
                total_chars += len(truncated)
            else:
                prev_parts.append(f"**Phase {phase_idx + 1} ({p_name})**：{p.get('description', '?')} — ✅ 已完成")

        if prev_parts:
            parts.append(f"### 前序阶段产出物\n" + "\n\n".join(prev_parts))

    return "\n\n".join(parts) if parts else ""


def _parse_dispatch_json(text: str) -> tuple[str, Optional[list[dict]]]:
    """
    从 LLM 输出中提取 Dispatcher 结果（支持新对象格式和旧数组格式）

    新格式: {"phase_context": "...", "subtasks": [...]}
    旧格式: [{...}, ...]（向后兼容）

    Args:
        text: LLM 原始输出

    Returns:
        (phase_context, subtasks) 元组，失败时返回 ("", None)
    """
    if not text:
        return "", None

    import re

    def _extract_result(parsed) -> tuple[str, Optional[list[dict]]]:
        """从解析结果中提取 (phase_context, subtasks)"""
        # 新格式：{"phase_context": "...", "subtasks": [...]}
        if isinstance(parsed, dict) and "subtasks" in parsed:
            ctx = parsed.get("phase_context", "") or ""
            subs = parsed["subtasks"]
            if isinstance(subs, list) and len(subs) > 0:
                return ctx, subs
        # 旧格式：[{...}, ...]（向后兼容，无 phase_context）
        if isinstance(parsed, list) and len(parsed) > 0:
            return "", parsed
        return "", None

    # 尝试 1：直接解析
    try:
        result = json.loads(text.strip())
        ctx, subs = _extract_result(result)
        if subs is not None:
            return ctx, subs
    except json.JSONDecodeError:
        pass

    # 尝试 2：提取 ```json ``` 代码块
    json_block = re.search(r'```(?:json)?\s*\n(.*?)\n\s*```', text, re.DOTALL)
    if json_block:
        try:
            result = json.loads(json_block.group(1).strip())
            ctx, subs = _extract_result(result)
            if subs is not None:
                return ctx, subs
        except json.JSONDecodeError:
            pass

    # 尝试 3：找第一个 { 到最后一个 }（新对象格式）
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace >= 0 and last_brace > first_brace:
        try:
            result = json.loads(text[first_brace:last_brace + 1])
            ctx, subs = _extract_result(result)
            if subs is not None:
                return ctx, subs
        except json.JSONDecodeError:
            pass

    # 尝试 4：找第一个 [ 到最后一个 ]（旧数组格式兼容）
    first_bracket = text.find("[")
    last_bracket = text.rfind("]")
    if first_bracket >= 0 and last_bracket > first_bracket:
        try:
            result = json.loads(text[first_bracket:last_bracket + 1])
            if isinstance(result, list) and len(result) > 0:
                return "", result
        except json.JSONDecodeError:
            pass

    print(f"[Dispatcher] 无法解析子任务 JSON，原始输出前 300 字符: {text[:300]}")
    return "", None
