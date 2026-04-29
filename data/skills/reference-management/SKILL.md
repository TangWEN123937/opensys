---
name: 参考文献整理
triggers: [参考文献, 引用, 引文, 文献列表, bibliography, reference, 引用格式, GB/T 7714, APA]
priority: 7
description: 整理全文引用，生成规范的参考文献列表，核对正文引用标记与参考文献的一致性
summary: 使用预置脚本一条命令完成：①提取正文引用标记 ②从ChromaDB查元数据并按GB/T 7714格式化 ③交叉核对一致性。产出 references.md + reference_report.md。
version: "2.1"
target_role: agent
---

## 参考文献整理流程（本技能被激活时执行）

### ⚠️ 核心原则

**本任务使用预置脚本完成，你不需要手动提取引用或格式化文献。**

1. 用 `run_terminal` 执行预置脚本 `reference_manager.py`
2. 检查脚本输出，发现 `[待补充]` 条目时人工补全
3. 最终确保 `references.md` 和 `reference_report.md` 生成完毕

### 前置条件
- Phase 6（正文撰写）已完成，论文正文文件在 pipeline 的 `_task_dir` 输出目录下
  - 分章节文件：`chapter_1.md` ~ `chapter_7.md`（固定命名）
  - 或合并文件：`paper_draft.md`
- ChromaDB 知识库已包含向量化的文献

### 预置脚本说明

- **路径**：`/app/data/skills/reference-management/reference_manager.py`
- **功能**：提取引用标记 → 从 ChromaDB 查文献元数据 → 按 GB/T 7714 格式化 → 交叉核对
- **依赖**：chromadb（已安装）

### 执行步骤

#### 第一步：确认论文输出目录

```bash
# 查看输出目录下的文件
ls <输出目录>/
```

确认 `chapter_*.md` 或 `paper_draft.md` 存在。

#### 第二步：一键执行全部流程

```bash
python /app/data/skills/reference-management/reference_manager.py all --paper-dir <输出目录>
```

脚本会自动完成：
1. **extract** — 从所有 chapter_*.md 中提取引用标记，生成 `citation_map.json`
2. **format** — 从 ChromaDB 获取文献元数据，按 GB/T 7714-2015 生成 `references.md`
3. **verify** — 交叉核对正文引用与参考文献的一致性，生成 `reference_report.md`

也可分步执行：
```bash
python reference_manager.py extract --paper-dir <输出目录>
python reference_manager.py format  --paper-dir <输出目录>
python reference_manager.py verify  --paper-dir <输出目录>
```

#### 第三步：检查输出并修正一致性

1. 查看 `reference_report.md` 中的核对结果
2. **孤立引用必须修正**：如果正文中有 `[N]` 引用但参考文献列表中缺少对应条目：
   - 优先：在 `references.md` 中补充该条目（从知识库或上下文推断）
   - 备选：如果确实无法补充，**修正正文文件中的引用标记**（删除或合并到已有编号），然后重新运行 `verify` 确保一致
   - 用 `run_terminal` 执行 `sed` 或 Python 脚本批量替换正文中的错误编号
   - 修正后必须同步更新 `paper_draft.md`（重新 `cat` 合并）
3. 如有 `[待补充]` 条目，补全缺失的文献信息
4. **最终验证**：修正完成后再次运行 `python reference_manager.py verify --paper-dir <输出目录>`，确认报告显示"核对通过"

#### 第四步：向量库核实文献信息（关键！）

**脚本从 PDF 文件名推断作者和标题，准确性有限。必须逐条核实。**

对 `references.md` 中的每一条参考文献，用 `run_terminal` 调用检索脚本向 ChromaDB 查证：

```bash
# 用论文标题关键词检索，核实作者、年份、期刊/会议名
python /app/data/skills/paper-writing/query_references.py --query "文献标题关键词" --top_k 3
```

核实要点：
1. **作者姓名**：与 PDF 原文中的作者栏一致（注意中英文姓名顺序、多作者时 et al. 使用）
2. **发表年份**：与原文封面/首页标注的年份一致
3. **论文标题**：必须与原文标题完全一致（包括副标题），不可截断或改写
4. **期刊/会议名**：必须使用规范的全称或标准缩写
5. **卷号/期号/页码**：如检索结果中有，必须核实

```python
# 核实示例：读取 ChromaDB 中的文档 metadata
import chromadb
client = chromadb.PersistentClient(path="/app/data/chroma_db")
col = client.get_collection("documents")

# 查看所有已入库文档的元数据（source_file 字段）
results = col.get(limit=100, include=["metadatas"])
for m in results["metadatas"]:
    src = m.get("source_file", "")
    topic = m.get("topic", "")
    if src:
        print(f"  {src}  topic={topic}")
```

**如果发现脚本生成的引用信息与向量库原文不一致，必须手动修正 `references.md`。**

### 产出物

| 文件 | 说明 |
|---|---|
| `citation_map.json` | 引用标记→上下文映射表（JSON） |
| `references.md` | 格式化的参考文献列表（GB/T 7714，已核实） |
| `reference_report.md` | 交叉核对报告 |

### 注意事项

- **脚本从 PDF 文件名解析作者和标题**（格式 `标题_作者.pdf`），文件名不规范时结果可能有误，**必须执行第四步核实**
- **[待补充] 标记**：脚本无法匹配的引用会标记 `[待补充]`，需要人工补全
- **作者/标题/年份不允许出错**：这是学术论文的基本底线，每条文献都必须核对到位
- 如果脚本报错，检查 ChromaDB 路径 `/app/data/chroma_db` 和 collection `documents` 是否可访问
- 修正后必须重新运行 `verify` 确保一致性
