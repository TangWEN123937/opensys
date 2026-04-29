import { NextRequest, NextResponse } from "next/server";
import { advanceRun, getRun } from "@/lib/runs/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

/** POST /api/runs/:id/advance · 手动推进一步 */
export async function POST(_req: NextRequest, { params }: Props) {
  const { id } = await params;
  if (!getRun(id)) {
    return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  }
  const ok = advanceRun(id);
  if (!ok) {
    return NextResponse.json(
      { error: "cannot_advance", hint: "run done or awaiting_approval" },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true, run: getRun(id) });
}
