"""
OpenSys Advisor 顾问节点

Advisor 是多代理协作架构中的"战略层"，负责：
1. 分析 advisor_context（Agent 总结的工作交接单）
2. 匹配最合适的 workflow 模板（或使用通用模板）
3. 裁剪模板阶段（跳过不需要的步骤）
4. 产出结构化 pipeline（JSON）
5. interrupt 让用户确认后写入 State

使用 Tier 1 最强模型（COMPLEX_MODEL_NAME），因为规划质量直接决定整个流程的方向。
"""

import json
import os
from typing import Optional, Union

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.types import interrupt
from ..utils import ensure_str_content

from pydantic import BaseModel, Field

from ..model_manager import get_llm, get_base_llm, is_structured_output_blocked, block_structured_output
from ..workflow_loader import discover_workflows, load_workflow, format_workflows_for_advisor
from ..skill_loader import format_skills_for_advisor
from .. import config


# ==================== 结构化输出 Schema ====================

class PhaseSchema(BaseModel):
    """Pipeline 单阶段的结构化 schema"""
    id: Union[int, str] = Field(description="阶段编号，从 1 开始递增")
    name: str = Field(description="阶段英文名（小写），如 understand, research, execute")
    description: str = Field(description="阶段描述（中文），说明这一步具体做什么")
    method: str = Field(description="执行方式：agent/browser/executor/executor_parallel/executor_sequential/reviewer")
    skill: Optional[str] = Field(default=None, description="技能 ID 或 null")
    required: bool = Field(default=True, description="是否为必须阶段")
    review: bool = Field(default=True, description="是否需要 Reviewer 审查")
    url: Optional[str] = Field(default=None, description="仅 browser 阶段：目标网址")
    details: Optional[str] = Field(default=None, description="仅 browser 阶段：操作细节")
    browser_skill: Optional[str] = Field(default=None, description="仅 browser 阶段：匹配的浏览器技能 ID")


class PipelineSchema(BaseModel):
    """Advisor 输出的完整 pipeline 结构化 schema"""
    domain: str = Field(description="领域标识，如 content_creation, software_dev, general")
    template_used: str = Field(description="主要参考的模板文件名；跨模板组合填 mixed；完全自定义填 general")
    phases: list[PhaseSchema] = Field(description="执行阶段列表")


# ==================== Advisor System Prompt ====================

