"use client";

import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import {
  Activity,
  Cpu,
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Puzzle,
  Server,
  Wrench,
  Play,
  CheckCircle2,
  AlertTriangle,
  Brain,
} from "lucide-react";

const stats = [
  {
    label: "今日 Agent 调用",
    value: "12,847",
    delta: "+24.8%",
    up: true,
    icon: Activity,
    color: "text-agent",
    series: [22, 28, 24, 30, 35, 32, 42, 38, 45, 52, 48, 58],
  },
  {
    label: "总 Tokens",
    value: "3.28M",
    delta: "+18.2%",
    up: true,
    icon: Cpu,
    color: "text-model",
    series: [10, 14, 18, 16, 22, 28, 26, 32, 36, 40, 44, 48],
  },
  {
    label: "今日成本",
    value: "¥428.60",
    delta: "-12.4%",
    up: false,
    icon: DollarSign,
    color: "text-success",
    series: [40, 42, 38, 36, 35, 34, 32, 30, 28, 26, 25, 24],
  },
  {
    label: "平均 TTFT",
    value: "287 ms",
    delta: "-8.1%",
    up: false,
    icon: TrendingUp,
    color: "text-trace",
    series: [35, 38, 36, 34, 32, 30, 29, 31, 28, 27, 26, 25],
  },
];

const recentAgents = [
  { name: "research-writer", pattern: "ReAct", runs: 1248, status: "healthy", last: "1 分钟前" },
  { name: "pdf-extractor", pattern: "Plan-Execute", runs: 842, status: "healthy", last: "3 分钟前" },
  { name: "code-review", pattern: "Reflexion", runs: 320, status: "degraded", last: "12 分钟前" },
  { name: "sales-qualifier", pattern: "Multi-Agent", runs: 156, status: "healthy", last: "28 分钟前" },
  { name: "translator-swarm", pattern: "Swarm", runs: 98, status: "healthy", last: "1 小时前" },
];

const runtimeHealth = [
  { name: "Skills", icon: Puzzle, color: "text-skill", installed: 24, healthy: 24, total: "skills/" },
  { name: "MCP", icon: Server, color: "text-mcp", installed: 18, healthy: 17, total: "servers/" },
  { name: "Tools", icon: Wrench, color: "text-tool", installed: 156, healthy: 156, total: "functions/" },
  { name: "Models", icon: Cpu, color: "text-model", installed: 12, healthy: 12, total: "providers/" },
];

const alerts = [
  { level: "warn", text: "mcp://filesystem · 超时 2 次 · 已降级到 fallback", t: "2 分钟前" },
  { level: "info", text: "新版 SKILL.md pdf-skill-v2.1 可用更新", t: "15 分钟前" },
  { level: "success", text: "Eval run #1284 完成 · RAGAS 均分 0.87", t: "32 分钟前" },
];

