"use client";

import { useState } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import {
  Cpu,
  BarChart3,
  Activity,
  Shuffle,
  DollarSign,
  Zap,
  ArrowRight,
  AlertTriangle,
  Plus,
} from "lucide-react";

interface Model {
  id: string;
  name: string;
  provider: "openrouter" | "anthropic" | "openai" | "deepseek" | "dashscope" | "google";
  tier: "flagship" | "balanced" | "cheap";
  costIn: number; // per 1M tokens USD
  costOut: number;
  latencyP50: number; // ms
  ctx: number; // context window
  status: "healthy" | "slow" | "down";
  callsToday: number;
}

const models: Model[] = [
  { id: "claude-opus-4-7", name: "claude-opus-4-7", provider: "anthropic", tier: "flagship", costIn: 15, costOut: 75, latencyP50: 1820, ctx: 1000000, status: "healthy", callsToday: 480 },
  { id: "claude-haiku-4-5", name: "claude-haiku-4-5", provider: "anthropic", tier: "balanced", costIn: 0.8, costOut: 4, latencyP50: 280, ctx: 200000, status: "healthy", callsToday: 8420 },
  { id: "gpt-5-mini", name: "gpt-5-mini", provider: "openai", tier: "balanced", costIn: 1.1, costOut: 4.4, latencyP50: 412, ctx: 400000, status: "healthy", callsToday: 2840 },
  { id: "gpt-5", name: "gpt-5", provider: "openai", tier: "flagship", costIn: 12, costOut: 60, latencyP50: 1420, ctx: 400000, status: "healthy", callsToday: 320 },
  { id: "gemini-2.5-pro", name: "gemini-2.5-pro", provider: "google", tier: "flagship", costIn: 8, costOut: 32, latencyP50: 1120, ctx: 2000000, status: "slow", callsToday: 180 },
  { id: "deepseek-v4", name: "deepseek-v4-chat", provider: "deepseek", tier: "cheap", costIn: 0.14, costOut: 0.28, latencyP50: 520, ctx: 128000, status: "healthy", callsToday: 1240 },
  { id: "qwen-max", name: "qwen-max-latest", provider: "dashscope", tier: "balanced", costIn: 2, costOut: 6, latencyP50: 720, ctx: 32000, status: "healthy", callsToday: 620 },
  { id: "qwen-plus", name: "qwen-plus", provider: "dashscope", tier: "cheap", costIn: 0.4, costOut: 1.2, latencyP50: 420, ctx: 32000, status: "healthy", callsToday: 1820 },
  { id: "deepseek-r1", name: "deepseek-r1", provider: "deepseek", tier: "balanced", costIn: 0.55, costOut: 2.19, latencyP50: 820, ctx: 128000, status: "healthy", callsToday: 480 },
  { id: "llama-3.3-70b", name: "llama-3.3-70b", provider: "openrouter", tier: "cheap", costIn: 0.12, costOut: 0.36, latencyP50: 640, ctx: 128000, status: "down", callsToday: 0 },
];

const providerColor: Record<Model["provider"], string> = {
  openrouter: "text-ink",
  anthropic: "text-[hsl(25_85%_50%)]",
  openai: "text-mcp",
  deepseek: "text-info",
  dashscope: "text-accent",
  google: "text-danger",
};

type View = "cost" | "latency" | "failover";

