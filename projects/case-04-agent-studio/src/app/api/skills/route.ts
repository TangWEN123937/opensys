// GET /api/skills · 列所有 skill(从 .skills/ 扫)
// POST /api/skills · { action: "install" | "uninstall", name }

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readCollection, writeCollection } from "@/server/store";
import { audit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  verified: boolean;
  raw: string;
}

interface InstalledState {
  names: string[];
}

function parseFrontmatter(md: string): Record<string, string | boolean> {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out: Record<string, string | boolean> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (!kv) continue;
    const [, k, v] = kv;
    out[k] = v === "true" ? true : v === "false" ? false : v;
  }
  return out;
}

async function readSkill(dirName: string): Promise<Skill | null> {
  const mdPath = join(process.cwd(), ".skills", dirName, "SKILL.md");
  if (!existsSync(mdPath)) return null;
  const raw = await readFile(mdPath, "utf-8");
  const fm = parseFrontmatter(raw);
  return {
    id: dirName,
    name: (fm.name as string) ?? dirName,
    description: (fm.description as string) ?? "",
    version: (fm.version as string) ?? "0.0.0",
    author: (fm.author as string) ?? "unknown",
    category: (fm.category as string) ?? "misc",
    verified: Boolean(fm.verified),
    raw,
  };
}

export async function GET() {
  const dir = join(process.cwd(), ".skills");
  if (!existsSync(dir)) {
    return Response.json({ skills: [], installed: [] });
  }
  const dirs = await readdir(dir);
  const skills: Skill[] = [];
  for (const d of dirs) {
    const s = await readSkill(d);
    if (s) skills.push(s);
  }
  const state = await readCollection<InstalledState>("skills-installed", { names: [] });
  return Response.json({ skills, installed: state.names });
}

export async function POST(req: Request) {
  const { action, name } = (await req.json()) as { action: "install" | "uninstall"; name: string };
  const state = await readCollection<InstalledState>("skills-installed", { names: [] });
  if (action === "install" && !state.names.includes(name)) {
    state.names.push(name);
  } else if (action === "uninstall") {
    state.names = state.names.filter((n) => n !== name);
  }
  await writeCollection("skills-installed", state);
  await audit({ actor: "user", action: `skill.${action}`, target: name });
  return Response.json({ ok: true, installed: state.names });
}
