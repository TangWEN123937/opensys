"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Calendar, Zap } from "lucide-react";
import type { KpiName } from "@/lib/agent/goal-input";
import { cn } from "@/lib/utils";

interface DrillData {
  kpi: string;
  total: number;
  event_count: number;
  by_day: Array<{
    day: number;
    delta: number;
    contributors: Array<{ day: number; type: string; task_id: string; label: string }>;
  }>;
}

const LABEL: Record<KpiName, string> = {
  growth: "涨粉",
  engagement: "互动",
  conversion: "私信咨询",
  retention: "成交/回购",
};

/**
 * KPI Drill-down · 教学核心
 *
 * 直接从 /api/goals/[id]/kpi/[kpi] 端点拿 event-sourced 聚合结果
 * 这是"event-sourcing 能做什么"的最直观证据
 */
export function KpiDrill({
  goalId,
  kpi,
  onClose,
}: {
  goalId: string;
  kpi: KpiName | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<DrillData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!kpi) return;
    setLoading(true);
    setData(null);
    fetch(`/api/goals/${goalId}/kpi/${kpi}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [goalId, kpi]);

  const maxDelta = data ? Math.max(1, ...data.by_day.map((d) => d.delta)) : 1;

  return (
    <AnimatePresence>
      {kpi && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-void/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            key="panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            className="fixed top-0 right-0 bottom-0 z-50 w-[520px] max-w-[90vw] border-l border-stroke bg-[#0A0A0F] shadow-2xl overflow-y-auto"
            data-testid="kpi-drill"
          >
            <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 border-b border-stroke bg-void/95 backdrop-blur-xl">
              <Zap className="h-4 w-4 text-alive" />
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-text-lo">
                  event-sourced drill · /api/goals/*/kpi/{kpi}
                </div>
                <div className="text-base font-medium">{LABEL[kpi]} · 按日贡献拆解</div>
              </div>
              <button
                onClick={onClose}
                className="ml-auto p-1.5 rounded-md hover:bg-white/5 text-text-mid"
                data-testid="btn-drill-close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loading && <div className="p-8 text-center text-sm text-text-mid">加载中…</div>}

            {data && (
              <div className="p-5 space-y-5">
                <div className="rounded-xl border border-alive/30 bg-alive/5 p-4">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-alive mb-1">
                    累计
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-semibold">{data.total}</span>
                    <span className="text-xs text-text-mid">
                      来自 {data.event_count} 个 kpi_delta 事件 · 覆盖 {data.by_day.length} 天
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-text-lo mb-2">
                    每日增量柱
                  </div>
                  <div className="flex items-end gap-1 h-28">
                    {data.by_day.map((d) => (
                      <div
                        key={d.day}
                        className="group relative flex-1 min-w-[8px]"
                        title={`Day ${d.day} · +${d.delta}`}
                      >
                        <div
                          className="w-full rounded-t bg-gradient-to-t from-alive/40 to-alive/80"
                          style={{
                            height: `${(d.delta / maxDelta) * 100}%`,
                            minHeight: "4px",
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 flex justify-between text-[9px] font-mono text-text-lo">
                    <span>Day {data.by_day[0]?.day ?? "-"}</span>
                    <span>Day {data.by_day[data.by_day.length - 1]?.day ?? "-"}</span>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-text-lo mb-2">
                    贡献清单 · 每条都能追溯到具体 task
                  </div>
                  <div className="space-y-2">
                    {data.by_day
                      .slice()
                      .reverse()
                      .map((d) => (
                        <div
                          key={d.day}
                          className="rounded-lg border border-stroke bg-panel/40 p-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs">
                              <Calendar className="h-3 w-3 text-text-lo" />
                              <span className="font-medium">Day {d.day}</span>
                            </div>
                            <span
                              className={cn(
                                "text-sm font-semibold tabular-nums",
                                d.delta > 0 ? "text-emerald-400" : "text-text-lo"
                              )}
                            >
                              +{d.delta}
                            </span>
                          </div>
                          {d.contributors.length > 0 && (
                            <ul className="mt-2 space-y-1 text-[11px] text-text-mid">
                              {d.contributors.map((c, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="text-alive mt-0.5">·</span>
                                  <span className="flex-1">
                                    <span className="text-text-hi">{c.label}</span>
                                    <span className="ml-2 font-mono text-text-lo">
                                      via {c.task_id}
                                    </span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                  </div>
                </div>

                <div className="text-[10px] font-mono text-text-lo leading-relaxed border-t border-stroke pt-3">
                  教学点 · 这些数据从未落盘到单独 KPI 表 · 完全由 events 表 reduce 出
                  · 这就是 event-sourcing 的威力：Replay 可倒带到任意时刻 · 所有查询都是实时增量计算
                </div>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
