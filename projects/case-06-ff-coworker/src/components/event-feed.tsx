"use client";

import { useEffect, useState } from "react";
import { eventsFeed, type AgentEvent } from "@/lib/events";
import { employees } from "@/lib/employees";
import { cn } from "@/lib/utils";

/** 循环滚动事件流 · 每 2.4s 推进一条 */
export function EventFeed({ maxRows = 8 }: { maxRows?: number }) {
  const [visible, setVisible] = useState<AgentEvent[]>(eventsFeed.slice(0, maxRows));

  useEffect(() => {
    let idx = maxRows;
    const id = setInterval(() => {
      const next = eventsFeed[idx % eventsFeed.length];
      setVisible((v) => [next, ...v].slice(0, maxRows));
      idx += 1;
    }, 2400);
    return () => clearInterval(id);
  }, [maxRows]);

  return (
    <div className="paper p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-warmth breathe-alert" />
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-mid">
            实时事件流
          </span>
        </div>
        <span className="font-mono text-[10px] text-ink-lo">
          {visible.length} / {eventsFeed.length}
        </span>
      </div>

      <div className="space-y-3">
        {visible.map((ev, i) => {
          const emp = employees.find((e) => e.id === ev.employeeId);
          if (!emp) return null;
          return (
            <div
              key={`${ev.time}-${i}`}
              className={cn(
                "flex items-start gap-3 pb-3 border-b border-ink-hair last:border-none",
                i === 0 && "animate-[ticker-in_0.4s_var(--ease-out-slow)_both]"
              )}
            >
              <span className="font-mono text-[10px] text-ink-lo w-10 pt-1 shrink-0">
                {ev.time}
              </span>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center font-display text-[10px] shrink-0"
                style={{ background: emp.bgColor, color: emp.accent }}
              >
                {emp.initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[12px] font-medium text-ink">{emp.name}</span>
                  <span className="text-[12px] text-ink-mid">{ev.verb}</span>
                  {ev.mechanism && (
                    <span className="badge-tag-warmth badge-tag !py-0 !px-1.5 !text-[9px]">
                      机制 {ev.mechanism}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-ink-lo mt-0.5 font-mono truncate">
                  {ev.payload}
                </div>
              </div>
              <ToneDot tone={ev.tone} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ToneDot({ tone }: { tone?: AgentEvent["tone"] }) {
  const color =
    tone === "success" ? "bg-success" :
    tone === "alert"   ? "bg-alert" :
    tone === "pending" ? "bg-pending" :
                         "bg-ink-lo";
  return <span className={cn("w-1 h-1 rounded-full mt-2", color)} />;
}
