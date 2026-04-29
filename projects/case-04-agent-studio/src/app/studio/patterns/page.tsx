"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import {
  Repeat,
  ListChecks,
  Undo2,
  Users,
  ArrowRightLeft,
  Sparkles,
  BookOpen,
  ChevronRight,
} from "lucide-react";

const patterns = [
  {
    id: "react",
    name: "ReAct",
    sub: "Reasoning + Acting",
    icon: Repeat,
    color: "text-info",
    tintBg: "bg-[hsl(210_75%_96%)]",
    tintBorder: "border-[hsl(210_75%_84%)]",
    desc: "交替 Thought → Action → Observation · 模拟人类解题 · 每步反思再行动 · 最常用的 Agent 循环。",
    useFor: ["探索性研究", "工具多次调用", "动态任务"],
    frameworks: ["LangGraph", "LlamaIndex"],
    samples: ["research-agent", "code-debugger"],
    popular: true,
  },
  {
    id: "plan-execute",
    name: "Plan-Execute",
    sub: "先规划 · 再执行",
    icon: ListChecks,
    color: "text-agent",
    tintBg: "bg-[hsl(222_60%_96%)]",
    tintBorder: "border-[hsl(222_60%_85%)]",
    desc: "先出完整 TODO 计划 · 再按顺序执行 · 遇失败回到 replanner · 适合结构化可审计任务。",
    useFor: ["企业合规任务", "多步骤审批", "供应链编排"],
    frameworks: ["LangGraph", "AutoGen"],
    samples: ["financial-analyzer", "report-generator"],
  },
  {
    id: "reflexion",
    name: "Reflexion",
    sub: "Self-Critique",
    icon: Undo2,
    color: "text-eval",
    tintBg: "bg-[hsl(280_40%_96%)]",
    tintBorder: "border-[hsl(280_40%_86%)]",
    desc: "生成 → 自评打分 → 低于阈值重写 · 2-3 轮收敛 · 用语言强化自我反馈 · 显著提升代码/回答质量。",
    useFor: ["代码生成", "长文写作", "高质量要求场景"],
    frameworks: ["LangGraph", "自定义循环"],
    samples: ["code-review", "essay-writer"],
  },
  {
    id: "multi-agent",
    name: "Multi-Agent Debate",
    sub: "角色辩论",
    icon: Users,
    color: "text-memory",
    tintBg: "bg-[hsl(25_75%_95%)]",
    tintBorder: "border-[hsl(25_75%_82%)]",
    desc: "多个专家 Agent 轮流发言 / 辩论 · 共识或裁判裁决 · 适合需要多视角 / 多角色的复杂决策。",
    useFor: ["医疗会诊", "投资决策", "内容创作团队"],
    frameworks: ["AutoGen", "CrewAI"],
    samples: ["doctor-panel", "content-team"],
  },
  {
    id: "hierarchical",
    name: "Hierarchical Teams",
    sub: "分层协作",
    icon: Users,
    color: "text-mcp",
    tintBg: "bg-[hsl(155_50%_95%)]",
    tintBorder: "border-[hsl(155_50%_84%)]",
    desc: "Manager 拆任务给 Worker · Worker 完成汇报给 Manager · 树形结构 · 适合大型复杂工作流。",
    useFor: ["软件工程团队", "大型研究项目", "企业项目管理"],
    frameworks: ["LangGraph", "CrewAI"],
    samples: ["eng-team", "research-lab"],
  },
  {
    id: "swarm",
    name: "Swarm (Handoff)",
    sub: "轻量级交接",
    icon: ArrowRightLeft,
    color: "text-accent",
    tintBg: "bg-[hsl(38_92%_95%)]",
    tintBorder: "border-[hsl(38_92%_82%)]",
    desc: "Agent 之间用 handoff 传递任务 · 极简协议 · 像接力赛 · OpenAI Agents SDK 范式 · 适合轻量场景。",
    useFor: ["客服分流", "分类后转专家", "翻译链"],
    frameworks: ["OpenAI Agents SDK", "Swarm"],
    samples: ["cs-router", "translator-chain"],
    isNew: true,
  },
];

