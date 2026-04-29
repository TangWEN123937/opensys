import type { KpiName, PlanTask, PlanTree } from "@/lib/agent/goal-input";

export interface LiveEvent {
  seq: number;
  type: string;
  day: number | null;
  payload: Record<string, unknown>;
  created_at: number;
}

export type TaskStatus = "pending" | "doing" | "done";

export interface LiveState {
  day: number;
  speed: number;
  platform: string;
  title: string;
  durationDays: number;
  plan: PlanTree | null;
  taskStates: Record<string, { status: TaskStatus; progress: number }>;
  totals: Record<KpiName, number>;
  targets: Record<KpiName, number>;
  recentThoughts: Array<{ seq: number; day: number; text: string; llm?: unknown }>;
  recentTools: Array<{ seq: number; day: number; name: string; lane: string }>;
  hitl: { preview: string; task_id: string; reason: string } | null;
  handoffKey: number;
  lastHandoff: { from: string; to: string } | null;
  rePlan: { summary: string; adjusted_tasks: { id: string; change: string }[]; llm?: unknown } | null;
  report: { markdown: string; llm?: unknown } | null;
  status: "planning" | "running" | "awaiting_approval" | "done" | "failed";
}

export function initialState(): LiveState {
  return {
    day: 0,
    speed: 1,
    platform: "xiaohongshu",
    title: "",
    durationDays: 30,
    plan: null,
    taskStates: {},
    totals: { growth: 0, engagement: 0, conversion: 0, retention: 0 },
    targets: { growth: 1, engagement: 1, conversion: 1, retention: 1 },
    recentThoughts: [],
    recentTools: [],
    hitl: null,
    handoffKey: 0,
    lastHandoff: null,
    rePlan: null,
    report: null,
    status: "planning",
  };
}

export function reduceEvent(state: LiveState, ev: LiveEvent): LiveState {
  const p = ev.payload as Record<string, unknown>;
  switch (ev.type) {
    case "goal_started": {
      const kpis = (p.kpis as Record<string, { target: number }>) ?? {};
      return {
        ...state,
        title: String(p.title ?? ""),
        platform: String(p.platform ?? ""),
        durationDays: Number(p.duration_days ?? 30),
        speed: Number(p.speed ?? 1),
        status: "running",
        targets: {
          growth: kpis.growth?.target ?? 1,
          engagement: kpis.engagement?.target ?? 1,
          conversion: kpis.conversion?.target ?? 1,
          retention: kpis.retention?.target ?? 1,
        },
      };
    }
    case "plan_generated": {
      const tasks = (p.tasks as PlanTask[]) ?? [];
      const ts: Record<string, { status: TaskStatus; progress: number }> = {};
      tasks.forEach((t) => (ts[t.id] = { status: "pending", progress: 0 }));
      return {
        ...state,
        plan: {
          tasks,
          raw_thought: String(p.raw_thought ?? ""),
          llm: (p.llm as PlanTree["llm"]) ?? { id: null, ms: 0, model: "mock", ok: false },
        },
        taskStates: ts,
      };
    }
    case "day_tick":
      return { ...state, day: Number(p.day ?? state.day) };
    case "task_status": {
      const id = String(p.task_id);
      const status = (p.status as TaskStatus) ?? "pending";
      const progress = Number(p.progress ?? 0);
      return {
        ...state,
        taskStates: { ...state.taskStates, [id]: { status, progress } },
      };
    }
    case "kpi_delta": {
      const kpi = p.kpi as KpiName;
      const total = Number(p.total ?? 0);
      return { ...state, totals: { ...state.totals, [kpi]: total } };
    }
    case "thought":
      return {
        ...state,
        recentThoughts: [
          ...state.recentThoughts,
          {
            seq: ev.seq,
            day: ev.day ?? 0,
            text: String(p.text ?? ""),
            llm: p.llm,
          },
        ].slice(-40),
      };
    case "tool_call":
      return {
        ...state,
        recentTools: [
          ...state.recentTools,
          {
            seq: ev.seq,
            day: ev.day ?? 0,
            name: String(p.name ?? ""),
            lane: String(p.lane ?? ""),
          },
        ].slice(-40),
      };
    case "handoff":
      return {
        ...state,
        handoffKey: state.handoffKey + 1,
        lastHandoff: { from: String(p.from), to: String(p.to) },
      };
    case "hitl_required":
      return {
        ...state,
        status: "awaiting_approval",
        hitl: {
          preview: String(p.preview_body ?? ""),
          task_id: String(p.task_id ?? ""),
          reason: String(p.reason ?? ""),
        },
      };
    case "approved":
    case "rejected":
      return { ...state, hitl: null, status: "running" };
    case "re_plan":
      return {
        ...state,
        rePlan: {
          summary: String(p.summary ?? ""),
          adjusted_tasks: (p.adjusted_tasks as { id: string; change: string }[]) ?? [],
          llm: p.llm,
        },
      };
    case "weekly_report":
      return {
        ...state,
        report: { markdown: String(p.markdown ?? ""), llm: p.llm },
      };
    case "goal_done":
      return { ...state, status: "done" };
    default:
      return state;
  }
}
