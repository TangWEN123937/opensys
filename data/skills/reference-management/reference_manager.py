"""
参考文献管理预置脚本

功能：
1. extract  - 从论文正文中提取所有引用标记，建立引用映射表
2. format   - 从 ChromaDB 获取文献元数据，按 GB/T 7714-2015 格式化参考文献
3. verify   - 交叉核对正文引用标记与参考文献列表的一致性
4. all      - 执行以上全部步骤

用法：
    python reference_manager.py extract --paper-dir <输出目录>
    python reference_manager.py format  --paper-dir <输出目录> [--style gbt7714]
    python reference_manager.py verify  --paper-dir <输出目录>
    python reference_manager.py all     --paper-dir <输出目录>

输出文件（写入 paper-dir）：
    - citation_map.json      : 引用标记→上下文映射表
    - references.md          : 格式化的参考文献列表
    - reference_report.md    : 交叉核对报告
"""

import argparse
import json
import os
import re
import sys

# ChromaDB 配置
CHROMA_DB_DIR = "/app/data/chroma_db"
COLLECTION_NAME = "documents"


# ==================== Step 1: 提取引用标记 ====================

def extract_citations(paper_dir: str) -> dict:
    """
    从论文正文中提取所有引用标记，建立引用映射表

    支持两种引用格式：
    - 数字序号式: [1], [2], [1,3], [3-5]
    - 作者-年份式: 张三（2024）, Smith et al. (2023)

    Returns:
        {
            "bracket_citations": {"1": [...contexts], "2": [...contexts], ...},
            "author_year_citations": {"张三（2024）": [...contexts], ...},
            "source_files": ["file1.md", "file2.md", ...],
        }
    """
    # 读取所有章节文件
    chapter_files = sorted([
        f for f in os.listdir(paper_dir)
        if f.startswith("chapter_") and f.endswith(".md")
    ])

    if not chapter_files:
        # 尝试读取合并文件
        draft = os.path.join(paper_dir, "paper_draft.md")
        if os.path.exists(draft):
            chapter_files = ["paper_draft.md"]
        else:
            print("❌ 未找到论文文件（chapter_*.md 或 paper_draft.md）")
            return {}

    bracket_citations = {}   # 数字序号式: {"1": [上下文列表], ...}
    author_year_citations = {}  # 作者-年份式: {"张三（2024）": [上下文列表], ...}

    # 数字序号匹配: [1], [2,3], [1-5] 等
    bracket_pattern = re.compile(r'\[(\d+(?:[,，\s]*\d+)*(?:-\d+)?)\]')
    # 作者-年份匹配: 中文作者等（2024）或 Author et al. (2023)
    author_year_pattern = re.compile(
        r'([\u4e00-\u9fff]+(?:等)?[（(]\d{4}[）)])'   # 中文: 张三（2024）
        r'|([A-Z][a-z]+(?:\s+(?:et\s+al\.?|and|&)\s*)?[,\s]*\(\d{4}\))'  # 英文: Smith et al. (2023)
    )

    for fname in chapter_files:
        fpath = os.path.join(paper_dir, fname)
        with open(fpath, "r", encoding="utf-8") as f:
            text = f.read()

        lines = text.split("\n")
        for line_no, line in enumerate(lines, 1):
            # 数字序号式
            for match in bracket_pattern.finditer(line):
                raw = match.group(1)
                # 解析 "1,3" 或 "3-5"
                nums = _parse_bracket_nums(raw)
                ctx = _get_context(line, match.start(), match.end(), fname, line_no)
                for n in nums:
                    bracket_citations.setdefault(str(n), []).append(ctx)

            # 作者-年份式
            for match in author_year_pattern.finditer(line):
                marker = match.group(0).strip()
                # 清理前缀（"如"、"参考" 等）
                marker = re.sub(r'^[如参考与]', '', marker)
                ctx = _get_context(line, match.start(), match.end(), fname, line_no)
                author_year_citations.setdefault(marker, []).append(ctx)

    result = {
        "bracket_citations": bracket_citations,
        "author_year_citations": author_year_citations,
        "source_files": chapter_files,
        "stats": {
            "bracket_count": len(bracket_citations),
            "author_year_count": len(author_year_citations),
            "total_references": sum(len(v) for v in bracket_citations.values()),
        }
    }

    # 写入 JSON 映射表
    map_path = os.path.join(paper_dir, "citation_map.json")
    with open(map_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"✅ 引用提取完成")
    print(f"   数字序号引用: {result['stats']['bracket_count']} 个唯一标记")
    print(f"   作者-年份引用: {result['stats']['author_year_count']} 个")
    print(f"   映射表已保存: {map_path}")

    return result


