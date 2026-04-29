import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BreathingDot } from "@/components/motion/breathing-dot";
import { StarField } from "@/components/motion/star-field";
import { GradientUnderline } from "@/components/motion/gradient-underline";
import { HandDrawnSquiggle } from "@/components/motion/hand-drawn-squiggle";
import { Navigation, PlayCircle } from "lucide-react";

/**
 * Hero —— Linear 骨架 + Postiz 装饰 + 呼吸灯灵魂
 */
export function Hero() {
  return (
    <section id="hero" className="relative pt-14 pb-20 sm:pt-20 sm:pb-28 overflow-hidden">
      <div className="absolute inset-0 bg-grid-soft opacity-70" aria-hidden />
      <div className="absolute inset-0 bg-radial-spot" aria-hidden />
      <StarField count={28} seed={7} />

      <HandDrawnSquiggle
        variant="loop"
        className="absolute left-2 bottom-6 w-44 h-28 opacity-60"
      />
      <HandDrawnSquiggle
        variant="wave"
        className="absolute right-4 top-8 w-52 h-20 opacity-35 rotate-12"
      />

      <div className="relative mx-auto max-w-6xl px-6 text-center">
        {/* 英文 eyebrow 作为设计元素，中文为主标题 */}
        <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-text-lo">
          <span className="h-px w-8 bg-stroke-strong" />
          your goal autopilot · 24/7
          <span className="h-px w-8 bg-stroke-strong" />
        </div>

        <h1 className="mt-6 text-4xl sm:text-6xl lg:text-[80px] font-semibold tracking-[-0.03em] leading-[1.05] text-white whitespace-nowrap">
          你的目标
          <span className="relative inline-block mx-2">
            自驾
            <GradientUnderline />
          </span>
          代理
        </h1>

        <p className="mt-8 mx-auto max-w-2xl text-base sm:text-lg text-text-mid leading-relaxed">
          7×24 小时无人值守的 AI Agent。设定一个目标，它自己研究、执行、汇报，
          关键路口才请你接管。
          <span className="text-white/80">松开方向盘，它替你跑下去。</span>
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button variant="accent" size="xl" asChild>
            <Link href="/dashboard">
              <Navigation className="h-4 w-4" />
              启动自驾
            </Link>
          </Button>
          <Button variant="ghost" size="xl" asChild>
            <Link href="/demo/run">
              <PlayCircle className="h-4 w-4" />
              观看演示
            </Link>
          </Button>
        </div>

        <div className="mt-8 inline-flex items-center gap-2.5 rounded-full border border-stroke bg-white/[0.02] px-4 py-1.5 text-xs font-mono text-text-mid">
          <BreathingDot size="xs" />
          <span className="tracking-wide">
            <span className="text-alive font-semibold">LIVE</span>
            <span className="mx-2 text-text-lo">·</span>
            当前有 342 个 Agent 正在工作
          </span>
        </div>
      </div>
    </section>
  );
}
