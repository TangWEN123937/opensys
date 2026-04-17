"""
OpenSys LangGraph 核心图

定义 AI Agent 的执行流程图：
    用户输入 → LLM 推理 → 风险评估 → [审批] → 工具执行 → LLM 继续/结束

核心节点：
    - agent_node: 调用 LLM 生成回复或工具调用
    - risk_assessment: 评估工具调用的风险等级
    - approval_node: 暂停等待用户审批（使用 interrupt）
    - tool_node: 执行已批准的工具调用

条件路由：
    - agent_router: LLM 输出后判断是结束还是需要调用工具
    - risk_router: 根据风险等级决定直接执行还是走审批
    - approval_router: 审批通过/拒绝/修改后的路由
"""

from typing import Literal

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage, RemoveMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode
from langgraph.types import interrupt, Command

from .state import AgentState
from .tools import all_tools
from .security import assess_risk, format_approval_request
from .context_compression import compress_context, summarize_old_messages
from .vector_store import VectorStoreManager, slice_conversation_turns
from .model_manager import get_llm, get_base_llm, clean_messages, apply_claude_message_cache
from .skill_loader import load_skills_for_prompt
from .task_classifier import needs_planning
from .workflow_loader import discover_workflows, format_workflows_for_agent
from .hooks import run_pre_hooks, run_post_hooks
from .subagents.advisor import advisor_node
from .subagents.browser import browser_node
from .subagents.dispatcher import dispatcher_node
from .subagents.executor import executor_node
from .subagents.reviewer import reviewer_node
from .subagents.phase_done import phase_done_node
from .utils import sanitize_text
from . import config


# ==================== 系统提示词 ====================

# --- 两种模式共享的基础提示词（身份、工作原则、注意事项） ---
_PROMPT_BASE = """你是 OpenSys AI Agent，一个运行在隔离 Docker 容器内的智能助手。

## 工作原则
1. **先了解再操作**：执行前先查看环境信息（ls、cat、pwd 等）
2. **渐进式执行**：复杂任务拆分为小步骤，逐步完成
3. **错误恢复**：命令失败时先分析错误输出，尝试修复；多次失败后请求用户帮助
4. **安全意识**：危险操作前说明风险和影响，等待审批后再执行
5. **清晰汇报**：每步操作说明目的，完成后汇报结果

## 注意事项
- 你运行在容器内，有独立的文件系统和网络（通过代理访问外网）
- 所有操作都会被审计日志记录
- 部分操作需要用户审批才能执行（系统会自动判断）
- 使用中文与用户交流
"""

# --- 非 Pipeline 模式独有（完整工具列表 + 规划判定 + 记忆管理） ---
_PROMPT_STANDALONE = """
## 你的能力
你可以通过工具在容器内执行任何操作：
- `run_terminal`: 执行终端命令（ls、grep、apt、pip、git 等任何命令）
- `write_and_run_script`: 编写并执行脚本（Python、Bash、Node.js）
- `web_tool`: 轻量网络工具，支持 API 级别的搜索和网页内容提取（不涉及浏览器交互）
- `ask_user`: 当你需要用户提供信息或帮助时，暂停并提问
- `write_todos`: 创建和管理任务清单（复杂任务时使用）
- `request_planning`: 请求 Advisor 顾问为复杂任务制定多阶段执行计划
- `update_memory`: 管理跨对话持久化的记忆文档

**浏览器操作说明**：需要真实浏览器交互的任务（登录、填表、JS 动态页面、数据采集等）
由独立的浏览器子代理执行，不通过 web_tool。你需要调用 request_planning 让 Advisor 规划，
Advisor 会自动安排浏览器子代理执行相关阶段。

## 何时使用 request_planning（重要！）
**你必须在执行任何工具之前，先判断任务是否需要规划。**

### 系统已有的多阶段工作流（匹配时必须规划）
以下是系统已有的成熟工作流模板，用户需求匹配时**必须先调用 request_planning**：
{workflow_summaries}

### 必须规划的通用规则（不局限于上述模板）
即使没有匹配的工作流模板，以下场景也**必须先调用 request_planning**：
- 任务需要浏览器操作（登录网站、填写表单、操作动态页面、采集网站数据等）
- 任务包含多个有先后依赖的阶段（如"先采集再分析再输出"）
- 任务涉及多个角色协作（如"需要调研 + 撰写 + 审核"）
- 用户需求中同时包含信息收集和内容产出两个目标

### 不需要规划的简单任务（直接执行即可）
- 简单问答："Python 的 GIL 是什么？"、"解释一下这段代码"
- 单步命令："帮我看看磁盘空间"、"查看当前目录下的文件"
- 单步搜索："搜索一下最新的 React 版本"（web_tool 即可）
- 单文件操作："帮我格式化这个 JSON 文件"、"这个脚本有 bug，帮我修一下"
- 已在执行 pipeline 阶段时（不要嵌套规划）

## 记忆管理（update_memory 工具）
你有一个跨对话持久化的记忆文档。在对话中发现以下类型的重要信息时，使用 update_memory 工具记录：
- 用户明确表达的偏好或习惯（如编码风格、工具偏好）
- 项目相关的重要技术决策或架构变更
- 需要跨对话记住的关键事实（如用户名、常用路径）

**⚠️ 先读后写规则（必须遵守）：**
1. 修改记忆前**必须**先调用 `update_memory(action='read')` 查看现有内容
2. 确认现有内容后，再决定用 `action='append'`（追加）还是 `action='rewrite'`（重写章节）
3. 优先使用 `append` 追加，只在需要精简或修正时才用 `rewrite`
4. **绝不要跳过读取步骤直接写入**，否则会被安全拦截

**注意：不要频繁调用此工具，只在确实发现值得长期记住的信息时才使用。**
如果记忆文档接近上限，先 read 查看，再用 rewrite 精简旧内容。

## 定时任务
系统支持 cron 定时任务。到达指定时间时，系统会自动向 Agent 发送消息并执行（无需人工干预）。
用户要求设置定时任务时，使用 `run_terminal` 调用 API 创建：
```
curl -s -X POST http://localhost:8000/schedules -H 'Content-Type: application/json' \
  -d '{"name":"任务名", "query":"发送给Agent的指令", "cron_expr":"0 9 * * *", "once":false}'
```
- **cron_expr**：`分 时 日 月 周`，如 `0 9 * * *`（每天9点）、`30 8 * * 1-5`（工作日8:30）
- **once**：`true` 为一次性任务，执行后自动停用
- 查看已有定时任务：`curl -s http://localhost:8000/schedules`
"""

