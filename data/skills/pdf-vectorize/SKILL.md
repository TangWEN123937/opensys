---
name: PDF文档向量化入库
triggers: [PDF, pdf, 向量化, 向量, 入库, 文档入库, 知识库, 向量数据库, chromadb, 文献入库, 论文入库]
priority: 8
description: 将 PDF 文档通过 PyMuPDF 渲染 + SiliconFlow PaddleOCR-VL 免费 OCR 解析为 Markdown，LLM 自动分类主题，切分后生成 Embedding 写入 ChromaDB 知识库
summary: 使用预置脚本 pdf_vectorize.py 一键完成 PDF → Markdown → ChromaDB 全流程。PyMuPDF 逐页渲染 PDF 为 PNG 图片，SiliconFlow PaddleOCR-VL 免费 OCR 解析为 Markdown，LLM 自动分类文档主题（或手动指定），按标题层级切分为 chunks 后生成 BGE-M3 Embedding 写入 ChromaDB documents collection。支持批量处理、自动去重、跨主题语义检索。产出物：Markdown 文件（按主题归档到 /app/data/documents/{topic}/）+ ChromaDB 向量索引。
version: "3.0"
target_role: executor
---

## PDF 文档向量化入库（本技能被激活时执行）

### 核心：使用预置脚本

本技能的核心逻辑已封装在同目录下的预置脚本中，**Executor 只需调用脚本，不需要自己写代码**。

```bash
# 预置脚本路径（与本 SKILL.md 同目录）
python /app/data/skills/pdf-vectorize/pdf_vectorize.py --input <PDF路径> [--output <输出目录>] [--topic <主题>]
```

### 参数说明

| 参数 | 必填 | 说明 | 默认值 |
|------|------|------|--------|
| `--input` / `-i` | ✅ | PDF 文件或目录路径 | — |
| `--output` / `-o` | ❌ | Markdown 输出目录（❗**必须用默认值，禁止改为任务输出目录**） | `/app/data/documents/`（全局知识库） |
| `--topic` / `-t` | ❌ | 手动指定主题分类 | LLM 自动分类 |

### 典型用法

#### 场景 1：批量处理下载目录（自动分类）

用户说"把下载的论文入库"或"将 PDF 存入知识库"时：

```bash
python /app/data/skills/pdf-vectorize/pdf_vectorize.py --input /app/data/downloads/
```

#### 场景 2：指定主题

用户说"把城市更新的论文入库"时：

```bash
python /app/data/skills/pdf-vectorize/pdf_vectorize.py --input /app/data/downloads/ --topic "城市更新"
```

#### 场景 3：处理单个文件

```bash
python /app/data/skills/pdf-vectorize/pdf_vectorize.py --input /app/data/downloads/example.pdf
```

#### 场景 4：入库任务下载目录中的 PDF

当 pipeline 有专属下载目录时：

```bash
# ❗ --output 不要填，用默认的 /app/data/documents/（全局知识库）
python /app/data/skills/pdf-vectorize/pdf_vectorize.py --input /app/output/20260420_xxx/downloads/ --topic "排水管网"
```

### 执行步骤

1. **确定输入路径**：从用户需求或前序阶段产出物中获取 PDF 文件/目录路径
   - pipeline 任务下载目录：`<工单中的下载目录>` 或 `/app/data/downloads/`
   - 也可能是用户指定的其他路径
2. **确定主题**：如果用户明确说了主题（如"城市更新的论文"），用 `--topic` 参数；否则让脚本自动分类
3. **执行脚本**：使用 `run_terminal` 工具执行上述命令
4. **检查输出**：脚本会输出详细的处理日志和汇总报告，确认成功/跳过/失败的文件数
5. **汇报结果**：告诉用户处理了多少篇，分类到哪些主题，共生成多少个 chunks

### 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| `SILICONFLOW_API_KEY 未设置` | 环境变量缺失 | 在 `.env` 中配置 `SILICONFLOW_API_KEY=sk-xxx` |
| OCR 某页失败 | API 超时/PDF 页面损坏 | 脚本会跳过该页继续，不影响其他页面 |
| 某个 PDF 解析失败 | PDF 加密/损坏 | 脚本会自动跳过，继续处理其他文件 |
| "该文件已入库" 被跳过 | 文件哈希匹配已有记录 | 正常行为（自动去重），无需处理 |
| "PDF 共 N 页，超过上限" 被跳过 | PDF 超过 50 页限制 | 正常行为（预期跳过），**禁止修改 MAX_PDF_PAGES 来绕过** |
| Embedding 调用失败 | BGE-M3 服务未启动 | 确认宿主机 BGE-M3 服务运行中（容器内通过 `host.docker.internal:8100` 访问） |
| LLM 分类失败 | 分类模型 API 不可用 | 文件会标记为"未分类"，不影响入库 |

### 产出物

- **Markdown 文件**：`/app/data/documents/{topic}/{filename}.md`
- **ChromaDB 向量索引**：`documents` collection 中的 chunks（带 topic/doc_id/section 等 metadata）

### 数据模型

ChromaDB `documents` collection 中每个 chunk 的 metadata：

```json
{
    "doc_id": "sha256前16位",
    "source_file": "原始文件名.pdf",
    "topic": "城市更新",
    "section": "2.文献综述 > 2.1 国内研究",
    "chunk_index": 3,
    "page_start": 0,
    "total_chunks": 28,
    "created_at": "2026-04-19T20:00:00"
}
```

### 禁止事项

- **禁止** 自己写 PDF 解析代码（必须用预置脚本，OCR 失败时也不要自行编写 PyMuPDF 纯文本提取作为替代）
- **禁止** 修改预置脚本 `pdf_vectorize.py` 的任何代码、常量或配置（包括但不限于 `MAX_PDF_PAGES`、`_RENDER_DPI` 等）。页数超限的 PDF 跳过是预期行为，不得通过修改脚本来绕过限制
- **禁止** 直接操作 ChromaDB（脚本已封装好）
- **禁止** 跳过脚本直接调用 SiliconFlow API（脚本包含去重、分类、切分、入库全流程）
- **禁止** 将 `--output` 指向任务输出目录（如 `/app/output/xxx/output/`），Markdown 知识库是全局共享资源，必须存放在 `/app/data/documents/`
