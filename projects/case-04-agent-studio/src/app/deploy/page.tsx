"use client";

import { useState } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import { Rocket, Globe, Webhook, Code, Copy, CheckCircle2, Terminal, Play } from "lucide-react";

type Mode = "api" | "webhook" | "embed";

export default function DeployPage() {
  const [mode, setMode] = useState<Mode>("api");
  return (
    <PageShell
      title="Deploy & API"
      subtitle="把 Agent 发布为 HTTP API / Webhook / Embed 组件 · 一键生成 code snippet + 密钥"
      actions={
        <Button size="sm" onClick={() => notify.ok("已发布 v1.3.0 → production", "3 区域多活 · SSE endpoint 已预热")}>
          <Rocket className="w-3.5 h-3.5" /> 发布新版本
        </Button>
      }
    >
      {/* 选择部署模式 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        {([
          { id: "api" as const, icon: Globe, label: "HTTP API", sub: "REST endpoint · Bearer auth · streaming", color: "text-info", tint: "bg-[hsl(210_75%_96%)]" },
          { id: "webhook" as const, icon: Webhook, label: "Webhook", sub: "事件触发 · HMAC 签名 · 重试策略", color: "text-model", tint: "bg-[hsl(38_85%_95%)]" },
          { id: "embed" as const, icon: Code, label: "Embed Widget", sub: "iframe / web component · 主题可配", color: "text-skill", tint: "bg-[hsl(320_50%_96%)]" },
        ]).map((m) => {
          const Icon = m.icon;
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`rounded-xl p-5 text-left transition-all ${
                active
                  ? `border-primary bg-primary-tint/50 shadow-sm border`
                  : `border border-border bg-surface hover:border-ink-mute hover:-translate-y-0.5`
              }`}
            >
              <Icon className={`w-6 h-6 mb-3 ${active ? "text-primary" : m.color}`} strokeWidth={1.6} />
              <div className="text-[15px] font-semibold mb-1">{m.label}</div>
              <div className="text-[12px] text-ink-soft">{m.sub}</div>
            </button>
          );
        })}
      </div>

      {/* 具体内容 */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4">
        {mode === "api" && <APISnippet />}
        {mode === "webhook" && <WebhookSnippet />}
        {mode === "embed" && <EmbedSnippet />}

        {/* 右侧部署信息 */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute mb-2">当前版本</div>
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-[24px] font-bold font-mono">v1.2.0</span>
              <Badge variant="success" className="text-[10px]">production</Badge>
            </div>
            <ul className="space-y-2 text-[12px] text-ink-soft">
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-success" /> 3 个区域多活 · 香港 · 新加坡 · 东京</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-success" /> 速率限制 1000 RPS · 按 key</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-success" /> OpenAPI 3.1 schema 自动生成</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-success" /> SSE 支持 · 自动分片</li>
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute mb-2">密钥管理</div>
            <div className="space-y-2 text-[12px]">
              {[
                { name: "production", key: "sk_live_...eaf9", used: "1.28M calls", exp: "—" },
                { name: "staging", key: "sk_test_...a1b2", used: "42K calls", exp: "90 天" },
              ].map((k) => (
                <div key={k.name} className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border-subtle">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-medium">{k.name}</span>
                      <span className="font-mono text-ink-mute text-[11px]">{k.key}</span>
                    </div>
                    <div className="text-[10px] text-ink-mute font-mono">{k.used}</div>
                  </div>
                  <button
                    className="p-1 rounded hover:bg-elevated text-ink-mute"
                    onClick={() => {
                      navigator.clipboard.writeText(k.key.replace("…", "••••••••"));
                      notify.ok(`${k.name} 密钥已复制`);
                    }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              className="mt-3 w-full h-8 rounded-md text-[12px] border border-dashed border-border hover:border-ink-mute transition-colors"
              onClick={() => {
                const k = `sk_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
                navigator.clipboard.writeText(k);
                notify.ok(`✅ 新 key 已生成并复制`, k);
              }}
            >
              + 生成新 key
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function APISnippet() {
  return (
    <CodeBlock
      title="curl · 调用 agent"
      files={{
        curl: `curl -N https://api.agent-studio.dev/v1/agents/research-writer/run \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "input": "OpenClaw 的 memory 架构怎么分层?",
    "stream": true
  }'

# 返回 SSE 流:
# data: {"type":"token","delta":"OpenClaw"}
# data: {"type":"tool_call","name":"web_search"}
# data: {"type":"done","usage":{"tokens":1284}}`,
        python: `from agent_studio import Client

client = Client(api_key="sk_live_...")
stream = client.agents.run(
    "research-writer",
    input="OpenClaw 的 memory 架构怎么分层?",
    stream=True,
)

for event in stream:
    if event.type == "token":
        print(event.delta, end="", flush=True)
    elif event.type == "tool_call":
        print(f"\\n[tool] {event.name}")`,
        nodejs: `import { Client } from "@agent-studio/sdk";

const client = new Client({ apiKey: "sk_live_..." });
const stream = await client.agents.run("research-writer", {
  input: "OpenClaw 的 memory 架构怎么分层?",
  stream: true,
});

for await (const event of stream) {
  if (event.type === "token") process.stdout.write(event.delta);
}`,
      }}
    />
  );
}

function WebhookSnippet() {
  return (
    <CodeBlock
      title="Webhook 接收端"
      files={{
        verify: `# Express (Node.js) · 验证 HMAC 签名
import crypto from "node:crypto";

app.post("/webhook/agent-studio", (req, res) => {
  const sig = req.headers["x-agent-signature"];
  const expected = crypto
    .createHmac("sha256", process.env.WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (sig !== expected) return res.status(401).send("invalid sig");

  // 处理事件 · agent.completed / agent.failed / skill.installed
  const { event, data } = req.body;
  console.log(\`[webhook] \${event}\`, data);
  res.json({ ok: true });
});`,
        events: `// 事件类型
agent.started          // agent 开始执行
agent.tool_call        // 工具调用触发
agent.step_completed   // 单步完成
agent.completed        // 全部完成 · 含 usage
agent.failed           // 失败 · 含 error

skill.installed        // skill 安装
mcp.health_changed     // MCP 健康状态变化

eval.completed         // 评测完成 · 含 score`,
      }}
    />
  );
}

function EmbedSnippet() {
  return (
    <CodeBlock
      title="Embed Widget"
      files={{
        html: `<!-- 单行引入 · 放任何页面 -->
<script src="https://cdn.agent-studio.dev/embed.js"
        data-agent="research-writer"
        data-token="pub_live_..."
        data-theme="light"
        async></script>

<!-- 或手动控制 -->
<div id="agent-chat" style="width: 400px; height: 600px;"></div>
<script>
  AgentStudio.mount("#agent-chat", {
    agent: "research-writer",
    token: "pub_live_...",
    theme: "light",
    placeholder: "问我任何问题..."
  });
</script>`,
        react: `import { AgentChat } from "@agent-studio/react";

export default function Support() {
  return (
    <AgentChat
      agent="research-writer"
      token={process.env.NEXT_PUBLIC_AGENT_TOKEN}
      theme="light"
      className="w-[400px] h-[600px] rounded-xl"
    />
  );
}`,
      }}
    />
  );
}

function CodeBlock({ title, files }: { title: string; files: Record<string, string> }) {
  const tabs = Object.keys(files);
  const [active, setActive] = useState(tabs[0]);
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px] font-semibold">
          <Terminal className="w-3.5 h-3.5 text-ink-mute" />
          {title}
        </div>
        <button
          onClick={() => {
            navigator.clipboard.writeText(files[active]);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex items-center gap-1 text-[11px] text-ink-mute hover:text-ink"
        >
          {copied ? <CheckCircle2 className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <div className="flex gap-0 border-b border-border-subtle bg-elevated/30">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setActive(t)}
            className={`px-4 py-1.5 text-[11.5px] font-mono transition-colors ${
              active === t ? "text-primary border-b-2 border-primary -mb-px" : "text-ink-soft hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <pre className="p-4 text-[11.5px] font-mono text-ink-soft leading-relaxed overflow-x-auto bg-elevated/20 min-h-[320px]">
        {files[active]}
      </pre>
      <div className="px-4 py-2 border-t border-border-subtle flex items-center justify-between bg-surface">
        <span className="text-[11px] text-ink-mute font-mono">Try in Playground →</span>
        <Button size="sm" variant="outline" className="text-[11px]" onClick={() => notify.ok("代码片段已复制 · 可直接 curl / node 运行")}>
          <Play className="w-3 h-3" /> 运行
        </Button>
      </div>
    </div>
  );
}
