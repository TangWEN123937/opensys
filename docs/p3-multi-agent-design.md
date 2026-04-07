# P3 多代理协作架构设计文档

> 版本：v1.0  
> 日期：2026-04-07  
> 状态：设计阶段（未实现）  
> 前置依赖：P0（system prompt 增强）、P1（技能系统）、P2（模型分级推荐）均已完成

---

## 一、设计目标

OpenSys 的定位是**各领域的专家系统**——不局限于代码编程，覆盖内容创作、数据分析、报告撰写、自媒体运营等多种场景。

P3 要解决的核心问题：

| 问题 | 现状 | P3 目标 |
|------|------|---------|
| 复杂任务缺乏规划 | 主代理自行决策，无战略层 | Advisor 基于模板规划，用户确认后执行 |
| 全靠一个模型 | 所有任务同一模型处理 | 大模型规划 + 小模型执行，成本降 80% |
| 无独立审查 | AI 自己检查自己的结果 | Reviewer 隔离上下文，客观审查产出物 |
| 规则靠 prompt 约束 | "请你遵守"可被绕过 | Hooks 机械化强制执行 |
| 技能仅关键词匹配 | triggers 关键词触发 | 向量检索 + LLM 精选（关键词作 fallback） |

---

## 二、整体架构

### 2.1 四层架构

```
┌─────────────────────────────────────────────────────────┐
│  第四层：领域专家层                                        │
│  workflow 模板 + 领域技能包 + Advisor 智能编排              │
├─────────────────────────────────────────────────────────┤
│  第三层：多代理协作层                                      │
│  Advisor + Dispatcher + Executor + Reviewer + 模型分层    │
├─────────────────────────────────────────────────────────┤
│  第二层：Harness 基础设施层                                │
│  Hooks + 声明式权限 + 项目声明 + 非交互模式                 │
├─────────────────────────────────────────────────────────┤
│  第一层：运行时层（已实现）                                  │
│  LangGraph 图 + Docker 隔离 + ChromaDB + 多模型管理        │
└─────────────────────────────────────────────────────────┘
```

### 2.2 角色定义

| 角色 | 职责 | 模型梯队 | 上下文策略 |
|------|------|---------|-----------|
| **Agent（主代理）** | 理解需求、协调调度、用户交互、汇报结果 | Tier 2（默认模型） | 完整上下文 |
| **Advisor（顾问）** | 选模板/裁剪流程/重新规划 | Tier 1（最强模型） | 仅 advisor_context（Agent 总结的摘要） |
| **Dispatcher（调度器）** | 拆子任务、依赖分析、并行/串行分派 | 无需模型（纯逻辑） | pipeline + advisor_context.background |
| **Executor（执行者）** | 按工单执行具体子任务 | Tier 3（小模型/便宜模型） | 隔离：只看工单 + skill 指令 + 技术背景摘要 |
| **Reviewer（审查者）** | 对照审查清单检查产出物质量 | Tier 3 | 隔离：只看审查清单 + 产出物 + 原始需求摘要 |

### 2.3 模型梯队配置

```
Tier 1（规划层）：config.COMPLEX_MODEL_NAME
  当前默认：claude-sonnet-4-6
  用途：Advisor 规划、replan
  调用频次：每个任务 1-2 次

Tier 2（协调层）：config.DEFAULT_MODEL_NAME
  当前默认：deepseek-chat
  用途：主代理日常对话、需要用户交互的阶段
  调用频次：高频

Tier 3（执行层）：config.EXECUTOR_MODEL_NAME（新增）
  推荐：deepseek-chat / ollama 本地模型
  用途：Executor 执行子任务、Reviewer 审查
  调用频次：高频，可并行
```

---

## 三、LangGraph 图结构

### 3.1 当前图结构（P2，保持不变）

```
节点 5 个：agent, risk_assessment, approval, rejection, tools
路由 3 个：agent_router, risk_router, approval_router

START → agent → agent_router
          ↑       ├─ 纯文本 → END
          │       └─ tool_calls → risk_assessment → risk_router
          │                                          ├─ safe → tools ──┐
          │                                          └─ mod/dang → approval → approval_router
          │                                                              ├─ approved → tools ──┐
          │                                                              └─ rejected → rejection┤
          └────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 P3 新增图结构

```
新增节点 5 个：advisor, dispatcher, executor, reviewer, phase_done
新增路由 1 个：pipeline_router
修改路由 1 个：agent_router（加 "advisor" 分支）

完整图：

START → agent → agent_router
          ↑       ├─ 纯文本 → END
          │       ├─ tool_calls → risk_assessment → （现有审批流程不变）→ tools ──┐
          │       └─ 需要规划 → advisor (interrupt 确认) → pipeline_router        │
          │                                                 ├─ agent 执行 → 回到 agent（带阶段 skill prompt）
          │                                                 ├─ dispatcher → executor(×N) → phase_done → pipeline_router
          │                                                 ├─ reviewer → phase_done → pipeline_router
          │                                                 └─ 全部完成 → 回到 agent（汇报）
          └───────────────────────────────────────────────────────────────────────┘
