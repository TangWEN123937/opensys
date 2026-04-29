#!/usr/bin/env python3
"""
PDF → Markdown → ChromaDB 向量化入库脚本

流程：
  1. 扫描指定目录下的 PDF 文件
  2. PyMuPDF 逐页渲染 PDF 为 PNG 图片，SiliconFlow PaddleOCR-VL 免费 OCR 解析为 Markdown
  3. LLM 自动分类主题（或使用用户指定的 topic）
  4. 按标题层级切分 Markdown 为 chunks
  5. 生成 Embedding 并写入 ChromaDB documents collection

位置：data/skills/pdf-vectorize/pdf_vectorize.py（与 SKILL.md 同目录，便于统一管理）

用法：
  python /app/data/skills/pdf-vectorize/pdf_vectorize.py --input /app/data/downloads/
  python /app/data/skills/pdf-vectorize/pdf_vectorize.py --input /app/data/downloads/ --topic "城市更新"
  python /app/data/skills/pdf-vectorize/pdf_vectorize.py --input /app/data/downloads/example.pdf
"""

import argparse
import asyncio
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
from datetime import datetime
from pathlib import Path

# 将项目根目录加入 sys.path，确保可以 import agent 包
# 脚本位于 data/skills/pdf-vectorize/，项目根目录在三级父目录
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from agent import config
from agent.vector_store import VectorStoreManager


# ==================== PDF 扫描 ====================

def scan_pdfs(input_path: str) -> list[Path]:
    """
    扫描输入路径下的所有 PDF 文件

    Args:
        input_path: 文件或目录路径

    Returns:
        PDF 文件路径列表
    """
    p = Path(input_path)
    if p.is_file() and p.suffix.lower() == ".pdf":
        return [p]
    elif p.is_dir():
        # 递归扫描目录下所有 PDF（按文件名排序）
        pdfs = sorted(p.rglob("*.pdf"))
        # 排除临时目录中的 PDF
        pdfs = [f for f in pdfs if "/_temp_ocr/" not in str(f)]
        return pdfs
    else:
        print(f"[错误] 输入路径不是 PDF 文件或目录: {input_path}")
        return []


def compute_file_hash(file_path: Path) -> str:
    """计算文件 SHA256 哈希值（取前 16 位作为 doc_id）"""
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()[:16]


# ==================== SiliconFlow PaddleOCR-VL PDF 解析 ====================

# PDF 最大页数限制（超过此页数的 PDF 跳过 OCR）
MAX_PDF_PAGES = 50
# PDF 页面渲染 DPI（越高精度越好，但图像越大、Token 消耗越多）
_RENDER_DPI = 200


def _render_page_to_base64(page, dpi: int = _RENDER_DPI) -> str:
    """
    将 PyMuPDF 页面对象渲染为 PNG 并返回 base64 编码

    Args:
        page: fitz.Page 对象
        dpi: 渲染 DPI

    Returns:
        PNG 图片的 base64 编码字符串
    """
    import base64
    import fitz  # PyMuPDF

    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat)
    img_bytes = pix.tobytes("png")
    return base64.b64encode(img_bytes).decode("utf-8")


def _ocr_image(img_b64: str, label: str = "") -> str:
    """
    调用 SiliconFlow PaddleOCR-VL 解析图片 base64 → Markdown

    使用 OpenAI 兼容格式，传输 PNG 图片 base64 数据。

    Args:
        img_b64: PNG 图片的 base64 编码字符串
        label: 日志标签（如页码）

    Returns:
        解析出的 Markdown 文本，失败返回空字符串
    """
    from openai import OpenAI

    api_key = config.OCR_API_KEY
    if not api_key:
        print(f"  [OCR] 错误: 未设置 SILICONFLOW_API_KEY 环境变量")
        return ""

    try:
        client = OpenAI(
            api_key=api_key,
            base_url=config.OCR_API_BASE,
            timeout=config.OCR_TIMEOUT,
        )

        response = client.chat.completions.create(
            model=config.OCR_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{img_b64}"
                        },
                    },
                    {
                        "type": "text",
                        "text": "Convert the document to markdown.",
                    },
                ],
            }],
        )

        # 提取文本
        if response.choices and response.choices[0].message.content:
            text = response.choices[0].message.content.strip()
            # 清理可能的 markdown 代码块包裹
            text = re.sub(r'^```(?:markdown)?\n?', '', text)
            text = re.sub(r'\n?```$', '', text)
            return text.strip()

        print(f"    [OCR] {label}: 响应为空")
        return ""

    except Exception as e:
        print(f"    [OCR] {label} 解析失败: {e}")
        return ""


