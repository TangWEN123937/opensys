"use client";

import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import type { PlanTask } from "@/lib/agent/goal-input";
import { Sparkles, FileText, Send, MessageCircle, BookOpen } from "lucide-react";

const LANE_META: Record<
  PlanTask["lane"],
  { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  research: { label: "研究", icon: Sparkles, tone: "text-cyan-400 border-cyan-500/40 bg-cyan-500/10" },
  draft: { label: "起草", icon: FileText, tone: "text-violet-300 border-violet-500/40 bg-violet-500/10" },
  publish: { label: "发布", icon: Send, tone: "text-amber-300 border-amber-500/40 bg-amber-500/10" },
  reply: { label: "回复", icon: MessageCircle, tone: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10" },
  report: { label: "复盘", icon: BookOpen, tone: "text-pink-300 border-pink-500/40 bg-pink-500/10" },
};

export function PlanTreeView({
  tasks,
  compact = false,
}: {
  tasks: PlanTask[];
  compact?: boolean;
}) {
  // 按 lane 分组
  const grouped = new Map<PlanTask["lane"], PlanTask[]>();
  tasks.forEach((t) => {
    const arr = grouped.get(t.lane) ?? [];
    arr.push(t);
    grouped.set(t.lane, arr);
  });

  const lanes: PlanTask["lane"][] = ["research", "draft", "publish", "reply", "report"];

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      <AnimatePresence initial>
        {lanes.map((lane, laneIdx) => {
          const items = grouped.get(lane) ?? [];
          if (!items.length) return null;
          const meta = LANE_META[lane];
          const Icon = meta.icon;
          return (
            <motion.div
              key={lane}
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: laneIdx * 0.12, type: "spring", stiffness: 200, damping: 22 }}
              className={cn("flex items-start gap-3", compact && "gap-2")}
            >
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs shrink-0",
                  meta.tone,
                  compact && "text-[10px] py-0.5 px-2"
                )}
              >
                <Icon className="h-3 w-3" />
                <span className="font-medium">{meta.label}</span>
              </div>
              <div className={cn("flex flex-wrap gap-2", compact && "gap-1.5")}>
                {items.map((t, i) => (
                  <motion.div
                    key={t.id}
                    layoutId={`task-${t.id}`}
                    initial={{ opacity: 0, scale: 0.8, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{
                      delay: laneIdx * 0.12 + i * 0.08,
                      type: "spring",
                      stiffness: 260,
                      damping: 20,
                    }}
                    className={cn(
                      "group relative rounded-xl border border-stroke bg-panel/60 px-3 py-2 max-w-xs",
                      compact && "px-2 py-1.5 max-w-[180px]"
                    )}
                    title={t.reason}
                  >
                    <div
                      className={cn(
                        "text-sm font-medium leading-snug",
                        compact && "text-[11px] leading-tight line-clamp-2"
                      )}
                    >
                      {t.title}
                    </div>
                    {!compact && (
                      <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-text-lo">
                        <span>Day {t.estimated_days[0]}–{t.estimated_days[1]}</span>
                        {t.requires_approval && (
                          <span className="rounded-full bg-amber-500/20 text-amber-300 px-1.5 py-0.5">
                            HITL
                          </span>
                        )}
                      </div>
                    )}
                    {!compact && (
                      <div className="absolute left-full top-1/2 z-20 hidden -translate-y-1/2 translate-x-3 group-hover:block">
                        <div className="rounded-lg border border-stroke bg-void/95 backdrop-blur-xl p-3 text-xs w-64 shadow-2xl">
                          <div className="text-[10px] font-mono uppercase tracking-wider text-alive mb-1">
                            why · Claude 原话
                          </div>
                          <div className="text-text-mid leading-relaxed">{t.reason}</div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