# --- Pipeline 模式独有（精简工具列表，不含 write_todos / request_planning / 记忆管理） ---
_PROMPT_PIPELINE = """
## 你的能力（Pipeline 阶段模式）
当前处于多阶段流水线执行模式，你可以使用以下工具完成当前阶段的任务：
- `run_terminal`: 执行终端命令（ls、grep、apt、pip、git 等任何命令）
- `write_and_run_script`: 编写并执行脚本（Python、Bash、Node.js）
- `web_tool`: 轻量网络工具，支持 API 级别的搜索和网页内容提取
- `ask_user`: 当你需要用户提供信息或确认时，暂停并提问
"""


# ==================== 模型获取 ====================

def _get_model_name_from_state(state: AgentState) -> str:
    """从 state.model_config 中获取 model_name，未设置则用默认值"""
    mc = state.get("model_config") or {}
    return mc.get("model_name") or config.DEFAULT_MODEL_NAME


# ==================== 辅助函数 ====================

def _cleanup_downloads_dir():
    """清理浏览器下载目录中的旧文件（新对话开始时调用）"""
    from pathlib import Path
    downloads_dir = Path(config.BROWSER_DOWNLOADS_DIR)
    if not downloads_dir.exists():
        return
    removed = 0
    for f in downloads_dir.iterdir():
        try:
            if f.is_file():
                f.unlink()
                removed += 1
            elif f.is_dir():
                import shutil
                shutil.rmtree(f, ignore_errors=True)
                removed += 1
        except OSError:
            pass
    if removed:
        print(f"[Agent] 已清理下载目录 {downloads_dir} 中 {removed} 个旧文件")


# ==================== 图节点定义 ====================

def _load_memory() -> str:
    """加载 memory.md 记忆文档内容（如果存在）"""
    if config.MEMORY_FILE.exists():
        try:
            content = config.MEMORY_FILE.read_text(encoding="utf-8").strip()
            if content:
                char_count = len(content)
                limit_info = f"（当前 {char_count}/{config.MEMORY_MAX_CHARS} 字符）"
                return f"\n\n## 📝 用户记忆 {limit_info}\n{content}"
        except Exception:
            pass
    return ""


def _load_project() -> str:
    """
    加载 data/project.md 项目声明文件（如果存在且有实质内容）

    此文件由用户维护，AI 不可修改。为 AI 提供项目背景信息。
    纯注释模板（无实质内容）不注入，避免浪费 prompt 空间。
    """
    if config.PROJECT_FILE.exists():
        try:
            content = config.PROJECT_FILE.read_text(encoding="utf-8").strip()
            if content:
                # 过滤掉纯注释内容（只有 <!-- --> 和标题行的模板不注入）
                lines = [l for l in content.split("\n")
                         if l.strip() and not l.strip().startswith("<!--") and not l.strip().startswith("-->")]
                # 如果去掉注释后只剩标题行（#开头），说明用户还没填写，不注入
                non_header_lines = [l for l in lines if not l.strip().startswith("#")]
                if non_header_lines:
                    return f"\n\n## 📂 项目背景\n{content}"
        except Exception:
            pass
    return ""


def _load_user_prompt() -> str:
    """加载 user_prompt.md 用户自定义提示词（如果存在）\n\n    此文件由用户维护，AI 不可修改。内容追加到 system prompt 末尾。"""
    if config.USER_PROMPT_FILE.exists():
        try:
            content = config.USER_PROMPT_FILE.read_text(encoding="utf-8").strip()
            if content:
                return f"\n\n{content}"
        except Exception:
            pass
    return ""


