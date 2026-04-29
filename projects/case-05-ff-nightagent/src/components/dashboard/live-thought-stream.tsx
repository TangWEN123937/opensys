"use client";

import { useSse } from "@/hooks/use-sse";
import { BreathingDot } from "@/components/motion/breathing-dot";
import { cn } from "@/lib/utils";
import type { SseEvent } from "@/lib/events/types";

interface LiveThoughtStreamProps {
  goalId: string;
}

export function LiveThoughtStream({ goalId }: LiveThoughtStreamProps) {
  const { events, connected } = useSse({
    url: `/api/events?goalId=${encodeURIComponent(goalId)}`,
    maxBuffer: 10,
  });

  return (
    <div className="rounded-xl border border-stroke bg-panel/40 p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <BreathingDot size="xs" tone={connected ? "alive" : "error"} />
        <div className="text-xs uppercase tracking-wider text-text-lo">
          实时思考流
        </div>
        <span className="ml-auto text-[10px] font-mono text-text-lo">
          {connected ? "claude-opus-4-7 · 1M · streaming" : "重连中…"}
        </span>
      </div>

      <div className="space-y-3 min-h-[320px]">
        {events.length === 0 ? (
          <EmptyState />
        ) : (
          events.map((e, i) => {
            const isLast = i === events.length - 1;
            return (
              <div
                key={e.id + e.time}
                className="flex gap-3 text-sm"
                style={{
                  animation: "fade-up 400ms ease-out backwards",
                }}
              >
                <span className="font-mono text-[11px] text-text-lo w-16 pt-0.5 shrink-0">
                  {e.time}
                </span>
                <div className="flex-1 min-w-0">
                  <EventRender event={e} isLast={isLast} />
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-stroke flex items-center gap-2 text-[11px] font-mono text-text-lo">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-alive opacity-60 animate-ping" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-alive" />
        </span>
        agent 正在思考 · 已收到 {events.length} 条事件
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[260px] text-center text-text-lo text-sm">
      <span className="font-mono text-[11px]">正在连接 agent…</span>
      <span className="mt-1 text-[11px]">第一条思考约 2 秒后到达</span>
    </div>
  );
}

function EventRender({ event, isLast }: { event: SseEvent; isLast: boolean }) {
  if (event.type === "reasoning") {
    return (
      <p className="text-text-mid italic leading-relaxed">
        {event.content}
        {isLast && (
          <span className="inline-block w-[0.5em] h-[1em] ml-1 bg-alive/90 align-middle animate-pulse" />
        )}
      </p>
    );
  }

  if (event.type === "tool_call") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border border-stroke bg-black/40 px-3 py-2 max-w-full",
          "shadow-[0_0_0_1px_rgba(0,212,255,0.1)_inset]"
        )}
      >
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full rounded-full bg-alive opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-alive" />
        </span>
        <span className="font-mono text-[11px]">
          <span className="text-alive">{event.content}</span>
          {event.meta && (
            <>
              <span className="text-text-lo mx-1.5">←</span>
              <span className="text-text-mid truncate">
                {Object.entries(event.meta)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(" · ")}
              </span>
            </>
          )}
        </span>
      </div>
    );
  }

  if (event.type === "tool_result") {
    return (
      <p className="text-success text-sm font-mono text-[12px]">
        ↳ {event.content}
      </p>
    );
  }

  if (event.type === "plan_update") {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-2.5 py-1.5 text-xs text-success font-medium">
        ✓ {event.content}
      </div>
    );
  }

  if (event.type === "approval_needed") {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-pending/30 bg-pending/10 px-2.5 py-1.5 text-xs text-pending">
        ⚠ {event.content}
      </div>
    );
  }

  return <span className="text-text-mid">{event.content}</span>;
}
