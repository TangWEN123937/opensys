import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

interface ModeBadgeProps {
  mode: "mock" | "real";
  reason?: string;
}

/**
 * 右上角徽章 · 区分真数据 / 演示数据
 * 严格按 always-cool-first-paint 规范：演示=warning 黄 · 真数据=success 绿
 */
export function ModeBadge({ mode, reason }: ModeBadgeProps) {
  if (mode === "real") {
    return (
      <span
        data-testid="mode-badge"
        data-mode="real"
        className="inline-flex items-center gap-1.5 rounded-full border border-success/50 bg-success/10 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-success"
        title={reason ?? ""}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
        真数据
      </span>
    );
  }
  return (
    <span
      data-testid="mode-badge"
      data-mode="mock"
      className="inline-flex items-center gap-1.5 rounded-full border border-pending/50 bg-pending/10 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-pending"
      title={reason ?? "未配 ANTHROPIC_API_KEY · 走脚本化演示"}
    >
      <Sparkles className="h-2.5 w-2.5" />
      演示数据
    </span>
  );
}