def _build_system_prompt(state: AgentState) -> str:
    """
    构建系统提示词，按模式动态组装不同的提示词片段

    非 Pipeline 模式（首次提问 / 简单任务）：
    1. _PROMPT_BASE（身份、工作原则、注意事项）
    2. _PROMPT_STANDALONE（完整工具列表 + 规划判定 + 记忆管理，含 {workflow_summaries} 动态替换）
    3. user_prompt.md 用户自定义规则
    4. project.md 项目背景
    5. 技能关键词匹配（load_skills_for_prompt）
    6. memory.md 记忆文档
    7. todos 状态渲染

    Pipeline 模式（活跃 pipeline）：
    1. _PROMPT_BASE（身份、工作原则、注意事项）
    2. _PROMPT_PIPELINE（精简工具列表，仅可用工具）
    3. project.md 项目背景
    4. memory.md 记忆文档
    5. Pipeline 执行模式段（阶段信息 + 约束）
    6. phase.skill 精确加载

    纯同步，保证 prompt 稳定以利用厂商 token 缓存。
    """
    # 判断是否处于活跃 Pipeline 模式（有 pipeline 且未结束）
    # _pipeline_just_done=True 时也视为 pipeline 模式：
    # 此时 agent 进入汇报轮次，不应拿到 request_planning 工具，避免在汇报时发起新规划
    pipeline = state.get("pipeline")
    _in_pipeline = bool(
        pipeline and state.get("phase_status") not in (None, "done", "aborted")
    ) or bool(state.get("_pipeline_just_done"))

    # 按模式组装基础提示词
    if _in_pipeline:
        # Pipeline 模式：精简工具列表，不含规划判定/记忆管理/write_todos
        prompt = _PROMPT_BASE + _PROMPT_PIPELINE
    else:
        # 非 Pipeline 模式：完整工具列表 + 规划判定（含工作流摘要）+ 记忆管理
        _workflow_summaries = format_workflows_for_agent(discover_workflows())
        if not _workflow_summaries:
            _workflow_summaries = "（暂无工作流模板）"
        prompt = _PROMPT_BASE + _PROMPT_STANDALONE.replace("{workflow_summaries}", _workflow_summaries)

    if not _in_pipeline:
        # 非 Pipeline 模式：注入用户自定义提示词（任务分解、调试铁律、验证规范等）
        # Pipeline 模式下跳过，避免 write_todos / 五阶段流程与 Pipeline 流程管理冲突
        prompt += _load_user_prompt()

    # 注入项目背景（用户填写了实质内容时才注入，两种模式都需要）
    prompt += _load_project()

    if not _in_pipeline:
        # 非 Pipeline 模式：按用户关键词动态匹配技能（首次提问不加载 Skill）
        # Pipeline 模式下技能改为在阶段段内精确加载 phase.skill
        user_query = _extract_latest_user_query(state.get("messages", []))
        skills_text = load_skills_for_prompt(user_query)
        if skills_text:
            prompt += skills_text

    # 注入 memory.md 记忆文档（两种模式都需要）
    prompt += _load_memory()

    # 如果在 Pipeline 模式下，注入当前阶段上下文（让 LLM 只聚焦当前阶段）
    if pipeline:
        phases = pipeline.get("phases", [])
        current = state.get("current_phase", 0)
        phase_status = state.get("phase_status", "pending")
        if current < len(phases):
            phase = phases[current]
            phase_name = phase.get("name", f"Phase {current + 1}")
            phase_desc = phase.get("description", "")
            phase_method = phase.get("method", "agent")
            total = len(phases)

            # 构建阶段概览（已完成 / 当前 / 待执行）
            overview_lines = []
            for idx, p in enumerate(phases):
                emoji = "✅" if idx < current else ("🔄" if idx == current else "⏳")
                overview_lines.append(f"  {emoji} 阶段 {idx + 1}: {p.get('name', '?')}")

            # 获取后续阶段名称列表，用于明确禁止
            future_names = [p.get("name", "?") for p in phases[current + 1:]]
            future_warning = ""
            if future_names:
                future_warning = (
                    f"6. **严禁涉及以下后续阶段的内容**：{', '.join(future_names)}。"
                    f"这些阶段将由系统自动安排，你不得提前执行或输出相关内容\n"
                )

            # === Pipeline agent 阶段：精确加载 phase.skill 指定的技能 ===
            phase_skill_text = ""
            if phase_method == "agent":
                phase_skill_name = phase.get("skill")
                if phase_skill_name:
                    from .skill_loader import load_skill_content
                    _skill_body = load_skill_content(phase_skill_name)
                    if _skill_body:
                        phase_skill_text = (
                            f"\n\n## 🎯 当前阶段技能指令（{phase_skill_name}）\n"
                            f"{_skill_body}"
                        )

            prompt += (
                f"\n\n## 🚀 Pipeline 执行模式（阶段 {current + 1}/{total}）\n"
                f"你正在执行多阶段流水线，当前处于：\n"
                f"- **当前阶段**: {phase_name}\n"
                f"- **阶段描述**: {phase_desc}\n"
                f"- **执行方式**: {phase_method}\n"
                f"- **阶段状态**: {phase_status}\n\n"
                f"### 全局进度\n" + "\n".join(overview_lines) + "\n\n"
                f"### ⚠️ 重要约束（必须严格遵守）\n"
                f"1. **你的全部输出必须且只能针对当前阶段「{phase_name}」**\n"
                f"2. 当前阶段完成后，**立即输出阶段总结并停止**，系统会自动推进到下一阶段\n"
                f"3. **绝对不要**试图一次性完成多个阶段的工作\n"
                f"4. 如果当前阶段需要使用工具，正常调用即可\n"
                f"5. **禁止使用 write_todos 工具**——Pipeline 模式下任务由系统自动管理\n"
                f"{future_warning}"
            )
            # 注入精确加载的技能内容（紧跟在 Pipeline 段之后）
            if phase_skill_text:
                prompt += phase_skill_text
        elif phase_status == "done":
            # Pipeline 全部完成，agent 进入汇报模式
            total = len(phases)
            overview_lines = [f"  ✅ 阶段 {idx + 1}: {p.get('name', '?')}" for idx, p in enumerate(phases)]
            prompt += (
                f"\n\n## 🎉 Pipeline 已全部完成（共 {total} 个阶段）\n"
                f"### 全局进度\n" + "\n".join(overview_lines) + "\n\n"
                f"### ⚠️ 汇报模式约束（必须严格遵守）\n"
                f"1. **你现在的唯一任务是输出任务完成报告**，汇总所有阶段的成果\n"
                f"2. **严禁调用 request_planning**——所有阶段已完成，不需要新的规划\n"
                f"3. **严禁调用其他工具**——除 ask_user 请求用户验收外，不要调用任何工具\n"
                f"4. 报告应包含：状态、概述、变更清单、验证结果、遗留问题\n"
                f"5. 报告输出后，使用 ask_user 请求用户验收\n"
            )

    # 非 Pipeline 模式下：如果有任务清单，追加到 system prompt 末尾
    # Pipeline 模式下跳过 todos 渲染，避免 LLM 混淆两套任务管理机制
    todos = state.get("todos")
    if todos and not _in_pipeline:
        todo_lines = ["\n\n## 📋 当前任务清单"]
        status_emoji = {"pending": "⏳", "in_progress": "🔄", "completed": "✅"}
        priority_emoji = {"high": "🔴", "medium": "🟡", "low": "⚪"}
        for t in todos:
            s = status_emoji.get(t.get("status", "pending"), "❓")
            p = priority_emoji.get(t.get("priority", "medium"), "")
            content = t.get("content", "")
            todo_lines.append(f"- {s} {p} [{t.get('id', '?')}] {content}")

        # 统计
        total = len(todos)
        completed = sum(1 for t in todos if t.get("status") == "completed")
        in_progress = sum(1 for t in todos if t.get("status") == "in_progress")
        pending = total - completed - in_progress
        todo_lines.append(f"\n进度：{completed}/{total} 完成，{in_progress} 进行中，{pending} 待执行")

        # 任务完成报告触发：当所有 todo 都已 completed 时
        if completed == total and total > 0:
            todo_lines.append(
                "\n🎯 **所有任务已完成！** 请立即输出任务完成报告（格式参考'任务完成报告规范'章节），"
                "包含：状态、概述、变更清单、验证结果、遗留问题。"
                "报告输出后，使用 ask_user 请求用户验收。"
            )
        elif in_progress > 0:
            todo_lines.append("请继续执行当前 in_progress 的任务，完成后用 write_todos 标记为 completed。")
        elif pending > 0 and in_progress == 0:
            todo_lines.append("有待执行的任务但没有 in_progress 的任务，请选择下一个 pending 任务开始执行。")

        prompt += "\n".join(todo_lines)

    return prompt


# ==================== 向量化检索与入库 ====================

async def _retrieve_conversation_memory(query: str, thread_id: str) -> str:
    """
    检索本线程的历史对话记忆，格式化为可注入消息列表的文本

    仅在超阈值入库时调用（不在每次 LLM 调用时执行），避免 system prompt 不稳定。
    检索范围限制为当前 thread_id，不跨线程共享。

    Args:
        query: 用户最近输入（作为检索 query）
        thread_id: 当前对话线程 ID（限制检索范围）

    Returns:
        格式化的历史记忆文本，空字符串表示无结果或失败
    """
    if not query or not thread_id:
        return ""

    try:
        vs = VectorStoreManager()
        try:
            results = await vs.search_conversations(
                query=query,
                thread_id=thread_id,  # 只检索本线程
            )
        finally:
            await vs.close()
    except Exception as e:
        print(f"[向量检索] 对话记忆检索失败: {e}")
        return ""

    if not results:
        return ""

    # 格式化检索结果（用于包装为 HumanMessage）
    lines = []
    for item in results:
        doc = item.get("document", "")
        distance = item.get("distance", 0)
        similarity = 1 - distance
        # 只保留相似度 > 0.3 的结果（过滤噪音）
        if similarity < 0.3:
            continue
        if len(doc) > 500:
            doc = doc[:500] + "..."
        lines.append(f"- {doc}")

    if not lines:
        return ""

    return "\n".join(lines)


