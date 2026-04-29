"use client";

import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import {
  FlaskConical,
  Play,
  Plus,
  Upload,
  Download,
  CheckCircle2,
  Circle,
  BarChart3,
} from "lucide-react";

const metrics = [
  { k: "faithfulness", label: "忠实度", score: 0.87, base: 0.82, desc: "答案与上下文一致" },
  { k: "answer_relevancy", label: "答案相关性", score: 0.91, base: 0.85, desc: "答案命中问题意图" },
  { k: "context_precision", label: "上下文精度", score: 0.78, base: 0.72, desc: "召回与问题相关" },
  { k: "context_recall", label: "上下文召回", score: 0.83, base: 0.79, desc: "关键信息被召回" },
  { k: "tool_call_accuracy", label: "工具调用准确率", score: 0.92, base: 0.88, desc: "正确选择 + 参数对" },
  { k: "goal_completion", label: "目标完成度", score: 0.89, base: 0.81, desc: "Agent 任务达成率" },
];

const datasets = [
  { id: "rag-finance", name: "金融问答 500", size: 500, type: "RAG", updated: "2 天前", status: "active" },
  { id: "agent-booking", name: "预订 Agent 测试集", size: 120, type: "Agent", updated: "昨天", status: "active" },
  { id: "tool-use-v2", name: "工具调用 v2", size: 340, type: "Tool", updated: "今天", status: "active" },
  { id: "chat-multiturn", name: "多轮对话 200", size: 200, type: "Chat", updated: "1 周前", status: "archived" },
];

const runs = [
  { id: "eval_1284", name: "research-writer @ v1.2 · RAGAS full", status: "completed", progress: 100, score: 0.87, dataset: "rag-finance", when: "5 分钟前" },
  { id: "eval_1283", name: "code-review @ v0.9 · LLM-as-judge", status: "running", progress: 62, score: null, dataset: "agent-booking", when: "现在" },
  { id: "eval_1282", name: "tool-use-v2 · accuracy bench", status: "completed", progress: 100, score: 0.91, dataset: "tool-use-v2", when: "1 小时前" },
  { id: "eval_1281", name: "sales-qualifier A/B · baseline", status: "completed", progress: 100, score: 0.74, dataset: "chat-multiturn", when: "3 小时前" },
];

