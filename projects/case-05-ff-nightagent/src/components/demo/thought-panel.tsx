import { cn } from "@/lib/utils";
import type { ScriptStep } from "@/lib/agent/script-ecom-dm";
import { Brain, Wrench, ArrowRight } from "lucide-react";

interface ThoughtPanelProps {
  step: ScriptStep;
  isActive: boolean;
}

/**
 * 中栏 · 显示当前 step 的 thought + tool 调用 + 返回预览
 */
export function ThoughtPanel({ step, isActive }: ThoughtPanelProps) {
  return (
    <section className="h-full overflow-y-auto border-r border-stroke px-6 py-5">
      <div className="flex items-center gap-2 pb-4 border-b border-stroke mb-5">
        <span className="text-[10px] font-mono uppercase tracking-wider text-text-lo">
          step {step.no}
        </span>
        <span className="text-base font-medium tracking-tight">
          {step.title}
        </span>
      </div>

      {/* Thought block */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="h-3.5 w-3.5 text-violet" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-violet">
            agent 在想
          </span>
        </div>
        <p
          className={cn(
            "text-[15px] leading-relaxed italic pl-5 border-l-2 border-violet/40",
            isActive ? "text-white" : "text-text-mid"
          )}
        >
          {step.thought}
          {isActive && (
            <span className="inline-block w-[0.5em] h-[1em] ml-1 bg-alive align-middle animate-pulse" />
          )}
        </p>
      </div>

      {/* Tool call block */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Wrench className="h-3.5 w-3.5 text-alive" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-alive">
            调用工具
          </span>
        </div>

        <div className="rounded-xl border border-alive/30 bg-alive/[0.04] p-4 space-y-3">
          <div className="flex items-center gap-2 font-mono text-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-alive" />
            <span className="text-alive">{step.tool.name}</span>
          </div>

          {Object.keys(step.tool.params).length > 0 && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-lo mb-1">
                params
              </div>
              <pre className="text-[11px] font-mono text-text-mid bg-black/40 rounded-md p-2 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(step.tool.params, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Tool result */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <ArrowRight className="h-3.5 w-3.5 text-success" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-success">
            返回
          </span>
        </div>

        <pre className="text-[11px] font-mono text-text-mid bg-black/40 rounded-md p-3 overflow-x-auto whitespace-pre-wrap max-h-72 overflow-y-auto border border-stroke">
          {JSON.stringify(step.tool.result, null, 2)}
        </pre>
      </div>
    </section>
  );
}
