"""
OpenSys 技能系统加载器

从 data/skills/ 目录加载可组合的技能文件，注入到 system prompt 中。

目录结构：
    data/skills/
    ├── README.md                     # 技能系统说明（给用户看）
    ├── systematic-debugging/         # 技能目录
    │   ├── SKILL.md                  # 技能主文件（必须存在，加载入 prompt）
    │   └── root-cause-tracing.md     # 子文档（渐进披露，SKILL.md 中引用时才加载）
    ├── code-review/
    │   └── SKILL.md
    └── ...

加载策略：
1. 始终加载 config.SKILLS_ALWAYS_LOAD 列表中的核心技能
2. 根据用户最新输入的关键词，动态匹配并加载相关技能
3. 总注入字符数不超过 config.SKILLS_MAX_CHARS
4. 每个技能的 SKILL.md 头部 YAML front matter 定义元数据（triggers/priority/description）

技能文件格式（SKILL.md）：
    ---
    name: 系统化调试
    triggers: [调试, debug, 错误, error, bug, 报错, 修复, fix, traceback, 堆栈]
    priority: 10
    description: 四阶段调试流程，根因追溯和纵深防御
    ---
    （正文 Markdown 内容，注入 system prompt）
"""

import re
from pathlib import Path
from typing import Optional

from . import config


# ==================== 技能元数据解析 ====================

def _parse_front_matter(content: str) -> tuple[dict, str]:
    """
    解析 SKILL.md 的 YAML front matter（简易解析，不依赖 PyYAML）

    支持的字段：
    - name: str — 技能显示名称
    - triggers: list[str] — 触发关键词列表
    - priority: int — 优先级（数字越大越优先，默认 0）
    - description: str — 技能简述

    Args:
        content: SKILL.md 文件完整内容

    Returns:
        (metadata_dict, body_text) — 元数据字典和正文内容
    """
    # 检测 YAML front matter 边界（---\n...\n---）
    match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
    if not match:
        return {}, content

    yaml_block = match.group(1)
    body = content[match.end():]

    metadata = {}
    for line in yaml_block.split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip().lower()
        value = value.strip()

        if key in ("triggers", "url_prefixes"):
            # 解析 [a, b, c] 列表格式
            value = value.strip("[]")
            metadata[key] = [t.strip().strip("'\"") for t in value.split(",") if t.strip()]
        elif key == "priority":
            try:
                metadata["priority"] = int(value)
            except ValueError:
                metadata["priority"] = 0
        else:
            metadata[key] = value

    return metadata, body


# ==================== 技能发现与索引 ====================

def discover_skills() -> list[dict]:
    """
    扫描 data/skills/ 目录，发现所有可用技能

    支持两级目录结构：
    - 一级：skills/systematic-debugging/SKILL.md
    - 二级：skills/browser/douyin-creator/SKILL.md（分类子目录）

    分类子目录（如 browser/）本身没有 SKILL.md，只是组织用途。

    Returns:
        技能列表，每项包含：
        {
            "dir_name": str,       # 技能目录名（如 "douyin-creator"）
            "category": str,       # 分类目录名（如 "browser"），一级目录为空字符串
            "skill_path": Path,    # SKILL.md 绝对路径
            "metadata": dict,      # 解析后的 front matter
            "body": str,           # 正文内容
            "char_count": int,     # 正文字符数
        }
    """
    skills_dir = config.SKILLS_DIR
    if not skills_dir.exists():
        return []

    skills = []

    def _try_load_skill(skill_dir: Path, category: str = "") -> bool:
        """尝试从目录加载 SKILL.md，成功返回 True"""
        skill_file = skill_dir / "SKILL.md"
        if not skill_file.exists():
            return False

        try:
            content = skill_file.read_text(encoding="utf-8")
        except Exception as e:
            print(f"[技能系统] 读取失败 {skill_file}: {e}")
            return False

        metadata, body = _parse_front_matter(content)

        skills.append({
            "dir_name": skill_dir.name,
            "category": category,
            "skill_path": skill_file,
            "metadata": metadata,
            "body": body.strip(),
            "char_count": len(body.strip()),
        })
        return True

    # 遍历 skills/ 下的子目录（一级）
    for item in sorted(skills_dir.iterdir()):
        if not item.is_dir():
            continue

        # 尝试一级目录直接加载（如 skills/systematic-debugging/SKILL.md）
        if _try_load_skill(item):
            continue

        # 一级目录没有 SKILL.md → 当作分类子目录，遍历其下的二级目录
        # 如 skills/browser/douyin-creator/SKILL.md
        for sub_item in sorted(item.iterdir()):
            if sub_item.is_dir():
                _try_load_skill(sub_item, category=item.name)

    return skills


