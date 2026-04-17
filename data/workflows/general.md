---
name: 通用工作流
domain: general
description: 适用于所有领域的通用兜底模板，当没有专用模板匹配时使用
keywords: []
version: "1.0"
---

## Phase 1: Understand
- description: 明确需求、确认范围、收集背景信息
- method: agent
- skill: null
- required: true
- review: false

## Phase 2: Plan
- description: 制定执行方案、确认步骤和交付物
- method: agent
- skill: null
- required: false
- review: false

## Phase 3: Execute
- description: 按方案逐步执行
- method: executor
- skill: null
- required: true
- review: true

## Phase 4: Verify
- description: 检查产出物质量、验证是否满足需求
- method: reviewer
- skill: null
- required: true

## Phase 5: Deliver
- description: 整理输出、交付最终成果
- method: agent
- skill: null
- required: true
- review: false
