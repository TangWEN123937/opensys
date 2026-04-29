"use client";

import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * 加速时钟 · 顶部大字 Day 1 → Day 30
 * 数字 spring tween · 左右小字显示 wall_time / speed
 */
export function AccelClock({
  day,
  totalDays,
  speed,
  status,
}: {
  day: number;
  totalDays: number;
  speed: number;
  status: string;
}) {
  const mv = useMotionValue(day);
  const spring = useSpring(mv, { stiffness: 120, damping: 18 });
  const display = useTransform(spring, (v) => Math.round(v));

  useEffect(() => {
    mv.set(day);
  }, [day, mv]);

  const pct = Math.min(1, day / totalDays);

  return (
    <div className="flex items-center gap-5 px-6 py-3 border-b border-stroke bg-void/85 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center h-10 w-10 shrink-0">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="17" stroke="currentColor" className="text-stroke" strokeWidth="3" fill="none" />
            <circle
              cx="20"
              cy="20"
              r="17"
              stroke="currentColor"
              className={cn(
                "transition-colors",
                status === "awaiting_approval"
                  ? "text-amber-400"
                  : status === "done"
                  ? "text-emerald-400"
                  : "text-alive"
              )}
              strokeWidth="3"
              fill="none"
              strokeDasharray={`${2 * Math.PI * 17}`}
              strokeDashoffset={`${2 * Math.PI * 17 * (1 - pct)}`}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 400ms cubic-bezier(0.22,1,0.36,1)" }}
            />
          </svg>
          <span className="text-[9px] font-mono text-text-mid">{Math.round(pct * 100)}%</span>
        </div>
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-text-lo">Day</span>
            <motion.span className="text-xl font-semibold tabular-nums">{display}</motion.span>
            <span className="text-[10px] font-mono text-text-lo">/ {totalDays}</span>
          </div>
          <div className="text-[10px] font-mono text-text-lo">
            30 天压缩 · 时间流速 {speed}x
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="relative h-[3px] rounded-full bg-stroke overflow-hidden">
          <motion.div
            className={cn(
              "absolute left-0 top-0 bottom-0",
              status === "awaiting_approval"
                ? "bg-amber-400"
                : status === "done"
                ? "bg-emerald-400"
                : "bg-gradient-to-r from-alive via-violet-400 to-pink-400"
            )}
            initial={false}
            animate={{ width: `${pct * 100}%` }}
            transition={{ type: "spring", stiffness: 100, damping: 24 }}
          />
          {status === "running" && (
            <motion.div
              className="absolute top-0 bottom-0 w-[60px] bg-gradient-to-r from-transparent via-white/40 to-transparent"
              animate={{ left: ["-60px", "100%"] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
            />
          )}
        </div>
        <div className="mt-1 flex items-center gap-3 text-[10px] font-mono text-text-lo">
          <span>status · {statusLabel(status)}</span>
          {status === "awaiting_approval" && (
            <span className="text-amber-300">时间暂停 · 等你审批</span>
          )}
        </div>
      </div>
    </div>
  );
}

function statusLabel(s: string) {
  return s === "running"
    ? "自主推进中"
    : s === "awaiting_approval"
    ? "等待审批"
    : s === "done"
    ? "30 天完成"
    : s === "planning"
    ? "Plan 生成中"
    : s === "failed"
    ? "失败"
    : s;
}
