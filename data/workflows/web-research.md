---
name: 网络调研工作流
domain: web_research
description: 适用于需要浏览器采集数据、分析整理、输出报告的网络调研场景
keywords: [搜索, 采集, 爬取, 抓取, 网站, 数据, 调研, 抖音, 算数指数, 关键词, 趋势, 平台, 登录, 浏览器]
version: "1.0"
---

## Phase 1: Understand
- description: 明确调研目标、确认数据来源网站和所需数据维度
- method: agent
- skill: null
- required: true
- review: false

## Phase 2: Collect
- description: 使用浏览器访问目标网站，采集所需数据（Advisor 规划时必须填入具体的 url 和 details）
- method: browser
- skill: null
- required: true
- review: true
- url: （由 Advisor 根据用户需求填入具体目标网址）
- details: （由 Advisor 根据 Phase 1 确认的细节填入：采集哪些数据字段、搜索哪些关键词等）

## Phase 3: Verify
- description: 审查采集到的数据是否完整、准确，是否覆盖所有要求的维度
- method: reviewer
- skill: null
- required: true

## Phase 4: Analyze
- description: 基于采集数据进行分析整理，撰写调研报告或总结
- method: agent
- skill: null
- required: true
- review: true

## Phase 5: Deliver
- description: 整理最终成果，交付给用户
- method: agent
- skill: null
- required: true
- review: false
