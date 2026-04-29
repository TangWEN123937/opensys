# Agent Studio · 测试用例

> 访问地址:**http://localhost:3240**
>
> 跑本文档前:`pnpm dev` 启动 · OpenRouter key 已配(`.env.local`)

---

## 🧪 Layer 1 · curl 后端(10 秒 · 一键跑完)

### 1.1 · 全部 API 健康检查

```bash
cd /Users/muyu/MuyuWorkSpace/FF-SaaSBuilder/examples/case-04-agent-studio

for ep in skills mcp tools knowledge memory models audit; do
  curl -s -o /dev/null -w "/api/$ep → %{http_code}\n" http://localhost:3240/api/$ep
done
```

**期望**: 7 行全部 `200`

### 1.2 · 逐接口真数据验证

```bash
# Skills · 扫 .skills/ 三个真 SKILL.md
curl -s http://localhost:3240/api/skills | python3 -m json.tool | head -20
# 期望: skills 数组 >= 3 条 · 含 pdf-extract / kpi-analyst / code-review-guide

# Tools · calc 真算
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"name":"calc","input":{"expr":"(3+4)*5-10"}}' \
  http://localhost:3240/api/tools
# 期望: {"ok":true,"name":"calc","result":{"value":25},"ms":0}

# Tools · uuid 真生成
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"name":"uuid_gen","input":{"n":3}}' \
  http://localhost:3240/api/tools
# 期望: result.uuids 数组 3 个真 UUID v4

# Tools · web_search 真调 DuckDuckGo
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"name":"web_search","input":{"query":"Model Context Protocol"}}' \
  http://localhost:3240/api/tools --max-time 10
# 期望: result.abstract 或 related 数组非空 · ms > 100

# MCP · 10 个 server 列表
curl -s http://localhost:3240/api/mcp | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'{len(d[\"servers\"])} servers · {sum(1 for s in d[\"servers\"] if s[\"installed\"])} installed')"
# 期望: 10 servers · 3 installed(filesystem/brave-search/github)

# Knowledge · ingest + search
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"text":"OpenClaw 的 memory 架构分 4 层","source":"test"}' \
  http://localhost:3240/api/knowledge
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"query":"memory 架构","topK":3}' \
  http://localhost:3240/api/knowledge/search
# 期望: vector/bm25/hybrid 三数组 · 每个至少 1 条 · 含 OpenClaw

# Memory · save + read
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"action":"save_fact","key":"user.name","value":"muyu","category":"entity"}' \
  http://localhost:3240/api/memory
curl -s http://localhost:3240/api/memory | python3 -m json.tool | head -20
# 期望: facts 数组含 user.name = muyu

# Models · 真连通 OpenRouter
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"provider":"openrouter"}' \
  http://localhost:3240/api/models/test --max-time 10
# 期望: {"ok":true,"models":346+,"ms":<3000}

# Chat · SSE 流式
curl -sN -X POST -H 'Content-Type: application/json' \
  -d '{"query":"用一句话介绍 Agent Studio"}' \
  http://localhost:3240/api/chat --max-time 20 | head -10
# 期望: data: {"type":"start"} + 若干 token + done

# Agents · Agent run SSE
curl -sN -X POST -H 'Content-Type: application/json' \
  -d '{"pattern":"react","query":"1+1 等于几"}' \
  http://localhost:3240/api/agents/run --max-time 30 | head -20
# 期望: span_start/span_end 交替 + token + run_end

# Audit · 查日志
curl -s http://localhost:3240/api/audit | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'{len(d[\"events\"])} events'); print(*[f'{e[\"actor\"]}.{e[\"action\"]}' for e in d['events'][:5]], sep='\\n')"
# 期望: events 数组(上面操作都记录) · 含 tool.calc / knowledge.ingest / memory.save_fact 等
```

---

## 🧑‍💻 Layer 2 · 浏览器手动点击(5 分钟核心路径)

### 测试 A · Skills Hub · install/uninstall 交互

1. 打开 http://localhost:3240/skills
2. **看**:顶部应有绿色 `● 真数据` 徽章 · 列表含 3 张卡(pdf-extract / kpi-analyst / code-review-guide)
3. **点** pdf-extract 卡 → 右侧 SKILL.md 真内容弹出
4. **点** 右侧"安装到当前 Agent"按钮
5. **看**:左侧卡片状态 `未装` → `已装` 即时变化
6. **验证持久化**:刷新页面 F5 → 状态仍是"已装"
7. **点** 右侧"卸载"按钮
8. **看**:状态回到"未装"

✅ 通过条件:徽章、真 SKILL.md、install 持久化、卸载可逆

### 测试 B · Tools Registry · calc playground

1. 打开 http://localhost:3240/tools
2. **点** 左侧列表的 `calc` 工具
3. **看**:右下角 input 变成 `{"expr": "(3+4)*5-10"}`
4. **点** 右下角"运行"按钮
5. **看**:右侧 response 显示 `{"value": 25}` · 顶部标 `200 · Xms` 绿色 · 标 `(真 API)`
6. **点** 左侧 `uuid_gen`
7. **改** input 为 `{"n": 5}`
8. **点** 运行
9. **看**:response 5 个真 UUID v4(每次不同)

