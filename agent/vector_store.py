"""
OpenSys 向量存储管理器

基于 ChromaDB 实现向量化混合检索，包含一个集合：
conversation_memory — 对话记忆：超阈值后将旧对话切片入库，替代摘要压缩

检索方式：向量相似度 + 关键词过滤（ChromaDB where_document）混合检索
Embedding：调用本地 BGE-M3 服务（http://localhost:8100/api/v1/embed）

设计要点：
- 对话切片以 finish_reason='stop' 的 AIMessage 为界，一个完整交互轮次为一片
- 入库时只存 HumanMessage + AIMessage(stop) 文本，中间工具调用仅存 metadata
"""

import time
import math
from typing import Optional

import httpx
import chromadb
from chromadb.api.types import EmbeddingFunction, Documents, Embeddings

from . import config


class _NoopEmbeddingFunction(EmbeddingFunction):
    """
    空操作 Embedding 函数——禁止 ChromaDB 自动下载 HuggingFace 默认模型。

    我们始终通过外部 HTTP 服务获取 embedding，并手动传入
    embeddings/query_embeddings 参数，不依赖 ChromaDB 内置的 embedding 功能。
    """
    def __call__(self, input: Documents) -> Embeddings:
        # 不应被调用，如果意外触发则报错提示
        raise NotImplementedError(
            "Embedding 应通过外部 HTTP 服务获取，不应调用 ChromaDB 内置 embedding"
        )


# 全局单例，避免重复实例化
_noop_ef = _NoopEmbeddingFunction()


