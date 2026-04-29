import type { ScriptStep } from "@/lib/agent/script-ecom-dm";

export type RunState =
  | "running"
  | "paused"
  | "awaiting_approval"
  | "done"
  | "failed";

export type RunEventType =
  | "run_started"
  | "step_start"
  | "thought"
  | "tool_call"
  | "tool_result"
  | "artifact"
  | "step_done"
  | "approval_required"
  | "approved"
  | "rejected"
  | "run_done"
  | "heartbeat";

export interface RunEvent {
  /** server-monotonic sequence (not PK) */
  seq: number;
  /** event type · drives UI */
  type: RunEventType;
  /** 1-indexed step; heartbeat has null */
  step_no: number | null;
  /** structured payload · stored as JSON in DB */
  payload: Record<string, unknown>;
  /** ms since epoch */
  created_at: number;
}

export interface RunRow {
  id: string;
  scenario: string;
  state: RunState;
  current_step: number;
  total_steps: number;
  speed: number;
  auto_play: 0 | 1;
  created_at: number;
  updated_at: number;
}

export interface RunSummary {
  id: string;
  scenario: string;
  state: RunState;
  current_step: number;
  total_steps: number;
  speed: number;
  created_at: number;
  updated_at: number;
  events_count?: number;
}

/** Helper to expand a script step into fine-grained events */
export function stepToEvents(
  step: ScriptStep,
  seq: { v: number }
): Omit<RunEvent, "created_at">[] {
  const out: Omit<RunEvent, "created_at">[] = [];
  const push = (t: RunEventType, p: Record<string, unknown>) => {
    out.push({ seq: seq.v++, type: t, step_no: step.no, payload: p });
  };
  push("step_start", { title: step.title, kind: step.kind });
  push("thought", { text: step.thought });
  push("tool_call", { name: step.tool.name, params: step.tool.params });
  push("tool_result", { result: step.tool.result });
  push("artifact", {
    type: step.artifact.type,
    data: step.artifact.data,
  });
  return out;
}
