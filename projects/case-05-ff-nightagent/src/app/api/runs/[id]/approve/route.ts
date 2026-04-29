import { NextRequest, NextResponse } from "next/server";
import { approveRun, rejectRun, getRun } from "@/lib/runs/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

/** POST /api/runs/:id/approve · body = { decision: 'approve' | 'reject' } */
export async function POST(req: NextRequest, { params }: Props) {
  const { id } = await params;
  if (!getRun(id)) {
    return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  }
  let decision = "approve";
  try {
    const body = await req.json();
    if (body.decision === "reject") decision = "reject";
  } catch {
    /* default approve */
  }

  const ok = decision === "reject" ? rejectRun(id) : approveRun(id);
  if (!ok) {
    return NextResponse.json(
      { error: "not_awaiting_approval" },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true, decision, run: getRun(id) });
}