# ==================== 技能匹配与选择 ====================

def match_skills(
    user_query: str,
    all_skills: list[dict],
    always_load: list[str] = None,
    max_chars: int = None,
) -> list[dict]:
    """
    根据用户输入匹配并选择要加载的技能

    匹配策略：
    1. always_load 列表中的技能无条件加载
    2. 用户输入包含技能 triggers 中的关键词时加载该技能
    3. 按 priority 降序排列
    4. 累计字符数超过 max_chars 时截断

    Args:
        user_query: 用户最新输入文本
        all_skills: discover_skills() 返回的技能列表
        always_load: 始终加载的技能目录名列表
        max_chars: 总字符数上限

    Returns:
        选中的技能列表（已排序、已截断）
    """
    always_load = always_load if always_load is not None else config.SKILLS_ALWAYS_LOAD
    max_chars = max_chars or config.SKILLS_MAX_CHARS

    if not all_skills:
        return []

    query_lower = user_query.lower() if user_query else ""

    selected = []
    for skill in all_skills:
        dir_name = skill["dir_name"]
        metadata = skill["metadata"]

        # 始终加载的核心技能
        if dir_name in always_load:
            skill["_match_reason"] = "always_load"
            selected.append(skill)
            continue

        # 跳过非主 Agent 的技能（如 target_role=browser 的技能由 match_browser_skills 单独处理）
        target_role = metadata.get("target_role", "")
        if target_role and target_role != "agent":
            continue

        # 关键词匹配
        triggers = metadata.get("triggers", [])
        matched_triggers = [t for t in triggers if t.lower() in query_lower]
        if matched_triggers:
            skill["_match_reason"] = f"keyword:{','.join(matched_triggers)}"
            selected.append(skill)

    # 按 priority 降序排序（核心技能优先）
    selected.sort(key=lambda s: s["metadata"].get("priority", 0), reverse=True)

    # 字符数截断
    result = []
    total_chars = 0
    for skill in selected:
        if total_chars + skill["char_count"] > max_chars:
            # 尝试截断当前技能内容以适配剩余空间
            remaining = max_chars - total_chars
            if remaining > 500:  # 至少保留 500 字符才值得截断加载
                truncated_skill = skill.copy()
                truncated_skill["body"] = skill["body"][:remaining] + "\n\n... [技能内容已截断]"
                truncated_skill["char_count"] = remaining
                result.append(truncated_skill)
            break
        result.append(skill)
        total_chars += skill["char_count"]

    return result


# ==================== 格式化注入 ====================

def format_skills_for_prompt(skills: list[dict]) -> str:
    """
    将选中的技能格式化为可注入 system prompt 的文本

    格式：
    ## 🎯 已激活技能

    ### [技能名称]
    [技能正文]

    Args:
        skills: match_skills() 返回的选中技能列表

    Returns:
        格式化后的文本，空字符串表示无技能加载
    """
    if not skills:
        return ""

    lines = ["\n\n## 🎯 已激活技能\n"]

    for skill in skills:
        metadata = skill["metadata"]
        name = metadata.get("name", skill["dir_name"])
        desc = metadata.get("description", "")
        reason = skill.get("_match_reason", "")

        header = f"### {name}"
        if desc:
            header += f" — {desc}"

        lines.append(header)
        lines.append(skill["body"])
        lines.append("")  # 空行分隔

    return "\n".join(lines)


# ==================== 主入口（供 graph.py 调用） ====================

def load_skills_for_prompt(user_query: str = "") -> str:
    """
    一站式接口：发现技能 → 匹配选择 → 格式化注入

    在 graph.py 的 _build_system_prompt() 中调用，
    将匹配的技能内容追加到 system prompt。

    Args:
        user_query: 用户最新输入文本（用于关键词匹配）

    Returns:
        格式化后的技能文本（直接拼接到 system prompt），
        无匹配技能时返回空字符串
    """
    all_skills = discover_skills()
    if not all_skills:
        return ""

    selected = match_skills(user_query, all_skills)
    if not selected:
        return ""

    result = format_skills_for_prompt(selected)
    if result:
        skill_names = [s["metadata"].get("name", s["dir_name"]) for s in selected]
        print(f"[技能系统] 已加载 {len(selected)} 个技能: {', '.join(skill_names)}")
        # 发布 skill_loaded 事件到全局事件总线（供前端展示当前激活的技能）
        from . import event_bus
        for s in selected:
            event_bus.publish({
                "type": "skill_loaded",
                "skill_name": s["dir_name"],
                "display_name": s["metadata"].get("name", s["dir_name"]),
                "node": "agent",
                "phase": None,
            })

    return result