ADVISOR_SYSTEM_PROMPT = """你是 OpenSys 的任务规划顾问（Advisor），负责为复杂任务制定结构化执行计划。

## 你的职责
1. 分析用户需求和背景，判断任务所属领域
2. 从可用的工作流模板中选择最匹配的模板
3. 根据具体需求裁剪模板（跳过不必要的阶段）
4. 产出结构化的 pipeline（JSON 格式）

## 可用工作流模板

{workflow_table}

## 可用技能

{skills_table}

## 规划规则
- 如果任务只涉及单一领域，优先使用最匹配的专用模板（继承其 method、skill 定义）
- **如果任务跨越多个领域**（如"先采集数据再写报告"），你可以从多个模板中借鉴阶段，自由组合成一条新流水线。例如：从 web-research 模板借鉴 browser 采集阶段，从 content-creation 模板借鉴 executor 写作阶段，拼接为一条完整流程
- 如果没有匹配的专用模板，使用"通用工作流"并自行填充每个阶段的描述
- 你也可以完全自定义阶段（不依赖任何模板），只要 method 和 skill 选择合理即可
- 可以删除模板中 required=false 的阶段（如果该任务不需要）
- 不可删除 required=true 的阶段（仅当你严格继承某个模板时）
- method 说明：
  - agent: 主代理亲自执行（需要用户交互的阶段，如确认需求、交付成果、撰写报告）
  - browser: 浏览器子代理执行（需要真实浏览器交互的阶段：登录、填表、JS 动态页面、数据采集等）
    **browser 阶段必须提供**：
    - `url`: 目标网址（必填，明确的起始 URL，如 https://mail.qq.com）
    - `details`: 操作细节（必填，具体说明要做什么，包括收件人、内容、采集字段、下载路径等）
    - 禁止写宽泛的 description 如"使用浏览器采集数据"，必须具体到"登录 XX 网站，搜索 XX 关键词，提取 XX 数据字段"
    - 当设计到本地文件读取内容的时候，你要给文件的路径
    - **关键约束注入**：如果上方"浏览器技能"中有与该 browser 阶段 URL 匹配的技能，且该技能标注了「关键约束」，你**必须**将这些约束逐条写入 `details` 字段（这些约束会被直接传递给浏览器 Agent 作为强制规则）
    - **`browser_skill`**：从上方"浏览器技能"列表中，根据目标 URL 前缀匹配对应的 skill ID 填入（如 `wechat-article`）。如果没有匹配的浏览器技能，填 null。系统会自动加载该技能的完整操作规则注入给浏览器 Agent
  - executor: 子代理执行（不需要交互的执行任务）
  - executor_parallel: 子代理并行执行（可拆分为独立子任务的阶段）
  - executor_sequential: 子代理串行执行（子任务按顺序逐个执行，后续子任务能读取前面的产出文件，适合需要全局一致性的任务如论文写作、长文档生成）
  - reviewer: 审查子代理执行（检查产出物质量）
- **涉及网站浏览器操作（登录、填表、JS 动态页面、文件下载）的阶段必须使用 method: browser**
- **browser 阶段必须搭配浏览器技能**：`browser_skill` 字段必须从上方"浏览器技能"列表中选择一个匹配的 skill ID。如果没有任何浏览器技能与该阶段匹配，则**禁止使用 method: browser**，改用 agent/executor + 合适的执行类技能
- **⛔ 禁止用 browser 进行信息搜索/调研**：在搜索引擎（Google、百度、Bing 等）中搜索关键字获取信息是**严格禁止**的 browser 用法。信息调研、数据收集、素材搜集等任务必须使用 method: agent 或 executor，搭配 `content-research` 等调研类技能（这些技能内部通过 `web_tool` 搜索和提取信息，效率远高于浏览器）。browser 仅用于**必须真实浏览器交互**的场景（登录认证、JS 动态渲染、表单提交、文件下载等）
- **skill 字段**：从上方"可指定技能"表中选择匹配的 skill ID 填入，没有合适的填 null
- reviewer 类技能由系统自动匹配，无需指定
- **内容创作配图**：当用户需求中涉及"配图"、"插图"、"图文并茂"、"生成图片"等配图要求时，写作阶段（content-writing）会自动产出 `drafts/image_requirements.json` 配图需求文件。你需要在写作阶段（Execute）之后、审查阶段（Verify）之前，追加一个 `method: browser` + `browser_skill: doubao-image` 的配图生成阶段。该阶段的 `details` 必须写明：`读取前序写作阶段产出的 drafts/image_requirements.json 文件，按文件中的每条配图需求逐一生成图片（提示词、比例、风格均在文件中定义）`。这样写作 Executor 负责决定"需要什么图"，浏览器 Agent 负责"去豆包生成图"

## 审查控制（review 字段）
每个阶段可以通过 `review` 字段控制是否需要 Reviewer 审查：
- `review: true`（默认）— 阶段完成后由 Reviewer 审查产出物质量，不通过则返工
- `review: false` — 跳过审查，阶段完成后直接推进到下一阶段

**建议设置 review: false 的阶段**：
- 环境准备、信息收集等辅助性阶段
- 需求确认、用户交互等 method=agent 的阶段
- 简单的中间步骤（如数据清洗、格式转换）

**建议保留 review: true 的阶段**：
- 核心产出阶段（代码编写、报告撰写、方案设计等）
- 最终交付阶段
- 质量要求高的阶段

## 输出格式
你必须输出一个 JSON 对象，格式如下（不要输出任何其他内容，只输出 JSON）：

```json
{{
  "domain": "领域标识（如 content_creation, software_dev, general）",
  "template_used": "主要参考的模板文件名（如 content-creation）；跨模板组合填 mixed；完全自定义填 general",
  "phases": [
    {{
      "id": 1,
      "name": "阶段英文名（小写）",
      "description": "阶段描述（中文，说明这一步具体做什么）",
      "method": "agent/browser/executor/executor_parallel/executor_sequential/reviewer",
      "skill": "技能ID或null",
      "required": true,
      "review": true,
      "url": "（仅 browser 阶段必填）目标网址，如 https://mail.qq.com",
      "details": "（仅 browser 阶段必填）操作细节：登录账号、发送邮件给 xxx@xx.com、标题为 XX、内容为 XX",
      "browser_skill": "（仅 browser 阶段）匹配的浏览器技能 skill ID，如 wechat-article，无匹配填 null"
    }}
  ]
}}
```
"""


# ==================== Advisor 节点函数 ====================