def _extract_latest_user_query(messages: list) -> str:
    """
    从消息列表中提取最新的用户输入（用于向量检索 query）

    Args:
        messages: 消息列表

    Returns:
        最新用户输入文本，未找到返回空字符串
    """
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            content = msg.content
            if isinstance(content, str):
                # 跳过系统通知
                if content.startswith("[系统通知]") or content.startswith("[以下是之前对话的摘要]"):
                    continue
                return content
            elif isinstance(content, list):
                # 多模态消息：提取文本部分
                for item in content:
                    if isinstance(item, dict) and item.get("type") == "text":
                        text = item.get("text", "")
                        if text and not text.startswith("[系统通知]"):
                            return text
    return ""


async def vectorize_old_messages(
    messages: list,
    thread_id: str = "",
    trigger_messages: int = None,
    trigger_tokens: int = None,
    keep_messages: int = None,
) -> dict | None:
    """
    当消息数/token 超阈值时，将旧对话切片入向量库，然后从 checkpoint 中删除

    替代原来的 summarize_old_messages（不再调用 LLM 做摘要，零额外 Token）

    流程：
    1. 检查是否需要触发（消息数或 token 超阈值）
    2. 将旧消息按完整交互轮次切片
    3. 批量入库到 ChromaDB conversation_memory 集合
    4. 返回 RemoveMessage 列表，让 checkpoint 删除旧消息

    Args:
        messages: 当前消息列表（不含 SystemMessage）
        thread_id: 对话线程 ID
        trigger_messages: 触发入库的消息数阈值
        trigger_tokens: 触发入库的 token 阈值
        keep_messages: 入库后保留的最近消息数

    Returns:
        state update dict（包含 RemoveMessage），或 None（不需要入库）
    """
    trigger_messages = trigger_messages or config.VECTOR_TRIGGER_MESSAGES
    trigger_tokens = trigger_tokens or config.VECTOR_TRIGGER_TOKENS
    keep_messages = keep_messages or config.VECTOR_KEEP_MESSAGES

    # 过滤掉 SystemMessage
    non_system = [m for m in messages if not isinstance(m, SystemMessage)]

    # 检查是否需要触发
    msg_count = len(non_system)
    if msg_count <= trigger_messages:
        total_chars = sum(_estimate_chars(m) for m in non_system)
        estimated_tokens = total_chars // 3
        if estimated_tokens <= trigger_tokens:
            return None

    # 找到安全分割点（不打断 AI + ToolMessage 配对）
    split_idx = _find_safe_split(non_system, keep_messages)
    if split_idx <= 0:
        return None

    old_messages = non_system[:split_idx]
    print(f"[向量化入库] 触发：总 {msg_count} 条消息，入库前 {split_idx} 条")

    # 将旧消息按轮次切片
    turns = slice_conversation_turns(old_messages)

    if turns:
        # 批量入库到向量库
        try:
            vs = VectorStoreManager()
            try:
                stored = await vs.store_conversation_turns(
                    thread_id=thread_id,
                    turns=turns,
                )
                print(f"[向量化入库] 成功入库 {stored} 个对话轮次")
            finally:
                await vs.close()
        except Exception as e:
            print(f"[向量化入库] 入库失败: {e}")
            # 入库失败时回退到摘要压缩（不丢失数据）
            return None

        # 入库数为 0（embedding 服务不可用等）→ 不删除旧消息，回退到摘要压缩
        if stored == 0:
            print("[向量化入库] 入库数为 0，跳过消息删除，回退到摘要压缩")
            return None

    # 构建 RemoveMessage 删除旧消息（让 checkpoint 瘦身）
    remove_msgs = [
        RemoveMessage(id=m.id)
        for m in old_messages
        if hasattr(m, "id") and m.id
    ]

    print(f"[向量化入库] 从 checkpoint 移除 {len(remove_msgs)} 条旧消息")

    # 检索本线程历史记忆，包装为 HumanMessage 注入（类似原摘要逻辑）
    user_query = _extract_latest_user_query(messages)
    memory_text = await _retrieve_conversation_memory(user_query, thread_id)
    if memory_text:
        memory_msg = HumanMessage(
            content=f"[以下是从本对话历史中检索到的相关记忆]\n{memory_text}\n[记忆结束，以下是最近的对话]"
        )
        remove_msgs.append(memory_msg)
        print(f"[向量化入库] 已注入历史记忆摘要（{len(memory_text)} 字符）")

    return {"messages": remove_msgs}


def _estimate_chars(msg) -> int:
    """估算消息字符数（简化版）"""
    content = getattr(msg, "content", "")
    if isinstance(content, str):
        return len(content)
    elif isinstance(content, list):
        return sum(
            len(item.get("text", "")) if isinstance(item, dict) else len(str(item))
            for item in content
        )
    return 0


def _find_safe_split(messages: list, keep: int) -> int:
    """
    找到安全分割点，不打断 AI(tool_calls) + ToolMessage 配对

    双向检查：
    1. 往前退：确保被删除的旧消息末尾不是 ToolMessage 或 AI(tool_calls)
    2. 往后验证：确保保留的消息开头不是孤儿 ToolMessage（前面缺 tool_calls）
    """
    target = len(messages) - keep
    if target <= 0:
        return 0

    # 第一步：往前退，跳过 ToolMessage 和 AIMessage(tool_calls)
    idx = target
    while idx > 0:
        msg = messages[idx]
        if isinstance(msg, ToolMessage):
            idx -= 1
            continue
        if isinstance(msg, AIMessage) and getattr(msg, "tool_calls", None):
            idx -= 1
            continue
        break

    # 第二步：往后验证，确保保留消息开头不是孤儿 ToolMessage
    # 如果 idx 处是分割点，则 messages[idx:] 是保留的消息
    # 保留部分开头如果是 ToolMessage，说明它对应的 AIMessage(tool_calls) 在删除范围内
    # 需要把这些开头的 ToolMessage 也一起删掉（往后推分割点）
    while idx < len(messages):
        msg = messages[idx]
        if isinstance(msg, ToolMessage):
            idx += 1
            continue
        break

    return max(idx, 0)


