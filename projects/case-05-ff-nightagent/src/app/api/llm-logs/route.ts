import { NextResponse } from "next/server";
import { llmLogs } from "@/lib/agent/runner-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/llm-logs · 最近的 LLM 调用记录（OpenRouter request-id + latency + tokens）· 硬证据用 */
export async function GET() {
  return NextResponse.json({
    items: llmLogs.slice(-30),
    total: llmLogs.length,
  });
}
