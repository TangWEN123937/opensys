"use client";

import { useEffect, useState } from "react";
import { formatCurrency, formatInt } from "@/lib/utils";
import { kpi } from "@/lib/events";

/** 右上角实时计数器 · 每 1.8s 微跳 · 商业级质感 */
export function LiveCounter() {
  const [revenue, setRevenue] = useState(kpi.revenueToday);
  const [tickets, setTickets] = useState(kpi.ticketsResolved);
  const [emails, setEmails] = useState(kpi.emailsSent);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setRevenue((v) => v + Math.floor(Math.random() * 28) + 3);
      if (Math.random() < 0.6) setTickets((v) => v + 1);
      if (Math.random() < 0.8) setEmails((v) => v + Math.floor(Math.random() * 4) + 1);
      setPulse((p) => p + 1);
    }, 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="paper paper-raised p-6 w-full max-w-[420px]">
      {/* 顶部标签 */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-sage breathe-sage" />
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-mid">
            Live · 实时
          </span>
        </div>
        <span className="font-mono text-[11px] text-ink-lo">
          {new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
        </span>
      </div>

      {/* 主数字 · 今日营收 */}
      <div className="mb-6">
        <div className="text-[11px] font-mono uppercase tracking-wider text-ink-lo mb-1">
          今日营收
        </div>
        <div
          key={pulse % 2}
          className="num-ticker text-5xl text-ink leading-none"
        >
          <span className="text-warmth-deep">¥</span>
          {formatInt(revenue)}
        </div>
        <div className="text-xs text-ink-mid mt-2 flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-sage">
            <path d="M6 2L10 8H2L6 2Z" fill="currentColor" />
          </svg>
          <span>老板昨晚睡觉期间 · 营收增加 <b className="text-ink">¥{kpi.sleepDelta.toLocaleString()}</b></span>
        </div>
      </div>

      <div className="ink-divider mb-5" />

      {/* 次要指标 · 三列 */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCell label="处理工单" value={formatInt(tickets)} />
        <MetricCell label="发出邮件" value={formatInt(emails)} />
        <MetricCell label="合并 PR"  value={formatInt(kpi.prsLanded)} />
      </div>

      {/* 底部动态条 */}
      <div className="mt-5 pt-4 border-t border-ink-hair flex items-center justify-between text-[11px] font-mono">
        <span className="text-ink-lo">今日成本</span>
        <span className="text-ink">¥{kpi.costToday.toFixed(2)}</span>
        <span className="text-ink-lo">·</span>
        <span className="text-ink-lo">运行</span>
        <span className="text-ink">{kpi.uptimeHours}h</span>
      </div>
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-mono uppercase tracking-wider text-ink-lo mb-1">
        {label}
      </span>
      <span className="num-ticker text-xl text-ink leading-none">{value}</span>
    </div>
  );
}
