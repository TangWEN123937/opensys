"use client";

import { useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import {
  Play,
  Pause,
  Square,
  ArrowUpRight,
  Clock,
  Cpu,
  Zap,
  Search,
  AlertCircle,
  CheckCircle2,
  Activity,
} from "lucide-react";

type RunStatus = "running" | "completed" | "failed" | "paused";

const runs = [
  {
    id: "run_j2k7",
    agent: "research-writer",
    pattern: "ReAct",
    status: "running" as RunStatus,
    progress: 72,
    step: "Tool call · web_search",
    started: "1 分钟前",
    elapsed: "58s",
    tokens: 1284,
    cost: 0.018,
  },
  {
    id: "run_j2k6",
    agent: "pdf-extractor",
    pattern: "Plan-Execute",
    status: "running" as RunStatus,
    progress: 35,
    step: "Step 2/5 · Parse pages",
    started: "3 分钟前",
    elapsed: "2m 14s",
    tokens: 3412,
    cost: 0.042,
  },
  {
    id: "run_j2k5",
    agent: "code-review",
    pattern: "Reflexion",
    status: "running" as RunStatus,
    progress: 60,
    step: "Iteration 2 · Critic scoring",
    started: "5 分钟前",
    elapsed: "4m 08s",
    tokens: 8120,
    cost: 0.112,
  },
  {
    id: "run_j2k4",
    agent: "sales-qualifier",
    pattern: "Multi-Agent",
    status: "completed" as RunStatus,
    progress: 100,
    step: "done",
    started: "12 分钟前",
    elapsed: "2m 48s",
    tokens: 4620,
    cost: 0.058,
  },
  {
    id: "run_j2k3",
    agent: "translator-swarm",
    pattern: "Swarm",
    status: "completed" as RunStatus,
    progress: 100,
    step: "done",
    started: "18 分钟前",
    elapsed: "1m 32s",
    tokens: 2180,
    cost: 0.028,
  },
  {
    id: "run_j2k2",
    agent: "doc-summarizer",
    pattern: "ReAct",
    status: "failed" as RunStatus,
    progress: 45,
    step: "Tool error · rate_limit_exceeded",
    started: "25 分钟前",
    elapsed: "45s",
    tokens: 680,
    cost: 0.009,
  },
];

// 实时日志行(选中 run 的模拟)
const logLines = [
  { t: "00:00.124", level: "info", text: "[agent] received query: 'OpenClaw memory 架构'" },
  { t: "00:00.287", level: "info", text: "[memory] recall 10 turns, top-3 relevant" },
  { t: "00:00.412", level: "tool", text: "[tool: web_search] ← query='OpenClaw memory architecture'" },
  { t: "00:02.108", level: "tool", text: "[tool: web_search] → 10 results · 1284ms" },
  { t: "00:02.205", level: "llm", text: "[llm: haiku] thinking... tokens:128" },
  { t: "00:03.820", level: "llm", text: "[llm: haiku] streaming... token 42/100" },
  { t: "00:05.412", level: "tool", text: "[tool: web_fetch] ← url='openclaw.dev/docs/memory'" },
  { t: "00:07.108", level: "tool", text: "[tool: web_fetch] → 1 doc · 312KB" },
  { t: "00:07.982", level: "llm", text: "[llm: haiku] synthesizing answer..." },
];

export default function RunConsolePage() {
  const [selected, setSelected] = useState(runs[0]);
  const [filter, setFilter] = useState<"all" | RunStatus>("all");

  const filtered = filter === "all" ? runs : runs.filter((r) => r.status === filter);

  return (
    <PageShell
      title="Run Console"
      subtitle="所有运行中的 Agent · 实时流 · 停/重试/查看 Trace"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => notify.ok("已暂停 3 个运行中 Agent")}>
            <Pause className="w-3.5 h-3.5" /> 全部暂停
          </Button>
          <Button variant="danger" size="sm" onClick={() => notify.ok("已停止 3 个运行中 Agent", "Trace 已保存")}>
            <Square className="w-3.5 h-3.5" /> 全部停止
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 h-[calc(100vh-56px-48px)]">
        {/* Left · Runs list */}
        <div className="rounded-xl border border-border bg-surface overflow-hidden flex flex-col">
          {/* Filters */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <div className="flex items-center gap-1.5">
              {(["all", "running", "completed", "failed"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors ${
                    filter === f ? "bg-primary text-primary-foreground" : "text-ink-soft hover:bg-elevated"
                  }`}
                >
                  {{ all: "全部", running: "运行中", completed: "已完成", failed: "失败" }[f]}
                  <span className="ml-1 opacity-70">
                    {f === "all" ? runs.length : runs.filter((r) => r.status === f).length}
                  </span>
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-mute" />
              <input
                placeholder="搜索 agent..."
                className="h-8 pl-8 pr-3 text-[12px] rounded-md border border-border bg-surface w-48 focus:outline-none focus:border-primary/40"
              />
            </div>
          </div>

          {/* Runs cards */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {filtered.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className={`w-full text-left rounded-lg border p-3.5 transition-all ${
                  selected.id === r.id
                    ? "border-primary bg-primary-tint/40 shadow-sm"
                    : "border-border bg-surface hover:bg-elevated/50 hover:border-ink-mute"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusDot status={r.status} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] font-medium truncate">{r.agent}</span>
                        <Badge variant="outline" className="text-[10px]">{r.pattern}</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-ink-mute font-mono">
                        <span>{r.id}</span>
                        <span>·</span>
                        <span>{r.started}</span>
                        <span>·</span>
                        <span>{r.elapsed}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {r.status === "running" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); notify.ok(`暂停 ${r.id}`); }}
                      >
                        <Pause className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Link href="/trace/waterfall" onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" className="h-7 w-7">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>

                <div className="text-[11.5px] text-ink-soft mb-2 truncate">{r.step}</div>

                {/* Progress */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1 rounded-full bg-border-subtle overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        r.status === "failed" ? "bg-danger" : r.status === "completed" ? "bg-success" : "bg-primary"
                      }`}
                      style={{ width: `${r.progress}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-ink-mute w-10 text-right">{r.progress}%</span>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-4 mt-2.5 text-[10.5px] font-mono text-ink-mute">
                  <span className="flex items-center gap-1"><Cpu className="w-3 h-3" />{r.tokens.toLocaleString()} tk</span>
                  <span className="flex items-center gap-1"><Zap className="w-3 h-3" />¥{r.cost.toFixed(3)}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{r.elapsed}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right · Live log */}
        <div className="rounded-xl border border-border bg-surface overflow-hidden flex flex-col">
          <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
            <div>
              <h3 className="text-[13px] font-semibold tracking-tight">实时日志 · {selected.id}</h3>
              <p className="text-[11px] text-ink-mute mt-0.5 font-mono">{selected.agent} · {selected.pattern}</p>
            </div>
            <Badge variant="success" className="text-[10px]">
              <Activity className="w-3 h-3" /> live
            </Badge>
          </div>

          {/* Timeline */}
          <div className="px-5 py-3 border-b border-border-subtle bg-elevated/30">
            <div className="flex items-center justify-between text-[10px] text-ink-mute font-mono">
              <span>progress</span>
              <span>step 3 / 7 · {selected.elapsed}</span>
            </div>
            <div className="mt-2 flex items-center gap-0.5">
              {Array.from({ length: 7 }).map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 h-1.5 rounded-full ${
                    i < 3 ? "bg-success" : i === 3 ? "bg-primary animate-pulse" : "bg-border"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Log lines */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-[11.5px] bg-elevated/20">
            {logLines.map((l, i) => (
              <div key={i} className="flex gap-2.5 leading-relaxed">
                <span className="text-ink-mute w-16 shrink-0">{l.t}</span>
                <span
                  className={`w-10 shrink-0 text-[10px] font-semibold uppercase tracking-wider ${
                    { info: "text-info", tool: "text-tool", llm: "text-model", error: "text-danger" }[l.level] ?? ""
                  }`}
                >
                  {l.level}
                </span>
                <span className="text-ink-soft break-all">{l.text}</span>
              </div>
            ))}
            <div className="flex gap-2.5 leading-relaxed">
              <span className="text-ink-mute w-16 shrink-0">09.624</span>
              <span className="w-10 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-llm text-model">llm</span>
              <span className="text-ink-soft">[llm: haiku] <span className="relative inline-block w-2 h-3 bg-primary align-middle animate-pulse" /></span>
            </div>
          </div>

          {/* Footer actions */}
          <div className="border-t border-border-subtle p-3 flex items-center justify-between bg-surface">
            <div className="flex items-center gap-3 text-[11px] text-ink-mute font-mono">
              <span><Cpu className="w-3 h-3 inline mr-1" />{selected.tokens.toLocaleString()} tk</span>
              <span><Zap className="w-3 h-3 inline mr-1" />¥{selected.cost.toFixed(3)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Link href="/trace/waterfall">
                <Button size="sm" variant="outline" className="text-[11px]">
                  <ArrowUpRight className="w-3 h-3" /> 看 Trace
                </Button>
              </Link>
              <Button size="sm" variant="danger" className="text-[11px]" onClick={() => notify.ok(`已停止 ${selected.id}`)}>
                <Square className="w-3 h-3" /> 停止
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function StatusDot({ status }: { status: RunStatus }) {
  if (status === "running") {
    return (
      <span className="relative flex w-2 h-2 shrink-0">
        <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-70" />
        <span className="relative w-2 h-2 rounded-full bg-primary" />
      </span>
    );
  }
  if (status === "completed") return <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />;
  if (status === "failed") return <AlertCircle className="w-3.5 h-3.5 text-danger shrink-0" />;
  return <Pause className="w-3.5 h-3.5 text-ink-mute shrink-0" />;
}
