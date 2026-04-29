import { NextRequest, NextResponse } from "next/server";
import { createGoal, listGoals } from "@/lib/runs/goal-manager";
import { validateGoal } from "@/lib/agent/goal-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/goals · 创建新 Goal · body = GoalInput */
export async function POST(req: NextRequest) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const v = validateGoal(body);
  if ("error" in v) {
    return NextResponse.json({ error: "invalid_input", detail: v.error }, { status: 400 });
  }
  const sum = await createGoal(v);
  const hasKey = (process.env.OPENROUTER_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? "").startsWith("sk-");
  return NextResponse.json({ ...sum, mode: hasKey ? "real" : "mock" }, { status: 201 });
}

/** GET /api/goals · 最近 goals */
export async function GET() {
  return NextResponse.json({ items: listGoals().slice(0, 20) });
}
