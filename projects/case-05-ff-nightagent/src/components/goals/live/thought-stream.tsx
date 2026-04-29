"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Brain, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThoughtItem {
  seq: number;
  day: number;
  text: string;
}
interface ToolItem {
  seq: number;
  day: number;
  name: string;
  lane: string;
}

/** Agent 思维流 · 左下主区 · 真接 SSE · 像 terminal 往下滚 */
export function ThoughtStream({
  thoughts,
  tools,
}: {
  thoughts: ThoughtItem[];
  tools: ToolItem[];
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  const combined = [
    ...thoughts.map((t) => ({ kind: "thought" as const, ...t })),
    ...tools.map((t) => ({ kind: "tool" as const, ...t })),
  ].sort((a, b) => a.seq - b.seq);

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [combined.length]);

  return (
    <div className="relative flex flex-col h-full rounded-2xl border border-stroke bg-[#08080D] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-stroke bg-black/40">
        <div className="flex items-center gap-2">
          <Brain className="h-3.5 w-3.5 text-violet-400" />
          <span className="text-xs font-medium">Agent 思维流</span>
          <span className="text-[10px] font-mono text-text-lo">
            · 真接 SSE · {combined.length} 条
          </span>
        </div>
        <div className="flex items-center gap-1 text-[10px] font-mono text-text-lo">
          <span className="h-1.5 w-1.5 rounded-full bg-alive animate-pulse" />
          LIVE
        </div>
      </div>
      <div
        ref={boxRef}
        className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[11px] leading-relaxed space-y-1.5"
      >
        <AnimatePresence initial={false}>
          {combined.slice(-60).map((c) =>
            c.kind === "thought" ? (
              <motion.div
                key={`t-${c.seq}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-start gap-2"
              >
                <span className="text-text-lo shrink-0 w-10">
                  D{String(c.day).padStart(2, "0")}
                </span>
                <Brain className="h-2.5 w-2.5 text-violet-400 shrink-0 mt-1" />
                <Typewriter text={c.text} className="text-text-hi flex-1 min-w-0" />
              </motion.div>
            ) : (
              <motion.div
                key={`u-${c.seq}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-start gap-2"
              >
                <span className="text-text-lo shrink-0 w-10">
                  D{String(c.day).padStart(2, "0")}
                </span>
                <Wrench className="h-2.5 w-2.5 text-alive shrink-0 mt-1" />
                <span className="text-alive shrink-0">{c.lane}.</span>
                <span className="text-text-mid flex-1 min-w-0 truncate">{c.name}</span>
              </motion.div>
            )
          )}
        </AnimatePresence>
        {combined.length === 0 && (
          <div className="text-text-lo py-8 text-center">
            等待 Agent 产生第一条 thought…
          </div>
        )}
      </div>
    </div>
  );
}

/** 25ms/字节流入 · 短文本触达快 */
function Typewriter({ text, className }: { text: string; className?: string }) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    setShown("");
    let i = 0;
    const h = window.setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) window.clearInterval(h);
    }, 25);
    return () => window.clearInterval(h);
  }, [text]);
  return (
    <span className={cn("whitespace-pre-wrap", className)}>
      {shown}
      {shown.length < text.length && (
        <span className="inline-block h-3 w-[2px] bg-alive animate-pulse ml-0.5 align-text-bottom" />
      )}
    </span>
  );
}