# ==================== 按名称加载技能内容（供 Executor 使用） ====================

# ==================== 按 URL 匹配浏览器技能（供 web_tool 使用） ====================

def _extract_urls_from_text(text: str) -> list[str]:
    """
    从文本中提取所有 http/https URL

    用于 LLM 没有将 URL 放到 url 参数而是写在 task 文本中的情况。
    """
    import re
    return re.findall(r'https?://[^\s,，、;；\'")\]]+', text)


def match_browser_skills(url: str, task: str = "") -> str:
    """
    按目标 URL 前缀匹配 target_role=browser 的技能

    只有当目标 URL 匹配技能 front matter 中的 url_prefixes 时才加载，
    实现按需导入，避免无关技能浪费 token。

    匹配来源（按优先级）：
    1. url 参数直接匹配
    2. task 文本中提取的 URL 匹配（兼容 LLM 不传 url 参数的情况）
    3. task 中包含 triggers 关键词（兜底）

    技能 SKILL.md front matter 需包含：
        target_role: browser
        url_prefixes: [https://creator.douyin.com/creator-micro, ...]

    Args:
        url: 浏览器目标 URL（可能为空）
        task: 任务描述（可能包含 URL）

    Returns:
        匹配的技能正文拼接文本，无匹配返回空字符串
    """
    if not url and not task:
        return ""

    all_skills = discover_skills()
    if not all_skills:
        return ""

    # 收集所有候选 URL：url 参数 + task 文本中提取的 URL
    candidate_urls = []
    if url:
        candidate_urls.append(url.lower())
    # 从 task 中提取 URL（LLM 经常把 URL 写在 task 文本里而非 url 参数）
    if task:
        for extracted in _extract_urls_from_text(task):
            extracted_lower = extracted.lower()
            if extracted_lower not in candidate_urls:
                candidate_urls.append(extracted_lower)

    matched = []
    task_lower = task.lower() if task else ""

    for skill in all_skills:
        metadata = skill["metadata"]
        # 只匹配 target_role=browser 的技能
        if metadata.get("target_role") != "browser":
            continue

        # 按 url_prefixes 前缀匹配（核心过滤条件）
        url_prefixes = metadata.get("url_prefixes", [])
        if not url_prefixes:
            continue

        # 任一候选 URL 匹配任一前缀即命中
        if any(
            candidate.startswith(prefix.lower())
            for candidate in candidate_urls
            for prefix in url_prefixes
        ):
            matched.append(skill)
            continue

        # 辅助：task 中包含 triggers 关键词也可命中（兜底）
        triggers = metadata.get("triggers", [])
        if triggers and any(t.lower() in task_lower for t in triggers):
            matched.append(skill)

    if not matched:
        return ""

    # 按 priority 降序
    matched.sort(key=lambda s: s["metadata"].get("priority", 0), reverse=True)

    # 拼接技能内容
    parts = []
    for skill in matched:
        name = skill["metadata"].get("name", skill["dir_name"])
        parts.append(f"\n--- 网站操作指南: {name} ---\n{skill['body']}")
        print(f"[技能系统] 浏览器技能命中: {name} (URL 匹配)")

    return "\n".join(parts)