```

### 3.3 State 新增字段

```python
class AgentState(TypedDict):
    # --- 现有字段（保持不变）---
    messages: Annotated[list[BaseMessage], add_messages]
    auth_level: int
    pending_command: Optional[str]
    risk_level: Optional[Literal["safe", "moderate", "dangerous"]]
    approval_result: Optional[Literal["approved", "rejected", "modified"]]
    modified_command: Optional[str]
    todos: Optional[list[dict]]
    model_config: Optional[dict]

    # --- P3 新增字段 ---
    # Agent 给 Advisor 的情况摘要（结构化的"工作交接单"）
    advisor_context: Optional[dict]
    # Advisor 产出的流水线
    pipeline: Optional[dict]
    # 当前执行到哪个阶段（0-indexed）
    current_phase: int
    # 当前阶段状态
    phase_status: Optional[Literal["pending", "executing", "done", "rework", "failed"]]
    # Dispatcher 拆分的子任务列表
    subtasks: Optional[list[dict]]
    # Reviewer 审查结果
    review_result: Optional[Literal["pass", "fail", "replan"]]
    # Reviewer 审查反馈
    review_feedback: Optional[str]
    # 是否需要重新规划
    needs_replan: bool
    # 重新规划的原因
    replan_reason: Optional[str]
    # Advisor 是否已被调用过（防止同一轮重复触发）
    advisor_called: bool
```

### 3.4 路由逻辑

#### agent_router（修改）

```python
def agent_router(state) -> Literal["risk_assessment", "advisor", "__end__"]:
    last_message = state["messages"][-1]

    # 有 tool_calls → 正常走风险评估
    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        return "risk_assessment"

    # advisor_context 有值 → Agent 已总结好情况，交给 Advisor
    if not state.get("advisor_called") and state.get("advisor_context"):
        return "advisor"

    return "__end__"
```

#### pipeline_router（新增）

```python
def pipeline_router(state) -> Literal["agent", "dispatcher", "reviewer", "advisor", "__end__"]:
    # 需要重新规划 → 回到 Advisor
    if state.get("needs_replan"):
        return "advisor"

    pipeline = state.get("pipeline", {}).get("phases", [])
    current = state.get("current_phase", 0)

    # 全部完成 → 回到 agent 汇报
    if current >= len(pipeline):
        return "agent"

    phase = pipeline[current]
    method = phase.get("method", "agent")

    if method == "agent":
        return "agent"          # 主代理亲自执行（需交互的阶段）
    elif method in ("executor", "executor_parallel"):
        return "dispatcher"     # 去调度器分派子任务
    elif method == "reviewer":
        return "reviewer"       # 去审查
    else:
        return "agent"          # 兜底
```

---

## 四、核心流程详解

### 4.1 Advisor 规划流程

```
Agent 判断任务复杂 → 调用 request_planning 工具 → 产出 advisor_context
  │
  ▼
advisor_context = {
    "user_request": "用户的核心需求（Agent 总结）",
    "background": "项目/任务背景（来自 project.md + memory.md + 对话历史）",
    "constraints": ["约束条件1", "约束条件2"],
    "existing_progress": "已完成的内容（如果是 replan）",
    "replan_reason": "重新规划原因（如果是 replan）"
}
  │
  ▼
Advisor 节点执行：
  │
  ├─ 第一步：LLM 分析 advisor_context → 判断任务领域
  │
  ├─ 有匹配的 workflow 模板？
  │   ├─ 是 → 加载模板 → 裁剪（跳过不需要的阶段）
  │   │       阶段内容、skill、method 全部继承模板，AI 不需要编造
  │   └─ 否 → 加载 general.md 通用模板 → AI 自己编流程 + 向量检索匹配 skill
  │
  ├─ 第二步：产出结构化 pipeline（JSON）
  │
  ├─ 第三步：interrupt 让用户确认
  │   ├─ 确认 → pipeline 写入 State + 转为 todos
  │   ├─ 修改 → 用户调整后确认
  │   └─ 拒绝 → 不使用流水线，回到正常模式
  │
  └─ 输出到 State：pipeline, current_phase=0, todos
```

### 4.2 Pipeline 结构定义

```json
{
  "domain": "content_creation",
  "template_used": "content-creation",
  "phases": [
    {
      "id": 1,
      "name": "understand",
      "description": "确认平台、受众、风格、字数",
      "method": "agent",
      "skill": "content-requirement-analysis",
      "required": true,
      "parallel": false
    },
    {
      "id": 2,
      "name": "research",
      "description": "竞品分析、素材收集",
      "method": "executor",
      "skill": "content-research",
      "required": false,
      "parallel": false
    },
    {
      "id": 3,
      "name": "execute",
      "description": "逐节撰写正文",
      "method": "executor_parallel",
      "skill": "content-writing",
      "required": true,
      "parallel": true
    },
    {
      "id": 4,
      "name": "verify",
      "description": "逻辑连贯性、原创度、合规性检查",
      "method": "reviewer",
      "skill": "content-review",
      "required": true,
      "parallel": false
    },
    {
      "id": 5,
      "name": "deliver",
      "description": "排版、SEO 优化、输出终稿",
      "method": "agent",
      "skill": "content-formatting",
      "required": true,
      "parallel": false
    }
  ]
}
```

### 4.3 上下文分配策略

**核心原则：该有上下文的给上下文，该隔离的就隔离。**

```
                    对话历史  memory  project背景  pipeline进度  skill指令  审查清单  产出物
                    ────────  ──────  ──────────  ───────────  ────────  ────────  ──────
