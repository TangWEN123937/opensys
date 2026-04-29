import {
  History,
  ShieldCheck,
  Target,
  Share2,
  FileText,
  MoonStar,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BreathingDot } from "@/components/motion/breathing-dot";

/**
 * Bento Features —— Aceternity 灵感，6 张不等高卡片
 */
export function BentoFeatures() {
  return (
    <section id="features" className="relative px-4 sm:px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="为无人值守而生"
          title={
            <>
              六大支柱，让 Agent
              <br />
              <span className="gradient-text-accent">一夜不停地运转。</span>
            </>
          }
          sub="所有功能都围绕一个问题设计：凌晨 3 点，Agent 还会在做对的事吗？"
        />

        <div className="mt-14 grid grid-cols-6 gap-4 auto-rows-[minmax(180px,auto)]">
          <BentoCard
            className="col-span-6 lg:col-span-4 row-span-2"
            icon={History}
            title="时间线回放"
            badge="核心差异化"
            description="拖动进度条，看 Agent 一整周做了什么决定；鼠标悬停到任一节点，能看到它凌晨 2:41 当时的思考。可审计、可调试、能建立信任。"
          >
            <ReplayMockup />
          </BentoCard>

          <BentoCard
            className="col-span-6 md:col-span-3 lg:col-span-2"
            icon={ShieldCheck}
            title="HITL 审批收件箱"
            description="高风险动作暂停入队，等你一键通过 · 支持批量滑动操作。"
          />

          <BentoCard
            className="col-span-6 md:col-span-3 lg:col-span-2"
            icon={Target}
            title="目标驱动规划"
            description="用一句大白话描述 KPI。Claude 4.7 自己拆成 Plan Tree。"
          />

          <BentoCard
            className="col-span-6 md:col-span-3 lg:col-span-2"
            icon={Share2}
            title="跨平台矩阵"
            description="一个 Agent 管小红书 / 抖音 / 视频号 / B 站 / 公众号 五个账号，内容按平台语气自动重写。"
          >
            <PlatformRing />
          </BentoCard>

          <BentoCard
            className="col-span-6 md:col-span-3 lg:col-span-2"
            icon={FileText}
            title="自动周报"
            description="每周日 20:00 自动生成本周总结 + 下周计划。"
          />

          <BentoCard
            className="col-span-6 md:col-span-6 lg:col-span-2 bg-[radial-gradient(circle_at_70%_30%,rgba(0,212,255,0.12),transparent_60%)]"
            icon={MoonStar}
            title="夜间模式"
            description="呼吸灯 · 打字机推理 · 星空粒子 —— 一眼看过去就知道 Agent 还在。"
          >
            <div className="mt-3 flex items-center gap-2 text-xs text-text-mid font-mono">
              <BreathingDot size="xs" />
              agent 在线 · 凌晨 03:42
            </div>
          </BentoCard>
        </div>
      </div>
    </section>
  );
}

function SectionHeader({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: React.ReactNode;
  sub: string;
}) {
  return (
    <div className="text-center max-w-3xl mx-auto">
      <div className="inline-flex items-center gap-2 rounded-full border border-stroke bg-white/[0.02] px-3 py-1 text-[11px] font-mono uppercase tracking-wider text-text-mid">
        <span className="h-1 w-1 rounded-full bg-alive" />
        {eyebrow}
      </div>
      <h2 className="mt-5 text-3xl sm:text-5xl font-semibold tracking-[-0.02em] leading-[1.1]">
        {title}
      </h2>
      <p className="mt-5 text-base text-text-mid">{sub}</p>
    </div>
  );
}

function BentoCard({
  icon: Icon,
  title,
  description,
  badge,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  badge?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        "group relative rounded-2xl border border-stroke bg-panel/50 p-6 overflow-hidden transition-all duration-300",
        "hover:border-stroke-strong hover:bg-panel/80 hover:shadow-[0_0_60px_-20px_rgba(0,212,255,0.25)]",
        className
      )}
    >
      {badge && (
        <span className="absolute top-5 right-5 rounded-full border border-alive/30 bg-alive/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-alive">
          {badge}
        </span>
      )}
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-stroke bg-white/[0.02]">
        <Icon className="h-4 w-4 text-text-hi" />
      </div>
      <h3 className="mt-4 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 text-sm text-text-mid leading-relaxed max-w-[42ch]">
        {description}
      </p>
      {children && <div className="mt-4">{children}</div>}
    </article>
  );
}

function ReplayMockup() {
  return (
    <div className="mt-6 rounded-xl border border-stroke bg-black/30 p-4 font-mono text-[11px]">
      <div className="flex items-center gap-2 mb-3 text-text-lo">
        <span>⏪</span>
        <span>⏸</span>
        <span>⏩</span>
        <span className="ml-2">0.5x</span>
        <span className="text-alive">1x</span>
        <span>2x</span>
        <span>4x</span>
        <span className="ml-auto">4 月 15 日 → 4 月 22 日</span>
      </div>
      <div className="relative h-8">
        <div className="absolute top-1/2 left-0 right-0 h-px bg-stroke -translate-y-1/2" />
        <div className="absolute top-1/2 left-0 w-[72%] h-px bg-gradient-to-r from-alive via-violet to-magenta -translate-y-1/2" />
        {[10, 22, 35, 48, 62, 72].map((pos, i) => (
          <span
            key={i}
            className={cn(
              "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full",
              i === 5
                ? "h-3 w-3 bg-alive ring-4 ring-alive/20"
                : "h-1.5 w-1.5 bg-text-lo"
            )}
            style={{ left: `${pos}%` }}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-text-mid">
        <BreathingDot size="xs" />
        <span>19:47 · 发布小红书 笔记 #3 · 阅读 1.2k · 收藏 318 · 评论 45</span>
      </div>
    </div>
  );
}

function PlatformRing() {
  const platforms = ["小", "抖", "视", "B", "公"];
  return (
    <div className="mt-4 flex items-center gap-1.5">
      {platforms.map((p, i) => (
        <span
          key={i}
          className="h-7 w-7 rounded-full border border-stroke bg-white/[0.04] flex items-center justify-center text-xs"
        >
          {p}
        </span>
      ))}
      <span className="ml-1 text-xs text-text-lo">+5</span>
    </div>
  );
}
