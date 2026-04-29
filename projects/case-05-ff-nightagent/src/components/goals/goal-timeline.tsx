"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Brain,
  Wrench,
  Send,
  AlertTriangle,
  FileText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { LinesGradient } from "@/components/shaders/lines-gradient";
import { cn } from "@/lib/utils";

interface TEvent {
  seq: number;
  type: string;
  day: number | null;
  payload: Record<string, unknown>;
  created_at: number;
}

const SPEEDS = [0.5, 1, 2, 4] as const;
type Speed = (typeof SPEEDS)[number];

/** 事件类型视觉映射 */
const TYPE_META: Record<
  string,
  { shape: "circle" | "square" | "diamond" | "triangle"; hue: number; label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  thought: { shape: "circle", hue: 270, label: "thought", icon: Brain },
  tool_call: { shape: "square", hue: 195, label: "tool call", icon: Wrench },
  tool_result: { shape: "square", hue: 170, label: "tool result", icon: Wrench },
  kpi_delta: { shape: "diamond", hue: 145, label: "KPI delta", icon: Sparkles },
  task_status: { shape: "circle", hue: 210, label: "task status", icon: Sparkles },
  handoff: { shape: "diamond", hue: 305, label: "handoff", icon: Send },
  hitl_required: { shape: "triangle", hue: 40, label: "HITL 暂停", icon: AlertTriangle },
  approved: { shape: "circle", hue: 145, label: "approved", icon: Sparkles },
  rejected: { shape: "triangle", hue: 0, label: "rejected", icon: AlertTriangle },
  re_plan: { shape: "diamond", hue: 290, label: "re-plan", icon: Brain },
  weekly_report: { shape: "diamond", hue: 145, label: "weekly report", icon: FileText },
  goal_started: { shape: "circle", hue: 195, label: "run started", icon: Sparkles },
  goal_done: { shape: "circle", hue: 145, label: "run done", icon: Sparkles },
  plan_generated: { shape: "diamond", hue: 195, label: "plan generated", icon: Brain },
  day_tick: { shape: "circle", hue: 215, label: "day tick", icon: Sparkles },
};

