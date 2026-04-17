"""
OpenSys 声明式权限模块

加载 data/permissions.yaml 中的权限规则，提供路径和命令的权限检查接口。
与 security.py 中的硬编码规则并行生效，互为补充：
  - security.py：代码层面的安全基线（SAFE_COMMAND_PREFIXES / DANGEROUS_COMMAND_KEYWORDS）
  - permissions.py：用户可自定义的声明式规则（path_rules / command_deny）

每次工具调用时重新加载 YAML 文件，修改后无需重启即可生效。
"""

import fnmatch
import re
from pathlib import Path
from typing import Optional

from . import config


def _load_permissions() -> dict:
    """
    加载 data/permissions.yaml 权限配置

    每次调用都重新读取文件，确保修改后立即生效。
    解析失败时返回空配置（不阻塞正常流程）。

    Returns:
        解析后的权限配置字典，至少包含 path_rules 和 command_deny
    """
    yaml_path = config.PERMISSIONS_FILE
    if not yaml_path.exists():
        return {"path_rules": [], "command_deny": []}

    try:
        content = yaml_path.read_text(encoding="utf-8")
        return _parse_yaml(content)
    except Exception as e:
        print(f"[权限系统] 加载 {yaml_path} 失败: {e}")
        return {"path_rules": [], "command_deny": []}


def _parse_yaml(content: str) -> dict:
    """
    简易 YAML 解析器（不依赖 PyYAML）

    仅支持本项目 permissions.yaml 的固定结构：
      path_rules:
        - pattern: "xxx"
          allow: false
          reason: "xxx"
      command_deny:
        - pattern: "xxx"
          reason: "xxx"

    Args:
        content: YAML 文件内容

    Returns:
        解析后的字典
    """
    result = {"path_rules": [], "command_deny": []}
    current_section = None  # "path_rules" 或 "command_deny"
    current_item = None     # 当前正在解析的列表项

    for line in content.split("\n"):
        stripped = line.strip()

        # 跳过空行和注释
        if not stripped or stripped.startswith("#"):
            continue

        # 顶层 key 检测（切换 section 前先保存未完成的 item）
        if stripped == "path_rules:":
            if current_item is not None and current_section is not None:
                result[current_section].append(current_item)
            current_section = "path_rules"
            current_item = None
            continue
        elif stripped == "command_deny:":
            if current_item is not None and current_section is not None:
                result[current_section].append(current_item)
            current_section = "command_deny"
            current_item = None
            continue

        # 非列表区域，跳过
        if current_section is None:
            continue

        # 列表项起始（- pattern: "xxx"）
        if stripped.startswith("- "):
            # 保存上一个 item
            if current_item is not None:
                result[current_section].append(current_item)
            current_item = {}
            # 解析 - key: value
            kv = stripped[2:].strip()
            _parse_kv(kv, current_item)
            continue

        # 列表项续行（  allow: false / reason: "xxx"）
        if current_item is not None and ":" in stripped:
            _parse_kv(stripped, current_item)
            continue

    # 保存最后一个 item
    if current_item is not None and current_section is not None:
        result[current_section].append(current_item)

    return result


def _parse_kv(text: str, target: dict):
    """解析单行 key: value 到目标字典"""
    key, _, value = text.partition(":")
    key = key.strip()
    value = value.strip().strip('"').strip("'")

    # 布尔值转换
    if value.lower() == "true":
        target[key] = True
    elif value.lower() == "false":
        target[key] = False
    else:
        target[key] = value


# ==================== 路径权限检查 ====================

def check_path_permission(file_path: str) -> Optional[str]:
    """
    检查文件路径是否被 permissions.yaml 禁止写入

    使用 glob 模式匹配（fnmatch），匹配目标为相对路径。

    Args:
        file_path: 要检查的文件路径（绝对或相对路径）

    Returns:
        None — 允许操作
        str — 拒绝原因（被某条 path_rule 匹配）
    """
    perms = _load_permissions()
    path_rules = perms.get("path_rules", [])

    if not path_rules:
        return None

    # 标准化为相对路径（去掉可能的前缀）
    rel_path = _normalize_path(file_path)

    for rule in path_rules:
        pattern = rule.get("pattern", "")
        allow = rule.get("allow", True)
        reason = rule.get("reason", "被权限规则禁止")

        if not pattern:
            continue

        # glob 匹配
        if fnmatch.fnmatch(rel_path, pattern):
            if not allow:
                return f"路径 `{rel_path}` 匹配禁止规则 `{pattern}`：{reason}"

        # 也检查文件名本身（处理 "*.db" 匹配 "data/opensys.db" 的情况）
        basename = Path(rel_path).name
        if fnmatch.fnmatch(basename, pattern):
            if not allow:
                return f"路径 `{rel_path}` 匹配禁止规则 `{pattern}`：{reason}"

    return None


def _normalize_path(file_path: str) -> str:
    """
    将文件路径标准化为相对路径（相对于项目根目录）

    Args:
        file_path: 绝对或相对路径

    Returns:
        相对路径字符串
    """
    path = Path(file_path)
    try:
        # 尝试转为相对于项目根的路径
        return str(path.relative_to(config.PROJECT_ROOT))
    except ValueError:
        # 不在项目根下，返回原始路径
        return str(path)


# ==================== 命令权限检查 ====================

def check_command_permission(command: str) -> Optional[str]:
    """
    检查命令是否被 permissions.yaml 的 command_deny 规则禁止

    使用子字符串匹配（大小写不敏感），与 config.py 的
    DANGEROUS_COMMAND_KEYWORDS 并行生效。

    Args:
        command: 要检查的命令文本

    Returns:
        None — 允许执行
        str — 拒绝原因（被某条 command_deny 规则匹配）
    """
    perms = _load_permissions()
    command_deny = perms.get("command_deny", [])

    if not command_deny:
        return None

    cmd_lower = command.lower().strip()

    for rule in command_deny:
        pattern = rule.get("pattern", "")
        reason = rule.get("reason", "被权限规则禁止")

        if not pattern:
            continue

        if pattern.lower() in cmd_lower:
            return f"命令匹配禁止规则 `{pattern}`：{reason}"

    return None


# ==================== 从命令中提取目标路径 ====================

def extract_paths_from_command(command: str) -> list[str]:
    """
    从 shell 命令中提取可能的文件目标路径

    用于 PreToolUse Hook 中对 run_terminal 命令做路径检查。
    只提取写操作命令（rm/mv/cp/tee/重定向）的目标路径。

    Args:
        command: shell 命令文本

    Returns:
        提取到的目标路径列表
    """
    paths = []

    # 重定向目标：> file 或 >> file
    redirect_matches = re.findall(r'>{1,2}\s*(\S+)', command)
    paths.extend(redirect_matches)

    # tee 命令目标：tee file 或 tee -a file
    tee_match = re.search(r'tee\s+(?:-a\s+)?(\S+)', command)
    if tee_match:
        paths.append(tee_match.group(1))

    # cp/mv 目标（最后一个参数）
    for cmd_prefix in ("cp ", "mv "):
        if cmd_prefix in command.lower():
            parts = command.split()
            # 找到 cp/mv 的位置，取最后一个非选项参数
            try:
                idx = next(i for i, p in enumerate(parts) if p.lower() in ("cp", "mv"))
                args = [p for p in parts[idx+1:] if not p.startswith("-")]
                if len(args) >= 2:
                    paths.append(args[-1])  # 目标是最后一个参数
            except StopIteration:
                pass

    return paths
