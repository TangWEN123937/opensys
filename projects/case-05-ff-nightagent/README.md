# FF-Autopilot

> **7×24 自主运营 AI 代理系统** —— 一句话目标，Agent 自己拆解、执行、汇报，关键节点请你接管。
>
> FF-SaaSBuilder 系列直播课的 **Case 05** · 教学演示 + 可生产化脚手架。

<p align="center">
  <img src="_showcase/screenshots/01-hero.png" width="820" alt="FF-Autopilot landing" />
</p>

<p align="center">
  <a href="#1--项目定位">项目定位</a> ·
  <a href="#2--快速启动">快速启动</a> ·
  <a href="#3--系统架构">架构</a> ·
  <a href="#4--核心功能">功能</a> ·
  <a href="#5--演示视频">演示视频</a> ·
  <a href="#6--部署">部署</a> ·
  <a href="#7--二次开发">二次开发</a> ·
  <a href="#8--致谢">致谢</a>
</p>

---

## 1 · 项目定位

**FF-Autopilot** 是一个面向「内容运营 / 个人 IP / 矩阵号」场景的**目标驱动型 AI 代理系统**。

不同于 ChatGPT 这类一问一答的对话产品，它的形态是：
1. 你写一句话 30 天目标（KPI）
2. Claude 4.7 自动拆解成 5-7 节点可执行计划
3. Agent 7×24 循环跑：研究 → 起草 → 排期 → 监控
4. 高风险动作（如发布带图笔记）自动暂停，弹审批卡片等你拍板
5. 全周期事件可回放，每个决策与工具调用都可追溯

适用场景：

| 场景 | 示例 KPI |
|---|---|
| 个人 IP / 创作者 | 30 天小红书涨粉 500 + 私信转化 5 单 |
| 矩阵号运营 | 4 个平台同步发图文 + 数据复盘 |
| 内容批量生产 | 每周 3 条短视频 + 1 条长图文 |
| 客服自动回复 | 1 小时内回复评论与私信 + 商单线索上报 |

**演示场景**：30 天小红书 AI 工具测评号涨粉 1K（贯穿整个 demo 视频）。

---

## 2 · 快速启动

```bash
cd cases/case-05-ff-nightagent
pnpm install
pnpm dev
# → http://localhost:3333
```

**端口 3333 硬编码**，避开常见冲突的 :3000。**无需任何 API key 即可完整跑通**（mock-first 架构）。

可选环境变量（写到 `.env.local`）：

```bash
# 真调 Claude 4.7 (走 OpenRouter，sk-or- 开头)
OPENROUTER_API_KEY=sk-or-...

# 或走 Anthropic 原生 API
ANTHROPIC_API_KEY=sk-ant-...

# 自定义 model（默认 anthropic/claude-sonnet-4.5）
OPENROUTER_MODEL=anthropic/claude-opus-4.5
```

无 key 时 → fallback mock plan / 预录 SSE 事件流 / 静态 mock data
有 key 时 → 4 个关键节点真调 LLM（plan / day-tick / replan / report），其余仍走 mock 兜底

---

## 3 · 系统架构

```
┌──────────────────────────────────────────────────────────────┐
│  浏览器 · React 19 / Next.js 16 App Router                   │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ /  · landing            /goals/new   · 新建 Goal       │ │
│  │ /dashboard · 工作台     /goals/[id]/live   · 实时托管  │ │
│  │ /approvals · HITL 审批  /goals/[id]/timeline · 行车记录│ │
│  │ /agents · MCP 工具      /schedules · cron · /settings  │ │
│  └────────────────────────┬────────────────────────────────┘ │
│         EventSource (SSE) │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  Next.js Route Handlers · API 层                             │
│  ┌──────────────────────────┬─────────────────────────────┐ │
│  │ /api/goals POST · 建 goal│ /api/goals/[id]/events GET  │ │
│  │ /api/runs/[id]/approve   │   ↑ SSE 推送 reasoning /    │ │
│  │ /api/health · /api/mode  │     tool_call / hitl_required│ │
│  └──────────────────────────┴─────────────────────────────┘ │
└────────────┬────────────────────────────┬───────────────────┘
             ▼                            ▼
   ┌──────────────────┐          ┌─────────────────────┐
   │ goal-runner.ts   │          │ db.ts (in-memory)   │
   │ ▸ generatePlan   │ events ▶ │ ▸ Map<goalId, run>  │
   │ ▸ runGoalTimeline│          │ ▸ events[] 事件溯源 │
   │ ▸ rePlan (Day 18)│          │   重启清零 (教学友好)│
   │ ▸ generateReport │          └─────────────────────┘
   └──────────────────┘
             │ 真 key 时调 ▼
        ┌────────────────────┐
        │ OpenAI SDK         │
        │  → OpenRouter      │
        │  → Anthropic Claude│
        └────────────────────┘
```

