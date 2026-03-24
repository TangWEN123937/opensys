"""
write_and_run_script Tool — 写入脚本文件并执行

这是 OpenSys 三大基础 Tool 之一。
AI Agent 通过此工具写入多行脚本（Python/Bash/Node.js 等），
保存到临时文件后执行，适合需要多步逻辑的操作。
"""

import asyncio
import hashlib
import tempfile
import time
import os
from pathlib import Path
from langchain_core.tools import tool

from .. import config
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

        # 脚本执行成功时：持久化 + 生成说明文件 + 入库到向量知识库
        if process.returncode == 0:
            persistent_path = await _persist_script(
                script_content=script_content,
                language=lang,
                description=description,
                ext=ext,
            )
            if persistent_path:
                await _auto_store_script(
                    file_path=persistent_path,
                    script_content=script_content,
                    language=lang,
                    description=description,
                )

        # 清理输出中的无效 surrogate 字符（防止 checkpoint 序列化报错）
        result = output if output.strip() else "[脚本执行成功，无输出]"
        return sanitize_text(result)

    except Exception as e:
        return f"[错误] 脚本执行失败: {str(e)}"

    finally:
        # 清理临时脚本文件（持久化副本已保存到 data/scripts/）
        try:
            os.unlink(script_path)
        except OSError:
            pass


async def _persist_script(
    script_content: str,
    language: str,
    description: str,
    ext: str,
) -> str:
    """
    将执行成功的脚本持久化到 data/scripts/ 目录，并生成配套 .txt 说明文件

    文件名格式：{时间戳}_{内容哈希前8位}{扩展名}
    说明文件格式：同名 .txt，包含描述、语言、用法等元信息（用户可自行编辑）

    Args:
        script_content: 脚本代码内容
        language: 脚本语言
        description: AI 对脚本用途的描述
        ext: 文件扩展名

    Returns:
        持久化后的脚本绝对路径，失败返回空字符串
    """
    if not description:
        return ""

    try:
        # 生成唯一文件名：时间戳_哈希
        content_hash = hashlib.md5(script_content.encode()).hexdigest()[:8]
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        script_name = f"{timestamp}_{content_hash}{ext}"
        txt_name = f"{timestamp}_{content_hash}.txt"

        script_path = config.SCRIPTS_DIR / script_name
        txt_path = config.SCRIPTS_DIR / txt_name

        # 写入脚本文件
        script_path.write_text(script_content, encoding="utf-8")
        if language in ("bash", "sh"):
            script_path.chmod(0o755)

        # 写入配套说明文件（用户可自行编辑调整）
        txt_content = f"""描述: {description}
语言: {language}
文件: {script_path.name}
创建时间: {time.strftime("%Y-%m-%d %H:%M:%S")}

用法:
  {SCRIPT_RUNNERS.get(language, 'python3')} {script_path}

参数说明:
  （无命令行参数，如需参数化请自行修改脚本）

备注:
  此文件由 AI 自动生成，用户可自行编辑以补充参数说明或修改描述。
  向量知识库检索时会读取此文件的内容作为元信息。
"""
        txt_path.write_text(txt_content, encoding="utf-8")

        print(f"[脚本持久化] 已保存: {script_path} + {txt_path}")
        return str(script_path)

    except Exception as e:
        print(f"[脚本持久化] 保存失败（不影响执行结果）: {e}")
        return ""


async def _auto_store_script(
    file_path: str,
    script_content: str,
    language: str,
    description: str,
) -> None:
    """
    将持久化后的脚本入库到向量知识库

    失败时仅打印警告，不影响工具返回结果。

    Args:
        file_path: 脚本持久化文件路径（data/scripts/ 下）
        script_content: 脚本代码内容
        language: 脚本语言
        description: AI 对脚本用途的描述
    """
    try:
        from ..vector_store import VectorStoreManager

        vs = VectorStoreManager()
        try:
            await vs.store_script(
                file_path=file_path,
                script_content=script_content,
                language=language,
                description=description,
            )
        finally:
            await vs.close()
    except Exception as e:
        # 入库失败不影响工具正常返回
        print(f"[脚本知识库] 自动入库失败（不影响执行结果）: {e}")