export function GoalTimeline({ goalId }: { goalId: string }) {
  const [events, setEvents] = useState<TEvent[]>([]);
  const [title, setTitle] = useState("");
  const [durationDays, setDurationDays] = useState(30);
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [playheadDay, setPlayheadDay] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/goals/${goalId}`)
      .then((r) => r.json())
      .then((g) => {
        setTitle(g.title);
        setDurationDays(g.duration_days);
      })
      .catch(() => undefined);
    // 拉全部历史事件
    const es = new EventSource(`/api/goals/${goalId}/events`);
    const acc: TEvent[] = [];
    es.onmessage = (msg) => {
      try {
        const ev = JSON.parse(msg.data) as TEvent;
        acc.push(ev);
        if (ev.type === "goal_done") {
          setEvents([...acc]);
          es.close();
        }
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      setEvents([...acc]);
      es.close();
    };
    // 兜底拉一次
    const t = window.setTimeout(() => setEvents([...acc]), 2000);
    return () => {
      es.close();
      window.clearTimeout(t);
    };
  }, [goalId]);

  /* 筛出有 day 的事件 · 作为 timeline dots */
  const dottedEvents = useMemo(
    () =>
      events
        .filter((e) => typeof e.day === "number" && e.day > 0 && e.type !== "day_tick")
        .sort((a, b) => (a.day ?? 0) - (b.day ?? 0) || a.seq - b.seq),
    [events]
  );

  const eventsByDay = useMemo(() => {
    const m = new Map<number, TEvent[]>();
    for (const e of dottedEvents) {
      const d = e.day!;
      const arr = m.get(d) ?? [];
      arr.push(e);
      m.set(d, arr);
    }
    return m;
  }, [dottedEvents]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.seq === selectedSeq) ?? null,
    [events, selectedSeq]
  );

  /* 播放 · 按 speed 推进 playheadDay · 遇到 dot 自动 select */
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = (ts: number) => {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;
      setPlayheadDay((prev) => {
        const step = (dt / 1000) * speed * 2; // 1x = 2 day/sec
        const next = Math.min(durationDays, prev + step);
        // 找经过的最新 dot
        const passed = dottedEvents.filter((e) => (e.day ?? 0) <= next);
        if (passed.length) setSelectedSeq(passed[passed.length - 1].seq);
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = 0;
    };
  }, [playing, speed, durationDays, dottedEvents]);

  useEffect(() => {
    if (playheadDay >= durationDays && playing) setPlaying(false);
  }, [playheadDay, durationDays, playing]);

  function dragScrub(clientX: number) {
    const rail = railRef.current;
    if (!rail) return;
    const box = rail.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
    const day = ratio * durationDays;
    setPlayheadDay(day);
    const near = dottedEvents.reduce<TEvent | null>((best, e) => {
      const bd = Math.abs((e.day ?? 0) - day);
      if (!best) return e;
      const cd = Math.abs((best.day ?? 0) - day);
      return bd < cd ? e : best;
    }, null);
    if (near) setSelectedSeq(near.seq);
  }

  return (
    <div className="relative min-h-screen bg-void text-text-hi overflow-hidden">
      <LinesGradient opacity={0.08} hue={195} className="z-0" />

      <header className="relative z-20 px-5 py-3 border-b border-stroke bg-void/90 backdrop-blur-xl flex items-center gap-3">
        <Link
          href={`/goals/${goalId}/live`}
          className="inline-flex items-center gap-1 text-xs text-text-mid hover:text-white"
        >
          <ArrowLeft className="h-3 w-3" />
          回 Live
        </Link>
        <div className="h-4 w-px bg-stroke" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium line-clamp-1">{title || "…"}</div>
          <div className="text-[10px] font-mono text-text-lo">
            Replay Timeline · event-sourced · {dottedEvents.length} dots ·
            {" "}共 {events.length} events
          </div>
        </div>
        <div className="text-[10px] font-mono text-alive">
          🎞 这是 LangChain 永远做不到的
        </div>
      </header>

      {/* 控制条 */}
      <div className="relative z-10 px-6 py-3 border-b border-stroke bg-black/30 flex items-center gap-3">
        <button
          onClick={() => setPlaying((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-alive/40 bg-alive/10 text-alive px-3 py-1.5 text-xs hover:bg-alive/20"
          data-testid="btn-play"
        >
          {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {playing ? "暂停" : "播放"}
        </button>
        <button
          onClick={() => {
            setPlayheadDay(0);
            setSelectedSeq(null);
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-stroke px-3 py-1.5 text-xs text-text-mid hover:bg-white/5"
          data-testid="btn-reset"
        >
          <RotateCcw className="h-3 w-3" />
          Day 1 重播
        </button>
        <div className="flex items-center gap-1 ml-2">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={cn(
                "rounded-md px-2 py-1 text-[10px] font-mono transition-colors",
                speed === s
                  ? "bg-alive/20 text-alive border border-alive/40"
                  : "border border-stroke text-text-mid hover:bg-white/5"
              )}
            >
              {s}x
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => {
              const idx = dottedEvents.findIndex((e) => e.seq === selectedSeq);
              const prev = dottedEvents[Math.max(0, idx - 1)];
              if (prev) {
                setSelectedSeq(prev.seq);
                setPlayheadDay(prev.day ?? 0);
              }
            }}
            className="p-1.5 rounded-md border border-stroke hover:bg-white/5 text-text-mid"
            data-testid="btn-prev-event"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <button
            onClick={() => {
              const idx = dottedEvents.findIndex((e) => e.seq === selectedSeq);
              const next = dottedEvents[Math.min(dottedEvents.length - 1, idx + 1)];
              if (next) {
                setSelectedSeq(next.seq);
                setPlayheadDay(next.day ?? 0);
              }
            }}
            className="p-1.5 rounded-md border border-stroke hover:bg-white/5 text-text-mid"
            data-testid="btn-next-event"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Timeline rail */}
      <div className="relative z-10 px-6 pt-8 pb-6">
        <div className="relative">
          <div className="flex justify-between text-[10px] font-mono text-text-lo mb-2">
            {Array.from({ length: 7 }, (_, i) => Math.round((i * durationDays) / 6)).map((d) => (
              <span key={d}>Day {d === 0 ? 1 : d}</span>
            ))}
          </div>
          <div
            ref={railRef}
            onMouseDown={(e) => {
              dragScrub(e.clientX);
              const onMove = (ev: MouseEvent) => dragScrub(ev.clientX);
              const onUp = () => {
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
              };
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
            className="relative h-24 rounded-xl bg-gradient-to-b from-panel/60 to-black/40 border border-stroke cursor-pointer select-none"
            data-testid="timeline-rail"
          >
            {/* 主轴 */}
            <div className="absolute left-4 right-4 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-stroke" />
            {/* 进度线 */}
            <motion.div
              className="absolute left-4 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-gradient-to-r from-alive to-violet-400"
              style={{
                width: `calc(${(playheadDay / durationDays) * 100}% - ${
                  (playheadDay / durationDays) * 32
                }px)`,
              }}
            />
            {/* Day 节点（整数） */}
            {Array.from({ length: durationDays + 1 }, (_, d) => (
              <div
                key={`t-${d}`}
                className="absolute top-[62%] h-1 w-px bg-text-lo/30"
                style={{ left: `calc(16px + ${(d / durationDays) * 100}% - ${(d / durationDays) * 32}px)` }}
              />
            ))}
            {/* 事件 dots */}
            {dottedEvents.map((e) => {
              const meta = TYPE_META[e.type] ?? TYPE_META.thought;
              const selected = e.seq === selectedSeq;
              const x = (e.day! / durationDays) * 100;
              return (
                <button
                  key={e.seq}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setSelectedSeq(e.seq);
                    setPlayheadDay(e.day ?? 0);
                  }}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group"
                  style={{ left: `calc(16px + ${x}% - ${(x / 100) * 32}px)` }}
                  title={`Day ${e.day} · ${meta.label}`}
                  data-testid={`timeline-dot-${e.seq}`}
                >
                  <DotShape shape={meta.shape} hue={meta.hue} active={selected} />
                  {selected && (
                    <motion.div
                      layoutId="playhead-flag"
                      className="absolute -top-7 left-1/2 -translate-x-1/2 rounded-md bg-alive text-void px-2 py-0.5 text-[10px] font-mono whitespace-nowrap shadow-[0_4px_12px_rgba(0,212,255,0.5)]"
                    >
                      Day {e.day}
                    </motion.div>
                  )}
                </button>
              );
            })}
            {/* Playhead indicator */}
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-alive pointer-events-none"
              style={{
                left: `calc(16px + ${(playheadDay / durationDays) * 100}% - ${
                  (playheadDay / durationDays) * 32
                }px)`,
                boxShadow: "0 0 12px #00D4FF",
              }}
            />
          </div>

          {/* 图例 */}
          <div className="mt-3 flex flex-wrap gap-3 text-[10px] font-mono text-text-lo">
            {(["thought", "tool_call", "handoff", "hitl_required", "re_plan", "weekly_report"] as const).map(
              (t) => {
                const meta = TYPE_META[t];
                return (
                  <div key={t} className="flex items-center gap-1.5">
                    <DotShape shape={meta.shape} hue={meta.hue} size={8} />
                    {meta.label}
                  </div>
                );
              }
            )}
          </div>
        </div>
      </div>

      {/* 详情 pane */}
      <section className="relative z-10 px-6 pb-10">
        <AnimatePresence mode="wait">
          {selectedEvent ? (
            <motion.div
              key={selectedEvent.seq}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
              className="rounded-2xl border border-alive/30 bg-panel/60 backdrop-blur-xl p-5 shadow-[0_20px_60px_-20px_rgba(0,212,255,0.3)]"
              data-testid="event-detail"
            >
              <EventDetail event={selectedEvent} allEvents={events} />
            </motion.div>
          ) : (
            <div className="rounded-2xl border border-dashed border-stroke bg-panel/30 p-8 text-center text-sm text-text-mid">
              拖动时间轴上的 scrubber · 或点击事件点 · 看 agent 当时在做什么
            </div>
          )}
        </AnimatePresence>

        {/* 当日事件清单 */}
        {selectedEvent?.day && (
          <div className="mt-4 rounded-xl border border-stroke bg-panel/30 p-4">
            <div className="text-[10px] font-mono uppercase tracking-wider text-text-lo mb-2">
              Day {selectedEvent.day} 当天完整事件流 · {eventsByDay.get(selectedEvent.day)?.length ?? 0} 条
            </div>
            <ol className="space-y-1 text-[11px] font-mono">
              {(eventsByDay.get(selectedEvent.day) ?? []).map((e) => {
                const m = TYPE_META[e.type] ?? TYPE_META.thought;
                return (
                  <li
                    key={e.seq}
                    onClick={() => setSelectedSeq(e.seq)}
                    className={cn(
                      "flex items-start gap-2 cursor-pointer px-2 py-1 rounded hover:bg-white/5",
                      e.seq === selectedSeq && "bg-alive/10 text-alive"
                    )}
                  >
                    <DotShape shape={m.shape} hue={m.hue} size={8} />
                    <span className="text-text-lo w-16 shrink-0">{m.label}</span>
                    <span className="text-text-mid truncate">{brief(e)}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </section>
    </div>
  );
}

function DotShape({
  shape,
  hue,
  active,
  size = 14,
}: {
  shape: "circle" | "square" | "diamond" | "triangle";
  hue: number;
  active?: boolean;
  size?: number;
}) {
  const s = size;
  const fill = `hsl(${hue} 85% ${active ? 70 : 58}%)`;
  const glow = active ? `0 0 18px hsl(${hue} 85% 60%)` : `0 0 0 transparent`;
  if (shape === "square") {
    return (
      <span
        className="block"
        style={{
          width: s,
          height: s,
          background: fill,
          boxShadow: glow,
          transform: active ? "scale(1.2)" : "scale(1)",
          transition: "all 180ms",
        }}
      />
    );
  }
  if (shape === "diamond") {
    return (
      <span
        className="block"
        style={{
          width: s,
          height: s,
          background: fill,
          transform: `rotate(45deg) ${active ? "scale(1.2)" : "scale(1)"}`,
          boxShadow: glow,
          transition: "all 180ms",
        }}
      />
    );
  }
  if (shape === "triangle") {
    return (
      <span
        className="block"
        style={{
          width: 0,
          height: 0,
          borderLeft: `${s / 2}px solid transparent`,
          borderRight: `${s / 2}px solid transparent`,
          borderBottom: `${s}px solid ${fill}`,
          filter: `drop-shadow(${glow})`,
          transform: active ? "scale(1.15)" : "scale(1)",
          transition: "all 180ms",
        }}
      />
    );
  }
  return (
    <span
      className="block rounded-full"
      style={{
        width: s,
        height: s,
        background: fill,
        boxShadow: glow,
        transform: active ? "scale(1.3)" : "scale(1)",
        transition: "all 180ms",
      }}
    />
  );
}

function EventDetail({ event, allEvents }: { event: TEvent; allEvents: TEvent[] }) {
  const meta = TYPE_META[event.type] ?? TYPE_META.thought;
  const Icon = meta.icon;
  const p = event.payload;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <DotShape shape={meta.shape} hue={meta.hue} active size={16} />
        <Icon className="h-3.5 w-3.5 text-text-mid" />
        <div className="text-sm font-medium">{meta.label}</div>
        {event.day && (
          <span className="text-[10px] font-mono text-text-lo ml-2">Day {event.day}</span>
        )}
        <span className="ml-auto text-[10px] font-mono text-text-lo">seq #{event.seq}</span>
      </div>

      {event.type === "thought" && (
        <div className="text-sm text-text-hi leading-relaxed whitespace-pre-wrap">
          {String(p.text ?? "")}
        </div>
      )}

      {event.type === "tool_call" && (
        <div className="space-y-2">
          <div className="text-xs font-mono text-alive">{String(p.name)}</div>
          <pre className="text-[10px] font-mono text-text-mid bg-black/40 rounded p-2 overflow-x-auto max-h-40">
            {JSON.stringify(p.params ?? {}, null, 2)}
          </pre>
        </div>
      )}

      {event.type === "tool_result" && (
        <pre className="text-[10px] font-mono text-text-mid bg-black/40 rounded p-2 overflow-x-auto max-h-40">
          {JSON.stringify(p.result ?? {}, null, 2)}
        </pre>
      )}

      {event.type === "kpi_delta" && (
        <div className="text-xs">
          <span className="font-medium">{String(p.kpi)}</span> ·
          <span className="text-emerald-300 ml-1">+{Number(p.delta)}</span> ·
          累计 {Number(p.total)}
          <div className="mt-1 text-[11px] text-text-mid">
            来自 · {(p.contributor as { label?: string })?.label ?? "—"}
          </div>
        </div>
      )}

      {event.type === "handoff" && (
        <div className="text-xs">
          <span className="font-mono text-alive">{String(p.from)}</span>
          <span className="mx-2 text-text-lo">→</span>
          <span className="font-mono text-alive">{String(p.to)}</span>
          <div className="mt-1 text-[11px] text-text-mid">payload · {String(p.payload ?? "")}</div>
        </div>
      )}

      {event.type === "hitl_required" && (
        <div className="space-y-2">
          <div className="text-xs text-amber-300">
            {String(p.reason ?? "")}
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            {String(p.preview_body ?? "")}
          </div>
          {(() => {
            const after = allEvents.find(
              (e) => e.seq > event.seq && (e.type === "approved" || e.type === "rejected")
            );
            return after ? (
              <div className="text-[11px] font-mono text-text-lo">
                → 最终 {after.type === "approved" ? "已批准" : "已拒绝"}（seq #{after.seq}）
              </div>
            ) : null;
          })()}
        </div>
      )}

      {event.type === "re_plan" && (
        <div className="space-y-2">
          <div className="text-sm text-text-hi">{String(p.summary ?? "")}</div>
          <ul className="text-[11px] text-text-mid space-y-0.5">
            {((p.adjusted_tasks as { id: string; change: string }[]) ?? []).map((a, i) => (
              <li key={i}>
                · <span className="font-mono text-violet-300">{a.id}</span> · {a.change}
              </li>
            ))}
          </ul>
          {(p.llm as { id?: string })?.id && (
            <div className="text-[10px] font-mono text-text-lo">
              Claude · {(p.llm as { ms: number }).ms}ms · {(p.llm as { id: string }).id}
            </div>
          )}
        </div>
      )}

      {event.type === "weekly_report" && (
        <pre className="text-xs leading-relaxed whitespace-pre-wrap text-text-hi font-sans">
          {String(p.markdown ?? "")}
        </pre>
      )}

      {event.type === "plan_generated" && (
        <div className="space-y-2">
          <div className="text-sm text-text-hi">{String(p.raw_thought ?? "")}</div>
          <div className="text-[11px] font-mono text-text-lo">
            · 生成了 {((p.tasks as unknown[]) ?? []).length} 个 task
          </div>
          {(p.llm as { id?: string })?.id && (
            <div className="text-[10px] font-mono text-alive">
              Claude · {(p.llm as { ms: number }).ms}ms · {(p.llm as { id: string }).id}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function brief(e: TEvent) {
  const p = e.payload as Record<string, unknown>;
  if (e.type === "thought") return String(p.text ?? "").slice(0, 60);
  if (e.type === "tool_call") return String(p.name ?? "");
  if (e.type === "kpi_delta") return `${p.kpi} +${p.delta}`;
  if (e.type === "handoff") return `${p.from} → ${p.to}`;
  if (e.type === "hitl_required") return "等你审批";
  if (e.type === "re_plan") return String(p.summary ?? "").slice(0, 60);
  if (e.type === "weekly_report") return "30 天复盘";
  if (e.type === "plan_generated") return `${((p.tasks as unknown[]) ?? []).length} tasks`;
  return e.type;
}
