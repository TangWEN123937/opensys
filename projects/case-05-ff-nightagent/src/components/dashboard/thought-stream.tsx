import { BreathingDot } from "@/components/motion/breathing-dot";
import type { TimelineEventMock } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface ThoughtStreamProps {
  events: TimelineEventMock[];
}

/**
 * Live Thought Stream —— 渲染 reasoning/tool_call/tool_result 事件
 * reasoning 用斜体淡灰 + typewriter caret
 * tool_call 用 pill card
 * 最新事件在底部，自动滚动
 */
export function ThoughtStream({ events }: ThoughtStreamProps) {
  return (
    <div className="rounded-xl border border-stroke bg-panel/40 p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <BreathingDot size="xs" />
        <div className="text-xs uppercase tracking-wider text-text-lo">
          Live Thought Stream
        </div>
        <span className="ml-auto text-[10px] font-mono text-text-lo">
          claude-opus-4-7 · 1M
        </span>
      </div>

      <div className="space-y-3 min-h-[300px]">
        {events.map((e, idx) => (
          <div
            key={e.id}
            className="flex gap-3 text-sm"
            style={{ animation: `fade-up 500ms ease-out ${idx * 80}ms backwards` }}
          >
            <span className="font-mono text-[11px] text-text-lo w-11 pt-0.5 shrink-0">
              {e.time}
            </span>
            <div className="flex-1 min-w-0">
              <EventRender event={e} isLast={idx === events.length - 1} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-stroke flex items-center gap-2 text-[11px] font-mono text-text-lo">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-alive opacity-60 animate-ping" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-alive" />
        </span>
        agent is reasoning · tokens used: 12.4k / 1M
      </div>
    </div>
  );
}

function EventRender({
  event,
  isLast,
}: {
  event: TimelineEventMock;
  isLast: boolean;
}) {
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
      <div className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-stroke bg-black/40 px-3 py-2 max-w-full",
        "shadow-[0_0_0_1px_rgba(0,212,255,0.1)_inset]"
      )}>
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full rounded-full bg-alive opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-alive" />
        </span>
        <span className="font-mono text-[11px]">
          <span className="text-alive">{event.content}</span>
          {event.meta?.target && (
            <>
              <span className="text-text-lo mx-1.5">←</span>
              <span className="text-text-mid">{event.meta.target}</span>
            </>
          )}
        </span>
      </div>
    );
  }

  return (
    <span className="text-text-mid">{event.content}</span>
  );
}
