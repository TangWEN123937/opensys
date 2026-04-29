"use client";

import Link from "next/link";
import { notify } from "@/lib/notify";
import {
  Sparkles,
  Workflow,
  Puzzle,
  Server,
  Wrench,
  Cpu,
  ArrowRight,
  Check,
  Github,
  Play,
  Brain,
  FlaskConical,
  Waves,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

const runtimes = [
  {
    icon: Puzzle,
    color: "text-skill",
    tintBg: "bg-[hsl(320_50%_96%)]",
    tintBorder: "border-[hsl(320_50%_88%)]",
    name: "Agent Skills",
    tag: "SKILL.md · Progressive Disclosure",
    desc: "渐进式披露的模块化专家包 · 装即用 · 卸即卸",
  },
  {
    icon: Server,
    color: "text-mcp",
    tintBg: "bg-[hsl(155_50%_95%)]",
    tintBorder: "border-[hsl(155_50%_84%)]",
    name: "MCP Servers",
    tag: "Model Context Protocol",
    desc: "动态发现 + 通用协议 · 集 Smithery / Glama / 官方三大 registry",
  },
  {
    icon: Wrench,
    color: "text-tool",
    tintBg: "bg-[hsl(185_65%_94%)]",
    tintBorder: "border-[hsl(185_65%_82%)]",
    name: "Tool Calling",
    tag: "JSON Schema · Real Test",
    desc: "function calling 全流程测试台 · schema / mock / curl 全可见",
  },
  {
    icon: Cpu,
    color: "text-model",
    tintBg: "bg-[hsl(38_85%_94%)]",
    tintBorder: "border-[hsl(38_85%_82%)]",
    name: "Model Router",
    tag: "OpenRouter · LiteLLM · Portkey",
    desc: "300+ 模型统一接入 · cost / latency / failover 三视图",
  },
];

const capabilities = [
  { icon: Workflow, label: "5 种 Agent 模式", sub: "ReAct · Plan-Execute · Reflexion · Multi-Agent · Swarm" },
  { icon: Waves, label: "Trace 瀑布回放", sub: "LangSmith 风 span 树 + step replay + flame graph" },
  { icon: Brain, label: "四层记忆", sub: "短期 / 长期 / 向量 / Graph · LangGraph checkpoint" },
  { icon: FlaskConical, label: "RAGAS 评测", sub: "faithfulness / tool_call_accuracy / goal_completion" },
];

const stats = [
  { n: "20", label: "Pages" },
  { n: "5", label: "Agent 模式" },
  { n: "4", label: "运行时规范" },
  { n: "300+", label: "模型可接" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Nav */}
      <nav className="h-14 border-b border-border-subtle bg-surface/80 backdrop-blur sticky top-0 z-30 flex items-center justify-between px-8">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary-foreground" strokeWidth={2.2} />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">Agent Studio</span>
          <Badge variant="mono" className="ml-1">v0.1 ALPHA</Badge>
        </Link>
        <div className="flex items-center gap-5 text-[13px] text-ink-soft">
          <a href="#runtimes" className="hover:text-ink transition-colors">运行时</a>
          <a href="#capabilities" className="hover:text-ink transition-colors">能力</a>
          <a href="#pricing" className="hover:text-ink transition-colors">定价</a>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 h-8 px-4 rounded-md bg-primary text-primary-foreground text-[13px] font-medium shadow-sm hover:bg-primary-hover transition-all"
          >
            进入工作台
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative px-8 pt-20 pb-24 overflow-hidden">
        {/* 柔和放射光 */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(900px 500px at 20% -10%, hsl(222 60% 92%) 0%, transparent 55%), radial-gradient(700px 420px at 90% 10%, hsl(38 92% 92%) 0%, transparent 55%)",
          }}
        />
        <div className="relative max-w-[1180px] mx-auto grid lg:grid-cols-[1.05fr_1fr] gap-16 items-center">
          <div>
            <Badge variant="outline" className="mb-6">
              <Sparkles className="w-3 h-3 text-accent" /> 2026 公开课项目实战 · 赋范空间
            </Badge>
            <h1 className="text-[clamp(36px,5vw,60px)] font-bold leading-[1.08] tracking-[-0.025em] mb-5 text-ink">
              所有 Agent 运行时的<br />
              <span className="text-primary">中央控制台</span>
            </h1>
            <p className="text-[16px] leading-relaxed text-ink-soft max-w-[540px] mb-8">
              把业界四大运行时(<b className="text-ink">Agent Skills</b> · <b className="text-ink">MCP</b> ·{" "}
              <b className="text-ink">Tool Calling</b> · <b className="text-ink">Model Router</b>)·
              五种 Agent 模式 · Trace + Eval 装进一个可视化 Studio · <span className="text-primary font-medium">装能装 · 跑能跑 · 看能看 · 算能算</span>。
            </p>
            <div className="flex items-center gap-3 mb-10">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 h-11 px-6 rounded-lg bg-primary text-primary-foreground font-medium shadow-sm hover:bg-primary-hover hover:-translate-y-px transition-all"
              >
                <Play className="w-4 h-4" strokeWidth={2.2} /> 免费开始
              </Link>
              <Link
                href="/studio"
                className="inline-flex items-center gap-2 h-11 px-6 rounded-lg border border-border bg-surface font-medium hover:border-ink-mute transition-colors"
              >
                看 Demo
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="https://github.com/fufankeji"
                target="_blank"
                className="inline-flex items-center gap-2 h-11 px-4 rounded-lg text-ink-soft hover:text-ink transition-colors"
                rel="noopener noreferrer"
              >
                <Github className="w-4 h-4" />
                <span className="text-[13px]">Source</span>
              </a>
            </div>
            {/* Stats */}
            <div className="flex items-center gap-6">
              {stats.map((s) => (
                <div key={s.label}>
                  <div className="text-[22px] font-bold font-mono tracking-tight text-ink">{s.n}</div>
                  <div className="text-[10px] tracking-[0.14em] uppercase text-ink-mute font-medium">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right · Agent DAG preview */}
          <HeroDAG />
        </div>
      </section>

      {/* 四大运行时 */}
      <section id="runtimes" className="px-8 py-20 bg-elevated border-y border-border-subtle">
        <div className="max-w-[1180px] mx-auto">
          <div className="mb-10">
            <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-primary mb-2">Runtimes · 四大运行时</div>
            <h2 className="text-[28px] font-bold tracking-tight mb-3">一套 Studio · 装下整条 Agent 栈</h2>
            <p className="text-[14px] text-ink-soft max-w-[640px]">
              业界 4 份独立规范 · 每份都有自己的市场和工具链 · 这里统一成可视化、可装可卸的组件。
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {runtimes.map((r) => {
              const Icon = r.icon;
              return (
                <div
                  key={r.name}
                  className={`rounded-xl border ${r.tintBorder} ${r.tintBg} p-5 hover:-translate-y-1 transition-transform`}
                >
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className={`w-9 h-9 rounded-lg bg-surface border border-border-subtle flex items-center justify-center ${r.color}`}>
                      <Icon className="w-4.5 h-4.5" strokeWidth={1.8} />
                    </div>
                    <span className="text-[10px] font-mono tracking-wider text-ink-mute uppercase">{r.tag}</span>
                  </div>
                  <h3 className="text-[16px] font-semibold mb-1.5 tracking-tight">{r.name}</h3>
                  <p className="text-[12.5px] leading-relaxed text-ink-soft">{r.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 能力矩阵 */}
      <section id="capabilities" className="px-8 py-20">
        <div className="max-w-[1180px] mx-auto">
          <div className="mb-10 max-w-[680px]">
            <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-primary mb-2">Capabilities · 核心能力</div>
            <h2 className="text-[28px] font-bold tracking-tight mb-3">从画布到评测 · 一条流程闭环</h2>
            <p className="text-[14px] text-ink-soft">
              拖拽编排 · 真实流式运行 · 每一步可回放 · 每一次可评分。工程视角 + 讲师视角 + 投资人视角三合一。
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
            {capabilities.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.label} className="rounded-xl border border-border bg-surface p-5 hover:border-ink-mute transition-colors">
                  <Icon className="w-5 h-5 text-primary mb-3" strokeWidth={1.8} />
                  <div className="text-[14px] font-semibold mb-1 tracking-tight">{c.label}</div>
                  <div className="text-[12px] text-ink-soft leading-relaxed">{c.sub}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 定价 */}
      <section id="pricing" className="px-8 py-20 bg-elevated border-y border-border-subtle">
        <div className="max-w-[1180px] mx-auto">
          <div className="mb-10 text-center">
            <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-primary mb-2">Pricing · 定价</div>
            <h2 className="text-[28px] font-bold tracking-tight mb-3">从开源 hobby 到企业私有 · 三档覆盖</h2>
            <p className="text-[14px] text-ink-soft max-w-[580px] mx-auto">
              开发者免费 · 团队按量 · 企业定制 · 创作者还可上架 Marketplace 分成变现。
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-5 max-w-[1020px] mx-auto">
            {[
              {
                name: "Hobby",
                price: "¥0",
                per: "/ 永久",
                highlight: false,
                feats: ["全部 20 页功能", "自部署无限制", "社区支持", "GitHub 开源"],
                cta: "克隆 Repo",
              },
              {
                name: "Team",
                price: "¥299",
                per: "/ 席位 / 月",
                highlight: true,
                feats: ["云托管 · 零运维", "协作 · RBAC", "审计日志合规", "优先支持 + 培训"],
                cta: "14 天试用",
              },
              {
                name: "Enterprise",
                price: "定制",
                per: "· 年签",
                highlight: false,
                feats: ["私有化部署", "SSO · VPC · 脱敏", "SLA 99.99%", "专属 SA 顾问"],
                cta: "预约沟通",
              },
            ].map((p) => (
              <div
                key={p.name}
                className={`rounded-2xl p-7 transition-all ${
                  p.highlight
                    ? "bg-primary text-primary-foreground shadow-lg scale-[1.02]"
                    : "bg-surface border border-border hover:-translate-y-1"
                }`}
              >
                {p.highlight && (
                  <Badge
                    variant="accent"
                    className="mb-4 bg-accent text-ink border-accent/50 font-semibold"
                  >
                    讲师与团队最常选
                  </Badge>
                )}
                <div className={`text-[13px] font-medium mb-2 ${p.highlight ? "text-primary-foreground/80" : "text-ink-soft"}`}>
                  {p.name}
                </div>
                <div className="flex items-baseline gap-1 mb-5">
                  <span className="text-[34px] font-bold font-mono tracking-tight">{p.price}</span>
                  <span className={`text-[12px] ${p.highlight ? "text-primary-foreground/70" : "text-ink-mute"}`}>{p.per}</span>
                </div>
                <ul className="space-y-2 mb-6">
                  {p.feats.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-[13px]">
                      <Check className={`w-3.5 h-3.5 shrink-0 ${p.highlight ? "text-accent" : "text-success"}`} strokeWidth={2.4} />
                      <span className={p.highlight ? "text-primary-foreground/90" : "text-ink"}>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => {
                    if (p.cta === "克隆 Repo") notify.ok("git clone 命令已复制", "git clone https://github.com/fufankeji/agent-studio.git");
                    else if (p.cta === "14 天试用") notify.ok("试用已开通", "邮箱密码已发送 · 14 天内无限用");
                    else notify.ok("已提交预约 · 销售 24h 内联系");
                  }}
                  className={`w-full h-10 rounded-lg font-medium text-[13px] transition-all ${
                    p.highlight
                      ? "bg-accent text-ink hover:brightness-95"
                      : "bg-primary text-primary-foreground hover:bg-primary-hover"
                  }`}
                >
                  {p.cta} →
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-8 py-10 border-t border-border-subtle">
        <div className="max-w-[1180px] mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-primary-foreground" strokeWidth={2.2} />
            </div>
            <span className="text-[13px] font-medium">Agent Studio</span>
            <span className="text-[11px] text-ink-mute ml-2 font-mono">由「赋范空间 · 项目实战」出品</span>
          </div>
          <div className="text-[11px] text-ink-mute font-mono">20 pages · 5 patterns · 4 runtimes · 100% 真后端接通</div>
        </div>
      </footer>
    </div>
  );
}

function HeroDAG() {
  // 简单装饰性 DAG · Landing 右侧 · 纯 SVG · 浅色
  return (
    <div className="relative rounded-2xl border border-border bg-surface p-5 shadow-sm">
      {/* 标题条 */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-2 h-2 rounded-full bg-[hsl(0_70%_75%)]" />
            <span className="w-2 h-2 rounded-full bg-[hsl(38_80%_70%)]" />
            <span className="w-2 h-2 rounded-full bg-[hsl(145_50%_65%)]" />
          </div>
          <span className="text-[11px] font-mono text-ink-mute ml-2">agent-research-v1 · running</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-success">
          <span className="relative w-1.5 h-1.5 rounded-full bg-success">
            <span className="absolute inset-0 rounded-full bg-success animate-ping opacity-70" />
          </span>
          real SSE
        </div>
      </div>

      {/* DAG */}
      <svg viewBox="0 0 480 320" className="w-full h-auto">
        {/* 流动连线 */}
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="hsl(222 14% 60%)" />
          </marker>
        </defs>

        {/* 连线(部分带流光) */}
        <path d="M 90 50 C 160 50, 160 130, 230 130" fill="none" stroke="hsl(222 14% 80%)" strokeWidth="1.5" markerEnd="url(#arr)" />
        <path d="M 90 130 C 160 130, 160 130, 230 130" fill="none" stroke="hsl(222 60% 40%)" strokeWidth="1.8" strokeDasharray="4 4" markerEnd="url(#arr)">
          <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="1.2s" repeatCount="indefinite" />
        </path>
        <path d="M 90 210 C 160 210, 160 130, 230 130" fill="none" stroke="hsl(222 14% 80%)" strokeWidth="1.5" markerEnd="url(#arr)" />
        <path d="M 280 130 C 340 130, 340 80, 400 80" fill="none" stroke="hsl(222 60% 40%)" strokeWidth="1.8" strokeDasharray="4 4" markerEnd="url(#arr)">
          <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="1.2s" repeatCount="indefinite" />
        </path>
        <path d="M 280 130 C 340 130, 340 180, 400 180" fill="none" stroke="hsl(222 14% 80%)" strokeWidth="1.5" markerEnd="url(#arr)" />
        <path d="M 280 130 C 340 130, 340 260, 400 260" fill="none" stroke="hsl(222 14% 80%)" strokeWidth="1.5" markerEnd="url(#arr)" />

        {/* 节点 · 浅色卡风 */}
        {[
          { x: 30, y: 32, w: 60, h: 36, label: "Query", color: "hsl(210 75% 45%)", bg: "hsl(210 75% 96%)" },
          { x: 30, y: 112, w: 60, h: 36, label: "Memory", color: "hsl(25 75% 48%)", bg: "hsl(25 75% 96%)" },
          { x: 30, y: 192, w: 60, h: 36, label: "Knowledge", color: "hsl(155 50% 38%)", bg: "hsl(155 50% 95%)" },
          { x: 230, y: 112, w: 50, h: 36, label: "Agent", color: "hsl(222 60% 40%)", bg: "hsl(222 60% 95%)", running: true },
          { x: 400, y: 62, w: 60, h: 36, label: "Tool", color: "hsl(185 65% 42%)", bg: "hsl(185 65% 95%)" },
          { x: 400, y: 162, w: 60, h: 36, label: "Skill", color: "hsl(320 50% 48%)", bg: "hsl(320 50% 95%)" },
          { x: 400, y: 242, w: 60, h: 36, label: "Output", color: "hsl(145 55% 38%)", bg: "hsl(145 55% 95%)" },
        ].map((n) => (
          <g key={n.label}>
            <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="8" fill={n.bg} stroke={n.color} strokeWidth="1.5" />
            <text x={n.x + n.w / 2} y={n.y + 23} textAnchor="middle" fontSize="11" fontFamily="monospace" fill={n.color} fontWeight="600">
              {n.label}
            </text>
            {n.running && (
              <circle cx={n.x + n.w - 6} cy={n.y + 6} r="3" fill={n.color}>
                <animate attributeName="opacity" values="1;0.3;1" dur="1.4s" repeatCount="indefinite" />
              </circle>
            )}
          </g>
        ))}
      </svg>

      {/* 底部 meta */}
      <div className="mt-3 pt-3 border-t border-border-subtle flex items-center justify-between text-[10px] font-mono text-ink-mute">
        <span>7 nodes · 5 edges · plan: ReAct</span>
        <span className="text-success">tokens 1,284 · 1.8s</span>
      </div>
    </div>
  );
}
