---
name: kpi-analyst
description: KPI calculation, attribution analysis, and auto charting for BI scenarios.
version: 1.2.0
author: fufankeji
category: analysis
verified: true
---

# KPI Analyst Skill

用于 BI 场景的 KPI 自动分析:

1. 接收 metric 清单 + 时间范围
2. 计算 YoY / MoM / WoW 三种对比
3. 归因分析 · 找 top 5 影响因子
4. 生成 chart.js / recharts 代码片段

## Scripts
- scripts/calc.py · 指标计算
- scripts/attribution.py · 归因算法

## Templates
- templates/dashboard.tsx · 仪表盘模板
