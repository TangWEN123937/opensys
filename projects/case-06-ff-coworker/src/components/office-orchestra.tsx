"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { employees } from "@/lib/employees";
import { scriptDurationMs } from "@/lib/agent-scripts";

type TrackState = {
  phase: string;
  phaseLabel: string;
  currentTool?: string;
  toolCount: number;
  tokens: number;
  artifacts: number;
  metricCount: number;
  metricCost: number;
  latestThinking: string;
  finished: boolean;
  startedAt: number;
  totalMs: number;
  active: boolean; // 是否有事件正在进
};

type FeedItem = { id: string; from: string; kind: "phase" | "tool" | "artifact" | "log" | "done"; text: string; t: number };

const phaseColor: Record<string, string> = {
  idle: "var(--color-ink-lo)",
  thinking: "var(--color-warmth)",
  retrieving: "var(--color-warmth)",
  tool: "var(--color-warmth-deep)",
  writing: "var(--color-sage)",
  shipping: "var(--color-gold)",
  done: "var(--color-sage)",
};

const phaseText: Record<string, string> = {
  idle: "待命", thinking: "思考", retrieving: "检索", tool: "调工具", writing: "起草", shipping: "投递", done: "完成",
};

const initial = (): Record<string, TrackState> =>
  Object.fromEntries(
    employees.map((e) => [
      e.id,
      {
        phase: "idle", phaseLabel: "待命", toolCount: 0, tokens: 0, artifacts: 0,
        metricCount: 0, metricCost: 0, latestThinking: "", finished: false,
        startedAt: 0, totalMs: scriptDurationMs(e.id), active: false,
      } as TrackState,
    ]),
  );

