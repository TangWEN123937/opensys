---
name: 学术论文写作工作流
domain: paper_writing
description: 适用于学术论文（期刊论文、学位论文、会议论文）的完整写作流程，涵盖文献检索→向量化→综述→大纲→撰写→引用→审查→排版全链路
keywords: [论文, 学术, 期刊, 学位论文, 毕业论文, 研究, 写论文, 学术写作, paper, 课题, 开题, 文献综述]
version: "1.1"
---

## Phase 1: Requirement
- description: 确认研究主题、论文类型（期刊/学位/会议）、目标刊物或学校要求、字数要求、引用格式规范（GB/T 7714、APA 等）、截止日期
- method: agent
- skill: paper-requirement-analysis
- required: true
- review: false

## Phase 2: Literature-Search
- description: 从知网等学术数据库检索并下载与研究主题相关的核心文献（5-20篇），按下载量或被引排序筛选高质量论文
- method: browser
- skill: cnki-shutong
- url: http://lib.shutong2.com/
- details: 根据 Phase 1 确认的研究主题生成检索关键词，在知网中搜索并按下载量排序，下载指定数量的文献 PDF
- required: true
- review: false

## Phase 3: Vectorize
- description: 将下载的文献 PDF 通过 OCR 解析为 Markdown 并向量化入库 ChromaDB，为后续文献综述和引用提供语义检索能力
- method: agent
- skill: pdf-vectorize
- required: true
- review: false

## Phase 4: Literature-Review
- description: 基于向量知识库检索已入库文献，按主题梳理研究现状、主要观点、研究方法和研究空白，结合网络调研形成完整的文献综述
- method: agent
- skill: literature-review
- required: true
- review: true

## Phase 5: Outline
- description: 基于文献综述和研究主题，拟定论文的学术结构大纲（摘要/引言/文献综述/研究方法/分析讨论/结论），明确各章节要点和篇幅分配
- method: agent
- skill: paper-planning
- required: true
- review: false

## Phase 6: Writing
- description: 按确认的大纲逐章串行撰写论文正文（每章能参考前面已写章节），确保学术规范、论证严密、引用标记全文统一、各章节衔接自然
- method: executor_sequential
- skill: paper-writing
- required: true
- review: true

## Phase 7: Reference
- description: 整理全文引用，生成规范的参考文献列表（按指定格式），核对正文引用标记与参考文献的一致性
- method: agent
- skill: reference-management
- required: true
- review: false

## Phase 8: Review
- description: 从学术规范性、论证逻辑、引用完整性、研究方法合理性、创新性等维度全面审查论文质量
- method: reviewer
- skill: review-paper
- required: true

## Phase 9: Format
- description: 按目标刊物或学校要求进行学术排版（标题层级、页眉页脚、目录、图表编号、参考文献格式、页码、行距字号等），输出终稿
- method: agent
- skill: paper-formatting
- required: true
- review: false