async def agent_node(state: AgentState, config: RunnableConfig) -> dict:
    """
    Agent 节点：调用 LLM 生成回复或工具调用

    执行流程：
    0. 短路检查：advisor_context 已预设（/plan 命令）→ 跳过 LLM，直接路由到 Advisor
    1. 图片渐进压缩（同步，原地修改消息内容）
    2. 消息清理（修复不完整工具调用序列 + 视觉/非视觉 content 格式转换）
    3. 向量化入库（超阈值时将旧对话存入 ChromaDB + 检索本线程记忆注入 HumanMessage，零 Token 消耗）
       - 若向量化失败，回退到 LLM 摘要压缩（兜底）
    4. 构建动态 system prompt（注入 todos 状态，不含向量检索，保证 prompt 稳定以利用厂商缓存）
    5. Claude 多轮对话增量缓存（原地修改 HumanMessage 添加 cache_control）
    6. 调用 LLM 生成回复
    """
    # --- 清除旧 Pipeline 残留标志 ---
    # _pipeline_just_done 在 pipeline 全部完成时设为 True，用于防止汇报轮次误触发新规划。
    # 当新的用户消息进入 agent_node 时，说明已经过了汇报轮次，应该清除此标志。
    # 同时清空旧 pipeline 对象，避免其残留污染后续任务的 system prompt。
    _state_cleanup = {}
    if state.get("_pipeline_just_done"):
        msgs = state.get("messages", [])
        # 检查消息列表末尾是否有新的 HumanMessage（用户发了新消息）
        for i in range(len(msgs) - 1, -1, -1):
            msg = msgs[i]
            if isinstance(msg, HumanMessage):
                _state_cleanup["_pipeline_just_done"] = False
                # pipeline 已完成且用户发了新消息 → 清空旧 pipeline 对象
                # 避免残留的 pipeline/phase_status="done" 污染 _build_system_prompt
                if state.get("phase_status") == "done":
                    _state_cleanup["pipeline"] = None
                    _state_cleanup["phase_status"] = None
                    _state_cleanup["todos"] = None
                    # 清空下载文件追踪列表 + 清理下载目录中的旧文件
                    if state.get("downloaded_files"):
                        _state_cleanup["downloaded_files"] = None
                        _cleanup_downloads_dir()
                break
            # 遇到 AI 消息就停止检查（说明还在汇报轮次中）
            if isinstance(msg, AIMessage):
                break

    # --- 第零步：/plan 命令短路 ---
    # 当 advisor_context 已预设（用户通过 /plan 主动触发）且 advisor 尚未被调用时，
    # 跳过 LLM 调用，直接返回一条纯文本消息。agent_router 会检测到 advisor_context
    # 有值并路由到 advisor 节点，省掉一次 LLM 调用。
    # 注意：pipeline 完成后对象仍在 state 中（phase_status="done"），不应阻止新规划
    pipeline_active = (state.get("pipeline")
                       and state.get("phase_status") not in (None, "done", "aborted"))
    if (state.get("advisor_context")
            and not state.get("advisor_called")
            and not pipeline_active):
        user_request = state["advisor_context"].get("user_request", "")
        print(f"[Agent] /plan 短路：跳过 LLM，直接路由到 Advisor | task={user_request[:80]}")
        result = {"messages": [AIMessage(content=f"📋 正在为任务制定执行计划：{user_request}")]}
        result.update(_state_cleanup)
        return result

    model_name = _get_model_name_from_state(state)
    llm = get_llm(model_name)
    messages = list(state["messages"])

    # --- 第一步：图片渐进压缩（每次 LLM 调用前执行） ---
    compress_context(messages)

    # --- 第二步：消息清理（修复不完整工具调用序列 + content 格式转换） ---
    messages = clean_messages(messages, model_name)

    # --- 第三步：向量化入库（优先）或摘要压缩（兜底） ---
    # 从 LangGraph RunnableConfig 中获取 thread_id（用于向量入库标记 + 本线程检索）
    thread_id = (config.get("configurable") or {}).get("thread_id", "")

    # 优先尝试向量化入库（零 LLM Token 消耗）
    vector_update = await vectorize_old_messages(messages, thread_id=thread_id)

    if vector_update:
        # 向量化成功：从消息中移除旧消息，然后继续 LLM 调用
        remove_ids = {
            m.id for m in vector_update["messages"]
            if hasattr(m, "id") and isinstance(m, RemoveMessage)
        }
        # 构建移除旧消息后的消息列表（含注入的记忆 HumanMessage）
        remaining_msgs = [m for m in messages if not (hasattr(m, "id") and m.id in remove_ids)]
        # 将 vector_update 中非 RemoveMessage 的消息（记忆 HumanMessage）插到前面
        memory_msgs = [m for m in vector_update["messages"] if not isinstance(m, RemoveMessage)]
        remaining_msgs = memory_msgs + remaining_msgs

        # 构建 system prompt + 剩余消息，调用 LLM
        system_prompt = _build_system_prompt(state)
        llm_messages = [SystemMessage(content=system_prompt)]
        for m in remaining_msgs:
            if not isinstance(m, SystemMessage):
                if hasattr(m, "content") and isinstance(m.content, str):
                    m.content = sanitize_text(m.content)
                llm_messages.append(m)

        apply_claude_message_cache(model_name, llm_messages)
        response = await llm.ainvoke(llm_messages)
        if hasattr(response, "content") and isinstance(response.content, str):
            response.content = sanitize_text(response.content)

        # 返回：RemoveMessage（checkpoint 瘦身）+ 记忆 HumanMessage + AI 回复
        vector_update["messages"].append(response)
        vector_update.update(_state_cleanup)
        return vector_update

    # 向量化未触发或失败 → 回退到 LLM 摘要压缩（兜底）
    base_llm = get_base_llm(model_name)
    summary_update = await summarize_old_messages(messages, base_llm)
    if summary_update:
        remove_ids = {m.id for m in summary_update["messages"] if hasattr(m, 'id') and isinstance(m, RemoveMessage)}
        compressed_msgs = [m for m in messages if not (hasattr(m, 'id') and m.id in remove_ids)]
        summary_msgs = [m for m in summary_update["messages"] if not isinstance(m, RemoveMessage)]
        compressed_msgs = summary_msgs + compressed_msgs

        system_prompt = _build_system_prompt(state)
        llm_messages = [SystemMessage(content=system_prompt)]
        for m in compressed_msgs:
            if not isinstance(m, SystemMessage):
                if hasattr(m, "content") and isinstance(m.content, str):
                    m.content = sanitize_text(m.content)
                llm_messages.append(m)

        apply_claude_message_cache(model_name, llm_messages)
        response = await llm.ainvoke(llm_messages)
        if hasattr(response, "content") and isinstance(response.content, str):
            response.content = sanitize_text(response.content)

        summary_update["messages"].append(response)
        summary_update.update(_state_cleanup)
        return summary_update

    # --- 第四步：构建消息列表（动态 system prompt + 历史消息） ---
    system_prompt = _build_system_prompt(state)
    new_messages = [SystemMessage(content=system_prompt)]
    for m in messages:
        if not isinstance(m, SystemMessage):
            # 清理所有消息 content 中的 surrogate 字符（防止 LLM 引用后导致序列化失败）
            if hasattr(m, "content") and isinstance(m.content, str):
                m.content = sanitize_text(m.content)
            new_messages.append(m)

    # --- 第五步：Claude 多轮对话增量缓存（原地修改消息） ---
    apply_claude_message_cache(model_name, new_messages)

    # --- 第六步：调用 LLM ---
    response = await llm.ainvoke(new_messages)

    # --- 清理响应中的无效 surrogate 字符（防止下游序列化报错） ---
    if hasattr(response, "content") and isinstance(response.content, str):
        response.content = sanitize_text(response.content)

    result = {"messages": [response]}
    result.update(_state_cleanup)
    return result


