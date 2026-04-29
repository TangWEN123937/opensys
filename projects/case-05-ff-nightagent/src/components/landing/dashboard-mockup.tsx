import { BreathingDot } from "@/components/motion/breathing-dot";
import {
  CheckCircle2,
  Circle,
  Inbox,
  Calendar,
  Users,
  Target,
  FileText,
  TrendingUp,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Landing Hero 下方的 Dashboard 静态 mockup
 */
export function DashboardMockup() {
  return (
    <section id="preview" className="relative px-4 sm:px-6 pb-20">
      <div className="relative mx-auto max-w-6xl">
        <div
          className="absolute -inset-x-20 -top-10 h-40 bg-gradient-to-b from-alive/10 to-transparent blur-3xl"
          aria-hidden
        />

        <div className="relative glass-strong rounded-2xl overflow-hidden shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-stroke bg-black/20">
            <div className="flex gap-1.5">
              <span className="h-3 w-3 rounded-full bg-[#FF5F56]/80" />
              <span className="h-3 w-3 rounded-full bg-[#FFBD2E]/80" />
              <span className="h-3 w-3 rounded-full bg-[#27C93F]/80" />
            </div>
            <div className="mx-auto px-3 py-1 rounded-md bg-white/[0.04] text-xs text-text-mid font-mono">
              ff-autopilot.local / dashboard
            </div>
            <div className="w-14" />
          </div>

          <div className="grid grid-cols-12 min-h-[520px]">
            <aside className="col-span-3 border-r border-stroke bg-black/10 p-3">
              <div className="flex items-center gap-2 px-2 py-2 mb-2">
                <span className="h-4 w-4 rounded-full bg-gradient-to-br from-alive to-violet" />
                <span className="text-sm font-medium">FF-Autopilot</span>
              </div>
              <nav className="space-y-0.5 text-xs">
                <NavRow icon={Target} label="目标" count={3} active />
                <NavRow icon={Inbox} label="审批" count={2} />
                <NavRow icon={Calendar} label="计划任务" count={7} />
                <NavRow icon={Users} label="Agents" count={4} />
              </nav>
              <div className="mt-5 pt-4 border-t border-stroke">
                <div className="px-2 mb-2 text-[10px] uppercase tracking-wider text-text-lo">
                  正在运行
                </div>
                <LiveRow name="growth-plan-q2" />
                <LiveRow name="dm-monitor" />
              </div>
            </aside>

            <div className="col-span-9 p-5 space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <MetricCard label="关注者" value="+547" trend="+12.5%" />
                <MetricCard label="互动率" value="8.3%" trend="+0.6pt" />
                <MetricCard label="选题储备" value="24" trend="本周" subtle />
                <MetricCard label="周报" value="4" trend="自动" subtle />
              </div>

              <div className="grid grid-cols-5 gap-4">
                <div className="col-span-2 rounded-xl border border-stroke bg-black/20 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-text-lo uppercase tracking-wider">
                      Plan Tree · 计划树
                    </span>
                    <span className="text-[10px] text-text-lo font-mono">4/7</span>
                  </div>
                  <ul className="space-y-2 text-sm">
                    <PlanItem status="done" text="扫描 5 个竞品账号" />
                    <PlanItem status="done" text="提取小红书热门选题" />
                    <PlanItem status="done" text="起草 10 条内容变体" />
                    <PlanItem status="doing" text="生成 3 张主视觉 (2/3)" />
                    <PlanItem status="pending" text="排入发布日程" />
                    <PlanItem status="pending" text="准备 DM 回复模板" />
                    <PlanItem status="pending" text="撰写本周复盘" />
                  </ul>
                </div>

                <div className="col-span-3 rounded-xl border border-stroke bg-black/20 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <BreathingDot size="xs" />
                    <span className="text-xs text-text-lo uppercase tracking-wider">
                      实时思考流
                    </span>
                    <span className="ml-auto text-[10px] font-mono text-text-lo">
                      claude-opus-4-7
                    </span>
                  </div>
                  <div className="space-y-2.5 text-sm">
                    <ThoughtReasoning>
                      本周竞品密集发布「2026 Q1 AI 工具」相关短图文，受众更认可『人的故事』胜过技术规格。
                    </ThoughtReasoning>
                    <ToolCallLine tool="browser.screenshot" target="xhs.com/@alice" />
                    <ToolCallLine tool="image.generate" target="hero-variant-2.png" />
                    <ThoughtReasoning typing>
                      正在起草第 3 条变体，语调更冷静一些…
                    </ThoughtReasoning>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-stroke bg-black/20 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs text-text-lo uppercase tracking-wider">
                    最近活动
                  </span>
                </div>
                <ul className="space-y-1.5 text-xs text-text-mid font-mono">
                  <ActivityLine icon={FileText} time="刚刚" text="生成 hero-variant-2.png" />
                  <ActivityLine icon={TrendingUp} time="2 分钟前" text="分析了 @competitor/alice 的 5 条帖子" />
                  <ActivityLine icon={MessageSquare} time="8 分钟前" text="排队 1 条 DM 等待审批" hl />
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function NavRow({
  icon: Icon,
  label,
  count,
  active,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md",
        active ? "bg-white/[0.06] text-white" : "text-text-mid"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="flex-1">{label}</span>
      <span className="text-[10px] text-text-lo font-mono">{count}</span>
    </div>
  );
}

function LiveRow({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-text-mid">
      <BreathingDot size="xs" />
      <span className="font-mono truncate">{name}</span>
    </div>
  );
}

function MetricCard({
  label,
  value,
  trend,
  subtle,
}: {
  label: string;
  value: string;
  trend: string;
  subtle?: boolean;
}) {
  return (
    <div className="rounded-xl border border-stroke bg-black/20 p-3">
      <div className="text-[10px] text-text-lo uppercase tracking-wider">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      <div
        className={cn(
          "text-[10px] mt-0.5",
          subtle ? "text-text-lo" : "text-success"
        )}
      >
        {trend}
      </div>
    </div>
  );
}

function PlanItem({
  status,
  text,
}: {
  status: "done" | "doing" | "pending";
  text: string;
}) {
  if (status === "done") {
    return (
      <li className="flex items-center gap-2 text-text-lo line-through decoration-white/20">
        <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
        <span>{text}</span>
      </li>
    );
  }
  if (status === "doing") {
    return (
      <li className="flex items-center gap-2 text-white">
        <span className="relative h-3.5 w-3.5 shrink-0">
          <span className="absolute inset-0 rounded-full border-2 border-pending/30" />
          <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-pending animate-spin [animation-duration:1.6s]" />
        </span>
        <span>{text}</span>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 text-text-mid">
      <Circle className="h-3.5 w-3.5 text-text-lo shrink-0" />
      <span>{text}</span>
    </li>
  );
}

function ThoughtReasoning({
  children,
  typing,
}: {
  children: React.ReactNode;
  typing?: boolean;
}) {
  return (
    <p className="text-text-mid italic leading-snug">
      {children}
      {typing && (
        <span className="inline-block w-[0.5em] h-[1em] ml-1 bg-alive align-middle animate-pulse" />
      )}
    </p>
  );
}

function ToolCallLine({ tool, target }: { tool: string; target: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-stroke bg-black/30 px-2.5 py-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-alive" />
      <span className="text-[11px] font-mono">
        <span className="text-alive">{tool}</span>
        <span className="text-text-lo"> ← </span>
        <span className="text-text-mid">{target}</span>
      </span>
    </div>
  );
}

function ActivityLine({
  icon: Icon,
  time,
  text,
  hl,
}: {
  icon: LucideIcon;
  time: string;
  text: string;
  hl?: boolean;
}) {
  return (
    <li className={cn("flex items-center gap-2", hl && "text-pending")}>
      <Icon className="h-3 w-3 shrink-0" />
      <span className="text-text-lo w-20 shrink-0">{time}</span>
      <span>{text}</span>
    </li>
  );
}