export default function ModelRouterPage() {
  const [view, setView] = useState<View>("cost");

  return (
    <PageShell
      title="Model Router"
      subtitle={`${models.length} 模型 · 6 provider 统一接入 · 智能路由 / 失败切换 / 成本优化`}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => notify.todo("路由规则编辑器 · 条件 + fallback 配置")}>
            <Shuffle className="w-3.5 h-3.5" /> 路由规则
          </Button>
          <Button size="sm" onClick={() => notify.todo("添加 Provider · OpenAI 兼容 endpoint")}>
            <Plus className="w-3.5 h-3.5" /> 添加 Provider
          </Button>
        </>
      }
    >
      {/* Top · 4 stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <TopStat icon={Cpu} color="text-model" label="模型数" value={`${models.length}`} sub="6 providers" />
        <TopStat icon={Activity} color="text-primary" label="今日调用" value="16,428" sub="+24% vs 昨日" />
        <TopStat icon={DollarSign} color="text-success" label="今日成本" value="¥428" sub="-12% vs 基线" />
        <TopStat icon={AlertTriangle} color="text-warning" label="Failover" value="12" sub="次切换" />
      </div>

      {/* View switcher */}
      <div className="mb-4 flex items-center gap-1.5">
        {([
          { id: "cost", label: "成本对比条图", icon: DollarSign },
          { id: "latency", label: "延迟热图", icon: Zap },
          { id: "failover", label: "Failover 流程图", icon: Shuffle },
        ] as const).map((v) => {
          const Icon = v.icon;
          return (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-[12.5px] font-medium transition-colors ${
                view === v.id ? "bg-primary text-primary-foreground shadow-sm" : "text-ink-soft border border-border hover:bg-elevated"
              }`}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
              {v.label}
            </button>
          );
        })}
      </div>

      {/* View content */}
      {view === "cost" && <CostView models={models} />}
      {view === "latency" && <LatencyView models={models} />}
      {view === "failover" && <FailoverView />}

      {/* Model table */}
      <div className="mt-5 rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
          <h3 className="text-[13px] font-semibold">模型清单 · {models.length}</h3>
          <Badge variant="mono" className="text-[10px]">按今日调用量排序</Badge>
        </div>
        <table className="w-full text-[13px]">
          <thead className="bg-elevated/40 text-[10px] uppercase tracking-wider text-ink-mute">
            <tr>
              <th className="text-left px-5 py-2.5 font-semibold">模型</th>
              <th className="text-left px-2 py-2.5 font-semibold">Provider</th>
              <th className="text-left px-2 py-2.5 font-semibold">档位</th>
              <th className="text-right px-2 py-2.5 font-semibold">$/1M in</th>
              <th className="text-right px-2 py-2.5 font-semibold">$/1M out</th>
              <th className="text-right px-2 py-2.5 font-semibold">P50</th>
              <th className="text-right px-2 py-2.5 font-semibold">CTX</th>
              <th className="text-right px-2 py-2.5 font-semibold">今日调用</th>
              <th className="text-center px-2 py-2.5 font-semibold">状态</th>
              <th className="text-center px-5 py-2.5 font-semibold">动作</th>
            </tr>
          </thead>
          <tbody>
            {[...models].sort((a, b) => b.callsToday - a.callsToday).map((m) => (
              <tr key={m.id} className="border-t border-border-subtle hover:bg-elevated/40 transition-colors">
                <td className="px-5 py-2.5 font-mono text-[12.5px] text-ink font-medium">{m.name}</td>
                <td className="px-2 py-2.5"><span className={`font-mono text-[11.5px] ${providerColor[m.provider]}`}>{m.provider}</span></td>
                <td className="px-2 py-2.5">
                  <Badge variant={m.tier === "flagship" ? "accent" : m.tier === "balanced" ? "info" : "outline"} className="text-[10px]">
                    {m.tier}
                  </Badge>
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-[11.5px] text-ink-soft">${m.costIn.toFixed(2)}</td>
                <td className="px-2 py-2.5 text-right font-mono text-[11.5px] text-ink-soft">${m.costOut.toFixed(2)}</td>
                <td className="px-2 py-2.5 text-right font-mono text-[11.5px] text-ink-soft">{m.latencyP50}ms</td>
                <td className="px-2 py-2.5 text-right font-mono text-[11.5px] text-ink-soft">{(m.ctx / 1000).toFixed(0)}k</td>
                <td className="px-2 py-2.5 text-right font-mono text-[11.5px] text-ink font-medium">{m.callsToday.toLocaleString()}</td>
                <td className="px-2 py-2.5 text-center">
                  <StatusDot status={m.status} />
                </td>
                <td className="px-5 py-2.5 text-center">
                  <button
                    className="text-[11px] text-primary font-medium hover:underline"
                    onClick={async () => {
                      const t0 = Date.now();
                      const tid = (await import("sonner")).toast.loading(`测试 ${m.name}...`);
                      try {
                        const r = await fetch("/api/models/test", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ provider: m.provider }),
                        });
                        const j = await r.json();
                        const { toast } = await import("sonner");
                        if (j.ok) toast.success(`✅ ${m.provider} 连通 · ${j.models} 个模型`, { id: tid, description: `${j.ms}ms` });
                        else toast.error(`❌ ${m.provider} 失败 · ${j.error}`, { id: tid });
                      } catch (e) {
                        (await import("sonner")).toast.error(`测试异常: ${(e as Error).message}`, { id: tid });
                      }
                    }}
                  >
                    测试
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}

function CostView({ models }: { models: Model[] }) {
  const maxCost = Math.max(...models.map((m) => m.costIn + m.costOut));
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[13px] font-semibold flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5 text-primary" />
          成本对比(美元 / 1M tokens · input + output 堆叠)
        </h3>
        <div className="flex items-center gap-3 text-[10.5px] font-mono">
          <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-primary" /> input</span>
          <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-accent" /> output</span>
        </div>
      </div>
      <div className="space-y-2">
        {[...models].sort((a, b) => b.costIn + b.costOut - a.costIn - a.costOut).map((m) => {
          const total = m.costIn + m.costOut;
          const pct = (total / maxCost) * 100;
          const inPct = (m.costIn / total) * 100;
          return (
            <div key={m.id} className="grid grid-cols-[220px_1fr_100px] gap-3 items-center">
              <div className="min-w-0">
                <div className="font-mono text-[12px] font-medium truncate">{m.name}</div>
                <div className={`text-[10px] font-mono ${providerColor[m.provider]}`}>{m.provider}</div>
              </div>
              <div className="relative h-6 bg-elevated rounded overflow-hidden">
                <div className="absolute inset-y-0 left-0 flex" style={{ width: `${pct}%` }}>
                  <div className="bg-primary" style={{ width: `${inPct}%` }} />
                  <div className="bg-accent" style={{ width: `${100 - inPct}%` }} />
                </div>
              </div>
              <div className="text-right font-mono text-[11.5px]">
                <span className="text-ink">${total.toFixed(2)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LatencyView({ models }: { models: Model[] }) {
  // 24 格热图每模型 · 颜色按 latency 低绿高红
  const hotColor = (v: number) => {
    if (v < 300) return "bg-[hsl(145_55%_60%)]";
    if (v < 600) return "bg-[hsl(75_65%_55%)]";
    if (v < 1000) return "bg-[hsl(38_85%_55%)]";
    if (v < 1600) return "bg-[hsl(20_85%_55%)]";
    return "bg-[hsl(0_72%_55%)]";
  };
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[13px] font-semibold flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-warning" />
          延迟热图(近 24h · 每格 1 小时 · 颜色 = P50 延迟)
        </h3>
        <div className="flex items-center gap-1 text-[10px] font-mono">
          <span>快</span>
          {["hsl(145 55% 60%)", "hsl(75 65% 55%)", "hsl(38 85% 55%)", "hsl(20 85% 55%)", "hsl(0 72% 55%)"].map((c) => (
            <div key={c} className="w-4 h-4 rounded-sm" style={{ background: c }} />
          ))}
          <span>慢</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {models.map((m) => {
          const base = m.latencyP50;
          return (
            <div key={m.id} className="grid grid-cols-[220px_1fr_70px] gap-3 items-center">
              <div className="min-w-0">
                <div className="font-mono text-[12px] font-medium truncate">{m.name}</div>
                <div className={`text-[10px] font-mono ${providerColor[m.provider]}`}>{m.provider}</div>
              </div>
              <div className="flex gap-0.5">
                {Array.from({ length: 24 }).map((_, i) => {
                  // 伪随机但稳定
                  const noise = Math.sin(base + i * 7) * 0.5 + 1;
                  const v = base * noise;
                  return <div key={i} className={`flex-1 h-5 rounded-sm ${hotColor(v)}`} title={`${Math.round(v)}ms`} />;
                })}
              </div>
              <div className="text-right font-mono text-[11.5px] text-ink">{base}ms</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FailoverView() {
  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-[13px] font-semibold flex items-center gap-2">
          <Shuffle className="w-3.5 h-3.5 text-primary" />
          Failover 流程 · 任务进入 → 按规则路由 → 失败逐级降级
        </h3>
        <Badge variant="outline" className="text-[10px]">近 1 小时 12 次切换</Badge>
      </div>

      <div className="relative max-w-4xl mx-auto">
        <svg viewBox="0 0 900 380" className="w-full h-auto">
          <defs>
            <marker id="fa-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="hsl(222 14% 60%)" />
            </marker>
          </defs>

          {/* Request */}
          <FailoverNode x={20} y={160} w={140} title="Agent Request" sub="tools, messages" color="hsl(222 60% 40%)" bg="hsl(222 60% 95%)" />
          <path d="M 160 190 L 200 190" stroke="hsl(222 14% 60%)" strokeWidth="1.5" markerEnd="url(#fa-arr)" />

          {/* Router */}
          <FailoverNode x={200} y={150} w={160} h={80} title="Router" sub="rule: task 类型 + 预算 + 延迟" color="hsl(222 60% 22%)" bg="hsl(222 60% 96%)" fillTitle="#fff" />

          {/* Branches from router */}
          <path d="M 360 160 C 440 160, 440 50, 520 50" fill="none" stroke="hsl(222 14% 60%)" strokeWidth="1.5" markerEnd="url(#fa-arr)" />
          <path d="M 360 190 L 520 190" stroke="hsl(222 14% 60%)" strokeWidth="1.5" markerEnd="url(#fa-arr)" />
          <path d="M 360 220 C 440 220, 440 330, 520 330" fill="none" stroke="hsl(222 14% 60%)" strokeWidth="1.5" markerEnd="url(#fa-arr)" />

          {/* 3 primaries */}
          <FailoverNode x={520} y={20} w={160} title="claude-haiku-4-5" sub="cheap · fast path" color="hsl(25 85% 50%)" bg="hsl(25 85% 95%)" />
          <FailoverNode x={520} y={160} w={160} title="gpt-5-mini" sub="balanced path" color="hsl(155 50% 38%)" bg="hsl(155 50% 95%)" running />
          <FailoverNode x={520} y={300} w={160} title="claude-opus-4-7" sub="flagship · reason" color="hsl(25 85% 50%)" bg="hsl(25 85% 95%)" />

          {/* Fallback arrows */}
          <path d="M 600 80 C 650 80, 650 150, 600 170" fill="none" stroke="hsl(0 72% 55%)" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#fa-arr)" />
          <text x="652" y="128" fontSize="10" fontFamily="monospace" fill="hsl(0 72% 55%)">rate limit → fallback</text>

          {/* Success to output */}
          <path d="M 680 190 L 740 190" stroke="hsl(145 55% 45%)" strokeWidth="1.8" markerEnd="url(#fa-arr)" />
          <FailoverNode x={740} y={160} w={140} title="Response" sub="stream to client" color="hsl(145 55% 38%)" bg="hsl(145 55% 95%)" />
        </svg>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px]">
        <FTip color="bg-primary" label="主路由" text="按任务类型 + 预算 + 最小延迟路由到 cheap/balanced/flagship 三档" />
        <FTip color="bg-warning" label="降级切换" text="rate_limit / timeout / 5xx 错误自动切到同档下一个 provider" />
        <FTip color="bg-success" label="上线恢复" text="健康探测成功后 5 分钟自动回源 · 避免热切抖动" />
      </div>
    </div>
  );
}

function FailoverNode({
  x, y, w, h = 60, title, sub, color, bg, fillTitle, running,
}: {
  x: number; y: number; w: number; h?: number;
  title: string; sub: string; color: string; bg: string;
  fillTitle?: string; running?: boolean;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="10" fill={bg} stroke={color} strokeWidth="1.5" />
      <text x={x + w / 2} y={y + 24} textAnchor="middle" fontSize="12" fontFamily="monospace" fontWeight="600" fill={fillTitle ?? color}>
        {title}
      </text>
      <text x={x + w / 2} y={y + 42} textAnchor="middle" fontSize="10" fontFamily="monospace" fill="hsl(222 14% 45%)">
        {sub}
      </text>
      {running && (
        <circle cx={x + w - 10} cy={y + 10} r="3.5" fill={color}>
          <animate attributeName="opacity" values="1;0.3;1" dur="1.4s" repeatCount="indefinite" />
        </circle>
      )}
    </g>
  );
}

function FTip({ color, label, text }: { color: string; label: string; text: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-elevated/40 p-3 flex gap-3">
      <div className={`w-1 shrink-0 rounded-full ${color}`} />
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-0.5">{label}</div>
        <div className="text-ink-soft leading-relaxed">{text}</div>
      </div>
    </div>
  );
}

function TopStat({ icon: Icon, color, label, value, sub }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; color: string; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] text-ink-mute font-medium tracking-wide">{label}</span>
        <div className={`w-7 h-7 rounded-lg bg-elevated flex items-center justify-center ${color}`}>
          <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
        </div>
      </div>
      <div className="text-[22px] font-bold font-mono tracking-tight text-ink mb-1">{value}</div>
      <div className="text-[11px] text-ink-mute font-mono">{sub}</div>
    </div>
  );
}

function StatusDot({ status }: { status: Model["status"] }) {
  const map = {
    healthy: { color: "bg-success", label: "健康" },
    slow: { color: "bg-warning", label: "降级" },
    down: { color: "bg-danger", label: "下线" },
  };
  const m = map[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-mono">
      <span className={`w-1.5 h-1.5 rounded-full ${m.color}`} />
      <span className="text-ink-soft">{m.label}</span>
    </span>
  );
}
