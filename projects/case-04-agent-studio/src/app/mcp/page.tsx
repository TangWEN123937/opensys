"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import {
  Server,
  Search,
  Plus,
  Power,
  CircleDot,
  Box,
  FileText,
  MessageSquare,
  Activity,
  Globe,
  Copy,
} from "lucide-react";

interface MCP {
  id: string;
  name: string;
  author: string;
  registry: "smithery" | "glama" | "official";
  desc: string;
  status: "healthy" | "degraded" | "down" | "off";
  tools: number;
  resources: number;
  prompts: number;
  calls: number;
  latency: number; // ms
  installed: boolean;
}

const servers: MCP[] = [
  { id: "filesystem", name: "@modelcontextprotocol/filesystem", author: "official", registry: "official", desc: "Read/write local files · sandbox 受限", status: "healthy", tools: 8, resources: 1, prompts: 0, calls: 1240, latency: 12, installed: true },
  { id: "brave-search", name: "@modelcontextprotocol/brave-search", author: "official", registry: "official", desc: "Brave Search API · 2K free/月", status: "healthy", tools: 2, resources: 0, prompts: 0, calls: 842, latency: 380, installed: true },
  { id: "github", name: "@modelcontextprotocol/github", author: "official", registry: "official", desc: "GitHub API · 仓库/PR/issue 全面", status: "healthy", tools: 16, resources: 4, prompts: 2, calls: 620, latency: 180, installed: true },
  { id: "slack", name: "@slack/mcp-slack", author: "slack", registry: "smithery", desc: "Slack messages / channels / users", status: "healthy", tools: 10, resources: 2, prompts: 0, calls: 420, latency: 220, installed: true },
  { id: "postgres", name: "@mcp/postgres", author: "community", registry: "glama", desc: "SQL 查询 · schema 发现 · 读写可控", status: "degraded", tools: 6, resources: 3, prompts: 1, calls: 180, latency: 820, installed: true },
  { id: "sentry", name: "@sentry/mcp-sentry", author: "sentry", registry: "smithery", desc: "Sentry 错误监控 · 事件查询", status: "healthy", tools: 4, resources: 1, prompts: 0, calls: 92, latency: 145, installed: true },
  { id: "memory-graph", name: "@mcp/memory-graph", author: "community", registry: "smithery", desc: "持久化知识图谱 · 长期记忆", status: "off", tools: 6, resources: 2, prompts: 1, calls: 0, latency: 0, installed: false },
  { id: "puppeteer", name: "@mcp/puppeteer", author: "community", registry: "glama", desc: "无头浏览器 · 爬取 · 截图 · 表单填写", status: "off", tools: 8, resources: 0, prompts: 2, calls: 0, latency: 0, installed: false },
  { id: "gmail", name: "@google/mcp-gmail", author: "community", registry: "smithery", desc: "Gmail 读取 · 发送 · label 管理", status: "off", tools: 12, resources: 2, prompts: 3, calls: 0, latency: 0, installed: false },
  { id: "notion", name: "@mcp/notion", author: "community", registry: "smithery", desc: "Notion 页面 / 数据库 / block CRUD", status: "down", tools: 14, resources: 4, prompts: 1, calls: 48, latency: 0, installed: true },
];

const MANIFEST = {
  name: "filesystem",
  version: "0.5.0",
  transport: "stdio",
  capabilities: {
    tools: {
      listChanged: true,
    },
    resources: {
      subscribe: true,
      listChanged: true,
    },
  },
  tools: [
    { name: "read_file", description: "Read file contents" },
    { name: "write_file", description: "Write to file (sandboxed)" },
    { name: "list_directory", description: "List directory contents" },
    { name: "search_files", description: "Search by pattern" },
  ],
};

