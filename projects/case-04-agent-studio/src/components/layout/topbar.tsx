"use client";

import { Search, Bell, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { notify } from "@/lib/notify";

export function Topbar({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="h-14 shrink-0 border-b border-border bg-surface/90 backdrop-blur sticky top-0 z-20 flex items-center justify-between px-6">
      <div className="flex flex-col min-w-0">
        <h1 className="text-[15px] font-semibold text-ink tracking-tight truncate">{title}</h1>
        {subtitle && (
          <span className="text-[11px] text-ink-mute truncate">{subtitle}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {actions}

        {/* Quick search */}
        <button
          onClick={() => notify.todo("⌘K 全局搜索 · v0.2 上线")}
          className="hidden md:flex items-center gap-2 h-8 px-3 rounded-md border border-border bg-surface text-[12px] text-ink-mute hover:text-ink hover:border-ink-mute transition-colors"
        >
          <Search className="w-3.5 h-3.5" strokeWidth={2} />
          <span>搜索</span>
          <kbd className="ml-1 font-mono text-[10px] bg-elevated border border-border-subtle rounded px-1 py-px">⌘K</kbd>
        </button>

        {/* Provider status */}
        <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-surface">
          <Circle className="w-2 h-2 fill-success text-success" />
          <span className="text-[11px] text-ink-soft font-mono">OpenRouter</span>
        </div>

        <button
          onClick={() => notify.info("🔔 通知", "近 1 小时 3 条 · 无告警")}
          className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-elevated text-ink-soft"
        >
          <Bell className="w-4 h-4" strokeWidth={1.75} />
        </button>

        <Badge variant="mono">real SSE</Badge>
      </div>
    </header>
  );
}