Agent（主代理）       ✅        ✅       ✅          ✅           ✅         ❌        ✅
Advisor（规划）       ❌        ❌       ✅*         ✅*          ❌         ❌        ❌
Executor（执行）      ❌        ❌       ✅*         ❌           ✅         ❌        ❌
Reviewer（审查）      ❌        ❌       ❌           ❌           ❌         ✅        ✅

✅* = 通过 advisor_context 间接获取（Agent 总结过的精简版）
```

**为什么这样分配：**

- **Agent**：是"项目经理"，要了解全貌才能协调
- **Advisor**：是"顾问"，通过 Agent 总结的摘要了解情况，不需要原始对话
- **Executor**：是"工人"，给一份工单 + skill 指令就够了，上下文多了反而干扰小模型
- **Reviewer**：是"质检员"，必须客观，不能看到执行过程中的妥协和闲聊

### 4.4 三级动态调整机制

```
调整幅度 ↑
         │
第三层：Advisor 重新规划 ──── "计划废了，重新来"
         │   触发：用户 /replan、Agent 判断、Reviewer 返回 replan
         │   效果：生成全新 pipeline（保留已完成成果）
         │   成本：调用一次 Tier 1 模型
         │
第二层：Reviewer 回退 ──── "这步没做好，回去重做"
         │   触发：Reviewer 返回 fail
         │   效果：current_phase -= 1，标记 rework
         │   成本：零（图结构自动处理）
         │
第一层：Agent 微调 todos ──── "多了一步小事，加上就行"
         │   触发：执行中发现细节问题
         │   效果：write_todos 增删任务
         │   成本：零（现有机制）
         │
         └───────────────────────→ 频率（高 → 低）
```

### 4.5 死循环兜底机制

多代理图中存在多个回环路径，任何一个都可能陷入死循环。以下逐一列出场景和兜底方案。

#### 场景一：Executor ↔ Reviewer 反复返工

```
Executor 执行 → Reviewer 审查 fail → phase_done 回退 → Executor 重做
  → Reviewer 再审 fail → 回退 → Executor 再做 → ...（无限循环）

原因：
  - Reviewer 的审查标准 Executor 无法满足（模型能力不足）
  - Reviewer 每次指出新问题，永远审不过
  - Executor 的修复反而引入新问题

兜底方案：
  每个阶段维护 rework_count 计数器
  rework_count >= EXECUTOR_MAX_REWORK（默认 2）时：
    → 不再回退，改为 escalate 到主代理
    → 主代理收到通知："Phase X 返工 2 次仍未通过，Reviewer 反馈：{feedback}"
    → 主代理用 ask_user 请求用户介入
    → 用户可以选择：
      a) 手动修复后继续
      b) 跳过审查继续下一阶段
      c) 放弃整个 pipeline
```

```python
# phase_done 节点中的兜底逻辑
def phase_done_node(state):
    if state.get("review_result") == "fail":
        rework_count = state.get("_rework_count", 0) + 1

        if rework_count >= config.EXECUTOR_MAX_REWORK:
            # 兜底：停止返工，escalate 到主代理
            return {
                "phase_status": "escalated",
                "_rework_count": 0,
                "messages": [HumanMessage(
                    content=f"[系统通知] Phase {state['current_phase']} 返工 {rework_count} 次仍未通过。\n"
                            f"Reviewer 反馈：{state.get('review_feedback', '')}\n"
                            f"请使用 ask_user 请求用户介入。"
                )]
            }

        # 正常回退
        return {
            "current_phase": state["current_phase"] - 1,
            "phase_status": "rework",
            "_rework_count": rework_count,
        }
```

#### 场景二：Advisor 反复重新规划

```
Advisor 规划 → 执行 → 失败 → replan → Advisor 重新规划
  → 执行 → 又失败 → replan → ...（无限循环）

原因：
  - 任务本身不可行
  - Advisor 每次规划差异不大，换汤不换药
  - 重新规划后遇到同样的问题

兜底方案：
  会话级 advisor_call_count 计数器
  advisor_call_count >= ADVISOR_MAX_CALLS_PER_SESSION（默认 3）时：
    → 不再重新规划
    → 主代理收到通知："已尝试规划 3 次，无法找到可行方案"
    → 主代理用 ask_user 请求用户重新描述需求或降低要求
```

```python
# advisor 节点入口检查
async def advisor_node(state, run_config):
    call_count = state.get("_advisor_call_count", 0) + 1

    if call_count > config.ADVISOR_MAX_CALLS_PER_SESSION:
        # 兜底：拒绝继续规划
        return {
            "advisor_called": True,
            "needs_replan": False,
            "_advisor_call_count": call_count,
            "messages": [AIMessage(
                content="⚠️ 已尝试规划 {call_count-1} 次但执行均遇到问题。"
                        "建议重新描述需求或简化任务范围。"
            )]
        }

    # 正常规划逻辑...
    return {
        "_advisor_call_count": call_count,
        ...
    }
