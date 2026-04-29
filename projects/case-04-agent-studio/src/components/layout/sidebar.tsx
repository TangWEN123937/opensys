"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Workflow,
  Layers,
  PlayCircle,
  Waves,
  Puzzle,
  Server,
  Wrench,
  Cpu,
  Brain,
  Database,
  FlaskConical,
  GitMerge,
  Gauge,
  Users,
  ScrollText,
  Rocket,
  Store,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const groups: Array<{
  label: string;
  items: Array<{
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color?: string;
  }>;
}> = [
  {
    label: "概览",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Agent 编排工坊",
    items: [
      { href: "/studio", label: "Studio 画布", icon: Workflow, color: "text-agent" },
      { href: "/studio/patterns", label: "Pattern Gallery", icon: Layers, color: "text-agent" },
      { href: "/run", label: "Run Console", icon: PlayCircle, color: "text-agent" },
      { href: "/run/live", label: "Live Run · ReAct", icon: PlayCircle, color: "text-agent" },
      { href: "/trace/waterfall", label: "Trace Waterfall", icon: Waves, color: "text-trace" },
    ],
  },
  {
    label: "四大运行时",
    items: [
      { href: "/skills", label: "Skills Hub", icon: Puzzle, color: "text-skill" },
      { href: "/mcp", label: "MCP Servers", icon: Server, color: "text-mcp" },
      { href: "/tools", label: "Tools Registry", icon: Wrench, color: "text-tool" },
      { href: "/models", label: "Model Router", icon: Cpu, color: "text-model" },
    ],
  },
  {
    label: "数据与记忆",
    items: [
      { href: "/memory", label: "Memory", icon: Brain, color: "text-memory" },
      { href: "/knowledge", label: "Knowledge (RAG)", icon: Database, color: "text-memory" },
    ],
  },
  {
    label: "评估与观测",
    items: [
      { href: "/eval", label: "Eval Lab", icon: FlaskConical, color: "text-eval" },
      { href: "/trace", label: "Trace Explorer", icon: GitMerge, color: "text-trace" },
      { href: "/monitor", label: "Monitor", icon: Gauge, color: "text-trace" },
    ],
  },
  {
    label: "治理与协作",
    items: [
      { href: "/teams", label: "Teams", icon: Users },
      { href: "/audit", label: "Audit Logs", icon: ScrollText },
    ],
  },
  {
    label: "发布与商业化",
    items: [
      { href: "/deploy", label: "Deploy & API", icon: Rocket },
      { href: "/marketplace", label: "Marketplace", icon: Store, color: "text-accent" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[240px] shrink-0 border-r border-border bg-surface flex flex-col h-screen sticky top-0">
      {/* Brand */}
      <Link href="/" className="flex items-center gap-2 px-5 py-4 border-b border-border-subtle">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-primary-foreground" strokeWidth={2.2} />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[14px] font-semibold text-ink tracking-tight">Agent Studio</span>
          <span className="text-[10px] text-ink-mute font-mono tracking-wider">v0.1 · ALPHA</span>
        </div>
      </Link>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-5">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="px-3 mb-1 text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute">
              {g.label}
            </div>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = pathname === it.href || (it.href !== "/" && pathname?.startsWith(it.href));
                const Icon = it.icon;
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors",
                        active
                          ? "bg-primary-tint text-primary font-medium"
                          : "text-ink-soft hover:bg-elevated hover:text-ink",
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-4 h-4 shrink-0",
                          active ? "text-primary" : it.color ?? "text-ink-mute",
                        )}
                        strokeWidth={1.75}
                      />
                      <span className="truncate">{it.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Settings footer */}
      <div className="border-t border-border-subtle p-2">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors",
            pathname?.startsWith("/settings")
              ? "bg-primary-tint text-primary font-medium"
              : "text-ink-soft hover:bg-elevated hover:text-ink",
          )}
        >
          <SettingsIcon className="w-4 h-4 text-ink-mute" strokeWidth={1.75} />
          Settings
        </Link>
      </div>
    </aside>
  );
}
