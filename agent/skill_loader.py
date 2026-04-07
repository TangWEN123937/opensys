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

        if key == "triggers":
            # 解析 [a, b, c] 列表格式
            value = value.strip("[]")
            metadata["triggers"] = [t.strip().strip("'\"") for t in value.split(",") if t.strip()]
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

    Returns:
        技能列表，每项包含：
        {
            "dir_name": str,       # 目录名（如 "systematic-debugging"）
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
    # 遍历 skills/ 下的子目录
    for skill_dir in sorted(skills_dir.iterdir()):
        if not skill_dir.is_dir():
            continue

        skill_file = skill_dir / "SKILL.md"
        if not skill_file.exists():
            continue

        try:
            content = skill_file.read_text(encoding="utf-8")
        except Exception as e:
            print(f"[技能系统] 读取失败 {skill_file}: {e}")
            continue

        metadata, body = _parse_front_matter(content)

        skills.append({
            "dir_name": skill_dir.name,
            "skill_path": skill_file,
            "metadata": metadata,
            "body": body.strip(),
            "char_count": len(body.strip()),
        })

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

    return result