```

#### 场景三：Agent ↔ tools 常规循环失控

```
Agent 调用工具 → tools 执行 → 回到 Agent → 又调用工具
  → tools → Agent → 又调用 → ...（Agent 陷入无意义循环）

原因：
  - Agent 反复执行同一个命令但不检查结果
  - 工具输出 Agent 无法理解，反复重试
  - Agent 在 pipeline 模式下迷失方向

兜底方案（分两层）：

  第一层：LangGraph max_iterations（已有能力）
    编译图时设置 recursion_limit
    超过限制 → GraphRecursionError → 捕获后通知用户

  第二层：连续相同工具调用检测
    如果连续 N 次（默认 3）调用同一工具且参数相似：
    → PostToolUse Hook 检测到后注入警告消息
    → Agent 收到："[系统警告] 你已连续 3 次执行类似操作，请检查是否陷入循环"
    → 连续 5 次 → 强制 interrupt，请求用户介入
```

```python
# graph 编译时设置 recursion_limit
def compile_graph(checkpointer=None):
    graph = build_graph()
    return graph.compile(
        checkpointer=checkpointer,
        # 全局循环上限（所有节点访问总次数）
        interrupt_after=None,  # 不用这个，用 recursion_limit
    )

# PostToolUse Hook 中的循环检测
async def _detect_tool_loop(state, result):
    """检测连续相同工具调用"""
    recent_tools = state.get("_recent_tool_calls", [])
    current_call = _extract_tool_name(state)

    recent_tools.append(current_call)
    if len(recent_tools) > 5:
        recent_tools = recent_tools[-5:]

    # 连续 3 次相同工具
    if len(recent_tools) >= 3 and len(set(recent_tools[-3:])) == 1:
        if len(recent_tools) >= 5 and len(set(recent_tools[-5:])) == 1:
            # 连续 5 次 → 强制 interrupt
            return "force_interrupt"
        # 连续 3 次 → 注入警告
        return "warn"

    return "ok"
```

#### 场景四：pipeline_router 阶段卡死

```
pipeline_router → agent 执行某阶段 → agent 完成但没推进 current_phase
  → pipeline_router 又路由到同一阶段 → ...（同一阶段无限执行）

原因：
  - Agent 执行完阶段任务但忘了调用 phase_done
  - phase_done 逻辑未正确推进 current_phase

兜底方案：
  每个阶段维护 phase_attempt_count 计数器
  同一阶段被路由超过 MAX_PHASE_ATTEMPTS（默认 5）次：
    → 强制推进 current_phase += 1
    → 注入消息："[系统通知] Phase X 执行超时，已自动跳过"
    → 如果是 required=true 的阶段 → 不跳过，改为 escalate 到用户
```

#### 场景五：Reviewer 返回 replan 导致无限重新规划

```
Reviewer → replan → Advisor 重新规划 → 执行 → Reviewer → 又 replan → ...

这是场景一和场景二的组合。兜底方案已被两个计数器覆盖：
  - advisor_call_count 限制重新规划次数
  - rework_count 限制每阶段返工次数
  - 任一计数器超限 → escalate 到用户
```

#### 兜底机制总表

| 循环场景 | 检测方式 | 触发阈值 | 兜底动作 |
|---------|---------|---------|---------|
| Executor ↔ Reviewer 返工 | `_rework_count` 计数器 | `EXECUTOR_MAX_REWORK`（默认 2） | escalate 到主代理 → ask_user |
| Advisor 反复规划 | `_advisor_call_count` 计数器 | `ADVISOR_MAX_CALLS_PER_SESSION`（默认 3） | 拒绝规划 → ask_user |
| Agent ↔ tools 循环 | PostToolUse Hook 检测连续相同调用 | 3 次警告 / 5 次强制中断 | 注入警告 → interrupt |
| 同一阶段卡死 | `_phase_attempt_count` 计数器 | `MAX_PHASE_ATTEMPTS`（默认 5） | required 阶段 escalate / 非 required 跳过 |
| 全局节点访问总次数 | LangGraph `recursion_limit` | 默认 50（可配置） | GraphRecursionError → 通知用户 |

#### 所有兜底的最终归宿：用户

```
所有兜底机制的终点都是一样的 → 通知用户，让用户决定。

因为：
  - 机器判断不了"任务本身不可行"还是"只是执行方式不对"
  - 只有用户能决定"放弃"还是"换个方式继续"
  - 与其在循环中浪费 API 费用，不如早点告诉用户

通知格式（统一）：
  "[系统通知] ⚠️ 检测到执行异常
   类型：{循环类型}
   位置：Phase {N} — {phase_name}
   已尝试：{count} 次
   最近反馈：{last_feedback}
   
   请选择：
   a) 手动介入修复
   b) 跳过当前阶段继续
   c) 重新规划整个任务
   d) 终止任务"
