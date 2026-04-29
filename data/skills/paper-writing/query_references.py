"""
论文写作 - 向量知识库检索脚本

从 ChromaDB documents collection 按关键词检索已入库文献片段，
输出结构化 Markdown 供 Executor 写作时参考。

用法：
    python query_references.py --query "雨污分流改造技术" [--topic "排水管网"] [--top_k 10]
    python query_references.py --query "非开挖修复 CIPP" --top_k 5

输出格式：
    ## 检索结果（N 条相关文献片段）
    ### [1] 来源：xxx.pdf | 章节：xxx | 相关度：0.85
    文献内容...
"""
import argparse
import sys
from pathlib import Path

import chromadb

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from agent import config

CHROMA_DB_DIR = str(config.CHROMA_DB_DIR)
COLLECTION_NAME = config.CHROMA_COLLECTION_DOCUMENTS
EMBEDDING_API_URL = config.EMBEDDING_API_URL
EMBEDDING_MODEL_NAME = config.EMBEDDING_MODEL_NAME


def get_embedding(text: str) -> list[float]:
    """调用本地 Embedding 服务获取向量"""
    import httpx
    resp = httpx.post(
        EMBEDDING_API_URL,
        json={"texts": [text], "model": EMBEDDING_MODEL_NAME},
        timeout=30.0,
    )
    resp.raise_for_status()
    return resp.json()["embeddings"][0]


def search_documents(
    query: str,
    topic: str = None,
    top_k: int = 10,
    semantic_weight: float = 0.7,
    keyword_weight: float = 0.3,
) -> list[dict]:
    """
    混合检索：语义相似度 + 关键词匹配加权融合

    最终得分 = semantic_weight * 语义相似度 + keyword_weight * 关键词命中率
    Embedding 不可用时自动降级为纯关键词匹配。

    Args:
        query: 检索关键词/主题描述
        topic: 可选，限定主题分类
        top_k: 返回数量
        semantic_weight: 语义相似度权重（默认 0.7）
        keyword_weight: 关键词匹配权重（默认 0.3）

    Returns:
        检索结果列表（按混合得分降序）
    """
    import re

    client = chromadb.PersistentClient(path=CHROMA_DB_DIR)

    try:
        collection = client.get_collection(COLLECTION_NAME)
    except Exception:
        print("❌ 文档知识库为空，请先完成 Phase 3 (PDF 向量化)")
        return []

    if collection.count() == 0:
        print("❌ 文档知识库为空，请先完成 Phase 3 (PDF 向量化)")
        return []

    # 提取关键词（用于关键词打分）
    keywords = []
    for word in re.split(r'[\s,，;；、]+', query):
        word = word.strip()
        if len(word) >= 2:
            keywords.append(word.lower())

    # 获取查询向量
    try:
        query_embedding = get_embedding(query)
    except Exception as e:
        # Embedding 服务不可用时，回退到纯关键词匹配模式
        print(f"⚠️ Embedding 服务不可用 ({e})，使用关键词匹配模式")
        return _keyword_fallback(collection, query, topic, top_k)

    # 向量检索（取 top_k * 2 候选，留出融合排序空间）
    where = {"topic": topic} if topic else None
    query_kwargs = {
        "query_embeddings": [query_embedding],
        "n_results": min(top_k * 2, collection.count()),
        "include": ["documents", "metadatas", "distances"],
    }
    if where:
        query_kwargs["where"] = where

    results = collection.query(**query_kwargs)

    if not results or not results["ids"] or not results["ids"][0]:
        return []

    # 混合打分：语义相似度 + 关键词命中率
    items = []
    for i, doc_id in enumerate(results["ids"][0]):
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
            "document": doc_text,
            "metadata": results["metadatas"][0][i],
            "distance": distance,
            "similarity": round(final_score, 3),
            "_semantic": round(semantic_sim, 3),
            "_keyword": round(keyword_sim, 3),
        })

    # 按混合得分降序排列，取 top_k
    items.sort(key=lambda x: x["similarity"], reverse=True)
    return items[:top_k]


def _format_results(results: dict) -> list[dict]:
    """格式化 ChromaDB 查询结果"""
    items = []
    if results and results["ids"] and results["ids"][0]:
        for i, doc_id in enumerate(results["ids"][0]):
            distance = results["distances"][0][i] if results.get("distances") else 0
            items.append({
                "document": results["documents"][0][i],
                "metadata": results["metadatas"][0][i],
                "distance": distance,
                "similarity": round(1 - distance, 3) if distance else 1.0,
            })
    return items


def _keyword_fallback(collection, query: str, topic: str = None, top_k: int = 10) -> list[dict]:
    """
    Embedding 服务不可用时的降级方案：获取所有文档，按关键词匹配打分

    Args:
        collection: ChromaDB collection
        query: 查询文本
        topic: 可选主题过滤
        top_k: 返回数量

    Returns:
        匹配结果列表
    """
    import re

    # 获取所有文档
    where = {"topic": topic} if topic else None
    get_kwargs = {"include": ["documents", "metadatas"]}
    if where:
        get_kwargs["where"] = where

    all_data = collection.get(**get_kwargs)

    if not all_data or not all_data["documents"]:
        return []

    # 分词：提取查询中的关键词（中文按字/词，英文按空格）
    keywords = []
    for word in re.split(r'[\s,，;；、]+', query):
        word = word.strip()
        if len(word) >= 2:  # 至少 2 字符
            keywords.append(word.lower())

    if not keywords:
        return []

    # 对每个文档计算关键词匹配得分
    scored = []
    for i, doc in enumerate(all_data["documents"]):
        doc_lower = doc.lower()
        score = sum(1 for kw in keywords if kw in doc_lower)
        if score > 0:
            scored.append({
                "document": doc,
                "metadata": all_data["metadatas"][i] if all_data.get("metadatas") else {},
                "distance": 1 - (score / len(keywords)),  # 模拟距离（越小越好）
                "similarity": round(score / len(keywords), 3),
            })

    # 按得分降序排列
    scored.sort(key=lambda x: x["similarity"], reverse=True)
    return scored[:top_k]


def main():
    parser = argparse.ArgumentParser(description="论文写作 - 向量知识库检索")
    parser.add_argument("--query", "-q", required=True, help="检索关键词或主题描述")
    parser.add_argument("--topic", "-t", default=None, help="限定主题分类（可选）")
    parser.add_argument("--top_k", "-k", type=int, default=10, help="返回结果数量（默认 10）")
    args = parser.parse_args()

    results = search_documents(args.query, args.topic, args.top_k)

    if not results:
        print(f"未找到与「{args.query}」相关的文献片段。")
        sys.exit(0)

    # 输出结构化 Markdown
    print(f"## 检索结果（{len(results)} 条相关文献片段）\n")
    print(f"检索词：{args.query}")
    if args.topic:
        print(f"限定主题：{args.topic}")
    print()

    for i, item in enumerate(results, 1):
        meta = item["metadata"]
        source = meta.get("source_file", "未知来源")
        section = meta.get("section", "")
        similarity = item["similarity"]
        doc_text = item["document"]

        semantic = item.get("_semantic", "?")
        keyword = item.get("_keyword", "?")
        print(f"### [{i}] 来源：{source} | 综合：{similarity}（语义：{semantic} | 关键词：{keyword}）")
        if section:
            print(f"**章节**：{section}")
        print()
        # 截断过长的文献片段
        if len(doc_text) > 1500:
            doc_text = doc_text[:1500] + "\n... (已截断)"
        print(doc_text)
        print()
        print("---")
        print()


if __name__ == "__main__":
    main()