✅ 通过条件:calc 出 25 · uuid 5 个真 v4 · 延迟有数值

### 测试 C · Tools · web_search 真调

1. `/tools` → **点** `web_search`
2. input 默认 `{"query": "Model Context Protocol MCP"}`
3. **点** 运行(等 1-3 秒)
4. **看**:response 含 `abstract` 或 `related` 数组 · 真来自 DuckDuckGo

✅ 通过条件:有真搜索结果非空

### 测试 D · Knowledge · ingest + hybrid 检索

1. 打开 http://localhost:3240/knowledge
2. **点** 顶部"上传文档"
3. **选** 一个 `.md` 或 `.txt` 文件(可用 `README.md`)
4. **看** alert:`入库成功 · N chunks · 总 N`
5. 检索框默认"OpenClaw 的 memory 架构是怎么分层?"
6. **点** "检索"按钮
7. **看**:
   - 顶部绿色 `真结果` 徽章出现
   - 左列 Vector / 中列 BM25 / 右列 Hybrid 三路召回都有真结果
   - 每条 chunk 带 source 名 + score

✅ 通过条件:三路召回显示真数据 + `真结果` 徽章

### 测试 E · Memory · 长期 facts

1. 打开 http://localhost:3240/memory
2. **点** "长期记忆" tab
3. **看**:表格含 `user.lang`, `user.tz`, `project.stack`, `user.name` 等真 facts
4. **点** 右上"清空" → 确认
5. **看**:表格清空 · 刷新页面仍空 · 说明真写入

✅ 通过条件:表格真数据 + 徽章 `● 真数据` + 清空持久

### 测试 F · MCP · install/uninstall

1. 打开 http://localhost:3240/mcp
2. **看**:表格 10 个 server · `filesystem/brave-search/github` 显示绿点健康
3. **点** `postgres` 那行的"启用"按钮
4. **看**:状态变 `healthy` · call/延迟数值变化
5. **点** 同行"关闭" → 状态变 `off`

✅ 通过条件:真 POST /api/mcp · 切换可见

### 测试 G · Audit · 真操作日志

1. 做完 A-F 各项操作
2. 打开 http://localhost:3240/audit
3. **看**:时间轴流包含:
   - `skill.install pdf-extract`
   - `tool.calc` / `tool.uuid_gen` / `tool.web_search`
   - `knowledge.ingest` / `knowledge.search`
   - `memory.save_fact` / `memory.clear`
   - `mcp.install postgres` 等

✅ 通过条件:上面每个操作都有一条真日志(带时间戳)

---

## 🤖 Layer 3 · playwright 自动化(1 个命令 3 分钟)

```bash
cd /Users/muyu/MuyuWorkSpace/FF-SaaSBuilder/examples/case-04-agent-studio
node _docs/verify.mjs
```

**期望输出**:

```
=== Playwright 三段验证 ===
  ✓ Skills Hub · 真数据 badge + 3 条 skill
  ✓ Skills · install/uninstall 切换
  ✓ Tools · calc playground 真跑
  ✓ Knowledge · 真搜索 · 显示真结果
  ✓ Memory · 长期 tab 显示真 facts
  ✓ Audit · 真事件流
  ✓ Agents · /api/agents/run SSE 流完成

=== summary ===
7 / 7 通过
```

---

## 📊 测试用例矩阵汇总

| 测试 | Layer 1 curl | Layer 2 手动点击 | Layer 3 playwright |
|---|---|---|---|
| Skills 列表 + install | ✓ | ✓ | ✓ |
| Tools 4 工具真跑 | ✓ | ✓ | ✓(calc) |
| Knowledge ingest + search | ✓ | ✓ | ✓(search) |
| Memory facts CRUD | ✓ | ✓ | ✓ |
| MCP install/uninstall | ✓ | ✓ | ─ |
| Audit 事件流 | ✓ | ✓ | ✓ |
| Models provider 连通 | ✓ | ─ | ─ |
| Chat SSE | ✓ | ─ | ─ |
| Agents run SSE | ✓ | ─ | ✓ |

---

## 🐛 排查提示

### 所有页面都 "演示数据" 徽章

- 后端没起 / 端口不是 3240 → `pnpm dev`
- `.env.local` 没有 `OPENROUTER_API_KEY` → 复制 `.env.example` 配置

### `/api/models/test` 返回 501 或 error

- env 里 `OPENROUTER_API_KEY` 还是 `xxxxx` 占位符 → 填真 key

### Skills 列表为空

- `.skills/` 目录没有子目录 · 检查 `pdf-extract/SKILL.md` 等文件存在

### Audit 日志为空

- 先做任一 Layer 2 测试(A-F)· 日志才会产生(从 `data/audit.jsonl` 读)

### Knowledge 搜索无结果

- 先 "上传文档" 或 curl ingest 过一次 · `data/knowledge.json` 才有 chunks

---

## 🧹 清理本地数据(回到初始状态)

```bash
rm -rf data/
# 所有 mcp-installed / skills-installed / memory / knowledge / audit 清零
```
