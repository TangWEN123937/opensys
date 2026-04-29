import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  withText?: boolean;
}

/**
 * FF-Autopilot 品牌标识
 * 图形：方向标 + cyan 呼吸点，象征"自驾 + alive"
 * 字体：FF-Autopilot（Auto 稍加粗 accent）
 */
export function Logo({ className, withText = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden
        className="shrink-0"
      >
        {/* 方向标 —— autopilot 指针 */}
        <path
          d="M14 4 L22 22 L14 18 L6 22 Z"
          fill="white"
          fillOpacity="0.95"
        />
        {/* cyan 呼吸点 —— 表示 agent alive (引擎在跑) */}
        <circle
          cx="22"
          cy="6"
          r="2.2"
          fill="#00D4FF"
          style={{
            filter: "drop-shadow(0 0 4px rgba(0, 212, 255, 0.8))",
            animation: "breathe 2.4s ease-in-out infinite",
            transformOrigin: "22px 6px",
          }}
        />
      </svg>
      {withText && (
        <span className="font-semibold tracking-tight text-[15px]">
          <span className="text-white">FF-</span>
          <span className="text-white">Auto</span>
          <span className="gradient-text-accent">pilot</span>
        </span>
      )}
    </div>
  );
}
