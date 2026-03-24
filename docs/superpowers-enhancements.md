# OpenSys 增强需求文档 — 借鉴 Superpowers 项目

> **版本**: v1.0  
> **日期**: 2026-03-24  
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
├── vector_store.py   # ChromaDB 向量化记忆（对话 + 脚本知识库）
├── context_compression.py  # 图片渐进压缩 + LLM 摘要兜底
├── tools/
│   ├── run_terminal.py
│   ├── write_and_run_script.py
│   ├── ask_user.py
│   ├── write_todos.py
│   ├── update_memory.py
│   └── search_scripts.py
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
- 脚本知识库使用规则

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

## 三、P1 — 技能系统基础框架

**背景**: Superpowers 的核心理念是"可组合技能"——每个技能是一个 Markdown 文件，定义特定场景的工作流。Agent 在任务前检索并加载相关技能。OpenSys 已有 `user_prompt.md` 作为全局规则注入，可以扩展为分场景的技能文件加载。

### 需求 3.1：技能目录结构

**创建** `data/skills/` 目录，按场景存放技能文件：

```
data/skills/
├── README.md            # 技能系统说明
├── debugging.md         # 调试场景技能（已有的调试规范可拆出来）
├── script-writing.md    # 脚本编写场景技能（已有的知识库规则可拆出来）
├── system-setup.md      # 系统环境搭建场景技能
└── file-management.md   # 文件管理场景技能
```

**每个技能文件的标准格式**:

```markdown
# 技能名称

## 触发条件
[什么情况下应使用此技能，只写条件，不写流程摘要]

## 核心流程
[步骤列表]

## 红旗标志
[Agent 应该停下来重新审视的思维模式]

## 常见错误
[典型的失败案例]
```

### 需求 3.2：技能加载机制

**修改文件**: `agent/graph.py`

**修改函数**: `_build_system_prompt(state: AgentState) -> str`

**需求描述**:

1. 新增函数 `_load_skills() -> str`
   - 扫描 `data/skills/` 目录下所有 `.md` 文件
   - 只读取每个文件的**前 5 行**（触发条件部分），拼接为技能索引
   - 格式为：`[技能名]: [触发条件描述]`
   - 此索引注入到 system prompt 尾部，供 Agent 判断是否需要加载完整技能

2. **不要**在每次 LLM 调用时加载所有技能全文（浪费 Token）
   - 只注入索引，让 Agent 在需要时通过 `run_terminal("cat data/skills/xxx.md")` 自行读取
   - 这是 Superpowers 的"渐进式披露"（Progressive Disclosure）模式

3. 在 system prompt 中加入指引：

```
## 技能库
你有可用的技能文件，在执行特定类型任务前应查阅。
当前可用技能：
{技能索引}
需要使用时，用 run_terminal("cat data/skills/xxx.md") 读取完整技能。
```

**配置项**（添加到 `agent/config.py`）:

```python
# 技能文件目录
SKILLS_DIR = DATA_DIR / "skills"
SKILLS_DIR.mkdir(parents=True, exist_ok=True)
```

### 需求 3.3：技能索引格式要求（CSO 原则）

**关键约束**: 技能的触发条件描述**只写何时使用**，**不写流程摘要**。

原因（来自 Superpowers 的 CSO 原则——Claude Search Optimization）：如果索引中包含流程摘要，LLM 会走捷径只读索引不读全文，导致跳过关键步骤。

```markdown
# ✅ 正确的触发条件描述
触发条件: 当需要调试一个失败的命令、脚本错误、或运行时异常时使用

# ❌ 错误的触发条件描述（包含流程信息）
触发条件: 调试技能。四阶段流程：收集信息→根因分析→假设验证→最小修复
```

---

## 四、P1 — 任务状态报告协议

**背景**: Superpowers 要求子 Agent 完成任务后输出标准化状态报告（DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT）。OpenSys 已有 `write_todos` 工具管理任务清单，但缺少任务完成时的结构化报告规范。

### 需求 4.1：任务完成报告模板

**在 `data/user_prompt.md` 追加**:

```markdown
---

## 任务完成报告规范

当所有 todo 完成后（或在复杂任务的关键节点），必须输出以下格式的完成报告：

### 报告模板
```
## 任务完成报告
**状态**: ✅ 完成 | ⚠️ 完成但有顾虑 | ❌ 被阻塞 | ❓ 需要更多信息
**概述**: [一句话说明做了什么]
**变更清单**:
- [文件路径]: [改动说明]
**验证结果**:
- [执行了什么验证命令] → [输出结果]
**遗留问题**（如有）:
- [问题描述] — [建议处理方式]
```

### 何时输出
- 所有 todo 标记为 completed 后
- 用户要求的复杂任务完成时
- 遇到无法解决的阻塞时（状态标记为"被阻塞"）
```

