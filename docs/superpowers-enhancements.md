# OpenSys 增强需求文档 — 借鉴 Superpowers 项目

> **版本**: v1.1  
> **日期**: 2026-03-24（P0 已完成，P1 实现中）  
> **来源**: 对 [superpowers-main](https://github.com/obra/superpowers) 项目的深度分析  
> **目标**: 将 Superpowers 中经过验证的 AI Agent 工作流模式移植到 OpenSys  
> **优先级**: P0 = 立刻做（零/低代码改动）、P1 = 短期做、P2 = 中期做、P3 = 长期做

---

## 目录

- [一、项目现状概述](#一项目现状概述)
- [二、P0 — System Prompt 增强（零代码改动）](#二p0--system-prompt-增强零代码改动)
- [三、P1 — 技能系统基础框架](#三p1--技能系统基础框架)
- [四、P1 — 任务状态报告协议](#四p1--任务状态报告协议)
- [五、P2 — 模型自动分级选择](#五p2--模型自动分级选择)
- [六、P2 — 多层防御验证增强](#六p2--多层防御验证增强)
- [七、P2 — 用户审查请求机制](#七p2--用户审查请求机制)
- [八、P3 — 子 Agent 分发架构](#八p3--子-agent-分发架构)
- [附录 A：Superpowers 完整可借鉴模式清单](#附录-asuperpowers-完整可借鉴模式清单)

---

## 一、项目现状概述

### 现有架构

```
agent/
├── graph.py          # LangGraph StateGraph 核心图（5 节点 + 3 条件路由）
├── state.py          # AgentState 状态定义
├── config.py         # 全局配置（13 个模型预设 + 环境变量）
├── security.py       # 风险评估（safe/moderate/dangerous 三级）
├── model_manager.py  # 模型管理（按 model_name 预设 + LRU 缓存）
├── vector_store.py   # ChromaDB 向量化记忆（对话记忆）
├── context_compression.py  # 图片渐进压缩 + LLM 摘要兜底
├── tools/
│   ├── run_terminal.py
│   ├── write_and_run_script.py
│   ├── ask_user.py
│   ├── write_todos.py
│   └── update_memory.py
├── db/               # SQLite 数据库（审批历史/对话/审计日志）
├── api/app.py        # FastAPI（SSE/WebSocket/审批 API）
└── cli.py            # CLI 入口（Rich 终端 UI + interrupt 审批）
data/
├── user_prompt.md    # 用户自定义提示词（已有任务分解/调试铁律/验证规范）
├── memory.md         # 跨对话持久化记忆
└── chroma_db/        # 向量数据库
```

### 现有 system prompt 注入链

```
SYSTEM_PROMPT（硬编码基础规范）
  + _load_user_prompt()     → data/user_prompt.md（用户可编辑的规则注入）
  + _load_memory()          → data/memory.md（跨对话记忆）
  + todos 状态              → state["todos"]（当前任务清单）
```

### 已有的行为规范（在 user_prompt.md 中）

- 结构化任务分解五阶段流程
- write_todos 使用规则
- 四阶段调试铁律
- 完成验证规范

---

## 二、P0 — System Prompt 增强（零代码改动）

**实现方式**: 仅修改 `data/user_prompt.md` 文件内容，无需改动任何 Python 代码。

### 需求 2.1：红旗思维模式表

**背景**: Superpowers 在每个 Skill 中嵌入"Red Flags"表，列出 Agent 应立刻停止并重新审视的思维模式。这能有效阻断 Agent 的合理化倾向。

**在 `data/user_prompt.md` 末尾追加以下内容**:

```markdown
---

## 红旗思维模式（检测到以下想法时，立刻停止当前操作）

当你发现自己正在这样想时，必须**立即停止**并重新审视：

| 🚩 危险想法 | ✅ 正确做法 |
|------------|-----------|
| "这很简单，不需要规划" | 停！任何 >= 3 步的任务都需要 write_todos |
| "先执行了看看" | 停！先理解需求、检查环境，再执行 |
| "应该没问题吧" | 停！必须用命令验证，禁止假设 |
| "这次情况不同，可以跳过" | 停！规则没有例外 |
| "我手动检查过了" | 停！手动检查不可复现，必须用命令验证 |
| "先改了再说，不行再回滚" | 停！先分析影响范围，不要盲目修改 |
| "用户催得急，先跳过验证" | 停！跳过验证省的时间不够修 bug 的 |
| "差不多可以了" | 停！差不多 = 没完成 |
```

### 需求 2.2：反合理化借口对照表

**背景**: Superpowers 发现 LLM 会用合理化借口绕过规则，因此在每个 Skill 中预埋反借口对策。

**在 `data/user_prompt.md` 追加**:

```markdown
---

## 常见合理化借口 vs 正确做法

| 借口 | 现实 |
|------|------|
| "太简单了不需要测试" | 简单代码也会出 bug，验证只需几秒 |
| "我已经知道根因了" | 没有堆栈证据的根因分析是猜测 |
| "改动很小应该不影响" | 小改动 + 没验证 = 隐藏 bug |
| "用户只是要快速修复" | 快速修复 + 没验证 = 二次修复浪费更多时间 |
| "这个工具/命令我很熟" | 即使熟悉也可能在新环境中行为不同 |
| "先完成再优化" | 如果"完成"的定义不含验证，那不是完成 |

**铁律：如果你无法引用一条实际的命令输出来支撑你的结论，那你的结论就是猜测。**
```

### 需求 2.3：系统化调试增强——根因追溯 + 纵深防御

**背景**: Superpowers 的 `systematic-debugging` 技能包含两个辅助文档：`root-cause-tracing.md`（向上追溯调用链直到找到原始触发器）和 `defense-in-depth.md`（在数据经过的每一层加验证）。当前 `user_prompt.md` 已有四阶段调试流程，但缺少这两个高级技巧。

**在 `data/user_prompt.md` 的"调试铁律"章节后追加**:

```markdown
### 高级调试技巧

#### 根因追溯法（修复深层 Bug 时使用）
当 Bug 出现在深层调用栈时，禁止在错误出现的位置直接修补。必须逐层往上追溯：
1. **观察症状** → 记录错误出现的位置
2. **找直接原因** → 是什么值/状态导致了错误？
3. **追溯调用者** → 谁传入了这个错误的值？
4. **继续追溯** → 那个值是从哪里来的？
5. **找到源头** → 在**最早产生错误数据的位置**修复

**示例**:
```
错误: git init 在错误目录执行
直接原因: projectDir 为空字符串
追溯: projectDir 由 createProject() 返回
继续: createProject() 未检查 mkdir 是否成功
源头: 在 createProject() 中加 mkdir 返回值验证 ← 在这里修复
```

#### 纵深防御验证（修复数据流 Bug 后使用）
修复一个由无效数据引起的 Bug 后，不要只在出错点加验证。在数据经过的**每一层**都加防护：
- **第 1 层（入口）**: 函数参数验证（类型、非空、格式）
- **第 2 层（业务逻辑）**: 业务规则检查（值在有效范围内）
- **第 3 层（环境守卫）**: 危险操作前的安全检查（如：禁止在根目录执行 rm）
- **第 4 层（日志）**: 关键操作添加调试日志，记录输入输出
```

### 需求 2.4：完成验证规范增强——证据对照表

**背景**: Superpowers 的 `verification-before-completion` 技能要求对每种状态声称都必须有对应的证据。当前 `user_prompt.md` 已有验证规范，但缺少证据类型映射。

**在 `data/user_prompt.md` 的"完成验证规范"章节中追加**:

```markdown
### 证据对照表（每种声称必须有对应证据）

| 你要声称的 | 必须提供的证据 |
|-----------|-------------|
| "命令执行成功" | 命令的退出码 0 + 实际输出内容 |
| "软件已安装" | `--version` 或 `which` 命令的输出 |
| "文件已创建/修改" | `ls -la` 或 `cat` 命令验证文件存在且内容正确 |
| "脚本运行正常" | 脚本实际输出 + 退出码 |
| "错误已修复" | 重现原始错误的命令现在输出正确结果 |
| "服务已启动" | 端口监听验证（`ss -tlnp` 或 `curl`）|
| "配置已生效" | 读取配置文件并展示关键字段 |

**铁律: 没有命令输出支撑的"完成"声明 = 未完成。**
```

### 需求 2.5：条件等待替代固定延时

**背景**: Superpowers 的 `condition-based-waiting.md` 强调异步操作不要用固定 sleep 猜时间，而是用条件轮询等待。

**在 `data/user_prompt.md` 追加**:

```markdown
---

## 异步操作等待规范

**禁止使用固定延时等待异步操作完成。**

### 正确做法：条件轮询
```bash
# ❌ 错误：猜测延时
sleep 5
curl http://localhost:8080/health

# ✅ 正确：条件轮询
for i in $(seq 1 30); do
  curl -s http://localhost:8080/health && break
  sleep 1
done
```

### 常见场景
| 等待什么 | 轮询方法 |
|---------|---------|
| 服务启动 | 循环 curl health 端点 |
| 文件生成 | 循环 `test -f /path/to/file` |
| 进程退出 | 循环 `kill -0 $PID` |
| 端口监听 | 循环 `ss -tlnp \| grep :端口` |
```

---

## 三、P1 — 技能系统基础框架 ✅ 已实现

**背景**: Superpowers 的核心理念是"可组合技能"——每个技能是一个 Markdown 文件，定义特定场景的工作流。Agent 在任务前检索并加载相关技能。OpenSys 已有 `user_prompt.md` 作为全局规则注入，现已扩展为分场景的技能文件自动加载系统。

### 实现架构

```
新增/修改文件：
  agent/skill_loader.py      # 技能加载模块（新建）
  agent/config.py             # 新增 SKILLS_DIR / SKILLS_ALWAYS_LOAD / SKILLS_MAX_CHARS
  agent/graph.py              # _build_system_prompt() 集成技能注入
  data/skills/                # 技能文件根目录（新建）
  data/skills/README.md       # 技能系统使用说明
  data/skills/systematic-debugging/SKILL.md   # 示例技能：系统化调试
  data/skills/code-review/SKILL.md            # 示例技能：代码审查
```

### 需求 3.1：技能目录结构（已实现）

每个技能是 `data/skills/` 下的一个子目录，包含 `SKILL.md` 主文件：

```
data/skills/
├── README.md                         # 技能系统说明（给用户看）
├── systematic-debugging/             # 技能目录（目录名即技能 ID）
│   └── SKILL.md                      # 技能主文件（YAML front matter + 正文）
├── code-review/
│   └── SKILL.md
└── [用户可自行添加更多技能目录]
```

**SKILL.md 标准格式**（YAML front matter + Markdown 正文）:

```markdown
---
name: 系统化调试
triggers: [调试, debug, 错误, error, bug, 报错, 修复, fix, traceback, 堆栈]
priority: 10
description: 四阶段调试流程 + 根因追溯 + 纵深防御
---

（正文 Markdown 内容，匹配时注入 system prompt）
```

**字段说明**:

| 字段 | 类型 | 必须 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 技能在 prompt 中的显示名称 |
| `triggers` | list | 是 | 触发关键词，用户输入包含任一关键词时激活 |
| `priority` | int | 否 | 优先级（越大越优先，默认 0），空间不足时高优先级保留 |
| `description` | string | 否 | 简述，显示在 prompt 标题行 |

### 需求 3.2：技能加载机制（已实现）

**核心模块**: `agent/skill_loader.py`

**加载流程**:

```
用户输入 → _build_system_prompt()
              → _extract_latest_user_query() 提取最新用户消息
              → load_skills_for_prompt(user_query)
                  → discover_skills()          扫描 data/skills/*/SKILL.md
                  → match_skills()             关键词匹配 + always_load + priority 排序
                  → format_skills_for_prompt()  格式化为 Markdown 注入 prompt
```

**匹配策略**（优先级从高到低）:
1. `SKILLS_ALWAYS_LOAD` 列表中的技能 → 无条件加载
2. 用户输入包含技能 `triggers` 关键词 → 自动加载
3. 按 `priority` 降序排列
4. 累计字符数超过 `SKILLS_MAX_CHARS` 时截断（至少保留 500 字符才截断加载）

**设计决策 — 全文注入 vs 索引+按需读取**:

原始需求文档建议"只注入索引，让 Agent 用 run_terminal 读取全文"。实际实现改为**匹配后直接注入全文**，原因：
- OpenSys 的技能文件较短（每个 1-3K 字符），全文注入的 Token 开销可控
- 索引模式下 Agent 需要额外一轮工具调用才能读取技能，增加延迟和不确定性
- `SKILLS_MAX_CHARS` 配置项（默认 8000）可有效控制总注入量
- 如果技能数量增长到很多，可通过 `SKILLS_ALWAYS_LOAD` 精确控制

**注入位置**（在 `_build_system_prompt()` 中）:

```
SYSTEM_PROMPT（基础角色定义）
  + user_prompt.md（全局规则）
  + 🆕 技能系统内容（根据用户输入动态匹配）  ← 新增
  + memory.md（跨对话记忆）
  + todos 状态（当前任务清单 + 完成报告触发）
```

### 需求 3.3：配置项（已实现）

在 `agent/config.py` 中新增：

```python
# ==================== 技能系统配置 ====================

# 技能文件目录（每个子目录为一个技能，包含 SKILL.md 主文件）
SKILLS_DIR = DATA_DIR / "skills"

# 始终加载的核心技能列表（目录名），环境变量逗号分隔
SKILLS_ALWAYS_LOAD = os.getenv("OPENSYS_SKILLS_ALWAYS_LOAD", "").split(",")

# 技能内容注入 system prompt 的最大总字符数
SKILLS_MAX_CHARS = int(os.getenv("OPENSYS_SKILLS_MAX_CHARS", "8000"))
```

### 需求 3.4：已创建的示例技能

**systematic-debugging**（优先级 10）:
- 触发词：调试、debug、错误、error、bug、报错、修复、fix、traceback、堆栈、异常、exception、崩溃、crash、失败、failed
- 内容：四阶段调试流程（信息收集→根因分析→假设验证→最小修复）、根因追溯路径模板、反模式检查清单、连续修复失败处理

**code-review**（优先级 8）:
- 触发词：审查、review、检查代码、代码质量、重构、refactor、优化代码、code review、审核
- 内容：三维度审查（代码质量+安全检查+架构一致性）、结构化审查报告模板、问题分级（Critical/Important/Minor）

### 需求 3.5：用户扩展指南

用户可自行创建新技能：
1. 在 `data/skills/` 下新建目录（英文短横线分隔命名）
2. 在目录中创建 `SKILL.md`，按标准格式编写 front matter 和正文
3. 在对话中输入包含 triggers 关键词的消息，验证技能是否被激活
4. 可选：将目录名加入 `OPENSYS_SKILLS_ALWAYS_LOAD` 环境变量使其始终生效

---

## 四、P1 — 任务状态报告协议 ✅ 已实现

**背景**: Superpowers 要求子 Agent 完成任务后输出标准化状态报告（DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT）。OpenSys 已有 `write_todos` 工具管理任务清单，现已实现自动触发的结构化报告机制。

### 实现架构

任务报告通过**三层机制**协同工作：

```
第 1 层：user_prompt.md "任务完成报告规范" 章节
         → 定义报告模板格式（状态/概述/变更清单/验证结果/遗留问题）
         → 定义何时输出（todos 全完成/复杂任务/被阻塞）
         → P0 阶段已完成

第 2 层：graph.py _build_system_prompt() 自动触发
         → 检测 todos 全部 completed 时注入强提示：
           "🎯 所有任务已完成！请立即输出任务完成报告..."
         → 检测有 pending 但无 in_progress 时提示选择下一个任务
         → 统计增加 pending 计数，提供更完整的进度信息

第 3 层：user_prompt.md "主动审查请求规则" 章节
         → 报告输出后要求用 ask_user 请求用户验收
         → P0 阶段已完成
```

### 需求 4.1：报告规范（P0 已完成）

已在 `data/user_prompt.md` 末尾实现"任务完成报告规范"章节，包含：

**报告模板**:
```
## 任务完成报告
**状态**: ✅ 完成 | ⚠️ 完成但有顾虑 | ❌ 被阻塞 | ❓ 需要更多信息
**概述**: [一句话说明做了什么]
**变更清单**:
- [文件路径]: [改动说明]
**验证结果**:
- [执行了什么验证命令] → [实际输出摘要]
**遗留问题**（如有）:
- [问题描述] — [建议处理方式]
```

**触发时机**:
- 所有 todo 标记为 completed 后（**必须**）
- 用户要求的复杂任务完成时（**必须**）
- 遇到无法解决的阻塞时，状态标记为"❌ 被阻塞"（**必须**）
- 简单单步任务不需要

### 需求 4.2：自动触发机制（P1 已实现）

**修改文件**: `agent/graph.py` 的 `_build_system_prompt()` 函数

**实现逻辑**: 在 todos 状态注入区域，根据任务完成度注入不同的引导提示：

```python
# 统计增强：新增 pending 计数
pending = total - completed - in_progress
todo_lines.append(f"进度：{completed}/{total} 完成，{in_progress} 进行中，{pending} 待执行")

# 三种状态的差异化引导
if completed == total and total > 0:
    # 全部完成 → 强提示输出报告 + ask_user 验收
    "🎯 所有任务已完成！请立即输出任务完成报告..."
elif in_progress > 0:
    # 有进行中 → 继续执行
    "请继续执行当前 in_progress 的任务..."
elif pending > 0 and in_progress == 0:
    # 有待办但无进行中 → 提示选择下一个
    "有待执行的任务但没有 in_progress 的任务，请选择下一个..."
```

这确保了 Agent 在所有任务完成时不会遗忘输出报告——**提示直接注入 system prompt，每次 LLM 调用都会看到**。

---

## 五、P2 — 模型自动分级选择 ✅ 已实现

**背景**: Superpowers 根据任务复杂度自动选择不同能力的模型——机械性任务用便宜模型，集成判断用标准模型，架构设计用最强模型。OpenSys 已有 13 个模型预设和 `/model` 命令手动切换，现已实现自动推荐机制。

### 实现架构

```
新增/修改文件：
  agent/task_classifier.py  # 任务复杂度分级器（新建）
  agent/config.py           # 新增 COMPLEX_MODEL_NAME / MODEL_RECOMMENDATIONS
  agent/graph.py            # _build_system_prompt() 集成模型推荐注入
```

### 需求 5.1：任务复杂度分级器（已实现）

**文件**: `agent/task_classifier.py`

**分级规则**（优先级从高到低）：
1. **complex**: 输入含架构/重构/集成/迁移/从零搭建等关键词，或多文件/批量操作模式
2. **simple**: 输入含查看/显示/版本/帮助等只读关键词，且**不**含 standard 关键词
3. **standard**: 兜底（含开发类关键词，或无法明确分类）

| 复杂度 | 特征关键词示例 | 推荐模型 |
|--------|-------------|---------|
| simple | 查看、显示、列出、版本、帮助、what is | deepseek-chat |
| standard | 修复、添加、修改、创建、调试、debug | DEFAULT_MODEL_NAME |
| complex | 架构、重构、设计模式、集成、迁移、从零搭建 | COMPLEX_MODEL_NAME |

**核心函数**：
- `classify_task_complexity(user_message)` → `(complexity, matched_keywords)`
- `get_model_recommendation(complexity, current_model)` → 推荐信息或 None
- `format_recommendation_for_prompt(user_message, current_model)` → prompt 注入文本

**设计要点**：
- 纯关键词 + 句法规则，零 LLM 调用，零延迟
- 当前模型已是推荐模型时返回 None（不重复推荐）
- simple + standard 关键词同时出现时，standard 优先

### 需求 5.2：模型推荐配置（已实现）

在 `agent/config.py` 中新增：

```python
# 最强模型名称（环境变量可配置，随时更换）
COMPLEX_MODEL_NAME = os.getenv("OPENSYS_COMPLEX_MODEL", "claude-sonnet-4-6")
MODEL_RECOMMENDATIONS = {
    "simple": "deepseek-chat",        # 快速便宜
    "standard": DEFAULT_MODEL_NAME,   # 当前默认模型
    "complex": COMPLEX_MODEL_NAME,    # 最强模型（用户可随时通过环境变量切换）
}
```

**环境变量**：`OPENSYS_COMPLEX_MODEL` — 可随时修改最强模型指向，无需改代码。

### 需求 5.3：推荐方式（已实现）

- **不自动切换模型**，仅在 system prompt 中注入建议
- 格式：`💡 [系统建议] 当前任务复杂度较高，推荐使用 /model claude-sonnet-4-6。（当前复杂度: complex，当前模型: deepseek-chat）`
- 用户可忽略此建议
- 注入位置：技能系统之后、memory 之前

---

## 六、P2 — 多层防御验证增强 ✅ 已实现

**背景**: Superpowers 的 `defense-in-depth.md` 提出在数据经过的每一层都加验证。OpenSys 的 `security.py` 已实现第一层（工具白名单/黑名单），现已扩展为三层防御架构。

### 实现架构

```
修改文件：
  agent/security.py  # 新增第二层、第三层防御 + 审批输出集成

三层防御架构：
  第 1 层（命令级，已有）：高危关键词 + 安全白名单 + 授权等级 → safe/moderate/dangerous
  第 2 层（脚本内容级，新增）：正则匹配危险模式 → safe → moderate 提升
  第 3 层（环境守卫，新增）：路径/网络/包安装上下文检查 → 附加警告信息
```

### 需求 6.1：脚本内容安全扫描（已实现）

**函数**: `_assess_script_risk(script_content)` + `get_script_warnings(script_content)`

**危险模式列表** (`DANGEROUS_SCRIPT_PATTERNS`，10 个模式):

| 模式 | 说明 |
|------|------|
| `os.system()` | 直接执行系统命令 |
| `subprocess.*shell=True` | 不安全的子进程调用 |
| `eval()` / `exec()` | 动态代码执行（排除注释行） |
| `__import__()` | 动态导入 |
| `open('/etc/...')` / `open('/proc/...')` | 读取系统敏感文件 |
| `socket.connect` | 可能的网络穿透 |
| `requests.*内网地址` | HTTP SSRF 风险 |
| `ctypes` | 绕过 Python 安全机制 |

**关键设计决策**：
- `write_and_run_script` 不再走第 1 层的 `_assess_command_risk`（避免 shell 关键词如 `eval` 误判脚本）
- 匹配到危险模式只提升为 `moderate`（不是 `dangerous`），减少误报
- 低授权级别（< STANDARD）脚本总是需要审批

### 需求 6.2：环境守卫检查（已实现）

**函数**: `check_environment_guards(command)` → 返回警告信息列表

**检查规则**:

| 规则 | 检测内容 | 警告示例 |
|------|---------|---------|
| 规则 1 | rm/chmod/chown/mv 作用于受保护路径 | 🛡️ `rm` 作用于受保护路径 `/etc` |
| 规则 2 | curl/wget/nc 指向内网地址（SSRF） | 🌐 网络请求指向内网地址 |
| 规则 3 | pip install 极短包名（typosquatting） | 📦 安装了极短包名 `x` |
| 规则 4 | apt install 系统级包 | 📦 正在安装系统级包 |
| 规则 5 | 重定向输出到 /etc /usr 等系统路径 | 📝 重定向输出到系统路径 |

**受保护路径**: `/`, `/home`, `/etc`, `/usr`, `/var`, `/boot`, `/root`, `/bin`, `/sbin`, `/lib`, `/lib64`, `/opt`, `/sys`, `/proc`

**内网地址段**: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `localhost`, `0.0.0.0`

### 需求 6.3：审批输出集成（已实现）

`format_approval_request()` 现在自动收集第二层和第三层的所有警告，在审批请求末尾以 `🛡️ 安全警告` 区块展示（保序去重）：

```
🚨 **高危操作** — AI 请求执行以下操作：

  1. 📟 执行命令: `rm -rf /etc/nginx`
  2. 📝 执行 python 脚本:
  ```python
  import os
  os.system("test")
  ```

🛡️ **安全警告**:
  - 🛡️ `rm` 作用于受保护路径 `/etc`
  - ⚠️ 脚本含 os.system() 直接执行系统命令

请选择: [✅ 批准] [❌ 拒绝] [✏️ 修改后执行]
```

---

## 七、P2 — 用户审查请求机制 ✅ 已实现

**背景**: Superpowers 的 `requesting-code-review` 技能要求 Agent 在关键节点主动请求用户审查。OpenSys 已有 `ask_user` 工具可以暂停并向用户提问，现已在 `user_prompt.md` 中定义完整的审查触发规则。

### 实现方式

在 `data/user_prompt.md` 末尾追加"主动审查请求规则"章节（纯 prompt 驱动，零代码改动）。

### 已实现的规则

**强制审查场景**（必须使用 `ask_user`）:
1. 修改了 3 个以上文件后 → 展示变更文件列表
2. 执行了 rm/mv 等不可逆操作后 → 展示操作结果
3. 安装了新依赖后 → 展示安装结果和版本号
4. 修改了配置文件后 → 展示修改前后对比

**建议审查场景**:
5. 连续执行 5 个以上命令后，暂停汇报进度
6. 任务完成后，展示完成报告并请求验收
7. 遇到多种可行方案时，列出选项让用户选择

**审查请求格式**:
- **已完成**: 简述已做的操作
- **需要确认**: 具体需要用户看的内容
- **选项**: 如有多个选择，列出

**铁律**: 不确定时就问，比默默做错然后返工要好。

---

## 八、P3 — 多代理协作架构

**背景**: 借鉴 Superpowers 的子 Agent 驱动开发模式，结合 OpenSys 自身架构特点，设计完整的多代理协作系统。核心思路：**主代理做决策，子代理做执行和审查，API 并发调用实现真正的并行**。

### 8.0 整体架构

```
┌──────────────────────────────────────────────────────────┐
│                  主代理 Main Agent                        │
│                  模型：用户自选（默认 deepseek-chat）        │
│                                                          │
│  职责：                                                   │
│    1. 与用户对话、理解需求                                  │
│    2. 调用 Advisor 获取技能推荐和流程建议                    │
│    3. 拆分子任务 → 分派 Executor 执行（可并行）              │
│    4. 收集结果 → 调用 Reviewer 审查                        │
│    5. 汇报用户、处理返工                                    │
└────────┬─────────────────┬──────────────────┬────────────┘
         │                 │                  │
   ┌─────▼──────┐   ┌──────▼───────┐   ┌─────▼───────┐
   │  Advisor   │   │  Executor    │   │  Reviewer   │
   │  顾问子代理 │   │  执行子代理   │   │  审查子代理  │
   │            │   │  (可多实例)   │   │             │
   └────────────┘   └──────────────┘   └─────────────┘
   最强模型            deepseek-chat      deepseek-chat
   (COMPLEX_MODEL)    N 个并行实例         1 个实例
   1 次/任务          N 次/任务            N 次/任务
```

### 8.1 模型分配策略

| 角色 | 模型 | 理由 |
|------|------|------|
| **主代理** | 用户自选 | 日常对话和简单操作不需要最强模型 |
| **Advisor** | `COMPLEX_MODEL_NAME`（最强模型） | 决策入口，判断质量决定后续所有环节。调用频率低、token 量小，成本可忽略 |
| **Executor** | `deepseek-chat`（便宜快速） | 批量执行具体任务，成本敏感，可并行多实例 |
| **Reviewer** | `deepseek-chat`（便宜快速） | 按清单审查，不需要强推理 |

**成本模型**（以一个复杂任务拆 3 个子任务为例）：

```
Advisor（Claude）:  500 token × ¥0.05  = ¥0.025
Executor ×3（DS）:  各 5000 token × ¥0.001 = ¥0.015
Reviewer（DS）:     2000 token × ¥0.001 = ¥0.002
总计: ¥0.04（对比全用 Claude ≈ ¥0.6，节省 93%）
```

### 8.2 分级触发机制

**不是所有任务都走多代理模式，按复杂度分级触发：**

```
用户输入
    │
    ▼
主代理判断（或通过 prompt 规则引导）：
    │
    ├─ 简单任务 → 主代理直接执行，不调任何子代理
    │   例："查看 /etc/nginx 配置"、"当前目录有什么文件"
    │   零额外开销
    │
    ├─ 中等任务 → 仅调 Advisor，主代理自己执行
    │   例："修复登录接口的 500 错误"
    │   Advisor 推荐技能 + 流程建议 → 主代理按建议执行
    │
    ├─ 复杂可拆分任务 → 完整多代理模式
    │   例："搭建用户认证系统，支持 JWT 和 OAuth2"
    │   Advisor → Executor ×N（并行）→ Reviewer → 主代理汇报
    │
    └─ 创作/对话类 → 主代理直接处理，注入技能即可
        例："帮我写一份技术方案"
        创作是连贯思维流，拆分会丧失整体性
```

Advisor 返回中应包含调度建议：

```python
{
    "skills": [...],           # 推荐技能
    "workflow": [...],         # 建议流程（战略层，指导 todos 生成）
    "dispatch_mode": "direct" | "advisor_only" | "full_multi_agent",
    #                  ↑           ↑                ↑
    #              简单任务      中等任务          复杂可拆分任务
}
```

### 8.3 三个子代理详细定义

#### ① Advisor（顾问子代理）

```
触发时机：
  - 任务开始时（主代理判断需要时，或 prompt 强制规则触发）
  - 执行中途需要调整时（发现新需求、任务范围变化）
模型：COMPLEX_MODEL_NAME（最强模型，保证决策质量）
输入：
  - 用户最新消息
  - 当前 todos 列表（如有）
  - 最近 3 条对话摘要（提供上下文）
  - 所有技能的向量索引（从 ChromaDB 检索）
输出：
  - 推荐技能列表（1-3 个，含完整内容）
  - 建议执行流程（战略层，指导主代理生成 todos）
  - 任务拆分建议（几个子任务、依赖关系、是否可并行）
  - dispatch_mode（直接执行 / 仅顾问 / 完整多代理）
特点：
  - 无工具调用，纯分析推理
  - 向量初筛 top-5 技能 → LLM 精选 1-3 个
  - 结果需 interrupt 让用户确认后再继续
```

**流程建议与 todos 的关系**：
- 流程建议是**战略层**（做事方法论）："先规划 → 再 TDD → 最后审查"
- todos 是**战术层**（具体步骤）："1. 创建 auth.py 2. 写登录接口 3. 写测试"
- 主代理读到流程建议后，据此用 `write_todos` 生成具体步骤

#### ② Executor（执行子代理）

```
触发时机：主代理拆分好子任务后，dispatch_mode = "full_multi_agent"
模型：deepseek-chat（便宜，可并行开多个实例）
输入：
  - 单个子任务描述
  - 必要的环境上下文（当前目录、相关文件列表）
  - Advisor 推荐的技能（注入 system prompt）
输出：
  - 执行结果摘要
  - 修改的文件列表
  - 状态：DONE / BLOCKED / NEEDS_CONTEXT
工具：run_terminal, write_and_run_script（与主代理共享工具集）
特点：
  - 上下文隔离（只看到自己的子任务，不背主代理的历史包袱）
  - 可并行（asyncio.gather 同时跑多个无依赖子任务）
  - 失败不影响其他子任务（返回 BLOCKED 状态，主代理决定是否重试）
```

**并行调度伪代码**：

```python
async def dispatch_executors(subtasks: list):
    # 按依赖关系分组：无依赖的并行，有依赖的串行
    independent = [t for t in subtasks if not t.dependencies]
    dependent = [t for t in subtasks if t.dependencies]

    # 并行执行无依赖任务
    results = await asyncio.gather(*[
        run_executor_subgraph(task) for task in independent
    ])

    # 串行执行有依赖任务
    for task in dependent:
        result = await run_executor_subgraph(task)
        results.append(result)

    return results
```

**子图 State 定义**：

```python
class ExecutorState(TypedDict):
    """Executor 子代理状态"""
    messages: Annotated[list[BaseMessage], add_messages]
    task_description: str        # 子任务描述
    task_context: str            # 环境上下文
    injected_skills: str         # 注入的技能文本
    result_status: str           # DONE / BLOCKED / NEEDS_CONTEXT
    result_summary: str          # 执行结果摘要
    files_changed: list[str]     # 修改的文件列表
```

#### ③ Reviewer（审查子代理）

```
触发时机：每个 Executor 完成后 / 全部子任务完成后
模型：deepseek-chat
输入：
  - 原始用户需求
  - 子任务描述
  - Executor 的执行结果摘要 + 修改的文件列表
输出：
  - 计划对齐度（实现了没有、有没有多做）
  - 质量评分（1-5）
  - 问题列表（Critical / Important / Suggestion 三级）
  - 结论：PASS（通过）/ REWORK（需返工，附修改建议）
特点：
  - 独立视角，不受执行过程影响（不同实例、不同上下文、不同 prompt）
  - Critical 问题会触发 Executor 返工
  - 最终审查结果汇总给主代理，由主代理决定是否汇报用户
```

**两阶段审查**（在同一个 Reviewer 调用中完成）：

```
阶段一：规范符合性
  - 所有任务需求都已实现？
  - 没有实现额外的未要求功能？
  - 输入输出与需求描述一致？

阶段二：代码质量
  - 每个文件有单一职责？
  - 错误处理完整？
  - 没有硬编码的魔法数字？
  - 所有新增代码都有验证？
```

### 8.4 完整工作流示例

```
用户："帮我搭建用户认证系统，支持 JWT 和 OAuth2"

第 1 步：主代理判断 → 调用 Advisor
  Advisor（Claude）分析：
    技能推荐：[TDD, systematic-debugging]
    流程建议：先建数据模型 → 再写 JWT → 再写 OAuth2 → 集成测试
    拆分建议：3 个子任务，JWT 和 OAuth2 可并行
    dispatch_mode: full_multi_agent
  → interrupt 让用户确认

第 2 步：用户确认 → 主代理用 write_todos 细化
  todo 1: 创建 User 模型 + 数据库迁移（前置依赖）
  todo 2: JWT 认证模块
  todo 3: OAuth2 认证模块
  todo 4: 集成测试 + 审查

第 3 步：串行执行 todo 1（有依赖）
  Executor-A（deepseek）→ 完成 User 模型
  Reviewer 审查 → PASS

第 4 步：并行执行 todo 2 + todo 3（无依赖）
  Executor-B（deepseek）→ JWT 模块  ┐
  Executor-C（deepseek）→ OAuth2    ┘ asyncio.gather 同时进行
  Reviewer 分别审查：
    JWT → PASS
    OAuth2 → REWORK（缺少 token 刷新逻辑）
    → Executor-C 返工 → Reviewer 再审 → PASS

第 5 步：主代理执行 todo 4（集成测试）
  主代理自己跑集成测试 + 输出完成报告

第 6 步：汇报用户
```

### 8.5 执行中途动态调整

主代理在执行过程中可以**随时再次调用 Advisor**：

```
场景：执行 JWT 模块时发现还需要 Redis 做 token 存储

主代理 → 再调 Advisor：
  "执行中发现需要 Redis 集成，请补充技能和调整流程"

Advisor 返回：
  补充技能：[redis-integration]
  调整建议：先完成 Redis 配置子任务，再继续 JWT
  → interrupt 用户确认
```

### 8.6 需要解决的设计问题

| 问题 | 方案 |
|------|------|
| 子任务之间有依赖 | Advisor 分析依赖关系，有依赖串行，无依赖并行 |
| 多个 Executor 操作同一文件 | 主代理做文件锁管理，或让有冲突的子任务串行 |
| Executor 执行中遇到阻塞 | 返回 NEEDS_CONTEXT 状态，主代理补充信息后重试 |
| 防环机制 | 同一轮对话中 Advisor 最多调 3 次，Executor 返工最多 2 次 |
| 模型切换的消息兼容性 | 子代理用独立 subgraph，消息格式由各自 clean_messages 处理 |
| 技能向量化 | 技能 SKILL.md 存入 ChromaDB，Advisor 调用时向量检索 top-5 |
| 用户中途干预 | 主代理收到 interrupt 后可取消/暂停正在执行的子代理 |

### 8.7 技术实现规划

**新建文件**：

```
agent/subagents/
  ├── __init__.py           # 子代理模块入口
  ├── advisor.py            # Advisor 顾问子代理（subgraph + prompt）
  ├── executor.py           # Executor 执行子代理（subgraph + 工具）
  ├── reviewer.py           # Reviewer 审查子代理（subgraph + prompt）
  ├── dispatcher.py         # 调度器：并行/串行分派 + 依赖管理
  └── states.py             # 子代理共享的 State 定义
```

**修改文件**：

```
agent/graph.py              # 主图集成子代理调用入口
agent/config.py             # 新增子代理模型配置
agent/tools/__init__.py     # 新增 call_advisor 工具定义
agent/vector_store.py       # 新增 skill_knowledge 集合 + SkillVectorStore 类
agent/skill_loader.py       # 重构：关键词匹配保留作为 fallback，主路径改为向量检索
```

#### 技能向量化方案

**策略：懒加载变更检测 + 启动时全量同步 + CLI 手动触发**

不使用 watchdog 文件监听（避免额外依赖和后台线程），采用按需检测 + 增量同步：

```
1. 启动时全量同步（冷启动保底）
   └─ 扫描 data/skills/*/SKILL.md
   └─ 对比 ChromaDB 中已有记录（以技能目录名为 ID）
   └─ 新增的 → 向量化入库
   └─ 已删除的 → 从库中移除
   └─ 内容变更的 → 重新向量化（对比文件内容 MD5 哈希）
   └─ 未变更的 → 跳过

2. 运行时懒加载（热更新，不停服）
   └─ 每次 Advisor 被调用时，先检查 skills 目录
   └─ 对比文件列表和修改时间（mtime）与上次缓存
   └─ 有变更 → 增量同步（只处理变更的文件）
   └─ 无变更 → 直接用缓存
   └─ 优点：零依赖，按需触发，简单可靠
   └─ 延迟：仅首次有变更时触发同步（毫秒级）

3. CLI 命令手动触发（补充）
   └─ /skills reload — 强制重新扫描和向量化
   └─ 用户新增技能文件后可手动触发，最直观
```

**ChromaDB 集合设计**：

```
集合名：skill_knowledge（新增，与 conversation_memory 并列）

文档 ID = 技能目录名（唯一）
  例：data/skills/systematic-debugging/SKILL.md → ID = "systematic-debugging"

metadata：
  - skill_name: 技能名称（从 YAML front matter 解析）
  - file_path: SKILL.md 完整路径
  - file_hash: 内容 MD5（用于判断是否变更）
  - triggers: 原始 triggers 关键词列表（保留关键词匹配作为 fallback）
  - priority: 技能优先级
  - updated_at: 最后更新时间

Embedding 内容 = SKILL.md 全文（包含 description + 正文）
Embedding 服务 = 复用现有本地 BGE-M3（localhost:8100）
```

**核心类伪代码**：

```python
class SkillVectorStore:
    def __init__(self, vector_manager: VectorStoreManager):
        self._vm = vector_manager
        self._last_scan_cache = {}  # {文件路径: mtime}

    async def get_relevant_skills(self, query: str, top_k: int = 5) -> list:
        """Advisor 调用入口：检索最相关的技能"""
        await self._sync_if_needed()
        return await self._search(query, top_k)

    async def _sync_if_needed(self):
        """懒同步：对比文件 mtime，只处理变更"""
        current_files = self._scan_skills_directory()  # {path: mtime}
        changes = False

        for path, mtime in current_files.items():
            if path not in self._last_scan_cache:
                await self._upsert_skill(path)  # 新文件
                changes = True
            elif mtime > self._last_scan_cache[path]:
                await self._upsert_skill(path)  # 内容变更
                changes = True

        for path in self._last_scan_cache:
            if path not in current_files:
                await self._delete_skill(path)  # 已删除
                changes = True

        if changes:
            self._last_scan_cache = current_files

    async def force_reload(self):
        """/skills reload 手动触发全量重建"""
        self._last_scan_cache = {}
        await self._sync_if_needed()
```

**与现有 skill_loader.py 的关系**：
- 现有的关键词 triggers 匹配保留作为 **fallback**（向量服务不可用时降级）
- 主路径改为：Advisor 调用 `SkillVectorStore.get_relevant_skills(query)` 向量检索
- 向量检索 top-5 → Advisor LLM 精选 1-3 个 → 注入主代理 prompt

### 8.8 Prompt 分配策略

**核心原则：主代理是协调者，不应该背着代码执行的详细规则。P3 实现后需要对现有 `user_prompt.md` 内容做拆分迁移。**

#### 现有 prompt 内容迁移规划

| 现有内容（user_prompt.md） | 归属 | 理由 |
|--------------------------|------|------|
| 红旗思维模式表 | **保留在主代理** | 通用安全意识，所有角色都需要 |
| 反合理化借口对照表 | **保留在主代理** | 通用行为规范 |
| 根因追溯与调试铁律 | **迁移到 Executor** | 具体的代码调试方法论，主代理不直接写代码 |
| 证据对照表 — 代码类 | **迁移到 Executor** | "Bug 已修复""根因已定位"等属于代码执行证据 |
| 证据对照表 — 通用类 | **保留在主代理** | "记忆已更新""配置已生效"等主代理也需要 |
| 条件等待替代固定延时 | **迁移到 Executor** | 具体的脚本执行规范 |
| 任务完成报告规范 | **保留在主代理** | 主代理负责向用户汇报 |
| 主动审查请求规则 | **保留在主代理** | 主代理决定何时停下来问用户 |

#### P3 后各角色的 system prompt 构成

**主代理（协调者）**：

```
角色定义：你是任务协调者，理解需求、调度子代理、汇报用户
  ├─ 红旗思维 + 反合理化（通用安全意识）
  ├─ 主动审查请求规则（何时停下来问用户）
  ├─ 任务完成报告规范（向用户汇报格式）
  ├─ 证据对照表 — 通用类（记忆/配置/环境类证据）
  ├─ memory.md（用户偏好、项目上下文）
  └─ todos 状态引导
注：不再包含调试方法论、代码审查规则、脚本执行规范等
```

**Executor（执行者）**：

```
角色定义：你是任务执行者，按子任务描述完成具体实现
  ├─ 根因追溯与纵深防御调试铁律
  ├─ 证据对照表 — 代码类（Bug 修复/根因定位/无回归证据）
  ├─ 条件等待替代固定延时
  ├─ Advisor 注入的技能（TDD、systematic-debugging 等）
  ├─ 子任务描述 + 环境上下文
  └─ 执行完成后输出结构化结果（status + summary + files_changed）
注：Executor 不直接与用户交互，结果返回给主代理
```

**Reviewer（审查者）**：

```
角色定义：你是独立审查者，检查执行质量和计划对齐度
  ├─ 两阶段审查清单（规范符合性 + 代码质量）
  ├─ code-review 技能内容（从技能库注入）
  ├─ 原始用户需求
  ├─ 子任务描述
  └─ Executor 的执行结果摘要 + 修改的文件列表
注：Reviewer 看不到执行过程，只看结果，保证独立视角
```

**Advisor（顾问）**：

```
角色定义：你是任务顾问，分析任务复杂度、推荐技能和执行策略
  ├─ 所有可用技能的摘要列表（向量检索 top-5 的完整内容）
  ├─ 所有可用模型列表 + 能力描述
  ├─ dispatch_mode 判断规则
  ├─ 用户最新消息 + 上下文摘要
  └─ 当前 todos（如有）
注：Advisor 不执行任何操作，只做分析和推荐
```

#### 迁移时机

**不在 P3 开发开始时立即迁移**，而是在各子代理 prompt 稳定后再从 `user_prompt.md` 中移除对应内容。迁移前，这些内容同时存在于主代理和子代理中不会冲突（子代理有独立上下文）。

### 8.9 与现有机制的关系

| 现有机制 | P3 后的变化 |
|---------|-----------|
| P2 关键词分级（task_classifier） | 被 Advisor 的 LLM 判断替代，作为 fallback 保留 |
| P2 模型推荐（prompt 注入建议） | 被 Advisor 的 dispatch_mode 替代 |
| P1 技能关键词匹配 | 被 Advisor 的向量检索 + LLM 精选替代 |
| P0 自审查规则（user_prompt.md） | 拆分：通用规则保留在主代理，代码类迁移到 Executor/Reviewer |
| todos 工具 | 保留，主代理根据 Advisor 的流程建议生成 todos |
| 三层安全防御 | 保留，Executor 的工具调用同样经过风险评估 |

---

## 附录 A：Superpowers 完整可借鉴模式清单

以下是从 Superpowers 项目中提取的所有 20 条可借鉴模式，按类别汇总：

### 架构级模式（4 条）
| # | 模式 | 对应需求 | 优先级 |
|---|------|---------|--------|
| 1 | 可组合技能系统 | 需求 3 | P1 |
| 2 | 子 Agent 分发架构 | 需求 8 | P3 |
| 3 | 模型分级选择策略 | 需求 5 | P2 |
| 4 | Session 钩子注入机制 | 已有（_load_user_prompt） | ✅ |

### 流程控制模式（5 条）
| # | 模式 | 对应需求 | 优先级 |
|---|------|---------|--------|
| 5 | 强制计划门控 | 已有（user_prompt.md 五阶段流程） | ✅ |
| 6 | 完成前强制验证 | 需求 2.4 | P0 |
| 7 | 系统化调试四阶段 | 需求 2.3 | P0 |
| 8 | 结构化任务完成协议 | 需求 4 | P1 |
| 9 | Review 请求与接收 | 需求 7 | P2 |

### 反合理化机制（3 条）
| # | 模式 | 对应需求 | 优先级 |
|---|------|---------|--------|
| 10 | 红旗思维模式表 | 需求 2.1 | P0 |
| 11 | 合理化借口对照表 | 需求 2.2 | P0 |
| 12 | "违反字面规则就是违反规则精神" | 需求 2.2（铁律） | P0 |

### 技术实践模式（4 条）
| # | 模式 | 对应需求 | 优先级 |
|---|------|---------|--------|
| 13 | 纵深防御验证 | 需求 6 | P2 |
| 14 | 根因追溯法 | 需求 2.3 | P0 |
| 15 | 条件等待替代固定延时 | 需求 2.5 | P0 |
| 16 | 测试反模式清单 | 融入技能文件 | P1 |

### Prompt 工程模式（2 条）
| # | 模式 | 对应需求 | 优先级 |
|---|------|---------|--------|
| 17 | 说服力原则（权威+承诺+稀缺） | 全文档措辞风格 | P0 |
| 18 | CSO 技能发现优化 | 需求 3.3 | P1 |

### 测试与质量保证模式（2 条）
| # | 模式 | 对应需求 | 优先级 |
|---|------|---------|--------|
| 19 | 压力场景测试法 | 后续测试框架 | P3 |
| 20 | 集成测试断言工具集 | 后续测试框架 | P3 |

---

## 实施顺序建议

```
Phase 1（立刻）: 需求 2.1 ~ 2.5 → 修改 data/user_prompt.md → 零代码改动、立竿见影  ✅ 已完成
Phase 2（1-2 天）: 需求 3 + 4 → 技能系统 + 任务报告 → 少量代码改动  ✅ 已完成
Phase 3（3-5 天）: 需求 5 + 6 + 7 → 模型分级 + 安全增强 + 审查机制  ✅ 已完成
Phase 4（P3）: 需求 8 → 多代理协作架构
  ├─ 4a: Advisor 顾问子代理（技能向量化 + LLM 精选 + 流程建议 + interrupt 确认）
  ├─ 4b: Executor 执行子代理（subgraph + 上下文隔离 + asyncio 并行）
  ├─ 4c: Reviewer 审查子代理（两阶段审查 + 返工机制）
  └─ 4d: Dispatcher 调度器（依赖分析 + 并行/串行分派 + 防环）
```
