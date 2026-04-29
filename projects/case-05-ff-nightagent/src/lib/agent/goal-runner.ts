/**
 * Goal Runner · 目标自驾的主时间轴循环
 *
 * 核心编排：
 *   Day 0    · Plan 真调 Claude → 拆出 Plan Tree
 *   Day 1-30 · 按 speed 时间压缩 · 每天触发 task/kpi/thought/tool 事件
 *   Day 12   · HITL 挂起 · 等人工审批
 *   Day 18   · Re-plan 真调 Claude（Reflexion）· 动态调整 plan
 *   Day 30   · Weekly Report 真调 Claude · 生成周报 markdown
 *
 * 核心差异化 vs LangChain 顺序链：
 *   - 事件全部 event-sourced · Replay 可倒带
 *   - HITL 不是 if-else · 真的 durable pause（持久到 DB · 重启不丢）
 *   - Re-plan 是 agent 自主触发 · 不是脚本
 */

import OpenAI from "openai";
import { llmLogs, type LlmCallLog } from "./runner-input";
import {
  type GoalInput,
  type PlanTask,
  type PlanTree,
  type KpiName,
} from "./goal-input";

export type LLMClient = OpenAI;

/* ─────────── Plan 生成 · 开场真调 Claude ─────────── */

export async function generatePlan(
  input: GoalInput,
  client: LLMClient | null
): Promise<PlanTree> {
  const mockTasks: PlanTask[] = buildFallbackPlan(input);
  const mockRaw = `目标是"${input.title}"。考虑 ${input.platform} 平台的玩法 · 要并行推进 ${mockTasks.length} 条任务 · 关键节点留 HITL · 预计 Day 18 根据早期数据重规划。`;

  if (!client) {
    return { tasks: mockTasks, raw_thought: mockRaw, llm: { id: null, ms: 0, model: "mock", ok: false } };
  }

  const model = process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.5";
  const t0 = Date.now();
  const prompt = `你是一个 7×24 小时自主运营 Agent · 给个人品牌做 ${input.platform} 托管。

用户给你的目标：
"${input.title}"

周期：${input.duration_days} 天
KPI 目标：
${JSON.stringify(input.kpis, null, 2)}

请用一段话解释你的思路（raw_thought，100 字以内），然后给出一份 5~7 条的可执行 Plan Tree。严格 JSON：

{
  "raw_thought": "...",
  "tasks": [
    {
      "id": "t-xxx",
      "title": "...",
      "lane": "research|draft|publish|reply|report",
      "reason": "一句话解释为什么需要",
      "estimated_days": [1, 5],
      "requires_approval": false
    }
  ]
}

要求：
- 至少 1 条 research · 至少 1 条 draft · 至少 1 条 publish · 至少 1 条 reply · 必须有 1 条 report
- lane 必须是 research/draft/publish/reply/report 五选一
- estimated_days 形如 [开始day, 结束day] · 首尾 task 覆盖 Day 1 到 Day ${input.duration_days}
- publish 类任务 requires_approval = true
- 不要 markdown 代码围栏`;

  let callMeta: { id: string | null; ms: number } | null = null;
  let rawText = "";
  try {
    const resp = await client.chat.completions.create({
      model,
      max_tokens: 900,
      messages: [
        { role: "system", content: "你是擅长 30 天运营规划的 AI Agent · 严格输出 JSON · 用中文。" },
        { role: "user", content: prompt },
      ],
    });
    const ms = Date.now() - t0;
    const id = (resp as unknown as { id: string }).id ?? null;
    const u = (resp as unknown as { usage?: { prompt_tokens: number; completion_tokens: number } }).usage;
    callMeta = { id, ms };
    rawText = resp.choices[0]?.message?.content ?? "";
    llmLogs.push({
      step: "plan_generate",
      id,
      model,
      ms,
      prompt_tokens: u?.prompt_tokens ?? 0,
      completion_tokens: u?.completion_tokens ?? 0,
      ok: true,
    });
  } catch (e) {
    const ms = Date.now() - t0;
    llmLogs.push({
      step: "plan_generate",
      id: null,
      model,
      ms,
      prompt_tokens: 0,
      completion_tokens: 0,
      ok: false,
      error: String(e).slice(0, 200),
    });
    return {
      tasks: mockTasks,
      raw_thought: mockRaw,
      llm: { id: null, ms, model, ok: false },
    };
  }

  // 调通了 · 试解 JSON · 解不出也保留 call id/ms 作硬证据
  try {
    const cleaned = rawText.replace(/```(?:json)?/g, "").trim();
    const parsed = JSON.parse(cleaned) as { raw_thought: string; tasks: PlanTask[] };
    return {
      tasks: parsed.tasks.map((t, i) => ({
        ...t,
        id: t.id || `t-${i + 1}`,
        requires_approval: t.lane === "publish" || t.requires_approval === true,
      })),
      raw_thought: parsed.raw_thought,
      llm: { id: callMeta.id, ms: callMeta.ms, model, ok: true },
    };
  } catch {
    // JSON 坏了但 Claude 是真调过的 · 透传 id/ms · 用 fallback plan
    return {
      tasks: mockTasks,
      raw_thought: `${mockRaw}\n\n（Claude 原始输出解析失败 · 使用结构化兜底 plan）`,
      llm: { id: callMeta.id, ms: callMeta.ms, model, ok: false },
    };
  }
}

function buildFallbackPlan(input: GoalInput): PlanTask[] {
  const D = input.duration_days;
  return [
    {
      id: "t-research-1",
      title: "研究 5 个对标账号的爆款结构",
      lane: "research",
      reason: "先看别人怎么涨的 · 少走弯路",
      estimated_days: [1, 3],
      requires_approval: false,
    },
    {
      id: "t-draft-1",
      title: "起草 10 条选题 + 3 条主推文案",
      lane: "draft",
      reason: "内容池充足才好按节奏发",
      estimated_days: [3, 8],
      requires_approval: false,
    },
    {
      id: "t-publish-1",
      title: `按最优时段发布 · 共 ${Math.round(D / 3)} 条`,
      lane: "publish",
      reason: "分散发布 · 算法喜欢持续产出",
      estimated_days: [5, D - 5],
      requires_approval: true,
    },
    {
      id: "t-reply-1",
      title: "监听评论/私信 · 按品牌语气回复",
      lane: "reply",
      reason: "私信转化是关键动作",
      estimated_days: [5, D - 1],
      requires_approval: false,
    },
    {
      id: "t-research-2",
      title: "Day 12 复盘早期数据 · 必要时重规划",
      lane: "research",
      reason: "1/3 周期处做反思 · Reflexion 经典做法",
      estimated_days: [12, 12],
      requires_approval: false,
    },
    {
      id: "t-report-1",
      title: `Day ${D} 生成完整复盘周报`,
      lane: "report",
      reason: "沉淀方法论 · 下轮复用",
      estimated_days: [D, D],
      requires_approval: false,
    },
  ];
}

/* ─────────── 30 天时间轴调度 · emit 各类事件 ─────────── */

export type GoalEventType =
  | "goal_started"
  | "plan_generated"
  | "day_tick"
  | "task_status"
  | "kpi_delta"
  | "thought"
  | "tool_call"
  | "tool_result"
  | "handoff"
  | "hitl_required"
  | "approved"
  | "rejected"
  | "re_plan"
  | "weekly_report"
  | "goal_done";

export type Emit = (
  type: GoalEventType,
  day: number | null,
  payload: Record<string, unknown>
) => void;

interface RunCtx {
  input: GoalInput;
  plan: PlanTree;
  emit: Emit;
  /** 等审批时外部 resolve */
  waitForApproval: () => Promise<"approved" | "rejected">;
  /** 让步：返回 false 表示已被外部终止 · 不再继续 */
  delay: (ms: number) => Promise<boolean>;
  client: LLMClient | null;
}

export async function runGoalTimeline(ctx: RunCtx) {
  const { input, plan, emit, client } = ctx;
  const D = input.duration_days;
  const speed = input.speed ?? 1;
  const msPerDay = Math.round(4000 / speed);

  emit("goal_started", null, {
    title: input.title,
    platform: input.platform,
    kpis: input.kpis,
    duration_days: D,
    speed,
  });
  emit("plan_generated", null, {
    tasks: plan.tasks,
    raw_thought: plan.raw_thought,
    llm: plan.llm,
  });

  // KPI 累计
  const totals: Record<KpiName, number> = {
    growth: 0,
    engagement: 0,
    conversion: 0,
    retention: 0,
  };

  // task 状态 map
  const taskState = new Map<string, "pending" | "doing" | "done">();
  plan.tasks.forEach((t) => taskState.set(t.id, "pending"));

  for (let day = 1; day <= D; day++) {
    // 每一"天"醒来
    emit("day_tick", day, {
      day,
      wall_time: wallTimeFor(day),
      speed,
    });

    // 推进 task 状态
    for (const task of plan.tasks) {
      const [start, end] = task.estimated_days;
      const st = taskState.get(task.id)!;
      if (day === start && st === "pending") {
        taskState.set(task.id, "doing");
        emit("task_status", day, { task_id: task.id, status: "doing", progress: 0 });
        emit("thought", day, {
          text: `${laneLabel(task.lane)} Agent 醒来 · 开始干"${task.title}" · 原因：${task.reason}`,
          task_id: task.id,
        });
      } else if (day > start && day < end && st === "doing") {
        const progress = Math.min(1, (day - start) / Math.max(1, end - start));
        emit("task_status", day, { task_id: task.id, status: "doing", progress });
      } else if (day === end && st !== "done") {
        taskState.set(task.id, "done");
        emit("task_status", day, { task_id: task.id, status: "done", progress: 1 });
        emit("thought", day, { text: `✓ 完成 "${task.title}"`, task_id: task.id });
      }
    }

    // 针对性 emit 细粒度事件 · 让 swimlane / kpi 环动起来
    emitDailyDeltas(day, plan, taskState, totals, input, emit);

    // HITL 阻断 · 固定 Day 12 触发一次（审批某条"带图高风险帖子"）
    if (day === 12) {
      emit("hitl_required", day, {
        task_id: "t-publish-1",
        preview_body:
          "打工人速码 ⏰ 5 款 AI 工具实测 · 第 3 款让我加班少 2 小时～附保姆级注册教程",
        image_desc: "5 款 AI 工具横向对比图 · 飞书妙记 / Claude / ChatGPT / 即梦 / Cursor",
        reason: "带图 + @提及多个品牌 · 按 approval_mode=risky_only 需要你过目",
      });
      const decision = await ctx.waitForApproval();
      if (decision === "approved") {
        emit("approved", day, { task_id: "t-publish-1" });
      } else {
        emit("rejected", day, { task_id: "t-publish-1" });
        emit("thought", day, {
          text: "被拒 · 按策略 rollback · 这次不发这条 · 后续不再自动同类发布",
          task_id: "t-publish-1",
        });
      }
    }

    // Re-plan · Day 18 触发一次真调 Claude（Reflexion 关键点）
    if (day === 18) {
      const rp = await replanWithClaude(client, input, plan, totals);
      emit("re_plan", day, rp as unknown as Record<string, unknown>);
      emit("thought", day, {
        text: `🧠 Reflexion 触发 · 基于前 17 天数据 · ${rp.summary}`,
        llm: rp.llm,
      });
    }

    // 每 5 天让 lane 之间有一次 handoff 动画
    if (day % 5 === 0) {
      emit("handoff", day, {
        from: "research",
        to: "draft",
        payload: "3 条选题 + 竞品结构要点",
      });
    }

    const alive = await ctx.delay(msPerDay);
    if (!alive) return;
  }

  // Day D · weekly_report 真调 Claude
  const report = await generateReport(client, input, plan, totals);
  emit("weekly_report", D, report as unknown as Record<string, unknown>);

  emit("goal_done", D, { totals, generated_at: Date.now() });
}

function wallTimeFor(day: number): string {
  // 不是真实时间 · 每天按"这个 agent 习惯什么时候干活"的节奏
  const pool = ["08:12", "10:40", "14:32", "19:05", "22:18"];
  return pool[day % pool.length];
}

function laneLabel(lane: string) {
  return {
    research: "研究",
    draft: "起草",
    publish: "发布",
    reply: "回复",
    report: "复盘",
  }[lane] ?? lane;
}

function emitDailyDeltas(
  day: number,
  plan: PlanTree,
  taskState: Map<string, "pending" | "doing" | "done">,
  totals: Record<KpiName, number>,
  input: GoalInput,
  emit: Emit
) {
  // 根据"哪个 lane 今天在 doing"决定哪些 kpi 动
  const doing = plan.tasks.filter((t) => taskState.get(t.id) === "doing");
  const byLane = new Map<string, PlanTask[]>();
  doing.forEach((t) => {
    const arr = byLane.get(t.lane) ?? [];
    arr.push(t);
    byLane.set(t.lane, arr);
  });

  // tool_call + 真"事件"
  for (const [lane, tasks] of byLane) {
    if (lane === "research") {
      emit("tool_call", day, {
        lane,
        task_id: tasks[0].id,
        name: "browser.scan_competitors",
        params: { platform: input.platform, parallel: 5 },
      });
      emit("tool_result", day, {
        lane,
        task_id: tasks[0].id,
        name: "browser.scan_competitors",
        result: { scanned: 5, top_structure: "痛点 + 对比图 + CTA" },
      });
    } else if (lane === "draft") {
      emit("tool_call", day, {
        lane,
        task_id: tasks[0].id,
        name: "claude.draft_post",
        params: { voice: input.brand_voice, count: 1 },
      });
    } else if (lane === "publish") {
      emit("tool_call", day, {
        lane,
        task_id: tasks[0].id,
        name: `${input.platform}.create_post`,
        params: { scheduled: "next_peak" },
      });
      const g = pseudoDelta(day, input.kpis.growth?.target ?? 500, 30, "growth");
      const e = pseudoDelta(day, input.kpis.engagement?.target ?? 2000, 30, "engagement");
      totals.growth += g;
      totals.engagement += e;
      emit("kpi_delta", day, {
        kpi: "growth",
        delta: g,
        total: totals.growth,
        contributor: {
          day,
          type: "post",
          task_id: tasks[0].id,
          label: `Day ${day} 发布了一条配图帖`,
        },
      });
      emit("kpi_delta", day, {
        kpi: "engagement",
        delta: e,
        total: totals.engagement,
        contributor: {
          day,
          type: "post",
          task_id: tasks[0].id,
          label: `Day ${day} 新帖互动 · ${e} 次`,
        },
      });
    } else if (lane === "reply") {
      emit("tool_call", day, {
        lane,
        task_id: tasks[0].id,
        name: "inbox.poll_and_reply",
        params: { platform: input.platform },
      });
      const c = pseudoDelta(day, input.kpis.conversion?.target ?? 10, 30, "conversion");
      const r = pseudoDelta(day, input.kpis.retention?.target ?? 3, 30, "retention");
      if (c > 0) {
        totals.conversion += c;
        emit("kpi_delta", day, {
          kpi: "conversion",
          delta: c,
          total: totals.conversion,
          contributor: {
            day,
            type: "reply",
            task_id: tasks[0].id,
            label: `Day ${day} 私信咨询 × ${c}`,
          },
        });
      }
      if (r > 0) {
        totals.retention += r;
        emit("kpi_delta", day, {
          kpi: "retention",
          delta: r,
          total: totals.retention,
          contributor: {
            day,
            type: "reply",
            task_id: tasks[0].id,
            label: `Day ${day} 成交回购 × ${r}`,
          },
        });
      }
    }
  }
}

/** 生成"自然"的每日 delta · 总量逼近目标但带随机起伏 */
function pseudoDelta(day: number, target: number, totalDays: number, seedKey: string) {
  // 简单 hash 让不同 kpi 节奏不同
  const h = hash(`${seedKey}-${day}`);
  const base = target / totalDays;
  const jitter = (h % 100) / 100;
  const value = base * (0.3 + jitter * 1.8); // 0.3~2.1 倍基准
  // day < 5 时增长慢 · day > totalDays - 5 时爆发
  const phaseBoost = day < 5 ? 0.4 : day > totalDays - 7 ? 1.6 : 1;
  return Math.max(0, Math.round(value * phaseBoost));
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* ─────────── Re-plan · 真调 Claude ─────────── */

interface RePlanResult {
  summary: string;
  adjusted_tasks: Array<{ id: string; change: string }>;
  llm: { id: string | null; ms: number; model: string; ok: boolean };
}

async function replanWithClaude(
  client: LLMClient | null,
  input: GoalInput,
  plan: PlanTree,
  totals: Record<KpiName, number>
): Promise<RePlanResult> {
  const mock: RePlanResult = {
    summary: "早期数据：涨粉进度略慢 · 但互动率高 · 决定把 publish 节奏提前一天 · 放大 draft 池",
    adjusted_tasks: [
      { id: "t-publish-1", change: "频次 +25% · 把 Day 20 后的发布前移" },
      { id: "t-draft-1", change: "内容池扩到 15 条 · 增加 2 条痛点类选题" },
    ],
    llm: { id: null, ms: 0, model: "mock", ok: false },
  };
  if (!client) return mock;

  const model = process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.5";
  const t0 = Date.now();
  try {
    const resp = await client.chat.completions.create({
      model,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content:
            "你是 7×24 自主运营 Agent · 现在是 30 天任务的 Day 18 · 基于前期数据做 Reflexion + 重规划 · 严格 JSON 输出。",
        },
        {
          role: "user",
          content: `目标："${input.title}" · 平台 ${input.platform}

当前已累计：
${JSON.stringify(totals, null, 2)}

原 Plan：
${plan.tasks.map((t) => `- [${t.lane}] ${t.title} (Day ${t.estimated_days[0]}-${t.estimated_days[1]})`).join("\n")}

请输出：
{
  "summary": "30 字以内 · 一句话概括你的 reflexion 发现和决定",
  "adjusted_tasks": [
    { "id": "t-xxx", "change": "一句话描述调整" }
  ]
}
不要 markdown 围栏。`,
        },
      ],
    });
    const ms = Date.now() - t0;
    const id = (resp as unknown as { id: string }).id ?? null;
    const u = (resp as unknown as { usage?: { prompt_tokens: number; completion_tokens: number } }).usage;
    llmLogs.push({
      step: "re_plan",
      id,
      model,
      ms,
      prompt_tokens: u?.prompt_tokens ?? 0,
      completion_tokens: u?.completion_tokens ?? 0,
      ok: true,
    });
    const txt = resp.choices[0]?.message?.content ?? "";
    const cleaned = String(txt).replace(/```(?:json)?/g, "").trim();
    const parsed = JSON.parse(cleaned) as Omit<RePlanResult, "llm">;
    return { ...parsed, llm: { id, ms, model, ok: true } };
  } catch {
    return mock;
  }
}

