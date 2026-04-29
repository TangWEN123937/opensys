import { cn } from "@/lib/utils";
import type { ScriptStep } from "@/lib/agent/script-ecom-dm";
import { CheckCircle2, Clock, Circle } from "lucide-react";

interface StepLedgerProps {
  steps: ScriptStep[];
  currentIndex: number;
  onJump?: (index: number) => void;
}

/**
 * 左栏 · Step 列表 · 打勾/进行中/待定三态
 */
export function StepLedger({ steps, currentIndex, onJump }: StepLedgerProps) {
  return (
    <aside className="h-full overflow-y-auto border-r border-stroke bg-void/80 backdrop-blur-xl">
      <div className="px-4 py-3 border-b border-stroke sticky top-0 bg-void/80 backdrop-blur-xl z-10">
        <div className="text-[10px] font-mono uppercase tracking-wider text-text-lo">
          step ledger
        </div>
        <div className="mt-0.5 text-xs text-text-mid">
          剧本总 {steps.length} 步
        </div>
      </div>

      <ol className="py-2">
        {steps.map((s, i) => {
          const isDone = i < currentIndex;
          const isCurrent = i === currentIndex;
          return (
            <li key={s.no}>
              <button
                onClick={() => onJump?.(i)}
                data-testid={`step-row-${s.no}`}
                className={cn(
                  "group w-full text-left flex items-start gap-3 px-4 py-2.5 transition-colors relative",
                  isCurrent
                    ? "bg-alive/[0.06]"
                    : "hover:bg-white/[0.02]"
                )}
              >
                {/* left indicator rail */}
                {isCurrent && (
                  <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-alive via-violet to-magenta" />
                )}

                {/* step no circle */}
                <span
                  className={cn(
                    "mt-0.5 flex items-center justify-center w-6 h-6 shrink-0 rounded-full text-[10px] font-mono",
                    isDone
                      ? "bg-success/15 text-success"
                      : isCurrent
                      ? "bg-alive/15 text-alive ring-2 ring-alive/30"
                      : "bg-white/[0.04] text-text-lo"
                  )}
                >
                  {isDone ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : isCurrent ? (
                    <span className="relative h-2 w-2">
                      <span className="absolute inset-0 rounded-full bg-alive animate-ping opacity-75" />
                      <span className="relative inline-block rounded-full h-2 w-2 bg-alive" />
                    </span>
                  ) : (
                    s.no
                  )}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-xs",
                        isCurrent
                          ? "text-white font-medium"
                          : isDone
                          ? "text-text-mid"
                          : "text-text-mid"
                      )}
                    >
                      {s.title}
                    </span>
                    {s.requiresApproval && (
                      <span className="text-[9px] font-mono text-pending bg-pending/10 rounded px-1.5 py-0.5">
                        HITL
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[10px] font-mono text-text-lo truncate">
                    {s.tool.name}
                  </div>
                </div>

                {!isDone && !isCurrent && (
                  <Circle className="h-3 w-3 text-text-lo mt-1.5 shrink-0" />
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
