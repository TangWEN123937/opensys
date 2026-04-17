"""
OpenSys 安全评估模块

负责对 AI Agent 的工具调用进行多层风险评估，决定是否需要用户审批。

三层防御架构：
  第 1 层（命令级）：高危关键词匹配 + 安全基线白名单 → safe/moderate/dangerous
  第 2 层（脚本内容级）：正则匹配脚本中的危险模式（eval/exec/os.system 等）→ 提升风险等级
  第 3 层（环境守卫）：检测命令目标路径、网络地址等环境上下文风险 → 附加警告信息
"""

import re
from typing import Literal
from langchain_core.messages import AIMessage
from .config import (
    SAFE_COMMAND_PREFIXES,
    DANGEROUS_COMMAND_KEYWORDS,
    AuthLevel,
)


# ==================== 第二层防御：脚本内容高危模式 ====================

# 匹配脚本代码中的危险模式（正则表达式列表）
# 命中时将 write_and_run_script 的风险等级从 safe 提升为 moderate
DANGEROUS_SCRIPT_PATTERNS = [
    (r"os\.system\s*\(", "os.system() 直接执行系统命令"),
    (r"subprocess\.(?:call|run|Popen).*shell\s*=\s*True", "subprocess shell=True 不安全调用"),
    (r"^[^#\n]*\beval\s*\(", "eval() 动态代码执行"),
    (r"^[^#\n]*\bexec\s*\(", "exec() 动态代码执行"),
    (r"__import__\s*\(", "__import__() 动态导入"),
    (r"open\s*\(.*['\"]\s*/etc", "读取 /etc 系统敏感文件"),
    (r"open\s*\(.*['\"]\s*/proc", "读取 /proc 系统文件"),
    (r"\bsocket\.connect\b", "socket 直连（可能的网络穿透）"),
    (r"\brequests\.(?:get|post|put|delete)\s*\(\s*['\"]http://(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)", "HTTP 请求内网地址（SSRF 风险）"),
    (r"\bctypes\b", "ctypes 调用（可能绕过 Python 安全机制）"),
]


# ==================== 第三层防御：环境守卫配置 ====================

# rm/chmod/chown 等命令禁止作用的关键路径
PROTECTED_PATHS = [
    "/", "/home", "/etc", "/usr", "/var", "/boot", "/root",
    "/bin", "/sbin", "/lib", "/lib64", "/opt", "/sys", "/proc",
]

# 内网地址段（SSRF 防护）
INTERNAL_NETWORK_PATTERNS = [
    r"(?:^|\s|//)10\.\d+\.\d+\.\d+",
    r"(?:^|\s|//)172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+",
    r"(?:^|\s|//)192\.168\.\d+\.\d+",
    r"(?:^|\s|//)127\.\d+\.\d+\.\d+",
    r"(?:^|\s|//)localhost",
    r"(?:^|\s|//)0\.0\.0\.0",
]


def _web_needs_browser(task: str) -> bool:
    """判断 web_tool 的 task 是否需要浏览器交互（复用 config 关键词列表）"""
    from .config import WEB_TOOL_BROWSE_KEYWORDS
    task_lower = task.lower()
    return any(kw in task_lower for kw in WEB_TOOL_BROWSE_KEYWORDS)


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

        # ask_user / write_todos / update_memory / request_planning 工具始终安全（不执行任何系统命令）
        if tool_name in ("ask_user", "write_todos", "update_memory", "request_planning"):
            continue

        # web_tool：search/extract 模式安全，browse 模式需审批
        if tool_name == "web_tool":
            web_mode = args.get("mode", "auto")
            task_text = args.get("task", "")
            # browse 模式或含浏览器关键词 → moderate（需用户确认）
            if web_mode == "browse" or (web_mode == "auto" and _web_needs_browser(task_text)):
                risk = "moderate"
                if risk == "dangerous":
                    return "dangerous"
                highest_risk = "moderate"
            # search / extract / auto（无浏览器关键词）→ safe
            continue

        # 分路径评估：run_terminal 走第 1 层（命令级），write_and_run_script 走第 2 层（脚本级）
        if tool_name == "run_terminal":
            command = args.get("command", "")
            if not command:
                continue
            # 第 1 层：命令级风险评估（shell 命令关键词 + 安全白名单 + 授权等级）
            risk = _assess_command_risk(command, auth_level)

        elif tool_name == "write_and_run_script":
            script_content = args.get("script_content", "")
            if not script_content:
                continue
            # 第 2 层：脚本内容安全扫描（正则匹配危险模式，不做 shell 级关键词检查）
            risk = _assess_script_risk(script_content)
            # 脚本在非 TRUSTED 授权级别下，即使通过扫描也需要审批
            if risk == "safe" and auth_level < AuthLevel.STANDARD:
                risk = "moderate"

        else:
            continue

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


# ==================== 第二层防御：脚本内容安全扫描 ====================

def _assess_script_risk(script_content: str) -> Literal["safe", "moderate"]:
    """
    扫描脚本内容中的危险模式（第二层防御）

    匹配到危险模式时返回 moderate（让用户审查脚本内容后决定），
    不直接返回 dangerous（避免误判导致过多审批弹窗）。

    Args:
        script_content: 脚本代码全文

    Returns:
        "safe" — 未发现危险模式
        "moderate" — 发现危险模式，需要用户审查
    """
    if not script_content:
        return "safe"

    for pattern, _ in DANGEROUS_SCRIPT_PATTERNS:
        try:
            if re.search(pattern, script_content, re.IGNORECASE | re.MULTILINE):
                return "moderate"
        except re.error:
            continue

    return "safe"


