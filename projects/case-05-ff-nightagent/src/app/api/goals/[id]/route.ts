import { NextResponse } from "next/server";
import { getGoal, getGoalInput, getGoalPlan } from "@/lib/runs/goal-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Props) {
  const { id } = await params;
  const sum = getGoal(id);
  if (!sum) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({
    ...sum,
    input: getGoalInput(id),
    plan: getGoalPlan(id),
  });
}