async def advisor_node(state: dict) -> dict:
    """
    Advisor 顾问节点：分析需求 → 选模板 → 裁剪 → 产出 pipeline → interrupt 确认

    执行流程：
    1. 从 State 读取 advisor_context
    2. 扫描 data/workflows/ 获取所有模板摘要
    3. 构建 Advisor prompt（含模板列表 + advisor_context）
    4. 调用 Tier 1 LLM 生成 pipeline
    5. interrupt 让用户确认
    6. 根据用户回复更新 State

    Returns:
        State 更新字典
    """
    # === 死循环兜底：Advisor 调用次数检查 ===
    call_count = state.get("_advisor_call_count", 0) + 1

    if call_count > config.ADVISOR_MAX_CALLS_PER_SESSION:
        # 超限：拒绝继续规划，escalate 到用户
        return {
            "advisor_called": True,
            "needs_replan": False,
            "advisor_context": None,
            "_advisor_call_count": call_count,
            "messages": [AIMessage(
                content=(
                    f"⚠️ 已尝试规划 {call_count - 1} 次但执行均遇到问题。\n"
                    "建议重新描述需求或简化任务范围。"
                )
            )],
        }

    advisor_context = state.get("advisor_context", {})
    if not advisor_context:
        # 没有 advisor_context，不应该到这里，回退
        return {
            "advisor_called": True,
            "advisor_context": None,
            "_advisor_call_count": call_count,
        }

    # === 第一步：获取所有可用模板摘要 ===
    workflow_summaries = discover_workflows()
    workflow_table = format_workflows_for_advisor(workflow_summaries)

    # === 第二步：构建 Advisor prompt ===
    # === 获取可用技能摘要 ===
    skills_table = format_skills_for_advisor()
    if not skills_table:
        skills_table = "暂无可用技能，所有 phase.skill 填 null"

    system_prompt = ADVISOR_SYSTEM_PROMPT.format(
        workflow_table=workflow_table,
        skills_table=skills_table,
    )

    user_prompt = _build_advisor_user_prompt(advisor_context)

    # === 第三步：调用 Tier 1 LLM ===
    # ADVISOR_MODEL_NAME 优先；未设置时 fallback 到 COMPLEX_MODEL_NAME
    # 使用 get_base_llm（不带工具绑定和 RunnableRetry 包装）：
    #   1. 支持 with_structured_output（RunnableRetry 不支持）
    #   2. 通过 bind(max_tokens=16384) 覆盖默认的 4096，避免 pipeline JSON 截断
    _advisor_model = config.ADVISOR_MODEL_NAME or config.COMPLEX_MODEL_NAME
    advisor_llm = get_base_llm(_advisor_model).bind(max_tokens=16384)
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ]

    # === 第四步：调用 LLM 生成 pipeline ===
    # 优先尝试 with_structured_output 强制结构化输出，失败再 fallback 到手动解析
    pipeline = await _invoke_structured_advisor(advisor_llm, messages, _advisor_model)

    if not pipeline:
        # 结构化输出不可用或失败，fallback 到普通调用 + 手动 JSON 解析
        print(f"[Advisor] 结构化输出未获得结果，fallback 到普通调用...")
        response = await advisor_llm.ainvoke(messages)
        # Anthropic 返回 list 格式 content，需统一转为 str
        response_text = ensure_str_content(response.content) if hasattr(response, "content") else str(response)
        pipeline = _parse_pipeline_json(response_text)

    if not pipeline:
        # 解析失败，通知用户
        return {
            "advisor_called": True,
            "advisor_context": None,
            "_advisor_call_count": call_count,
            "messages": [AIMessage(content=(
                "抱歉，规划生成失败，无法解析为有效的 pipeline。"
                "我将直接处理这个任务，不使用多阶段流程。"
            ))],
        }

    # === 第五步：校验并自动修正 browser method ===
    browser_fixes = _fix_browser_method(pipeline)
    if browser_fixes:
        print(f"[Advisor] browser method 校验完成，共 {len(browser_fixes)} 条修正/警告")

    # === 第六步：格式化 pipeline 展示给用户 ===
    display_text = _format_pipeline_for_display(pipeline)

    # === 第七步：interrupt 让用户确认（无人值守模式自动确认） ===
    if state.get("unattended"):
        auto_count = state.get("_unattended_auto_count", 0) + 1
        # 超限保护：强制拒绝 pipeline
        if auto_count > config.UNATTENDED_MAX_AUTO_INTERRUPTS:
            print(f"[Advisor] 无人值守模式超限 ({auto_count})，强制拒绝 pipeline")
            return {
                "advisor_called": True,
                "advisor_context": None,
                "_advisor_call_count": call_count,
                "_unattended_auto_count": auto_count,
                "messages": [AIMessage(content="🛑 无人值守模式自动处理次数超限，终止规划。")],
            }
        print(f"[Advisor] 无人值守模式，自动确认 pipeline ({len(pipeline.get('phases', []))} 阶段) [{auto_count}/{config.UNATTENDED_MAX_AUTO_INTERRUPTS}]")
        action = "approved"
    else:
        user_response = interrupt({
            "type": "pipeline_confirmation",
            "pipeline": pipeline,
            "display": display_text,
            "options": ["确认执行", "提出修改意见", "拒绝（不使用流程）"],
        })

        # === 第八步：根据用户回复更新 State ===
        # 支持三种动作：approved / revise（含 feedback）/ rejected
        _user_feedback = ""
        if isinstance(user_response, dict):
            action = user_response.get("action", "rejected")
            _user_feedback = user_response.get("feedback", "")
        elif isinstance(user_response, str):
            _input = user_response.strip()
            _input_lower = _input.lower()
            if _input_lower in ("确认执行", "确认", "y", "yes", "ok", "approved", "是"):
                action = "approved"
            elif _input_lower in ("拒绝", "拒绝（不使用流程）", "n", "no", "rejected", "否"):
                action = "rejected"
            else:
                # 用户输入了其他内容 → 当作修改意见
                action = "revise"
                _user_feedback = _input
        else:
            action = "rejected"

    # === 用户提出修改意见 → 将意见注入 advisor_context，重新触发 Advisor ===
    if action == "revise":
        # 保留原始 advisor_context，追加用户修改意见
        revision_context = dict(advisor_context)  # 浅拷贝
        # 累积修改意见（多轮修改时不丢失之前的意见）
        prev_revisions = revision_context.get("user_revisions", "")
        if prev_revisions:
            revision_context["user_revisions"] = f"{prev_revisions}\n---\n{_user_feedback}"
        else:
            revision_context["user_revisions"] = _user_feedback

        print(f"[Advisor] 用户提出修改意见，将重新规划：{_user_feedback[:100]}")

        return {
            "advisor_called": False,  # 重置，允许再次进入 advisor_node
            "advisor_context": revision_context,
            "needs_replan": True,  # 触发 pipeline_router → advisor 回路
            "_advisor_call_count": call_count,
            "messages": [AIMessage(content=(
                f"📝 收到您的修改意见，正在重新规划...\n\n"
                f"> {_user_feedback}"
            ))],
        }

    if action == "approved":
        # 无人值守模式已在上面 +1 计数；非无人值守模式保持原值
        _auto_cnt = state.get("_unattended_auto_count", 0)
        if state.get("unattended"):
            _auto_cnt += 1  # 与上面 auto_count 同步（此处兜底，防止分支遗漏）

        # === adjust 增量模式：拼接已完成阶段 + Advisor 新规划的剩余阶段 ===
        _mode = advisor_context.get("mode", "")
        if _mode == "adjust":
            old_pipeline = state.get("pipeline", {})
            old_phases = old_pipeline.get("phases", [])
            adjust_from = advisor_context.get("adjust_from_phase", 0)

            # 保留已完成阶段（Phase 1 ~ adjust_from）
            kept_phases = old_phases[:adjust_from]
            # Advisor 新规划的剩余阶段
            new_phases = pipeline.get("phases", [])

            # 重新编号：已完成阶段保持原 id，新阶段从 adjust_from + 1 开始
            for i, p in enumerate(new_phases):
                p["id"] = adjust_from + 1 + i

            # 拼接为完整 pipeline
            merged_phases = kept_phases + new_phases
            pipeline["phases"] = merged_phases

            # current_phase 从 adjust_from 开始（即第一个新阶段）
            resume_phase = adjust_from
            total = len(merged_phases)
            print(
                f"[Advisor] adjust 增量模式：保留 {len(kept_phases)} 个已完成阶段，"
                f"新增 {len(new_phases)} 个剩余阶段，共 {total} 阶段，"
                f"从 Phase {resume_phase + 1} 继续执行"
            )

            return {
                "advisor_called": True,
                "advisor_context": None,
                "_advisor_call_count": call_count,
                "_unattended_auto_count": _auto_cnt,
                "pipeline": pipeline,
                "current_phase": resume_phase,
                "phase_status": "pending",
                "needs_replan": False,
                "review_result": None,
                "review_feedback": None,
                "_review_subtask_feedback": None,
                "subtasks": None,
                "_rework_count": 0,
                "_phase_attempt_count": 0,
                "_agent_phase_tool_rounds": 0,
                "messages": [AIMessage(content=(
                    f"🔧 后续步骤已调整，保留已完成的 {len(kept_phases)} 个阶段，"
                    f"新规划 {len(new_phases)} 个剩余阶段，共 {total} 阶段。\n\n"
                    f"{display_text}\n\n"
                    f"从 Phase {resume_phase + 1} 继续执行。"
                ))],
            }

        # === 全量模式（首次规划 / replan）===
        # 用户确认 → pipeline 写入 State
        # 重置所有 pipeline 内部计数器，确保旧 pipeline 残留值不影响新 pipeline

        # 任务目录：replan 时复用已有目录（避免文件路径断裂），首次规划才创建新目录
        existing_task_dir = state.get("_task_dir", "")
        if existing_task_dir and os.path.isdir(existing_task_dir):
            task_dir = existing_task_dir
            print(f"[Advisor] replan 复用已有任务目录: {task_dir}")
        else:
            task_dir = _create_task_dir(pipeline, advisor_context)

        return {
            "advisor_called": True,
            "advisor_context": None,  # 已处理，清空
            "_advisor_call_count": call_count,
            "_unattended_auto_count": _auto_cnt,
            "_task_dir": str(task_dir),
            "pipeline": pipeline,
            "current_phase": 0,
            "phase_status": "pending",
            "needs_replan": False,
            "review_result": None,
            "review_feedback": None,
            "_review_subtask_feedback": None,
            "subtasks": None,
            "_rework_count": 0,
            "_phase_attempt_count": 0,
            "_agent_phase_tool_rounds": 0,
            "messages": [AIMessage(content=(
                f"✅ 执行计划已确认，共 {len(pipeline.get('phases', []))} 个阶段。\n\n"
                f"{display_text}\n\n"
                f"任务输出目录：`{task_dir}`\n\n"
                "现在开始执行第一阶段。"
            ))],
        }
    else:
        # 用户拒绝 → 不使用流水线，回到正常模式
        return {
            "advisor_called": True,
            "advisor_context": None,
            "_advisor_call_count": call_count,
            "pipeline": None,
            "messages": [AIMessage(content=(
                "好的，不使用多阶段流程。我将直接处理这个任务。"
            ))],
        }


