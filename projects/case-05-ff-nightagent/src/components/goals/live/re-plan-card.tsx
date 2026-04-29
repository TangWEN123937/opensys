"use client";

import { motion, AnimatePresence } from "motion/react";
import { Sparkles } from "lucide-react";

interface RePlan {
  summary: string;
  adjusted_tasks: { id: string; change: string }[];
  llm?: unknown;
}

export function RePlanCard({ rePlan }: { rePlan: RePlan | null }) {
  return (
    <AnimatePresence>
      {rePlan && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0 }}
          className="rounded-xl border border-violet-500/40 bg-violet-500/[0.04] p-4"
          data-testid="re-plan-card"
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-violet-400" />
            <div className="text-xs font-medium text-violet-300">
              Reflexion · Day 18 重规划
            </div>
            {(rePlan.llm as { id?: string })?.id && (
              <span className="ml-auto text-[10px] font-mono text-violet-400/70">
                Claude · {(rePlan.llm as { ms: number }).ms}ms
              </span>
            )}
          </div>
          <div className="text-xs text-text-hi leading-relaxed mb-3">
            {rePlan.summary}
          </div>
          <ul className="space-y-1.5">
            {rePlan.adjusted_tasks.map((a, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="flex items-start gap-2 text-[11px]"
              >
                <span className="text-violet-400 shrink-0">↻</span>
                <span className="text-text-mid">
                  <span className="font-mono text-violet-300">{a.id}</span>{" "}
                  · {a.change}
                </span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
