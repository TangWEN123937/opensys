"""
OpenSys 向量存储管理器

基于 ChromaDB 实现向量化混合检索，包含两个集合：
1. conversation_memory — 对话记忆：超阈值后将旧对话切片入库，替代摘要压缩
2. script_knowledge — 脚本知识库：AI编写的脚本自动入库，避免重复编写

检索方式：向量相似度 + 关键词过滤（ChromaDB where_document）混合检索
Embedding：调用本地 BGE-M3 服务（http://localhost:8100/api/v1/embed）

设计要点：
- 对话切片以 finish_reason='stop' 的 AIMessage 为界，一个完整交互轮次为一片
- 入库时只存 HumanMessage + AIMessage(stop) 文本，中间工具调用仅存 metadata
- 脚本以文件路径为唯一 ID（upsert 语义），通过余弦相似度判断是否需要更新
"""

import time
import math
from typing import Optional

import httpx
import chromadb

from . import config


class VectorStoreManager:
    """ChromaDB 向量存储管理器（两个集合：对话记忆 + 脚本知识库）"""

    def __init__(self):
        # 持久化 ChromaDB 客户端
        self._client = chromadb.PersistentClient(path=str(config.CHROMA_DB_DIR))

        # 获取或创建两个集合（使用余弦相似度）
        self._conversations = self._client.get_or_create_collection(
            name=config.CHROMA_COLLECTION_CONVERSATIONS,
            metadata={"hnsw:space": "cosine"},
        )
        self._scripts = self._client.get_or_create_collection(
            name=config.CHROMA_COLLECTION_SCRIPTS,
            metadata={"hnsw:space": "cosine"},
        )

        # Embedding HTTP 客户端（复用连接）
        self._http_client = httpx.AsyncClient(timeout=30.0)

    # ==================== Embedding 调用 ====================

    async def _get_embeddings(self, texts: list[str]) -> list[list[float]]:
        """
        调用本地 BGE-M3 Embedding 服务生成向量

        Args:
            texts: 待向量化的文本列表（最多 100 条）

        Returns:
            向量列表，每个向量为 float 数组
        """
        if not texts:
            return []

        resp = await self._http_client.post(
            config.EMBEDDING_API_URL,
            json={"texts": texts, "model": config.EMBEDDING_MODEL_NAME},
        )
        resp.raise_for_status()
        data = resp.json()
        return data["embeddings"]

    async def _get_single_embedding(self, text: str) -> list[float]:
        """获取单条文本的向量"""
        embeddings = await self._get_embeddings([text])
        return embeddings[0]

    # ==================== 对话记忆集合 ====================

    async def store_conversation_turns(
        self,
        thread_id: str,
        turns: list[dict],
    ) -> int:
        """
        批量存储对话轮次到向量库

        每个 turn 结构：
        {
            "turn_index": int,
            "user_content": str,          # 用户提问文本
            "ai_content": str,            # AI 最终回复文本（finish_reason=stop）
            "tool_summary": list[dict],   # 工具调用摘要 [{tool_name, command, status}]
            "timestamp": float,           # Unix 时间戳
        }

        Args:
            thread_id: 对话线程 ID
            turns: 对话轮次列表

        Returns:
            成功入库的轮次数
        """
        if not turns:
            return 0

        # 构建 embedding 文本：user 提问 + AI 最终回复
        embed_texts = []
        ids = []
        metadatas = []
        documents = []

        for turn in turns:
            turn_idx = turn["turn_index"]
            user_text = turn.get("user_content", "")
            ai_text = turn.get("ai_content", "")

            # embedding 文本 = 用户提问 + AI 回复（截断到 512 token ≈ 1500 字符）
            embed_text = f"用户: {user_text}\nAI: {ai_text}"
            if len(embed_text) > 1500:
                embed_text = embed_text[:1500]

            # 存储的完整文档（可以更长，用于展示）
            doc_text = f"用户: {user_text}\nAI: {ai_text}"
            if len(doc_text) > 3000:
                doc_text = doc_text[:3000]

            # 工具摘要转为字符串存入 metadata
            tool_names = ",".join(
                t.get("tool_name", "") for t in turn.get("tool_summary", [])
            )

            embed_texts.append(embed_text)
            ids.append(f"{thread_id}_{turn_idx}")
            metadatas.append({
                "thread_id": thread_id,
                "turn_index": turn_idx,
                "timestamp": turn.get("timestamp", time.time()),
                "tool_names": tool_names,
            })
            documents.append(doc_text)

        # 批量获取 embeddings
        try:
            embeddings = await self._get_embeddings(embed_texts)
        except Exception as e:
            print(f"[向量存储] Embedding 调用失败: {e}")
            return 0

        # 批量 upsert 到 ChromaDB
        self._conversations.upsert(
            ids=ids,
            embeddings=embeddings,
            metadatas=metadatas,
            documents=documents,
        )

        print(f"[向量存储] 对话记忆入库: {len(turns)} 个轮次 (thread={thread_id[:8]}...)")
        return len(turns)

    async def search_conversations(
        self,
        query: str,
        thread_id: Optional[str] = None,
        top_k: int = None,
        keyword_filter: Optional[str] = None,
    ) -> list[dict]:
        """
        混合检索对话记忆（向量相似度 + 可选关键词过滤）

        Args:
            query: 检索查询文本
            thread_id: 可选，限定在指定线程内检索
            top_k: 返回数量，默认使用配置值
            keyword_filter: 可选，文档内容必须包含的关键词

        Returns:
            检索结果列表，每项包含 {document, metadata, distance}
        """
        top_k = top_k or config.VECTOR_SEARCH_TOP_K

        # 生成查询向量
        try:
            query_embedding = await self._get_single_embedding(query)
        except Exception as e:
            print(f"[向量检索] Embedding 调用失败: {e}")
            return []

        # 构建过滤条件
        where = None
        if thread_id:
            where = {"thread_id": thread_id}

        where_document = None
        if keyword_filter:
            where_document = {"$contains": keyword_filter}

        # ChromaDB 向量检索
        results = self._conversations.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=where,
            where_document=where_document,
            include=["documents", "metadatas", "distances"],
        )

        # 格式化返回
        items = []
        if results and results["ids"] and results["ids"][0]:
            for i, doc_id in enumerate(results["ids"][0]):
                items.append({
                    "id": doc_id,
                    "document": results["documents"][0][i],
                    "metadata": results["metadatas"][0][i],
                    "distance": results["distances"][0][i],
                })

        return items

    # ==================== 脚本知识库集合 ====================

    async def store_script(
        self,
        file_path: str,
        script_content: str,
        language: str,
        description: str,
        thread_id: str = "",
    ) -> bool:
        """
        存储或更新脚本到知识库（以文件路径为唯一 ID，自动去重）

        去重逻辑：
        1. 路径不存在 → 新脚本，直接入库
        2. 路径已存在 → 计算新旧 embedding 余弦相似度
           - > 阈值 → 小幅修改，不更新
           - ≤ 阈值 → 大幅重写，覆盖更新

        Args:
            file_path: 脚本文件绝对路径（作为唯一 ID）
            script_content: 脚本代码全文
            language: 脚本语言（python/bash/node）
            description: AI 对脚本用途的描述
            thread_id: 创建该脚本的对话线程 ID

        Returns:
            True 表示已入库/更新，False 表示跳过（小幅修改）
        """
        # embedding 文本 = 描述 + 代码前 512 字符（BGE-M3 max_seq_length=512）
        code_preview = script_content[:512] if len(script_content) > 512 else script_content
        embed_text = f"{description}\n{code_preview}"

        try:
            new_embedding = await self._get_single_embedding(embed_text)
        except Exception as e:
            print(f"[脚本知识库] Embedding 调用失败: {e}")
            return False

        # 检查是否已存在
        doc_id = file_path  # 文件路径作为唯一 ID
        existing = self._scripts.get(ids=[doc_id], include=["embeddings"])

        if existing and existing["ids"]:
            # 已存在：计算余弦相似度
            old_embedding = existing["embeddings"][0]
            similarity = _cosine_similarity(old_embedding, new_embedding)

            if similarity > config.SCRIPT_SIMILARITY_THRESHOLD:
                print(
                    f"[脚本知识库] 跳过更新（相似度 {similarity:.3f} > {config.SCRIPT_SIMILARITY_THRESHOLD}）: {file_path}"
                )
                return False

            print(f"[脚本知识库] 大幅修改，覆盖更新（相似度 {similarity:.3f}）: {file_path}")

        # 存储的完整文档（描述 + 完整代码，用于检索展示）
        doc_text = f"描述: {description}\n语言: {language}\n路径: {file_path}\n代码:\n{script_content}"
        if len(doc_text) > 5000:
            doc_text = doc_text[:5000]

        # upsert 到 ChromaDB
        self._scripts.upsert(
            ids=[doc_id],
            embeddings=[new_embedding],
            metadatas=[{
                "file_path": file_path,
                "language": language,
                "description": description[:500],  # metadata 值不宜过长
                "thread_id": thread_id,
                "updated_at": time.time(),
            }],
            documents=[doc_text],
        )

        print(f"[脚本知识库] 已入库: {file_path} ({language})")
        return True

    async def search_scripts(
        self,
        query: str,
        language: Optional[str] = None,
        top_k: int = 5,
        keyword_filter: Optional[str] = None,
    ) -> list[dict]:
        """
        混合检索脚本知识库（向量相似度 + 可选语言/关键词过滤）

        Args:
            query: 检索查询文本（描述需求或功能）
            language: 可选，限定脚本语言
            top_k: 返回数量
            keyword_filter: 可选，文档内容必须包含的关键词

        Returns:
            检索结果列表，每项包含 {document, metadata, distance}
        """
        # 生成查询向量
        try:
            query_embedding = await self._get_single_embedding(query)
        except Exception as e:
            print(f"[脚本检索] Embedding 调用失败: {e}")
            return []

        # 构建过滤条件
        where = None
        if language:
            where = {"language": language.lower()}

        where_document = None
        if keyword_filter:
            where_document = {"$contains": keyword_filter}

        # 检查集合是否有数据
        if self._scripts.count() == 0:
            return []

        # ChromaDB 向量检索
        results = self._scripts.query(
            query_embeddings=[query_embedding],
            n_results=min(top_k, self._scripts.count()),
            where=where,
            where_document=where_document,
            include=["documents", "metadatas", "distances"],
        )

        # 格式化返回
        items = []
        if results and results["ids"] and results["ids"][0]:
            for i, doc_id in enumerate(results["ids"][0]):
                items.append({
                    "id": doc_id,
                    "document": results["documents"][0][i],
                    "metadata": results["metadatas"][0][i],
                    "distance": results["distances"][0][i],
                })

        return items

    # ==================== 工具方法 ====================

    def get_stats(self) -> dict:
        """获取向量库统计信息"""
        return {
            "conversations_count": self._conversations.count(),
            "scripts_count": self._scripts.count(),
            "chroma_db_dir": str(config.CHROMA_DB_DIR),
        }

    async def close(self):
        """关闭 HTTP 客户端"""
        await self._http_client.aclose()


