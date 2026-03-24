"""
OpenSys 安全评估模块

负责对 AI Agent 的工具调用进行风险评估，决定是否需要用户审批。
核心逻辑：
1. 解析 tool_calls 中的命令内容
2. 根据命令内容 + 当前授权等级 → 判定风险等级
3. 返回 safe / moderate / dangerous 三级风险评估
"""

from typing import Literal
from langchain_core.messages import AIMessage
from .config import (
    SAFE_COMMAND_PREFIXES,
    DANGEROUS_COMMAND_KEYWORDS,
    AuthLevel,
)


def assess_risk(
    tool_calls: list[dict],
    auth_level: int = AuthLevel.RESTRICTED,
) -> Literal["safe", "moderate", "dangerous"]:
    """
    评估工具调用的风险等级

    Args:
        tool_calls: AI 生成的工具调用列表
        auth_level: 当前授权等级

    Returns:
        "safe" — 免审批直接执行
        "moderate" — 需要用户审批
        "dangerous" — 高危操作，必须审批且需详细展示
    """
    # 没有工具调用，安全
    if not tool_calls:
        return "safe"

    highest_risk = "safe"

    for tc in tool_calls:
        tool_name = tc.get("name", "")
        args = tc.get("args", {})

        # ask_user / write_todos / update_memory / search_scripts 工具始终安全（不执行任何系统命令）
        if tool_name in ("ask_user", "write_todos", "update_memory", "search_scripts"):
            continue

        # 提取要评估的命令内容
        command = ""
        if tool_name == "run_terminal":
            command = args.get("command", "")
        elif tool_name == "write_and_run_script":
            command = args.get("script_content", "")

        if not command:
            continue

        # 评估单条命令的风险
        risk = _assess_command_risk(command, auth_level)

        # 取最高风险等级
        if risk == "dangerous":
            return "dangerous"  # 只要有一个危险命令，整体就是危险
        elif risk == "moderate":
            highest_risk = "moderate"

    return highest_risk


def _assess_command_risk(
    command: str,
    auth_level: int,
) -> Literal["safe", "moderate", "dangerous"]:
    """
    评估单条命令的风险等级

    评估逻辑（优先级从高到低）：
    1. 高危关键词匹配 → dangerous（不受授权等级影响）
    2. 安全基线白名单匹配 → safe（仅在 auth_level >= RESTRICTED 时）
    3. 授权等级判断 → 根据等级决定 safe 还是 moderate
    """
    cmd_lower = command.lower().strip()

    # --- 第一优先级：高危命令始终需要审批 ---
    for keyword in DANGEROUS_COMMAND_KEYWORDS:
        if keyword.lower() in cmd_lower:
            return "dangerous"

    # --- 第二优先级：观察者模式下一切都需要审批 ---
    if auth_level <= AuthLevel.OBSERVER:
        return "moderate"

    # --- 第三优先级：安全基线白名单（只读命令免审批）---
    if auth_level >= AuthLevel.RESTRICTED:
        # 提取命令的第一个词（处理管道和链式命令只看开头）
        first_cmd = cmd_lower.split("|")[0].split("&&")[0].split(";")[0].strip()
        for safe_prefix in SAFE_COMMAND_PREFIXES:
            if first_cmd.startswith(safe_prefix.lower()):
                return "safe"

    # --- 第四优先级：根据授权等级决定 ---
    if auth_level >= AuthLevel.TRUSTED:
        # 信任级别：非高危命令默认安全
        return "safe"
    elif auth_level >= AuthLevel.STANDARD:
        # 标准级别：不在白名单内的命令需要审批
        return "moderate"
    else:
        # 受限级别：不在白名单内的命令需要审批
        return "moderate"


def format_approval_request(tool_calls: list[dict], risk_level: str) -> str:
    """
    格式化审批请求信息，展示给用户

    Args:
        tool_calls: 需要审批的工具调用列表
        risk_level: 风险等级

    Returns:
        格式化的审批请求文本
    """
    risk_emoji = {"moderate": "⚠️", "dangerous": "🚨"}.get(risk_level, "❓")
    risk_label = {"moderate": "需要确认", "dangerous": "高危操作"}.get(risk_level, "未知")

    lines = [f"{risk_emoji} **{risk_label}** — AI 请求执行以下操作：\n"]

    for i, tc in enumerate(tool_calls, 1):
        tool_name = tc.get("name", "未知工具")
        args = tc.get("args", {})

        if tool_name == "run_terminal":
            cmd = args.get("command", "")
            lines.append(f"  {i}. 📟 执行命令: `{cmd}`")
        elif tool_name == "write_and_run_script":
            lang = args.get("language", "python")
            desc = args.get("description", "")
            content = args.get("script_content", "")
            # 截取前 10 行预览
            preview = "\n".join(content.split("\n")[:10])
            if len(content.split("\n")) > 10:
                preview += f"\n... (共 {len(content.split(chr(10)))} 行)"
            lines.append(f"  {i}. 📝 执行 {lang} 脚本{' — ' + desc if desc else ''}:")
            lines.append(f"  ```{lang}")
            lines.append(f"  {preview}")
            lines.append(f"  ```")
        else:
            lines.append(f"  {i}. 🔧 {tool_name}: {args}")

    lines.append(f"\n请选择: [✅ 批准] [❌ 拒绝] [✏️ 修改后执行]")
    return "\n".join(lines)
