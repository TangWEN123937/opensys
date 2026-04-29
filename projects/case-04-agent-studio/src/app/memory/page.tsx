"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import {
  Brain,
  Clock,
  Database,
  Network,
  Trash2,
  Search,
  Sparkles,
  Layers,
} from "lucide-react";

type MemType = "short" | "long" | "vector" | "graph";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}

const tabs: { id: MemType; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; desc: string; color: string }[] = [
  { id: "short", label: "短期记忆", icon: Clock, desc: "会话级上下文 · 10-50 轮", color: "text-info" },
  { id: "long", label: "长期记忆", icon: Brain, desc: "持久化 entity / fact", color: "text-memory" },
  { id: "vector", label: "向量记忆", icon: Database, desc: "语义相似召回", color: "text-mcp" },
  { id: "graph", label: "图记忆", icon: Network, desc: "实体关系图谱", color: "text-skill" },
];

const shortTermTurns = [
  { role: "user", text: "OpenClaw 的 memory 架构是怎么分层的?", t: "2m ago" },
  { role: "agent", text: "OpenClaw 的记忆分 4 层:短期、长期、向量、图。其中长期通过 Dreaming 机制持久化。", t: "2m ago", tokens: 48 },
  { role: "user", text: "Dreaming 具体什么机制?", t: "1m ago" },
  { role: "agent", text: "Dreaming 在系统空闲时把短期记忆按 importance + frequency 打分,超阈值 promote 到长期持久层。", t: "1m ago", tokens: 56 },
  { role: "user", text: "和 Reflexion 有什么区别?", t: "just now" },
];

const longTermFacts = [
  { k: "user.name", v: "muyu", category: "entity", confidence: 0.98, updated: "2 天前" },
  { k: "user.project.active", v: "agent-studio", category: "fact", confidence: 0.95, updated: "今天" },
  { k: "user.pref.color", v: "light theme, navy accent", category: "preference", confidence: 0.85, updated: "今天" },
  { k: "user.pref.lang", v: "中文", category: "preference", confidence: 1.0, updated: "3 天前" },
  { k: "project.stack", v: "Next.js 15 · Tailwind v4 · shadcn", category: "fact", confidence: 0.92, updated: "今天" },
  { k: "user.tz", v: "Asia/Shanghai", category: "fact", confidence: 1.0, updated: "5 天前" },
];

