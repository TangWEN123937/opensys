/**
 * Goal Manager · 托管"目标自驾"goal 的生命周期
 *
 * 对照 ./manager.ts 的 step-runner 模式 · 这里是 day-runner 模式
 * 每个 goal 是一个 durable run · 事件 event-sourced 存 events 表 · SSE 实时推
 *
 * 对标 Inngest step.run + step.waitForEvent 的行为（无 Inngest 依赖 · 纯内存模拟）
 */

import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import {
  generatePlan,
  runGoalTimeline,
  type GoalEventType,
} from "@/lib/agent/goal-runner";
import { buildClient } from "@/lib/agent/runner-input";
import type { GoalInput, PlanTree } from "@/lib/agent/goal-input";

interface GoalRow {
  id: string;
  title: string;
  platform: string;
  status: "planning" | "running" | "awaiting_approval" | "done" | "failed";
  current_day: number;
  duration_days: number;
  speed: number;
  created_at: number;
  updated_at: number;
}

export interface GoalEvent {
  seq: number;
  type: GoalEventType;
  day: number | null;
  payload: Record<string, unknown>;
  created_at: number;
}

interface GoalHandle {
  row: GoalRow;
  input: GoalInput;
  plan: PlanTree | null;
  listeners: Set<(ev: GoalEvent) => void>;
  seq: number;
  /** HITL 等待 resolver */
  approvalResolver: ((decision: "approved" | "rejected") => void) | null;
  /** 终止信号 */
  aborted: boolean;
}

const goals = new Map<string, GoalHandle>();

/* ─────────── DB helpers（复用 events 表） ─────────── */

function insertEvent(
  goalId: string,
  seq: number,
  type: string,
  day: number | null,
  payload: Record<string, unknown>
): number {
  const now = Date.now();
  // 兼容 events 表 · step_no 列直接存 day
  getDb()
    .prepare(
      `INSERT INTO events (run_id, seq, step_no, type, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(goalId, seq, day, type, JSON.stringify(payload), now);
  return now;
}

/* ─────────── Public API ─────────── */

export interface GoalSummary {
  id: string;
  title: string;
  platform: string;
  status: GoalRow["status"];
  current_day: number;
  duration_days: number;
  speed: number;
  created_at: number;
  updated_at: number;
  plan_ready: boolean;
}

function summary(h: GoalHandle): GoalSummary {
  return { ...h.row, plan_ready: !!h.plan };
}

export async function createGoal(input: GoalInput): Promise<GoalSummary> {
  const id = randomUUID();
  const now = Date.now();
  const row: GoalRow = {
    id,
    title: input.title,
    platform: input.platform,
    status: "planning",
    current_day: 0,
    duration_days: input.duration_days,
    speed: input.speed ?? 1,
    created_at: now,
    updated_at: now,
  };
  const handle: GoalHandle = {
    row,
    input,
    plan: null,
    listeners: new Set(),
    seq: 0,
    approvalResolver: null,
    aborted: false,
  };
  goals.set(id, handle);

  // emit 封装
  const emit = (
    type: GoalEventType,
    day: number | null,
    payload: Record<string, unknown>
  ) => {
    const seq = handle.seq++;
    const created_at = insertEvent(id, seq, type, day, payload);
    const ev: GoalEvent = { seq, type, day, payload, created_at };
    for (const fn of handle.listeners) {
      try {
        fn(ev);
      } catch {
        /* ignore */
      }
    }
    // 同步 row 状态
    if (type === "day_tick" && typeof payload.day === "number") {
      handle.row.current_day = payload.day;
    }
    if (type === "hitl_required") handle.row.status = "awaiting_approval";
    if (type === "approved" || type === "rejected") handle.row.status = "running";
    if (type === "goal_done") handle.row.status = "done";
    handle.row.updated_at = created_at;
  };

  // 异步启动 · 不阻塞 POST 响应
  (async () => {
    try {
      const client = buildClient();
      const plan = await generatePlan(input, client);
      handle.plan = plan;
      handle.row.status = "running";

      await runGoalTimeline({
        input,
        plan,
        emit,
        client,
        waitForApproval: () =>
          new Promise<"approved" | "rejected">((resolve) => {
            handle.approvalResolver = resolve;
          }),
        delay: (ms) =>
          new Promise<boolean>((resolve) => {
            if (handle.aborted) return resolve(false);
            setTimeout(() => resolve(!handle.aborted), ms);
          }),
      });
    } catch (e) {
      emit("goal_done", null, { error: String(e) });
      handle.row.status = "failed";
    }
  })();

  return summary(handle);
}

export function getGoal(id: string): GoalSummary | null {
  const h = goals.get(id);
  return h ? summary(h) : null;
}

export function getGoalPlan(id: string): PlanTree | null {
  return goals.get(id)?.plan ?? null;
}

export function getGoalInput(id: string): GoalInput | null {
  return goals.get(id)?.input ?? null;
}

export function getGoalEvents(id: string, sinceSeq = -1): GoalEvent[] {
  const rows = getDb()
    .prepare(
      `SELECT seq, type, step_no, payload, created_at
       FROM events WHERE run_id = ? AND seq > ? ORDER BY seq ASC`
    )
    .all(id, sinceSeq) as Array<{
    seq: number;
    type: GoalEventType;
    step_no: number | null;
    payload: string;
    created_at: number;
  }>;
  return rows.map((r) => ({
    seq: r.seq,
    type: r.type,
    day: r.step_no,
    payload: JSON.parse(r.payload),
    created_at: r.created_at,
  }));
}

export function subscribeGoal(
  id: string,
  listener: (ev: GoalEvent) => void
): (() => void) | null {
  const h = goals.get(id);
  if (!h) return null;
  h.listeners.add(listener);
  return () => {
    h.listeners.delete(listener);
  };
}

export function approveGoal(id: string): boolean {
  const h = goals.get(id);
  if (!h || !h.approvalResolver) return false;
  h.approvalResolver("approved");
  h.approvalResolver = null;
  return true;
}

export function rejectGoal(id: string): boolean {
  const h = goals.get(id);
  if (!h || !h.approvalResolver) return false;
  h.approvalResolver("rejected");
  h.approvalResolver = null;
  return true;
}

export function abortGoal(id: string): boolean {
  const h = goals.get(id);
  if (!h) return false;
  h.aborted = true;
  h.approvalResolver?.("rejected");
  return true;
}

export function listGoals(): GoalSummary[] {
  return [...goals.values()]
    .map(summary)
    .sort((a, b) => b.created_at - a.created_at);
}