```

### 4.6 分级触发策略

不是所有任务都需要完整多代理流程：

| 任务类型 | 判断条件 | 执行路径 |
|---------|---------|---------|
| **简单问答** | 信息查询、单步操作 | Agent 直接回复 → END |
| **中等任务** | 需要规划但无需并行 | Agent → Advisor → Agent 按 pipeline 执行 |
| **复杂可拆分** | 多模块、可并行子任务 | Agent → Advisor → Dispatcher → Executor×N → Reviewer |
| **创作类** | 内容创作、报告撰写 | Agent → Advisor → Agent/Executor 按阶段执行 → Reviewer |

---

## 五、Workflow 模板规范

### 5.1 目录结构

```
data/workflows/
├── README.md                    # 工作流模板系统说明
├── general.md                   # 通用兜底模板（所有领域都能用）
├── software-dev.md              # 软件开发
├── content-creation.md          # 内容创作
├── data-analysis.md             # 数据分析
└── report-writing.md            # 报告撰写
```

### 5.2 模板文件格式

```markdown
---
name: 内容创作工作流
domain: content_creation
description: 适用于公众号文章、技术博客、自媒体内容等创作场景
keywords: [写文章, 博客, 公众号, 创作, 撰写, 文案, 内容, 自媒体, 推文]
version: "1.0"
---

## Phase 1: Understand
- description: 确认平台、受众、风格、字数
- method: agent
- skill: content-requirement-analysis
- required: true

## Phase 2: Research
- description: 竞品分析、素材收集
- method: executor
- skill: content-research
- required: false

## Phase 3: Plan
- description: 拟定大纲、标题备选
- method: agent
- skill: content-planning
- required: false

## Phase 4: Execute
- description: 逐节撰写正文
- method: executor_parallel
- skill: content-writing
- required: true

## Phase 5: Verify
- description: 逻辑连贯性、原创度、合规性检查
- method: reviewer
- skill: content-review
- required: true

## Phase 6: Deliver
- description: 排版、SEO 优化、输出终稿
- method: agent
- skill: content-formatting
- required: true
```

### 5.3 模板匹配逻辑

```
优先级：专用模板 > 通用模板

匹配方式：Advisor（Tier 1 模型）分析 advisor_context.user_request
  → LLM 判断任务属于什么领域
  → 从 data/workflows/ 中选择最匹配的模板
  → 如果没有专用模板 → 使用 general.md

Advisor prompt 中会列出所有可用模板的 name + description + keywords
让 LLM 做选择，而不是靠关键词硬匹配
```

---

## 六、Skill 技能规范（重新设计）

### 6.1 核心变化

| 维度 | 现有（P1） | P3 新规范 |
|------|-----------|----------|
| 目录结构 | 技能文件夹只有 SKILL.md | 每个技能一个文件夹，可包含脚本、模板等辅助文件 |
| 匹配方式 | 关键词 triggers 匹配 | 向量检索（关键词作 fallback） |
| 加载时机 | 主代理每次调用时匹配注入 | 有模板时从模板定义加载；无模板时 Advisor 向量检索匹配 |
| 角色归属 | 全部注入主代理 prompt | 按角色分配：调试类→Executor，审查类→Reviewer |

### 6.2 技能文件夹结构

**每个技能一个独立文件夹**，包含：

```
data/skills/
├── README.md                           # 技能系统总说明
│
├── systematic-debugging/               # 技能目录（目录名 = 技能 ID）
│   ├── SKILL.md                        # 技能主文件（必须存在，AI 读取的核心指令）
│   ├── scripts/                        # 可选：辅助脚本
│   │   └── collect-logs.sh             # 例：自动收集日志的脚本
│   ├── templates/                      # 可选：输出模板
│   │   └── debug-report.md             # 例：调试报告模板
│   └── examples/                       # 可选：示例/参考
│       └── sample-debug-session.md     # 例：一个完整的调试示例
│
├── code-review/
│   ├── SKILL.md
│   ├── scripts/
│   │   └── run-lint.sh                 # 例：自动跑 linter 的脚本
│   └── templates/
│       └── review-report.md            # 例：审查报告模板
│
├── content-writing/                    # P3 新增：内容撰写技能
│   ├── SKILL.md
│   ├── templates/
│   │   ├── blog-outline.md             # 博客大纲模板
│   │   └── wechat-format.md            # 公众号排版模板
│   └── examples/
│       └── sample-blog.md              # 示例文章
│
├── content-requirement-analysis/       # P3 新增：需求分析技能
│   ├── SKILL.md
│   └── templates/
│       └── requirement-checklist.md    # 需求确认清单模板
│
├── content-research/                   # P3 新增：内容调研技能
│   └── SKILL.md
│
├── content-review/                     # P3 新增：内容审查技能
│   ├── SKILL.md
│   └── templates/
│       └── content-review-report.md    # 内容审查报告模板
│
├── content-planning/                   # P3 新增：内容规划技能
│   ├── SKILL.md
│   └── templates/
│       └── outline-template.md         # 大纲模板
│
├── content-formatting/                 # P3 新增：内容排版技能
│   └── SKILL.md
│
├── data-cleaning/                      # P3 新增：数据清洗技能
│   ├── SKILL.md
│   └── scripts/
│       └── detect-encoding.py          # 编码检测脚本
│
└── data-analysis/                      # P3 新增：数据分析技能
    ├── SKILL.md
    └── templates/
        └── analysis-report.md          # 分析报告模板