# ==================== 辅助函数 ====================


def _create_task_dir(pipeline: dict, advisor_context: dict) -> str:
    """
    为 pipeline 创建独立任务目录（时间戳 + 标题摘要）

    从 pipeline.domain 或 advisor_context.user_request 中提取标题摘要。

    Args:
        pipeline: Advisor 产出的 pipeline dict
        advisor_context: 用户需求上下文

    Returns:
        任务目录的绝对路径字符串
    """
    # 提取标题摘要：优先用 pipeline domain，其次用 user_request
    task_name = pipeline.get("domain", "")
    if not task_name and advisor_context:
        user_req = advisor_context.get("user_request", "")
        # 取第一行、前 30 字符
        task_name = user_req.split("\n")[0][:30] if user_req else ""

    task_dir = config.get_task_dir(task_name)
    print(f"[Advisor] 创建任务目录: {task_dir}")
    return str(task_dir)


def _build_advisor_user_prompt(advisor_context: dict) -> str:
    """
    构建 Advisor 的用户 prompt（包含 advisor_context 的结构化信息）

    Args:
        advisor_context: Agent 总结的工作交接单

    Returns:
        格式化的用户 prompt 文本
    """
    parts = []

    parts.append(f"## 用户需求\n{advisor_context.get('user_request', '未知')}")

    background = advisor_context.get("background", "")
    if background:
        parts.append(f"## 背景信息\n{background}")

    constraints = advisor_context.get("constraints", [])
    if constraints:
        parts.append(f"## 约束条件\n" + "\n".join(f"- {c}" for c in constraints))

    existing_progress = advisor_context.get("existing_progress", "")
    if existing_progress:
        parts.append(f"## 已完成的进度\n{existing_progress}")

    replan_reason = advisor_context.get("replan_reason", "")
    if replan_reason:
        parts.append(f"## 重新规划原因\n{replan_reason}")

    # 用户修改意见（在 pipeline 确认时提出，优先级高于其他信息）
    user_revisions = advisor_context.get("user_revisions", "")
    if user_revisions:
        parts.append(
            f"## ⚠️ 用户修改意见（必须严格遵守）\n"
            f"用户对上一次规划方案提出了修改意见，你**必须根据以下意见调整规划**：\n\n"
            f"{user_revisions}\n\n"
            f"请在保持整体任务目标不变的前提下，按照用户意见修改相应的阶段。"
        )

    # adjust 增量模式：提供原剩余阶段信息，明确只需规划剩余部分
    mode = advisor_context.get("mode", "")
    remaining_phases = advisor_context.get("remaining_phases", "")
    if mode == "adjust":
        adjust_from = advisor_context.get("adjust_from_phase", 0)
        parts.append(
            f"## ⚠️ 增量调整模式\n"
            f"**请注意：这是增量调整，不是全量重规划。**\n"
            f"Phase 1~{adjust_from} 已完成且产出物可用，你**只需要规划 Phase {adjust_from + 1} 及之后的阶段**。\n"
            f"输出的 JSON 中 phases 数组**只包含新的剩余阶段**（id 从 {adjust_from + 1} 开始编号），"
            f"系统会自动拼接到已完成阶段后面。"
        )
        if remaining_phases:
            parts.append(f"### 原剩余阶段（供参考，可以修改/删除/新增）\n{remaining_phases}")
        parts.append("\n请根据以上信息，生成**仅包含剩余阶段**的 pipeline JSON。")
    else:
        parts.append("\n请根据以上信息，选择最合适的工作流模板并生成 pipeline JSON。")

    return "\n\n".join(parts)


