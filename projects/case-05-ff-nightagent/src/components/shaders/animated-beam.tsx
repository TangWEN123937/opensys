"use client";

import { useEffect, useState } from "react";

/**
 * Animated Beam · Aceternity 风格 SVG 光束
 *
 * 在两个 DOM 节点之间画带光粒脉冲的连线 · 用于 SwimLane 之间的 handoff
 */
export function AnimatedBeam({
  fromRef,
  toRef,
  active = true,
  hue = 195,
  playKey = 0,
}: {
  fromRef: React.RefObject<HTMLElement | null>;
  toRef: React.RefObject<HTMLElement | null>;
  active?: boolean;
  hue?: number;
  /** 变 playKey 触发重画光粒 · 每次 handoff 传新值 */
  playKey?: number;
}) {
  const [geo, setGeo] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);

  useEffect(() => {
    const compute = () => {
      if (!fromRef.current || !toRef.current) return;
      const a = fromRef.current.getBoundingClientRect();
      const b = toRef.current.getBoundingClientRect();
      setGeo({
        x1: a.left + a.width / 2,
        y1: a.top + a.height / 2,
        x2: b.left + b.width / 2,
        y2: b.top + b.height / 2,
      });
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [fromRef, toRef, playKey]);

  if (!geo || !active) return null;

  const pathD = `M ${geo.x1} ${geo.y1} Q ${(geo.x1 + geo.x2) / 2} ${
    Math.min(geo.y1, geo.y2) - 30
  } ${geo.x2} ${geo.y2}`;

  return (
    <svg
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40 h-full w-full"
      style={{ mixBlendMode: "screen" }}
    >
      <defs>
        <linearGradient id={`beam-${playKey}`} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={`hsl(${hue} 90% 60%)`} stopOpacity="0" />
          <stop offset="50%" stopColor={`hsl(${hue} 90% 60%)`} stopOpacity="0.9" />
          <stop offset="100%" stopColor={`hsl(${hue} 90% 60%)`} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        key={playKey}
        d={pathD}
        stroke={`url(#beam-${playKey})`}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        style={{
          strokeDasharray: "60 600",
          strokeDashoffset: "660",
          animation: `ff-beam-run 1.2s cubic-bezier(0.4, 0, 0.2, 1) both`,
          filter: `drop-shadow(0 0 6px hsl(${hue} 90% 60%))`,
        }}
      />
      <style jsx>{`
        @keyframes ff-beam-run {
          0% {
            stroke-dashoffset: 660;
            opacity: 0;
          }
          20% {
            opacity: 1;
          }
          100% {
            stroke-dashoffset: 0;
            opacity: 0;
          }
        }
      `}</style>
    </svg>
  );
}