export function OfficeOrchestra() {
  const [tracks, setTracks] = useState<Record<string, TrackState>>(initial);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [running, setRunning] = useState(false);
  const [finishedAll, setFinishedAll] = useState(false);
  const [aggregates, setAggregates] = useState({ tools: 0, tokens: 0, artifacts: 0, cost: 0 });
  const esRefs = useRef<EventSource[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => () => {
    esRefs.current.forEach((es) => es.close());
    if (tickRef.current) clearInterval(tickRef.current);
  }, []);

  const pushFeed = useCallback((item: Omit<FeedItem, "t" | "id">) => {
    setFeed((prev) => {
      const next: FeedItem = { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, t: Date.now() };
      const arr = [...prev, next];
      return arr.length > 60 ? arr.slice(arr.length - 60) : arr;
    });
  }, []);

  const start = useCallback(() => {
    // 重置
    esRefs.current.forEach((es) => es.close());
    esRefs.current = [];
    setTracks(initial());
    setFeed([]);
    setAggregates({ tools: 0, tokens: 0, artifacts: 0, cost: 0 });
    setFinishedAll(false);
    setRunning(true);
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => setNow(Date.now()), 100);

    let finishedCount = 0;
    const startedAt = Date.now();

    employees.forEach((emp, idx) => {
      // 错峰 0~600ms 启动，让画面更生动
      window.setTimeout(() => {
        const es = new EventSource(`/api/agent/${emp.id}`);
        esRefs.current.push(es);
        setTracks((prev) => ({ ...prev, [emp.id]: { ...prev[emp.id], startedAt: Date.now(), active: true } }));

        es.onmessage = (msg) => {
          let ev: { t: string; [k: string]: unknown };
          try { ev = JSON.parse(msg.data); } catch { return; }

          switch (ev.t) {
            case "boot":
              pushFeed({ from: emp.id, kind: "phase", text: `${emp.name} 接到任务 · ${String(ev.subtitle ?? "")}` });
              break;
            case "phase":
              setTracks((prev) => ({
                ...prev,
                [emp.id]: { ...prev[emp.id], phase: String(ev.phase ?? ""), phaseLabel: String(ev.label ?? "") },
              }));
              break;
            case "tool":
              setTracks((prev) => ({
                ...prev,
                [emp.id]: { ...prev[emp.id], toolCount: prev[emp.id].toolCount + 1, currentTool: String(ev.name) },
              }));
              setAggregates((a) => ({ ...a, tools: a.tools + 1 }));
              pushFeed({ from: emp.id, kind: "tool", text: `${emp.name} → ${String(ev.name)}` });
              break;
            case "token": {
              const text = String(ev.text ?? "");
              setTracks((prev) => {
                const cur = prev[emp.id];
                const merged = (cur.latestThinking + text).slice(-80);
                return { ...prev, [emp.id]: { ...cur, latestThinking: merged, tokens: cur.tokens + Math.ceil(text.length / 2) } };
              });
              setAggregates((a) => ({ ...a, tokens: a.tokens + Math.ceil(text.length / 2) }));
              break;
            }
            case "metric":
              setTracks((prev) => {
                const cur = prev[emp.id];
                const k = String(ev.key);
                const d = Number(ev.delta ?? 0);
                if (k === "todayCount") return { ...prev, [emp.id]: { ...cur, metricCount: cur.metricCount + d } };
                if (k === "cost")       return { ...prev, [emp.id]: { ...cur, metricCost:  cur.metricCost  + d } };
                return prev;
              });
              if (String(ev.key) === "cost") setAggregates((a) => ({ ...a, cost: a.cost + Number(ev.delta ?? 0) }));
              break;
            case "artifact":
              setTracks((prev) => ({
                ...prev,
                [emp.id]: { ...prev[emp.id], artifacts: prev[emp.id].artifacts + 1 },
              }));
              setAggregates((a) => ({ ...a, artifacts: a.artifacts + 1 }));
              pushFeed({ from: emp.id, kind: "artifact", text: `${emp.name} 产出：${String(ev.title)}` });
              break;
            case "log":
              if (ev.level === "warn" || ev.level === "ok") {
                pushFeed({ from: emp.id, kind: "log", text: `${emp.name} · ${String(ev.text)}` });
              }
              break;
            case "done":
              setTracks((prev) => ({ ...prev, [emp.id]: { ...prev[emp.id], finished: true, phase: "done", phaseLabel: "已完成", active: false } }));
              pushFeed({ from: emp.id, kind: "done", text: `${emp.name} 完成 · ${String(ev.summary)}` });
              break;
            case "end":
              es.close();
              finishedCount += 1;
              if (finishedCount >= employees.length) {
                setRunning(false);
                setFinishedAll(true);
                if (tickRef.current) clearInterval(tickRef.current);
                tickRef.current = null;
              }
              break;
          }
        };
        es.onerror = () => { es.close(); };
      }, idx * 110);
    });

    void startedAt;
  }, [pushFeed]);

  const elapsedSec = useMemo(() => {
    const earliest = Math.min(...Object.values(tracks).map((t) => t.startedAt || Number.POSITIVE_INFINITY));
    if (!isFinite(earliest)) return 0;
    return Math.max(0, (now - earliest) / 1000);
  }, [tracks, now]);

  return (
    <div className="space-y-5">
      {/* 控制条 */}
      <div id="orchestra-control" className="paper paper-raised p-5">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <button
            data-testid="run-orchestra"
            onClick={running ? undefined : start}
            disabled={running}
            className="inline-flex items-center gap-3 rounded-md px-5 py-3 font-mono text-[13px] uppercase tracking-[0.18em] text-canvas bg-ink hover:bg-ink-soft transition disabled:opacity-70"
          >
            <span className={`inline-block w-2 h-2 rounded-full ${running ? "bg-warmth animate-pulse" : "bg-sage"}`} />
            {running ? `全员奔跑中 · ${elapsedSec.toFixed(1)}s` : finishedAll ? "再来一天" : "▶ 一键运行一天 · 6 路并行"}
          </button>

          <div className="flex-1 grid grid-cols-4 gap-3">
            <Agg label="工具调用" v={aggregates.tools} />
            <Agg label="token" v={`${(aggregates.tokens / 1000).toFixed(1)}k`} />
            <Agg label="产出" v={aggregates.artifacts} />
            <Agg label="本次成本" v={`¥${aggregates.cost.toFixed(2)}`} />
          </div>
        </div>
      </div>

      {/* 6 路 tracks */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {employees.map((emp) => {
          const tr = tracks[emp.id];
          const elapsed = tr.startedAt ? now - tr.startedAt : 0;
          const pct = tr.finished ? 100 : tr.totalMs > 0 ? Math.min(98, (elapsed / tr.totalMs) * 100) : 0;
          return (
            <Link
              key={emp.id}
              href={`/employee/${emp.id}`}
              data-testid={`track-${emp.id}`}
              className="paper p-4 flex flex-col gap-2.5 hover:border-warmth transition"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-display text-base shrink-0"
                  style={{ background: emp.bgColor, color: emp.accent }}
                >
                  {emp.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[14px] text-ink leading-tight truncate">{emp.name}</div>
                  <div className="font-mono text-[10px] text-ink-lo uppercase tracking-wider truncate">{emp.role}</div>
                </div>
                <span
                  className="font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0"
                  style={{ background: `color-mix(in srgb, ${phaseColor[tr.phase] ?? "#888"} 18%, transparent)`, color: phaseColor[tr.phase] ?? "var(--color-ink-mid)" }}
                >
                  {phaseText[tr.phase] ?? tr.phase}
                </span>
              </div>

              <div className="h-1 rounded-full bg-ink-hair overflow-hidden">
                <div
                  className="h-full transition-[width] duration-100 ease-linear"
                  style={{ width: `${pct}%`, background: phaseColor[tr.phase] ?? "var(--color-warmth)" }}
                />
              </div>

              <div className="text-[11px] text-ink-mid font-mono truncate min-h-[14px]">
                {tr.currentTool ? `→ ${tr.currentTool}` : tr.phaseLabel || "待命"}
              </div>

              <div className="grid grid-cols-3 gap-2 text-center pt-1">
                <Mini label="工具" v={tr.toolCount} />
                <Mini label="token" v={`${(tr.tokens / 1000).toFixed(1)}k`} />
                <Mini label="产出" v={tr.artifacts} />
              </div>

              <div className="text-[10.5px] font-mono text-ink-lo h-[14px] truncate">
                {tr.latestThinking ? `▍ ${tr.latestThinking}` : ""}
              </div>
            </Link>
          );
        })}
      </div>

      {/* 全员事件流 */}
      <div className="paper p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-warmth-deep">全员事件流 · 跨员工协作</div>
          <div className="text-[10px] font-mono text-ink-lo">{feed.length} 事件</div>
        </div>
        <div data-testid="orchestra-feed" className="h-[180px] overflow-y-auto space-y-1.5 pr-1">
          {feed.length === 0 && (
            <div className="text-[12px] text-ink-lo italic">（点 ▶ 一键运行一天 · 6 路并行 · 看完整办公室如何协同）</div>
          )}
          {feed.slice().reverse().map((f) => (
            <div key={f.id} className="flex items-start gap-2 text-[11.5px] leading-snug">
              <span className="font-mono text-[9px] text-ink-lo shrink-0 mt-[2px]">{new Date(f.t).toLocaleTimeString("en-GB").slice(3)}</span>
              <span
                className="font-mono text-[9px] uppercase shrink-0 mt-[2px] px-1 rounded"
                style={{
                  background: f.kind === "artifact" ? "color-mix(in srgb, var(--color-sage) 20%, transparent)" : f.kind === "done" ? "color-mix(in srgb, var(--color-gold) 30%, transparent)" : "var(--color-ink-hair)",
                  color: f.kind === "artifact" ? "var(--color-sage)" : "var(--color-ink-mid)",
                }}
              >
                {f.kind}
              </span>
              <span className="text-ink-mid">{f.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Agg({ label, v }: { label: string; v: number | string }) {
  return (
    <div className="text-center">
      <div className="text-[9px] font-mono uppercase tracking-wider text-ink-lo mb-0.5">{label}</div>
      <div className="num-ticker text-xl text-ink">{typeof v === "number" ? v.toLocaleString() : v}</div>
    </div>
  );
}

function Mini({ label, v }: { label: string; v: number | string }) {
  return (
    <div>
      <div className="text-[9px] font-mono uppercase text-ink-lo">{label}</div>
      <div className="font-mono text-[12px] text-ink">{typeof v === "number" ? v.toLocaleString() : v}</div>
    </div>
  );
}