def parse_pdf_with_ocr(pdf_path: Path, temp_dir: Path) -> str | None:
    """
    将 PDF 解析为 Markdown（PyMuPDF 渲染 PNG + SiliconFlow PaddleOCR-VL）

    流程：PyMuPDF 逐页渲染为 PNG 图片 → 图片 base64 发送至 PaddleOCR-VL → 拼合 Markdown
    不需要临时文件，全程内存操作。

    Args:
        pdf_path: PDF 文件路径
        temp_dir: 临时文件输出目录（本方案实际不使用，保留参数兼容性）

    Returns:
        合并后的 Markdown 文本，失败返回 None
    """
    import fitz  # PyMuPDF

    print(f"  [OCR] 开始解析: {pdf_path.name}")

    # 打开 PDF 并获取页数
    try:
        doc = fitz.open(str(pdf_path))
        page_count = len(doc)
    except Exception as e:
        print(f"  [OCR] 无法读取 PDF: {e}")
        return None

    print(f"  [OCR] 共 {page_count} 页，逐页渲染 PNG + OCR")

    # 逐页渲染为 PNG 并 OCR
    all_texts = []
    for page_num in range(page_count):
        print(f"    [OCR] 第 {page_num + 1}/{page_count} 页...", end=" ")
        try:
            img_b64 = _render_page_to_base64(doc[page_num])
        except Exception as e:
            print(f"✗ (渲染失败: {e})")
            continue

        text = _ocr_image(img_b64, label=f"第{page_num + 1}页")
        if text:
            print(f"✓ ({len(text)} 字符)")
            all_texts.append(f"<!-- Page {page_num + 1} -->\n{text}")
        else:
            print("✗ (空)")

    doc.close()

    if not all_texts:
        print("  [OCR] 所有页面 OCR 结果为空")
        return None

    md_content = "\n\n".join(all_texts)
    print(f"  [OCR] 解析完成: {len(all_texts)}/{page_count} 页成功, "
          f"总计 {len(md_content)} 字符")
    return md_content


# ==================== LLM 自动分类 ====================

