import { NextRequest, NextResponse } from "next/server";
import { approveGoal, rejectGoal } from "@/lib/runs/goal-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Props) {
  const { id } = await params;
  let body: { decision?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const ok =
    body.decision === "approve" ? approveGoal(id) : rejectGoal(id);
  if (!ok) return NextResponse.json({ error: "not_awaiting" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
