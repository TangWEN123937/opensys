/**
 * DemoRunner state machine · 纯函数/类型，供 demo-runner.tsx 使用
 */

import type { ScriptStep } from "@/lib/agent/script-ecom-dm";

export type RunnerState =
  | "idle"
  | "running"
  | "paused"
  | "awaiting_approval"
  | "done";

export interface RunnerSnapshot {
  state: RunnerState;
  currentIndex: number;
  speed: number;
  startedAt: number | null;
  approvedAt: number | null;
}

/** compute whether the step demands user approval before advancing */
export function stepNeedsApproval(step: ScriptStep | undefined) {
  return !!step?.requiresApproval;
}