export default function PatternsPage() {
  const router = useRouter();
  const apply = (id: string, name: string) => {
    notify.ok(`✨ 已套用模板 · ${name}`, "跳转到 Studio 并自动填充");
    setTimeout(() => router.push(`/studio?pattern=${id}`), 600);
  };
  return (
    <PageShell
      title="Pattern Gallery"
      subtitle="6 种主流 Agent 控制流 · 一键套用 · 点击查看原理 + 代码骨架"
      actions={
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => notify.todo("设计模式白皮书 PDF")}>
          <BookOpen className="w-3.5 h-3.5" />
          设计模式白皮书
        </Button>
      }
    >
      <div className="mb-5 rounded-xl border border-border bg-primary-tint/60 p-4 flex items-start gap-3">
        <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" strokeWidth={2} />
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-ink mb-1">一个平台 · 六种大脑</div>
          <p className="text-[12px] text-ink-soft leading-relaxed">
            每种模式对应一个可视化 DAG 模板 · 参数化 system prompt · 点击「套用模板」即可打开 Studio 并自动填充节点。
            配合 Trace Waterfall 可直观看到不同模式的决策路径差异。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {patterns.map((p) => {
          const Icon = p.icon;
          return (
            <div
              key={p.id}
              onClick={() => apply(p.id, p.name)}
              className={`group rounded-xl border ${p.tintBorder} ${p.tintBg} overflow-hidden hover:-translate-y-1 hover:shadow-md transition-all cursor-pointer`}
            >
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-10 h-10 rounded-lg bg-surface border border-border-subtle flex items-center justify-center ${p.color}`}>
                    <Icon className="w-5 h-5" strokeWidth={1.6} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {p.popular && <Badge variant="accent" className="text-[10px]">最常用</Badge>}
                    {p.isNew && <Badge variant="info" className="text-[10px]">2026 New</Badge>}
                  </div>
                </div>

                <div className="mb-1 flex items-baseline gap-2">
                  <h3 className="text-[17px] font-semibold tracking-tight">{p.name}</h3>
                  <span className="text-[11px] font-mono text-ink-mute">{p.sub}</span>
                </div>
                <p className="text-[12.5px] text-ink-soft leading-relaxed mb-4">{p.desc}</p>

                {/* DAG mini preview */}
                <div className="rounded-md border border-border-subtle bg-surface p-3 mb-4">
                  <PatternPreview id={p.id} color={p.color} />
                </div>

                <div className="space-y-2.5 text-[11.5px]">
                  <Row label="适用" items={p.useFor} muted />
                  <Row label="框架" items={p.frameworks} />
                  <Row label="Demo Agent" items={p.samples} mono />
                </div>
              </div>

              <div className="px-5 py-2.5 border-t border-border-subtle bg-surface/60 flex items-center justify-between">
                <span className="text-[11px] text-ink-mute">点击套用 · 自动载入 Studio</span>
                <ChevronRight className="w-4 h-4 text-ink-mute group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}

function Row({ label, items, muted, mono }: { label: string; items: string[]; muted?: boolean; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="text-ink-mute font-medium shrink-0 w-14">{label}</span>
      <div className="flex flex-wrap gap-1 flex-1">
        {items.map((it) => (
          <span
            key={it}
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] ${
              mono ? "font-mono" : ""
            } ${muted ? "text-ink-soft bg-surface/60" : "text-ink bg-surface border border-border-subtle"}`}
          >
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

function PatternPreview({ id, color }: { id: string; color: string }) {
  // 每种模式一个小 SVG 示意
  const strokeColor = color.replace("text-", "");
  const colorMap: Record<string, string> = {
    info: "hsl(210 75% 45%)",
    agent: "hsl(222 60% 40%)",
    eval: "hsl(280 40% 50%)",
    memory: "hsl(25 75% 48%)",
    mcp: "hsl(155 50% 38%)",
    accent: "hsl(38 92% 50%)",
  };
  const stroke = colorMap[strokeColor] ?? "hsl(222 60% 40%)";

  const Node = ({ x, y, w = 42, h = 22, label }: { x: number; y: number; w?: number; h?: number; label: string }) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="4" fill="hsl(0 0% 100%)" stroke={stroke} strokeWidth="1.1" />
      <text x={x + w / 2} y={y + h / 2 + 3} textAnchor="middle" fontSize="8" fontFamily="monospace" fill={stroke}>{label}</text>
    </g>
  );

  const Arrow = ({ x1, y1, x2, y2, dashed }: { x1: number; y1: number; x2: number; y2: number; dashed?: boolean }) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth="1" strokeDasharray={dashed ? "3 3" : undefined} />
  );

  if (id === "react") {
    return (
      <svg viewBox="0 0 320 64" className="w-full h-16">
        <Node x={10} y={22} label="Thought" />
        <Arrow x1={52} y1={33} x2={90} y2={33} />
        <Node x={90} y={22} label="Action" />
        <Arrow x1={132} y1={33} x2={170} y2={33} />
        <Node x={170} y={22} label="Observe" />
        <Arrow x1={212} y1={33} x2={250} y2={33} />
        <Node x={250} y={22} label="Answer" />
        {/* loop back */}
        <path d="M 191 22 C 180 2, 80 2, 31 22" fill="none" stroke={stroke} strokeWidth="1" strokeDasharray="3 3" />
      </svg>
    );
  }

  if (id === "plan-execute") {
    return (
      <svg viewBox="0 0 320 64" className="w-full h-16">
        <Node x={10} y={22} label="Plan" />
        <Arrow x1={52} y1={33} x2={90} y2={33} />
        <Node x={90} y={4} w={34} h={18} label="S1" />
        <Node x={90} y={26} w={34} h={18} label="S2" />
        <Node x={90} y={48} w={34} h={18} label="S3" />
        <Arrow x1={124} y1={13} x2={160} y2={33} />
        <Arrow x1={124} y1={35} x2={160} y2={33} />
        <Arrow x1={124} y1={57} x2={160} y2={33} />
        <Node x={160} y={22} label="Reflect" />
        <Arrow x1={202} y1={33} x2={240} y2={33} />
        <Node x={240} y={22} label="Done" />
      </svg>
    );
  }

  if (id === "reflexion") {
    return (
      <svg viewBox="0 0 320 64" className="w-full h-16">
        <Node x={10} y={22} label="Actor" />
        <Arrow x1={52} y1={33} x2={100} y2={33} />
        <Node x={100} y={22} label="Critic" />
        <Arrow x1={142} y1={33} x2={190} y2={33} />
        <Node x={190} y={22} label="Revise" />
        <Arrow x1={232} y1={33} x2={270} y2={33} />
        <Node x={270} y={22} label="Out" w={36} />
        <path d="M 208 22 C 180 0, 60 0, 31 22" fill="none" stroke={stroke} strokeWidth="1" strokeDasharray="3 3" />
        <text x={130} y={8} fontSize="7" fontFamily="monospace" fill={stroke}>× 3 loops</text>
      </svg>
    );
  }

  if (id === "multi-agent") {
    return (
      <svg viewBox="0 0 320 64" className="w-full h-16">
        <Node x={10} y={22} label="Input" />
        <Arrow x1={52} y1={33} x2={100} y2={12} />
        <Arrow x1={52} y1={33} x2={100} y2={33} />
        <Arrow x1={52} y1={33} x2={100} y2={54} />
        <Node x={100} y={0} w={50} h={18} label="Expert A" />
        <Node x={100} y={22} w={50} h={18} label="Expert B" />
        <Node x={100} y={44} w={50} h={18} label="Expert C" />
        <Arrow x1={150} y1={9} x2={190} y2={33} />
        <Arrow x1={150} y1={31} x2={190} y2={33} />
        <Arrow x1={150} y1={53} x2={190} y2={33} />
        <Node x={190} y={22} label="Judge" />
        <Arrow x1={232} y1={33} x2={270} y2={33} />
        <Node x={270} y={22} label="Out" w={36} />
      </svg>
    );
  }

  if (id === "hierarchical") {
    return (
      <svg viewBox="0 0 320 64" className="w-full h-16">
        <Node x={130} y={2} label="Manager" />
        <Arrow x1={150} y1={24} x2={40} y2={42} />
        <Arrow x1={170} y1={24} x2={150} y2={42} />
        <Arrow x1={190} y1={24} x2={260} y2={42} />
        <Node x={20} y={42} w={40} h={20} label="W1" />
        <Node x={130} y={42} w={40} h={20} label="W2" />
        <Node x={240} y={42} w={40} h={20} label="W3" />
      </svg>
    );
  }

  // swarm
  return (
    <svg viewBox="0 0 320 64" className="w-full h-16">
      <Node x={10} y={22} label="Triage" />
      <Arrow x1={52} y1={33} x2={100} y2={33} />
      <text x={70} y={28} fontSize="7" fontFamily="monospace" fill={stroke}>handoff</text>
      <Node x={100} y={22} label="A" w={36} />
      <Arrow x1={136} y1={33} x2={180} y2={33} />
      <text x={150} y={28} fontSize="7" fontFamily="monospace" fill={stroke}>handoff</text>
      <Node x={180} y={22} label="B" w={36} />
      <Arrow x1={216} y1={33} x2={260} y2={33} />
      <Node x={260} y={22} label="Out" w={40} />
    </svg>
  );
}