export default function EvalPage() {
  return (
    <PageShell
      title="Eval Lab"
      subtitle="RAGAS / DeepEval / AgentOps 评测套件 · 数据集 + 离线跑分 + A/B 对比"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => notify.todo("导入数据集 · CSV / JSONL / HuggingFace")}>
            <Upload className="w-3.5 h-3.5" /> 导入数据集
          </Button>
          <Button size="sm" onClick={() => notify.ok("已启动评测 eval_1285", "跳转 Run Console 查看进度")}>
            <Play className="w-3.5 h-3.5" /> 新建评测
          </Button>
        </>
      }
    >
      {/* Top · Metric radar + bars */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4 mb-5">
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-semibold flex items-center gap-2">
              <FlaskConical className="w-3.5 h-3.5 text-eval" />
              指标雷达
            </h3>
            <Badge variant="mono" className="text-[10px]">v1.2 vs v1.1</Badge>
          </div>
          <RadarChart metrics={metrics} />
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[13px] font-semibold flex items-center gap-2">
              <BarChart3 className="w-3.5 h-3.5 text-primary" />
              RAGAS + AgentOps 指标详情
            </h3>
            <div className="flex items-center gap-2 text-[10.5px] font-mono">
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-primary" /> 当前</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-border" /> 基线</span>
            </div>
          </div>
          <div className="space-y-3">
            {metrics.map((m) => {
              const diff = m.score - m.base;
              return (
                <div key={m.k}>
                  <div className="flex items-center justify-between text-[11.5px] mb-1">
                    <div>
                      <span className="font-mono text-ink font-medium">{m.k}</span>
                      <span className="text-ink-mute ml-2">{m.desc}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-ink-mute">{m.base.toFixed(2)}</span>
                      <span className="text-ink-mute">→</span>
                      <span className="text-ink font-semibold">{m.score.toFixed(2)}</span>
                      <Badge variant={diff > 0 ? "success" : "danger"} className="text-[9px]">
                        {diff > 0 ? "+" : ""}{(diff * 100).toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                  <div className="relative h-5 bg-elevated rounded-sm overflow-hidden">
                    <div className="absolute inset-y-0 bg-border" style={{ width: `${m.base * 100}%` }} />
                    <div className="absolute inset-y-0 bg-primary opacity-80" style={{ width: `${m.score * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Datasets + Runs */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-4">
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
            <h3 className="text-[13px] font-semibold">数据集</h3>
            <Button variant="ghost" size="sm" className="text-[11px]" onClick={() => notify.todo("新建数据集")}>
              <Plus className="w-3 h-3" /> 新建
            </Button>
          </div>
          <ul className="divide-y divide-border-subtle">
            {datasets.map((d) => (
              <li key={d.id} className="px-5 py-3 hover:bg-elevated/30 transition-colors cursor-pointer flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium text-[13px] truncate">{d.name}</div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-ink-mute">
                    <Badge variant="outline" className="text-[9px]">{d.type}</Badge>
                    <span className="font-mono">{d.size} 条</span>
                    <span>·</span>
                    <span>{d.updated}</span>
                  </div>
                </div>
                <div>
                  {d.status === "active" ? (
                    <Badge variant="success" className="text-[10px]">active</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">archived</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
            <h3 className="text-[13px] font-semibold">最近评测运行</h3>
            <Button
              variant="ghost"
              size="sm"
              className="text-[11px]"
              onClick={() => {
                const csv = "id,name,score,dataset\n" + runs.map((r) => `${r.id},${r.name},${r.score ?? ""},${r.dataset}`).join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = "eval-runs.csv"; a.click();
                URL.revokeObjectURL(url);
                notify.ok("已导出 eval-runs.csv");
              }}
            >
              <Download className="w-3 h-3" /> 导出
            </Button>
          </div>
          <ul className="divide-y divide-border-subtle">
            {runs.map((r) => (
              <li key={r.id} className="px-5 py-3.5">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {r.status === "running" ? (
                      <span className="relative w-2 h-2 shrink-0">
                        <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-70" />
                        <span className="relative w-2 h-2 rounded-full bg-primary" />
                      </span>
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium truncate">{r.name}</div>
                      <div className="text-[10.5px] text-ink-mute font-mono mt-0.5">
                        {r.id} · dataset:{r.dataset} · {r.when}
                      </div>
                    </div>
                  </div>
                  {r.score !== null && <Badge variant="mono" className="shrink-0">{r.score.toFixed(2)}</Badge>}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1 bg-border-subtle rounded-full overflow-hidden">
                    <div className={`h-full transition-all ${r.status === "running" ? "bg-primary" : "bg-success"}`} style={{ width: `${r.progress}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-ink-mute w-10 text-right">{r.progress}%</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </PageShell>
  );
}

function RadarChart({ metrics }: { metrics: { k: string; label: string; score: number; base: number }[] }) {
  // 6 轴雷达
  const n = metrics.length;
  const cx = 150;
  const cy = 150;
  const R = 120;
  const pt = (i: number, r: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  const pathFor = (f: (m: (typeof metrics)[number]) => number) =>
    metrics
      .map((m, i) => {
        const [x, y] = pt(i, f(m) * R);
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ") + " Z";

  return (
    <svg viewBox="0 0 300 300" className="w-full max-h-[280px]">
      {/* grid rings */}
      {[0.25, 0.5, 0.75, 1].map((r) => (
        <polygon
          key={r}
          points={metrics.map((_, i) => pt(i, R * r).join(",")).join(" ")}
          fill="none"
          stroke="hsl(222 14% 90%)"
          strokeWidth="1"
        />
      ))}
      {/* axis */}
      {metrics.map((m, i) => {
        const [x, y] = pt(i, R);
        return <line key={m.k} x1={cx} y1={cy} x2={x} y2={y} stroke="hsl(222 14% 90%)" strokeWidth="1" />;
      })}
      {/* base shape */}
      <path d={pathFor((m) => m.base)} fill="hsl(222 14% 70% / 0.15)" stroke="hsl(222 14% 60%)" strokeWidth="1.5" strokeDasharray="4 3" />
      {/* current shape */}
      <path d={pathFor((m) => m.score)} fill="hsl(222 60% 40% / 0.18)" stroke="hsl(222 60% 40%)" strokeWidth="1.8" />
      {/* labels */}
      {metrics.map((m, i) => {
        const [x, y] = pt(i, R + 22);
        return (
          <text key={m.k} x={x} y={y} textAnchor="middle" fontSize="10" fontFamily="monospace" fill="hsl(222 14% 35%)" dominantBaseline="middle">
            {m.label}
          </text>
        );
      })}
      {/* score dots */}
      {metrics.map((m, i) => {
        const [x, y] = pt(i, m.score * R);
        return <circle key={m.k} cx={x} cy={y} r="3" fill="hsl(222 60% 40%)" stroke="white" strokeWidth="1" />;
      })}
    </svg>
  );
}
