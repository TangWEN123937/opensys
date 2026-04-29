import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Pricing —— 教学案例，价格仅作 UI 展示
 */
export function Pricing() {
  const plans = [
    {
      name: "免费版",
      price: "¥0",
      period: "永久",
      desc: "先感受一下。",
      features: [
        "1 个活跃目标",
        "每月 50 个动作",
        "1 个关联账号",
        "7 天活动时间线",
      ],
      cta: "立即开始",
      featured: false,
    },
    {
      name: "专业版",
      price: "¥199",
      period: "每月",
      desc: "给能安心睡觉的创作者。",
      features: [
        "5 个活跃目标",
        "每月 2000 个动作",
        "3 个关联账号",
        "完整时间线回放",
        "HITL 批量审批",
        "自动周报",
      ],
      cta: "开通专业版",
      featured: true,
    },
    {
      name: "团队版",
      price: "¥699",
      period: "每月",
      desc: "给工作室和小品牌。",
      features: [
        "不限目标数量",
        "不限动作数量",
        "10 个关联账号",
        "3 个团队席位",
        "共享审批队列",
        "品牌语气长期记忆",
      ],
      cta: "联系我们",
      featured: false,
    },
  ];

  return (
    <section id="pricing" className="relative px-4 sm:px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-stroke bg-white/[0.02] px-3 py-1 text-[11px] font-mono uppercase tracking-wider text-text-mid">
            <span className="h-1 w-1 rounded-full bg-alive" />
            定价
          </div>
          <h2 className="mt-5 text-3xl sm:text-4xl font-semibold tracking-[-0.02em]">
            按动作付费，不按座位。
          </h2>
          <p className="mt-4 text-text-mid">
            Agent 7×24 工作，不应按椅子数收你的钱。
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((p) => (
            <div
              key={p.name}
              className={cn(
                "relative rounded-2xl p-6 lg:p-8",
                p.featured
                  ? "glass-strong bg-gradient-to-b from-white/[0.04] to-transparent shadow-[0_0_80px_-20px_rgba(0,212,255,0.35)]"
                  : "border border-stroke bg-panel/40"
              )}
            >
              {p.featured && (
                <>
                  <div
                    className="absolute inset-0 rounded-2xl p-[1px] pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(135deg, #00D4FF 0%, #C084FC 50%, #F472B6 100%)",
                      WebkitMask:
                        "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                      WebkitMaskComposite: "xor",
                      maskComposite: "exclude",
                    }}
                    aria-hidden
                  />
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-void border border-alive/40 px-3 py-0.5 text-[10px] font-mono uppercase tracking-wider text-alive">
                    最受欢迎
                  </span>
                </>
              )}

              <div className="relative">
                <h3 className="text-xl font-semibold">{p.name}</h3>
                <p className="mt-1 text-sm text-text-mid">{p.desc}</p>

                <div className="mt-6 flex items-baseline gap-2">
                  <span className="text-4xl font-semibold tracking-tight">
                    {p.price}
                  </span>
                  <span className="text-sm text-text-lo">/ {p.period}</span>
                </div>

                <Button
                  variant={p.featured ? "accent" : "ghost"}
                  size="lg"
                  className="mt-6 w-full"
                >
                  {p.cta}
                </Button>

                <ul className="mt-6 space-y-2.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-text-mid">
                      <Check className="h-4 w-4 mt-0.5 text-alive shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
