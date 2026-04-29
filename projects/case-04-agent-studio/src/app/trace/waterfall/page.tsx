"use client";

import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import {
  ChevronDown,
  ChevronRight,
  Cpu,
  Wrench,
  Puzzle,
  Server,
  Brain,
  CheckCircle2,
  Download,
  Share2,
  RotateCcw,
  Copy,
  Zap,
} from "lucide-react";

type SpanKind = "agent" | "llm" | "tool" | "skill" | "mcp" | "memory";

interface Span {
  id: string;
  name: string;
  kind: SpanKind;
  start: number; // ms from 0
  duration: number; // ms
  tokens?: number;
  cost?: number;
  status: "ok" | "error";
  children?: Span[];
  detail?: string;
}

const kindMeta: Record<SpanKind, { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; color: string; hex: string }> = {
  agent: { icon: Brain, color: "text-agent", hex: "hsl(222 60% 40%)" },
  llm: { icon: Cpu, color: "text-model", hex: "hsl(38 85% 48%)" },
  tool: { icon: Wrench, color: "text-tool", hex: "hsl(185 65% 42%)" },
  skill: { icon: Puzzle, color: "text-skill", hex: "hsl(320 50% 48%)" },
  mcp: { icon: Server, color: "text-mcp", hex: "hsl(155 50% 38%)" },
  memory: { icon: Brain, color: "text-memory", hex: "hsl(25 75% 48%)" },
};

const TOTAL = 3280;

const trace: Span[] = [
  {
    id: "s0",
    name: "research-writer.run()",
    kind: "agent",
    start: 0,
    duration: TOTAL,
    tokens: 8420,
    cost: 0.128,
    status: "ok",
    detail: "ReAct · 7 iterations",
    children: [
      {
        id: "s1",
        name: "memory.recall(query)",
        kind: "memory",
        start: 20,
        duration: 145,
        status: "ok",
        detail: "last 10 turns · 3 hits",
      },
      {
        id: "s2",
        name: "claude-haiku.plan()",
        kind: "llm",
        start: 170,
        duration: 610,
        tokens: 1280,
        cost: 0.018,
        status: "ok",
        detail: "thought: need web + pdf",
      },
      {
        id: "s3",
        name: "tool.web_search",
        kind: "tool",
        start: 800,
        duration: 980,
        status: "ok",
        detail: "10 results · 312KB",
        children: [
          {
            id: "s3.1",
            name: "mcp://search/brave",
            kind: "mcp",
            start: 850,
            duration: 880,
            status: "ok",
            detail: "brave-search · 10 hits",
          },
        ],
      },
      {
        id: "s4",
        name: "skill.pdf-extract",
        kind: "skill",
        start: 1820,
        duration: 620,
        status: "ok",
        detail: "SKILL.md pdf-extract-v2.1",
        children: [
          {
            id: "s4.1",
            name: "bash: python extract.py",
            kind: "tool",
            start: 1880,
            duration: 520,
            status: "ok",
            detail: "14 pages · 4620 tokens",
          },
        ],
      },
      {
        id: "s5",
        name: "claude-haiku.synthesize()",
        kind: "llm",
        start: 2460,
        duration: 740,
        tokens: 2820,
        cost: 0.042,
        status: "ok",
        detail: "streaming · 118 tokens",
      },
      {
        id: "s6",
        name: "memory.save()",
        kind: "memory",
        start: 3210,
        duration: 55,
        status: "ok",
        detail: "persisted to vector + graph",
      },
    ],
  },
];

// flatten
function flatten(nodes: Span[], depth = 0): Array<Span & { depth: number }> {
  const out: Array<Span & { depth: number }> = [];
  for (const n of nodes) {
    out.push({ ...n, depth });
    if (n.children) out.push(...flatten(n.children, depth + 1));
  }
  return out;
}

