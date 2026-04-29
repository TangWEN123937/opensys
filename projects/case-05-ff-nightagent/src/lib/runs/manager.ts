import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { SCRIPT_ECOM_DM, TOTAL_STEPS } from "@/lib/agent/script-ecom-dm";
import type { UserInput } from "@/lib/agent/input-schema";
import type { StepOutput } from "@/lib/agent/runner-input";
import {
  buildClient,
  computeStepByNo,
  TOTAL_INPUT_STEPS,
} from "@/lib/agent/runner-input";
import type {
  RunEvent,
  RunEventType,
  RunRow,
  RunState,
  RunSummary,
} from "./types";
import { stepToEvents } from "./types";

/**
 * 内存单例 RunManager
 * - 每个 run 绑定一个 setTimeout 推进循环
 * - SSE 订阅者保持在内存 Set 里
 * - 事件持久化到 SQLite（客户端可回放）
 *
 * 单进程 Next.js dev server · 足够 MVP 演示
 * 对生产：把 manager 换成 Inngest durable workflow 即可 API 保持兼容
 */

interface RunHandle {
  row: RunRow;
  timer: ReturnType<typeof setTimeout> | null;
  listeners: Set<(ev: RunEvent) => void>;
  seq: number; // 单调递增
  input: UserInput | null;           // /agent 提交的用户输入
  priorOutputs: StepOutput[];        // input-driven 模式下已产生的 step 结果
}

const runs = new Map<string, RunHandle>();

/* ─────────── DB helpers ─────────── */

function insertRunRow(row: RunRow) {
  getDb()
    .prepare(
      `INSERT INTO runs
       (id, scenario, state, current_step, total_steps, speed, auto_play, created_at, updated_at)
       VALUES (@id, @scenario, @state, @current_step, @total_steps, @speed, @auto_play, @created_at, @updated_at)`
    )
    .run(row);
}

function updateRunRow(id: string, patch: Partial<RunRow>) {
  const now = Date.now();
  const fields = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(", ");
  if (!fields) return;
  getDb()
    .prepare(`UPDATE runs SET ${fields}, updated_at = @updated_at WHERE id = @id`)
    .run({ ...patch, id, updated_at: now });
}

function loadRunRow(id: string): RunRow | null {
  const row = getDb()
    .prepare(`SELECT * FROM runs WHERE id = ?`)
    .get(id) as RunRow | undefined;
  return row ?? null;
}

