"use client";

import { cn } from "@/lib/utils";

/**
 * Lines Gradient Shader · Aceternity 风格氛围底纹
 *
 * SVG + CSS 实现 · 低成本 · 不开 canvas · 可多实例共存
 * 用途：Goal Setup / Replay 背景 · alpha 可调
 */
export function LinesGradient({
  className,
  opacity = 0.35,
  hue = 190, // 190=cyan → 280=violet
}: {
  className?: string;
  opacity?: number;
  hue?: number;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className
      )}
      style={{ opacity }}
    >
      {/* 柔焦辐射基调 */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 900px 500px at 30% 10%, hsl(${hue} 80% 52% / 0.25), transparent 60%),
                       radial-gradient(ellipse 700px 600px at 80% 80%, hsl(${
                         hue + 70
                       } 70% 55% / 0.18), transparent 55%)`,
        }}
      />
      {/* 扫掠光带 · 慢速左右漂 */}
      <svg
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 1200 800"
      >
        <defs>
          <linearGradient id="ln-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={`hsl(${hue} 90% 60%)`} stopOpacity="0" />
            <stop offset="50%" stopColor={`hsl(${hue} 90% 60%)`} stopOpacity="0.35" />
            <stop offset="100%" stopColor={`hsl(${hue} 90% 60%)`} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ln-b" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={`hsl(${hue + 60} 85% 65%)`} stopOpacity="0" />
            <stop offset="50%" stopColor={`hsl(${hue + 60} 85% 65%)`} stopOpacity="0.25" />
            <stop offset="100%" stopColor={`hsl(${hue + 60} 85% 65%)`} stopOpacity="0" />
          </linearGradient>
        </defs>
        <g>
          {/* 飘带 · CSS keyframes 控制 */}
          <path
            d="M -200 300 Q 300 100 700 280 T 1400 380"
            stroke="url(#ln-a)"
            strokeWidth="80"
            fill="none"
            className="ff-line-drift-a"
          />
          <path
            d="M -200 500 Q 400 700 800 480 T 1400 520"
            stroke="url(#ln-b)"
            strokeWidth="100"
            fill="none"
            className="ff-line-drift-b"
          />
        </g>
      </svg>
      <style jsx>{`
        .ff-line-drift-a {
          transform-origin: center;
          animation: driftA 22s ease-in-out infinite alternate;
        }
        .ff-line-drift-b {
          transform-origin: center;
          animation: driftB 28s ease-in-out infinite alternate;
        }
        @keyframes driftA {
          0% {
            transform: translate3d(-4%, -2%, 0) scale(1.05);
          }
          100% {
            transform: translate3d(4%, 3%, 0) scale(1.1);
          }
        }
        @keyframes driftB {
          0% {
            transform: translate3d(3%, 2%, 0) scale(1.02);
          }
          100% {
            transform: translate3d(-3%, -2%, 0) scale(1.08);
          }
        }
      `}</style>
    </div>
  );
}