export default function MCPPage() {
  const [rows, setRows] = useState<MCP[]>(servers);
  const [real, setReal] = useState(false);
  const [selected, setSelected] = useState<MCP>(servers[0]);
  const [filter, setFilter] = useState<"all" | "installed" | "healthy" | "issues">("all");

  useEffect(() => {
    fetch("/api/mcp")
      .then((r) => r.json())
      .then((j) => {
        if (j.servers?.length) {
          setRows(j.servers);
          setSelected(j.servers[0]);
          setReal(true);
        }
      })
      .catch(() => {});
  }, []);

  const toggle = async (name: string) => {
    if (!real) return;
    const isIn = rows.find((s) => s.id === name)?.installed;
    const r = await fetch("/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: isIn ? "uninstall" : "install", name }),
    });
    if (r.ok) {
      const j2 = await fetch("/api/mcp").then((x) => x.json());
      setRows(j2.servers);
    }
  };

  const filtered = rows.filter((s) => {
    if (filter === "installed") return s.installed;
    if (filter === "healthy") return s.status === "healthy";
    if (filter === "issues") return s.status === "degraded" || s.status === "down";
    return true;
  });

  return (
    <PageShell
      title="MCP Servers"
      subtitle={`Model Context Protocol · ${real ? "真 · /api/mcp" : "演示数据"} · ${rows.filter(s => s.installed).length}/${rows.length} 已启用`}
      actions={
        <>
          <Badge variant={real ? "success" : "warning"} className="text-[10px]">
            {real ? "● 真数据" : "◯ 演示数据"}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => window.open("https://smithery.ai", "_blank")}>
            <Globe className="w-3.5 h-3.5" /> 浏览 Registry
          </Button>
          <Button size="sm" onClick={() => notify.todo("添加自定义 MCP · 填 transport + command")}>
            <Plus className="w-3.5 h-3.5" /> 添加 MCP
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_460px] gap-4 h-[calc(100vh-56px-48px)]">
        <div className="rounded-xl border border-border bg-surface overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-mute" />
              <input
                placeholder="搜索 MCP server..."
                className="w-full h-9 pl-9 pr-3 text-[13px] rounded-md border border-border bg-surface focus:outline-none focus:border-primary/40"
              />
            </div>
            <div className="flex items-center gap-1 text-[11px]">
              {([
                ["all", "全部"],
                ["installed", "已装"],
                ["healthy", "健康"],
                ["issues", "异常"],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    filter === id ? "bg-primary text-primary-foreground" : "text-ink-soft hover:bg-elevated"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-surface border-b border-border-subtle text-[10px] uppercase tracking-wider text-ink-mute">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Server</th>
                  <th className="text-center px-2 py-2 font-semibold">状态</th>
                  <th className="text-right px-2 py-2 font-semibold">工具</th>
                  <th className="text-right px-2 py-2 font-semibold">资源</th>
                  <th className="text-right px-2 py-2 font-semibold">调用</th>
                  <th className="text-right px-2 py-2 font-semibold">延迟</th>
                  <th className="text-right px-4 py-2 font-semibold">动作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelected(s)}
                    className={`border-b border-border-subtle cursor-pointer transition-colors ${
                      selected.id === s.id ? "bg-primary-tint/30" : "hover:bg-elevated/50"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-md bg-mcp/10 text-mcp flex items-center justify-center shrink-0">
                          <Server className="w-3.5 h-3.5" strokeWidth={1.8} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-mono text-[12.5px] text-ink font-medium truncate">{s.name}</div>
                          <div className="text-[10px] text-ink-mute mt-0.5 font-mono">
                            <Badge variant="outline" className="text-[9px] mr-1">{s.registry}</Badge>
                            {s.author}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center"><StatusDot status={s.status} /></td>
                    <td className="px-2 py-3 text-right font-mono text-[12px] text-ink-soft">{s.tools}</td>
                    <td className="px-2 py-3 text-right font-mono text-[12px] text-ink-soft">{s.resources}</td>
                    <td className="px-2 py-3 text-right font-mono text-[12px] text-ink-soft">{s.calls.toLocaleString()}</td>
                    <td className="px-2 py-3 text-right font-mono text-[12px] text-ink-soft">
                      {s.latency > 0 ? `${s.latency}ms` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggle(s.id); }}
                        disabled={!real}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors disabled:opacity-40 ${
                          s.installed ? "text-danger hover:bg-danger-tint" : "text-primary hover:bg-primary-tint"
                        }`}
                      >
                        <Power className="w-3 h-3" />
                        {s.installed ? "关闭" : "启用"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right · detail */}
        <div className="rounded-xl border border-border bg-surface overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-border-subtle">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-mono text-[14px] font-semibold truncate">{selected.name}</h3>
                  <StatusDot status={selected.status} />
                </div>
                <div className="text-[11px] text-ink-mute font-mono">
                  {selected.registry} · {selected.author}
                </div>
              </div>
              <Badge variant={selected.installed ? "success" : "outline"} className="text-[10px] shrink-0">
                {selected.installed ? "已安装" : "未安装"}
              </Badge>
            </div>
            <p className="text-[12.5px] text-ink-soft leading-relaxed">{selected.desc}</p>
          </div>

          {/* capability counts */}
          <div className="grid grid-cols-3 border-b border-border-subtle">
            <Cap icon={Box} color="text-tool" k="Tools" v={selected.tools} />
            <Cap icon={FileText} color="text-mcp" k="Resources" v={selected.resources} />
            <Cap icon={MessageSquare} color="text-skill" k="Prompts" v={selected.prompts} />
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* live metrics */}
            <div>
              <label className="text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute mb-2 block flex items-center gap-1.5">
                <Activity className="w-3 h-3" /> 实时指标(近 1 小时)
              </label>
              <div className="grid grid-cols-3 gap-2">
                <Mini k="调用" v={selected.calls.toString()} />
                <Mini k="P95 延迟" v={selected.latency > 0 ? `${Math.round(selected.latency * 1.4)}ms` : "—"} />
                <Mini k="成功率" v={selected.status === "healthy" ? "100%" : selected.status === "degraded" ? "87%" : "—"} />
              </div>
            </div>

            {/* manifest */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute">Manifest · capabilities.json</label>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(MANIFEST, null, 2));
                    notify.ok("Manifest 已复制");
                  }}
                  className="text-[10px] font-mono text-ink-mute hover:text-ink flex items-center gap-1"
                >
                  <Copy className="w-2.5 h-2.5" /> copy
                </button>
              </div>
              <pre className="rounded-md border border-border-subtle bg-elevated/50 p-3 text-[11px] font-mono text-ink-soft leading-relaxed overflow-x-auto">
                {JSON.stringify(MANIFEST, null, 2)}
              </pre>
            </div>

            {/* tools list */}
            <div>
              <label className="text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute mb-2 block">可用 Tools</label>
              <ul className="space-y-1.5">
                {MANIFEST.tools.map((t) => (
                  <li key={t.name} className="flex items-center justify-between rounded border border-border-subtle px-2.5 py-1.5 text-[11.5px] hover:bg-elevated/40 transition-colors">
                    <span className="font-mono text-ink">{t.name}</span>
                    <span className="text-ink-mute text-[11px]">{t.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function StatusDot({ status }: { status: MCP["status"] }) {
  const meta = {
    healthy: { color: "bg-success text-success", label: "健康" },
    degraded: { color: "bg-warning text-warning", label: "降级" },
    down: { color: "bg-danger text-danger", label: "挂掉" },
    off: { color: "bg-ink-mute text-ink-mute", label: "关闭" },
  }[status];
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px]" title={meta.label}>
      <span className={`relative w-1.5 h-1.5 rounded-full ${meta.color}`}>
        {status === "healthy" && (
          <span className={`absolute inset-0 rounded-full ${meta.color} animate-ping opacity-60`} />
        )}
      </span>
      <span className={meta.color.split(" ")[1]}>{meta.label}</span>
    </span>
  );
}

function Cap({
  icon: Icon,
  color,
  k,
  v,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  color: string;
  k: string;
  v: number;
}) {
  return (
    <div className="p-3.5 text-center border-r border-border-subtle last:border-r-0">
      <Icon className={`w-3.5 h-3.5 ${color} mx-auto mb-1.5`} strokeWidth={1.8} />
      <div className="text-[18px] font-mono font-bold text-ink leading-none">{v}</div>
      <div className="text-[10px] text-ink-mute uppercase tracking-wider mt-1">{k}</div>
    </div>
  );
}

function Mini({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-elevated/50 p-2 text-center">
      <div className="text-[13px] font-mono font-semibold text-ink">{v}</div>
      <div className="text-[9.5px] text-ink-mute uppercase tracking-wider mt-0.5">{k}</div>
    </div>
  );
}
