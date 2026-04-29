"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Employee } from "@/lib/employees";
import { mechanisms } from "@/lib/mechanisms";
import { scriptDurationMs } from "@/lib/agent-scripts";

type ToolCall = { id: string; name: string; args: Record<string, string | number>; result: string; ms: number; status: "running" | "done" };
type LogLine  = { level: "info" | "ok" | "warn"; text: string; t: number };
type Artifact = { kind: string; title: string; meta?: string };
type MechState = Record<string, { tokens: number; active: boolean; lastNote?: string; pulse: number }>;

const phaseLabel: Record<string, string> = {
  idle: "待命",
  thinking: "思考",
  retrieving: "检索",
  tool: "调工具",
  writing: "起草",
  shipping: "投递",
  done: "完成",
};

const phaseOrder = ["thinking", "retrieving", "tool", "writing", "shipping", "done"];

function badgeColorFor(status: Employee["status"]) {
  return status === "autonomous" ? "var(--color-sage)" : status === "thinking" ? "var(--color-warmth)" : status === "awaiting" ? "var(--color-gold)" : "var(--color-ink-lo)";
}

export function LiveDemo({ employee }: { employee: Employee }) {
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [phase, setPhase] = useState<string>("idle");
  const [phaseLabelText, setPhaseLabelText] = useState<string>("点 ▶ 开始 · 看 TA 怎么干一件事");
  const [bootTitle, setBootTitle] = useState<string>("");
  const [bootSub, setBootSub] = useState<string>("");
  const [thinking, setThinking] = useState<string>("");
  const [tools, setTools] = useState<ToolCall[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [mechState, setMechState] = useState<MechState>({});
  const [metricDelta, setMetricDelta] = useState<{ count: number; cost: number; tokens: number }>({ count: 0, cost: 0, tokens: 0 });
  const [elapsed, setElapsed] = useState(0);
  const [doneSummary, setDoneSummary] = useState<string>("");
  const [runMode, setRunMode] = useState<"live" | "demo" | null>(null);
  const [runModel, setRunModel] = useState<string | undefined>(undefined);

  const totalMs = useMemo(() => scriptDurationMs(employee.id), [employee.id]);
  const esRef = useRef<EventSource | null>(null);
  const startRef = useRef<number>(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const thinkingScrollRef = useRef<HTMLDivElement | null>(null);

  // 滚动思考流到底
  useEffect(() => {
    if (thinkingScrollRef.current) {
      thinkingScrollRef.current.scrollTop = thinkingScrollRef.current.scrollHeight;
    }
  }, [thinking]);

  const reset = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    if (tickerRef.current) clearInterval(tickerRef.current);
    tickerRef.current = null;
    setRunning(false);
    setFinished(false);
    setPhase("idle");
    setPhaseLabelText("点 ▶ 开始 · 看 TA 怎么干一件事");
    setBootTitle("");
    setBootSub("");
    setThinking("");
    setTools([]);
    setLogs([]);
    setArtifacts([]);
    setMechState({});
    setMetricDelta({ count: 0, cost: 0, tokens: 0 });
    setElapsed(0);
    setDoneSummary("");
  }, []);

  useEffect(() => {
    return () => {
      esRef.current?.close();
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, []);

  const start = useCallback(() => {
    reset();
    setRunning(true);
    startRef.current = Date.now();
    tickerRef.current = setInterval(() => {
      setElapsed(Date.now() - startRef.current);
    }, 80);

    const es = new EventSource(`/api/agent/${employee.id}`);
    esRef.current = es;
    es.onmessage = (msg) => {
      let ev: { t: string; [k: string]: unknown };
      try {
        ev = JSON.parse(msg.data);
      } catch {
        return;
      }
      switch (ev.t) {
        case "meta":
          if (ev.mode === "live" || ev.mode === "demo") setRunMode(ev.mode);
          if (typeof ev.model === "string") setRunModel(ev.model);
          break;
        case "boot":
          setBootTitle(String(ev.title ?? ""));
          setBootSub(String(ev.subtitle ?? ""));
          break;
        case "phase":
          setPhase(String(ev.phase ?? "thinking"));
          setPhaseLabelText(String(ev.label ?? ""));
          break;
        case "mechanism": {
          const id = String(ev.id);
          const tokens = Number(ev.tokens ?? 0);
          const note = ev.note ? String(ev.note) : undefined;
          setMechState((prev) => ({
            ...prev,
            [id]: { tokens, active: true, lastNote: note, pulse: (prev[id]?.pulse ?? 0) + 1 },
          }));
          // 0.9s 后取消 active
          window.setTimeout(() => {
            setMechState((prev) => {
              const cur = prev[id];
              if (!cur) return prev;
              return { ...prev, [id]: { ...cur, active: false } };
            });
          }, 900);
          break;
        }
        case "tool": {
          const tool: ToolCall = {
            id: String(ev.id),
            name: String(ev.name),
            args: (ev.args as Record<string, string | number>) ?? {},
            result: String(ev.result ?? ""),
            ms: Number(ev.ms ?? 0),
            status: "running",
          };
          setTools((prev) => [...prev, tool]);
          // simulate spinner: 240ms 后改成 done
          window.setTimeout(() => {
            setTools((prev) => prev.map((t) => (t.id === tool.id ? { ...t, status: "done" } : t)));
          }, Math.min(tool.ms, 600));
          break;
        }
        case "token": {
          const text = String(ev.text ?? "");
          setThinking((prev) => prev + text);
          setMetricDelta((m) => ({ ...m, tokens: m.tokens + Math.ceil(text.length / 2) }));
          break;
        }
        case "log":
          setLogs((prev) => [...prev, { level: (ev.level as LogLine["level"]) ?? "info", text: String(ev.text ?? ""), t: Date.now() }]);
          break;
        case "metric": {
          const k = String(ev.key);
          const delta = Number(ev.delta ?? 0);
          setMetricDelta((prev) => {
            if (k === "todayCount") return { ...prev, count: prev.count + delta };
            if (k === "cost")       return { ...prev, cost:  prev.cost  + delta };
            if (k === "tokens")     return { ...prev, tokens: prev.tokens + delta };
            return prev;
          });
          break;
        }
        case "artifact":
          setArtifacts((prev) => [...prev, { kind: String(ev.kind), title: String(ev.title), meta: ev.meta ? String(ev.meta) : undefined }]);
          break;
        case "done":
          setDoneSummary(String(ev.summary ?? ""));
          setPhase("done");
          setPhaseLabelText("已完成");
          break;
        case "end":
          setRunning(false);
          setFinished(true);
          if (tickerRef.current) clearInterval(tickerRef.current);
          tickerRef.current = null;
          es.close();
          esRef.current = null;
          break;
      }
    };
    es.onerror = () => {
      setLogs((prev) => [...prev, { level: "warn", text: "stream error · 已断开", t: Date.now() }]);
      es.close();
      esRef.current = null;
      setRunning(false);
      if (tickerRef.current) clearInterval(tickerRef.current);
      tickerRef.current = null;
    };
  }, [employee.id, reset]);

  const progress = totalMs > 0 ? Math.min(100, (elapsed / totalMs) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* ───────────── 控制条 ───────────── */}
      <div className="paper p-5">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <button
            data-testid="run-agent"
            onClick={running ? undefined : start}
            disabled={running}
            className="group relative inline-flex items-center gap-3 rounded-md px-5 py-3 font-mono text-[13px] uppercase tracking-[0.18em] text-canvas transition disabled:opacity-70"
            style={{ background: employee.bgColor }}
          >
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: employee.accent }} />
            {running ? "运行中…" : finished ? "再演一次" : "派发任务 · 一键演示"}
          </button>

          {/* 模式徽章 · LIVE = 真调 LLM · DEMO = Mock 剧本 */}
          {runMode && (
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] border"
              style={{
                background: runMode === "live" ? "var(--color-sage-soft)" : "var(--color-warmth-soft)",
                borderColor: runMode === "live" ? "var(--color-sage)" : "var(--color-warmth)",
                color: runMode === "live" ? "var(--color-sage)" : "var(--color-warmth-deep)",
              }}
              title={runMode === "live" ? `真调 ${runModel ?? "LLM"} · 你看到的是真实推理` : "Mock 剧本演示 · 未配 OPENROUTER_API_KEY"}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${runMode === "live" ? "breathe-sage" : ""}`}
                style={{ background: runMode === "live" ? "var(--color-sage)" : "var(--color-warmth)" }}
              />
              {runMode === "live" ? `🟢 LIVE · ${runModel?.split("/").pop() ?? "LLM"}` : "🟡 DEMO · Mock"}
            </div>
          )}

          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center justify-between text-[10px] font-mono text-ink-lo uppercase tracking-wider mb-1.5">
              <span>{running ? "streaming" : finished ? "完成" : "待命"} · phase: {phaseLabel[phase] ?? phase}</span>
              <span>{(elapsed / 1000).toFixed(1)}s / 预计 {(totalMs / 1000).toFixed(1)}s</span>
            </div>
            <div className="h-1.5 rounded-full bg-ink-hair overflow-hidden">
              <div
                className="h-full transition-[width] duration-100 ease-linear"
                style={{ width: `${progress}%`, background: badgeColorFor(employee.status) }}
              />
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[10px] font-mono text-ink-lo">
              {phaseOrder.map((p) => {
                const reached = phaseOrder.indexOf(phase) >= phaseOrder.indexOf(p) && phase !== "idle";
                return (
                  <span key={p} className={`px-1.5 py-0.5 rounded ${reached ? "bg-warmth/20 text-warmth-deep" : "bg-ink-hair text-ink-lo"}`}>
                    {phaseLabel[p]}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* boot 信息 */}
        {(bootTitle || bootSub) && (
          <div className="mt-4 pt-4 border-t border-ink-hair">
            <div className="text-[11px] font-mono uppercase tracking-wider text-ink-lo mb-1">incoming task</div>
            <div className="font-display text-lg text-ink leading-tight">{bootTitle}</div>
            <div className="text-[13px] text-ink-mid mt-0.5">{bootSub}</div>
          </div>
        )}

        {phaseLabelText && running && (
          <div className="mt-3 flex items-center gap-2 text-[12px] text-ink-mid">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-warmth breathe-sage" />
            <span className="font-mono">{phaseLabelText}</span>
          </div>
        )}
      </div>

      {/* ───────────── 主体：左思考 + 8 机制 ｜ 右工具 + 产出 ───────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6">
        {/* 左 */}
        <div className="space-y-5">
          {/* 思考流 */}
          <div className="paper p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-warmth-deep">
                思考流 · streaming output
              </div>
              <div className="font-mono text-[10px] text-ink-lo">
                ~{metricDelta.tokens} tokens
              </div>
            </div>
            <div
              ref={thinkingScrollRef}
              data-testid="thinking-stream"
              className="bg-paper/60 rounded border border-ink-hair px-4 py-3 h-[180px] overflow-y-auto font-mono text-[12.5px] leading-relaxed text-ink whitespace-pre-wrap"
            >
              {thinking || (
                <span className="text-ink-lo italic">
                  {running ? "▍ 正在准备…" : "（点 ▶ 派发任务 · 看到 TA 真实的思考流和工具调用过程）"}
                </span>
              )}
              {running && thinking && <span className="inline-block w-2 h-4 align-text-bottom ml-0.5 bg-warmth animate-pulse" />}
            </div>
          </div>

          {/* 8 机制脉动 */}
          <div className="paper p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-warmth-deep">
                Context Engineering 8 大机制 · 实时占用
              </div>
              <div className="text-[10px] font-mono text-ink-lo">
                Anthropic 2025-09-29
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {mechanisms.map((m) => {
                const st = mechState[m.id];
                const tokens = st?.tokens ?? 0;
                const active = !!st?.active;
                const used   = !!st;
                const pct = Math.min(100, tokens / 12);
                return (
                  <div
                    key={m.id}
                    data-testid={`mech-${m.id}`}
                    data-active={active ? "1" : "0"}
                    className={`relative rounded p-3 border transition-all duration-300 ${active ? "border-warmth bg-warmth/8 shadow-[0_0_0_3px_rgba(217,119,87,0.15)]" : used ? "border-sage/40 bg-sage/5" : "border-ink-hair bg-canvas"}`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-lg leading-none">{m.icon}</span>
                      <span className="font-mono text-[9px] text-ink-lo">0{m.number}</span>
                    </div>
                    <div className="font-display text-[13px] text-ink leading-tight">{m.nameZh}</div>
                    <div className="font-mono text-[9px] text-ink-lo uppercase tracking-wider mt-0.5 truncate">
                      {m.nameEn}
                    </div>
                    <div className="mt-2.5">
                      <div className="flex items-center justify-between text-[9px] font-mono text-ink-lo mb-0.5">
                        <span>{used ? "in use" : "idle"}</span>
                        <span>{tokens.toLocaleString()}t</span>
                      </div>
                      <div className="h-1 rounded-full bg-ink-hair overflow-hidden">
                        <div
                          className="h-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: active ? "var(--color-warmth)" : used ? "var(--color-sage)" : "transparent" }}
                        />
                      </div>
                    </div>
                    {st?.lastNote && (
                      <div className="mt-2 text-[10px] text-ink-mid leading-snug line-clamp-2">
                        {st.lastNote}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 右 */}
        <div className="space-y-5">
          {/* live metrics */}
          <div className="paper p-5">
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-warmth-deep mb-3">
              实时计数器
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Metric label={employee.metrics.todayLabel.replace("今日", "+")} value={`+${metricDelta.count}`} accent="warmth-deep" />
              <Metric label="本次成本" value={`¥${metricDelta.cost.toFixed(2)}`} accent="ink" />
              <Metric label="token" value={`${(metricDelta.tokens / 1000).toFixed(1)}k`} accent="sage" />
            </div>
          </div>

          {/* tool calls */}
          <div className="paper p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-warmth-deep">
                工具调用栈 · {tools.length}
              </div>
              {tools.length > 0 && <span className="font-mono text-[10px] text-ink-lo">最新在底</span>}
            </div>
            <div data-testid="tool-stack" className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {tools.length === 0 && (
                <div className="text-[12px] text-ink-lo italic">（暂无 · 任务派发后此处会涌现工具调用）</div>
              )}
              {tools.map((t) => (
                <div key={t.id} className="rounded border border-ink-hair px-3 py-2 bg-canvas">
                  <div className="flex items-center justify-between gap-2">
                    <code className="font-mono text-[12px] text-ink truncate">{t.name}</code>
                    <span className={`font-mono text-[10px] shrink-0 ${t.status === "done" ? "text-sage" : "text-warmth-deep"}`}>
                      {t.status === "done" ? `✓ ${t.ms}ms` : "● running"}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[10.5px] text-ink-lo truncate">
                    {Object.entries(t.args).map(([k, v]) => `${k}=${typeof v === "string" && v.length > 40 ? v.slice(0, 40) + "…" : v}`).join(" · ")}
                  </div>
                  {t.status === "done" && (
                    <div className="mt-1 text-[11px] text-ink-mid leading-snug">
                      → {t.result}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* logs */}
          {logs.length > 0 && (
            <div className="paper p-5">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-warmth-deep mb-3">系统日志</div>
              <div className="space-y-1.5">
                {logs.map((l, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11.5px] leading-snug">
                    <span className={`font-mono text-[9px] uppercase shrink-0 mt-[2px] px-1 rounded ${l.level === "ok" ? "bg-sage/20 text-sage" : l.level === "warn" ? "bg-gold/30 text-ink" : "bg-ink-hair text-ink-mid"}`}>
                      {l.level}
                    </span>
                    <span className="text-ink-mid">{l.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* artifacts */}
          {artifacts.length > 0 && (
            <div className="paper p-5" data-testid="artifacts">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-warmth-deep mb-3">
                产出 · artifacts
              </div>
              <div className="space-y-2">
                {artifacts.map((a, i) => (
                  <div
                    key={i}
                    className="rounded border border-warmth/40 bg-warmth/5 px-3 py-2 animate-[fade-in_0.4s_ease-out]"
                    style={{ animation: "fade-in 0.4s ease-out" }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{kindIcon(a.kind)}</span>
                      <span className="font-display text-[14px] text-ink leading-tight">{a.title}</span>
                    </div>
                    {a.meta && <div className="mt-0.5 text-[11px] text-ink-mid font-mono">{a.meta}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* done summary */}
          {doneSummary && (
            <div className="paper paper-raised p-5 border-l-4" style={{ borderColor: "var(--color-sage)" }} data-testid="done-summary">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-sage mb-2">DONE</div>
              <div className="text-[14px] text-ink leading-snug">{doneSummary}</div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div>
      <div className="text-[9px] font-mono uppercase tracking-wider text-ink-lo mb-0.5 truncate">{label}</div>
      <div className={`num-ticker text-2xl text-${accent}`}>{value}</div>
    </div>
  );
}

function kindIcon(kind: string): string {
  switch (kind) {
    case "pr":     return "🔀";
    case "image":  return "🖼";
    case "email":  return "✉️";
    case "report": return "📊";
    case "alert":  return "🛡";
    case "ticket": return "🎫";
    default:       return "📦";
  }
}
