import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { IsometricOffice } from "@/components/isometric-office";
import { EventFeed } from "@/components/event-feed";
import { LiveCounter } from "@/components/live-counter";
import { OfficeOrchestra } from "@/components/office-orchestra";
import { kpi } from "@/lib/events";
import { formatInt } from "@/lib/utils";

export default function OfficePage() {
  return (
    <>
      <SiteHeader />

      {/* 顶部 Ticker */}
      <div className="border-b border-ink-hair bg-paper/60">
        <div className="container-pro flex items-center justify-between py-3 text-[12px] font-mono">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-sage breathe-sage" />
              <span className="text-ink-mid">办公室 · 全员在岗 · {kpi.aiEmployees} AI + {kpi.humanEmployees} 人类</span>
            </span>
            <span className="text-ink-lo">|</span>
            <span className="text-ink-mid">连续运行 {kpi.uptimeHours} 小时</span>
          </div>
          <div className="flex items-center gap-6 text-ink-mid">
            <span>今日客服响应 <b className="text-ink">{kpi.responseSec}s</b></span>
            <span>·</span>
            <span>今日成本 <b className="text-ink">¥{kpi.costToday.toFixed(2)}</b></span>
          </div>
        </div>
      </div>

      <section id="office-main" className="py-10">
        <div className="container-pro grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
          {/* 左 · 俯视图 */}
          <div>
            <div className="mb-6">
              <h1 className="font-display text-3xl text-ink">办公室主控台</h1>
              <p className="text-ink-mid text-sm mt-1">
                点击任一员工 · 进入 TA 的工作流原理面板
              </p>
            </div>
            <div className="paper p-6">
              <IsometricOffice />
            </div>

            {/* 今日数据卡片 */}
            <div className="grid grid-cols-4 gap-3 mt-6">
              <KPICell label="今日 GMV" value={`¥${formatInt(kpi.revenueToday)}`} />
              <KPICell label="工单" value={formatInt(kpi.ticketsResolved)} />
              <KPICell label="邮件" value={formatInt(kpi.emailsSent)} />
              <KPICell label="PR" value={formatInt(kpi.prsLanded)} />
            </div>

            {/* 全员并行演示 */}
            <div className="mt-10">
              <div className="mb-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-warmth-deep mb-2">
                  Live Orchestra · 6 路并行 mock streaming
                </div>
                <h2 className="font-display text-2xl text-ink leading-tight">一键运行一天 · 看完整办公室如何协同</h2>
                <p className="text-ink-mid text-sm mt-1">
                  6 个 SSE 流并发 · 每路独立 phase / 工具栈 / 产出 · 顶部聚合实时累加。点任一员工卡片可进入 TA 的工作流原理面板。
                </p>
              </div>
              <OfficeOrchestra />
            </div>
          </div>

          {/* 右 · Live Counter + 事件流 */}
          <div className="space-y-5">
            <LiveCounter />
            <EventFeed maxRows={10} />
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}

function KPICell({ label, value }: { label: string; value: string }) {
  return (
    <div className="paper p-4">
      <div className="text-[10px] font-mono uppercase tracking-wider text-ink-lo mb-1">
        今日{label}
      </div>
      <div className="num-ticker text-2xl text-ink">{value}</div>
    </div>
  );
}