function insertEvent(
  runId: string,
  seq: number,
  type: RunEventType,
  stepNo: number | null,
  payload: Record<string, unknown>
) {
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO events (run_id, seq, step_no, type, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(runId, seq, stepNo, type, JSON.stringify(payload), now);
  return now;
}

/* ─────────── Public API ─────────── */

export interface CreateRunOptions {
  scenario?: string;
  speed?: number;
  autoPlay?: boolean;
  input?: UserInput | null;
}

export function createRun(opts: CreateRunOptions = {}): RunSummary {
  const id = randomUUID();
  const now = Date.now();
  const row: RunRow = {
    id,
    scenario: opts.scenario ?? "ecom-dm",
    state: "running",
    current_step: 0,
    total_steps: TOTAL_STEPS,
    speed: opts.speed ?? 1,
    auto_play: opts.autoPlay === false ? 0 : 1,
    created_at: now,
    updated_at: now,
  };
  insertRunRow(row);

  const handle: RunHandle = {
    row,
    timer: null,
    listeners: new Set(),
    seq: 0,
    input: opts.input ?? null,
    priorOutputs: [],
  };
  runs.set(id, handle);

  // 第一个事件：run_started
  emit(handle, "run_started", null, {
    scenario: row.scenario,
    input_driven: !!handle.input,
  });

  if (row.auto_play) scheduleNextStep(handle);

  return summary(row);
}

/** 用户点击 advance · 手动推进一步 */
export function advanceRun(id: string): boolean {
  const h = getOrLoadHandle(id);
  if (!h || h.row.state === "done" || h.row.state === "awaiting_approval") {
    return false;
  }
  // 停掉 auto timer · 立即推进一步
  if (h.timer) clearTimeout(h.timer);
  h.timer = null;
  executeCurrentStep(h);
  return true;
}

/** 用户审批通过 */
export function approveRun(id: string): boolean {
  const h = getOrLoadHandle(id);
  if (!h || h.row.state !== "awaiting_approval") return false;
  emit(h, "approved", h.row.current_step, {});
  h.row.state = "running";
  updateRunRow(id, { state: "running" });
  // 当前 step 已出了 approval_required · 现在算 step_done
  emit(h, "step_done", h.row.current_step, { step_no: h.row.current_step });
  moveToNextStep(h);
  return true;
}

export function rejectRun(id: string): boolean {
  const h = getOrLoadHandle(id);
  if (!h || h.row.state !== "awaiting_approval") return false;
  emit(h, "rejected", h.row.current_step, {});
  h.row.state = "paused";
  updateRunRow(id, { state: "paused" });
  return true;
}

export function pauseRun(id: string): boolean {
  const h = getOrLoadHandle(id);
  if (!h || h.row.state !== "running") return false;
  if (h.timer) clearTimeout(h.timer);
  h.timer = null;
  h.row.state = "paused";
  updateRunRow(id, { state: "paused" });
  return true;
}

export function resumeRun(id: string): boolean {
  const h = getOrLoadHandle(id);
  if (!h || h.row.state !== "paused") return false;
  h.row.state = "running";
  updateRunRow(id, { state: "running" });
  scheduleNextStep(h);
  return true;
}

export function getRun(id: string): RunSummary | null {
  const row = loadRunRow(id);
  if (!row) return null;
  const cnt = (getDb()
    .prepare(`SELECT COUNT(*) as c FROM events WHERE run_id = ?`)
    .get(id) as { c: number }).c;
  return { ...summary(row), events_count: cnt };
}

export function getEvents(
  id: string,
  sinceSeq = -1
): Array<{ seq: number; type: string; step_no: number | null; payload: unknown; created_at: number }> {
  const rows = getDb()
    .prepare(
      `SELECT seq, type, step_no, payload, created_at
       FROM events WHERE run_id = ? AND seq > ? ORDER BY seq ASC`
    )
    .all(id, sinceSeq) as Array<{
    seq: number;
    type: string;
    step_no: number | null;
    payload: string;
    created_at: number;
  }>;
  return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
}

/** 订阅者注册 · 解除订阅由调用方管理 */
export function subscribe(
  id: string,
  listener: (ev: RunEvent) => void
): (() => void) | null {
  const h = getOrLoadHandle(id);
  if (!h) return null;
  h.listeners.add(listener);
  return () => {
    h.listeners.delete(listener);
  };
}

/* ─────────── Internals ─────────── */

function getOrLoadHandle(id: string): RunHandle | null {
  const mem = runs.get(id);
  if (mem) return mem;
  const row = loadRunRow(id);
  if (!row) return null;
  // 恢复的 run 不再 auto-advance（进程可能已重启） · 前端可手动 advance / resume
  const lastSeq = (getDb()
    .prepare(`SELECT MAX(seq) as s FROM events WHERE run_id = ?`)
    .get(id) as { s: number | null }).s;
  const handle: RunHandle = {
    row,
    timer: null,
    listeners: new Set(),
    seq: (lastSeq ?? -1) + 1,
    input: null,       // reload 时丢失 · 重启前端建议新建 run
    priorOutputs: [],
  };
  runs.set(id, handle);
  return handle;
}

function summary(row: RunRow): RunSummary {
  return {
    id: row.id,
    scenario: row.scenario,
    state: row.state,
    current_step: row.current_step,
    total_steps: row.total_steps,
    speed: row.speed,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function emit(
  h: RunHandle,
  type: RunEventType,
  stepNo: number | null,
  payload: Record<string, unknown>
): RunEvent {
  const seq = h.seq++;
  const created_at = insertEvent(h.row.id, seq, type, stepNo, payload);
  const ev: RunEvent = { seq, type, step_no: stepNo, payload, created_at };
  // Fan-out to live listeners
  for (const fn of h.listeners) {
    try {
      fn(ev);
    } catch {
      /* ignore */
    }
  }
  return ev;
}

function scheduleNextStep(h: RunHandle) {
  if (h.row.state !== "running") return;
  // input-driven：不用固定剧本 · LLM 步可能慢 · 走立即 executeCurrentStep
  if (h.input) {
    const delay = 400;
    h.timer = setTimeout(() => executeCurrentStep(h), delay);
    return;
  }
  const step = SCRIPT_ECOM_DM[h.row.current_step];
  if (!step) {
    finishRun(h);
    return;
  }
  const delay = Math.max(200, (step.durationMs / h.row.speed) * 0.6);
  h.timer = setTimeout(() => {
    executeCurrentStep(h);
  }, delay);
}

async function executeCurrentStep(h: RunHandle) {
  const stepIdx = h.row.current_step;

  // ── input-driven 路径 ───────────────────────────────
  if (h.input) {
    if (stepIdx >= TOTAL_INPUT_STEPS) {
      finishRun(h);
      return;
    }
    try {
      const client = buildClient();
      const stepNo = stepIdx + 1;
      // 先亮灯 · 让前端看到 step 激活 + 正在调 LLM · 不然用户看到"跳一下就完"
      const llmSteps: Record<number, string> = {
        2: "正在问 Claude：这条消息是什么意图？",
        5: "正在问 Claude：推哪个尺码？",
        7: "正在问 Claude：起草 3 条回复变体…",
      };
      emit(h, "step_start", stepNo, { title: `步骤 ${stepNo}`, kind: "thinking" });
      if (llmSteps[stepNo]) {
        emit(h, "thought", stepNo, { text: `🤖 ${llmSteps[stepNo]}` });
        emit(h, "tool_call", stepNo, {
          name: "llm.openrouter",
          params: { model: process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.5" },
        });
      }
      const out = await computeStepByNo(stepNo, h.input, h.priorOutputs, client);
      h.priorOutputs.push(out);
      emitInputStep(h, out);
      if (out.requires_approval) {
        h.row.state = "awaiting_approval";
        updateRunRow(h.row.id, { state: "awaiting_approval" });
        emit(h, "approval_required", out.no, { preview: out.artifact.data });
        return;
      }
      emit(h, "step_done", out.no, { step_no: out.no });
      moveToNextStep(h);
    } catch (e) {
      emit(h, "heartbeat", stepIdx + 1, {
        error: String(e),
        hint: "computeStepByNo failed",
      });
      h.row.state = "failed";
      updateRunRow(h.row.id, { state: "failed" });
    }
    return;
  }

  // ── script-driven 路径（/demo/run 和旧流程）────────
  const step = SCRIPT_ECOM_DM[stepIdx];
  if (!step) {
    finishRun(h);
    return;
  }
  const evs = stepToEvents(step, { v: h.seq });
  for (const e of evs) {
    emit(h, e.type, e.step_no, e.payload);
  }
  if (step.requiresApproval) {
    h.row.state = "awaiting_approval";
    updateRunRow(h.row.id, { state: "awaiting_approval" });
    emit(h, "approval_required", step.no, {
      preview: step.artifact.data,
    });
    return;
  }
  emit(h, "step_done", step.no, { step_no: step.no });
  moveToNextStep(h);
}

function emitInputStep(h: RunHandle, out: StepOutput) {
  const isLlm = out.no === 2 || out.no === 5 || out.no === 7;
  // LLM 步已在 await 前预 emit · 这里只补真正 title / 结果
  if (!isLlm) {
    emit(h, "step_start", out.no, { title: out.title, kind: out.kind });
    emit(h, "tool_call", out.no, {
      name: out.tool.name,
      params: out.tool.params,
    });
  }
  emit(h, "thought", out.no, { text: out.thought });
  emit(h, "tool_result", out.no, { result: out.tool.result });
  emit(h, "artifact", out.no, { type: out.artifact.type, data: out.artifact.data });
}

function moveToNextStep(h: RunHandle) {
  const next = h.row.current_step + 1;
  h.row.current_step = next;
  updateRunRow(h.row.id, { current_step: next });
  const total = h.input ? TOTAL_INPUT_STEPS : TOTAL_STEPS;
  if (next >= total) {
    finishRun(h);
    return;
  }
  if (h.row.auto_play && h.row.state === "running") {
    scheduleNextStep(h);
  }
}

function finishRun(h: RunHandle) {
  h.row.state = "done";
  updateRunRow(h.row.id, { state: "done" });
  emit(h, "run_done", null, { total_steps: TOTAL_STEPS });
}

/* ─────────── Test helpers ─────────── */

export function resetManager() {
  for (const h of runs.values()) {
    if (h.timer) clearTimeout(h.timer);
  }
  runs.clear();
}
