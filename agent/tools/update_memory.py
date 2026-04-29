"""
update_memory Tool — AI 主动管理用户记忆文档

安全的"先读后写"设计：
  1. action='read'     — 读取全部记忆内容（修改前必须先调用）
  2. action='sections' — 查看文档段落结构
  3. action='append'   — 向指定章节追加条目（推荐，不会丢失已有内容）
  4. action='rewrite'  — 完全重写指定章节（会覆盖该章节，需谨慎）

记忆文档会在每次对话时加载到 system prompt 中，
让 AI 在新对话中也能记住用户的重要信息。
"""

import re
from typing import Optional, List, Dict
from pathlib import Path
from langchain_core.tools import tool

from .. import config


# 模块级别：记录当前对话是否已读取过记忆
_has_read_memory = False


# ==================== 安全扫描（防 prompt injection）====================

# 危险模式：尝试通过记忆注入篡改 system prompt 行为的模式
_INJECTION_PATTERNS = [
    # 角色劫持：尝试修改 AI 身份或角色
    (r'(?i)(you\s+are\s+now|from\s+now\s+on\s+you|ignore\s+previous|forget\s+all|disregard\s+instructions)',
     "角色劫持尝试"),
    # 系统指令伪装：尝试伪装成系统消息
    (r'(?i)(\[system\]|\[INST\]|<\|system\|>|<system>|<<SYS>>)',
     "系统指令伪装"),
    # 凭据窃取：尝试让 AI 泄露密钥/令牌
    (r'(?i)(reveal\s+your\s+(api|secret|key|token|password)|output\s+your\s+(system|instructions|prompt))',
     "凭据窃取尝试"),
    # 不可见 Unicode 字符（零宽空格、不可见连接符等，常用于隐藏指令）
    (r'[\u200b\u200c\u200d\u2060\ufeff]',
     "检测到不可见 Unicode 字符（可能用于隐藏指令）"),
]


def _scan_injection(content: str) -> str | None:
    """
    扫描内容中是否包含 prompt injection 模式

    Args:
        content: 待写入的记忆内容

    Returns:
        None 表示安全，str 表示拦截原因
    """
    for pattern, reason in _INJECTION_PATTERNS:
        if re.search(pattern, content):
            return reason
    return None


# ==================== 去重检查 ====================

def _check_duplicate(existing_content: str, new_content: str) -> str | None:
    """
    检查新内容是否与已有记忆中的条目重复

    检查策略：
    1. 完全相同的条目（去除首尾空白后）
    2. 新内容的每一行是否已存在于现有内容中（逐行检查）

    Args:
        existing_content: 已有的 memory.md 全文
        new_content: 即将追加的内容

    Returns:
        None 表示无重复，str 表示重复的条目文本
    """
    # 将已有内容的每一行规范化后存入集合（快速查找）
    existing_lines = set()
    for line in existing_content.split("\n"):
        stripped = line.strip()
        if stripped and stripped.startswith("- "):
            existing_lines.add(stripped)

    # 检查新内容中的每一行是否已存在
    duplicates = []
    for line in new_content.split("\n"):
        stripped = line.strip()
        if stripped and stripped.startswith("- ") and stripped in existing_lines:
            duplicates.append(stripped)

    if duplicates:
        return "\n".join(duplicates[:3])  # 最多展示 3 条重复
    return None


def _read_memory_file() -> str:
    """读取 memory.md 文件内容，不存在则返回默认模板"""
    memory_path: Path = config.MEMORY_FILE
    if memory_path.exists():
        return memory_path.read_text(encoding="utf-8")
    return "# OpenSys 用户记忆\n"


def _write_memory_file(content: str) -> None:
    """写入 memory.md 文件"""
    config.MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    config.MEMORY_FILE.write_text(content, encoding="utf-8")


def _parse_sections(text: str) -> List[Dict[str, str]]:
    """解析 markdown 章节结构，返回 [{name, line_count, preview}]"""
    sections = []
    current_name = None
    current_lines = []

    for line in text.split("\n"):
        if line.startswith("## "):
            # 保存上一个章节
            if current_name is not None:
                sections.append({
                    "name": current_name,
                    "line_count": len([l for l in current_lines if l.strip()]),
                    "preview": "\n".join(current_lines[:3]),  # 前 3 行预览
                })
            current_name = line[3:].strip()
            current_lines = []
        elif current_name is not None:
            current_lines.append(line)

    # 最后一个章节
    if current_name is not None:
        sections.append({
            "name": current_name,
            "line_count": len([l for l in current_lines if l.strip()]),
            "preview": "\n".join(current_lines[:3]),
        })

    return sections


def _replace_section(text: str, header: str, new_content: str) -> str:
    """替换指定章节的全部内容"""
    lines = text.split("\n")
    result = []
    in_section = False

    for line in lines:
        if line.strip() == header.strip():
            # 找到目标章节，写入新内容
            result.append(line)
            result.append(new_content.rstrip("\n"))
            in_section = True
            continue

        if in_section:
            # 遇到下一个 ## 章节，结束跳过
            if line.startswith("## "):
                in_section = False
                result.append(line)
            # 否则跳过旧内容
            continue

        result.append(line)

    return "\n".join(result) + "\n"


