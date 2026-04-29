"use client";

import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";
import type { KpiName } from "@/lib/agent/goal-input";
import { cn } from "@/lib/utils";
import { TrendingUp, Heart, MessageCircle, ShoppingBag } from "lucide-react";

const META: Record<
  KpiName,
  { label: string; unit: string; icon: React.ComponentType<{ className?: string }>; hue: number }
> = {
  growth: { label: "涨粉", unit: "粉", icon: TrendingUp, hue: 195 },
  engagement: { label: "互动", unit: "次", icon: Heart, hue: 320 },
  conversion: { label: "私信咨询", unit: "条", icon: MessageCircle, hue: 265 },
  retention: { label: "成交/回购", unit: "单", icon: ShoppingBag, hue: 140 },
};

export function KpiRings({
  totals,
  targets,
  onDrill,
}: {
  totals: Record<KpiName, number>;
  targets: Record<KpiName, number>;
  onDrill: (kpi: KpiName) => void;
}) {
  const order: KpiName[] = ["growth", "engagement", "conversion", "retention"];
  return (
    <div className="grid grid-cols-4 gap-3">
      {order.map((k) => (
        <KpiRing
          key={k}
          kpi={k}
          value={totals[k] ?? 0}
          target={targets[k] ?? 1}
          onClick={() => onDrill(k)}
        />
      ))}
    </div>
  );
}

function KpiRing({
  kpi,
  value,
  target,
  onClick,
}: {
  kpi: KpiName;
  value: number;
  target: number;
  onClick: () => void;
}) {
  const meta = META[kpi];
  const Icon = meta.icon;
  const pct = Math.min(1, value / target);
  const R = 38;
  const C = 2 * Math.PI * R;

  const mv = useMotionValue(value);
  const spring = useSpring(mv, { stiffness: 140, damping: 22 });
  const display = useTransform(spring, (v) => Math.round(v));

  useEffect(() => {
    mv.set(value);
  }, [value, mv]);

  const achieved = pct >= 1;

  return (
    <button
      onClick={onClick}
      data-testid={`kpi-ring-${kpi}`}
      className={cn(
        "group relative rounded-2xl border bg-panel/40 backdrop-blur-xl p-4 text-left transition-all",
        "hover:border-white/20 hover:bg-white/[0.03]",
        achieved ? "border-emerald-500/50" : "border-stroke"
      )}
      style={{
        boxShadow: achieved ? `0 0 40px -10px hsl(140 80% 50% / 0.3)` : undefined,
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-lo">
            {meta.label}
          </div>
          <div className="text-[9px] font-mono text-text-lo/70">点击下钻</div>
        </div>
        <span
          className="inline-flex h-3.5 w-3.5"
          style={{ color: `hsl(${meta.hue} 85% 65%)` }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="relative flex items-center justify-center h-[88px]">
        <svg
          className="absolute inset-0 -rotate-90 h-[88px] w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
        >
          <circle cx="50" cy="50" r={R} stroke="currentColor" className="text-stroke" strokeWidth="6" fill="none" />
          <motion.circle
            cx="50"
            cy="50"
            r={R}
            stroke={`hsl(${meta.hue} 85% 60%)`}
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={C}
            initial={{ strokeDashoffset: C }}
            animate={{ strokeDashoffset: C * (1 - pct) }}
            transition={{ type: "spring", stiffness: 70, damping: 20 }}
            style={{ filter: `drop-shadow(0 0 4px hsl(${meta.hue} 85% 60%))` }}
          />
        </svg>
        <div className="text-center">
          <motion.div className="text-2xl font-semibold tabular-nums">
            {display}
          </motion.div>
          <div className="text-[9px] font-mono text-text-lo">
            / {target} {meta.unit}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-text-lo">
        <span>{Math.round(pct * 100)}%</span>
        {achieved && <span className="text-emerald-400">✓ 已达成</span>}
      </div>
    </button>
  );
}