# ==================== 工具函数 ====================

def _cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """
    计算两个向量的余弦相似度

    Args:
        vec_a: 向量 A
        vec_b: 向量 B

    Returns:
        余弦相似度（-1 到 1，越大越相似）
    """
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


# ==================== 对话消息切片工具 ====================

def slice_conversation_turns(messages: list) -> list[dict]:
    """
    将消息列表按完整交互轮次切片

    切片规则：
    - 以 finish_reason='stop' 的 AIMessage 为一轮结束标记
    - 一片 = 从上一个 stop 之后到当前 stop 的所有消息
    - 入库时只取 HumanMessage 内容 + AIMessage(stop) 内容
    - 中间的 AIMessage(tool_calls) 和 ToolMessage 仅提取 tool_name/status 存 metadata

    Args:
        messages: LangGraph state["messages"] 消息列表

    Returns:
        切片后的轮次列表，每项为 store_conversation_turns() 需要的 turn dict
    """
    from langchain_core.messages import AIMessage, HumanMessage, ToolMessage, SystemMessage

    turns = []
    current_user_content = ""
    current_tool_summary = []
    turn_index = 0

    for msg in messages:
        # 跳过 SystemMessage
        if isinstance(msg, SystemMessage):
            continue

        # 收集用户输入
        if isinstance(msg, HumanMessage):
            content = _extract_text_content(msg.content)
            # 跳过系统通知消息（如审批拒绝通知）
            if content.startswith("[系统通知]"):
                continue
            current_user_content = content

        # 收集工具调用摘要（中间的 AIMessage with tool_calls）
        elif isinstance(msg, AIMessage) and getattr(msg, "tool_calls", None):
            for tc in msg.tool_calls:
                current_tool_summary.append({
                    "tool_name": tc.get("name", ""),
                    "command": _extract_tool_command(tc),
                    "status": "called",
                })

        # ToolMessage：更新工具状态
        elif isinstance(msg, ToolMessage):
            # 找到对应的 tool_summary 项，标记为完成
            tool_name = getattr(msg, "name", "")
            for ts in reversed(current_tool_summary):
                if ts["tool_name"] == tool_name and ts["status"] == "called":
                    ts["status"] = "completed"
                    break

        # 最终 AI 回复（finish_reason=stop）：一轮结束
        elif isinstance(msg, AIMessage) and not getattr(msg, "tool_calls", None):
            ai_content = _extract_text_content(msg.content)
            # 只有同时有用户输入和 AI 回复时才算有效轮次
            if current_user_content and ai_content:
                turns.append({
                    "turn_index": turn_index,
                    "user_content": current_user_content,
                    "ai_content": ai_content,
                    "tool_summary": current_tool_summary,
                    "timestamp": time.time(),
                })
                turn_index += 1

            # 重置当前轮次状态
            current_user_content = ""
            current_tool_summary = []

    return turns


def _extract_text_content(content) -> str:
    """
    从消息 content 中提取纯文本（处理多模态 content 列表）

    Args:
        content: str 或 list[dict]（多模态格式）

    Returns:
        纯文本字符串
    """
    if isinstance(content, str):
        return content
    elif isinstance(content, list):
        text_parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                text_parts.append(item.get("text", ""))
            elif isinstance(item, str):
                text_parts.append(item)
        return " ".join(text_parts)
    return str(content)


def _extract_tool_command(tool_call: dict) -> str:
    """
    从 tool_call 中提取简短命令描述

    Args:
        tool_call: AI 生成的工具调用 dict

    Returns:
        简短命令描述（最多 100 字符）
    """
    args = tool_call.get("args", {})
    name = tool_call.get("name", "")

    if name == "run_terminal":
        cmd = args.get("command", "")
        return cmd[:100]
    elif name == "write_and_run_script":
        desc = args.get("description", "")
        lang = args.get("language", "python")
        return f"{lang}: {desc[:80]}" if desc else f"{lang} script"
    else:
        return str(args)[:100]
