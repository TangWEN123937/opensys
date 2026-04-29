"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BreathingDot } from "@/components/motion/breathing-dot";
import { StarField } from "@/components/motion/star-field";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  X,
  Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GoalMock, TimelineEventMock } from "@/lib/mock-data";

interface ReplayPlayerProps {
  goal: GoalMock;
}

const SPEEDS = [0.5, 1, 2, 4] as const;

/**
 * Replay Timeline —— FF-Autopilot 行车记录仪 · 独门差异化。
 * 横向 scrubber · 事件 dot · hover thought bubble · 播放控制 · 速度档位
 */
export function ReplayPlayer({ goal }: ReplayPlayerProps) {
  const events = goal.events;
  const [cursor, setCursor] = useState(events.length - 1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-play effect
  useEffect(() => {
    if (!playing) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    const interval = 1500 / speed;
    timerRef.current = setInterval(() => {
      setCursor((c) => {
        if (c >= events.length - 1) {
          setPlaying(false);
          return c;
        }
        return c + 1;
      });
    }, interval);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playing, speed, events.length]);

  const activeEvent = events[cursor];
  const hoverEvent = hoverIndex !== null ? events[hoverIndex] : null;

  return (
    <div className="fixed inset-0 bg-void flex flex-col">
      {/* ambient deco */}
      <StarField count={18} seed={99} className="opacity-40" />
      <div className="pointer-events-none absolute inset-0 bg-radial-spot" aria-hidden />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-stroke">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard">
              <X className="h-4 w-4" />
              关闭
            </Link>
          </Button>
          <div className="h-5 w-px bg-stroke" />
          <div className="flex items-center gap-2">
            <BreathingDot size="xs" />
            <span className="text-xs font-mono text-text-lo">回放</span>
            <span className="text-sm font-medium truncate max-w-md">
              {goal.title}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono text-text-lo">
          <span>
            启动 <span className="text-text-mid">{goal.createdAt}</span>
          </span>
          <span>·</span>
          <span>
            事件 <span className="text-text-mid">{events.length}</span>
          </span>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 overflow-hidden grid grid-cols-12 gap-0">
        {/* Left: current event detail */}
        <section className="col-span-12 lg:col-span-8 p-8 lg:p-14 overflow-y-auto">
          <div className="max-w-2xl mx-auto">
            <div className="text-[10px] font-mono text-text-lo mb-3 uppercase tracking-wider">
              事件 {cursor + 1} / {events.length} · {activeEvent?.time ?? "--"}
            </div>

            <EventDetail event={activeEvent} />

            <ContextSummary events={events.slice(0, cursor + 1)} />
          </div>
        </section>

        {/* Right: events list */}
        <aside className="hidden lg:block col-span-4 border-l border-stroke overflow-y-auto">
          <div className="sticky top-0 bg-void/80 backdrop-blur-xl border-b border-stroke px-5 py-3">
            <div className="text-xs uppercase tracking-wider text-text-lo">
              全部事件
            </div>
          </div>
          <ol className="p-2 space-y-0.5">
            {events.map((e, i) => (
              <EventRow
                key={e.id}
                event={e}
                index={i}
                active={i === cursor}
                onClick={() => {
                  setCursor(i);
                  setPlaying(false);
                }}
              />
            ))}
          </ol>
        </aside>
      </main>

      {/* Bottom play bar */}
      <footer className="relative z-10 border-t border-stroke bg-panel/60 backdrop-blur-xl px-6 py-4">
        <div className="flex items-center gap-4">
          {/* Transport */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setCursor((c) => Math.max(0, c - 1));
                setPlaying(false);
              }}
            >
              <SkipBack className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="accent"
              size="icon"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setCursor((c) => Math.min(events.length - 1, c + 1));
                setPlaying(false);
              }}
            >
              <SkipForward className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Speed */}
          <div className="flex items-center gap-1.5 rounded-full border border-stroke bg-white/[0.02] px-2 py-1">
            <Gauge className="h-3 w-3 text-text-lo ml-1" />
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-mono transition-colors",
                  speed === s
                    ? "bg-alive/15 text-alive"
                    : "text-text-lo hover:text-white"
                )}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Scrubber */}
          <div className="flex-1 relative">
            <div className="relative h-6 flex items-center">
              {/* base line */}
              <div className="absolute left-0 right-0 h-px bg-stroke" />
              {/* progress */}
              <div
                className="absolute left-0 h-px bg-gradient-to-r from-alive via-violet to-magenta transition-all duration-300"
                style={{
                  width: `${(cursor / Math.max(events.length - 1, 1)) * 100}%`,
                }}
              />
              {/* dots */}
              {events.map((e, i) => {
                const pos = (i / Math.max(events.length - 1, 1)) * 100;
                const isActive = i === cursor;
                const isPast = i < cursor;
                return (
                  <button
                    key={e.id}
                    onClick={() => {
                      setCursor(i);
                      setPlaying(false);
                    }}
                    onMouseEnter={() => setHoverIndex(i)}
                    onMouseLeave={() => setHoverIndex(null)}
                    className={cn(
                      "absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-all",
                      isActive
                        ? "h-3.5 w-3.5 bg-alive ring-4 ring-alive/20 shadow-[0_0_12px_rgba(0,212,255,0.8)]"
                        : isPast
                        ? "h-2 w-2 bg-alive/70 hover:scale-125"
                        : "h-1.5 w-1.5 bg-text-lo hover:scale-150 hover:bg-white"
                    )}
                    style={{ left: `${pos}%`, top: "50%" }}
                    aria-label={`Event ${i + 1}: ${e.content.slice(0, 40)}`}
                  />
                );
              })}

              {/* hover bubble */}
              {hoverEvent && hoverIndex !== null && (
                <div
                  className="absolute -translate-x-1/2 bottom-full mb-3 z-20 glass-strong rounded-lg px-3 py-2 text-xs whitespace-nowrap pointer-events-none max-w-sm"
                  style={{
                    left: `${(hoverIndex / Math.max(events.length - 1, 1)) * 100}%`,
                  }}
                >
                  <div className="font-mono text-[10px] text-text-lo mb-1">
                    {hoverEvent.time} · {hoverEvent.type}
                  </div>
                  <div className="text-text-hi text-ellipsis overflow-hidden max-w-xs">
                    {hoverEvent.content.length > 80
                      ? hoverEvent.content.slice(0, 80) + "…"
                      : hoverEvent.content}
                  </div>
                </div>
              )}
            </div>

            {/* Timeline labels */}
            <div className="mt-1 flex justify-between text-[10px] font-mono text-text-lo">
              <span>{events[0]?.time ?? "--"}</span>
              <span>当前</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ────────── event detail block ────────── */