def get_script_warnings(script_content: str) -> list[str]:
    """
    获取脚本内容中所有匹配的危险模式警告（用于审批展示）

    Args:
        script_content: 脚本代码全文

    Returns:
        警告信息列表（空列表 = 安全）
    """
    if not script_content:
        return []

    warnings = []
    for pattern, description in DANGEROUS_SCRIPT_PATTERNS:
        try:
            if re.search(pattern, script_content, re.IGNORECASE | re.MULTILINE):
                warnings.append(f"⚠️ 脚本含 {description}")
        except re.error:
            continue

    return warnings


# ==================== 第三层防御：环境守卫检查 ====================

def check_environment_guards(command: str) -> list[str]:
    """
    环境守卫检查：识别在特定上下文中的危险操作（第三层防御）

    检查规则：
    1. rm/chmod/chown 命令是否作用于受保护的系统路径
    2. 网络请求是否指向内网地址（SSRF 防护）
    3. pip/apt install 是否安装了可疑包
    4. 重定向是否覆盖系统关键文件

    Args:
        command: 要检查的命令文本

    Returns:
        警告信息列表（空列表 = 安全）
    """
    if not command:
        return []

    warnings = []
    cmd_lower = command.lower().strip()

    # --- 规则 1：危险命令 + 受保护路径 ---
    dangerous_cmds = ["rm ", "rm\t", "chmod ", "chown ", "mv ", "rmdir "]
    for dcmd in dangerous_cmds:
        if dcmd in cmd_lower:
            for path in PROTECTED_PATHS:
                # 检查命令参数中是否包含受保护路径（精确前缀匹配）
                if re.search(rf'\s{re.escape(path)}(?:\s|/|$)', command):
                    warnings.append(f"🛡️ `{dcmd.strip()}` 作用于受保护路径 `{path}`")
                    break

    # --- 规则 2：网络请求 + 内网地址 ---
    network_cmds = ["curl ", "wget ", "nc ", "ncat ", "telnet "]
    has_network_cmd = any(nc in cmd_lower for nc in network_cmds)
    if has_network_cmd:
        for pattern in INTERNAL_NETWORK_PATTERNS:
            if re.search(pattern, command):
                warnings.append("🌐 网络请求指向内网地址（SSRF 风险）")
                break

    # --- 规则 3：包安装检查 ---
    if "pip install" in cmd_lower or "pip3 install" in cmd_lower:
        # 提取包名（简单解析，跳过选项参数）
        parts = command.split()
        for j, part in enumerate(parts):
            if part in ("install",) and j > 0:
                for pkg in parts[j+1:]:
                    if pkg.startswith("-"):
                        continue
                    # 可疑包名检测：包名与常见包高度相似但不同（typosquatting）
                    # 这里只做简单的长度和字符检查
                    if len(pkg) <= 2:
                        warnings.append(f"📦 安装了极短包名 `{pkg}`（可能是 typosquatting）")
                break

    if "apt install" in cmd_lower or "apt-get install" in cmd_lower:
        warnings.append("📦 正在安装系统级包（可能影响容器环境）")

    # --- 规则 4：重定向覆盖系统文件 ---
    redirect_match = re.search(r'>\s*(/(?:etc|boot|usr|bin|sbin|lib|proc|sys)/\S+)', command)
    if redirect_match:
        target = redirect_match.group(1)
        warnings.append(f"📝 重定向输出到系统路径 `{target}`")

    return warnings


# ==================== 格式化审批请求 ====================

def format_approval_request(tool_calls: list[dict], risk_level: str) -> str:
    """
    格式化审批请求信息，展示给用户

    集成第二层（脚本内容扫描）和第三层（环境守卫）的警告信息。

    Args:
        tool_calls: 需要审批的工具调用列表
        risk_level: 风险等级

    Returns:
        格式化的审批请求文本
    """
    risk_emoji = {"moderate": "⚠️", "dangerous": "🚨"}.get(risk_level, "❓")
    risk_label = {"moderate": "需要确认", "dangerous": "高危操作"}.get(risk_level, "未知")

    lines = [f"{risk_emoji} **{risk_label}** — AI 请求执行以下操作：\n"]

    all_warnings = []  # 收集所有层的警告

    for i, tc in enumerate(tool_calls, 1):
        tool_name = tc.get("name", "未知工具")
        args = tc.get("args", {})

        if tool_name == "run_terminal":
            cmd = args.get("command", "")
            lines.append(f"  {i}. 📟 执行命令: `{cmd}`")
            # 第三层：环境守卫检查
            env_warnings = check_environment_guards(cmd)
            all_warnings.extend(env_warnings)

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
            # 第二层：脚本内容安全扫描警告
            script_warnings = get_script_warnings(content)
            all_warnings.extend(script_warnings)
            # 第三层：脚本内容中的环境守卫（如脚本中含 rm 命令）
            env_warnings = check_environment_guards(content)
            all_warnings.extend(env_warnings)

        else:
            lines.append(f"  {i}. 🔧 {tool_name}: {args}")

    # 附加安全警告（去重）
    if all_warnings:
        unique_warnings = list(dict.fromkeys(all_warnings))  # 保序去重
        lines.append("\n🛡️ **安全警告**:")
        for w in unique_warnings:
            lines.append(f"  - {w}")

    lines.append(f"\n请选择: [✅ 批准] [❌ 拒绝] [✏️ 修改后执行]")
    return "\n".join(lines)
