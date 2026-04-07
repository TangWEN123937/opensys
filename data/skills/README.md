# OpenSys 技能系统

## 概述

技能（Skill）是可组合的 Markdown 指令文件，根据用户输入关键词自动加载到 AI Agent 的 system prompt 中，为特定场景提供专业化的工作流程和规则。

## 目录结构

```
data/skills/
├── README.md                        # 本说明文件
├── systematic-debugging/            # 技能目录（目录名即技能 ID）
│   └── SKILL.md                     # 技能主文件（必须存在）
├── code-review/
│   └── SKILL.md
└── ...
```

## 技能文件格式

每个技能的 `SKILL.md` 必须包含 YAML front matter 头部：

```markdown
---
name: 技能显示名称
triggers: [关键词1, 关键词2, ...]
priority: 10
description: 一句话描述技能用途
---

（正文 Markdown 内容，将被注入到 system prompt）
```

### 字段说明

| 字段 | 类型 | 必须 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 技能在 prompt 中的显示名称 |
| `triggers` | list | 是 | 触发关键词列表，用户输入包含任一关键词时激活 |
| `priority` | int | 否 | 优先级（数字越大越优先，默认 0） |
| `description` | string | 否 | 技能简述，显示在 prompt 标题行 |

## 加载机制

1. **始终加载**：`OPENSYS_SKILLS_ALWAYS_LOAD` 环境变量指定的技能无条件加载
2. **关键词匹配**：用户输入包含技能 `triggers` 中的关键词时自动加载
3. **字符限制**：所有技能内容总计不超过 `OPENSYS_SKILLS_MAX_CHARS`（默认 8000 字符）
4. **优先级排序**：空间不足时，高 priority 的技能优先保留

## 创建新技能

1. 在 `data/skills/` 下创建新目录（目录名用英文短横线分隔）
2. 在目录中创建 `SKILL.md` 文件
3. 编写 front matter 和正文内容
4. 测试：在对话中输入包含 triggers 关键词的消息，观察是否激活

## 配置项

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `OPENSYS_SKILLS_ALWAYS_LOAD` | 空 | 始终加载的技能目录名，逗号分隔 |
| `OPENSYS_SKILLS_MAX_CHARS` | 8000 | 技能注入 prompt 的最大总字符数 |
