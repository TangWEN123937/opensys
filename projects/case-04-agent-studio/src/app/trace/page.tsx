"use client";

import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import {
  GitCompareArrows,
  Search,
  Filter,
  Download,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";

const traces = [
  { id: "run_j2k7", agent: "research-writer", pattern: "ReAct", duration: 3284, spans: 8, tokens: 8420, cost: 0.128, status: "ok", when: "1 分钟前" },
  { id: "run_j2k6", agent: "pdf-extractor", pattern: "Plan-Execute", duration: 5120, spans: 12, tokens: 12420, cost: 0.186, status: "ok", when: "3 分钟前" },
  { id: "run_j2k5", agent: "code-review", pattern: "Reflexion", duration: 8240, spans: 18, tokens: 18200, cost: 0.242, status: "ok", when: "5 分钟前" },
  { id: "run_j2k4", agent: "sales-qualifier", pattern: "Multi-Agent", duration: 2860, spans: 10, tokens: 4620, cost: 0.058, status: "ok", when: "12 分钟前" },
  { id: "run_j2k3", agent: "translator-swarm", pattern: "Swarm", duration: 1520, spans: 6, tokens: 2180, cost: 0.028, status: "ok", when: "18 分钟前" },
  { id: "run_j2k2", agent: "doc-summarizer", pattern: "ReAct", duration: 460, spans: 3, tokens: 680, cost: 0.009, status: "error", when: "25 分钟前" },
  { id: "run_j2k1", agent: "research-writer", pattern: "ReAct", duration: 4120, spans: 9, tokens: 9820, cost: 0.148, status: "ok", when: "42 分钟前" },
  { id: "run_j2k0", agent: "research-writer", pattern: "ReAct", duration: 2940, spans: 7, tokens: 7420, cost: 0.112, status: "ok", when: "1 小时前" },
];

export default function TraceExplorerPage() {
  return (
    <PageShell
      title="Trace Explorer"
      subtitle="所有 Agent 运行的 trace 库 · 搜索 / 过滤 / 对比 / 根因分析"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => notify.todo("高级过滤 · 按 span 类型 / 错误 / 耗时分布")}>
            <Filter className="w-3.5 h-3.5" /> 高级过滤
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const csv = "id,agent,pattern,duration_ms,spans,tokens,cost,status\n" + traces.map((t) => `${t.id},${t.agent},${t.pattern},${t.duration},${t.spans},${t.tokens},${t.cost},${t.status}`).join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = "traces.csv"; a.click();
              URL.revokeObjectURL(url);
              notify.ok(`已导出 ${traces.length} 条 traces.csv`);
            }}
          >
            <Download className="w-3.5 h-3.5" /> 导出
          </Button>
          <Button size="sm" onClick={() => notify.info("请先勾选两条 trace", "勾选后此按钮才会进入对比视图")}>
            <GitCompareArrows className="w-3.5 h-3.5" /> 对比选中 2 条
          </Button>
        </>
      }
    >
      {/* Filters row */}
      <div className="mb-4 rounded-xl border border-border bg-surface p-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-mute" />
          <input
            placeholder="搜索 trace id / agent 名 / 错误信息..."
            className="w-full h-9 pl-9 pr-3 text-[13px] rounded-md border border-border bg-surface focus:outline-none focus:border-primary/40"
          />
        </div>
        {[
          ["agent", ["research-writer", "pdf-extractor", "code-review", "..."]],
          ["pattern", ["ReAct", "Plan-Execute", "Reflexion", "Multi-Agent", "Swarm"]],
          ["status", ["ok", "error", "timeout"]],
          ["duration", ["< 1s", "1-5s", "5-30s", "> 30s"]],
        ].map(([label]) => (
          <button
            key={label as string}
            onClick={() => notify.todo(`按 ${label} 过滤 · 下拉选项展开`)}
            className="h-9 px-3 rounded-md border border-border bg-surface text-[12px] text-ink-soft hover:bg-elevated"
          >
            {label}
            <span className="text-ink-mute ml-1">▾</span>
          </button>
        ))}
      </div>

      {/* Stats pillar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <PillStat label="Total Traces" value="12,847" sub="近 24h" />
        <PillStat label="成功率" value="98.4%" sub="204 failed" variant="success" />
        <PillStat label="P95 耗时" value="5.82s" sub="+0.4s vs 昨日" />
        <PillStat label="总 Tokens" value="3.28M" sub="¥428 成本" />
      </div>

      {/* Traces table */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
          <h3 className="text-[13px] font-semibold">Traces · 最近 8 条</h3>
          <div className="flex items-center gap-3 text-[11px] text-ink-mute font-mono">
            <span>选中 0 条 · 对比需选 2</span>
          </div>
        </div>
        <table className="w-full text-[13px]">
          <thead className="bg-elevated/30 text-[10px] uppercase tracking-wider text-ink-mute">
            <tr>
              <th className="w-8 px-3 py-2.5"><input type="checkbox" className="accent-primary" /></th>
              <th className="text-left px-3 py-2.5 font-semibold">Trace ID</th>
              <th className="text-left px-3 py-2.5 font-semibold">Agent</th>
              <th className="text-left px-3 py-2.5 font-semibold">Pattern</th>
              <th className="text-right px-3 py-2.5 font-semibold">耗时</th>
              <th className="text-right px-3 py-2.5 font-semibold">Spans</th>
              <th className="text-right px-3 py-2.5 font-semibold">Tokens</th>
              <th className="text-right px-3 py-2.5 font-semibold">成本</th>
              <th className="text-center px-3 py-2.5 font-semibold">状态</th>
              <th className="text-right px-3 py-2.5 font-semibold">时间</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {traces.map((t) => (
              <tr key={t.id} className="border-t border-border-subtle hover:bg-elevated/30 transition-colors">
                <td className="px-3 py-2.5"><input type="checkbox" className="accent-primary" /></td>
                <td className="px-3 py-2.5 font-mono text-[11.5px] text-primary">{t.id}</td>
                <td className="px-3 py-2.5 font-mono text-[12px] text-ink font-medium">{t.agent}</td>
                <td className="px-3 py-2.5">
                  <Badge variant="outline" className="text-[10px]">{t.pattern}</Badge>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[11.5px] text-ink-soft">{(t.duration / 1000).toFixed(2)}s</td>
                <td className="px-3 py-2.5 text-right font-mono text-[11.5px] text-ink-soft">{t.spans}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[11.5px] text-ink-soft">{t.tokens.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[11.5px] text-ink-soft">¥{t.cost.toFixed(3)}</td>
                <td className="px-3 py-2.5 text-center">
                  {t.status === "ok" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-success inline" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-danger inline" />
                  )}
                </td>
                <td className="px-3 py-2.5 text-right text-[11px] text-ink-mute font-mono">
                  <Clock className="w-3 h-3 inline mr-1" />{t.when}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link href="/trace/waterfall" className="text-primary hover:underline text-[11px] inline-flex items-center gap-1">
                    瀑布图 <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}

function PillStat({ label, value, sub, variant }: { label: string; value: string; sub: string; variant?: "success" }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-[11px] text-ink-mute mb-1">{label}</div>
      <div className={`text-[22px] font-bold font-mono ${variant === "success" ? "text-success" : "text-ink"}`}>{value}</div>
      <div className="text-[11px] text-ink-mute font-mono mt-0.5">{sub}</div>
    </div>
  );
}