async def _invoke_structured_advisor(llm, messages: list, model_name: str = "") -> Optional[dict]:
    """
    使用 with_structured_output 强制 LLM 输出结构化 pipeline

    优先使用此方式获取 pipeline，失败时返回 None 由调用方 fallback 到手动解析。

    Args:
        llm: 基础 LLM 实例
        messages: 消息列表
        model_name: 模型名称（用于全局黑名单缓存）

    Returns:
        解析后的 pipeline 字典，失败时返回 None
    """
    # 检查全局黑名单：该模型之前已确认不支持 structured_output
    if is_structured_output_blocked(model_name):
        print(f"[Advisor] 模型 {model_name} 在黑名单中，跳过 structured_output")
        return None

    try:
        structured_llm = llm.with_structured_output(PipelineSchema)
        result = await structured_llm.ainvoke(messages)
        # Pydantic 对象 → dict
        if result and isinstance(result, PipelineSchema):
            pipeline = result.model_dump()
            # 将 phase 中的 None skill 转为实际 None（Pydantic 序列化可能保留 None）
            print(f"[Advisor] 结构化输出成功: {len(pipeline.get('phases', []))} 个阶段")
            return pipeline
        # 有些模型返回 dict
        if result and isinstance(result, dict):
            if _validate_pipeline(result):
                print(f"[Advisor] 结构化输出成功(dict): {len(result.get('phases', []))} 个阶段")
                return result
    except NotImplementedError:
        print(f"[Advisor] 当前模型不支持 with_structured_output，跳过")
        block_structured_output(model_name)
    except Exception as e:
        error_str = str(e)
        print(f"[Advisor] 结构化输出异常: {e}")
        # 检测 thinking 模式不支持 tool_choice 的错误，加入全局黑名单
        if "tool_choice" in error_str and "thinking" in error_str:
            print(f"[Advisor] 检测到 thinking 模式不兼容，将 {model_name} 加入黑名单")
            block_structured_output(model_name)
    return None