def _parse_bracket_nums(raw: str) -> list[int]:
    """解析方括号内的数字: '1' → [1], '1,3' → [1,3], '3-5' → [3,4,5]"""
    nums = []
    raw = raw.replace("，", ",")
    for part in raw.split(","):
        part = part.strip()
        if "-" in part:
            try:
                a, b = part.split("-", 1)
                nums.extend(range(int(a.strip()), int(b.strip()) + 1))
            except ValueError:
                pass
        else:
            try:
                nums.append(int(part))
            except ValueError:
                pass
    return nums


def _get_context(line: str, start: int, end: int, fname: str, line_no: int) -> dict:
    """获取引用标记的上下文信息"""
    # 取前后各 40 个字符作为上下文
    ctx_start = max(0, start - 40)
    ctx_end = min(len(line), end + 40)
    return {
        "file": fname,
        "line": line_no,
        "context": line[ctx_start:ctx_end].strip(),
    }


# ==================== Step 2: 格式化参考文献 ====================

def format_references(paper_dir: str, style: str = "gbt7714") -> str:
    """
    从 ChromaDB 中获取文献元数据，按指定格式生成参考文献列表

    Args:
        paper_dir: 论文输出目录
        style: 引用格式（目前支持 gbt7714）

    Returns:
        格式化的参考文献 Markdown 文本
    """
    import chromadb

    # 读取引用映射表
    map_path = os.path.join(paper_dir, "citation_map.json")
    if not os.path.exists(map_path):
        print("❌ 未找到 citation_map.json，请先执行 extract")
        return ""

    with open(map_path, "r", encoding="utf-8") as f:
        citation_map = json.load(f)

    # 连接 ChromaDB
    client = chromadb.PersistentClient(path=CHROMA_DB_DIR)
    try:
        collection = client.get_collection(COLLECTION_NAME)
    except Exception:
        print("❌ ChromaDB 知识库为空")
        return ""

    # 获取所有唯一的来源文件
    all_data = collection.get(include=["metadatas"])
    source_files = {}  # source_file → metadata
    for meta in all_data["metadatas"]:
        sf = meta.get("source_file", "")
        if sf and sf not in source_files:
            source_files[sf] = meta

    print(f"📚 知识库中共 {len(source_files)} 篇文献\n")

    # 从 PDF 文件名解析作者和标题
    # 文件名格式: "标题_作者.pdf"
    literature_info = []
    for sf, meta in source_files.items():
        info = _parse_source_filename(sf)
        info["source_file"] = sf
        info["topic"] = meta.get("topic", "")
        literature_info.append(info)

    # 按正文引用顺序排序（数字序号式）
    bracket_citations = citation_map.get("bracket_citations", {})
    ordered_refs = []
    used_sources = set()

    # 尝试通过作者-年份引用和知识库文件名匹配
    author_year_citations = citation_map.get("author_year_citations", {})

    # 为每个数字序号分配文献
    for num in sorted(bracket_citations.keys(), key=lambda x: int(x)):
        contexts = bracket_citations[num]
        # 尝试从上下文推断对应文献
        matched = _match_citation_to_source(contexts, literature_info, used_sources)
        if matched:
            used_sources.add(matched["source_file"])
            ordered_refs.append({"num": int(num), **matched})
        else:
            ordered_refs.append({"num": int(num), "title": f"[待补充] 引用 [{num}]", "author": "", "year": ""})

    # 补充作者-年份引用中未被数字序号覆盖的文献
    for marker, contexts in author_year_citations.items():
        matched = _match_author_year_to_source(marker, literature_info, used_sources)
        if matched and matched["source_file"] not in used_sources:
            used_sources.add(matched["source_file"])
            next_num = max([r["num"] for r in ordered_refs], default=0) + 1
            ordered_refs.append({"num": next_num, **matched})

    # 补充知识库中存在但正文未引用的文献
    unmatched = [info for info in literature_info if info["source_file"] not in used_sources]

    # 格式化输出
    lines = ["# 参考文献\n"]

    for ref in ordered_refs:
        formatted = _format_single_ref(ref, style)
        lines.append(formatted)

    if unmatched:
        lines.append("\n---\n")
        lines.append("## 知识库中未被引用的文献\n")
        lines.append("以下文献存在于知识库中但未在正文中检测到引用，供参考：\n")
        for info in unmatched:
            lines.append(f"- {info.get('author', '?')}. {info.get('title', info['source_file'])}")

    result = "\n".join(lines)

    # 写入文件
    ref_path = os.path.join(paper_dir, "references.md")
    with open(ref_path, "w", encoding="utf-8") as f:
        f.write(result)

    print(f"✅ 参考文献列表生成完成")
    print(f"   已格式化: {len(ordered_refs)} 条")
    print(f"   未匹配: {len(unmatched)} 条")
    print(f"   输出文件: {ref_path}")

    return result


