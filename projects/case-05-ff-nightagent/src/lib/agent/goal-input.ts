/**
 * Goal input schema · "目标自驾" 托管目标
 *
 * 用户用自然语言描述一个 30 天的运营 KPI · Agent 托管执行（设定目的地 → 自动巡航）
 */

export interface GoalInput {
  title: string;                       // "30 天涨粉 500 + 10 条私信转化 3 单"
  platform: "xiaohongshu" | "douyin" | "bilibili" | "shipinhao" | "weixin";
  duration_days: number;               // 默认 30
  kpis: {
    growth?: { target: number; unit: string };      // 涨粉
    engagement?: { target: number; unit: string };  // 互动（赞/评/藏）
    conversion?: { target: number; unit: string };  // 转化（私信/下单）
    retention?: { target: number; unit: string };   // 留存/复购
  };
  brand_voice?: "friendly_sister" | "pro_consultant" | "casual_cool";
  approval_mode?: "all" | "risky_only" | "none";
  /** 时间压缩比 · 默认 1 = 30 天 in 2 分钟 */
  speed?: 0.5 | 1 | 2 | 4;
}

/** Plan Tree 节点 · 一次性从 Plan LLM 生成 */
export interface PlanTask {
  id: string;                          // "t-research-1"
  title: string;                       // "研究 5 个对标账号的爆款结构"
  parent_id?: string;                  // 层级
  lane: "research" | "draft" | "publish" | "reply" | "report";
  reason: string;                      // 为什么要做这件事（LLM 原话）
  estimated_days: [number, number];    // [开始 day, 结束 day] · 例 [1, 3]
  requires_approval: boolean;
}

export interface PlanTree {
  tasks: PlanTask[];
  /** Plan LLM 调用证据 */
  llm: { id: string | null; ms: number; model: string; ok: boolean };
  /** Plan thinking 原话 · 给 UI 逐字打字 */
  raw_thought: string;
}

/** 4 维 KPI · 每个 delta 都有 contributor · 支持前端点环下钻 */
export type KpiName = "growth" | "engagement" | "conversion" | "retention";

export interface KpiDelta {
  kpi: KpiName;
  delta: number;                       // 本次增量
  total: number;                       // 累计
  contributor: {
    day: number;
    type: "post" | "reply" | "engage" | "misc";
    task_id: string;                   // 哪个 task 干的
    label: string;                     // "发了一条配图帖 · 'XX 选题'"
  };
}

export const EXAMPLE_GOAL: GoalInput = {
  title: "30 天小红书涨粉 500 + 10 条私信转化 3 单",
  platform: "xiaohongshu",
  duration_days: 30,
  kpis: {
    growth: { target: 500, unit: "粉" },
    engagement: { target: 2000, unit: "次" },
    conversion: { target: 10, unit: "条" },
    retention: { target: 3, unit: "单" },
  },
  brand_voice: "friendly_sister",
  approval_mode: "risky_only",
  speed: 1,
};

export function validateGoal(raw: unknown): { error: string } | GoalInput {
  if (!raw || typeof raw !== "object") return { error: "not object" };
  const r = raw as Record<string, unknown>;
  if (typeof r.title !== "string" || r.title.length < 5)
    return { error: "title too short" };
  const kpis = (r.kpis as Record<string, unknown>) ?? {};
  if (!kpis.growth && !kpis.engagement && !kpis.conversion && !kpis.retention)
    return { error: "at least one kpi required" };
  return {
    title: r.title,
    platform: (r.platform as GoalInput["platform"]) ?? "xiaohongshu",
    duration_days: typeof r.duration_days === "number" ? r.duration_days : 30,
    kpis: kpis as GoalInput["kpis"],
    brand_voice: (r.brand_voice as GoalInput["brand_voice"]) ?? "friendly_sister",
    approval_mode: (r.approval_mode as GoalInput["approval_mode"]) ?? "risky_only",
    speed: (r.speed as GoalInput["speed"]) ?? 1,
  };
}