export default function TraceWaterfallPage() {
  const flat = flatten(trace);

  return (
    <PageShell
      title="Trace Waterfall"
      subtitle="run_j2k7 · research-writer · ReAct · 总耗时 3.28s"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => notify.ok("重新执行 run_j2k7", "跳转 Run Console 观察")}>
            <RotateCcw className="w-3.5 h-3.5" /> 重放
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(trace, null, 2));
              notify.ok("JSON 已复制到剪贴板");
            }}
          >
            <Copy className="w-3.5 h-3.5" /> 复制 JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              notify.ok("分享链接已复制");
            }}
          >
            <Share2 className="w-3.5 h-3.5" /> 分享
          </Button>
          <Button
            size="sm"
            onClick={() => {
              const blob = new Blob([JSON.stringify(trace, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `trace-run_j2k7-${Date.now()}.json`;
              a.click();
              URL.revokeObjectURL(url);
              notify.ok("Trace 已导出");
            }}
          >
            <Download className="w-3.5 h-3.5" /> 导出
          </Button>
        </>
      }
    >
      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <StatBox label="总耗时" value="3.28s" />
        <StatBox label="Spans" value="8" />
        <StatBox label="Tokens" value="8,420" />
        <StatBox label="成本" value="¥0.128" />
        <StatBox label="状态" value="ok" variant="success" />
      </div>

      {/* Waterfall */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[320px_1fr_80px_60px] border-b border-border-subtle text-[10px] uppercase tracking-wider text-ink-mute font-semibold">
          <div className="px-4 py-2.5">Span</div>
          <div className="relative px-2 py-2.5">
            {/* time axis */}
            <div className="relative h-4">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="absolute top-0 bottom-0" style={{ left: `${(i / 6) * 100}%` }}>
                  <span className="absolute -top-0.5 -translate-x-1/2 text-[9.5px] font-mono text-ink-mute">
                    {((i / 6) * TOTAL / 1000).toFixed(2)}s
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="px-2 py-2.5 text-right">duration</div>
          <div className="px-3 py-2.5 text-right">ok?</div>
        </div>

        {/* Rows */}
        {flat.map((s) => {
          const meta = kindMeta[s.kind];
          const Icon = meta.icon;
          const left = (s.start / TOTAL) * 100;
          const width = (s.duration / TOTAL) * 100;
          return (
            <div
              key={s.id}
              className="grid grid-cols-[320px_1fr_80px_60px] border-b border-border-subtle hover:bg-elevated/40 transition-colors group"
            >
              <div
                className="px-4 py-2.5 flex items-center gap-1.5 min-w-0"
                style={{ paddingLeft: 16 + s.depth * 20 }}
              >
                {s.children?.length ? (
                  <ChevronDown className="w-3 h-3 text-ink-mute shrink-0" />
                ) : (
                  <span className="w-3" />
                )}
                <Icon className={`w-3.5 h-3.5 shrink-0 ${meta.color}`} strokeWidth={1.8} />
                <span className="text-[12.5px] font-mono text-ink truncate">{s.name}</span>
                {s.detail && (
                  <span className="text-[10px] text-ink-mute ml-1 truncate hidden group-hover:inline">
                    · {s.detail}
                  </span>
                )}
              </div>

              {/* bar */}
              <div className="relative px-2 py-3">
                <div className="relative h-4 bg-elevated/40 rounded">
                  <div
                    className="absolute top-0 bottom-0 rounded flex items-center"
                    style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%`, backgroundColor: meta.hex, opacity: 0.85 }}
                    title={`${s.duration}ms`}
                  />
                  {/* 4 ticks */}
                  {[0, 25, 50, 75, 100].map((p) => (
                    <div
                      key={p}
                      className="absolute top-0 bottom-0 border-l border-border-subtle"
                      style={{ left: `${p}%` }}
                    />
                  ))}
                </div>
              </div>

              <div className="px-2 py-2.5 text-right font-mono text-[11.5px] text-ink-soft">{s.duration}ms</div>
              <div className="px-3 py-2.5 text-center">
                {s.status === "ok" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-success inline" />
                ) : (
                  <span className="text-danger text-xs">×</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend + selected span detail */}
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-4">
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute mb-3">图例</div>
          <div className="grid grid-cols-2 gap-2.5">
            {Object.entries(kindMeta).map(([k, m]) => {
              const Icon = m.icon;
              return (
                <div key={k} className="flex items-center gap-2 text-[12px]">
                  <div className="w-3 h-3 rounded" style={{ background: m.hex }} />
                  <Icon className={`w-3.5 h-3.5 ${m.color}`} strokeWidth={1.8} />
                  <span className="font-mono text-ink-soft capitalize">{k}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute">选中 Span · s3 · tool.web_search</div>
            <Badge variant="mono">980 ms</Badge>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Kv k="input" v="query='OpenClaw memory'" mono />
            <Kv k="output" v="10 results" mono />
            <Kv k="tokens" v="—" mono />
          </div>
          <div className="rounded-md border border-border-subtle bg-elevated p-2.5 text-[11px] font-mono text-ink-soft leading-relaxed">
            {`{ "tool": "web_search", "query": "OpenClaw memory architecture", "k": 10, "brave_key": "brv_***" }`}
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function StatBox({ label, value, variant }: { label: string; value: string; variant?: "success" }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3.5">
      <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-ink-mute mb-1">{label}</div>
      <div className={`text-[20px] font-bold font-mono tracking-tight ${variant === "success" ? "text-success" : "text-ink"}`}>
        {value}
      </div>
    </div>
  );
}

function Kv({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-ink-mute uppercase tracking-wider">{k}</div>
      <div className={`text-[12.5px] ${mono ? "font-mono" : ""} text-ink truncate`}>{v}</div>
    </div>
  );
}
