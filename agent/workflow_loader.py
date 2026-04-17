"""
OpenSys Workflow 模板加载器

扫描 data/workflows/ 目录，解析模板文件的 front matter 和 phases 定义。
为 Advisor 提供：
  1. 所有可用模板的摘要列表（注入 Advisor prompt 做选择）
  2. 按名称加载完整模板内容（解析为结构化 phases）

模板文件格式参考 docs/p3-multi-agent-design.md 第五章。
"""

from pathlib import Path
from typing import Optional

from . import config


def _parse_workflow_front_matter(content: str) -> dict:
    """
    解析 workflow 模板文件的 YAML front matter

    提取 --- 之间的元数据字段：name, domain, description, keywords, version

    Args:
        content: 模板文件全文

    Returns:
        front matter 字典
    """
    meta = {}
    lines = content.split("\n")

    # 查找 front matter 区域（两个 --- 之间）
    if not lines or lines[0].strip() != "---":
        return meta

    end_idx = -1
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end_idx = i
            break

    if end_idx < 0:
        return meta

    # 解析 key: value 行
    for line in lines[1:end_idx]:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        key, _, value = stripped.partition(":")
        key = key.strip()
        value = value.strip().strip('"').strip("'")

        # keywords 是列表格式：[word1, word2, ...]
        if key == "keywords" and value.startswith("["):
            value = [w.strip().strip('"').strip("'") for w in value.strip("[]").split(",") if w.strip()]

        meta[key] = value

    return meta


def _parse_workflow_phases(content: str) -> list[dict]:
    """
    解析 workflow 模板文件中的 Phase 定义

    每个 Phase 以 ## Phase N: Name 开头，后续为 - key: value 属性行。

    Args:
        content: 模板文件全文

    Returns:
        phases 列表，每个元素为 {"id": N, "name": "...", "description": "...", ...}
    """
    phases = []
    current_phase = None

    for line in content.split("\n"):
        stripped = line.strip()

        # Phase 标题行：## Phase 1: Understand
        if stripped.startswith("## Phase "):
            # 保存上一个 phase
            if current_phase is not None:
                phases.append(current_phase)

            # 解析 phase 编号和名称
            rest = stripped[len("## Phase "):]
            num_str, _, name = rest.partition(":")
            phase_id = int(num_str.strip()) if num_str.strip().isdigit() else len(phases) + 1
            current_phase = {
                "id": phase_id,
                "name": name.strip().lower() if name.strip() else f"phase_{phase_id}",
            }
            continue

        # Phase 属性行：- key: value
        if current_phase is not None and stripped.startswith("- "):
            kv = stripped[2:].strip()
            key, _, value = kv.partition(":")
            key = key.strip()
            value = value.strip().strip('"').strip("'")

            # 布尔值转换
            if value.lower() == "true":
                value = True
            elif value.lower() == "false":
                value = False

            current_phase[key] = value

    # 保存最后一个 phase
    if current_phase is not None:
        phases.append(current_phase)

    return phases


def discover_workflows() -> list[dict]:
    """
    扫描 data/workflows/ 目录，返回所有可用模板的摘要列表

    返回结果用于注入 Advisor prompt，让 LLM 选择最匹配的模板。
    包含 front matter 元数据和 phases 详情，供 Advisor 直接继承模板结构。

    Returns:
        模板摘要列表，每个元素包含 name, domain, description, keywords, file_name, phases
    """
    workflows_dir = config.WORKFLOWS_DIR
    if not workflows_dir.exists():
        return []

    summaries = []
    for md_file in sorted(workflows_dir.glob("*.md")):
        # 跳过 README
        if md_file.name.lower() == "readme.md":
            continue

        try:
            content = md_file.read_text(encoding="utf-8")
            meta = _parse_workflow_front_matter(content)
            if meta.get("name"):
                # 同时解析 phases，供 Advisor 查看模板内部结构
                phases = _parse_workflow_phases(content)
                summaries.append({
                    "file_name": md_file.stem,  # 不带扩展名的文件名（如 content-creation）
                    "name": meta.get("name", ""),
                    "domain": meta.get("domain", ""),
                    "description": meta.get("description", ""),
                    "keywords": meta.get("keywords", []),
                    "phases": phases,
                })
        except Exception as e:
            print(f"[Workflow] 解析 {md_file.name} 失败: {e}")

    return summaries


def load_workflow(template_name: str) -> Optional[dict]:
    """
    按名称加载完整 workflow 模板（含 front matter + phases）

    Args:
        template_name: 模板文件名（不带 .md 后缀），如 "content-creation"

    Returns:
        完整模板字典：{"meta": {...}, "phases": [...]}，未找到返回 None
    """
    workflows_dir = config.WORKFLOWS_DIR
    md_file = workflows_dir / f"{template_name}.md"

    if not md_file.exists():
        return None

    try:
        content = md_file.read_text(encoding="utf-8")
        meta = _parse_workflow_front_matter(content)
        phases = _parse_workflow_phases(content)

        return {
            "meta": meta,
            "phases": phases,
        }
    except Exception as e:
        print(f"[Workflow] 加载 {template_name} 失败: {e}")
        return None


def format_workflows_for_agent(summaries: list[dict]) -> str:
    """
    为主 Agent 生成精简的工作流模板摘要（非 Pipeline 模式注入 system prompt）

    目的：让 LLM 看到系统有哪些成熟的多阶段工作流，从而更准确地判断
    用户任务是否需要调用 request_planning。
    只输出模板名 + 适用场景，不含 phase 详情（那是 Advisor 的职责）。

    Args:
        summaries: discover_workflows() 的返回值

    Returns:
        格式化的模板摘要文本（约 200-400 字符），注入 SYSTEM_PROMPT 的规划判定段
    """
    if not summaries:
        return ""

    lines = []
    for s in summaries:
        name = s.get("name", "")
        desc = s.get("description", "")
        # 跳过通用兜底模板（general），它不提供判定信息
        if s.get("domain") == "general":
            continue
        lines.append(f"  - **{name}**：{desc}")

    if not lines:
        return ""

    return "\n".join(lines)


def format_workflows_for_advisor(summaries: list[dict]) -> str:
    """
    将模板摘要列表格式化为 Advisor prompt 中的文本

    包含每个模板的 phase 详情（名称+method+skill），
    让 Advisor 能直接继承模板的阶段结构。

    Args:
        summaries: discover_workflows() 的返回值

    Returns:
        格式化的模板列表文本
    """
    if not summaries:
        return "（暂无可用工作流模板，请使用通用流程）"

    lines = []

    for i, s in enumerate(summaries):
        keywords = ", ".join(s.get("keywords", [])) if isinstance(s.get("keywords"), list) else str(s.get("keywords", ""))
        # 模板概要
        lines.append(f"#### {i + 1}. {s['name']}（模板ID: `{s['file_name']}`，领域: {s.get('domain', '-')}）")
        lines.append(f"适用场景：{s.get('description', '-')}")
        if keywords:
            lines.append(f"触发关键词：{keywords}")

        # phase 详情
        phases = s.get("phases", [])
        if phases:
            lines.append("阶段列表：")
            for p in phases:
                method = p.get('method', '?')
                skill = p.get('skill', 'null')
                if skill in ('null', 'None', None, ''):
                    skill = 'null'
                required = '必须' if p.get('required', True) else '可选'
                lines.append(
                    f"  {p.get('id', '?')}. {p.get('name', '?')} — {p.get('description', '')} "
                    f"[method: {method}, skill: {skill}, {required}]"
                )
        lines.append("")  # 空行分隔

    return "\n".join(lines)