export default function DashboardPage() {
  return (
    <PageShell
      title="Dashboard"
      subtitle="实时工作台 · Agent 健康 · Runtime 状态 · 成本与告警"
      actions={
        <Link href="/studio">
          <Button size="sm" className="gap-1.5">
            <Play className="w-3.5 h-3.5" />
            新建 Agent
          </Button>
        </Link>
      }
    >
      {/* 4 Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* 中区 · 左 Agent 列表 / 右 Runtime + 告警 */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4">
        {/* Recent agents */}
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-subtle">
            <div>
              <h2 className="text-[14px] font-semibold tracking-tight">最近活跃 Agent</h2>
              <p className="text-[11px] text-ink-mute mt-0.5">5 个 · 按最近运行排序</p>
            </div>
            <Link href="/run">
              <Button variant="ghost" size="sm" className="text-[11px]">
                查看全部 →
              </Button>
            </Link>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border-subtle text-[10px] uppercase tracking-wider text-ink-mute">
                <th className="text-left px-5 py-2 font-medium">Agent</th>
                <th className="text-left px-2 py-2 font-medium">Pattern</th>
                <th className="text-right px-2 py-2 font-medium">今日运行</th>
                <th className="text-center px-2 py-2 font-medium">健康</th>
                <th className="text-right px-5 py-2 font-medium">最近</th>
              </tr>
            </thead>
            <tbody>
              {recentAgents.map((a) => (
                <tr key={a.name} className="border-b border-border-subtle last:border-0 hover:bg-elevated/60 transition-colors">
                  <td className="px-5 py-3 font-mono text-ink font-medium">{a.name}</td>
                  <td className="px-2 py-3">
                    <Badge variant="outline" className="font-mono text-[10px]">{a.pattern}</Badge>
                  </td>
                  <td className="px-2 py-3 text-right font-mono text-ink-soft">{a.runs.toLocaleString()}</td>
                  <td className="px-2 py-3 text-center">
                    {a.status === "healthy" ? (
                      <Badge variant="success">● 健康</Badge>
                    ) : (
                      <Badge variant="warning">● 降级</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-[11px] text-ink-mute font-mono">{a.last}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right stack */}
        <div className="space-y-4">
          {/* Runtime health */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-[14px] font-semibold tracking-tight">Runtime 健康</h2>
                <p className="text-[11px] text-ink-mute mt-0.5">四大运行时连接状态</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {runtimeHealth.map((r) => {
                const Icon = r.icon;
                const ratio = (r.healthy / r.installed) * 100;
                return (
                  <div key={r.name} className="rounded-lg border border-border-subtle p-3 hover:bg-elevated/50 transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`w-3.5 h-3.5 ${r.color}`} strokeWidth={1.8} />
                      <span className="text-[12px] font-medium">{r.name}</span>
                    </div>
                    <div className="flex items-baseline gap-1 mb-1.5">
                      <span className="text-[18px] font-bold font-mono">{r.healthy}</span>
                      <span className="text-[11px] text-ink-mute">/ {r.installed}</span>
                    </div>
                    <div className="h-1 rounded-full bg-border-subtle overflow-hidden">
                      <div
                        className={`h-full ${ratio === 100 ? "bg-success" : "bg-warning"}`}
                        style={{ width: `${ratio}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Alerts */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-[14px] font-semibold tracking-tight">告警与事件</h2>
                <p className="text-[11px] text-ink-mute mt-0.5">近 1 小时 · 3 条</p>
              </div>
              <Badge variant="outline" className="text-[10px]">3</Badge>
            </div>
            <ul className="space-y-2.5">
              {alerts.map((a) => (
                <li key={a.text} className="flex items-start gap-2.5 text-[12.5px]">
                  {a.level === "warn" && <AlertTriangle className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" />}
                  {a.level === "info" && <Brain className="w-3.5 h-3.5 text-info mt-0.5 shrink-0" />}
                  {a.level === "success" && <CheckCircle2 className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-ink leading-snug">{a.text}</div>
                    <div className="text-[10px] text-ink-mute font-mono mt-0.5">{a.t}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function StatCard({
  label,
  value,
  delta,
  up,
  icon: Icon,
  color,
  series,
}: {
  label: string;
  value: string;
  delta: string;
  up: boolean;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  color: string;
  series: number[];
}) {
  const max = Math.max(...series);
  const points = series.map((v, i) => `${(i / (series.length - 1)) * 100},${40 - (v / max) * 36}`).join(" ");
  const isDecreaseGood = !up; // 成本 / 延迟降低是好事
  const goodDelta = up || isDecreaseGood;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 hover:border-ink-mute transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] text-ink-mute font-medium tracking-wide">{label}</span>
        <div className={`w-7 h-7 rounded-lg bg-elevated flex items-center justify-center ${color}`}>
          <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
        </div>
      </div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[22px] font-bold font-mono tracking-tight text-ink">{value}</span>
        <span className={`inline-flex items-center gap-0.5 text-[11px] font-mono ${goodDelta ? "text-success" : "text-danger"}`}>
          {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {delta}
        </span>
      </div>
      <svg viewBox="0 0 100 44" className="w-full h-8" preserveAspectRatio="none">
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={color}
        />
        <polyline
          points={`0,44 ${points} 100,44`}
          fill="currentColor"
          opacity="0.08"
          className={color}
        />
      </svg>
    </div>
  );
}
