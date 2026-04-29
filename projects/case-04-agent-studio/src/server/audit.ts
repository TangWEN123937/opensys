import { appendJsonl } from "./store";

export interface AuditEvent {
  actor: string;
  action: string;
  target?: string;
  meta?: string;
  level?: "info" | "warn" | "error";
}

export async function audit(e: AuditEvent) {
  await appendJsonl("audit", { ...e, level: e.level ?? "info" });
}