---

## 五、P2 — 模型自动分级选择

**背景**: Superpowers 根据任务复杂度自动选择不同能力的模型——机械性任务用便宜模型，集成判断用标准模型，架构设计用最强模型。OpenSys 已有 13 个模型预设和 `/model` 命令手动切换，可以增加自动推荐机制。

### 需求 5.1：任务复杂度分级器

**新建文件**: `agent/task_classifier.py`

**功能**:

```python
def classify_task_complexity(user_message: str) -> Literal["simple", "standard", "complex"]:
    """
    根据用户输入判断任务复杂度

    分级规则:
    - simple: 单文件、明确操作（查看文件、执行命令、格式化等）
    - standard: 多文件协调、Bug 修复、功能开发
    - complex: 架构设计、多步骤重构、跨模块集成

    Args:
        user_message: 用户最新输入

    Returns:
        复杂度等级
    """
```

**分级逻辑**（基于关键词 + 句法分析）:

| 复杂度 | 特征关键词 | 推荐模型类别 |
|--------|----------|------------|
| simple | 查看、显示、列出、版本、帮助 | 便宜快速模型（如 deepseek-chat） |
| standard | 修复、添加、修改、创建、调试 | 标准模型（如 qwen3.5-plus） |
| complex | 架构、重构、设计、集成、迁移 | 最强模型（如 claude-sonnet-4-6） |

### 需求 5.2：模型推荐映射配置

**在 `agent/config.py` 追加**:

```python
# 按任务复杂度推荐的模型（仅推荐，不强制切换）
MODEL_RECOMMENDATIONS = {
    "simple": "deepseek-chat",      # 快速便宜
    "standard": DEFAULT_MODEL_NAME,  # 当前默认模型
    "complex": "claude-sonnet-4-6",  # 最强模型
}
```

### 需求 5.3：推荐时机与方式

- **不要自动切换模型**，仅在 system prompt 中注入建议
- 格式：`[系统建议] 当前任务复杂度为 complex，建议使用 /model claude-sonnet-4-6 获得更好效果`
- 用户可忽略此建议

---

## 六、P2 — 多层防御验证增强

**背景**: Superpowers 的 `defense-in-depth.md` 提出在数据经过的每一层都加验证。OpenSys 的 `security.py` 已实现第一层（工具白名单/黑名单），可以扩展更多层。

### 需求 6.1：脚本内容安全扫描（第二层）

**修改文件**: `agent/security.py`

**需求**: 对 `write_and_run_script` 工具的 `script_content` 参数做深度检查，不仅检查命令级别关键词，还检查：

```python
# 脚本内容高危模式（作为新列表添加到 security.py）
DANGEROUS_SCRIPT_PATTERNS = [
    r"os\.system\s*\(",       # Python os.system 调用
    r"subprocess\.call.*shell\s*=\s*True",  # 不安全的 subprocess 使用
    r"eval\s*\(",             # 动态代码执行
    r"exec\s*\(",             # 动态代码执行
    r"__import__\s*\(",       # 动态导入
    r"open\s*\(.*['\"]\/etc", # 读取系统敏感文件
    r"requests\..*\.json\(\).*\[", # 可能的 SSRF 模式
]
```

**要求**: 匹配到这些模式时，风险等级提升为 `moderate`（而非直接 `dangerous`），让用户审查脚本内容后决定。

### 需求 6.2：环境守卫检查（第三层）

**修改文件**: `agent/security.py`

**新增函数**:

```python
def check_environment_guards(command: str) -> list[str]:
    """
    环境守卫检查：识别在特定上下文中的危险操作

    Returns:
        警告信息列表（空列表 = 安全）
    """
```

**检查规则**:
- `rm` 命令的目标路径是否为 `/`、`/home`、`/etc` 等关键目录
- `chmod` 命令是否作用于系统文件
- `pip install` / `apt install` 是否安装了已知的恶意包名
- 网络请求是否指向内网地址（SSRF 防护）

**集成方式**: 在 `_assess_command_risk()` 中调用，将警告信息附加到 `format_approval_request()` 的输出中。

---

## 七、P2 — 用户审查请求机制