```

### 6.3 SKILL.md 格式（升级版）

```markdown
---
name: 内容撰写
description: 结构化内容撰写流程，适用于博客、公众号、技术文档等场景
triggers: [写文章, 撰写, 博客, 正文, 内容创作, writing]
priority: 8
version: "1.0"
target_role: executor
# target_role 说明：
#   agent    — 注入主代理 prompt（需要用户交互的技能）
#   executor — 注入 Executor prompt（执行类技能）
#   reviewer — 注入 Reviewer prompt（审查类技能）
#   any      — 由调用方决定（默认值）
scripts:
  - scripts/word-count.sh
templates:
  - templates/blog-outline.md
  - templates/wechat-format.md
---

## 内容撰写流程（本技能被激活时执行）

### 第一步：确认写作框架
（以下是详细的方法论...）
```

**新增字段说明**：

| 字段 | 类型 | 必须 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 技能显示名称 |
| `description` | string | 是 | 一句话描述（用于向量检索和 Advisor 列表） |
| `triggers` | list | 是 | 触发关键词（P1 匹配用，P3 作 fallback） |
| `priority` | int | 否 | 优先级（默认 0） |
| `version` | string | 否 | 版本号 |
| `target_role` | string | 否 | 目标角色：agent/executor/reviewer/any（默认 any） |
| `scripts` | list | 否 | 辅助脚本相对路径列表 |
| `templates` | list | 否 | 输出模板相对路径列表 |

### 6.4 辅助文件的使用方式

**scripts/**：Executor 执行时可调用的辅助脚本

```
使用场景：
  技能 SKILL.md 中的指令引用脚本：
    "执行 `run_terminal('bash data/skills/code-review/scripts/run-lint.sh 目标文件')` 进行代码检查"

  Executor 根据 SKILL.md 指令，通过 run_terminal 工具执行脚本
  脚本路径在 SKILL.md 的 front matter 中声明，Executor prompt 中会注入完整路径
```

**templates/**：标准化输出格式

```
使用场景：
  技能 SKILL.md 中引用模板：
    "按照 templates/review-report.md 的格式输出审查报告"

  模板内容会被读取并注入到执行者的 prompt 中
  确保每次输出格式一致、可复现
```

**examples/**：参考示例（可选，渐进披露）

```
使用场景：
  Advisor 判断需要时，将 example 注入 Executor prompt
  或者 Executor 遇到困难时主动请求加载 example
  默认不加载，避免 prompt 过长
```

### 6.5 向量化检索方案

```
ChromaDB 新增集合：skill_knowledge（与 conversation_memory 并列）

文档 ID = 技能目录名（唯一）
Embedding 内容 = SKILL.md 的 description + 正文摘要（前 500 字）
Embedding 服务 = 复用现有本地 BGE-M3（localhost:8100）

metadata：
  - skill_name: 技能名称
  - description: 技能描述
  - target_role: 目标角色
  - file_path: SKILL.md 完整路径
  - file_hash: 内容 MD5（变更检测）
  - triggers: 原始关键词（fallback 用）
  - has_scripts: bool
  - has_templates: bool
  - updated_at: 最后更新时间

同步策略：
  1. 启动时全量同步（冷启动保底）
  2. Advisor 被调用时懒加载检测（对比 mtime）
  3. /skills reload CLI 命令手动触发
```

---

## 七、Hooks 机制

### 7.1 设计目标

将 prompt 中的"口头规则"变成代码层面的"自动锁"。

### 7.2 实现位置

在现有的 `safe_tool_node`（graph.py）中加入 Hook 调用：

```python
async def safe_tool_node(state: AgentState) -> dict:
    """工具执行包装器：Pre/Post Hook + surrogate 清理"""

    # === PreToolUse Hook ===
    await run_pre_hooks(state)

    # === 工具执行 ===
    result = await _raw_tool_node.ainvoke(state)

    # === PostToolUse Hook ===
    result = await run_post_hooks(state, result)

    return result
```

### 7.3 Hook 类型

**PreToolUse（工具执行前）**：

| Hook | 说明 | 触发工具 |
|------|------|---------|
| 路径检查 | 写文件前检查是否在 permissions.yaml 禁区 | write_and_run_script |
| 命令过滤 | 执行前检查是否在拒绝命令列表 | run_terminal |
| 范围锁定 | pipeline 执行时，限制操作范围在当前子任务内 | 所有 |

**PostToolUse（工具执行后）**：

| Hook | 说明 | 触发工具 |
|------|------|---------|
| surrogate 清理 | 已有，清理无效字符 | 所有 |
| 审计日志增强 | 记录操作到 audit_logs | 所有 |
| 格式检查 | 代码修改后自动跑 linter | write_and_run_script |
| 经验记录 | 错误恢复后记录教训到 lessons.md | run_terminal（失败后成功时） |

### 7.4 声明式权限配置

新增 `data/permissions.yaml`：

```yaml
# 路径级规则：禁止修改的文件/目录
path_rules:
  - pattern: ".env"
    allow: false
    reason: "环境变量文件不可修改"
  - pattern: "docker/*"
    allow: false
    reason: "Docker 配置不可修改"
  - pattern: "*.db"
    allow: false
    reason: "数据库文件不可直接修改"

# 命令级规则：拒绝的命令（补充 config.py 中的 DANGEROUS_COMMAND_KEYWORDS）
command_deny:
  - "git push --force"
  - "git reset --hard"
  - "pip install --break-system-packages"
