import { readJsonl } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const events = await readJsonl<{ actor: string; action: string; target?: string; meta?: string; level?: string; ts: number }>(
    "audit",
    200,
  );
  return Response.json({ events });
}
