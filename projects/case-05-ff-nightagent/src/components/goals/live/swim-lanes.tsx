"use client";

import { useMemo, useRef } from "react";
import { motion } from "motion/react";
import type { PlanTask } from "@/lib/agent/goal-input";
import type { TaskStatus } from "./types";
import { AnimatedBeam } from "@/components/shaders/animated-beam";
import { cn } from "@/lib/utils";
import { Sparkles, FileText, Send, MessageCircle, BookOpen, Check, CircleDot } from "lucide-react";

const LANES: Array<{
  key: PlanTask["lane"];
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hue: number;
}> = [
  { key: "research", label: "研究", icon: Sparkles, hue: 195 },
  { key: "draft", label: "起草", icon: FileText, hue: 275 },
  { key: "publish", label: "发布", icon: Send, hue: 35 },
  { key: "reply", label: "回复", icon: MessageCircle, hue: 140 },
  { key: "report", label: "复盘", icon: BookOpen, hue: 320 },
];

export function SwimLanes({
  tasks,
  taskStates,
  handoffKey,
  lastHandoff,
  currentDay,
  totalDays,
}: {
  tasks: PlanTask[];
  taskStates: Record<string, { status: TaskStatus; progress: number }>;
  handoffKey: number;
  lastHandoff: { from: string; to: string } | null;
  currentDay: number;
  totalDays: number;
}) {
  const laneRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const tasksByLane = useMemo(() => {
    const m = new Map<string, PlanTask[]>();
    LANES.forEach((l) => m.set(l.key, []));
    tasks.forEach((t) => m.get(t.lane)?.push(t));
    return m;
  }, [tasks]);

  const fromRef = useRef<HTMLElement | null>(null);
  const toRef = useRef<HTMLElement | null>(null);
  if (lastHandoff) {
    fromRef.current = laneRefs.current[lastHandoff.from] ?? null;
    toRef.current = laneRefs.current[lastHandoff.to] ?? null;
  }

  return (
    <div className="relative space-y-2.5">
      {LANES.map((l) => {
        const items = tasksByLane.get(l.key) ?? [];
        const anyDoing = items.some(
          (t) => taskStates[t.id]?.status === "doing"
        );
        const Icon = l.icon;
        return (
          <div
            key={l.key}
            ref={(el) => {
              laneRefs.current[l.key] = el;
            }}
            className={cn(
              "relative rounded-xl border p-3 transition-all",
              anyDoing
                ? "border-[color:var(--glow)] bg-[color:var(--glow-bg)]"
                : "border-stroke bg-panel/30"
            )}
            style={
              {
                "--glow": `hsl(${l.hue} 80% 55% / 0.5)`,
                "--glow-bg": `hsl(${l.hue} 80% 50% / 0.05)`,
              } as React.CSSProperties
            }
          >
            <div className="flex items-center gap-3">
              <div
                className="flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] shrink-0 w-[74px]"
                style={{
                  borderColor: `hsl(${l.hue} 80% 55% / 0.5)`,
                  background: `hsl(${l.hue} 80% 55% / 0.1)`,
                  color: `hsl(${l.hue} 85% 68%)`,
                }}
              >
                <Icon className="h-3 w-3" />
                <span className="font-medium">{l.label}</span>
              </div>

              {/* task chips */}
              <div className="flex-1 flex flex-wrap gap-1.5 min-h-[28px]">
                {items.length === 0 && (
                  <span className="text-[10px] font-mono text-text-lo/50">
                    — 本 lane 无任务 —
                  </span>
                )}
                {items.map((t) => {
                  const st = taskStates[t.id] ?? { status: "pending", progress: 0 };
                  return (
                    <TaskChip
                      key={t.id}
                      task={t}
                      status={st.status}
                      progress={st.progress}
                      currentDay={currentDay}
                      hue={l.hue}
                    />
                  );
                })}
              </div>

              {anyDoing && (
                <motion.div
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ background: `hsl(${l.hue} 85% 60%)` }}
                  animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                />
              )}
            </div>

            {/* 进度条 · 由 lane 内所有 doing task 平均 */}
            <LaneProgress items={items} taskStates={taskStates} currentDay={currentDay} totalDays={totalDays} hue={l.hue} />
          </div>
        );
      })}
      {lastHandoff && fromRef.current && toRef.current && (
        <AnimatedBeam
          key={handoffKey}
          fromRef={fromRef as React.RefObject<HTMLElement>}
          toRef={toRef as React.RefObject<HTMLElement>}
          playKey={handoffKey}
          hue={195}
        />
      )}
    </div>
  );
}

function TaskChip({
  task,
  status,
  progress,
  currentDay,
  hue,
}: {
  task: PlanTask;
  status: TaskStatus;
  progress: number;
  currentDay: number;
  hue: number;
}) {
  const [start, end] = task.estimated_days;
  const active = currentDay >= start && currentDay <= end;
  return (
    <motion.div
      layout
      className={cn(
        "relative rounded-md border px-2 py-1 text-[11px] leading-tight max-w-[220px]",
        status === "done"
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
          : status === "doing"
          ? "border-[color:var(--c)] bg-[color:var(--cbg)] text-white shadow-[0_0_14px_-4px_var(--c)]"
          : active
          ? "border-stroke-strong bg-panel/60 text-text-mid"
          : "border-stroke bg-panel/30 text-text-lo/80"
      )}
      style={
        {
          "--c": `hsl(${hue} 85% 60%)`,
          "--cbg": `hsl(${hue} 85% 55% / 0.15)`,
        } as React.CSSProperties
      }
    >
      <div className="flex items-center gap-1.5">
        {status === "done" ? (
          <Check className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
        ) : status === "doing" ? (
          <CircleDot className="h-2.5 w-2.5 animate-pulse shrink-0" style={{ color: `hsl(${hue} 85% 65%)` }} />
        ) : (
          <span className="h-2 w-2 rounded-full border border-text-lo/40 shrink-0" />
        )}
        <span className="truncate">{task.title}</span>
      </div>
      {status === "doing" && progress > 0 && (
        <div className="mt-1 h-[2px] rounded-full bg-stroke overflow-hidden">
          <motion.div
            className="h-full"
            style={{ background: `hsl(${hue} 85% 60%)` }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, progress * 100)}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      )}
    </motion.div>
  );
}

function LaneProgress({
  items,
  taskStates,
  currentDay,
  totalDays,
  hue,
}: {
  items: PlanTask[];
  taskStates: Record<string, { status: TaskStatus; progress: number }>;
  currentDay: number;
  totalDays: number;
  hue: number;
}) {
  if (!items.length) return null;
  // 画 5 个小 day dot，表示当前推进
  const pct =
    items.reduce((s, t) => {
      const st = taskStates[t.id];
      if (st?.status === "done") return s + 1;
      if (st?.status === "doing") return s + st.progress;
      return s;
    }, 0) / items.length;

  return (
    <div className="mt-2 ml-[86px] flex items-center gap-2">
      <div className="relative h-[3px] flex-1 rounded-full bg-stroke overflow-hidden">
        <motion.div
          className="absolute left-0 top-0 bottom-0"
          style={{
            background: `linear-gradient(90deg, hsl(${hue} 80% 60%), hsl(${hue + 40} 80% 65%))`,
          }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ type: "spring", stiffness: 80, damping: 22 }}
        />
      </div>
      <span className="text-[9px] font-mono text-text-lo w-12 text-right">
        Day {currentDay}/{totalDays}
      </span>
    </div>
  );
}