def risk_assessment_node(state: AgentState) -> dict:
    """
    风险评估节点：检查 LLM 的工具调用，评估风险等级

    读取最后一条 AI 消息的 tool_calls，
    根据命令内容和当前授权等级判定风险。
    """
    last_message = state["messages"][-1]
    tool_calls = getattr(last_message, "tool_calls", [])
    auth_level = state.get("auth_level", config.DEFAULT_AUTH_LEVEL)

    risk = assess_risk(tool_calls, auth_level)

    # 生成待审批命令描述（用于审批节点展示）
    pending = ""
    if risk != "safe" and tool_calls:
        pending = format_approval_request(tool_calls, risk)

    return {
        "risk_level": risk,
        "pending_command": pending,
        "approval_result": None,  # 重置审批结果
        "modified_command": None,
    }


def approval_node(state: AgentState) -> dict:
    """
    审批节点：暂停执行，等待用户审批

    使用 LangGraph interrupt() 暂停图执行。
    用户通过 WebSocket/CLI 回复审批结果后继续。
    无人值守模式下自动批准所有操作。
    """
    pending = state.get("pending_command", "")
    risk_level = state.get("risk_level", "moderate")

    # 无人值守模式：自动批准（跳过 interrupt）
    if state.get("unattended"):
        auto_count = state.get("_unattended_auto_count", 0) + 1
        # 超限保护：自动处理 interrupt 次数过多 → 强制拒绝，终止执行
        if auto_count > config.UNATTENDED_MAX_AUTO_INTERRUPTS:
            print(f"[Approval] 无人值守模式超限 ({auto_count})，强制拒绝")
            return {
                "approval_result": "rejected",
                "modified_command": None,
                "_unattended_auto_count": auto_count,
            }
        print(f"[Approval] 无人值守模式，自动批准 ({auto_count}/{config.UNATTENDED_MAX_AUTO_INTERRUPTS}): {pending[:80]}")
        return {
            "approval_result": "approved",
            "modified_command": None,
            "_unattended_auto_count": auto_count,
        }

    # 使用 interrupt 暂停，等待用户回复
    user_response = interrupt({
        "type": "approval_request",
        "risk_level": risk_level,
        "description": pending,
        "options": ["approved", "rejected", "modified"],
    })

    # 解析用户回复
    if isinstance(user_response, dict):
        result = user_response.get("action", "rejected")
        modified = user_response.get("modified_command", None)
    elif isinstance(user_response, str):
        # 简单字符串回复：approved / rejected
        result = user_response.strip().lower()
        if result not in ("approved", "rejected", "modified"):
            result = "approved" if result in ("y", "yes", "是", "批准", "确认", "ok") else "rejected"
        modified = None
    else:
        result = "rejected"
        modified = None

    return {
        "approval_result": result,
        "modified_command": modified,
    }


def rejection_node(state: AgentState) -> dict:
    """
    拒绝节点：用户拒绝操作，通知 AI

    向消息历史追加一条系统消息，告知 AI 操作被拒绝，
    让 AI 继续对话（可能换个方式或询问用户）。
    """
    pending = state.get("pending_command", "")
    # 告知 AI 操作被拒绝
    rejection_msg = HumanMessage(
        content=f"[系统通知] 用户拒绝了以下操作，请换一种方式或询问用户：\n{pending}"
    )
    return {
        "messages": [rejection_msg],
        "pending_command": None,
        "risk_level": None,
        "approval_result": None,
    }


# ==================== 条件路由函数 ====================

