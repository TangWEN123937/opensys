/**
 * 运行模式检测 · 三层降级策略
 *
 *   L1 LIVE  —— 有 OPENROUTER_API_KEY  → 真调 LLM
 *   L2 ——————  调用中失败             → 已 emit 真事件保留 + 切到剧本续跑
 *   L3 DEMO  —— 没 key / key 无效     → 完整跑 mock 剧本
 */

export type RuntimeMode = "live" | "demo";

export type AgentEvent =
  | { t: "meta"; agent: string; mode: RuntimeMode; model?: string; totalMs?: number; steps?: number; startedAt: number }
  | { t: "boot"; title: string; subtitle: string }
  | { t: "phase"; phase: "thinking" | "retrieving" | "tool" | "writing" | "shipping" | "done"; label: string }
  | { t: "mechanism"; id: string; tokens: number; note?: string }
  | { t: "tool"; id: string; name: string; args: Record<string, string | number>; result: string; ms: number }
  | { t: "stream"; text: string }
  | { t: "log"; level: "info" | "ok" | "warn" | "error"; text: string }
  | { t: "metric"; key: string; delta: number }
  | { t: "artifact"; kind: string; title: string; meta?: string }
  | { t: "done"; summary: string; durationMs?: number }
  | { t: "end" };

export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export function getApiKey(): string | undefined {
  const k = process.env.OPENROUTER_API_KEY?.trim();
  if (!k) return undefined;
  // OpenRouter keys start with sk-or-
  if (!k.startsWith("sk-or-")) return undefined;
  return k;
}

export function getModel(): string {
  return process.env.AGENT_MODEL?.trim() || "anthropic/claude-sonnet-4.6";
}

export function getTimeoutMs(): number {
  const v = parseInt(process.env.AGENT_TIMEOUT_MS || "45000", 10);
  return Number.isFinite(v) && v > 0 ? v : 45000;
}

export function detectMode(): RuntimeMode {
  return getApiKey() ? "live" : "demo";
}
