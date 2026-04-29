import { NextResponse } from "next/server";
import { getGoal, getGoalEvents } from "@/lib/runs/goal-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string; kpi: string }>;
}

/**
 * GET /api/goals/[id]/kpi/[kpi]
 * · event-sourced drill-down · 教学核心
 * · 按 day 聚合 kpi_delta · 返回贡献者列表
 */
export async function GET(_req: Request, { params }: Props) {
  const { id, kpi } = await params;
  if (!getGoal(id))
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const events = getGoalEvents(id);
  const deltas = events.filter((e) => {
    if (e.type !== "kpi_delta") return false;
    const p = e.payload as { kpi?: string };
    return p.kpi === kpi;
  });

  // 按 day 聚合
  const byDay = new Map<
    number,
    { day: number; delta: number; contributors: unknown[] }
  >();
  for (const e of deltas) {
    const p = e.payload as {
      delta: number;
      contributor: { day: number; type: string; label: string; task_id: string };
    };
    const d = p.contributor?.day ?? e.day ?? 0;
    const row = byDay.get(d) ?? { day: d, delta: 0, contributors: [] };
    row.delta += p.delta;
    row.contributors.push(p.contributor);
    byDay.set(d, row);
  }

  const total = deltas.reduce((s, e) => {
    const p = e.payload as { delta: number };
    return s + (p.delta ?? 0);
  }, 0);

  return NextResponse.json({
    kpi,
    total,
    by_day: [...byDay.values()].sort((a, b) => a.day - b.day),
    event_count: deltas.length,
  });
}
