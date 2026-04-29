import Link from "next/link";
import { mechanisms } from "@/lib/mechanisms";

export function MechanismStrip() {
  return (
    <section className="relative py-20">
      <div className="container-pro">
        <div className="flex items-end justify-between mb-10">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-warmth-deep mb-3">
              Anthropic · Context Engineering
            </div>
            <h2 className="font-display text-4xl md:text-5xl text-ink leading-tight">
              你的 AI 员工如何<span className="hand-underline">思考</span>
            </h2>
            <p className="mt-4 text-ink-mid text-base max-w-xl leading-relaxed">
              8 大机制 · 出自 Anthropic 官方 2025-09-29 工程博客。
              前 4 条是上下文的静态组成 · 后 4 条是长时任务的动态策略。
              点击任一机制 · 进员工详情页看它运行时的数据流。
            </p>
          </div>
          <Link
            href="/employee/alex"
            className="hidden md:inline-flex items-center gap-2 font-mono text-xs text-ink-mid hover:text-warmth transition"
          >
            进员工详情看完整流程 →
          </Link>
        </div>

        {/* 机制条 · 两行 · 上：Anatomy  下：Long-horizon */}
        <div className="space-y-6">
          <MechRow title="上下文组成 · Anatomy" items={mechanisms.filter((m) => m.category === "anatomy")} />
          <MechRow title="长时策略 · Long-Horizon" items={mechanisms.filter((m) => m.category === "long-horizon")} />
        </div>
      </div>
    </section>
  );
}

function MechRow({ title, items }: { title: string; items: typeof mechanisms }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className="h-px flex-1 bg-ink-line" />
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-lo">
          {title}
        </span>
        <span className="h-px flex-1 bg-ink-line" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((m) => (
          <Link
            key={m.id}
            href={`/employee/alex?mechanism=${m.id}`}
            className="paper p-5 hover:-translate-y-0.5 transition-transform group"
          >
            <div className="flex items-start justify-between mb-3">
              <span className="text-2xl">{m.icon}</span>
              <span className="font-mono text-[11px] text-ink-lo">0{m.number}</span>
            </div>
            <div className="font-display text-lg text-ink leading-tight mb-1">
              {m.nameZh}
            </div>
            <div className="font-mono text-[10px] text-ink-lo uppercase tracking-wider mb-3">
              {m.nameEn}
            </div>
            <p className="text-[13px] text-ink-mid leading-relaxed line-clamp-3">
              {m.summary}
            </p>
            <div className="mt-3 pt-3 border-t border-ink-hair text-[10px] font-mono text-warmth-deep opacity-0 group-hover:opacity-100 transition">
              看这机制如何运行 →
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