def _parse_pipeline_json(text: str) -> Optional[dict]:
    """
    从 LLM 输出中提取 pipeline JSON

    尝试多种方式解析：
    1. 直接 json.loads（LLM 输出纯 JSON）
    2. 提取 ```json ``` 代码块（支持多个代码块，逐一尝试）
    3. 提取 { } 之间的内容

    兼容 LLM 常见偏差：
    - 用 "pipeline" 代替 "phases" 作为阶段列表键名
    - 输出包含 <think> 思考标签
    - JSON 前后有分析文字

    Args:
        text: LLM 原始输出文本

    Returns:
        解析后的 pipeline 字典，失败返回 None
    """
    if not text:
        return None

    import re

    # 预处理：剥离 <think>...</think> 标签（DeepSeek 等模型的思考过程标签）
    cleaned = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
    cleaned = re.sub(r'<think>.*$', '', cleaned, flags=re.DOTALL).strip()

    # 对清理后文本和原始文本都尝试解析
    for candidate in [cleaned, text.strip()]:
        if not candidate:
            continue

        # 尝试 1：直接解析
        try:
            result = json.loads(candidate)
            if _validate_pipeline(result):
                return result
        except json.JSONDecodeError:
            pass

        # 尝试 2：提取 ```json ``` 代码块（支持多个，逐一尝试）
        json_blocks = re.findall(r'```(?:json)?\s*\n(.*?)\n\s*```', candidate, re.DOTALL)
        for block in json_blocks:
            try:
                result = json.loads(block.strip())
                if _validate_pipeline(result):
                    return result
            except json.JSONDecodeError:
                continue

        # 尝试 3：找到第一个 { 到最后一个 } 之间的内容
        first_brace = candidate.find("{")
        last_brace = candidate.rfind("}")
        if first_brace >= 0 and last_brace > first_brace:
            try:
                result = json.loads(candidate[first_brace:last_brace + 1])
                if _validate_pipeline(result):
                    return result
            except json.JSONDecodeError:
                pass

    print(f"[Advisor] 无法解析 pipeline JSON，原始输出前 500 字符: {text[:500]}")
    return None