def agent_router(state: AgentState) -> Literal["risk_assessment", "advisor", "phase_done", "__end__"]:
    """
    Agent 节点后的路由：

    - 如果 LLM 返回 tool_calls → 去风险评估（但会检查兜底规划）
    - 如果 advisor_context 有值且 advisor 未被调用 → 去 Advisor 规划
    - 如果在 pipeline 模式下且 LLM 返回纯文本 → 去 phase_done 推进阶段
    - 如果 LLM 只返回文本 → 结束（回复用户）

    硬约束：Pipeline 模式下 agent 工具调用轮次超限 → 强制终止工具循环，直接走 phase_done。
    兜底机制：当 LLM 跳过 request_planning 直接调其他工具，
    但用户消息实际是多阶段任务时，拦截并自动触发 Advisor。
    """
    last_message = state["messages"][-1]

    # 有 tool_calls → 检查是否需要兜底拦截
    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        tool_names = [tc["name"] for tc in last_message.tool_calls]

        # === Pipeline 模式硬约束：工具调用轮次超限 → 强制结束当前阶段 ===
        pipeline = state.get("pipeline")
        if pipeline:
            rounds = state.get("_agent_phase_tool_rounds", 0) + 1
            state["_agent_phase_tool_rounds"] = rounds
            current = state.get("current_phase", 0)
            phases = pipeline.get("phases", [])
            phase_name = phases[current].get("name", "?") if current < len(phases) else "?"

            if rounds > config.AGENT_PHASE_MAX_TOOL_ROUNDS:
                # 超限：剥离 tool_calls，保留文本内容，强制走 phase_done
                print(
                    f"[Pipeline 硬约束] agent 工具调用 {rounds} 轮超限 "
                    f"(max={config.AGENT_PHASE_MAX_TOOL_ROUNDS})，"
                    f"强制结束 Phase {current + 1} ({phase_name})"
                )
                # 将 tool_calls 清空，保留已有的文本内容作为阶段产出
                last_message.tool_calls = []
                if not last_message.content:
                    last_message.content = (
                        f"[系统强制终止] Phase {current + 1} ({phase_name}) "
                        f"工具调用轮次已达上限 ({config.AGENT_PHASE_MAX_TOOL_ROUNDS})，"
                        f"自动提交当前产出物进入审查。"
                    )
                return "phase_done"

        # 如果 LLM 已经调了 request_planning
        if "request_planning" in tool_names:
            # 拦截：pipeline 刚完成的汇报轮次，不允许触发新规划
            # 判断条件：_pipeline_just_done=True 且触发 agent 的不是用户新消息
            # （用户新消息 = 消息列表中 LLM 回复前的最后一条是 HumanMessage）
            if state.get("_pipeline_just_done"):
                # 检查是否有用户在 pipeline 完成后发的新消息
                _has_new_user_msg = False
                msgs = state.get("messages", [])
                for i in range(len(msgs) - 1, -1, -1):
                    msg = msgs[i]
                    # 跳过最后的 AIMessage（就是当前 LLM 的回复）
                    if isinstance(msg, AIMessage) and msg is last_message:
                        continue
                    # 跳过 ToolMessage
                    if hasattr(msg, "tool_call_id"):
                        continue
                    # 遇到 HumanMessage → 用户发了新消息
                    if isinstance(msg, HumanMessage):
                        _has_new_user_msg = True
                    break
                if not _has_new_user_msg:
                    print(f"[路由拦截] pipeline 刚完成（_pipeline_just_done=True），"
                          f"agent 在汇报轮次又调了 request_planning，剥离工具调用，强制结束")
                    last_message.tool_calls = []
                    if not last_message.content:
                        last_message.content = (
                            "所有阶段已完成。请查看上方的执行结果汇总。"
                        )
                    return "__end__"
            return "risk_assessment"

        # 兜底：LLM 没调 request_planning，但用户消息是多阶段任务
        # 仅在 Advisor 尚未被调用、且没有活跃 pipeline 在执行时触发
        # 注意：pipeline 完成后对象仍在 state 中（phase_status="done"），不应视为"正在执行"
        pipeline_active = (state.get("pipeline")
                           and state.get("phase_status") not in (None, "done", "aborted"))
        if (not state.get("advisor_called")
                and not pipeline_active
                and not state.get("advisor_context")):
            user_text = _extract_latest_user_query(state.get("messages", []))
            should_plan, reason = needs_planning(user_text)
            if should_plan:
                print(f"[路由兜底] LLM 跳过规划直接调工具({','.join(tool_names)})，"
                      f"但检测到多阶段任务特征: {reason}，自动触发 Advisor")
                # 自动构造 advisor_context，拦截到 Advisor
                state["advisor_context"] = {
                    "user_request": user_text[:500],
                    "background": f"系统检测到多阶段任务（{reason}），自动触发规划",
                    "constraints": [],
                    "existing_progress": "",
                    "replan_reason": "",
                }
                return "advisor"

        # 正常走风险评估
        return "risk_assessment"

    # advisor_context 有值 → Agent 已总结好情况，交给 Advisor
    if not state.get("advisor_called") and state.get("advisor_context"):
        return "advisor"

    # Pipeline 模式：agent 返回纯文本（当前 method=agent 阶段执行完毕）→ 推进到 phase_done
    pipeline = state.get("pipeline")
    if pipeline:
        current = state.get("current_phase", 0)
        phases = pipeline.get("phases", [])
        if current < len(phases):
            print(f"[Pipeline] agent 阶段完成 → phase_done | phase={current} name={phases[current].get('name', '?')}")
            return "phase_done"

    return "__end__"


def pipeline_router(state: AgentState) -> Literal["agent", "browser", "dispatcher", "reviewer", "advisor", "__end__"]:
    """
    Pipeline 阶段路由（完整版，6 分支）

    决策优先级：
    1. needs_replan → 回 advisor 重新规划
    2. escalated → 回 agent（让主代理通知用户）
    3. needs_review → 路由到 reviewer 审查产出物
    4. rework → 重新路由到当前阶段执行节点（带审查反馈）
    5. 全部完成 → 回 agent（汇报成果）
    6. 按当前阶段 method 分派：agent / browser / dispatcher / reviewer
    """
    phase_status = state.get("phase_status", "")

    # pipeline 已终止（用户 abort）或已完成 → 回到 agent 汇报 / 结束
    if phase_status in ("aborted", "done"):
        pipeline = state.get("pipeline")
        if not pipeline:
            # pipeline 已清空（abort 时清空），直接结束
            return "__end__"
        # pipeline 仍在（正常 done），回 agent 汇报
        return "agent"

    # 需要重新规划 → 回到 Advisor
    if state.get("needs_replan"):
        return "advisor"

    # escalated 状态 → 回到主代理（让主代理用 ask_user 请求用户介入）
    if phase_status == "escalated":
        return "agent"

    # 需要审查 → 路由到 Reviewer
    if phase_status == "needs_review":
        return "reviewer"

    pipeline = state.get("pipeline")
    if not pipeline:
        return "__end__"

    phases = pipeline.get("phases", [])
    current = state.get("current_phase", 0)

    # 全部完成 → 回到 agent 汇报
    if current >= len(phases):
        return "agent"

    phase = phases[current]
    method = phase.get("method", "agent")

    # rework 状态 → 重新路由到当前阶段的执行节点（审查反馈已在消息中）
    if phase_status == "rework":
        print(f"[Pipeline] rework → 重新执行 Phase {current + 1} (method={method})")
        # 按原 method 重新执行
        if method == "browser":
            return "browser"
        elif method in ("executor", "executor_parallel"):
            return "dispatcher"
        else:
            return "agent"  # method=agent 或其他都回主代理

    # 正常分派：按当前阶段 method
    if method == "agent":
        return "agent"              # 主代理亲自执行（需交互的阶段）
    elif method == "browser":
        return "browser"            # 浏览器子代理直接执行（不经过主 Agent）
    elif method in ("executor", "executor_parallel"):
        return "dispatcher"         # 去调度器分派子任务
    elif method == "reviewer":
        return "reviewer"           # 去审查
    else:
        return "agent"              # 兜底