async def classify_topic(
    md_content: str,
    existing_topics: list[str],
    source_filename: str = "",
) -> str:
    """
    调用 LLM 根据文档标题和摘要自动分类主题

    Args:
        md_content: Markdown 全文内容
        existing_topics: 已有的主题列表
        source_filename: 原始文件名（辅助分类）

    Returns:
        主题名称（2-6 字）
    """
    # 提取前 800 字符（包含标题和摘要）
    preview = md_content[:800].strip()

    # 构建分类 prompt
    topics_str = "、".join(existing_topics) if existing_topics else "（暂无，需要创建新主题）"

    prompt = f"""你是一个文档分类助手。请根据以下文档内容判断其所属主题。

已有主题列表：{topics_str}
文件名：{source_filename}

文档内容（前 800 字）：
{preview}

请判断该文档属于哪个主题：
- 若匹配已有主题，返回该主题名称
- 若不匹配任何已有主题，建议一个简短的新主题名（2-6 个中文字）
- 若跨领域，返回最主要的一个

请只返回一个 JSON 对象，不要其他内容：
{{"topic": "主题名称", "confidence": 0.9}}"""

    try:
        import httpx

        # 获取分类模型配置
        model_name = config.PDF_CLASSIFY_MODEL
        preset = config.MODEL_PRESETS.get(model_name, {})
        api_key = preset.get("api_key", "")
        api_base = preset.get("api_base", "")

        if not api_key or not api_base:
            print(f"  [分类] 模型 {model_name} 未配置 API key/base，使用默认主题「未分类」")
            return "未分类"

        # 调用 LLM（OpenAI 兼容格式）
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{api_base.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": model_name,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3,
                    "max_tokens": 100,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"].strip()

            # 解析 JSON 响应
            # 尝试提取 JSON（LLM 可能在 JSON 前后加文字）
            json_match = re.search(r'\{[^}]+\}', content)
            if json_match:
                result = json.loads(json_match.group())
                topic = result.get("topic", "未分类")
                confidence = result.get("confidence", 0.5)
                print(f"  [分类] topic=\"{topic}\" (confidence={confidence})")

                # 置信度过低时标记为未分类
                if confidence < 0.5:
                    print(f"  [分类] 置信度过低 ({confidence})，标记为「未分类」")
                    return "未分类"
                return topic
            else:
                # JSON 解析失败，尝试直接用返回文本作为 topic
                topic = content.strip().strip('"').strip("'")[:10]
                if topic:
                    print(f"  [分类] JSON 解析失败，使用原始返回: \"{topic}\"")
                    return topic
                return "未分类"

    except Exception as e:
        print(f"  [分类] LLM 调用失败: {e}，使用默认主题「未分类」")
        return "未分类"


# ==================== Markdown 切分 ====================

def split_markdown_chunks(
    md_content: str,
    max_chars: int = None,
    overlap_chars: int = None,
) -> list[dict]:
    """
    按标题层级切分 Markdown 文本为 chunks

    切分策略：
    1. 优先按一级/二级标题 (# / ##) 切分
    2. 单个 chunk 超过 max_chars 时按段落二次切分
    3. 相邻 chunk 保留 overlap_chars 重叠

    Args:
        md_content: Markdown 全文
        max_chars: 单个 chunk 最大字符数
        overlap_chars: 相邻 chunk 重叠字符数

    Returns:
        chunks 列表，每项为 {"text": str, "section": str}
    """
    max_chars = max_chars or config.PDF_CHUNK_MAX_CHARS
    overlap_chars = overlap_chars or config.PDF_CHUNK_OVERLAP_CHARS

    # 按标题行切分（匹配 # 到 ### 级别）
    # 保留标题行本身作为 chunk 的开头
    header_pattern = re.compile(r'^(#{1,3})\s+(.+)', re.MULTILINE)

    sections = []
    last_pos = 0
    current_headers = []  # 维护标题层级栈

    for match in header_pattern.finditer(md_content):
        # 将上一段内容作为一个 section
        if last_pos < match.start():
            text = md_content[last_pos:match.start()].strip()
            if text:
                section_path = " > ".join(current_headers) if current_headers else "开头"
                sections.append({"text": text, "section": section_path})

        # 更新标题层级栈
        level = len(match.group(1))  # # = 1, ## = 2, ### = 3
        title = match.group(2).strip()

        # 弹出同级或更低级别的标题
        while current_headers and len(current_headers) >= level:
            current_headers.pop()
        current_headers.append(title)

        last_pos = match.start()

    # 最后一段
    if last_pos < len(md_content):
        text = md_content[last_pos:].strip()
        if text:
            section_path = " > ".join(current_headers) if current_headers else "结尾"
            sections.append({"text": text, "section": section_path})

    # 如果没有标题，整个文档作为一个 section
    if not sections:
        sections = [{"text": md_content.strip(), "section": "全文"}]

    # 二次切分：超长 section 按段落或固定长度切分
    chunks = []
    for section in sections:
        text = section["text"]
        sec_name = section["section"]

        if len(text) <= max_chars:
            chunks.append({"text": text, "section": sec_name})
        else:
            # 按段落（双换行）切分，再合并到 max_chars 以内
            paragraphs = re.split(r'\n\n+', text)
            current_chunk = ""

            for para in paragraphs:
                if len(current_chunk) + len(para) + 2 <= max_chars:
                    current_chunk = current_chunk + "\n\n" + para if current_chunk else para
                else:
                    if current_chunk:
                        chunks.append({"text": current_chunk, "section": sec_name})
                    # 如果单个段落就超过 max_chars，强制按字符切分
                    if len(para) > max_chars:
                        for i in range(0, len(para), max_chars - overlap_chars):
                            sub = para[i:i + max_chars]
                            chunks.append({"text": sub, "section": sec_name})
                        current_chunk = ""
                    else:
                        current_chunk = para

            if current_chunk:
                chunks.append({"text": current_chunk, "section": sec_name})

    # 添加重叠（在相邻 chunk 之间）
    if overlap_chars > 0 and len(chunks) > 1:
        overlapped_chunks = [chunks[0]]
        for i in range(1, len(chunks)):
            prev_text = chunks[i - 1]["text"]
            # 从上一个 chunk 末尾取 overlap_chars 字符作为当前 chunk 的前缀
            overlap = prev_text[-overlap_chars:] if len(prev_text) > overlap_chars else prev_text
            overlapped_chunks.append({
                "text": overlap + "\n\n" + chunks[i]["text"],
                "section": chunks[i]["section"],
            })
        chunks = overlapped_chunks

    # 过滤空 chunk
    chunks = [c for c in chunks if c["text"].strip()]

    return chunks


# ==================== 辅助：查找已有 Markdown ====================

def _find_existing_markdown(output_dir: Path, pdf_stem: str) -> Path | None:
    """
    在 output_dir 下递归查找是否已存在该 PDF 对应的 Markdown 文件
    （即之前已解析过，无需重复 OCR）

    搜索范围：output_dir/{任意子目录}/{pdf_stem}.md
    排除：_temp_ocr 临时目录

    Args:
        output_dir: Markdown 输出根目录（如 /app/data/documents/）
        pdf_stem: PDF 文件名（不含扩展名）

    Returns:
        已存在的 .md 文件路径，未找到返回 None
    """
    target_name = f"{pdf_stem}.md"
    for md_file in output_dir.rglob(target_name):
        # 排除临时目录
        if "/_temp_ocr/" in str(md_file):
            continue
        # 确保是有效文件（非空）
        if md_file.is_file() and md_file.stat().st_size > 0:
            return md_file
    return None


# ==================== 主流程 ====================

async def process_single_pdf(
    pdf_path: Path,
    output_dir: Path,
    vector_store: VectorStoreManager,
    topic: str | None = None,
) -> dict:
    """
    处理单个 PDF 文件：解析 → 分类 → 切分 → 入库

    Args:
        pdf_path: PDF 文件路径
        output_dir: Markdown 输出根目录
        vector_store: 向量存储管理器
        topic: 手动指定的主题（None 则 LLM 自动分类）

    Returns:
        处理结果 dict
    """
    print(f"\n{'='*60}")
    print(f"处理: {pdf_path.name}")
    print(f"{'='*60}")

    # 计算文件哈希（用于去重）
    doc_id = compute_file_hash(pdf_path)
    print(f"  doc_id: {doc_id}")

    # 检查是否已入库（去重）
    existing = vector_store._documents.get(
        where={"doc_id": doc_id},
        limit=1,
    )
    if existing and existing["ids"]:
        existing_topic = existing["metadatas"][0].get("topic", "未知") if existing["metadatas"] else "未知"
        print(f"  [跳过] 该文件已入库 (doc_id={doc_id}, topic={existing_topic})")
        return {
            "file": pdf_path.name,
            "status": "skipped",
            "reason": "already_indexed",
            "topic": existing_topic,
        }

    # Step 0.5: 页数检查 — 超过上限的 PDF 跳过 OCR
    try:
        import fitz
        _doc = fitz.open(str(pdf_path))
        _page_count = len(_doc)
        _doc.close()
        if _page_count > MAX_PDF_PAGES:
            print(f"  [跳过] PDF 共 {_page_count} 页，超过上限 {MAX_PDF_PAGES} 页")
            return {
                "file": pdf_path.name,
                "status": "skipped",
                "reason": f"too_many_pages ({_page_count} > {MAX_PDF_PAGES})",
            }
    except Exception as e:
        print(f"  [警告] 无法读取 PDF 页数: {e}，继续处理")

    # Step 1: 检查是否已有之前解析过的 Markdown（避免重复 OCR）
    existing_md = _find_existing_markdown(output_dir, pdf_path.stem)
    if existing_md:
        print(f"  [复用] 发现已有 Markdown: {existing_md}")
        md_content = existing_md.read_text(encoding="utf-8")
    else:
        # 调用 SiliconFlow PaddleOCR-VL 解析 PDF → Markdown
        temp_dir = output_dir / "_temp_ocr" / pdf_path.stem
        md_content = parse_pdf_with_ocr(pdf_path, temp_dir)
        # 清理临时文件目录（大 PDF 拆分时产生的单页 PDF）
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass
        if not md_content:
            return {
                "file": pdf_path.name,
                "status": "failed",
                "reason": "ocr_parse_failed",
            }

    if not md_content.strip():
        print(f"  [跳过] 解析结果为空")
        return {
            "file": pdf_path.name,
            "status": "failed",
            "reason": "empty_markdown",
        }

    # Step 2: LLM 自动分类（或使用指定 topic）
    if topic:
        final_topic = topic
        print(f"  [分类] 使用指定主题: \"{final_topic}\"")
    else:
        # 如果复用了已有 Markdown，尝试从其所在目录名推断 topic
        if existing_md and existing_md.parent.name != output_dir.name:
            inferred = existing_md.parent.name
            # 排除临时目录名
            if inferred not in ("_temp_ocr",):
                final_topic = inferred
                print(f"  [分类] 从已有目录推断主题: \"{final_topic}\"")
            else:
                existing_topics = vector_store.get_document_topics()
                final_topic = await classify_topic(md_content, existing_topics, pdf_path.name)
        else:
            existing_topics = vector_store.get_document_topics()
            final_topic = await classify_topic(md_content, existing_topics, pdf_path.name)

    # Step 3: 保存 Markdown 到目标目录
    topic_dir = output_dir / final_topic
    topic_dir.mkdir(parents=True, exist_ok=True)
    final_md_path = topic_dir / f"{pdf_path.stem}.md"
    if not existing_md or existing_md != final_md_path:
        final_md_path.write_text(md_content, encoding="utf-8")
        print(f"  [保存] {final_md_path}")
    else:
        print(f"  [保存] 已在正确位置: {final_md_path}")

    # Step 4: 切分 Markdown 为 chunks
    raw_chunks = split_markdown_chunks(md_content)
    print(f"  [切分] {len(raw_chunks)} 个 chunks")

    # 构建 ChromaDB chunk 数据
    now_str = datetime.now().isoformat()
    chunks_for_db = []
    for i, raw in enumerate(raw_chunks):
        chunks_for_db.append({
            "id": f"{doc_id}_chunk_{i}",
            "text": raw["text"],
            "metadata": {
                "doc_id": doc_id,
                "source_file": pdf_path.name,
                "topic": final_topic,
                "section": raw["section"],
                "chunk_index": i,
                "page_start": 0,  # OCR 按页解析，暂不提供精确页码映射
                "total_chunks": len(raw_chunks),
                "created_at": now_str,
            },
        })

    # Step 5: Embedding + 写入 ChromaDB
    stored = await vector_store.store_document_chunks(chunks_for_db)

    return {
        "file": pdf_path.name,
        "status": "success",
        "topic": final_topic,
        "chunks": stored,
        "md_path": str(final_md_path),
    }


async def main(
    input_path: str,
    output_path: str | None = None,
    topic: str | None = None,
):
    """
    主入口：扫描 → 解析 → 分类 → 切分 → 入库

    Args:
        input_path: PDF 文件或目录路径
        output_path: Markdown 输出目录（默认 config.DOCUMENTS_DIR）
        topic: 手动指定主题（None 则 LLM 自动分类）
    """
    output_dir = Path(output_path) if output_path else config.DOCUMENTS_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    # 扫描 PDF 文件
    pdfs = scan_pdfs(input_path)
    if not pdfs:
        print(f"[完成] 未找到 PDF 文件: {input_path}")
        return

    print(f"\n{'#'*60}")
    print(f"# PDF → ChromaDB 向量化入库")
    print(f"# 输入: {input_path}")
    print(f"# 输出: {output_dir}")
    print(f"# 主题: {topic or '自动分类'}")
    print(f"# 文件数: {len(pdfs)}")
    print(f"{'#'*60}")

    # 初始化向量存储
    vector_store = VectorStoreManager()

    results = []
    for pdf in pdfs:
        try:
            result = await process_single_pdf(pdf, output_dir, vector_store, topic)
            results.append(result)
        except Exception as e:
            print(f"\n[错误] 处理 {pdf.name} 异常: {e}")
            results.append({
                "file": pdf.name,
                "status": "error",
                "reason": str(e),
            })

    # 关闭向量存储连接
    await vector_store.close()

    # 汇报结果
    print(f"\n{'='*60}")
    print(f"处理完成 — 汇总报告")
    print(f"{'='*60}")

    success = [r for r in results if r["status"] == "success"]
    skipped = [r for r in results if r["status"] == "skipped"]
    failed = [r for r in results if r["status"] in ("failed", "error")]

    print(f"  成功: {len(success)} 篇")
    for r in success:
        print(f"    ✅ {r['file']} → topic=\"{r['topic']}\" ({r['chunks']} chunks)")

    if skipped:
        print(f"  跳过: {len(skipped)} 篇（已入库）")
        for r in skipped:
            print(f"    ⏭️  {r['file']} (topic=\"{r.get('topic', '?')}\")")

    if failed:
        print(f"  失败: {len(failed)} 篇")
        for r in failed:
            print(f"    ❌ {r['file']}: {r.get('reason', '未知错误')}")

    # 统计信息
    total_chunks = sum(r.get("chunks", 0) for r in success)
    topics = set(r.get("topic", "") for r in success if r.get("topic"))
    print(f"\n  总入库 chunks: {total_chunks}")
    print(f"  涉及主题: {', '.join(sorted(topics)) if topics else '无'}")
    print(f"  ChromaDB documents 集合总量: {vector_store.get_document_count()}")


# ==================== CLI 入口 ====================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="PDF → Markdown → ChromaDB 向量化入库工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例：
  # 处理整个下载目录（自动分类）
  python /app/data/skills/pdf-vectorize/pdf_vectorize.py --input /app/data/downloads/

  # 指定主题
  python /app/data/skills/pdf-vectorize/pdf_vectorize.py --input /app/data/downloads/ --topic "城市更新"

  # 处理单个文件
  python /app/data/skills/pdf-vectorize/pdf_vectorize.py --input /app/data/downloads/example.pdf

  # 指定输出目录
  python /app/data/skills/pdf-vectorize/pdf_vectorize.py --input ./pdfs --output ./docs
        """,
    )
    parser.add_argument(
        "--input", "-i",
        required=True,
        help="PDF 文件或目录路径",
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help=f"Markdown 输出目录（默认: {config.DOCUMENTS_DIR}）",
    )
    parser.add_argument(
        "--topic", "-t",
        default=None,
        help="手动指定主题分类（不指定则 LLM 自动分类）",
    )

    args = parser.parse_args()
    asyncio.run(main(args.input, args.output, args.topic))
