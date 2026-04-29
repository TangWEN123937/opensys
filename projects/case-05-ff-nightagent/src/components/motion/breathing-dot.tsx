import { cn } from "@/lib/utils";

interface BreathingDotProps {
  size?: "xs" | "sm" | "md";
  tone?: "alive" | "success" | "pending" | "error";
  className?: string;
}

/**
 * 呼吸灯 —— Agent alive 的视觉信号。2s 脉冲，中心发光 + 外环扩散淡出。
 */
export function BreathingDot({ size = "sm", tone = "alive", className }: BreathingDotProps) {
  const sizeMap = { xs: "h-1.5 w-1.5", sm: "h-2 w-2", md: "h-2.5 w-2.5" };
  const toneMap = {
    alive: "bg-alive shadow-[0_0_12px_rgba(0,212,255,0.8)]",
    success: "bg-success shadow-[0_0_10px_rgba(16,185,129,0.7)]",
    pending: "bg-pending shadow-[0_0_10px_rgba(245,158,11,0.7)]",
    error: "bg-error shadow-[0_0_10px_rgba(244,63,94,0.7)]",
  };
  return (
    <span
      className={cn(
        "relative inline-flex rounded-full",
        sizeMap[size],
        toneMap[tone],
        "[animation:breathe_2s_ease-in-out_infinite]",
        className
      )}
      aria-hidden
    />
  );
}
