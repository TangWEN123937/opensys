---
name: 软件开发工作流
domain: software_dev
description: 适用于功能开发、bug修复、代码重构等软件工程场景
keywords: [开发, 编码, 功能, bug, 修复, 重构, 编程, 代码, 实现, feature, 接口, API, 模块]
version: "1.0"
---

## Phase 1: Understand
- description: 明确功能需求、技术约束、影响范围
- method: agent
- skill: null
- required: true
- review: false

## Phase 2: Plan
- description: 设计方案、拆分子任务、确认技术路线
- method: agent
- skill: null
- required: true
- review: false

## Phase 3: Execute
- description: 按方案逐步编码实现
- method: executor_parallel
- skill: null
- required: true
- review: true

## Phase 4: Verify
- description: 代码审查、测试验证
- method: reviewer
- skill: null
- required: true

## Phase 5: Deliver
- description: 整理变更清单、更新文档、交付
- method: agent
- skill: null
- required: true
- review: false
