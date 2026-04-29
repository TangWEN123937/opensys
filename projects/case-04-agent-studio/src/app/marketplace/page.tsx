"use client";

import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import {
  Store,
  TrendingUp,
  DollarSign,
  Star,
  Download,
  Plus,
  Sparkles,
  ArrowUpRight,
  Package,
  Users,
} from "lucide-react";

const topAgents = [
  { id: "research-writer", name: "research-writer", price: 29, sales: 842, revenue: 24418, stars: 4.8, category: "生产力" },
  { id: "pdf-extractor", name: "pdf-extractor", price: 19, sales: 1240, revenue: 23560, stars: 4.9, category: "数据处理" },
  { id: "sales-qualifier", name: "sales-qualifier", price: 49, sales: 320, revenue: 15680, stars: 4.6, category: "销售" },
  { id: "code-review", name: "code-review-ai", price: 39, sales: 280, revenue: 10920, stars: 4.7, category: "开发" },
  { id: "meeting-notes", name: "meeting-notes-pro", price: 15, sales: 680, revenue: 10200, stars: 4.5, category: "办公" },
];

const revenueChart = Array.from({ length: 30 }, (_, i) => 200 + Math.sin(i * 0.3) * 80 + i * 12);

export default function MarketplacePage() {
  return (
    <PageShell
      title="Marketplace"
      subtitle="创作者中心 · 上架 Agent / Skill / MCP · 收入分成 · 实时订单流"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => notify.info("创作者指南已在新标签打开", "规范 + 70% 分成 + 结算周期")}>
            <Sparkles className="w-3.5 h-3.5" /> 创作者指南
          </Button>
          <Button size="sm" onClick={() => notify.todo("上架向导 · 封面 / 定价 / 演示 Agent 三步")}>
            <Plus className="w-3.5 h-3.5" /> 上架新作品
          </Button>
        </>
      }
    >
      {/* Creator stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <CreatorStat icon={DollarSign} color="text-success" label="本月收入" value="¥8,428" sub="+24% vs 上月" />
        <CreatorStat icon={Download} color="text-info" label="本月下载" value="3,260" sub="7 个在售作品" />
        <CreatorStat icon={Star} color="text-accent" label="平均评分" value="4.82" sub="1,284 条评价" />
        <CreatorStat icon={Users} color="text-skill" label="关注者" value="248" sub="+18 本周" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4 mb-4">
        {/* Revenue chart */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[13px] font-semibold">收入趋势 · 近 30 天</h3>
              <p className="text-[11px] text-ink-mute mt-0.5">每日累计 · ¥</p>
            </div>
            <Badge variant="mono" className="text-[10px]">¥8,428 合计</Badge>
          </div>
          <RevenueLine data={revenueChart} />
        </div>

        {/* Top agents */}
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
            <h3 className="text-[13px] font-semibold flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
              热卖 · 我的作品
            </h3>
          </div>
          <table className="w-full text-[13px]">
            <thead className="bg-elevated/30 text-[9.5px] uppercase tracking-wider text-ink-mute">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">作品</th>
                <th className="text-right px-2 py-2 font-semibold">定价</th>
                <th className="text-right px-2 py-2 font-semibold">销量</th>
                <th className="text-right px-4 py-2 font-semibold">收入</th>
              </tr>
            </thead>
            <tbody>
              {topAgents.map((a) => (
                <tr key={a.id} className="border-t border-border-subtle">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Package className="w-3 h-3" strokeWidth={1.8} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-mono text-[12px] font-medium truncate">{a.name}</div>
                        <div className="text-[10px] text-ink-mute">
                          <Star className="w-2.5 h-2.5 inline text-accent" /> {a.stars} · {a.category}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-[11.5px] text-ink-soft">¥{a.price}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-[11.5px] text-ink-soft">{a.sales}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-[12px] text-ink font-semibold">¥{a.revenue.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent orders */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
          <h3 className="text-[13px] font-semibold flex items-center gap-2">
            <Store className="w-3.5 h-3.5 text-ink-soft" />
            订单流 · 近 1 小时
          </h3>
          <Badge variant="success" className="text-[10px]">
            <span className="relative w-1.5 h-1.5 rounded-full bg-success mr-1">
              <span className="absolute inset-0 rounded-full bg-success animate-ping opacity-60" />
            </span>
            live
          </Badge>
        </div>
        <ul className="divide-y divide-border-subtle">
          {[
            { t: "2 分钟前", buyer: "startup_xxx", item: "research-writer", price: 29, net: 20.3, share: "70%" },
            { t: "8 分钟前", buyer: "freelancer_ab", item: "pdf-extractor", price: 19, net: 13.3, share: "70%" },
            { t: "15 分钟前", buyer: "team_enterprise", item: "research-writer × 10", price: 290, net: 203, share: "70%" },
            { t: "22 分钟前", buyer: "indie_dev_1", item: "code-review-ai", price: 39, net: 27.3, share: "70%" },
            { t: "34 分钟前", buyer: "consultant_m", item: "meeting-notes-pro × 3", price: 45, net: 31.5, share: "70%" },
            { t: "48 分钟前", buyer: "marketing_ag", item: "sales-qualifier", price: 49, net: 34.3, share: "70%" },
          ].map((o, i) => (
            <li key={i} className="px-5 py-3 flex items-center gap-4 hover:bg-elevated/30 transition-colors">
              <div className="text-[10.5px] font-mono text-ink-mute w-20 shrink-0">{o.t}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap text-[12.5px]">
                  <span className="font-mono text-ink-mute">{o.buyer}</span>
                  <span className="text-ink-mute">买了</span>
                  <span className="font-medium text-ink font-mono">{o.item}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[12.5px] font-mono text-ink-mute line-through">¥{o.price}</div>
                <div className="text-[13px] font-semibold font-mono text-success flex items-center gap-1">
                  +¥{o.net} <Badge variant="success" className="text-[9px]">{o.share}</Badge>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </PageShell>
  );
}

function CreatorStat({
  icon: Icon,
  color,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  color: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] text-ink-mute">{label}</span>
        <div className={`w-7 h-7 rounded-lg bg-elevated flex items-center justify-center ${color}`}>
          <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
        </div>
      </div>
      <div className="text-[24px] font-bold font-mono tracking-tight text-ink mb-1">{value}</div>
      <div className="text-[11px] text-ink-mute font-mono flex items-center gap-1">
        <ArrowUpRight className="w-3 h-3 text-success" />{sub}
      </div>
    </div>
  );
}

function RevenueLine({ data }: { data: number[] }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * 720},${160 - ((v - min) / range) * 140}`)
    .join(" ");
  return (
    <svg viewBox="0 0 720 200" className="w-full h-40">
      <defs>
        <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(145 55% 38%)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="hsl(145 55% 38%)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 40, 80, 120, 160].map((y) => (
        <line key={y} x1="0" y1={y} x2="720" y2={y} stroke="hsl(222 14% 93%)" strokeWidth="1" />
      ))}
      <polyline points={`0,200 ${points} 720,200`} fill="url(#rev-grad)" />
      <polyline points={points} fill="none" stroke="hsl(145 55% 38%)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* end dot */}
      <circle cx="720" cy={200 - ((data[data.length - 1] - min) / range) * 140 - 40 + 40} r="4" fill="hsl(145 55% 38%)" stroke="white" strokeWidth="2" />
    </svg>
  );
}
