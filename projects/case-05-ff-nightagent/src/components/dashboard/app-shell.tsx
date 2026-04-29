import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { BreathingDot } from "@/components/motion/breathing-dot";
import {
  Target,
  Inbox,
  Calendar,
  Cpu,
  Settings,
  LifeBuoy,
  Clapperboard,
  Rocket,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MOCK_GOALS, MOCK_APPROVALS, MOCK_SCHEDULES, MOCK_MCP } from "@/lib/mock-data";

interface AppShellProps {
  active?: "goals" | "approvals" | "schedules" | "agents" | "settings" | "demo" | "playground";
  children: React.ReactNode;
}

/**
 * Dashboard 共用 shell —— 左 Sidebar + 主区
 */
export function AppShell({ active, children }: AppShellProps) {
  return (
    <div className="min-h-screen flex bg-grid-soft">
      <Sidebar active={active} />
      <main className="flex-1 overflow-x-hidden relative">
        <div
          className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-[900px] h-60 bg-[radial-gradient(ellipse_at_center,rgba(0,212,255,0.08),transparent_70%)]"
          aria-hidden
        />
        <div className="relative">{children}</div>
      </main>
    </div>
  );
}

function Sidebar({ active }: { active?: string }) {
  const activeLive = MOCK_GOALS.filter((g) => g.status === "running");

  return (
    <aside className="sticky top-0 h-screen w-64 shrink-0 border-r border-stroke bg-void/80 backdrop-blur-xl flex flex-col">
      <div className="px-4 pt-5 pb-3 border-b border-stroke">
        <Link href="/" className="flex items-center">
          <Logo />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <Section label="真实任务">
          <NavLink
            href="/goals/new"
            icon={Rocket}
            label="新建 Goal · 托管"
            badge="NEW"
            active={active === "playground"}
          />
        </Section>

        <Section label="工作区">
          <NavLink
            href="/dashboard"
            icon={Target}
            label="目标"
            count={MOCK_GOALS.length}
            active={active === "goals"}
          />
          <NavLink
            href="/approvals"
            icon={Inbox}
            label="审批"
            count={MOCK_APPROVALS.length}
            badge={MOCK_APPROVALS.length > 0 ? "待审" : undefined}
            active={active === "approvals"}
          />
          <NavLink
            href="/schedules"
            icon={Calendar}
            label="计划任务"
            count={MOCK_SCHEDULES.length}
            active={active === "schedules"}
          />
          <NavLink
            href="/agents"
            icon={Cpu}
            label="Agents 与 MCP"
            count={MOCK_MCP.filter((m) => m.status === "active").length}
            active={active === "agents"}
          />
          <NavLink
            href="/demo/run"
            icon={Clapperboard}
            label="剧本演示"
            badge="LIVE"
            active={active === "demo"}
          />
        </Section>

        <Section label="正在运行">
          {activeLive.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-text-mid hover:bg-white/[0.03]"
            >
              <BreathingDot size="xs" />
              <span className="font-mono truncate">{g.id}</span>
            </div>
          ))}
        </Section>

        <Section label="系统">
          <NavLink
            href="/settings"
            icon={Settings}
            label="设置"
            active={active === "settings"}
          />
          <NavLink href="#" icon={LifeBuoy} label="文档" />
        </Section>
      </nav>

      <div className="border-t border-stroke p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.03]">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-alive via-violet to-magenta shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">muyu</div>
            <div className="text-[10px] font-mono text-text-lo truncate">
              专业版 · 本地演示
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="px-2.5 mb-1 text-[10px] uppercase tracking-wider text-text-lo">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavLink({
  href,
  icon: Icon,
  label,
  count,
  badge,
  active,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  count?: number;
  badge?: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors",
        active
          ? "bg-white/[0.06] text-white"
          : "text-text-mid hover:bg-white/[0.03] hover:text-white"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span
          className={cn(
            "text-[9px] font-mono px-1.5 py-0.5 rounded-full",
            badge === "LIVE"
              ? "bg-alive/15 text-alive"
              : badge === "NEW"
              ? "bg-magenta/15 text-magenta"
              : "bg-pending/15 text-pending"
          )}
        >
          {badge}
        </span>
      )}
      {typeof count === "number" && !badge && (
        <span className="text-[10px] font-mono text-text-lo">{count}</span>
      )}
    </Link>
  );
}