def _validate_pipeline(data: dict) -> bool:
    """
    验证 pipeline 结构的基本合法性

    兼容 LLM 常见偏差：
    - 用 "pipeline" 代替 "phases" 作为阶段列表键名 → 自动重映射
    - 用 "stage_id"/"stage_name" 代替 "id"/"name" → 自动重映射

    Args:
        data: 待验证的字典

    Returns:
        True 合法，False 不合法（通过时 data 可能被原地修改以统一键名）
    """
    if not isinstance(data, dict):
        return False

    # 兼容 LLM 用 "pipeline" 代替 "phases" 的情况
    if "phases" not in data and "pipeline" in data:
        data["phases"] = data.pop("pipeline")
        print("[Advisor] 自动修正：将 'pipeline' 键重映射为 'phases'")

    if "phases" not in data:
        return False
    phases = data["phases"]
    if not isinstance(phases, list) or len(phases) == 0:
        return False
    # 每个 phase 至少要有 id, name, method
    for phase in phases:
        if not isinstance(phase, dict):
            return False
        # 兼容 stage_id/stage_name → id/name
        if "stage_id" in phase and "id" not in phase:
            phase["id"] = phase.pop("stage_id")
        if "stage_name" in phase and "name" not in phase:
            phase["name"] = phase.pop("stage_name")
        if "id" not in phase or "name" not in phase or "method" not in phase:
            return False
    return True


# 浏览器操作关键词：phase.description 或 phase.details 包含这些词时，method 应该是 browser
_BROWSER_HINT_KEYWORDS = [
    # 中文
    "登录", "注册", "填写表单", "浏览器", "操作页面", "打开网页",
    "采集数据", "爬取", "抓取", "抖音", "算数指数", "创作者平台",
    "发邮件", "发送邮件", "收邮件", "邮箱", "公众号", "发布文章",
    "下载文件", "上传文件", "网盘",
    # 英文
    "login", "sign in", "sign up", "browser", "scrape", "crawl",
]

# URL 正则：description/details 中出现 https:// 链接的，大概率需要 browser
_URL_PATTERN = r'https?://[^\s,，、;；\'")\]]{5,}'


