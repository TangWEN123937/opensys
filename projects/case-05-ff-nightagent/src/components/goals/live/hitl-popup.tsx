"use client";

import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, Check, X } from "lucide-react";

export function HitlPopup({
  hitl,
  onApprove,
  onReject,
}: {
  hitl: { preview: string; task_id: string; reason: string } | null;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <AnimatePresence>
      {hitl && (
        <>
          <motion.div
            key="flash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-40"
            style={{
              boxShadow: "inset 0 0 120px 20px hsl(38 90% 55% / 0.3)",
              animation: "hitl-flash 1.4s ease-in-out infinite",
            }}
          />
          <motion.div
            key="hitl"
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="fixed top-20 right-6 z-50 w-[420px] rounded-2xl border-2 border-amber-500/60 bg-[#0E0B05] shadow-[0_24px_80px_-20px_rgba(251,191,36,0.4)] overflow-hidden"
            data-testid="hitl-popup"
          >
            <div className="px-5 py-3 bg-amber-500/10 border-b border-amber-500/30 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <div className="flex-1">
                <div className="text-xs font-medium text-amber-300">
                  ⏸ 时间暂停 · 等待你审批
                </div>
                <div className="text-[10px] font-mono text-amber-400/70">
                  task · {hitl.task_id}
                </div>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-lo">
                触发原因
              </div>
              <div className="text-xs text-text-mid leading-relaxed">{hitl.reason}</div>

              <div className="text-[10px] font-mono uppercase tracking-wider text-text-lo mt-4">
                即将发送的内容
              </div>
              <div className="rounded-xl border border-stroke bg-black/40 p-3">
                <p className="text-sm text-text-hi leading-relaxed">{hitl.preview}</p>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  onClick={onApprove}
                  data-testid="btn-hitl-approve"
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl h-10 bg-gradient-to-r from-emerald-500 to-cyan-500 text-void font-medium text-sm hover:brightness-110 transition-all shadow-[0_6px_20px_-6px_rgba(16,185,129,0.5)]"
                >
                  <Check className="h-3.5 w-3.5" />
                  批准 · 让 Agent 继续
                </button>
                <button
                  onClick={onReject}
                  data-testid="btn-hitl-reject"
                  className="inline-flex items-center gap-2 rounded-xl h-10 px-4 border border-stroke-strong text-text-hi hover:bg-white/5 transition-colors text-sm"
                >
                  <X className="h-3.5 w-3.5" />
                  拒绝
                </button>
              </div>

              <div className="pt-2 text-[10px] font-mono text-text-lo/70">
                教学点 · 这是 durable execution 真暂停 · 不是 if-else · Inngest waitForEvent 同款
              </div>
            </div>
          </motion.div>
          <style jsx>{`
            @keyframes hitl-flash {
              0%,
              100% {
                box-shadow: inset 0 0 60px 10px hsl(38 90% 55% / 0.12);
              }
              50% {
                box-shadow: inset 0 0 140px 30px hsl(38 90% 55% / 0.28);
              }
            }
          `}</style>
        </>
      )}
    </AnimatePresence>
  );
}
