import { AppShell } from "@/components/dashboard/app-shell";
import { Button } from "@/components/ui/button";
import { MOCK_MCP } from "@/lib/mock-data";
import { BreathingDot } from "@/components/motion/breathing-dot";
import { Plus, Cpu, Settings2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AgentsPage() {
  return (
    <AppShell active="agents">
      <header className="border-b border-stroke px-8 py-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Cpu className="h-5 w-5 text-alive" />
            <h1 className="text-xl font-semibold tracking-tight">Agents 与 MCP</h1>
          </div>
          <p className="mt-1 text-sm text-text-mid">
            已连接的 MCP 服务器 · 你的 Agent 可调用的工具 · 当前活跃{" "}
            {MOCK_MCP.filter((m) => m.status === "active").length} 个
          </p>
        </div>
        <Button variant="accent" size="md">
          <Plus className="h-4 w-4" />
          添加服务器
        </Button>
      </header>

      <div className="p-8 space-y-6">
        <div className="rounded-xl border border-alive/20 bg-alive/5 p-4 flex items-start gap-3">
          <Zap className="h-4 w-4 text-alive mt-0.5 shrink-0" />
          <div className="text-sm">
            <span className="font-semibold text-white">MCP</span>{" "}
            <span className="text-text-mid">
              是通用工具协议。每个 MCP 服务器对外暴露一组工具（例如{" "}
              <code className="font-mono text-alive">xhs.post</code>、
              <code className="font-mono text-alive">skyvern.navigate</code>），
              你的 Agent 可以自主调用它们。
            </span>
          </div>
        </div>

        <ul className="space-y-2">
          {MOCK_MCP.map((s, idx) => {
            const active = s.status === "active";
            return (
              <li
                key={s.id}
                className={cn(
                  "rounded-xl border bg-panel/40 transition-colors",
                  active
                    ? "border-stroke hover:border-stroke-strong"
                    : "border-stroke/50 opacity-60 hover:opacity-100"
                )}
                style={{ animation: `fade-up 400ms ease-out ${idx * 50}ms backwards` }}
              >
                <div className="flex items-center gap-4 px-5 py-4">
                  {active ? (
                    <BreathingDot size="sm" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-text-lo ring-2 ring-text-lo/20" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-medium text-white">
                        {s.name}
                      </span>
                      <span className="text-[10px] font-mono uppercase tracking-wider rounded-full border border-stroke bg-white/[0.02] px-2 py-0.5 text-text-lo">
                        {s.toolCount} 个工具
                      </span>
                      {!active && (
                        <span className="text-[10px] font-mono rounded-full bg-white/[0.05] px-2 py-0.5 text-text-lo">
                          已暂停
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-text-mid truncate">
                      {s.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm">
                      <Settings2 className="h-3.5 w-3.5" />
                      配置
                    </Button>
                    <Button variant="ghost" size="sm">
                      {active ? "禁用" : "启用"}
                    </Button>
                  </div>
                </div>

                {idx === 0 && active && (
                  <div className="border-t border-stroke px-5 py-3 bg-black/20 flex flex-wrap gap-1.5">
                    {[
                      "xhs.post_note",
                      "xhs.schedule",
                      "xhs.reply_comment",
                      "xhs.analytics",
                      "xhs.search_notes",
                      "xhs.auth_status",
                    ].map((tool) => (
                      <span
                        key={tool}
                        className="inline-flex items-center gap-1.5 rounded-md border border-stroke bg-white/[0.03] px-2 py-1 text-[11px] font-mono text-text-mid"
                      >
                        <span className="h-1 w-1 rounded-full bg-alive" />
                        {tool}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </AppShell>
  );
}