def risk_router(state: AgentState) -> Literal["tools", "approval"]:
    """
    风险评估后的路由：

    - safe → 直接执行工具
    - moderate / dangerous → 走审批流程
    """
    risk = state.get("risk_level", "moderate")
    if risk == "safe":
        return "tools"
    return "approval"


def approval_router(state: AgentState) -> Literal["tools", "rejection", "agent"]:
    """
    审批节点后的路由：

    - approved → 执行工具
    - modified → 执行工具（用修改后的命令）  # TODO: Phase 2 实现命令替换
    - rejected → 通知 AI 被拒绝
    """
    result = state.get("approval_result", "rejected")
    if result in ("approved", "modified"):
        return "tools"
    return "rejection"


# ==================== 构建图 ====================

def build_graph() -> StateGraph:
    """
    构建 OpenSys Agent 的 LangGraph StateGraph

    流程图：
        START → agent → [有tool_calls?]
                            ├─ 否 → END（文本回复）
                            └─ 是 → risk_assessment → [风险等级?]
                                                        ├─ safe → tools → agent（继续循环）
                                                        └─ moderate/dangerous → approval → [审批结果?]
                                                                                            ├─ approved → tools → agent
                                                                                            ├─ modified → tools → agent
                                                                                            └─ rejected → rejection → agent
    """
    # 创建工具执行节点（包装 ToolNode，对所有工具输出做 surrogate 清理）
    _raw_tool_node = ToolNode(all_tools)

    async def safe_tool_node(state: AgentState) -> dict:
        """
        工具执行包装器：Pre/Post Hook + surrogate 清理

        执行流程：
        1. PreToolUse Hook — 权限检查，被拦截的工具调用直接返回拦截 ToolMessage
        2. 未被拦截的工具调用正常执行
        3. PostToolUse Hook — surrogate 清理等后处理
        """
        # === PreToolUse Hook：权限检查 ===
        blocked_messages = await run_pre_hooks(state)

        if blocked_messages:
            # 检查是否所有 tool_calls 都被拦截
            last_message = state["messages"][-1]
            all_tool_call_ids = {tc.get("id", "") for tc in getattr(last_message, "tool_calls", [])}
            blocked_ids = {msg.tool_call_id for msg in blocked_messages}

            if blocked_ids >= all_tool_call_ids:
                # 全部被拦截，不执行任何工具
                return {"messages": blocked_messages}
            else:
                # 部分被拦截：执行未拦截的，合并结果
                # 注意：ToolNode 要求每个 tool_call 都有对应 ToolMessage，
                # 所以即使部分拦截也需要执行剩余的，然后合并
                result = await _raw_tool_node.ainvoke(state)
                if isinstance(result, dict):
                    # 用拦截消息替换对应的执行结果
                    exec_messages = result.get("messages", [])
                    exec_by_id = {msg.tool_call_id: msg for msg in exec_messages if hasattr(msg, "tool_call_id")}
                    for blocked_msg in blocked_messages:
                        exec_by_id[blocked_msg.tool_call_id] = blocked_msg
                    result["messages"] = list(exec_by_id.values())
                else:
                    return {"messages": blocked_messages}

                # === PostToolUse Hook ===
                result = await run_post_hooks(state, result)
                return result

        # === 正常执行（无拦截） ===
        result = await _raw_tool_node.ainvoke(state)

        # === PostToolUse Hook ===
        result = await run_post_hooks(state, result)
        return result

    tool_node = safe_tool_node

    # 构建 StateGraph
    graph = StateGraph(AgentState)

    # --- 添加节点（共 11 个） ---
    graph.add_node("agent", agent_node)
    graph.add_node("risk_assessment", risk_assessment_node)
    graph.add_node("approval", approval_node)
    graph.add_node("rejection", rejection_node)
    graph.add_node("tools", tool_node)
    graph.add_node("advisor", advisor_node)       # P3: Advisor 顾问节点
    graph.add_node("browser", browser_node)       # P3: Browser 浏览器子代理节点
    graph.add_node("dispatcher", dispatcher_node) # P3: Dispatcher 调度器节点
    graph.add_node("executor", executor_node)     # P3: Executor 执行者节点
    graph.add_node("reviewer", reviewer_node)     # P3: Reviewer 审查者节点
    graph.add_node("phase_done", phase_done_node) # P3: 阶段推进器节点

    # --- 添加边 ---

    # 入口：START → agent
    graph.add_edge(START, "agent")

    # agent 之后：条件路由（4 分支）
    #   有 tool_calls → 风险评估
    #   有 advisor_context → Advisor 规划
    #   pipeline 模式下纯文本 → phase_done 推进阶段
    #   普通纯文本 → 结束
    graph.add_conditional_edges("agent", agent_router)

    # 风险评估之后：条件路由（safe → 工具执行，其他 → 审批）
    graph.add_conditional_edges("risk_assessment", risk_router)

    # 审批之后：条件路由（approved → 执行，rejected → 通知 AI）
    graph.add_conditional_edges("approval", approval_router)

    # 工具执行完成后 → 回到 agent（继续对话/执行下一步）
    graph.add_edge("tools", "agent")

    # 拒绝后 → 回到 agent（让 AI 重新考虑）
    graph.add_edge("rejection", "agent")

    # --- P3 多代理流水线边 ---

    # Advisor 完成后 → pipeline_router（6 分支：agent/browser/dispatcher/reviewer/advisor/__end__）
    graph.add_conditional_edges("advisor", pipeline_router)

    # Browser 浏览器子代理执行完 → phase_done 推进阶段
    graph.add_edge("browser", "phase_done")

    # Dispatcher 拆完子任务 → Executor 执行
    graph.add_edge("dispatcher", "executor")

    # Executor 执行完 → phase_done 推进阶段
    graph.add_edge("executor", "phase_done")

    # Reviewer 审查完 → phase_done 推进阶段
    graph.add_edge("reviewer", "phase_done")

    # phase_done 推进后 → pipeline_router（决定下一步走向）
    graph.add_conditional_edges("phase_done", pipeline_router)

    return graph


def compile_graph(checkpointer=None):
    """
    编译图，返回可执行的 CompiledGraph

    Args:
        checkpointer: 检查点持久化器（AsyncSqliteSaver），用于对话记忆

    Returns:
        编译后的可执行图
    """
    graph = build_graph()
    # P3 注意：recursion_limit 不在 compile() 设置，
    # 而是在 invoke(config={"recursion_limit": N}) 运行时传入。
    # 调用方（cli.py / api/app.py）需在 invoke 时传入 config.RECURSION_LIMIT。
    return graph.compile(checkpointer=checkpointer)
