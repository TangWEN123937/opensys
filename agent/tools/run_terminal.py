"""
run_terminal Tool — 在容器内执行终端命令

这是 OpenSys 三大基础 Tool 之一。
AI Agent 通过此工具执行 shell 命令，获取输出结果。
命令执行受安全策略管控：危险命令需要用户审批后才能执行。
"""

import asyncio
import os
import subprocess
from langchain_core.tools import tool

from ..utils import sanitize_text


@tool
async def run_terminal(command: str, timeout: int = 300) -> str:
    """在容器终端中执行命令并返回输出。

    Args:
        command: 要执行的 shell 命令
        timeout: 超时时间（秒），默认 300 秒

    Returns:
        命令的 stdout + stderr 输出，或超时/错误信息
    """
    try:
        # 使用 asyncio 子进程执行命令
        # 设置 PYTHONUNBUFFERED 确保 Python 子进程输出不被缓冲
        env = {**os.environ, "PYTHONUNBUFFERED": "1"}
        process = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
            # 限制输出大小，防止内存溢出
            limit=1024 * 1024  # 1MB
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout
            )
        except asyncio.TimeoutError:
            process.kill()
            await process.communicate()
            return f"[错误] 命令执行超时（{timeout}秒）: {command}"

        # 组合输出
        output = ""
        if stdout:
            output += stdout.decode("utf-8", errors="replace")
        if stderr:
            output += ("\n[STDERR]\n" + stderr.decode("utf-8", errors="replace"))

        # 截断过长输出
        max_length = 50000  # 约 50KB
        if len(output) > max_length:
            output = output[:max_length] + f"\n\n... [输出已截断，共 {len(output)} 字符]"

        # 附加退出码信息
        if process.returncode != 0:
            output += f"\n[退出码: {process.returncode}]"

        # 清理输出中的无效 surrogate 字符（防止 checkpoint 序列化报错）
        result = output if output.strip() else "[命令执行成功，无输出]"
        return sanitize_text(result)

    except Exception as e:
        return f"[错误] 执行命令失败: {str(e)}"
