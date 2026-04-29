import { NextRequest, NextResponse } from "next/server";
import { createRun } from "@/lib/runs/manager";
import { validateInput } from "@/lib/agent/input-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/runs · 创建新 run · 可选 input（/agent 使用） */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty body OK */
  }

  // 可选 input 字段 · 有则走 input-driven runner
  let input = null;
  if (body.input) {
    const v = validateInput(body.input);
    if ("error" in v) {
      return NextResponse.json(
        { error: "invalid_input", detail: v.error },
        { status: 400 }
      );
    }
    input = v;
  }

  const summary = createRun({
    scenario: (body.scenario as string) ?? "ecom-dm",
    speed: typeof body.speed === "number" ? body.speed : 1,
    autoPlay: body.auto_play !== false,
    input,
  });

  // 回传 mode · 前端切 badge
  const hasLlmKey =
    (process.env.OPENROUTER_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? "")
      .startsWith("sk-");
  const mode = input && hasLlmKey ? "real" : input ? "mock_input" : "demo";
  return NextResponse.json({ ...summary, mode }, { status: 201 });
}

/** GET /api/runs · 返回最近 runs · 教学场景用，不分页 */
export async function GET() {
  const { getDb } = await import("@/lib/db");
  const rows = getDb()
    .prepare(
      `SELECT id, scenario, state, current_step, total_steps, speed, created_at, updated_at
       FROM runs ORDER BY created_at DESC LIMIT 20`
    )
    .all();
  return NextResponse.json({ items: rows });
}