**背景**: Superpowers 的 `requesting-code-review` 技能要求 Agent 在关键节点主动请求用户审查。OpenSys 已有 `ask_user` 工具可以暂停并向用户提问，可以利用此工具实现审查请求。

### 需求 7.1：自动审查触发规则

**在 `data/user_prompt.md` 追加**:

```markdown
---

## 主动审查请求规则

在以下场景中，使用 `ask_user` 工具**主动请求用户审查**，不要默默继续：

### 强制审查场景
1. **修改了 3 个以上文件后** — 展示变更文件列表，请求确认
2. **执行了 rm/mv 等不可逆操作后** — 展示操作结果，请求确认
3. **安装了新依赖后** — 展示安装结果和版本号，请求确认
4. **修改了配置文件后** — 展示修改前后对比，请求确认

### 建议审查场景
5. 连续执行 5 个以上命令后，暂停汇报进度
6. 任务完成后，展示完成报告并请求验收
7. 遇到多种可行方案时，列出选项让用户选择

### 审查请求格式
使用 ask_user 时，提供以下结构：
- **已完成**: [简述已做的操作]
- **需要确认**: [具体需要用户看的内容]
- **选项**: [如有多个选择，列出]
```

---

## 八、P3 — 子 Agent 分发架构

**背景**: Superpowers 的核心架构特性——子 Agent 驱动开发（Subagent-Driven Development）。控制器 Agent 分解任务，为每个子任务分派隔离上下文的子 Agent，完成后进行两阶段 Review。OpenSys 基于 LangGraph，天然支持子图（subgraph）机制。

### 需求 8.1：子任务执行子图

**新建文件**: `agent/subgraph.py`

**设计要点**:

1. **子图定义**: 创建一个独立的 StateGraph，接收单个任务描述，独立执行并返回结果
2. **上下文隔离**: 子图不继承主图的完整消息历史，只接收：
   - 任务描述（从主图传入）
   - 必要的环境上下文（当前目录、已知信息）
   - 独立的 system prompt
3. **结果汇报**: 子图完成后返回标准状态报告

**子图 State 定义**:

```python
class SubTaskState(TypedDict):
    """子任务执行状态"""
    messages: Annotated[list[BaseMessage], add_messages]
    task_description: str        # 任务描述
    task_context: str            # 环境上下文
    result_status: str           # DONE / BLOCKED / NEEDS_CONTEXT
    result_summary: str          # 执行结果摘要
    files_changed: list[str]     # 修改的文件列表
```

### 需求 8.2：两阶段 Review 机制

**Superpowers 原设计**:
1. **阶段一（规范符合性审查）**: 专门的审查者 Agent 验证实现是否与任务描述完全匹配（不多不少）
2. **阶段二（代码质量审查）**: 专门的审查者 Agent 检查代码质量、架构、测试

**OpenSys 适配方案**:

由于 OpenSys 运行在单模型环境中（不像 Superpowers 可以并行分派多个 Claude 实例），建议简化为：
- 子任务完成后，主 Agent 对结果进行**自审查**
- 自审查清单注入 system prompt，模拟两阶段 Review 的效果

**自审查清单模板**（注入到子任务完成后的 prompt 中）:

```markdown
## 自审查清单

### 规范符合性
- [ ] 所有任务需求都已实现？
- [ ] 没有实现额外的未要求功能？
- [ ] 输入输出与需求描述一致？

### 代码质量
- [ ] 每个文件有单一职责？
- [ ] 错误处理完整？
- [ ] 没有硬编码的魔法数字？
- [ ] 所有新增代码都有验证？
```

### 需求 8.3：模型分工（与需求 5 联动）

子任务执行时可自动使用不同模型：
- **主 Agent（协调器）**: 使用最强模型（负责任务分解、审查判断）
- **子 Agent（执行器）**: 使用标准或便宜模型（负责具体实现）

实现方式：在子图的 `agent_node` 中使用 `get_llm(子模型名)` 替代默认模型。

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
Phase 1（立刻）: 需求 2.1 ~ 2.5 → 修改 data/user_prompt.md → 零代码改动、立竿见影
Phase 2（1-2 天）: 需求 3 + 4 → 技能系统 + 任务报告 → 少量代码改动
Phase 3（3-5 天）: 需求 5 + 6 + 7 → 模型分级 + 安全增强 + 审查机制
Phase 4（远期）: 需求 8 → 子 Agent 架构 → 重大架构演进
```