def format_skills_for_advisor() -> str:
    """
    为 Advisor 生成可用技能摘要表

    Advisor 在规划 pipeline 时需要知道有哪些技能可用，
    以便在 phase 定义中正确填写 skill 字段。

    只列出 target_role 为 agent/executor 的执行类技能（供 phase.skill 引用），
    reviewer/browser 类技能由各自节点自动匹配，Advisor 不需要显式指定。

    Returns:
        格式化的技能摘要表文本，无技能时返回空字符串
    """
    all_skills = discover_skills()
    if not all_skills:
        return ""

    # 分类：执行类技能（Advisor 可指定）vs 自动匹配类技能（仅告知）
    assignable = []   # target_role in (agent, executor, "")
    auto_match = []   # target_role in (browser, reviewer)

    for skill in all_skills:
        meta = skill["metadata"]
        role = meta.get("target_role", "")
        name = meta.get("name", skill["dir_name"])
        # 优先使用 summary（更详细），fallback 到 description
        detail = meta.get("summary") or meta.get("description", "")
        # key_rules：browser 技能的关键约束规则（供 Advisor 写入 phase.details）
        key_rules = meta.get("key_rules", "")
        dir_name = skill["dir_name"]

        # url_prefixes：browser 技能的 URL 前缀列表（供 Advisor 按 URL 选择 browser_skill）
        url_prefixes = meta.get("url_prefixes", [])

        entry = {"dir_name": dir_name, "name": name, "detail": detail, "role": role or "agent", "key_rules": key_rules, "url_prefixes": url_prefixes}

        if role in ("browser", "reviewer"):
            auto_match.append(entry)
        else:
            assignable.append(entry)

    if not assignable and not auto_match:
        return ""

    lines = []

    # 可指定技能（Advisor 在 phase.skill 字段中引用）
    if assignable:
        lines.append("### 可指定技能（填入 phase.skill 字段）")
        for s in assignable:
            lines.append(f"- **{s['name']}**（skill ID: `{s['dir_name']}`，角色: {s['role']}）")
            lines.append(f"  {s['detail']}")

    # 自动匹配技能：browser 技能需要填入 browser_skill 字段，reviewer 技能完全自动匹配
    if auto_match:
        lines.append("")
        # 按角色分组展示
        browser_skills = [s for s in auto_match if s["role"] == "browser"]
        reviewer_skills = [s for s in auto_match if s["role"] != "browser"]

        if browser_skills:
            lines.append("### 浏览器技能（browser 阶段必须在 `browser_skill` 字段中填入匹配的 skill ID）")
            for s in browser_skills:
                url_info = f"，URL 前缀: {', '.join(s['url_prefixes'])}" if s.get("url_prefixes") else ""
                lines.append(f"- **{s['name']}**（skill ID: `{s['dir_name']}`{url_info}）")
                lines.append(f"  {s['detail']}")
                # 如果有 key_rules，展示给 Advisor 以便写入 phase.details
                if s.get("key_rules"):
                    lines.append(f"  **⚠️ 关键约束（必须写入 phase.details）**：{s['key_rules']}")

        if reviewer_skills:
            lines.append("")
            lines.append("### 审查技能（无需指定，系统自动匹配）")
            for s in reviewer_skills:
                lines.append(f"- **{s['name']}**（{s['role']}）：{s['detail']}")

    return "\n".join(lines)


def load_skill_content(skill_name: str) -> str | None:
    """
    按技能目录名加载 SKILL.md 的正文内容（不含 front matter）

    供 Executor 节点在执行子任务时注入技能指令。
    支持两级目录查找：先在一级目录找，找不到则遍历分类子目录。

    Args:
        skill_name: 技能目录名（如 "content-writing" 或 "douyin-creator"）

    Returns:
        SKILL.md 正文内容，未找到返回 None
    """
    skills_dir = config.SKILLS_DIR

    # 候选路径列表：一级目录 + 所有分类子目录下的同名目录
    candidates = [skills_dir / skill_name / "SKILL.md"]
    # 遍历分类子目录（如 browser/）
    if skills_dir.exists():
        for category_dir in skills_dir.iterdir():
            if category_dir.is_dir() and not (category_dir / "SKILL.md").exists():
                # 这是一个分类目录（本身没有 SKILL.md）
                candidates.append(category_dir / skill_name / "SKILL.md")

    for skill_file in candidates:
        if not skill_file.exists():
            continue
        try:
            content = skill_file.read_text(encoding="utf-8")
            # 去掉 front matter，只取正文
            _meta, body = _parse_front_matter(content)
            if body:
                # 发布 skill_loaded 事件（供前端展示技能激活状态）
                from . import event_bus
                event_bus.publish({
                    "type": "skill_loaded",
                    "skill_name": skill_name,
                    "display_name": _meta.get("name", skill_name),
                    "node": "executor",
                    "phase": None,
                })
            return body.strip() if body else None
        except Exception as e:
            print(f"[技能系统] 加载 {skill_name} 失败: {e}")
            return None


def load_skill_script(skill_name: str) -> Path | None:
    """
    按技能目录名查找预置脚本文件（script.py）

    仅当 SKILL.md front matter 中声明 script: true 时才会被调用。
    脚本必须实现 async def run(session, page, params, ask_user_fn) -> dict 接口。

    Args:
        skill_name: 技能目录名（如 "wechat-article"）

    Returns:
        script.py 的绝对路径，未找到返回 None
    """
    skills_dir = config.SKILLS_DIR

    # 候选路径：一级目录 + 分类子目录
    candidates = [skills_dir / skill_name / "script.py"]
    if skills_dir.exists():
        for category_dir in skills_dir.iterdir():
            if category_dir.is_dir() and not (category_dir / "SKILL.md").exists():
                candidates.append(category_dir / skill_name / "script.py")

    for script_file in candidates:
        if script_file.exists():
            return script_file

    return None
