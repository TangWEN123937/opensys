# Agent Studio · 通用 Agent 编排开发平台

> **所有 Agent 运行时的中央控制台**
>
> 把业界四大运行时(**Agent Skills · MCP · Tool Calling · Model Router**)+ 五种 Agent 模式 + Trace/Eval 装进一个可视化 Studio · 装能装 · 跑能跑 · 看能看 · 算能算。
>
> 📍 端口 `3240` · ⚙️ Next.js 16 + Tailwind v4 · 🎨 浅色 · 深海军蓝 + 琥珀

> 📸 **完整演示**：双击 [`_docs/showcase.html`](./_docs/showcase.html) · 单文件离线自包含 · 21 页一览

---

## 📸 页面截图

### 🎯 ★ 核心 Hero · 两个最硬卖点

| Live Run · ReAct 中间数据 + Skill 3 层披露 <code>/run/live</code> ✨New | Agent Studio 画布 <code>/studio</code> ★ |
|---|---|
| ![Live Run](./_docs/screenshots/06-run-live.png) | ![Studio](./_docs/screenshots/03-studio.png) |
| **全站最硬核** · 真 SSE 消费 · Thought/Action/Observation 完整展开 · Skill 3 层渐进披露流水线 | ReactFlow 拖拽画布 · 8 类节点色 · 运行中脉冲 · 真调 /api/agents/run |

| Landing <code>/</code> | Trace Waterfall <code>/trace/waterfall</code> ★ |
|---|---|
| ![Landing](./_docs/screenshots/01-landing.png) | ![Trace](./_docs/screenshots/07-trace-waterfall.png) |
| 三色渐变大字 + 右侧 DAG 预览 + 四大运行时卡 + 3 档定价 | span 瀑布 · LangSmith 风 · 复制 JSON/导出真 blob download |

### 四大运行时(真后端)

