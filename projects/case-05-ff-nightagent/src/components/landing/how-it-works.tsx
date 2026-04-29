import { Target, Repeat, CheckCheck, ArrowRight } from "lucide-react";

export function HowItWorks() {
  return (
    <section id="how" className="relative px-4 sm:px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-stroke bg-white/[0.02] px-3 py-1 text-[11px] font-mono uppercase tracking-wider text-text-mid">
            <span className="h-1 w-1 rounded-full bg-alive" />
            三步就够
          </div>
          <h2 className="mt-5 text-3xl sm:text-4xl font-semibold tracking-[-0.02em]">
            从一个目标到 Agent 自己跑起来
          </h2>
          <p className="mt-4 text-text-mid max-w-xl mx-auto">
            10 分钟设置一次 · 每天审 5 分钟 · 其余都交给 Agent。
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-4 relative">
          <div
            className="hidden md:block absolute top-20 left-[16%] right-[16%] h-px bg-gradient-to-r from-alive via-violet to-magenta opacity-30"
            aria-hidden
          />
          <Step
            num="01"
            icon={Target}
            title="定一个目标"
            desc="『4 月底前小红书涨粉到 1K』——大白话就行，Agent 自己拆成 Plan Tree。"
          />
          <Step
            num="02"
            icon={Repeat}
            title="Agent 自己循环"
            desc="研究 · 起草 · 排程 · 监控 —— 只在需要人眼把关的动作上停下来。"
          />
          <Step
            num="03"
            icon={CheckCheck}
            title="你只管审批"
            desc="5 分钟批量通过待审动作 · 每周日自动生成复盘周报。"
          />
        </div>

        <div className="mt-14 flex justify-center">
          <div className="inline-flex items-center gap-2 text-sm text-text-mid">
            <span>日均人工投入</span>
            <ArrowRight className="h-3 w-3" />
            <span className="font-mono text-white">不到 7 分钟</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Step({
  num,
  icon: Icon,
  title,
  desc,
}: {
  num: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="relative rounded-2xl border border-stroke bg-panel/40 p-6 text-center md:text-left">
      <div className="flex items-center gap-3">
        <div className="relative z-10 h-10 w-10 rounded-full border border-stroke-strong bg-void flex items-center justify-center">
          <Icon className="h-4 w-4 text-alive" />
        </div>
        <span className="font-mono text-xs text-text-lo">{num}</span>
      </div>
      <h3 className="mt-4 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm text-text-mid leading-relaxed">{desc}</p>
    </div>
  );
}