class VectorStoreManager:
    """ChromaDB 向量存储管理器（对话记忆 + 文档知识库集合）"""

    def __init__(self):
        # 持久化 ChromaDB 客户端
        self._client = chromadb.PersistentClient(path=str(config.CHROMA_DB_DIR))

        # 获取或创建对话记忆集合（使用余弦相似度）
        # 我们始终手动传 embeddings 参数，不依赖 ChromaDB 内置 embedding
        self._conversations = self._safe_get_or_create(
            config.CHROMA_COLLECTION_CONVERSATIONS
        )

        # 获取或创建文档知识库集合（PDF 向量化入库）
        self._documents = self._safe_get_or_create(
            config.CHROMA_COLLECTION_DOCUMENTS
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

    # ==================== 文档知识库集合 ====================

    async def store_document_chunks(
        self,
        chunks: list[dict],
    ) -> int:
        """
        批量存储文档切片到向量库

        每个 chunk 结构：
        {
            "id": str,               # 唯一 ID（如 "{doc_id}_chunk_{i}"）
            "text": str,             # chunk 文本内容
            "metadata": {            # 元数据
                "doc_id": str,       # 文档唯一 ID（PDF 文件 SHA256）
                "source_file": str,  # 原始文件名
                "topic": str,        # 主题分类（LLM 自动分类）
                "section": str,      # 标题层级路径
                "chunk_index": int,  # chunk 序号
                "page_start": int,   # 起始页码（OCR 解析时为 0）
                "total_chunks": int, # 文档总 chunk 数
                "created_at": str,   # 创建时间（ISO 格式）
            }
        }

        Args:
            chunks: 文档切片列表

        Returns:
            成功入库的 chunk 数
        """
        if not chunks:
            return 0

        # 构建 embedding 文本（截断到 1500 字符）
        embed_texts = []
        ids = []
        metadatas = []
        documents = []

        for chunk in chunks:
            text = chunk["text"]
            embed_text = text[:1500] if len(text) > 1500 else text

            embed_texts.append(embed_text)
            ids.append(chunk["id"])
            metadatas.append(chunk["metadata"])
            # 完整文本存入 document（用于检索后展示）
            documents.append(text[:5000] if len(text) > 5000 else text)

        # 分批获取 embeddings（每批最多 100 条）
        all_embeddings = []
        batch_size = 100
        for i in range(0, len(embed_texts), batch_size):
            batch = embed_texts[i:i + batch_size]
            try:
                batch_embeddings = await self._get_embeddings(batch)
                all_embeddings.extend(batch_embeddings)
            except Exception as e:
                print(f"[向量存储] 文档 Embedding 调用失败 (batch {i}): {e}")
                return 0

        # 批量 upsert 到 ChromaDB
        self._documents.upsert(
            ids=ids,
            embeddings=all_embeddings,
            metadatas=metadatas,
            documents=documents,
        )

        topic = chunks[0]["metadata"].get("topic", "未分类") if chunks else ""
        print(f"[向量存储] 文档入库: {len(chunks)} 个 chunks (topic={topic})")
        return len(chunks)

    async def search_documents(
        self,
        query: str,
        topic: Optional[str] = None,
        doc_id: Optional[str] = None,
        top_k: int = None,
        semantic_weight: float = 0.7,
        keyword_weight: float = 0.3,
    ) -> list[dict]:
        """
        混合检索文档知识库：语义相似度 + 关键词匹配加权融合

        最终得分 = semantic_weight * 语义相似度 + keyword_weight * 关键词命中率
        Embedding 不可用时自动降级为纯关键词匹配。

        Args:
            query: 检索查询文本
            topic: 可选，限定主题分类
            doc_id: 可选，限定某篇文档
            top_k: 返回数量，默认使用配置值
            semantic_weight: 语义相似度权重（默认 0.7）
            keyword_weight: 关键词匹配权重（默认 0.3）

        Returns:
            检索结果列表，每项包含 {id, document, metadata, distance, similarity}
        """
        import re

        top_k = top_k or config.DOCUMENTS_SEARCH_TOP_K

        # 提取关键词（用于关键词打分）
        keywords = []
        for word in re.split(r'[\s,，;；、]+', query):
            word = word.strip()
            if len(word) >= 2:
                keywords.append(word.lower())

        # 生成查询向量
        try:
            query_embedding = await self._get_single_embedding(query)
        except Exception as e:
            print(f"[向量检索] 文档 Embedding 调用失败: {e}，降级到关键词匹配")
            return self._keyword_search_documents(query, topic, doc_id, top_k)

        # 构建过滤条件
        where = None
        if topic and doc_id:
            where = {"$and": [{"topic": topic}, {"doc_id": doc_id}]}
        elif topic:
            where = {"topic": topic}
        elif doc_id:
            where = {"doc_id": doc_id}

        # 向量检索（取 top_k * 2 候选，留出融合排序空间）
        doc_count = self._documents.count()
        results = self._documents.query(
            query_embeddings=[query_embedding],
            n_results=min(top_k * 2, doc_count) if doc_count > 0 else top_k,
            where=where,
            include=["documents", "metadatas", "distances"],
        )

        if not results or not results["ids"] or not results["ids"][0]:
            return []

        # 混合打分：语义相似度 + 关键词命中率
        items = []
        for i, doc_id_val in enumerate(results["ids"][0]):
            doc_text = results["documents"][0][i]
            distance = results["distances"][0][i] if results.get("distances") else 0
            # 语义相似度：ChromaDB cosine distance → similarity = 1 - distance
            semantic_sim = max(0, 1 - distance)

            # 关键词命中率：命中关键词数 / 总关键词数
            if keywords:
                doc_lower = doc_text.lower()
                hits = sum(1 for kw in keywords if kw in doc_lower)
                keyword_sim = hits / len(keywords)
            else:
                keyword_sim = 0

            # 加权融合
            final_score = semantic_weight * semantic_sim + keyword_weight * keyword_sim

            items.append({
                "id": doc_id_val,
                "document": doc_text,
                "metadata": results["metadatas"][0][i],
                "distance": distance,
                "similarity": round(final_score, 3),
            })

        # 按混合得分降序排列，取 top_k
        items.sort(key=lambda x: x["similarity"], reverse=True)
        return items[:top_k]

    def _keyword_search_documents(
        self,
        query: str,
        topic: Optional[str] = None,
        doc_id: Optional[str] = None,
        top_k: int = 10,
    ) -> list[dict]:
        """
        Embedding 不可用时的关键词匹配降级方案

        从 documents collection 获取所有文档，按关键词匹配打分后返回 top-k。

        Args:
            query: 查询文本
            topic: 可选主题过滤
            doc_id: 可选文档 ID 过滤
            top_k: 返回数量

        Returns:
            匹配结果列表
        """
        import re

        # 构建过滤条件
        where = None
        if topic and doc_id:
            where = {"$and": [{"topic": topic}, {"doc_id": doc_id}]}
        elif topic:
            where = {"topic": topic}
        elif doc_id:
            where = {"doc_id": doc_id}

        all_data = self._documents.get(
            where=where,
            include=["documents", "metadatas"],
        )

        if not all_data or not all_data["documents"]:
            return []

        # 分词：提取关键词
        keywords = []
        for word in re.split(r'[\s,，;；、]+', query):
            word = word.strip()
            if len(word) >= 2:
                keywords.append(word.lower())

        if not keywords:
            return []

        # 关键词匹配打分
        scored = []
        for i, doc in enumerate(all_data["documents"]):
            doc_lower = doc.lower()
            score = sum(1 for kw in keywords if kw in doc_lower)
            if score > 0:
                scored.append({
                    "id": all_data["ids"][i] if all_data.get("ids") else f"doc_{i}",
                    "document": doc,
                    "metadata": all_data["metadatas"][i] if all_data.get("metadatas") else {},
                    "distance": 1 - (score / len(keywords)),
                })

        scored.sort(key=lambda x: x["distance"])
        result = scored[:top_k]
        if result:
            print(f"[向量检索] 关键词匹配返回 {len(result)} 条结果")
        return result

    def get_document_topics(self) -> list[str]:
        """
        获取已有的所有主题分类列表（去重）

        Returns:
            主题列表（如 ["城市更新", "人工智能", ...]）
        """
        try:
            # 获取所有 metadata 中的 topic 字段
            all_data = self._documents.get(include=["metadatas"])
            topics = set()
            if all_data and all_data["metadatas"]:
                for meta in all_data["metadatas"]:
                    t = meta.get("topic", "")
                    if t:
                        topics.add(t)
            return sorted(topics)
        except Exception:
            return []

    def get_document_count(self) -> int:
        """获取文档知识库中的 chunk 总数"""
        return self._documents.count()

    # ==================== 工具方法 ====================

    def _safe_get_or_create(self, name: str):
        """
        获取或创建 ChromaDB collection。

        ChromaDB 1.x 会持久化 embedding function 配置，旧数据目录可能存在
        default / 自定义 embedding function 不一致的问题。这里统一不传
        embedding_function；如果检测到历史配置冲突，则删除该 collection 后重建。
        """
        try:
            return self._client.get_or_create_collection(
                name=name,
                metadata={"hnsw:space": "cosine"},
            )
        except Exception as e:
            error_text = str(e)
            if "Embedding function conflict" not in error_text:
                raise

            print(f"[向量存储] Collection {name} embedding function 冲突，删除后重建: {e}")
            self._client.delete_collection(name=name)
            return self._client.create_collection(
                name=name,
                metadata={"hnsw:space": "cosine"},
            )

    def get_stats(self) -> dict:
        """获取向量库统计信息"""
        return {
            "conversations_count": self._conversations.count(),
            "documents_count": self._documents.count(),
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
