// 本地文件存储 · MVP 用 JSON 文件 · 生产切数据库
// 路径:./data/{collection}.json

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";

const ROOT = join(process.cwd(), "data");

async function ensureDir(p: string) {
  if (!existsSync(p)) await mkdir(p, { recursive: true });
}

export async function readCollection<T>(name: string, fallback: T): Promise<T> {
  const file = join(ROOT, `${name}.json`);
  await ensureDir(dirname(file));
  try {
    if (!existsSync(file)) return fallback;
    const txt = await readFile(file, "utf-8");
    return JSON.parse(txt) as T;
  } catch {
    return fallback;
  }
}

export async function writeCollection<T>(name: string, data: T): Promise<void> {
  const file = join(ROOT, `${name}.json`);
  await ensureDir(dirname(file));
  await writeFile(file, JSON.stringify(data, null, 2), "utf-8");
}

export async function appendJsonl(name: string, record: unknown): Promise<void> {
  const file = join(ROOT, `${name}.jsonl`);
  await ensureDir(dirname(file));
  const line = JSON.stringify({ ...(record as object), ts: Date.now() }) + "\n";
  const { appendFile } = await import("node:fs/promises");
  await appendFile(file, line, "utf-8");
}

export async function readJsonl<T>(name: string, limit = 100): Promise<T[]> {
  const file = join(ROOT, `${name}.jsonl`);
  if (!existsSync(file)) return [];
  const txt = await readFile(file, "utf-8");
  return txt
    .split("\n")
    .filter(Boolean)
    .slice(-limit)
    .reverse()
    .map((l) => JSON.parse(l) as T);
}

export async function listSkills(): Promise<string[]> {
  const dir = join(process.cwd(), ".skills");
  await ensureDir(dir);
  return readdir(dir);
}

export { ROOT as STORE_ROOT };
