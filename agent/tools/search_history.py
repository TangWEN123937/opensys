"""
search_history Tool — AI 主动检索历史对话记忆

让 Agent 可以随时搜索过去的对话内容，不限于当前线程。
基于 ChromaDB 向量检索（BGE-M3 Embedding），支持跨线程检索。

典型使用场景：
- "我们之前讨论过 XXX，具体是什么来着？"
- 需要回忆之前对话中的技术决策、解决方案等
- 用户提到"上次"、"之前"、"之前说过"等关键词时
"""

from typing import Optional
from langchain_core.tools import tool

from ..vector_store import VectorStoreManager


@tool
async def search_history(
    query: str,
    top_k: int = 5,
) -> str:
    """搜索历史对话记忆 — 从过去的对话中检索相关内容。

    当你需要回忆之前对话中讨论过的内容时使用此工具。
    支持跨对话检索，不限于当前会话。

    典型使用场景：
    - 用户提到"之前"、"上次"、"我们讨论过"等关键词
    - 需要查找之前的技术决策、解决方案、操作步骤
    - 需要确认之前对话中提到的具体信息

    Args:
        query: 搜索关键词或描述（如"排水管网数据处理方案"、"Docker部署配置"）
        top_k: 返回结果数量，默认 5，最大 10

    Returns:
        检索到的历史对话摘要，或无结果提示
    """
    if not query or not query.strip():
        return "❌ 参数错误：query 不能为空，请提供搜索关键词。"

    # 限制 top_k 范围
    top_k = max(1, min(top_k, 10))

    try:
        vs = VectorStoreManager()
        try:
            # 跨线程检索：不传 thread_id，搜索所有历史对话
            results = await vs.search_conversations(
                query=query.strip(),
                thread_id=None,  # 不限制线程，跨对话检索
                top_k=top_k,
            )
        finally:
            await vs.close()
    except Exception as e:
        return f"⚠️ 检索失败: {e}\n可能是向量数据库服务未启动或无历史数据。"

    if not results:
        return f"🔍 未找到与「{query}」相关的历史对话记录。\n可能原因：对话历史尚未入库（需要消息数超过阈值才会自动入库），或关键词不匹配。"

    # 格式化检索结果
    lines = [f"🔍 搜索「{query}」找到 {len(results)} 条相关历史记录：\n"]

    for i, item in enumerate(results, 1):
        doc = item.get("document", "")
        distance = item.get("distance", 0)
        metadata = item.get("metadata", {})
        similarity = 1 - distance

        # 过滤相似度过低的结果（< 0.2）
        if similarity < 0.2:
            continue

        # 截断过长内容
        if len(doc) > 600:
            doc = doc[:600] + "..."

        # 提取元数据中的时间和线程信息
        thread_id = metadata.get("thread_id", "")
        timestamp = metadata.get("timestamp", "")

        # 格式化时间戳
        time_info = ""
        if timestamp:
            try:
                from datetime import datetime
                dt = datetime.fromtimestamp(float(timestamp))
                time_info = f" ({dt.strftime('%m-%d %H:%M')})"
            except (ValueError, TypeError, OSError):
                pass

        lines.append(f"**[{i}]** 相似度: {similarity:.0%}{time_info}")
        lines.append(f"{doc}")
        lines.append("")  # 空行分隔

    # 如果全部被过滤
    if len(lines) <= 1:
        return f"🔍 找到一些记录但相关度较低，未展示。尝试更换关键词搜索。"

    return "\n".join(lines)