```

---

## 八、新增文件清单

### 8.1 代码文件

```
agent/subagents/                  # 子代理模块
  ├── __init__.py                 # 模块入口
  ├── advisor.py                  # Advisor 顾问节点
  ├── executor.py                 # Executor 执行节点
  ├── reviewer.py                 # Reviewer 审查节点
  ├── dispatcher.py               # Dispatcher 调度器节点
  ├── phase_done.py               # phase_done 阶段推进节点
  └── states.py                   # 子代理 State 定义（ExecutorState 等）

agent/hooks.py                    # Pre/Post Hook 机制
agent/permissions.py              # permissions.yaml 加载和检查
agent/workflow_loader.py          # workflow 模板加载器
agent/skill_vector_store.py       # 技能向量化检索（SkillVectorStore 类）
agent/tools/request_planning.py   # request_planning 工具（Agent 触发 Advisor）
```

### 8.2 数据文件

```
data/permissions.yaml             # 声明式权限配置
data/project.md                   # 项目声明文件（用户维护）

data/workflows/                   # Workflow 模板目录
  ├── README.md                   # 模板系统说明
  ├── general.md                  # 通用兜底模板
  ├── software-dev.md             # 软件开发模板
  ├── content-creation.md         # 内容创作模板
  ├── data-analysis.md            # 数据分析模板
  └── report-writing.md           # 报告撰写模板

data/skills/                      # 技能目录（升级规范）
  ├── content-writing/            # P3 新增
  │   ├── SKILL.md
  │   ├── templates/
  │   └── examples/
  ├── content-requirement-analysis/
  │   ├── SKILL.md
  │   └── templates/
  ├── content-research/
  │   └── SKILL.md
  ├── content-review/
  │   ├── SKILL.md
  │   └── templates/
  ├── content-planning/
  │   ├── SKILL.md
  │   └── templates/
  ├── content-formatting/
  │   └── SKILL.md
  ├── data-cleaning/
  │   ├── SKILL.md
  │   └── scripts/
  └── data-analysis/
      ├── SKILL.md
      └── templates/
```

### 8.3 修改文件

```
agent/graph.py                    # 主图集成：新增节点、修改 agent_router、build_graph
agent/state.py                    # AgentState 新增 P3 字段
agent/config.py                   # 新增 EXECUTOR_MODEL_NAME、WORKFLOWS_DIR 等配置
agent/security.py                 # 集成 permissions.yaml 规则
agent/skill_loader.py             # 向量检索主路径 + 关键词 fallback
agent/vector_store.py             # 新增 skill_knowledge 集合
agent/tools/__init__.py           # 注册 request_planning 工具
agent/cli.py                      # 新增 /replan、/skills reload 命令
data/skills/README.md             # 更新技能规范说明
```

---

## 九、config.py 新增配置项

```python
# ==================== P3 多代理配置 ====================

# Executor/Reviewer 使用的模型（Tier 3，便宜可并行）
EXECUTOR_MODEL_NAME = os.getenv("OPENSYS_EXECUTOR_MODEL", "deepseek-chat")
REVIEWER_MODEL_NAME = os.getenv("OPENSYS_REVIEWER_MODEL", "deepseek-chat")

# Advisor 使用的模型（Tier 1，最强）= 复用现有 COMPLEX_MODEL_NAME

# Workflow 模板目录
WORKFLOWS_DIR = DATA_DIR / "workflows"
WORKFLOWS_DIR.mkdir(parents=True, exist_ok=True)

# 权限配置文件
PERMISSIONS_FILE = DATA_DIR / "permissions.yaml"

# 项目声明文件
PROJECT_FILE = DATA_DIR / "project.md"

# 技能向量化配置
CHROMA_COLLECTION_SKILLS = "skill_knowledge"
SKILL_VECTOR_TOP_K = int(os.getenv("OPENSYS_SKILL_VECTOR_TOP_K", "5"))

# 防环限制与死循环兜底
ADVISOR_MAX_CALLS_PER_SESSION = int(os.getenv("OPENSYS_ADVISOR_MAX_CALLS", "3"))
EXECUTOR_MAX_REWORK = int(os.getenv("OPENSYS_EXECUTOR_MAX_REWORK", "2"))
MAX_PHASE_ATTEMPTS = int(os.getenv("OPENSYS_MAX_PHASE_ATTEMPTS", "5"))  # 同一阶段最大路由次数
TOOL_LOOP_WARN_THRESHOLD = int(os.getenv("OPENSYS_TOOL_LOOP_WARN", "3"))  # 连续相同工具调用警告阈值
TOOL_LOOP_INTERRUPT_THRESHOLD = int(os.getenv("OPENSYS_TOOL_LOOP_INTERRUPT", "5"))  # 连续相同工具调用强制中断阈值
GRAPH_RECURSION_LIMIT = int(os.getenv("OPENSYS_GRAPH_RECURSION_LIMIT", "50"))  # LangGraph 全局节点访问上限

# Executor 并行限制
EXECUTOR_MAX_PARALLEL = int(os.getenv("OPENSYS_EXECUTOR_MAX_PARALLEL", "5"))
```

---

## 十、实施路线

### 阶段一：Harness 基础设施（不改图结构）

```
优先级：🔴 高
预计工期：3-5 天
改动范围：不新增图节点

