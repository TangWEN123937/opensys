"""
OpenSys 技能向量化检索模块

管理 ChromaDB skill_knowledge 集合，为 Advisor 提供语义检索能力。
当没有匹配的 workflow 模板时，Advisor 用 user_request + background 作为 query，
检索语义最相关的技能，然后自行分配给 general.md 各阶段。

核心功能：
1. sync_skills() — 扫描 data/skills/，将 SKILL.md 的描述和摘要入库（懒同步）
2. search_skills() — 向量检索 top-k 最相关的技能
3. 关键词 fallback — 向量服务不可用时降级为现有关键词匹配

Embedding 复用现有本地 BGE-M3 服务（localhost:8100）。
"""

import hashlib
from pathlib import Path
from typing import Optional

import httpx
import chromadb

from . import config
from .skill_loader import discover_skills


class SkillVectorStore:
    """技能向量化检索管理器"""

    def __init__(self):
        # 持久化 ChromaDB 客户端（复用与 conversation_memory 相同的目录）
        self._client = chromadb.PersistentClient(path=str(config.CHROMA_DB_DIR))

        # 获取或创建技能知识集合
        self._collection = self._client.get_or_create_collection(
            name=config.CHROMA_COLLECTION_SKILLS,
            metadata={"hnsw:space": "cosine"},
        )

        # Embedding HTTP 客户端
        self._http_client = httpx.AsyncClient(timeout=30.0)

    async def close(self):
        """关闭 HTTP 客户端"""
        await self._http_client.aclose()

    # ==================== Embedding 调用 ====================

    async def _get_embeddings(self, texts: list[str]) -> list[list[float]]:
        """
        调用本地 BGE-M3 Embedding 服务生成向量

        Args:
            texts: 待向量化的文本列表

        Returns:
            向量列表
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

    # ==================== 技能同步 ====================

    async def sync_skills(self) -> int:
        """
        扫描 data/skills/ 目录，将新增或变更的技能入库到向量集合

        使用文件内容 MD5 做变更检测，只同步有变化的技能。
        每个技能的 Embedding 内容 = description + 正文前 500 字。

        Returns:
            本次同步更新的技能数量
        """
        skills_dir = config.SKILLS_DIR
        if not skills_dir.exists():
            return 0

        # 获取已入库的技能及其 hash
        existing = self._get_existing_hashes()

        updated_count = 0
        skill_dirs = [d for d in skills_dir.iterdir() if d.is_dir() and (d / "SKILL.md").exists()]

        for skill_dir in skill_dirs:
            skill_id = skill_dir.name
            skill_file = skill_dir / "SKILL.md"

            try:
                content = skill_file.read_text(encoding="utf-8")
                content_hash = hashlib.md5(content.encode()).hexdigest()

                # 检查是否需要更新
                if skill_id in existing and existing[skill_id] == content_hash:
                    continue  # 内容未变，跳过

                # 解析 front matter
                meta = self._parse_skill_meta(content)
                if not meta.get("description"):
                    continue  # 没有 description 的技能不入库

                # 构建 Embedding 文本（description + 正文前 500 字）
                body = self._extract_body(content)
                embed_text = f"{meta.get('name', skill_id)}: {meta['description']}\n{body[:500]}"

                # 生成向量
                embeddings = await self._get_embeddings([embed_text])
                if not embeddings:
                    continue

                # Upsert 到 ChromaDB
                self._collection.upsert(
                    ids=[skill_id],
                    embeddings=embeddings,
                    documents=[embed_text],
                    metadatas=[{
                        "skill_name": meta.get("name", skill_id),
                        "description": meta.get("description", ""),
                        "target_role": meta.get("target_role", "any"),
                        "file_path": str(skill_file),
                        "file_hash": content_hash,
                        "triggers": ",".join(meta.get("triggers", [])) if isinstance(meta.get("triggers"), list) else "",
                    }],
                )
                updated_count += 1
                print(f"[技能向量化] 已同步: {skill_id}")

            except Exception as e:
                print(f"[技能向量化] 同步 {skill_id} 失败: {e}")

        return updated_count

    def _get_existing_hashes(self) -> dict[str, str]:
        """获取已入库技能的 ID → file_hash 映射"""
        try:
            result = self._collection.get(include=["metadatas"])
            hashes = {}
            for i, doc_id in enumerate(result["ids"]):
                meta = result["metadatas"][i] if result["metadatas"] else {}
                hashes[doc_id] = meta.get("file_hash", "")
            return hashes
        except Exception:
            return {}

    # ==================== 技能检索 ====================

    async def search_skills(self, query: str, top_k: int = None) -> list[dict]:
        """
        向量检索与 query 最相关的技能

        Args:
            query: 搜索词（通常是 user_request + background 拼接）
            top_k: 返回数量，默认使用 config.SKILL_VECTOR_TOP_K

        Returns:
            技能列表，每个元素包含 dir_name, skill_name, description, target_role, similarity_score
        """
        if top_k is None:
            top_k = config.SKILL_VECTOR_TOP_K

        # 确保技能库已同步
        await self.sync_skills()

        # 检查集合是否为空
        if self._collection.count() == 0:
            return []

        # 生成 query 向量
        query_embeddings = await self._get_embeddings([query])
        if not query_embeddings:
            return []

        # 向量检索
        results = self._collection.query(
            query_embeddings=query_embeddings,
            n_results=min(top_k, self._collection.count()),
            include=["documents", "metadatas", "distances"],
        )

        # 格式化返回
        skills = []
        for i, doc_id in enumerate(results["ids"][0]):
            metadata = results["metadatas"][0][i] if results["metadatas"] else {}
            distance = results["distances"][0][i] if results["distances"] else 1.0
            skills.append({
                "dir_name": doc_id,
                "skill_name": metadata.get("skill_name", doc_id),
                "description": metadata.get("description", ""),
                "target_role": metadata.get("target_role", "any"),
                "body_preview": (results["documents"][0][i] or "")[:300],
                "similarity_score": round(1 - distance, 3),  # ChromaDB 返回距离，转为相似度
            })

        return skills

    # ==================== 解析辅助 ====================

    @staticmethod
    def _parse_skill_meta(content: str) -> dict:
        """解析 SKILL.md 的 YAML front matter"""
        meta = {}
        lines = content.split("\n")
        if not lines or lines[0].strip() != "---":
            return meta

        end_idx = -1
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                end_idx = i
                break

        if end_idx < 0:
            return meta

        for line in lines[1:end_idx]:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue

            key, _, value = stripped.partition(":")
            key = key.strip()
            value = value.strip().strip('"').strip("'")

            # 列表格式
            if value.startswith("["):
                value = [w.strip().strip('"').strip("'") for w in value.strip("[]").split(",") if w.strip()]

            meta[key] = value

        return meta

    @staticmethod
    def _extract_body(content: str) -> str:
        """提取 SKILL.md front matter 之后的正文内容"""
        lines = content.split("\n")
        if not lines or lines[0].strip() != "---":
            return content

        # 跳过 front matter
        in_front_matter = True
        body_start = 0
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                body_start = i + 1
                break

        return "\n".join(lines[body_start:]).strip()
