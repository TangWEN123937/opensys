"use client";

import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import {
  Gauge,
  TrendingUp,
  AlertTriangle,
  Plus,
  Bell,
} from "lucide-react";

export default function MonitorPage() {
  return (
    <PageShell
      title="Monitor"
      subtitle="生产环境监控 · QPS / 延迟分位数 / 错误率 / 成本 · 告警规则"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => notify.todo("告警规则编辑 · 阈值 + 通道(Slack/Email)")}>
            <Bell className="w-3.5 h-3.5" /> 告警规则
          </Button>
          <Button size="sm" onClick={() => notify.todo("新建自定义大盘 · 拖拽 widget")}>
            <Plus className="w-3.5 h-3.5" /> 新建大盘
          </Button>
        </>
      }
    >
      {/* Top 4 stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: "当前 QPS", value: "142", sub: "peak 186", good: true, series: [80, 90, 100, 95, 110, 120, 135, 128, 142, 150, 144, 142] },
          { label: "P95 延迟", value: "2.84s", sub: "-0.2s vs 昨日", good: true, series: [32, 35, 34, 32, 30, 29, 28, 29, 28, 30, 29, 28] },
          { label: "错误率", value: "0.82%", sub: "+0.1% vs 昨日", good: false, series: [6, 7, 8, 7, 9, 8, 10, 9, 11, 10, 12, 8] },
          { label: "成本/小时", value: "¥18.40", sub: "预算内 (80%)", good: true, series: [12, 14, 15, 16, 17, 18, 18, 19, 18, 18, 19, 18] },
        ].map((s) => (
          <MonitorStat key={s.label} {...s} />
        ))}
      </div>

      {/* Main grid · large charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="QPS · 近 1 小时" sub="按 agent 堆叠 · 每 5 分钟粒度">
          <StackedAreaChart />
        </ChartCard>
        <ChartCard title="延迟分位数 · P50 / P95 / P99" sub="毫秒 · 近 1 小时">
          <PercentileLines />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4 mb-4">
        <ChartCard title="错误分布 · 按类型" sub="近 24 小时">
          <ErrorBars />
        </ChartCard>

        {/* 告警规则 */}
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
            <h3 className="text-[13px] font-semibold flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-warning" />
              告警规则
            </h3>
            <Badge variant="outline" className="text-[10px]">4 active</Badge>
          </div>
          <ul className="divide-y divide-border-subtle">
            {[
              { name: "P95 延迟 > 5s", scope: "research-writer", channel: "Slack #on-call", status: "healthy" },
              { name: "错误率 > 2%", scope: "全部 agent", channel: "Slack + Email", status: "healthy" },
              { name: "成本/小时 > ¥50", scope: "全部 agent", channel: "Email", status: "warning" },
              { name: "MCP 连接失败", scope: "postgres", channel: "Slack", status: "healthy" },
            ].map((r, i) => (
              <li key={i} className="px-5 py-3 flex items-center justify-between hover:bg-elevated/30 transition-colors">
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium truncate">{r.name}</div>
                  <div className="text-[10.5px] text-ink-mute font-mono mt-0.5 truncate">
                    {r.scope} · {r.channel}
                  </div>
                </div>
                <Badge variant={r.status === "warning" ? "warning" : "success"} className="text-[10px]">
                  {r.status === "warning" ? "触发" : "正常"}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Cost breakdown */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[13px] font-semibold flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
            成本明细 · 按 Agent × Provider
          </h3>
          <Badge variant="mono" className="text-[10px]">今日 ¥428.60</Badge>
        </div>
        <table className="w-full text-[13px]">
          <thead className="text-[10px] uppercase tracking-wider text-ink-mute">
            <tr>
              <th className="text-left pb-2">Agent</th>
              <th className="text-right pb-2">Anthropic</th>
              <th className="text-right pb-2">OpenAI</th>
              <th className="text-right pb-2">Google</th>
              <th className="text-right pb-2">Dashscope</th>
              <th className="text-right pb-2">合计</th>
              <th className="text-right pb-2">占比</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {[
              ["research-writer", 128, 24, 0, 0, 152],
              ["pdf-extractor", 78, 0, 8, 12, 98],
              ["code-review", 86, 18, 0, 0, 104],
              ["sales-qualifier", 12, 32, 0, 8, 52],
              ["translator-swarm", 0, 0, 0, 22, 22],
            ].map(([name, a, o, g, d, total]) => (
              <tr key={name as string} className="border-t border-border-subtle">
                <td className="py-2.5 text-ink font-medium">{name}</td>
                <td className="py-2.5 text-right text-ink-soft">¥{a}</td>
                <td className="py-2.5 text-right text-ink-soft">¥{o}</td>
                <td className="py-2.5 text-right text-ink-soft">¥{g}</td>
                <td className="py-2.5 text-right text-ink-soft">¥{d}</td>
                <td className="py-2.5 text-right text-ink font-semibold">¥{total}</td>
                <td className="py-2.5 text-right">
                  <div className="inline-flex items-center gap-1.5">
                    <div className="w-16 h-1 bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${((total as number) / 428) * 100}%` }} />
                    </div>
                    <span className="text-[10.5px] text-ink-mute w-10 text-right">{(((total as number) / 428) * 100).toFixed(0)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}

function MonitorStat({ label, value, sub, good, series }: { label: string; value: string; sub: string; good: boolean; series: number[] }) {
  const max = Math.max(...series);
  const points = series.map((v, i) => `${(i / (series.length - 1)) * 100},${40 - (v / max) * 36}`).join(" ");
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] text-ink-mute">{label}</span>
        <Gauge className="w-3.5 h-3.5 text-ink-mute" strokeWidth={1.8} />
      </div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[22px] font-bold font-mono tracking-tight text-ink">{value}</span>
        <span className={`text-[11px] font-mono ${good ? "text-success" : "text-warning"}`}>{sub}</span>
      </div>
      <svg viewBox="0 0 100 44" className="w-full h-8" preserveAspectRatio="none">
        <polyline
          points={points}
          fill="none"
          stroke={good ? "hsl(145 55% 38%)" : "hsl(38 92% 48%)"}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points={`0,44 ${points} 100,44`}
          fill={good ? "hsl(145 55% 38%)" : "hsl(38 92% 48%)"}
          opacity="0.08"
        />
      </svg>
    </div>
  );
}

function ChartCard({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        <p className="text-[11px] text-ink-mute mt-0.5">{sub}</p>
      </div>
      {children}
    </div>
  );
}

function StackedAreaChart() {
  const n = 60;
  const seed = (i: number, k: number) => Math.max(8, 30 + Math.sin((i + k) * 0.35) * 10 + k * 8 + Math.random() * 4);
  const agents = ["research", "pdf-extract", "code-review", "sales"];
  const colors = ["hsl(222 60% 40%)", "hsl(185 65% 42%)", "hsl(320 50% 48%)", "hsl(38 85% 48%)"];
  const series = agents.map((_, k) => Array.from({ length: n }, (_, i) => seed(i, k)));
  // stack bottom up
  const stacks: number[][] = [];
  for (let i = 0; i < n; i++) {
    const col: number[] = [0];
    for (let k = 0; k < agents.length; k++) col.push(col[k] + series[k][i]);
    stacks.push(col);
  }
  const maxY = Math.max(...stacks.map((c) => c[c.length - 1]));
  return (
    <svg viewBox="0 0 600 200" className="w-full h-48">
      {/* grid */}
      {[0, 50, 100, 150].map((y) => (
        <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="hsl(222 14% 93%)" strokeWidth="1" />
      ))}
      {agents.map((name, k) => {
        const top = Array.from({ length: n }, (_, i) => [i * (600 / (n - 1)), 200 - (stacks[i][k + 1] / maxY) * 180]);
        const bottom = Array.from({ length: n }, (_, i) => [i * (600 / (n - 1)), 200 - (stacks[i][k] / maxY) * 180]).reverse();
        const d = [...top, ...bottom].map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ") + " Z";
        return <path key={name} d={d} fill={colors[k]} opacity="0.78" />;
      })}
      {/* Legend */}
      <g transform="translate(8, 12)">
        {agents.map((a, k) => (
          <g key={a} transform={`translate(${k * 108}, 0)`}>
            <rect width="10" height="10" rx="2" fill={colors[k]} />
            <text x="15" y="9" fontSize="10" fontFamily="monospace" fill="hsl(222 14% 45%)">{a}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function PercentileLines() {
  const n = 60;
  const p50 = Array.from({ length: n }, (_, i) => 800 + Math.sin(i * 0.3) * 120 + Math.random() * 60);
  const p95 = p50.map((v) => v * 2.6 + Math.random() * 200);
  const p99 = p50.map((v) => v * 4.2 + Math.random() * 400);
  const max = Math.max(...p99);
  const path = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? "M" : "L"} ${(i / (n - 1)) * 600} ${200 - (v / max) * 180}`).join(" ");
  return (
    <svg viewBox="0 0 600 200" className="w-full h-48">
      {[0, 50, 100, 150].map((y) => (
        <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="hsl(222 14% 93%)" strokeWidth="1" />
      ))}
      <path d={path(p99)} fill="none" stroke="hsl(0 72% 55%)" strokeWidth="1.5" strokeDasharray="4 3" />
      <path d={path(p95)} fill="none" stroke="hsl(38 85% 48%)" strokeWidth="1.8" />
      <path d={path(p50)} fill="none" stroke="hsl(222 60% 40%)" strokeWidth="2.2" />
      <g transform="translate(8, 12)" fontSize="10" fontFamily="monospace">
        <g><rect width="10" height="2" y="4" fill="hsl(222 60% 40%)" /><text x="15" y="9" fill="hsl(222 14% 45%)">P50</text></g>
        <g transform="translate(60, 0)"><rect width="10" height="2" y="4" fill="hsl(38 85% 48%)" /><text x="15" y="9" fill="hsl(222 14% 45%)">P95</text></g>
        <g transform="translate(120, 0)"><rect width="10" height="2" y="4" fill="hsl(0 72% 55%)" /><text x="15" y="9" fill="hsl(222 14% 45%)">P99</text></g>
      </g>
    </svg>
  );
}

function ErrorBars() {
  const bars = [
    { label: "rate_limit", v: 42, color: "hsl(38 85% 48%)" },
    { label: "timeout", v: 28, color: "hsl(0 72% 55%)" },
    { label: "parse_error", v: 18, color: "hsl(320 50% 48%)" },
    { label: "tool_error", v: 14, color: "hsl(185 65% 42%)" },
    { label: "5xx_upstream", v: 8, color: "hsl(280 40% 50%)" },
    { label: "auth", v: 6, color: "hsl(155 50% 38%)" },
  ];
  const max = Math.max(...bars.map((b) => b.v));
  return (
    <div className="space-y-2">
      {bars.map((b) => (
        <div key={b.label} className="grid grid-cols-[140px_1fr_40px] gap-2 items-center">
          <div className="text-[11.5px] font-mono text-ink-soft truncate">{b.label}</div>
          <div className="relative h-5 bg-elevated rounded-sm overflow-hidden">
            <div className="absolute inset-y-0 rounded-sm" style={{ width: `${(b.v / max) * 100}%`, background: b.color }} />
          </div>
          <div className="text-right font-mono text-[11px] text-ink">{b.v}</div>
        </div>
      ))}
    </div>
  );
}