实现内容：
  ✅ hooks.py — Pre/Post Hook 机制（safe_tool_node 内部）
  ✅ permissions.yaml — 声明式权限配置
  ✅ permissions.py — 权限加载和检查
  ✅ data/project.md — 项目声明文件（模板 + 加载注入）
  ✅ skill 文件夹规范升级 — 现有 2 个技能按新规范整理（加 target_role 等字段）

验证方式：
  - Hook 拦截测试：写一个被禁路径的文件 → 应被 PreToolUse 拦截
  - 权限测试：执行被禁命令 → 应被拦截
```

### 阶段二：Advisor + Workflow 模板（方案 B，Prompt 驱动）

```
优先级：🔴 高
预计工期：5-7 天
改动范围：新增 1 个图节点（advisor）+ 修改 agent_router

实现内容：
  ✅ advisor.py — Advisor 顾问节点
  ✅ workflow_loader.py — 模板加载器
  ✅ request_planning 工具 — Agent 触发 Advisor
  ✅ general.md — 通用兜底模板
  ✅ content-creation.md — 内容创作模板（第一个专用模板）
  ✅ software-dev.md — 软件开发模板（第二个专用模板）
  ✅ 2-3 个新技能文件夹（content-writing、content-planning 等）
  ✅ state.py 新增 advisor_context、pipeline、current_phase 等字段
  ✅ agent_router 新增 "advisor" 分支
  ✅ skill_vector_store.py — 技能向量化检索

验证方式：
  - 简单任务 → 不触发 Advisor，直接回复
  - 复杂任务 → Agent 调用 request_planning → Advisor 输出 pipeline → interrupt 确认
  - 内容创作 → 匹配 content-creation.md 模板
  - 未知领域 → 回退到 general.md
```

### 阶段三：完整多代理流水线（方案 C，图编排）

```
优先级：🟡 中
预计工期：7-10 天
改动范围：新增 4 个图节点 + pipeline_router

实现内容：
  ✅ dispatcher.py — 调度器（拆子任务 + 依赖分析）
  ✅ executor.py — 执行者（小模型 + 可并行）
  ✅ reviewer.py — 审查者（隔离上下文 + 门禁）
  ✅ phase_done.py — 阶段推进器（推进/回退/replan 逻辑）
  ✅ pipeline_router — 阶段路由
  ✅ states.py — ExecutorState 等子代理 State
  ✅ 大小模型分层执行
  ✅ Reviewer 门禁机制（fail → 回退，replan → 重新规划）
  ✅ /replan CLI 命令

验证方式：
  - 软件开发任务 → Dispatcher 拆子任务 → Executor 并行执行 → Reviewer 审查
  - Reviewer 返回 fail → 自动回退重做
  - 用户输入 /replan → 重新规划
  - 3 个以上 Executor 并行 → asyncio.gather 正常运行
```

### 阶段四：远期增强

```
优先级：⚪ 低
预计工期：持续迭代

实现内容：
  ☐ 操作自我改进（lessons.md 经验积累）
  ☐ 非交互 pipe 模式（自动化任务场景）
  ☐ 插件化架构（技能+工具+模板打包为插件）
  ☐ MCP 协议支持
  ☐ 更多领域的 workflow 模板和技能包
  ☐ 技能市场（用户社区共享技能包）
```

---

## 十一、与现有机制的关系

| 现有机制 | P3 后的变化 |
|---------|-----------|
| P2 关键词分级（task_classifier） | 被 Advisor 的 LLM 判断替代，作为 fallback 保留 |
| P2 模型推荐（prompt 注入建议） | 被模型梯队自动分配替代 |
| P1 技能关键词匹配（skill_loader） | 向量检索为主，关键词匹配作为 fallback |
| P0 红旗思维 / 反合理化 | 保留在主代理，同时通过 Hooks 机械化强制 |
| todos 工具 | 保留，主代理根据 pipeline 生成 todos |
| 三层安全防御 | 保留，Executor 工具调用同样经过风险评估 |
| memory.md | 保留，Agent 总结 advisor_context 时参考 |
| 向量化对话记忆 | 保留，conversation_memory 集合不变 |

---

## 十二、设计灵感来源

| 来源项目 | 借鉴的核心点 | 在 OpenSys 中的体现 |
|---------|------------|-------------------|
| **gstack** | 详细的 SKILL.md + 结构化 Review | 技能文件夹规范 + Reviewer 独立审查 |
| **gstack** | 预设流程骨架（Think → Plan → Build → Review → Ship） | workflow 模板系统 |
| **OpenHarness** | Pre/PostToolUse Hooks | hooks.py 机械化约束 |
| **OpenHarness** | 声明式权限（path_rules + command_deny） | permissions.yaml |
| **OpenHarness** | 插件化（命令+Hooks+子代理打包） | 远期插件化架构 |
| **Harness 四大支柱** | 代码库即真相源 | project.md + permissions.yaml |
| **Harness 四大支柱** | 机械化架构约束 | Hooks + 权限自动执行 |
| **Harness 四大支柱** | 反馈循环 | Reviewer 门禁 + PostToolUse 自动验证 |
| **Harness 四大支柱** | 熵管理 | 操作自我改进 + lessons.md |
