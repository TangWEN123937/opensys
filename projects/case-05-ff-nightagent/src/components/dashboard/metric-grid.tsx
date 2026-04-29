import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";

interface Metric {
  label: string;
  value: string;
  trend: string;
  subtle?: boolean;
}

interface MetricGridProps {
  metrics: Metric[];
}

/**
 * Metric Grid —— 4 个 bento 卡片，顶部放首屏。
 * 每个卡 hover 显示 sparkline（纯装饰）+ gradient 边缘光。
 */
export function MetricGrid({ metrics }: MetricGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {metrics.map((m, i) => (
        <article
          key={m.label}
          className="group relative overflow-hidden rounded-xl border border-stroke bg-panel/50 p-4 transition-colors hover:border-stroke-strong"
          style={{ animation: `fade-up 400ms ease-out ${i * 60}ms backwards` }}
        >
          {/* hover gradient ring */}
          <div
            className="absolute -inset-px rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{
              background:
                "linear-gradient(135deg, rgba(0,212,255,0.15) 0%, transparent 50%)",
              WebkitMask:
                "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
              WebkitMaskComposite: "xor",
              maskComposite: "exclude",
              padding: "1px",
            }}
            aria-hidden
          />
          <div className="flex items-start justify-between">
            <div className="text-[10px] uppercase tracking-wider text-text-lo">
              {m.label}
            </div>
            <ArrowUpRight className="h-3 w-3 text-text-lo opacity-0 group-hover:opacity-60 transition-opacity" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">
            {m.value}
          </div>
          <div
            className={cn(
              "mt-1 text-[11px] font-mono",
              m.subtle ? "text-text-lo" : "text-success"
            )}
          >
            {m.trend}
          </div>
          {/* mock sparkline */}
          <svg
            className="absolute right-0 bottom-0 h-12 w-20 opacity-40"
            viewBox="0 0 80 40"
            fill="none"
            aria-hidden
          >
            <path
              d="M 0 30 L 10 28 L 20 24 L 30 26 L 40 20 L 50 18 L 60 12 L 70 8 L 80 10"
              stroke={m.subtle ? "#6B7280" : "#10B981"}
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </article>
      ))}
    </div>
  );
}