def _fix_browser_method(pipeline: dict) -> list[str]:
    """
    校验并自动修正 browser method：
    如果 phase.description/details 中包含浏览器关键词或 URL，
    但 method 不是 browser，则自动修正为 browser。

    同时检查 browser 阶段是否缺少 url/details 字段，打印警告。

    排除规则：
    - 阶段名包含非操作性关键词（understand/analyze/deliver/plan/verify/review）时，
      不仅仅靠关键词命中就修正——只有 URL + 关键词同时命中才修正。
      防止 "引导用户进行浏览器登录" 这种描述性语句误触发。

    Args:
        pipeline: 已解析的 pipeline 字典（会被原地修改）

    Returns:
        修正日志列表（每条记录一次修正或警告）
    """
    import re

    # 非操作性阶段名关键词：这些阶段通常只是"描述"浏览器操作，不实际执行
    _NON_ACTION_PHASE_NAMES = [
        "understand", "analyze", "deliver", "plan", "verify",
        "review", "summarize", "prepare", "confirm",
    ]

    fixes = []
    phases = pipeline.get("phases", [])

    for phase in phases:
        method = phase.get("method", "")
        desc = ((phase.get("description") or "") + " " + (phase.get("details") or "")).lower()
        phase_name = phase.get("name", f"Phase {phase.get('id', '?')}")
        phase_name_lower = phase_name.lower()

        # 判断是否为非操作性阶段（只描述不执行的阶段）
        is_non_action = any(na in phase_name_lower for na in _NON_ACTION_PHASE_NAMES)

        # === 检查 1：应该是 browser 但 method 不对 ===
        if method != "browser":
            # 关键词命中检查
            keyword_hits = [kw for kw in _BROWSER_HINT_KEYWORDS if kw.lower() in desc]
            # URL 命中检查
            url_hits = re.findall(_URL_PATTERN, desc)

            should_be_browser = False
            reason = ""

            if keyword_hits and url_hits:
                # 同时有关键词和 URL → 高置信度，自动修正（不受阶段名限制）
                should_be_browser = True
                reason = f"关键词({','.join(keyword_hits[:2])}) + URL({url_hits[0][:30]})"
            elif url_hits and any(kw.lower() in desc for kw in ["登录", "采集", "发邮件", "发送邮件", "浏览器", "login", "scrape"]):
                # URL + 强浏览器动作 → 自动修正（不受阶段名限制）
                should_be_browser = True
                reason = f"URL({url_hits[0][:30]}) + 浏览器动作"
            elif len(keyword_hits) >= 3 and not is_non_action:
                # 3 个以上浏览器关键词 + 非描述性阶段 → 自动修正
                # 阈值从 2 提高到 3，且排除 understand/analyze 等阶段
                should_be_browser = True
                reason = f"多个浏览器关键词({','.join(keyword_hits[:3])})"

            if should_be_browser:
                old_method = method
                phase["method"] = "browser"
                fix_msg = f"[Advisor-校验] Phase '{phase_name}': method {old_method}→browser（原因: {reason}）"
                print(fix_msg)
                fixes.append(fix_msg)

        # === 检查 2：browser 阶段缺少 url/details ===
        if phase.get("method") == "browser":
            if not phase.get("url"):
                warn = f"[Advisor-校验] ⚠️ Phase '{phase_name}' 是 browser 阶段但缺少 url 字段"
                print(warn)
                fixes.append(warn)
            if not phase.get("details"):
                warn = f"[Advisor-校验] ⚠️ Phase '{phase_name}' 是 browser 阶段但缺少 details 字段"
                print(warn)
                fixes.append(warn)

        # === 检查 3：browser 阶段没有 browser_skill → 自动降级为 executor + content-research ===
        # 无匹配浏览器技能说明该阶段不需要真实浏览器交互（登录/填表/JS 渲染等），
        # 很可能是信息搜索/调研类任务被错误地设为 browser，降级为 executor 使用 web_tool 效率更高
        if phase.get("method") == "browser" and not phase.get("browser_skill"):
            old_method = phase["method"]
            old_skill = phase.get("skill")
            phase["method"] = "executor"
            phase["skill"] = phase.get("skill") or "content-research"
            fix_msg = (
                f"[Advisor-校验] Phase '{phase_name}': method browser→executor "
                f"(browser_skill 为空，降级为 executor + {phase['skill']})"
            )
            print(fix_msg)
            fixes.append(fix_msg)

    return fixes


def _format_pipeline_for_display(pipeline: dict) -> str:
    """
    将 pipeline 格式化为用户友好的展示文本

    Args:
        pipeline: 结构化 pipeline 字典

    Returns:
        格式化的 Markdown 文本
    """
    domain = pipeline.get("domain", "未知")
    template = pipeline.get("template_used", "无")
    phases = pipeline.get("phases", [])

    method_emoji = {
        "agent": "👤",
        "browser": "🌐",
        "executor": "⚙️",
        "executor_parallel": "⚙️×N",
        "executor_sequential": "⚙️→",
        "reviewer": "🔍",
    }

    lines = [
        f"📋 **执行计划**（领域: {domain}，模板: {template}）\n",
    ]

    for phase in phases:
        emoji = method_emoji.get(phase.get("method", "agent"), "❓")
        required = "必须" if phase.get("required", True) else "可选"
        skill = phase.get("skill") or "无"
        lines.append(
            f"  {phase.get('id', '?')}. {emoji} **{phase.get('name', '?')}** — {phase.get('description', '')}\n"
            f"     执行方式: {phase.get('method', '?')} | 技能: {skill} | {required}"
        )

    return "\n".join(lines)

