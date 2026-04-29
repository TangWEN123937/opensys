import { cn } from "@/lib/utils";

interface HandDrawnSquiggleProps {
  className?: string;
  variant?: "loop" | "spiral" | "wave";
}

/**
 * 手绘涂鸦线 —— Postiz 左下装饰同款。stroke-dashoffset 慢速描绘动画。
 */
export function HandDrawnSquiggle({
  className,
  variant = "loop",
}: HandDrawnSquiggleProps) {
  const paths: Record<typeof variant, string> = {
    loop: "M 10 80 Q 30 40, 60 60 T 120 80 Q 150 100, 140 50 Q 130 20, 90 30 T 40 50 Q 15 60, 20 90",
    spiral:
      "M 40 50 Q 80 10, 120 50 Q 160 90, 100 100 Q 40 110, 50 60 Q 60 20, 110 40",
    wave: "M 5 60 Q 25 30, 50 60 T 100 60 T 150 60 T 200 60",
  };

  return (
    <svg
      viewBox="0 0 200 120"
      className={cn("text-white/25", className)}
      fill="none"
      aria-hidden
    >
      <path
        d={paths[variant]}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 600,
          animation: "dash-draw 3s ease-out forwards 0.8s",
          ["--dash-len" as string]: "600",
        }}
      />
    </svg>
  );
}