def _parse_source_filename(filename: str) -> dict:
    """
    从 PDF 文件名解析标题和作者
    格式: "标题_作者.pdf" → {"title": "标题", "author": "作者", "year": ""}
    """
    name = filename.replace(".pdf", "").replace(".PDF", "")

    # 尝试以最后一个 _ 分割
    if "_" in name:
        parts = name.rsplit("_", 1)
        title = parts[0].strip()
        author = parts[1].strip()
    else:
        title = name
        author = ""

    # 尝试从标题中提取年份
    year_match = re.search(r'((?:19|20)\d{2})', title)
    year = year_match.group(1) if year_match else ""

    return {"title": title, "author": author, "year": year}


def _match_citation_to_source(
    contexts: list[dict], literature_info: list[dict], used: set
) -> dict | None:
    """根据引用上下文匹配知识库文献"""
    for info in literature_info:
        if info["source_file"] in used:
            continue
        author = info.get("author", "")
        title = info.get("title", "")
        # 检查作者名是否出现在上下文中
        for ctx in contexts:
            ctx_text = ctx.get("context", "")
            if author and len(author) >= 2 and author in ctx_text:
                return info
            # 检查标题关键词
            title_words = [w for w in re.split(r'[\s_\-]+', title) if len(w) >= 2]
            if title_words:
                hits = sum(1 for w in title_words if w in ctx_text)
                if hits >= 2:
                    return info
    return None


def _match_author_year_to_source(
    marker: str, literature_info: list[dict], used: set
) -> dict | None:
    """根据作者-年份标记匹配知识库文献"""
    # 提取作者名和年份
    # 格式: "张三（2024）" 或 "Smith et al. (2023)"
    cn_match = re.match(r'([\u4e00-\u9fff]+)', marker)
    year_match = re.search(r'(\d{4})', marker)

    if not cn_match and not year_match:
        return None

    author_name = cn_match.group(1) if cn_match else ""

    for info in literature_info:
        if info["source_file"] in used:
            continue
        if author_name and author_name in info.get("author", ""):
            return info
        if author_name and author_name in info.get("title", ""):
            return info
    return None


def _format_single_ref(ref: dict, style: str) -> str:
    """格式化单条参考文献"""
    num = ref.get("num", "?")
    title = ref.get("title", "")
    author = ref.get("author", "")
    year = ref.get("year", "")

    if style == "gbt7714":
        # GB/T 7714-2015 格式
        # [序号] 作者. 题名[J/D/M]. 来源, 年.
        if not author and not title:
            return f"[{num}] [待补充]"

        # 判断文献类型（从标题推断）
        doc_type = "J"  # 默认期刊
        if any(kw in title for kw in ["研究", "分析", "探讨", "模拟"]):
            doc_type = "J"  # 期刊论文

        year_str = f", {year}" if year else ""
        author_str = f"{author}. " if author else ""
        return f"[{num}] {author_str}{title}[{doc_type}]{year_str}."
    else:
        return f"[{num}] {author}. {title}. {year}."


# ==================== Step 3: 交叉核对 ====================

