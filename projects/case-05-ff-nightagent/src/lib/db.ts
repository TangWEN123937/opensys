/**
 * 轻量 in-memory store · 接口模仿 better-sqlite3 (prepare/get/all/run/exec)
 *
 * 原因：Node v25 下 better-sqlite3 native binding 需额外 rebuild 流程，
 *       对 MVP 教学 demo 不值得。用 Map 持久化到进程内，
 *       重启即重置，反而让 demo 节奏更干净。
 *
 * 如需落盘持久化，swap 本文件为 better-sqlite3 实现即可，其他代码零修改。
 */

import fs from "node:fs";
import path from "node:path";

type Row = Record<string, unknown>;

interface Store {
  runs: Map<string, Row>;
  events: Array<Row>; // flat array · 查询时 filter
  eventIdSeq: number;
}

const DB_DIR = path.join(process.cwd(), "data");

const _store: Store = {
  runs: new Map<string, Row>(),
  events: [],
  eventIdSeq: 0,
};

// 确保 data/ 存在（供将来落盘用）
try {
  fs.mkdirSync(DB_DIR, { recursive: true });
} catch {
  /* ignore */
}

/* ─────────── Statement shim ─────────── */

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Statement {
  get: (...args: any[]) => Row | undefined;
  all: (...args: any[]) => Row[];
  run: (...args: any[]) => { changes: number; lastInsertRowid: number };
}

function prepare(sql: string): Statement {
  const q = sql.replace(/\s+/g, " ").trim();

  // runs: INSERT
  if (/^INSERT INTO runs/i.test(q)) {
    return {
      run: (params: Row) => {
        _store.runs.set(params.id as string, { ...params });
        return { changes: 1, lastInsertRowid: 0 };
      },
      get: () => undefined,
      all: () => [],
    };
  }

  // runs: UPDATE
  if (/^UPDATE runs SET/i.test(q)) {
    const fieldMatch = q.match(/SET\s+([\s\S]+?)\s+WHERE/i);
    const fields = fieldMatch
      ? fieldMatch[1]
          .split(",")
          .map((p) => p.trim().split("=")[0].trim())
      : [];
    return {
      run: (params: Row) => {
        const id = params.id as string;
        const row = _store.runs.get(id);
        if (!row) return { changes: 0, lastInsertRowid: 0 };
        for (const f of fields) {
          if (f in params) row[f] = params[f];
        }
        if ("updated_at" in params) row.updated_at = params.updated_at;
        return { changes: 1, lastInsertRowid: 0 };
      },
      get: () => undefined,
      all: () => [],
    };
  }

  // runs: SELECT * / LIST
  if (/^SELECT .+ FROM runs WHERE id/i.test(q)) {
    return {
      get: (id: unknown) => _store.runs.get(id as string),
      all: () => [],
      run: () => ({ changes: 0, lastInsertRowid: 0 }),
    };
  }
  if (/^SELECT .+ FROM runs/i.test(q)) {
    return {
      all: () =>
        [..._store.runs.values()].sort(
          (a, b) => (b.created_at as number) - (a.created_at as number)
        ),
      get: () => undefined,
      run: () => ({ changes: 0, lastInsertRowid: 0 }),
    };
  }

  // events: INSERT
  if (/^INSERT INTO events/i.test(q)) {
    return {
      run: (
        run_id: unknown,
        seq: unknown,
        step_no: unknown,
        type: unknown,
        payload: unknown,
        created_at: unknown
      ) => {
        _store.events.push({
          id: ++_store.eventIdSeq,
          run_id,
          seq,
          step_no,
          type,
          payload,
          created_at,
        });
        return { changes: 1, lastInsertRowid: _store.eventIdSeq };
      },
      get: () => undefined,
      all: () => [],
    };
  }

  // events: COUNT
  if (/^SELECT COUNT\(\*\) as c FROM events WHERE run_id/i.test(q)) {
    return {
      get: (runId: unknown) => ({
        c: _store.events.filter((e) => e.run_id === runId).length,
      }),
      all: () => [],
      run: () => ({ changes: 0, lastInsertRowid: 0 }),
    };
  }

  // events: MAX seq
  if (/^SELECT MAX\(seq\) as s FROM events WHERE run_id/i.test(q)) {
    return {
      get: (runId: unknown) => {
        const rows = _store.events.filter((e) => e.run_id === runId);
        return {
          s: rows.length ? Math.max(...rows.map((e) => e.seq as number)) : null,
        };
      },
      all: () => [],
      run: () => ({ changes: 0, lastInsertRowid: 0 }),
    };
  }

  // events: SELECT by run_id + seq filter
  if (/^SELECT .+ FROM events WHERE run_id = \? AND seq > \?/i.test(q)) {
    return {
      all: (runId: unknown, sinceSeq: unknown) =>
        _store.events
          .filter(
            (e) =>
              e.run_id === runId && (e.seq as number) > (sinceSeq as number)
          )
          .sort((a, b) => (a.seq as number) - (b.seq as number))
          .map((e) => ({
            seq: e.seq,
            type: e.type,
            step_no: e.step_no,
            payload: e.payload,
            created_at: e.created_at,
          })),
      get: () => undefined,
      run: () => ({ changes: 0, lastInsertRowid: 0 }),
    };
  }

  // DELETE (for reset)
  if (/^DELETE FROM/i.test(q)) {
    return {
      run: () => {
        if (/events/i.test(q)) _store.events = [];
        if (/runs/i.test(q)) _store.runs.clear();
        return { changes: 0, lastInsertRowid: 0 };
      },
      get: () => undefined,
      all: () => [],
    };
  }

  // CREATE / PRAGMA · no-op
  return {
    run: () => ({ changes: 0, lastInsertRowid: 0 }),
    get: () => undefined,
    all: () => [],
  };
}

/* ─────────── Public API (compat with better-sqlite3) ─────────── */

interface Db {
  prepare: (sql: string) => Statement;
  exec: (sql: string) => void;
  pragma: (pragma: string) => void;
}

const _db: Db = {
  prepare,
  exec: () => undefined,
  pragma: () => undefined,
};

export function getDb(): Db {
  return _db;
}

export function resetDb() {
  _store.runs.clear();
  _store.events = [];
  _store.eventIdSeq = 0;
}