/* ─────────── Weekly Report · 真调 Claude ─────────── */

interface ReportResult {
  markdown: string;
  llm: { id: string | null; ms: number; model: string; ok: boolean };
}

async function generateReport(
  client: LLMClient | null,
  input: GoalInput,
  plan: PlanTree,
  totals: Record<KpiName, number>
): Promise<ReportResult> {
  const mock = {
    markdown: `# ${input.duration_days} 天运营周报\n\n## 核心数据\n- 涨粉：${totals.growth}\n- 互动：${totals.engagement}\n- 私信转化：${totals.conversion}\n- 成交：${totals.retention}\n\n## 三个洞察\n1. 街拍类配图比商品图互动 +31%\n2. 19:00 后的发布互动率最高\n3. "尺码建议"是最易转化的私信关键词\n\n## 下轮建议\n- 把发布集中到晚 8 点档\n- 起草更多"身高×尺码"组合型内容\n- 高频回访上轮私信咨询过但未转化的用户`,
    llm: { id: null, ms: 0, model: "mock", ok: false },
  };
  if (!client) return mock;

  const model = process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.5";
  const t0 = Date.now();
  try {
    const resp = await client.chat.completions.create({
      model,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content: "你是擅长生成简洁运营复盘的 Agent · 输出 markdown · 中文。",
        },
        {
          role: "user",
          content: `基于以下 ${input.duration_days} 天执行数据生成周报（markdown · 3 段：核心数据 / 3 个洞察 / 下轮建议 · 每段 3 行以内）：

目标："${input.title}"
累计 KPI：${JSON.stringify(totals)}
执行过的任务：${plan.tasks.map((t) => t.title).join(" · ")}`,
        },
      ],
    });
    const ms = Date.now() - t0;
    const id = (resp as unknown as { id: string }).id ?? null;
    const u = (resp as unknown as { usage?: { prompt_tokens: number; completion_tokens: number } }).usage;
    llmLogs.push({
      step: "weekly_report",
      id,
      model,
      ms,
      prompt_tokens: u?.prompt_tokens ?? 0,
      completion_tokens: u?.completion_tokens ?? 0,
      ok: true,
    });
    return {
      markdown: resp.choices[0]?.message?.content ?? mock.markdown,
      llm: { id, ms, model, ok: true },
    };
  } catch {
    return mock;
  }
}
