"""
write_and_run_script Tool — 写入脚本文件并执行

这是 OpenSys 三大基础 Tool 之一。
AI Agent 通过此工具写入多行脚本（Python/Bash/Node.js 等），
保存到临时文件后执行，适合需要多步逻辑的操作。
"""

import asyncio
import tempfile
import os
from pathlib import Path
from langchain_core.tools import tool

from ..utils import sanitize_text


# 脚本语言到执行器的映射
SCRIPT_RUNNERS = {
    "python": "python3",
    "bash": "bash",
    "sh": "sh",
    "node": "node",
    "javascript": "node",
}

# 脚本语言到文件扩展名的映射
SCRIPT_EXTENSIONS = {
    "python": ".py",
    "bash": ".sh",
    "sh": ".sh",
    "node": ".js",
    "javascript": ".js",
}


@tool
async def write_and_run_script(
    script_content: str,
    language: str = "python",
    timeout: int = 120,
    description: str = "",
) -> str:
    """写入脚本文件并执行，返回执行结果。

    适用于需要多行代码逻辑的场景，比单条命令更灵活。

    Args:
        script_content: 脚本内容（完整的可执行代码）
        language: 脚本语言，支持 python/bash/sh/node，默认 python
        timeout: 超时时间（秒），默认 120 秒
        description: 脚本用途描述（用于审计日志）

    Returns:
        脚本的 stdout + stderr 输出，或超时/错误信息
    """
    # 验证语言支持
    lang = language.lower()
    if lang not in SCRIPT_RUNNERS:
        return f"[错误] 不支持的脚本语言: {language}。支持: {', '.join(SCRIPT_RUNNERS.keys())}"

    runner = SCRIPT_RUNNERS[lang]
    ext = SCRIPT_EXTENSIONS[lang]

    # 创建临时脚本文件
    script_dir = Path(tempfile.gettempdir()) / "opensys_scripts"
    script_dir.mkdir(parents=True, exist_ok=True)

    # 使用 tempfile 创建唯一文件名
    fd, script_path = tempfile.mkstemp(suffix=ext, dir=script_dir, prefix="script_")
    try:
        # 写入脚本内容
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(script_content)

        # 给 bash/sh 脚本添加执行权限
        if lang in ("bash", "sh"):
            os.chmod(script_path, 0o755)

        # 执行脚本
        process = await asyncio.create_subprocess_exec(
            runner, script_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            limit=1024 * 1024  # 1MB 输出限制
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout
            )
        except asyncio.TimeoutError:
            process.kill()
            await process.communicate()
            return f"[错误] 脚本执行超时（{timeout}秒）"

        # 组合输出
        output = ""
        if stdout:
            output += stdout.decode("utf-8", errors="replace")
        if stderr:
            output += ("\n[STDERR]\n" + stderr.decode("utf-8", errors="replace"))

        # 截断过长输出
        max_length = 50000
        if len(output) > max_length:
            output = output[:max_length] + f"\n\n... [输出已截断，共 {len(output)} 字符]"

        if process.returncode != 0:
            output += f"\n[退出码: {process.returncode}]"

        # 清理输出中的无效 surrogate 字符（防止 checkpoint 序列化报错）
        result = output if output.strip() else "[脚本执行成功，无输出]"
        return sanitize_text(result)

    except Exception as e:
        return f"[错误] 脚本执行失败: {str(e)}"

    finally:
        # 清理临时脚本文件
        try:
            os.unlink(script_path)
        except OSError:
            pass