function EventDetail({ event }: { event: TimelineEventMock | undefined }) {
  if (!event) return null;

  if (event.type === "reasoning") {
    return (
      <>
        <div className="text-[10px] font-mono text-alive uppercase tracking-widest mb-3">
          推理 · reasoning
        </div>
        <p className="text-2xl sm:text-3xl leading-relaxed font-medium italic text-text-hi">
          {event.content}
        </p>
      </>
    );
  }

  if (event.type === "tool_call") {
    return (
      <>
        <div className="text-[10px] font-mono text-alive uppercase tracking-widest mb-3">
          工具调用 · tool call
        </div>
        <div className="rounded-xl border border-alive/30 bg-alive/5 p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-alive opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-alive" />
            </span>
            <span className="font-mono text-lg text-alive">{event.content}</span>
          </div>
          {event.meta && (
            <pre className="text-xs font-mono text-text-mid bg-black/30 rounded-md p-3 overflow-auto">
              {JSON.stringify(event.meta, null, 2)}
            </pre>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="text-xl text-text-mid">{event.content}</div>
  );
}

function ContextSummary({ events }: { events: TimelineEventMock[] }) {
  const reasoning = events.filter((e) => e.type === "reasoning").length;
  const tools = events.filter((e) => e.type === "tool_call").length;
  return (
    <div className="mt-10 pt-6 border-t border-stroke flex gap-6 text-xs font-mono text-text-lo">
      <span>
        已发生 <span className="text-text-hi">{events.length}</span> 个事件
      </span>
      <span>
        <span className="text-text-hi">{reasoning}</span> 条推理
      </span>
      <span>
        <span className="text-text-hi">{tools}</span> 次工具调用
      </span>
    </div>
  );
}

function EventRow({
  event,
  index,
  active,
  onClick,
}: {
  event: TimelineEventMock;
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  const accent = event.type === "reasoning" ? "violet" : event.type === "tool_call" ? "alive" : "text-lo";
  const typeLabel: Record<string, string> = {
    reasoning: "推理",
    tool_call: "工具调用",
    tool_result: "工具返回",
    plan_update: "计划更新",
    approval_needed: "待审批",
    post: "发布",
  };
  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          "group w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors",
          active ? "bg-white/[0.05]" : "hover:bg-white/[0.02]"
        )}
      >
        <span className="mt-1 flex items-center justify-center w-6 h-6 shrink-0 rounded-full bg-white/[0.04] text-[10px] font-mono text-text-lo">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-text-lo">
              {event.time}
            </span>
            <span
              className={cn(
                "text-[9px] uppercase font-mono px-1.5 py-0.5 rounded-full",
                accent === "violet" && "bg-violet/15 text-violet",
                accent === "alive" && "bg-alive/15 text-alive",
                accent === "text-lo" && "bg-white/[0.05] text-text-lo"
              )}
            >
              {typeLabel[event.type] ?? event.type.replace("_", " ")}
            </span>
          </div>
          <p className={cn("mt-1 text-xs truncate", active ? "text-white" : "text-text-mid")}>
            {event.content}
          </p>
        </div>
      </button>
    </li>
  );
}