| Skills Hub <code>/skills</code> ★ | MCP Servers <code>/mcp</code> |
|---|---|
| ![Skills](./_docs/screenshots/08-skills.png) | ![MCP](./_docs/screenshots/09-mcp.png) |
| 真读 .skills/*/SKILL.md · 3 层渐进披露交互(L1/L2/L3)· 装/卸持久化 | 10 servers · install/uninstall 真写 · manifest JSON 复制 |

| Tools Registry <code>/tools</code> | Model Router <code>/models</code> |
|---|---|
| ![Tools](./_docs/screenshots/10-tools.png) | ![Models](./_docs/screenshots/11-models.png) |
| 4 真工具 · calc/date_diff/uuid_gen/web_search(真调 DuckDuckGo)· Playground 真跑 | 10 模型 · 每行'测试'真调 OpenRouter · 346 个真模型 |

### 编排 + 数据 + 观测

| Pattern Gallery | Run Console | Memory |
|---|---|---|
| ![Patterns](./_docs/screenshots/04-patterns.png) | ![Run](./_docs/screenshots/05-run.png) | ![Memory](./_docs/screenshots/12-memory.png) |
| 6 种 Agent 模式 + mini DAG · 点击跳 /studio | 实时 agent 列表 · live log 流 | 短/长/向量/图 四层 · 清空真 POST |

| Knowledge (RAG) | Eval Lab | Trace Explorer |
|---|---|---|
| ![Knowledge](./_docs/screenshots/13-knowledge.png) | ![Eval](./_docs/screenshots/14-eval.png) | ![Trace](./_docs/screenshots/15-trace-explorer.png) |
| 真 hybrid 检索 · RRF · 上传 .md 真入库 | RAGAS 6 指标雷达 · CSV 真导出 | 8 条 trace · CSV 真下载 |

| Monitor | Dashboard | Audit Logs |
|---|---|---|
| ![Monitor](./_docs/screenshots/16-monitor.png) | ![Dashboard](./_docs/screenshots/02-dashboard.png) | ![Audit](./_docs/screenshots/18-audit.png) |
| QPS / P95 / 错误率 + 成本矩阵 | 4 stats + sparkline | 真读 audit.jsonl · CSV 导出 |

### 治理 + 商业化 + 门面

| Teams · RBAC | Deploy & API | Marketplace 💰 |
|---|---|---|
| ![Teams](./_docs/screenshots/17-teams.png) | ![Deploy](./_docs/screenshots/19-deploy.png) | ![Marketplace](./_docs/screenshots/20-marketplace.png) |
| 4×8 权限矩阵 | API/Webhook/Embed · 密钥 crypto 真生成 | 创作者收入 + 订单流 live |

| Settings <code>/settings</code> |
|---|
| ![Settings](./_docs/screenshots/21-settings.png) |
| 5 Provider · 每个'测试'真调 /api/models/test 连通 · 346 模型返回 |

---

## ✨ 功能亮点

- **21 页完整产品原型** · 含 **Live Run · ReAct 可视化**(★ 新增 · 看每步 Thought/Action/Observation + Skill 3 层披露)
- **8 个真后端 API** · `/api/{chat,agents/run,skills,mcp,tools,knowledge,memory,models,audit}` · 全部实际跑
- **79 个按钮全 wire** · onClick / Link / toast · 点每个都有反应(真 API / 跳页 / 反馈)
- **5 种 Agent 模式** · ReAct / Plan-Execute / Reflexion / Multi-Agent Debate / Hierarchical / Swarm — 每种都有 mini DAG 示意
- **真 SSE 流式** · `/api/chat` 接 OpenRouter Claude Haiku 4.5 · token 级流回前端
- **酷炫可视化** · ReactFlow DAG · Trace 瀑布 · RAGAS 雷达 · UMAP 向量空间 · 图关系网络 · Failover 流程图 · Stacked Area 监控图
- **浅色精致风** · Linear + Stripe + Vercel 风 · 深海军蓝主色 + 琥珀强调 · **无深紫 AI 感**
- **可发布三模式** · HTTP API(SSE) / Webhook(HMAC) / Embed Widget · 一键 code snippet 三语言
- **创作者变现** · Marketplace 上架 Agent/Skill · 70% 分成 · 订单流实时

---

## 🏗️ 技术架构

```
┌─ Frontend (Next.js 16 · Turbopack) ───────────────────┐
│  App Router · 20 pages                                │
│  ├─ /                  Landing (public)               │
│  ├─ /dashboard         全局概览                        │
│  ├─ /studio · /patterns · /run · /trace/*            │
│  ├─ /skills · /mcp · /tools · /models                │
│  ├─ /memory · /knowledge                             │
│  ├─ /eval · /trace · /monitor                        │
│  ├─ /teams · /audit                                  │
│  ├─ /deploy · /marketplace                           │
│  └─ /settings                                        │
│                                                       │
│  UI: shadcn 手写(浅色变体) + Tailwind v4 + Motion    │
│  Visualization: ReactFlow · SVG 手绘 · recharts      │
└───────────────────────────────────────────────────────┘
           ↓
┌─ API Routes (Node runtime) ───────────────────────────┐
│  /api/chat  · SSE 真流式 · OpenRouter 直连            │
│  (后续可扩:/api/agents/run · /api/skills/install …)   │
└───────────────────────────────────────────────────────┘
           ↓
┌─ External Providers ──────────────────────────────────┐
│  OpenRouter · Claude Haiku 4.5 (chat)                 │
│  Dashscope (embedding, 可选)                          │
│  Jina / Cohere (rerank, 可选)                         │
│  Smithery / Glama (MCP registry, 可选)                │
└───────────────────────────────────────────────────────┘
```

### 目录结构

```
case-04-agent-studio/
├── src/
│   ├── app/                 · 20 页 Next.js App Router
│   │   ├── page.tsx         · Landing (public)
│   │   ├── layout.tsx       · Root layout + globals.css
│   │   ├── globals.css      · Tailwind v4 + 自定义 tokens
│   │   ├── dashboard/       · 概览
│   │   ├── studio/          · Agent Studio + Pattern
│   │   ├── run/             · Run Console
│   │   ├── trace/           · Trace Explorer + Waterfall
│   │   ├── skills/          · Skills Hub
│   │   ├── mcp/             · MCP Servers
│   │   ├── tools/           · Tools Registry
│   │   ├── models/          · Model Router
│   │   ├── memory/          · Memory
│   │   ├── knowledge/       · Knowledge RAG
│   │   ├── eval/            · Eval Lab
│   │   ├── monitor/         · Monitor
│   │   ├── teams/           · Teams RBAC
│   │   ├── audit/           · Audit Logs
│   │   ├── deploy/          · Deploy & API
│   │   ├── marketplace/     · Marketplace
│   │   ├── settings/        · Settings
│   │   └── api/chat/        · SSE 真流式接 OpenRouter
│   ├── components/
│   │   ├── ui/              · button / badge / input
│   │   └── layout/          · sidebar / topbar / page-shell
│   └── lib/utils.ts         · cn()
├── _docs/
│   ├── design-system.md     · 色/字/间距 tokens
│   ├── take-screenshots.mjs · playwright 20 页自动截
│   ├── screenshots/*.png    · 20 张 retina 截图
│   └── showcase.html        · 单文件演示海报
├── .env.example             · env 模板
├── .gitignore               · 白名单 !.env.example
├── AGENTS.md / CLAUDE.md    · Next.js 16 agent 提示
├── LICENSE                  · MIT
└── package.json
```

---

## 🧠 核心功能实现

### Agent Studio 画布(`src/app/studio/page.tsx`)

- **ReactFlow 11** 做 DAG · 自定义 `StudioNode` 按 kind 着色
- 8 类节点:input / llm / tool / skill / mcp / memory / branch / output
- 连线两种:已完成(灰虚线 + 箭头)· 进行中(深蓝流光 dashed `animate stroke-dashoffset`)
- 左 Node Palette · 中画布 · 右 Inspector 三栏

### Trace Waterfall(`src/app/trace/waterfall/page.tsx`)

- 8 span 层级树 → 扁平化 + depth 缩进
- 每 span 按 `kindMeta` 彩色横条 · 左 start · 右 duration
- 支持 replay / copy JSON / export / share
- 下方选中 span 详情(input / output / tokens)

### Model Router 三视图(`src/app/models/page.tsx`)

- **成本对比条图**:input(主色) + output(琥珀) 堆叠
- **延迟热图**:每模型 24 格(近 24 小时)· 5 档渐变(绿→红)
- **Failover DAG**:Router 分三档 · 失败红色虚线 fallback · SVG 手绘

### Memory 四层(`src/app/memory/page.tsx`)

- 4 tab:短期(对话栈)/ 长期(KV facts)/ 向量(UMAP 2D + fan-out)/ 图(graphology)
- LangGraph checkpoint 时间轴 · 任一点可 replay

### Eval Lab(`src/app/eval/page.tsx`)

- 6 指标雷达图(当前 shape + 基线 dashed)
- RAGAS 指标 stacked bar(基线 ←→ 当前 · diff 徽章)
- 数据集 + 评测运行双列表

---

## 🔧 环境准备

### 依赖版本

| 依赖 | 版本 | 用途 |
|---|---|---|
| Next.js | 16.2 | App Router + Turbopack |
| React | 19.2 | UI |
| Tailwind | v4 | 样式 + @theme tokens |
| ReactFlow | 11.11 | DAG 画布 |
| Motion | 12.38 | 动效 |
| graphology + forceAtlas2 | 0.26 / 0.10 | 图记忆布局 |
| recharts | 3.8 | 部分图表(备用) |
| playwright | 1.59 | 自动截图 |

### `.env.example`

```bash
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxx
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
DEFAULT_CHAT_MODEL=anthropic/claude-haiku-4-5
FLAGSHIP_CHAT_MODEL=anthropic/claude-opus-4-7

NEXT_PUBLIC_MOCK_MODE=true
NEXT_PUBLIC_REAL_CHAT=true
```

---

## 🚀 本地启动

```bash
# 1. 安装
pnpm install

# 2. 配置
cp .env.example .env.local
# 填 OPENROUTER_API_KEY

# 3. 跑
pnpm dev
# → http://localhost:3240

# 4. 截图(可选)
node _docs/take-screenshots.mjs
```

### 端到端验收

```bash
# Landing
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3240/

# 全部 20 页
for p in / dashboard studio studio/patterns run trace/waterfall \
         skills mcp tools models memory knowledge eval trace \
         monitor teams audit deploy marketplace settings; do
  curl -s -o /dev/null -w "$p = %{http_code}\n" http://localhost:3240/$p
done

# SSE 真流式
curl -N -X POST -H 'Content-Type: application/json' \
  -d '{"query":"用一句话介绍 Agent Studio"}' \
  http://localhost:3240/api/chat | head -20
```

端口约定:**3240**(避开 3000 / 3210 case-01 / 3220 case-02 / 3230 case-03)

---

## 🌐 部署

### Vercel(推荐)

```bash
vercel --prod
# 在 Vercel Dashboard 配 env vars:
#   OPENROUTER_API_KEY, OPENROUTER_BASE_URL, DEFAULT_CHAT_MODEL
```

### Docker 自管

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile && pnpm build
EXPOSE 3240
CMD ["pnpm", "start"]
```

---

## 🛠️ 开发 / 扩展

### 加新页面

1. `src/app/{path}/page.tsx`
2. 用 `<PageShell title subtitle actions>...</PageShell>` 包装
3. 如需侧边栏入口 · 在 `components/layout/sidebar.tsx` 的 `groups` 加
4. 运行 `pnpm dev` 自动 hot reload

### 接真 MCP

1. 安装 MCP client SDK
2. `/api/mcp/tools` 列出 server 的工具
3. `/api/mcp/call` 转发 tool 调用
4. Studio 节点添加 "MCP" 种类即可拖拽

---

## 📚 背景

- **Anthropic Agent Skills**:https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- **MCP 协议**:https://modelcontextprotocol.io
- **LangGraph**:https://langchain-ai.github.io/langgraph
- **RAGAS**:https://docs.ragas.io
- **OpenRouter**:https://openrouter.ai

## 📄 License

MIT · 由「赋范空间 · 项目实战」出品
