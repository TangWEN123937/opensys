"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Gauge,
} from "lucide-react";
import type { RunnerState } from "./demo-runner-core";

interface PlayBarProps {
  state: RunnerState;
  currentIndex: number;
  total: number;
  speed: number;
  onPlay: () => void;
  onPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
  onSpeedChange: (s: number) => void;
}

const SPEEDS = [0.5, 1, 2, 4] as const;

export function PlayBar({
  state,
  currentIndex,
  total,
  speed,
  onPlay,
  onPause,
  onPrev,
  onNext,
  onReset,
  onSpeedChange,
}: PlayBarProps) {
  const playing = state === "running";
  const disabled = state === "awaiting_approval" || state === "done";

  return (
    <footer className="border-t border-stroke bg-panel/60 backdrop-blur-xl px-6 py-4">
      <div className="flex items-center gap-4">
        {/* Transport */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onPrev}
            disabled={currentIndex === 0}
            data-testid="btn-prev"
            aria-label="上一步"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={playing ? "outline" : "accent"}
            size="icon"
            onClick={playing ? onPause : onPlay}
            disabled={disabled}
            data-testid="btn-play-pause"
            aria-label={playing ? "暂停" : "播放"}
          >
            {playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onNext}
            disabled={disabled || currentIndex >= total - 1}
            data-testid="btn-next"
            aria-label="下一步"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onReset}
            data-testid="btn-reset"
            aria-label="重新开始"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Speed */}
        <div className="flex items-center gap-1.5 rounded-full border border-stroke bg-white/[0.02] px-2 py-1">
          <Gauge className="h-3 w-3 text-text-lo ml-1" />
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              data-testid={`btn-speed-${s}`}
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-mono transition-colors",
                speed === s
                  ? "bg-alive/15 text-alive"
                  : "text-text-lo hover:text-white"
              )}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Progress bar */}
        <div className="flex-1 flex items-center gap-3">
          <div className="flex-1 relative h-6 flex items-center">
            <div className="absolute left-0 right-0 h-px bg-stroke" />
            <div
              className="absolute left-0 h-px bg-gradient-to-r from-alive via-violet to-magenta transition-all duration-500"
              style={{
                width: `${(currentIndex / Math.max(total - 1, 1)) * 100}%`,
              }}
            />
            {Array.from({ length: total }).map((_, i) => {
              const pos = (i / Math.max(total - 1, 1)) * 100;
              const active = i === currentIndex;
              const past = i < currentIndex;
              return (
                <span
                  key={i}
                  className={cn(
                    "absolute -translate-x-1/2 -translate-y-1/2 rounded-full",
                    active
                      ? "h-3 w-3 bg-alive ring-4 ring-alive/20 shadow-[0_0_12px_rgba(0,212,255,0.8)]"
                      : past
                      ? "h-1.5 w-1.5 bg-alive/70"
                      : "h-1 w-1 bg-text-lo"
                  )}
                  style={{ left: `${pos}%`, top: "50%" }}
                  aria-hidden
                />
              );
            })}
          </div>
          <span
            data-testid="progress-indicator"
            className="text-[11px] font-mono text-text-mid whitespace-nowrap"
          >
            {currentIndex + 1} / {total}
          </span>
        </div>
      </div>
    </footer>
  );
}
