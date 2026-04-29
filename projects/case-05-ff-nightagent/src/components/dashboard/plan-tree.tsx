import { CheckCircle2, Circle } from "lucide-react";
import type { PlanTaskMock } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface PlanTreeProps {
  tasks: PlanTaskMock[];
  compact?: boolean;
}

/**
 * Plan Tree —— Claude 官网 Progress checklist 同款
 */
export function PlanTree({ tasks, compact }: PlanTreeProps) {
  const done = tasks.filter((t) => t.status === "done").length;

  return (
    <div className={cn("rounded-xl border border-stroke bg-panel/40", compact ? "p-4" : "p-5")}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-text-lo">计划树</div>
          {!compact && (
            <div className="mt-0.5 text-sm text-text-mid">
              由 <span className="font-mono text-text-hi">claude-opus-4-7</span> 生成
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs font-mono text-text-lo">
            {done} / {tasks.length}
          </div>
          <div className="mt-1 h-1 w-16 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-alive via-violet to-magenta transition-all duration-500"
              style={{ width: `${(done / Math.max(tasks.length, 1)) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <ul className="space-y-2.5">
        {tasks.map((t, idx) => (
          <li
            key={t.id}
            className="flex items-start gap-2.5 text-sm"
            style={{ animation: `fade-up 400ms ease-out ${idx * 40}ms backwards` }}
          >
            {t.status === "done" ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-success shrink-0" />
            ) : t.status === "doing" ? (
              <span className="relative h-4 w-4 mt-0.5 shrink-0">
                <span className="absolute inset-0 rounded-full border-2 border-pending/20" />
                <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-pending animate-spin [animation-duration:1.6s]" />
              </span>
            ) : (
              <Circle className="h-4 w-4 mt-0.5 text-text-lo shrink-0" />
            )}
            <span
              className={cn(
                "flex-1",
                t.status === "done" && "text-text-lo line-through decoration-white/20",
                t.status === "doing" && "text-white",
                t.status === "pending" && "text-text-mid"
              )}
            >
              {t.text}
            </span>
            {t.progress && (
              <span className="text-[11px] font-mono text-pending shrink-0">
                {t.progress}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
