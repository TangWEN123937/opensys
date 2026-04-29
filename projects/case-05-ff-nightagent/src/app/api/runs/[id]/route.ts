import { NextRequest, NextResponse } from "next/server";
import { getRun, getEvents } from "@/lib/runs/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

/** GET /api/runs/:id · 返回 summary + 全量事件（用于 SSR 或客户端初始化） */
export async function GET(_req: NextRequest, { params }: Props) {
  const { id } = await params;
  const summary = getRun(id);
  if (!summary) {
    return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  }
  const events = getEvents(id);
  return NextResponse.json({ ...summary, events });
}
