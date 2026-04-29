---
name: 内容创作工作流
domain: content_creation
description: 适用于公众号文章、技术博客、自媒体内容等创作场景
keywords: [写文章, 博客, 公众号, 创作, 撰写, 文案, 内容, 自媒体, 推文, 文章, 写作]
version: "1.0"
---

## Phase 1: Understand
- description: 确认平台、受众、风格、字数
- method: agent
- skill: content-requirement-analysis
- required: true
- review: false

## Phase 2: Research
- description: 竞品分析、素材收集
- method: agent
- skill: content-research
- required: false
- review: false

## Phase 3: Plan
- description: 拟定大纲、标题备选
- method: agent
- skill: content-planning
- required: false
- review: false

## Phase 4: Execute
- description: 逐节撰写正文
- method: executor_parallel
- skill: content-writing
- required: true
- review: true

## Phase 5: Verify
- description: 逻辑连贯性、原创度、合规性检查
- method: reviewer
- skill: null
- required: true

## Phase 6: Deliver
- description: 排版、SEO 优化、输出终稿
- method: agent
- skill: content-formatting
- required: true
- review: false
