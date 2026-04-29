"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Clock, FileText, ArrowRight } from "lucide-react";
import { LinesGradient } from "@/components/shaders/lines-gradient";
import { AccelClock } from "./live/accel-clock";
import { KpiRings } from "./live/kpi-rings";
import { KpiDrill } from "./live/kpi-drill";
import { SwimLanes } from "./live/swim-lanes";
import { ThoughtStream } from "./live/thought-stream";
import { HitlPopup } from "./live/hitl-popup";
import { RePlanCard } from "./live/re-plan-card";
import type { KpiName } from "@/lib/agent/goal-input";
import { initialState, reduceEvent, type LiveEvent, type LiveState } from "./live/types";
import { Button } from "@/components/ui/button";

export function GoalLive({ goalId }: { goalId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const fresh = params?.get("fresh") === "1";

  const [state, setState] = useState<LiveState>(initialState);
  const [drillKpi, setDrillKpi] = useState<KpiName | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // SSE
  useEffect(() => {
    const es = new EventSource(`/api/goals/${goalId}/events`);
    es.onmessage = (msg) => {
      try {
        const ev = JSON.parse(msg.data) as LiveEvent;
        setState((prev) => reduceEvent(prev, ev));
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      /* auto-reconnect by browser */
    };
    return () => es.close();
  }, [goalId]);

  // 完成后自动延迟 4s 再提供跳 Replay 按钮 · 给观众喘气时间
  const [ctaReady, setCtaReady] = useState(false);
  useEffect(() => {
    if (state.status === "done") {
      const t = window.setTimeout(() => setCtaReady(true), 3000);
      return () => window.clearTimeout(t);
    }
  }, [state.status]);

  const onApprove = useCallback(async () => {
    await fetch(`/api/goals/${goalId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });
  }, [goalId]);
  const onReject = useCallback(async () => {
    await fetch(`/api/goals/${goalId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "reject" }),
    });
  }, [goalId]);

  const goReplay = useCallback(
    () => router.push(`/goals/${goalId}/timeline`),
    [goalId, router]
  );

  const planTasks = useMemo(() => state.plan?.tasks ?? [], [state.plan]);

  return (
    <div className="relative min-h-screen bg-void text-text-hi overflow-hidden">
      <LinesGradient opacity={0.18} hue={210} className="z-0" />

      <header className="relative z-20 flex items-center justify-between px-5 py-3 border-b border-stroke bg-void/90 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-xs text-text-mid hover:text-white"
          >
            <ArrowLeft className="h-3 w-3" />
            工作台
          </Link>
          <div className="h-4 w-px bg-stroke" />
          <div>
            <div className="text-sm font-medium line-clamp-1 max-w-md" data-testid="goal-title">
              {state.title || "加载中…"}
            </div>
            <div className="text-[10px] font-mono text-text-lo">
              {state.platform} · {state.plan?.llm.id ? "真调 Claude" : "规划中"} ·
              {" "}{state.plan?.tasks.length ?? 0} tasks · run {goalId.slice(0, 8)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {state.status === "done" && (
            <Button
              onClick={goReplay}
              variant="accent"
              size="sm"
              data-testid="btn-go-timeline"
            >
              <Clock className="h-3.5 w-3.5" />
              进入回放
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </header>

      <AccelClock
        day={state.day}
        totalDays={state.durationDays}
        speed={state.speed}
        status={state.status}
      />

      <main className="relative z-10 grid grid-cols-12 gap-4 p-5">
        {/* 左列 · KPI + SwimLanes */}
        <section className="col-span-12 lg:col-span-8 space-y-4 min-w-0">
          <KpiRings totals={state.totals} targets={state.targets} onDrill={setDrillKpi} />
          <div>
            <div className="mb-2 text-[10px] font-mono uppercase tracking-wider text-text-lo flex items-center gap-2">
              <span>Multi-Agent Lanes · Supervisor 分发</span>
              {state.lastHandoff && (
                <motion.span
                  key={state.handoffKey}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-full bg-alive/15 text-alive px-2 py-0.5"
                >
                  ↻ handoff · {state.lastHandoff.from} → {state.lastHandoff.to}
                </motion.span>
              )}
            </div>
            <SwimLanes
              tasks={planTasks}
              taskStates={state.taskStates}
              handoffKey={state.handoffKey}
              lastHandoff={state.lastHandoff}
              currentDay={state.day}
              totalDays={state.durationDays}
            />
          </div>
          <RePlanCard rePlan={state.rePlan} />

          <AnimatePresence>
            {state.report && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-emerald-500/40 bg-emerald-500/[0.03] p-5"
                data-testid="weekly-report"
              >
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-4 w-4 text-emerald-400" />
                  <div className="text-sm font-medium text-emerald-300">
                    30 天自动复盘周报
                  </div>
                  {(state.report.llm as { id?: string })?.id && (
                    <span className="ml-auto text-[10px] font-mono text-emerald-400/70">
                      Claude · {(state.report.llm as { ms: number }).ms}ms
                    </span>
                  )}
                </div>
                <pre className="text-xs leading-relaxed whitespace-pre-wrap text-text-hi font-sans">
                  {state.report.markdown}
                </pre>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* 右列 · ThoughtStream */}
        <section className="col-span-12 lg:col-span-4 min-w-0 h-[calc(100vh-180px)] sticky top-[130px]">
          <ThoughtStream thoughts={state.recentThoughts} tools={state.recentTools} />
        </section>
      </main>

      <HitlPopup hitl={state.hitl} onApprove={onApprove} onReject={onReject} />

      <KpiDrill goalId={goalId} kpi={drillKpi} onClose={() => setDrillKpi(null)} />

      {/* 完成遮罩 · 3s 后显示 CTA */}
      <AnimatePresence>
        {state.status === "done" && ctaReady && !state.report && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40"
          >
            <Button onClick={goReplay} variant="accent" size="lg">
              30 天跑完 · 进入回放
              <ArrowRight className="h-4 w-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {fresh && (
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.2, delay: 0.4 }}
          className="pointer-events-none fixed inset-0 z-50 bg-void"
        />
      )}
    </div>
  );
}
