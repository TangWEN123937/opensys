import { notFound } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LiveDemo } from "@/components/live-demo";
import { employees, getEmployee, statusLabel, statusColor } from "@/lib/employees";
import { eventsFeed } from "@/lib/events";

export function generateStaticParams() {
  return employees.map((e) => ({ id: e.id }));
}

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EmployeePage({ params }: PageProps) {
  const { id } = await params;
  const emp = getEmployee(id);
  if (!emp) notFound();

  const recent = eventsFeed.filter((ev) => ev.employeeId === id).slice(0, 6);

  return (
    <>
      <SiteHeader />

      {/* 员工工牌 Hero */}
      <section className="border-b border-ink-hair bg-paper/40">
        <div className="container-pro py-12">
          <Link href="/office" className="inline-flex items-center gap-2 text-[12px] font-mono text-ink-mid hover:text-warmth mb-8">
            ← 回办公室
          </Link>

          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-8 items-start">
            {/* 头像 */}
            <div className="relative">
              <div
                className="w-32 h-32 rounded-full flex items-center justify-center font-display text-5xl shadow-lg"
                style={{ background: emp.bgColor, color: emp.accent }}
              >
                {emp.initials}
              </div>
              <span
                className="absolute bottom-1 right-1 w-6 h-6 rounded-full border-4 border-canvas breathe-sage"
                style={{ background: statusColor[emp.status] }}
              />
            </div>

            {/* 信息 */}
            <div>
              <div className="badge-tag badge-tag-warmth mb-3">
                <span>{statusLabel[emp.status]}</span>
              </div>
              <h1 className="font-display text-5xl text-ink leading-tight">{emp.name}</h1>
              <div className="font-mono text-sm text-ink-mid mt-2 uppercase tracking-wider">
                {emp.title}
              </div>
              <blockquote className="mt-5 text-lg text-ink-soft italic font-display max-w-xl leading-snug">
                「{emp.introLine}」
              </blockquote>
            </div>

            {/* 数字 */}
            <div className="flex flex-col gap-3 text-right">
              <div>
                <div className="text-[10px] uppercase font-mono tracking-wider text-ink-lo">
                  {emp.metrics.todayLabel}
                </div>
                <div className="num-ticker text-4xl text-warmth-deep">
                  {emp.metrics.todayCount.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-mono tracking-wider text-ink-lo">
                  {emp.metrics.totalLabel}
                </div>
                <div className="num-ticker text-2xl text-ink">{emp.metrics.totalValue}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 实时演示舞台 · 核心 */}
      <section className="py-16">
        <div className="container-pro">
          <div className="mb-8">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-warmth-deep mb-3">
              Live Demo · 全 mock 流式 · 完整工作流
            </div>
            <h2 className="font-display text-4xl text-ink">
              派发任务 · 看 {emp.name} 怎么干
            </h2>
            <p className="text-ink-mid mt-2 max-w-xl text-[14px]">
              点 ▶ 派发任务，TA 会真实地走完一遍：思考 → 调工具 → 写产出 → 上交。
              过程中你能看到 8 大机制如何被激活、token 在哪几个机制里燃烧、产出怎么逐步成型。
            </p>
          </div>

          <LiveDemo employee={emp} />
        </div>
      </section>

      {/* 技能栈 + 近期动作 */}
      <section className="py-16 bg-paper/40">
        <div className="container-pro grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-10">
          <div className="paper p-6">
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-mid mb-4">
              Hermes Skills 挂载
            </div>
            <ul className="space-y-3">
              {emp.skills.map((s) => (
                <li key={s} className="flex items-center gap-3 text-[13px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-warmth" />
                  <code className="font-mono text-ink">{s}</code>
                </li>
              ))}
            </ul>
            <div className="ink-divider my-5" />
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-mid mb-3">
              出现在以下场景
            </div>
            <div className="flex flex-wrap gap-2">
              {emp.cases.map((c) => (
                <span key={c} className="badge-tag badge-tag-sage">{c}</span>
              ))}
            </div>
          </div>

          <div className="paper p-6">
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-mid mb-4">
              最近动作 · {emp.name}
            </div>
            <div className="space-y-3">
              {recent.length === 0 && (
                <div className="text-sm text-ink-lo">暂无最近动作</div>
              )}
              {recent.map((ev, i) => (
                <div key={i} className="flex items-start gap-3 pb-3 border-b border-ink-hair last:border-none">
                  <span className="font-mono text-[10px] text-ink-lo w-10 pt-0.5">{ev.time}</span>
                  <div className="flex-1">
                    <div className="text-[13px] text-ink">{ev.verb}</div>
                    <div className="text-[11px] text-ink-lo font-mono mt-0.5">{ev.payload}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}

