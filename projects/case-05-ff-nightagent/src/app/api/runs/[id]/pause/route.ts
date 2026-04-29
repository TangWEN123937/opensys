import { NextRequest, NextResponse } from "next/server";
import { pauseRun, resumeRun, getRun } from "@/lib/runs/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

/** POST /api/runs/:id/pause · body = { action: 'pause' | 'resume' } */
export async function POST(req: NextRequest, { params }: Props) {
  const { id } = await params;
  if (!getRun(id)) {
    return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  }
  let action = "pause";
  try {
    const body = await req.json();
    if (body.action === "resume") action = "resume";
  } catch {
    /* default pause */
  }
  const ok = action === "resume" ? resumeRun(id) : pauseRun(id);
  if (!ok) {
    return NextResponse.json({ error: "no_op" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, action, run: getRun(id) });
}
