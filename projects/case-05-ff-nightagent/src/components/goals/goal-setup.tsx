"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, ArrowRight, Sparkles, Zap } from "lucide-react";
import { LinesGradient } from "@/components/shaders/lines-gradient";
import { PlanTreeView } from "@/components/goals/plan-tree-view";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GoalInput, PlanTree } from "@/lib/agent/goal-input";

const PRESETS = [
  {
    label: "小红书 · 涨粉 + 转化",
    text: "30 天小红书涨粉 500 + 10 条私信转化 3 单",
    platform: "xiaohongshu" as const,
  },
  {
    label: "B 站 · 技术影响力",
    text: "30 天 B 站发布 4 条 8 分钟技术解析 · 累计播放 2 万+ · 涨粉 500",
    platform: "bilibili" as const,
  },
  {
    label: "抖音 · 冷启新账号",
    text: "30 天抖音冷启 · 内容 15 条 · 涨粉 1000 · 带货转化 5 单",
    platform: "douyin" as const,
  },
];

const SPEEDS = [0.5, 1, 2, 4] as const;

export function GoalSetup() {
  const router = useRouter();
  const [text, setText] = useState(PRESETS[0].text);
  const [platform, setPlatform] = useState<GoalInput["platform"]>("xiaohongshu");
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [phase, setPhase] = useState<"input" | "planning" | "ready">("input");
  const [goalId, setGoalId] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanTree | null>(null);
  const [thoughtShown, setThoughtShown] = useState("");
  const typingRef = useRef<number | null>(null);

  // typewriter raw_thought
  useEffect(() => {
    if (!plan?.raw_thought) return;
    const full = plan.raw_thought;
    let i = 0;
    setThoughtShown("");
    if (typingRef.current) window.clearInterval(typingRef.current);
    typingRef.current = window.setInterval(() => {
      i++;
      setThoughtShown(full.slice(0, i));
      if (i >= full.length) {
        window.clearInterval(typingRef.current!);
        typingRef.current = null;
      }
    }, 30);
    return () => {
      if (typingRef.current) window.clearInterval(typingRef.current);
    };
  }, [plan?.raw_thought]);

  async function submit() {
    if (!text.trim() || phase !== "input") return;
    setPhase("planning");
    // 推断 kpi · 简单方案 · 从文本抓数字
    const kpis = inferKpis(text);
    const body: GoalInput = {
      title: text.trim(),
      platform,
      duration_days: 30,
      kpis,
      brand_voice: "friendly_sister",
      approval_mode: "risky_only",
      speed,
    };
    const r = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      setPhase("input");
      alert("创建 Goal 失败 · 检查网络");
      return;
    }
    const g = await r.json();
    setGoalId(g.id);
    // 开 SSE 等 plan_generated
    const es = new EventSource(`/api/goals/${g.id}/events`);
    es.onmessage = (msg) => {
      try {
        const ev = JSON.parse(msg.data);
        if (ev.type === "plan_generated") {
          const p = ev.payload as PlanTree;
          setPlan(p);
          setPhase("ready");
          es.close();
        }
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => es.close();
  }

  function goLive() {
    if (!goalId) return;
    router.push(`/goals/${goalId}/live?fresh=1`);
  }

  return (
    <div className="relative min-h-screen bg-void text-text-hi overflow-hidden">
      <LinesGradient opacity={0.5} hue={195} className="z-0" />

      {/* Top back */}
      <header className="relative z-20 px-6 pt-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-text-mid hover:text-white transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回工作台
        </Link>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto px-6 pt-12 pb-24">
        <AnimatePresence mode="wait">
          {phase === "input" && (
            <motion.section
              key="input"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
            >
              <div className="mb-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-alive/30 bg-alive/5 px-3 py-1 text-[11px] font-mono text-alive mb-5">
                  <span className="h-1.5 w-1.5 rounded-full bg-alive animate-pulse" />
                  GOAL · DRIVEN AUTONOMOUS AGENT
                </div>
                <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-tight">
                  给一个 30 天的运营目标
                  <br />
                  <span className="bg-gradient-to-r from-alive via-violet-400 to-pink-400 bg-clip-text text-transparent">
                    它替你 7×24 跑
                  </span>
                </h1>
                <p className="mt-4 text-text-mid text-sm md:text-base leading-relaxed max-w-2xl">
                  Claude 4.7 会把你这句话 · 拆成 Plan Tree · 自动排期 · 关键节点等你审批 · 30 天后自己生成周报。
                  <br />
                  教学演示 · 30 天压缩成 2 分钟。
                </p>
              </div>

              <div className="rounded-2xl border border-stroke bg-panel/40 backdrop-blur-xl p-5">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-text-lo mb-2">
                  KPI · 用一句话写清楚
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  className="w-full bg-transparent text-lg font-medium placeholder-text-lo outline-none resize-none"
                  placeholder="例：30 天小红书涨粉 500 + 10 条私信转化 3 单"
                  data-testid="goal-text"
                />

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => {
                        setText(p.text);
                        setPlatform(p.platform);
                      }}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left text-xs transition-all",
                        text === p.text
                          ? "border-alive/50 bg-alive/10"
                          : "border-stroke bg-panel/40 hover:bg-white/5"
                      )}
                    >
                      <div className="font-medium">{p.label}</div>
                      <div className="mt-1 text-text-lo text-[10px] line-clamp-2">{p.text}</div>
                    </button>
                  ))}
                </div>

                <div className="mt-5 flex items-center justify-between gap-4 pt-4 border-t border-stroke">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-text-lo">时间压缩</span>
                    {SPEEDS.map((s) => (
                      <button
                        key={s}
                        onClick={() => setSpeed(s)}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-xs font-mono transition-colors",
                          speed === s
                            ? "bg-alive/20 text-alive border border-alive/50"
                            : "border border-stroke text-text-mid hover:bg-white/5"
                        )}
                      >
                        {s}x
                      </button>
                    ))}
                    <span className="text-[10px] font-mono text-text-lo ml-2">
                      30 天 ≈ {Math.round(120 / speed)}s
                    </span>
                  </div>
                  <Button
                    onClick={submit}
                    disabled={!text.trim()}
                    variant="accent"
                    size="md"
                    data-testid="btn-submit-goal"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    让 Claude 拆 Plan
                  </Button>
                </div>
              </div>

              <p className="mt-5 text-[11px] font-mono text-text-lo">
                这不是表单 · 是目标。Agent 会自己决定 plan · 你只审关键节点。
              </p>
            </motion.section>
          )}

          {phase === "planning" && (
            <motion.section
              key="planning"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-20"
            >
              <div className="flex flex-col items-center text-center gap-4">
                <div className="relative h-14 w-14">
                  <span className="absolute inset-0 rounded-full border-2 border-alive/30 animate-ping" />
                  <span className="absolute inset-2 rounded-full bg-alive/20 animate-pulse" />
                  <span className="absolute inset-5 rounded-full bg-alive" />
                </div>
                <div className="text-lg font-medium">Claude 4.7 正在做 Extended Thinking</div>
                <div className="text-sm text-text-mid">
                  把你的目标拆成可并行推进的 Plan Tree · 一般需要 3~8 秒
                </div>
              </div>
            </motion.section>
          )}

          {phase === "ready" && plan && (
            <motion.section
              key="ready"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className="mb-6 flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-alive mt-0.5" />
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-text-lo">
                    Claude · raw_thought
                    {plan.llm.id && (
                      <span className="ml-2 text-alive">
                        · {plan.llm.ms}ms · {plan.llm.id.slice(0, 20)}…
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-base leading-relaxed">
                    {thoughtShown}
                    {thoughtShown.length < plan.raw_thought.length && (
                      <span className="inline-block h-4 w-[2px] bg-alive animate-pulse ml-0.5 align-text-bottom" />
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-stroke bg-panel/40 backdrop-blur-xl p-5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-text-lo mb-3">
                  Plan Tree · {plan.tasks.length} 条可执行任务
                </div>
                <PlanTreeView tasks={plan.tasks} />
              </div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="mt-8 flex items-center justify-between gap-4"
              >
                <div className="text-xs text-text-mid">
                  确认 plan 即进入托管 · 30 天压缩成 {Math.round(120 / speed)} 秒 · HITL 会自动暂停
                </div>
                <Button
                  onClick={goLive}
                  variant="accent"
                  size="lg"
                  data-testid="btn-enter-live"
                >
                  开始托管
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </motion.div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function inferKpis(text: string): GoalInput["kpis"] {
  const out: GoalInput["kpis"] = {};
  const growth = text.match(/涨粉\s*(\d+)|粉\s*(\d+)|follower[s]?\s*(\d+)/i);
  if (growth) out.growth = { target: Number(growth[1] || growth[2] || growth[3] || 500), unit: "粉" };
  const eng = text.match(/互动\s*(\d+)|engage\w*\s*(\d+)/i);
  if (eng) out.engagement = { target: Number(eng[1] || eng[2] || 2000), unit: "次" };
  const conv = text.match(/私信\s*转化\s*(\d+)|私信\s*(\d+)|转化\s*(\d+)|conversion\s*(\d+)/i);
  if (conv) out.conversion = { target: Number(conv[1] || conv[2] || conv[3] || conv[4] || 10), unit: "条" };
  const ret = text.match(/成交\s*(\d+)|单\s*(\d+)|order\s*(\d+)/i);
  if (ret) out.retention = { target: Number(ret[1] || ret[2] || ret[3] || 3), unit: "单" };
  // 兜底 · 保证至少 1 个
  if (Object.keys(out).length === 0) {
    out.growth = { target: 500, unit: "粉" };
    out.engagement = { target: 2000, unit: "次" };
  }
  return out;
}