def _append_to_section(text: str, header: str, new_content: str) -> str:
    """在指定章节末尾追加内容"""
    lines = text.split("\n")
    result = []
    in_section = False
    appended = False

    for i, line in enumerate(lines):
        if line.strip() == header.strip():
            in_section = True
            result.append(line)
            continue

        if in_section and not appended:
            if line.startswith("## ") or (i == len(lines) - 1):
                # 在章节结尾插入新内容
                if i == len(lines) - 1 and not line.startswith("## "):
                    result.append(line)
                result.append(new_content.rstrip("\n"))
                appended = True
                in_section = False
                if line.startswith("## "):
                    result.append(line)
                continue

        result.append(line)

    # 如果章节在文件最后且没有追加（边界情况）
    if in_section and not appended:
        result.append(new_content.rstrip("\n"))

    return "\n".join(result) + "\n"


@tool
def update_memory(
    action: str,
    section: Optional[str] = None,
    content: Optional[str] = None,
    thought: Optional[str] = None,
) -> str:
    """统一记忆管理工具 — 通过 action 区分操作。

    ⚠️ 重要规则：修改记忆前必须先调用 action='read' 查看现有内容！

    可用的 action：
    - 'read': 读取完整记忆内容（修改前必须先调用）
    - 'sections': 查看文档段落结构概要
    - 'append': 向指定章节追加内容（推荐，安全不覆盖）
    - 'rewrite': 重写指定章节（会覆盖该章节全部内容，谨慎使用）

    Args:
        action: 操作类型，必须是 read / sections / append / rewrite 之一
        section: 目标章节名（append/rewrite 时必填，如 "用户偏好"、"项目上下文"、"重要事实"）
        content: 要写入的内容（append/rewrite 时必填，markdown 格式，每条以 "- " 开头）
        thought: 你的思考过程（可选，说明为什么要做这个操作，不会写入文件）

    Returns:
        操作结果
    """
    global _has_read_memory

    current = _read_memory_file()
    char_count = len(current)

    # ==================== action='read' ====================
    if action == "read":
        _has_read_memory = True
        return (
            f"📝 当前记忆内容（{char_count}/{config.MEMORY_MAX_CHARS} 字符）：\n"
            f"---\n{current}---\n"
            f"提示：使用 action='append' 追加，action='rewrite' 重写指定章节。"
        )

    # ==================== action='sections' ====================
    if action == "sections":
        _has_read_memory = True  # 查看结构也算"读取"
        sections = _parse_sections(current)
        if not sections:
            return "记忆文档为空，没有章节。"
        lines = [f"📑 记忆文档结构（{char_count}/{config.MEMORY_MAX_CHARS} 字符）："]
        for s in sections:
            lines.append(f"  - ## {s['name']} ({s['line_count']} 条)")
        return "\n".join(lines)

    # ==================== 写操作前置检查 ====================
    if action in ("append", "rewrite"):
        # 安全检查：是否已读取过
        if not _has_read_memory:
            return (
                "⚠️ 安全拦截：修改记忆前必须先调用 action='read' 查看现有内容！\n"
                "请先执行 update_memory(action='read')，确认现有记忆后再决定追加或重写。"
            )

        # 参数检查
        if not section:
            return "❌ 参数错误：append/rewrite 操作需要指定 section 参数。"
        if not content:
            return "❌ 参数错误：append/rewrite 操作需要指定 content 参数。"

        # 安全扫描：检测 prompt injection 模式
        injection_reason = _scan_injection(content)
        if injection_reason:
            return (
                f"🛡️ 安全拦截：内容包含可疑模式——{injection_reason}\n"
                f"记忆内容会注入 system prompt，不允许包含可能篡改 AI 行为的指令。\n"
                f"请修改内容后重试。"
            )

        # 去重检查（仅 append 时检查）
        if action == "append":
            dup = _check_duplicate(current, content)
            if dup:
                return (
                    f"⚠️ 去重拦截：以下条目已存在于记忆中，无需重复添加：\n{dup}\n"
                    f"如需更新已有条目，请使用 action='rewrite' 重写该章节。"
                )

        section_header = f"## {section}"

        if action == "append":
            # 追加到章节末尾
            if section_header not in current:
                # 章节不存在，创建新章节
                new_text = current.rstrip("\n") + f"\n\n{section_header}\n{content}\n"
            else:
                new_text = _append_to_section(current, section_header, content)

        elif action == "rewrite":
            # 重写整个章节
            if section_header not in current:
                new_text = current.rstrip("\n") + f"\n\n{section_header}\n{content}\n"
            else:
                new_text = _replace_section(current, section_header, content)

        # 大小限制检查
        if len(new_text) > config.MEMORY_MAX_CHARS:
            return (
                f"⚠️ 写入后将达 {len(new_text)} 字符，"
                f"超过上限 {config.MEMORY_MAX_CHARS} 字符。\n"
                f"请先用 action='rewrite' 精简已有章节，再添加新内容。"
            )

        # 写入文件
        _write_memory_file(new_text)
        action_label = "追加" if action == "append" else "重写"
        return (
            f"✅ 记忆已{action_label} [{section}]"
            f"（当前 {len(new_text)}/{config.MEMORY_MAX_CHARS} 字符）"
        )

    # ==================== 未知 action ====================
    return (
        f"❌ 未知操作: '{action}'。\n"
        f"可用的 action: read / sections / append / rewrite"
    )
