import { cn, seededRandom } from "@/lib/utils";

interface StarFieldProps {
  count?: number;
  seed?: number;
  className?: string;
}

/**
 * 星点散布 —— Postiz 装饰语言。用确定性 seeded 随机避免 hydration mismatch。
 * 星形有两种：4 角 ✦ 和 5 角 ★，尺寸 6-14px，慢闪烁。
 */
export function StarField({ count = 22, seed = 42, className }: StarFieldProps) {
  const rand = seededRandom(seed);
  const stars = Array.from({ length: count }, (_, i) => ({
    id: i,
    x: rand() * 100,
    y: rand() * 100,
    size: 6 + rand() * 9,
    delay: rand() * 5,
    duration: 4 + rand() * 4,
    kind: rand() > 0.5 ? "four" : "five",
    opacity: 0.3 + rand() * 0.4,
  }));

  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden
    >
      {stars.map((s) => (
        <svg
          key={s.id}
          className="absolute text-white/80"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            opacity: s.opacity,
            animation: `twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
          }}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          {s.kind === "four" ? (
            // 四角星 ✦
            <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
          ) : (
            // 五角星 ★（简化路径）
            <path d="M12 2 L14.09 8.26 L20.78 8.27 L15.35 12.14 L17.45 18.4 L12 14.54 L6.55 18.4 L8.65 12.14 L3.22 8.27 L9.91 8.26 Z" />
          )}
        </svg>
      ))}
    </div>
  );
}