def verify_references(paper_dir: str) -> str:
    """
    交叉核对正文引用标记与参考文献列表的一致性

    检查项：
    1. 正文引用 → 参考文献列表中存在
    2. 参考文献列表 → 正文中被引用
    3. 编号连续性
    4. 信息完整性
    """
    # 读取引用映射表
    map_path = os.path.join(paper_dir, "citation_map.json")
    if not os.path.exists(map_path):
        print("❌ 未找到 citation_map.json，请先执行 extract")
        return ""

    with open(map_path, "r", encoding="utf-8") as f:
        citation_map = json.load(f)

    # 读取参考文献列表
    ref_path = os.path.join(paper_dir, "references.md")
    if not os.path.exists(ref_path):
        print("❌ 未找到 references.md，请先执行 format")
        return ""

    with open(ref_path, "r", encoding="utf-8") as f:
        ref_text = f.read()

    # 从参考文献列表中提取编号
    ref_nums = set()
    for match in re.finditer(r'^\[(\d+)\]', ref_text, re.MULTILINE):
        ref_nums.add(int(match.group(1)))

    # 正文中的引用编号
    citation_nums = set()
    for num_str in citation_map.get("bracket_citations", {}):
        try:
            citation_nums.add(int(num_str))
        except ValueError:
            pass

    # 核对
    issues = []

    # 1. 正文引用但参考文献中缺失
    orphan_citations = citation_nums - ref_nums
    if orphan_citations:
        issues.append(f"⚠️ **孤立引用**（正文有引用但参考文献缺失）: {sorted(orphan_citations)}")

    # 2. 参考文献有但正文未引用
    unused_refs = ref_nums - citation_nums
    if unused_refs:
        issues.append(f"⚠️ **多余条目**（参考文献有但正文未引用）: {sorted(unused_refs)}")

    # 3. 编号连续性
    if citation_nums:
        max_num = max(citation_nums)
        missing_nums = set(range(1, max_num + 1)) - citation_nums
        if missing_nums:
            issues.append(f"⚠️ **编号跳号**: 缺少 {sorted(missing_nums)}")

    # 4. 待补充条目
    pending_count = ref_text.count("[待补充]")
    if pending_count:
        issues.append(f"⚠️ **待补充**: {pending_count} 条参考文献信息不完整")

    # 生成报告
    lines = ["# 参考文献交叉核对报告\n"]
    lines.append(f"- 正文引用标记数: {len(citation_nums)}")
    lines.append(f"- 参考文献条目数: {len(ref_nums)}")
    lines.append(f"- 作者-年份引用数: {citation_map.get('stats', {}).get('author_year_count', 0)}")
    lines.append("")

    if issues:
        lines.append("## 发现的问题\n")
        for issue in issues:
            lines.append(f"- {issue}")
    else:
        lines.append("## ✅ 核对通过\n")
        lines.append("所有正文引用标记与参考文献列表一致。")

    # 引用频次统计
    lines.append("\n## 引用频次统计\n")
    bracket = citation_map.get("bracket_citations", {})
    freq = [(int(k), len(v)) for k, v in bracket.items()]
    freq.sort(key=lambda x: x[0])
    for num, count in freq:
        lines.append(f"- [{num}]: 出现 {count} 次")

    result = "\n".join(lines)

    # 写入报告
    report_path = os.path.join(paper_dir, "reference_report.md")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(result)

    status = "✅ 核对通过" if not issues else f"⚠️ 发现 {len(issues)} 个问题"
    print(f"\n{status}")
    print(f"   报告已保存: {report_path}")

    return result


# ==================== Main ====================

def main():
    parser = argparse.ArgumentParser(
        description="参考文献管理工具（提取 → 格式化 → 核对）"
    )
    parser.add_argument(
        "action",
        choices=["extract", "format", "verify", "all"],
        help="执行动作: extract=提取引用, format=格式化文献, verify=交叉核对, all=全部"
    )
    parser.add_argument(
        "--paper-dir", required=True,
        help="论文输出目录（含 chapter_*.md 或 paper_draft.md）"
    )
    parser.add_argument(
        "--style", default="gbt7714",
        choices=["gbt7714"],
        help="引用格式（默认 GB/T 7714-2015）"
    )
    args = parser.parse_args()

    if not os.path.isdir(args.paper_dir):
        print(f"❌ 目录不存在: {args.paper_dir}")
        sys.exit(1)

    if args.action in ("extract", "all"):
        print("=" * 50)
        print("Step 1: 提取引用标记")
        print("=" * 50)
        extract_citations(args.paper_dir)
        print()

    if args.action in ("format", "all"):
        print("=" * 50)
        print("Step 2: 格式化参考文献")
        print("=" * 50)
        format_references(args.paper_dir, args.style)
        print()

    if args.action in ("verify", "all"):
        print("=" * 50)
        print("Step 3: 交叉核对")
        print("=" * 50)
        verify_references(args.paper_dir)
        print()


if __name__ == "__main__":
    main()