**核心设计哲学**：

| 哲学 | 实现 |
|---|---|
| **Mock-first · Real-on-key** | `buildClient()` 检 key 是否存在；不存在返回 null，所有 LLM 调用路径自动走 fallback |
| **事件溯源** | 所有 agent 行为都是 events，写进 `events[]` 数组；timeline 回放就是重演 events |
| **HITL 是一等公民** | `approval_needed` 是协议级 SSE 事件，runner 真 `await` 用户决策才推进 |
| **零持久化、零部署门槛** | in-memory store · 刷新即重置 · 教学演示节奏更干净 |
| **单进程单 Node 端口** | 不引入 Docker / Redis / 队列 / 数据库 · `pnpm dev` 一句话起 |

参考底座：[NanoClaw](https://github.com/qwibitai/nanoclaw)（8.4K LOC 极简 Agent 编排器）—— 详见 `_research/autonomous-agent-unattended/nanoclaw-source-analysis.md`。本案是 NanoClaw 架构在「内容运营」场景的 Web SaaS 化 MVP。

---

## 4 · 核心功能

| 路由 | 功能 | 截图 |
|---|---|---|
| `/` | Landing · Hero / Bento 六大功能 / 三步走 / 跨平台矩阵 | ![](_showcase/screenshots/01-hero.png) |
| `/dashboard` | 三栏控制室 · KPI 指标 · Plan Tree · 实时思考流 SSE | ![](_showcase/screenshots/02-dashboard.png) |
| `/goals/new` | 自然语言描述 KPI · 选时间压缩比 · Claude 拆 Plan Tree | ![](_showcase/screenshots/03-goals.png) |
| `/goals/[id]/live` | 实时事件流 · KPI Rings · Multi-Agent Lanes · HitlPopup 弹窗 | （见演示视频） |
| `/approvals` | 审批收件箱 · 通过 / 修改 / 驳回 · 列表已处理项 strikethrough | ![](_showcase/screenshots/04-approvals.png) |
| `/goals/[id]/timeline` | 行车记录回放 · 事件圆点跳转 · 0.5×~4× 速度 · hover thought bubble | ![](_showcase/screenshots/05-timeline.png) |
| `/agents` | MCP 工具列表 · xiaohongshu-api / douyin-api / skyvern-browser / claudecron / 视频号 | — |
| `/schedules` | cron 调度卡片 · 每日扫描 / 每周复盘 / 5min 私信轮询 / 凌晨内容起草 | — |
| `/settings` | 品牌语气 · API keys · autonomy guardrails | — |

**已托管 demo goal**（`growth-plan-q2`）：
- 4 个 KPI 指标：关注者 +547 · 互动率 8.3% · 选题储备 24 · 自动周报 4
- 7 节点 Plan Tree（扫描竞品 / 提取话题 / 起草内容 / 主视觉 / 排期 / DM 模板 / 复盘）
- SSE 事件流：reasoning · tool_call (browser.screenshot · image.generate) · plan_update · approval_needed

---

## 5 · 演示视频

完整演示链路 1:51（2x 加速 · 原片 3:42）：

```
artifacts/recordings/2026-04-27-14-08-57-main-flow.mp4
```

```bash
open artifacts/recordings/2026-04-27-14-08-57-main-flow.mp4
```

**5 段叙事结构**：

| 时段（成片） | 内容 |
|---|---|
| 0:00 – 0:18 | 主页快过 · Hero / 三栏控制室 / 六大功能 / 三段架构 |
| 0:18 – 0:50 | 进入工作台 · 新建 Goal · 自然语言 KPI · 时间压缩档位 |
| 0:50 – 1:00 | Claude 4.7 自动拆解 KPI · 7 节点行动计划 fade-up |
| 1:00 – 1:30 | 实时事件流 · 自动调浏览器抓竞品 · 多模态生成主视觉 |
| 1:30 – 1:51 | 审批收件箱 · 通过自动发布 · 行车记录回放 |

**自动录制基础设施**（`scripts/record/`）：

```bash
pnpm record:smoke   # 30s hero 滚动烟雾测试
pnpm record:main    # 1:51 完整主线 demo
pnpm record:lint    # 字幕风格 lint
```

剧本是 JSON · 字幕黄色 36px · 虚拟鼠标 + ripple 反馈 · ffmpeg 2x 加速。三份硬规范：

| 规范 | 作用 |
|---|---|
| `scripts/record/SUBTITLE-STYLE.md` | 字幕 5 禁令 + 8 强制句式 + 视觉规格 + 锚点要求 |
| `scripts/record/PRE-RECORD-AUDIT.md` | 录前功能审计 · 防止字幕承诺与源码现状脱节 |
| `scripts/record/lint-subtitles.mjs` | 自动 linter · 启动 runner 即扫 · 违规 exit 2 拒跑 |

---

## 6 · 部署

### 本地生产模式

```bash
pnpm build
pnpm start
# → http://localhost:3333 (生产模式 · 无 Next dev 红点角标)
```

### Vercel 一键部署

所有 mock-mode 路由 serverless-compatible · 一键 deploy 即可：

```bash
pnpm dlx vercel deploy --prod
```

环境变量（可选）在 Vercel Dashboard 设置：
- `OPENROUTER_API_KEY` 或 `ANTHROPIC_API_KEY`
- `OPENROUTER_MODEL`

### Docker（可选）

未提供 Dockerfile · 标准 `node:22-slim + pnpm + next start` 即可，本案教学版不强求。

---

## 7 · 二次开发

### 替换 demo 数据

| 想改 | 改哪里 |
|---|---|
| 主 demo goal 的 KPI / Plan Tree | `src/lib/mock-data.ts` `MOCK_GOALS[0]` |
| 审批 demo 草稿（小红书笔记） | `src/lib/mock-data.ts` `MOCK_APPROVALS` |
| MCP 工具列表 | `src/lib/mock-data.ts` `MOCK_MCP` |
| Cron 调度示例 | `src/lib/mock-data.ts` `MOCK_SCHEDULES` |
| HitlPopup 触发的草稿内容 | `src/lib/agent/goal-runner.ts:296` |
| Live SSE 预录脚本 | `src/lib/events/mock-script.ts` |

### 接真 LLM

`src/lib/agent/goal-runner.ts` 已封装好 4 个真调点：
- `generatePlan` (Day 0)
- day-runner step (每个 day_tick)
- `replanWithClaude` (Day 18 · Reflexion)
- `generateReport` (最终周报)

只要 `.env.local` 里设 `OPENROUTER_API_KEY` 或 `ANTHROPIC_API_KEY`，自动切真调 · 前端零感知。

### 切换平台 / 添加自定义平台

`src/lib/agent/goal-input.ts` platform enum：

```ts
platform: "xiaohongshu" | "douyin" | "bilibili" | "shipinhao" | "weixin"
```

新增平台需同步：
1. enum 加 case
2. `src/components/brand/platform-icons.tsx` 加 monogram SVG
3. `src/components/goals/goal-setup.tsx` 加 preset 模板
4. `src/lib/mock-data.ts` `MOCK_MCP` 加对应 server

### 持久化（替换 in-memory）

`src/lib/db.ts` 是模仿 better-sqlite3 接口的 Map shim · 重启清零。要持久化：
- 装 `better-sqlite3`（已在 dependencies）
- 替换 `src/lib/db.ts` 实现，保持接口签名不变
- 其他代码零修改

### 自动录新演示视频

```bash
# 1. 建剧本
cp scripts/record/scripts/main-flow.json scripts/record/scripts/my-demo.json
# 2. 改 steps · 必读 scripts/record/SUBTITLE-STYLE.md
# 3. lint
pnpm record:lint scripts/record/scripts/my-demo.json
# 4. 录制
node scripts/record/runner.mjs scripts/record/scripts/my-demo.json
# 输出落到 artifacts/recordings/
```

---

## 8 · 致谢

- 架构灵感：[NanoClaw](https://github.com/qwibitai/nanoclaw) by qwibitai
- UI 视觉对标：Linear · Postiz · Cursor · Devin · Manus
- 录制 skill 雏形：[agent-browser-recording-demo](#) · 改造为 Playwright + macOS 版
- AI 协作：Claude 4.7 Opus（1M 上下文）+ Claude Sonnet 4.5（默认 model）

> **教学演示项目** · MIT License · © 2026 FF-SaaSBuilder
> 本项目为 [FF-SaaSBuilder 直播课](#) 第 5 案，配套录播链接见课程主页。
