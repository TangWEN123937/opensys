/** Shared event shape between server SSE and client consumers */

export type SseEventType =
  | "reasoning"
  | "tool_call"
  | "tool_result"
  | "plan_update"
  | "approval_needed"
  | "heartbeat";

export interface SseEvent {
  id: string;
  goalId: string;
  type: SseEventType;
  time: string;          // "HH:MM:SS"
  content: string;
  meta?: Record<string, string | number>;
}
