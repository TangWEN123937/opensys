import { cn } from "@/lib/utils";

interface GradientUnderlineProps {
  className?: string;
  width?: number | string;
}

/**
 * 渐变下划线 —— Postiz 关键字装饰。cyan → violet → magenta。
 * 带 dash-draw 入场动画。
 */
export function GradientUnderline({ className, width = "100%" }: GradientUnderlineProps) {
  return (
    <svg
      viewBox="0 0 400 14"
      preserveAspectRatio="none"
      className={cn("absolute left-0 -bottom-2 h-3 w-full", className)}
      style={{ width }}
      aria-hidden
    >
      <defs>
        <linearGradient id="grad-underline" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00D4FF" />
          <stop offset="50%" stopColor="#C084FC" />
          <stop offset="100%" stopColor="#F472B6" />
        </linearGradient>
      </defs>
      <path
        d="M 4 10 Q 100 2, 200 8 T 396 6"
        fill="none"
        stroke="url(#grad-underline)"
        strokeWidth="3"
        strokeLinecap="round"
        style={{
          strokeDasharray: 500,
          animation: "dash-draw 1.5s ease-out forwards 0.4s",
          ["--dash-len" as string]: "500",
        }}
      />
    </svg>
  );
}