export default function MemoryPage() {
  const [tab, setTab] = useState<MemType>("short");
  const [realFacts, setRealFacts] = useState<typeof longTermFacts | null>(null);
  const [real, setReal] = useState(false);

  useEffect(() => {
    fetch("/api/memory")
      .then((r) => r.json())
      .then((j) => {
        if (j.facts?.length > 0) {
          setRealFacts(
            j.facts.map((f: { key: string; value: string; category: string; confidence: number; updatedAt: number }) => ({
              k: f.key,
              v: f.value,
              category: f.category,
              confidence: f.confidence,
              updated: timeAgo(f.updatedAt),
            })),
          );
          setReal(true);
        }
      })
      .catch(() => {});
  }, []);

  const clearAll = async () => {
    if (!real) return;
    if (!confirm("清空所有记忆?")) return;
    await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear", scope: "all" }),
    });
    location.reload();
  };

  const displayFacts = realFacts ?? longTermFacts;

  return (
    <PageShell
      title="Memory"
      subtitle={`四层记忆 · ${real ? "真 · /api/memory · " + displayFacts.length + " facts" : "演示数据"}`}
      actions={
        <>
          <Badge variant={real ? "success" : "warning"} className="text-[10px]">
            {real ? "● 真数据" : "◯ 演示数据"}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => notify.ok("🌙 Dreaming 已触发", "短期记忆将按 importance × frequency 晋升长期")}>
            <Sparkles className="w-3.5 h-3.5" /> Dreaming · 手动触发
          </Button>
          <Button variant="outline" size="sm" onClick={clearAll}><Trash2 className="w-3.5 h-3.5" /> 清空</Button>
        </>
      }
    >
      {/* Tabs */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-xl border p-4 text-left transition-all ${
                active ? "border-primary bg-primary-tint/50 shadow-sm" : "border-border bg-surface hover:bg-elevated/40 hover:border-ink-mute"
              }`}
            >
              <Icon className={`w-5 h-5 mb-2.5 ${active ? "text-primary" : t.color}`} strokeWidth={1.8} />
              <div className="text-[14px] font-semibold tracking-tight">{t.label}</div>
              <div className="text-[11.5px] text-ink-mute mt-0.5">{t.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Content */}
      {tab === "short" && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
              <h3 className="text-[13px] font-semibold">会话上下文 · 最近 5 轮</h3>
              <Badge variant="mono" className="text-[10px]">5 / 50 slots</Badge>
            </div>
            <div className="divide-y divide-border-subtle">
              {shortTermTurns.map((t, i) => (
                <div key={i} className={`px-5 py-3 ${t.role === "agent" ? "bg-elevated/30" : ""}`}>
                  <div className="flex items-center gap-2 mb-1 text-[11px] font-mono">
                    <Badge variant={t.role === "agent" ? "info" : "outline"} className="text-[10px]">
                      {t.role}
                    </Badge>
                    <span className="text-ink-mute">{t.t}</span>
                    {t.tokens && <span className="text-ink-mute">· {t.tokens} tk</span>}
                  </div>
                  <div className="text-[12.5px] text-ink leading-relaxed">{t.text}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute mb-3 flex items-center gap-1.5">
              <Layers className="w-3 h-3" /> Checkpoint · LangGraph
            </div>
            <div className="space-y-2.5">
              {[
                { id: "ckpt_5", step: 5, node: "Agent · synthesize", status: "current", t: "just now" },
                { id: "ckpt_4", step: 4, node: "Tool · web_search", status: "done", t: "12s ago" },
                { id: "ckpt_3", step: 3, node: "Memory · recall", status: "done", t: "45s ago" },
                { id: "ckpt_2", step: 2, node: "Agent · plan", status: "done", t: "1m ago" },
                { id: "ckpt_1", step: 1, node: "Input", status: "done", t: "1m ago" },
              ].map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-md border border-border-subtle hover:bg-elevated/30 transition-colors">
                  <div className={`w-6 h-6 rounded-full font-mono text-[11px] flex items-center justify-center ${
                    c.status === "current" ? "bg-primary text-primary-foreground" : "bg-elevated text-ink-soft"
                  }`}>
                    {c.step}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium truncate">{c.node}</div>
                    <div className="text-[10.5px] text-ink-mute font-mono">{c.id} · {c.t}</div>
                  </div>
                  {c.status === "current" ? (
                    <Badge variant="info" className="text-[10px]">当前</Badge>
                  ) : (
                    <button
                      onClick={() => notify.ok(`回放 ${c.id}`, `从步骤 ${c.step} · ${c.node} · fork 出新分支`)}
                      className="text-[11px] text-primary hover:underline"
                    >
                      回放
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-border-subtle text-[11px] text-ink-mute leading-relaxed">
              任意 checkpoint 可重放 · 修改参数后从该点重新 fork 出新分支
            </div>
          </div>
        </div>
      )}

      {tab === "long" && (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
            <h3 className="text-[13px] font-semibold">长期记忆 · 持久化 facts / entities / preferences</h3>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-mute" />
              <input placeholder="搜索 key..." className="h-8 pl-8 pr-3 text-[12px] rounded-md border border-border bg-surface w-60 focus:outline-none focus:border-primary/40" />
            </div>
          </div>
          <table className="w-full text-[13px]">
            <thead className="bg-elevated/40 text-[10px] uppercase tracking-wider text-ink-mute">
              <tr>
                <th className="text-left px-5 py-2 font-semibold">Key</th>
                <th className="text-left px-2 py-2 font-semibold">Value</th>
                <th className="text-left px-2 py-2 font-semibold">类型</th>
                <th className="text-right px-2 py-2 font-semibold">置信度</th>
                <th className="text-right px-5 py-2 font-semibold">更新</th>
              </tr>
            </thead>
            <tbody>
              {displayFacts.map((f) => (
                <tr key={f.k} className="border-t border-border-subtle hover:bg-elevated/40">
                  <td className="px-5 py-2.5 font-mono text-[12px] text-primary">{f.k}</td>
                  <td className="px-2 py-2.5 text-ink-soft">{f.v}</td>
                  <td className="px-2 py-2.5">
                    <Badge variant="outline" className="text-[10px]">{f.category}</Badge>
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      <div className="w-12 h-1 bg-border rounded-full overflow-hidden">
                        <div className="h-full bg-success" style={{ width: `${f.confidence * 100}%` }} />
                      </div>
                      <span className="text-[11px] font-mono text-ink-soft w-8 text-right">{(f.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-2.5 text-right text-[11px] text-ink-mute font-mono">{f.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "vector" && <VectorSpace />}
      {tab === "graph" && <MemoryGraph />}
    </PageShell>
  );
}

function VectorSpace() {
  // 50 个点 · 4 category · 2D 散点 · query 点在中央
  const points: Array<{ x: number; y: number; cat: string }> = [];
  for (let i = 0; i < 50; i++) {
    const a = (i / 50) * Math.PI * 2;
    const r = 20 + Math.random() * 35;
    points.push({
      x: 50 + Math.cos(a) * r + (Math.random() - 0.5) * 10,
      y: 50 + Math.sin(a) * r + (Math.random() - 0.5) * 10,
      cat: ["pref", "fact", "entity", "other"][i % 4],
    });
  }
  const catColor: Record<string, string> = {
    pref: "hsl(320 50% 48%)",
    fact: "hsl(210 75% 45%)",
    entity: "hsl(155 50% 38%)",
    other: "hsl(222 10% 55%)",
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[13px] font-semibold">向量空间 · UMAP 2D 投影 · {points.length} 条记忆</h3>
          <Badge variant="mono" className="text-[10px]">1024-dim → 2D</Badge>
        </div>
        <svg viewBox="0 0 100 100" className="w-full aspect-square max-h-[540px] bg-elevated/30 rounded-lg border border-border-subtle">
          {/* grid */}
          {Array.from({ length: 11 }).map((_, i) => (
            <g key={i}>
              <line x1={i * 10} y1="0" x2={i * 10} y2="100" stroke="hsl(222 14% 92%)" strokeWidth="0.1" />
              <line x1="0" y1={i * 10} x2="100" y2={i * 10} stroke="hsl(222 14% 92%)" strokeWidth="0.1" />
            </g>
          ))}
          {/* connections query → top-5 */}
          {points.slice(0, 5).map((p, i) => (
            <line key={`l-${i}`} x1="50" y1="50" x2={p.x} y2={p.y} stroke="hsl(222 60% 40%)" strokeWidth="0.2" strokeDasharray="0.8 0.8" />
          ))}
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={i < 5 ? 0.9 : 0.6} fill={catColor[p.cat]} opacity="0.8" />
          ))}
          {/* query point */}
          <circle cx="50" cy="50" r="1.4" fill="hsl(0 72% 55%)" stroke="white" strokeWidth="0.3" />
          <circle cx="50" cy="50" r="3" fill="none" stroke="hsl(0 72% 55%)" strokeWidth="0.25" opacity="0.5">
            <animate attributeName="r" values="1.4;4;1.4" dur="2s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>
      <div className="space-y-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute mb-2">Query</div>
          <div className="text-[13px] text-ink">OpenClaw memory 架构是怎么分层</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute mb-2">Top-5 召回</div>
          <ul className="space-y-1.5">
            {[
              ["openclaw 主仓库有 4 个 memory 扩展...", 0.892],
              ["memory-core 是 file-backed 的抽象层...", 0.861],
              ["active-memory 是 agentic RAG 子代理层...", 0.834],
              ["memory-wiki 支持 corpus=all...", 0.817],
              ["Dreaming 机制把短期 memory 在空闲时...", 0.801],
            ].map(([t, s], i) => (
              <li key={i} className="flex items-start gap-2 text-[11.5px]">
                <span className="font-mono text-ink-mute w-5 text-right shrink-0">#{i + 1}</span>
                <span className="flex-1 text-ink-soft line-clamp-1">{t}</span>
                <Badge variant="outline" className="text-[9.5px] shrink-0">{(s as number).toFixed(3)}</Badge>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute mb-2">图例</div>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            {[
              ["偏好", "hsl(320 50% 48%)"],
              ["事实", "hsl(210 75% 45%)"],
              ["实体", "hsl(155 50% 38%)"],
              ["其他", "hsl(222 10% 55%)"],
            ].map(([l, c]) => (
              <div key={l} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
                <span>{l}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 col-span-2">
              <div className="w-2.5 h-2.5 rounded-full bg-danger" />
              <span>Query 点</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MemoryGraph() {
  // 一个简单图 · 几个 entity + relation
  const nodes = [
    { id: "muyu", x: 50, y: 50, label: "muyu", type: "Person" },
    { id: "agent-studio", x: 35, y: 25, label: "agent-studio", type: "Project" },
    { id: "openclaw", x: 70, y: 28, label: "OpenClaw", type: "Tool" },
    { id: "nextjs", x: 22, y: 65, label: "Next.js", type: "Tech" },
    { id: "tailwind", x: 50, y: 78, label: "Tailwind", type: "Tech" },
    { id: "shadcn", x: 80, y: 65, label: "shadcn", type: "Tech" },
    { id: "ragas", x: 82, y: 48, label: "RAGAS", type: "Tool" },
  ];
  const edges = [
    ["muyu", "agent-studio", "creates"],
    ["muyu", "openclaw", "uses"],
    ["agent-studio", "nextjs", "built with"],
    ["agent-studio", "tailwind", "styled with"],
    ["agent-studio", "shadcn", "uses"],
    ["agent-studio", "ragas", "evaluated by"],
  ];
  const typeColor: Record<string, string> = {
    Person: "hsl(222 60% 40%)",
    Project: "hsl(38 92% 50%)",
    Tool: "hsl(185 65% 42%)",
    Tech: "hsl(155 50% 38%)",
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[13px] font-semibold">实体关系图 · {nodes.length} 节点 · {edges.length} 关系</h3>
          <Badge variant="mono" className="text-[10px]">graphology · forceAtlas2</Badge>
        </div>
        <svg viewBox="0 0 100 100" className="w-full aspect-square max-h-[540px] bg-elevated/30 rounded-lg border border-border-subtle">
          {edges.map(([s, t, r], i) => {
            const sn = nodes.find((n) => n.id === s)!;
            const tn = nodes.find((n) => n.id === t)!;
            return (
              <g key={i}>
                <line x1={sn.x} y1={sn.y} x2={tn.x} y2={tn.y} stroke="hsl(222 14% 70%)" strokeWidth="0.18" />
                <text
                  x={(sn.x + tn.x) / 2}
                  y={(sn.y + tn.y) / 2 - 0.8}
                  textAnchor="middle"
                  fontSize="1.6"
                  fontFamily="monospace"
                  fill="hsl(222 14% 50%)"
                >
                  {r}
                </text>
              </g>
            );
          })}
          {nodes.map((n) => (
            <g key={n.id}>
              <circle cx={n.x} cy={n.y} r="2.6" fill={typeColor[n.type]} opacity="0.9" />
              <text x={n.x} y={n.y + 4.8} textAnchor="middle" fontSize="2.2" fontFamily="monospace" fill="hsl(222 25% 20%)" fontWeight="600">
                {n.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="space-y-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute mb-3">图例 · 实体类型</div>
          <div className="space-y-1.5 text-[11.5px]">
            {Object.entries(typeColor).map(([t, c]) => (
              <div key={t} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
                <span className="font-mono">{t}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute mb-2">统计</div>
          <div className="space-y-1.5 text-[12px]">
            <KV k="节点" v={`${nodes.length}`} />
            <KV k="关系" v={`${edges.length}`} />
            <KV k="社区" v="3" />
            <KV k="平均度" v="2.14" />
          </div>
        </div>
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-mute">{k}</span>
      <span className="font-mono text-ink font-medium">{v}</span>
    </div>
  );
}
