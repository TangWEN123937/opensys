import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { scenarios } from "@/lib/scenarios";
import { employees } from "@/lib/employees";

export default function ScenariosPage() {
  return (
    <>
      <SiteHeader />

      <section className="border-b border-ink-hair">
        <div className="container-pro py-14">
          <div className="badge-tag badge-tag-warmth mb-5">
            <span>5 个真实落地模板</span>
          </div>
          <h1 className="font-display text-5xl md:text-6xl text-ink leading-tight">
            这些公司是怎么用 <span className="hand-underline">AI 员工</span> 赚钱的
          </h1>
          <p className="mt-5 text-ink-mid max-w-2xl text-lg">
            每个场景都是 2025-2026 真实案例 · 带可追溯来源。
            照着配置复制到你的飞书 · 立刻上岗。
          </p>
        </div>
      </section>

      {scenarios.map((s, idx) => (
        <section
          key={s.id}
          id={s.id}
          className={`py-20 ${idx % 2 === 1 ? "bg-paper/40" : ""}`}
        >
          <div className="container-pro">
            <div className="grid md:grid-cols-[0.8fr_1.2fr] gap-10 items-start">
              {/* 左 · 标题 + 引言 */}
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-warmth-deep mb-3">
                  场景 {s.badge}
                </div>
                <h2 className="font-display text-4xl text-ink leading-tight">
                  {s.title}
                </h2>
                <p className="text-xl text-ink-soft mt-3 leading-snug">
                  {s.headline}
                </p>
                <p className="text-[13px] text-ink-mid font-mono mt-2">{s.subhead}</p>

                <blockquote className="mt-6 paper p-5 relative">
                  <span className="absolute -top-3 left-4 font-display text-4xl text-warmth-deep leading-none">
                    &ldquo;
                  </span>
                  <p className="font-display text-base text-ink leading-relaxed">
                    {s.heroQuote}
                  </p>
                  <div className="text-[11px] font-mono text-ink-lo mt-3 uppercase tracking-wider">
                    — {s.heroSource}
                  </div>
                </blockquote>

                {/* 员工头像行 */}
                <div className="mt-6">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-ink-lo mb-3">
                    本场景的员工组合
                  </div>
                  <div className="flex items-center gap-2">
                    {s.employees.map((id) => {
                      const emp = employees.find((e) => e.id === id);
                      if (!emp) return null;
                      return (
                        <div
                          key={id}
                          className="w-10 h-10 rounded-full flex items-center justify-center font-display text-xs border-2 border-canvas shadow"
                          style={{ background: emp.bgColor, color: emp.accent }}
                          title={emp.name}
                        >
                          {emp.initials}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 右 · ROI + Pipeline + Cases */}
              <div className="space-y-6">
                {/* ROI 四格 */}
                <div className="grid grid-cols-2 gap-3">
                  {s.roi.map((r) => (
                    <div key={r.label} className="paper p-5">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-ink-lo mb-1">
                        {r.label}
                      </div>
                      <div className="num-ticker text-2xl text-warmth-deep leading-none">
                        {r.value}
                      </div>
                      <div className="text-[11px] text-ink-mid mt-2 leading-snug">
                        {r.detail}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pipeline 流水线 */}
                <div className="paper p-5">
                  <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-ink-mid mb-4">
                    员工流水线配置
                  </div>
                  <ol className="space-y-3">
                    {s.pipeline.map((p, i) => (
                      <li key={i} className="flex gap-3 items-start">
                        <span className="w-5 h-5 rounded-full bg-ink text-canvas font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <div className="flex-1">
                          <div className="text-[13px] font-medium text-ink">{p.role}</div>
                          <div className="text-[12px] text-ink-mid">{p.action}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Case Studies */}
                <div className="paper p-5">
                  <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-ink-mid mb-4">
                    参考案例
                  </div>
                  <ul className="space-y-2.5">
                    {s.caseStudies.map((c) => (
                      <li key={c.name} className="text-[13px] flex items-start gap-3 pb-2.5 border-b border-ink-hair last:border-none">
                        <span className="font-medium text-ink shrink-0">{c.name}</span>
                        <span className="text-ink-mid flex-1">{c.detail}</span>
                        <span className="text-[10px] font-mono text-ink-lo uppercase">{c.source}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
      ))}

      <SiteFooter />
    </>
  );
}
