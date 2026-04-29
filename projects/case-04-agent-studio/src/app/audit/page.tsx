"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import {
  Download,
  Filter,
  ScrollText,
  UserCog,
  Puzzle,
  Server,
  Cpu,
  Wrench,
  Brain,
  Shield,
  Key,
  Search,
  Activity,
} from "lucide-react";

const events = [
  { t: "15:42:18", actor: "muyu", action: "agent.create", target: "research-writer-v2", meta: "pattern: ReAct", icon: UserCog, color: "text-info" },
  { t: "15:38:04", actor: "Alice", action: "skill.install", target: "pdf-extract v2.1", meta: "scope: team", icon: Puzzle, color: "text-skill" },
  { t: "15:32:49", actor: "Bob", action: "model.switch", target: "claude-haiku-4-5 → gpt-5-mini", meta: "reason: cost", icon: Cpu, color: "text-model" },
  { t: "15:28:12", actor: "muyu", action: "mcp.enable", target: "@sentry/mcp-sentry", meta: "first connect", icon: Server, color: "text-mcp" },
  { t: "15:24:06", actor: "Carol", action: "tool.test", target: "web_search", meta: "query: test", icon: Wrench, color: "text-tool" },
  { t: "15:18:52", actor: "Bob", action: "memory.clear", target: "agent:sales-qualifier/session_*", meta: "compliance request", icon: Brain, color: "text-memory" },
  { t: "15:14:30", actor: "Alice", action: "role.grant", target: "Dan → Viewer", meta: "project: default", icon: Shield, color: "text-primary" },
  { t: "15:10:18", actor: "muyu", action: "key.rotate", target: "OPENROUTER_API_KEY", meta: "quarterly", icon: Key, color: "text-warning" },
  { t: "15:04:22", actor: "system", action: "agent.run", target: "research-writer · run_j2k7", meta: "ok · 3.28s · ¥0.128", icon: Activity, color: "text-success" },
  { t: "15:00:08", actor: "Bob", action: "skill.uninstall", target: "blog-writer v2.0.0", meta: "scope: personal", icon: Puzzle, color: "text-skill" },
  { t: "14:52:46", actor: "system", action: "mcp.degraded", target: "postgres-mcp", meta: "latency P95 > 800ms", icon: Server, color: "text-warning" },
  { t: "14:48:12", actor: "Alice", action: "eval.run", target: "rag-finance · v1.2", meta: "score: 0.87", icon: Activity, color: "text-eval" },
];

type ApiEvent = { ts: number; actor: string; action: string; target?: string; meta?: string; level?: string };

function iconFor(action: string): { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; color: string } {
  if (action.startsWith("skill.")) return { icon: Puzzle, color: "text-skill" };
  if (action.startsWith("mcp.")) return { icon: Server, color: "text-mcp" };
  if (action.startsWith("tool.")) return { icon: Wrench, color: "text-tool" };
  if (action.startsWith("memory.")) return { icon: Brain, color: "text-memory" };
  if (action.startsWith("agent.")) return { icon: Activity, color: "text-agent" };
  if (action.startsWith("knowledge.")) return { icon: Brain, color: "text-memory" };
  if (action.startsWith("provider.")) return { icon: Cpu, color: "text-model" };
  return { icon: UserCog, color: "text-info" };
}

function hhmmss(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export default function AuditPage() {
  const [real, setReal] = useState<ApiEvent[] | null>(null);

  useEffect(() => {
    fetch("/api/audit")
      .then((r) => r.json())
      .then((j) => {
        if (j.events?.length > 0) setReal(j.events);
      })
      .catch(() => {});
  }, []);

  const displayEvents = real
    ? real.slice(0, 30).map((e) => {
        const meta = iconFor(e.action);
        return { t: hhmmss(e.ts), actor: e.actor, action: e.action, target: e.target ?? "—", meta: e.meta ?? "", icon: meta.icon, color: meta.color };
      })
    : events;

  return (
    <PageShell
      title="Audit Logs"
      subtitle={real ? `真 · /api/audit · ${real.length} 条 · 近期事件` : "全部操作审计日志 · 演示数据"}
      actions={
        <>
          <Badge variant={real ? "success" : "warning"} className="text-[10px]">
            {real ? "● 真数据" : "◯ 演示数据"}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => notify.todo("按 actor / action / time range 过滤")}>
            <Filter className="w-3.5 h-3.5" /> 过滤
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const rows = displayEvents.map((e) => `${e.t},${e.actor},${e.action},${e.target},${e.meta}`).join("\n");
              const csv = "time,actor,action,target,meta\n" + rows;
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `audit-${Date.now()}.csv`; a.click();
              URL.revokeObjectURL(url);
              notify.ok(`已导出 ${displayEvents.length} 条 audit.csv`);
            }}
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
          <Button size="sm" onClick={() => notify.ok("合规报告生成中", "约 30s · 包含 SOC2 / GDPR 映射 · 完成后邮件送达")}>
            <Download className="w-3.5 h-3.5" /> 合规报告 PDF
          </Button>
        </>
      }
    >
      {/* Filter */}
      <div className="mb-4 rounded-xl border border-border bg-surface p-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-mute" />
          <input
            placeholder="搜索 actor / action / target..."
            className="w-full h-9 pl-9 pr-3 text-[13px] rounded-md border border-border bg-surface focus:outline-none focus:border-primary/40"
          />
        </div>
        {["actor", "action", "date range", "level"].map((l) => (
          <button
            key={l}
            onClick={() => notify.todo(`按 ${l} 过滤 · 下拉选项展开`)}
            className="h-9 px-3 rounded-md border border-border bg-surface text-[12px] text-ink-soft hover:bg-elevated"
          >
            {l} <span className="text-ink-mute ml-1">▾</span>
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { l: "今日事件", v: "384" },
          { l: "独立操作者", v: "12" },
          { l: "高危操作", v: "2" },
          { l: "系统自动", v: "128" },
        ].map((s) => (
          <div key={s.l} className="rounded-xl border border-border bg-surface p-4">
            <div className="text-[11px] text-ink-mute">{s.l}</div>
            <div className="text-[22px] font-bold font-mono text-ink">{s.v}</div>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
          <h3 className="text-[13px] font-semibold flex items-center gap-2">
            <ScrollText className="w-3.5 h-3.5 text-ink-soft" />
            事件时间轴 · 近 1 小时
          </h3>
          <Badge variant="mono" className="text-[10px]">{displayEvents.length} 条</Badge>
        </div>
        <ul className="divide-y divide-border-subtle">
          {displayEvents.map((e, i) => {
            const Icon = e.icon;
            return (
              <li key={i} className="px-5 py-3 flex items-start gap-3 hover:bg-elevated/30 transition-colors">
                <div className="text-[10.5px] font-mono text-ink-mute pt-1 w-[68px] shrink-0">{e.t}</div>
                <Icon className={`w-4 h-4 mt-0.5 ${e.color} shrink-0`} strokeWidth={1.8} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap text-[12.5px]">
                    <span className="font-semibold text-ink">{e.actor}</span>
                    <span className="font-mono text-ink-mute">·</span>
                    <code className={`font-mono text-[11.5px] ${e.color}`}>{e.action}</code>
                    <span className="text-ink-mute">→</span>
                    <span className="font-mono text-[12px] text-ink-soft truncate">{e.target}</span>
                  </div>
                  <div className="text-[11px] text-ink-mute mt-0.5 font-mono">{e.meta}</div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </PageShell>
  );
}
