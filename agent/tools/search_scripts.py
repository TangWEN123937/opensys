"""
search_scripts Tool — 搜索脚本知识库

AI 在编写脚本前可以先搜索已有的脚本知识库，
如果找到类似脚本可以直接复用或微调，避免重复编写。

检索方式：向量相似度 + 可选关键词/语言过滤（ChromaDB 混合检索）

返回精简信息（描述+路径+用法+相似度），不返回完整代码，
AI 可通过 run_terminal("cat 路径") 查看代码或直接执行。
"""

from pathlib import Path
from typing import Optional
from langchain_core.tools import tool


def _read_txt_meta(script_path: str) -> dict:
    """
    读取脚本配套的 .txt 说明文件，提取用法等元信息

    Args:
        script_path: 脚本文件路径

    Returns:
        解析后的元信息字典（usage/params/备注等）
    """
    p = Path(script_path)
    txt_path = p.with_suffix(".txt")
    if not txt_path.exists():
        return {}

    try:
        content = txt_path.read_text(encoding="utf-8")
        meta = {}
        current_key = None
        current_lines = []

        for line in content.splitlines():
            stripped = line.strip()
            # 解析 "key: value" 格式的单行字段
            if ":" in stripped and not stripped.startswith("（") and current_key is None:
                key, _, value = stripped.partition(":")
                key = key.strip().lower()
                value = value.strip()
                if key in ("描述", "语言", "文件", "创建时间"):
                    meta[key] = value
                elif key == "用法":
                    current_key = "usage"
                    current_lines = []
                    if value:
                        current_lines.append(value)
                elif key == "参数说明":
                    # 保存上一个多行字段
                    if current_key and current_lines:
                        meta[current_key] = "\n".join(current_lines).strip()
                    current_key = "params"
                    current_lines = []
                    if value:
                        current_lines.append(value)
                elif key == "备注":
                    if current_key and current_lines:
                        meta[current_key] = "\n".join(current_lines).strip()
                    current_key = "note"
                    current_lines = []
                    if value:
                        current_lines.append(value)
                else:
                    # 未知 key，可能是多行内容的续行
                    if current_key:
                        current_lines.append(stripped)
            elif current_key:
                current_lines.append(stripped)

        # 保存最后一个多行字段
        if current_key and current_lines:
            meta[current_key] = "\n".join(current_lines).strip()

        return meta
    except Exception:
        return {}


@tool
async def search_scripts(
    query: str,
    language: Optional[str] = None,
    keyword: Optional[str] = None,
    top_k: int = 3,
) -> str:
    """搜索脚本知识库，查找已有的相似脚本，避免重复编写。

    在编写新脚本前调用此工具，如果找到类似脚本可以直接复用或微调。
    返回精简信息（不含完整代码），可通过 run_terminal("cat 路径") 查看代码。

    Args:
        query: 搜索描述（描述你需要什么功能的脚本）
        language: 可选，限定脚本语言（python/bash/node）
        keyword: 可选，脚本内容必须包含的关键词
        top_k: 返回结果数量，默认 3

    Returns:
        找到的相似脚本摘要列表（描述、路径、用法、相似度）
    """
    # 延迟导入，避免循环依赖
    from ..vector_store import VectorStoreManager

    vs = VectorStoreManager()
    try:
        results = await vs.search_scripts(
            query=query,
            language=language,
            top_k=top_k,
            keyword_filter=keyword,
        )
    finally:
        await vs.close()

    if not results:
        return "[脚本知识库] 未找到相似脚本，请编写新脚本。"

    # 格式化输出（只返回摘要信息，不返回代码）
    output_lines = [f"[脚本知识库] 找到 {len(results)} 个相似脚本：\n"]
    for i, item in enumerate(results, 1):
        meta = item.get("metadata", {})
        distance = item.get("distance", 0)
        similarity = 1 - distance  # ChromaDB 余弦距离 = 1 - 相似度

        file_path = meta.get("file_path", "未知")
        lang = meta.get("language", "未知")
        desc = meta.get("description", "无")

        output_lines.append(f"--- 脚本 {i} (相似度: {similarity:.2f}) ---")
        output_lines.append(f"  描述: {desc}")
        output_lines.append(f"  路径: {file_path}")
        output_lines.append(f"  语言: {lang}")

        # 尝试读取配套 .txt 说明文件获取用法信息
        txt_meta = _read_txt_meta(file_path)
        usage = txt_meta.get("usage", "")
        params = txt_meta.get("params", "")
        if usage:
            output_lines.append(f"  用法: {usage}")
        if params and params != "（无命令行参数，如需参数化请自行修改脚本）":
            output_lines.append(f"  参数: {params}")

        # 提示 AI 如何操作
        if similarity >= 0.7:
            output_lines.append(f"  建议: 可直接执行 → run_terminal(\"{usage.strip()}\")" if usage else f"  建议: 高相似度，可 cat 查看后直接复用")
        else:
            output_lines.append(f"  建议: 可 cat {file_path} 查看代码参考")
        output_lines.append("")

    return "\n".join(output_lines)
