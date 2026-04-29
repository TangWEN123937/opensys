"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useBackendRun · /demo/run 的后端数据源 hook
 *
 * 生命周期：
 *   mount    → POST /api/runs  → 拿到 runId
 *   runId↑   → open EventSource /api/runs/:id/events
 *   events   → 累积到 state · 驱动 UI 渲染
 *   unmount  → close SSE
 *
 * 按 always-cool-first-paint 规范：
 *   - 默认 enabled · 即刻尝试连接后端
 *   - init 失败 / 运行时错 → state="error" · 调用方降级到 client 脚本
 *
 * 所有 action 调用对应 REST：POST /advance · /approve · /pause
 */

export interface RemoteEvent {
  seq: number;
  type: string;
  step_no: number | null;
  payload: Record<string, unknown>;
  created_at: number;
}

export type RemoteState =
  | "connecting"
  | "running"
  | "paused"
  | "awaiting_approval"
  | "done"
  | "error";

interface Options {
  enabled?: boolean;
  scenario?: string;
  speed?: number;
  autoPlay?: boolean;
}

export interface UseBackendRun {
  runId: string | null;
  state: RemoteState;
  currentIndex: number;       // 0-indexed
  events: RemoteEvent[];
  latestEvent: RemoteEvent | null;
  totalSteps: number;
  sseConnected: boolean;
  error: string | null;
  speed: number;
  actions: {
    advance: () => Promise<void>;
    approve: () => Promise<void>;
    reject: () => Promise<void>;
    pause: () => Promise<void>;
    resume: () => Promise<void>;
    reset: (opts?: { speed?: number; autoPlay?: boolean }) => Promise<void>;
    setSpeed: (s: number) => Promise<void>;
  };
}

const TOTAL_STEPS = 10;

export function useBackendRun(opts: Options = {}): UseBackendRun {
  const {
    enabled = true,
    scenario = "ecom-dm",
    speed: initialSpeed = 3,
    autoPlay = true,
  } = opts;

  const [runId, setRunId] = useState<string | null>(null);
  const [state, setState] = useState<RemoteState>(
    enabled ? "connecting" : "error"
  );
  const [events, setEvents] = useState<RemoteEvent[]>([]);
  const [sseConnected, setSseConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeedState] = useState(initialSpeed);
  const [autoPlayFlag, setAutoPlayFlag] = useState(autoPlay);

  const esRef = useRef<EventSource | null>(null);
  const initRef = useRef(false);          // 防 StrictMode 双挂载

  const closeSse = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setSseConnected(false);
  }, []);

  const openSse = useCallback((id: string) => {
    closeSse();
    const es = new EventSource(`/api/runs/${id}/events`);
    esRef.current = es;
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.onmessage = (msg) => {
      try {
        const ev = JSON.parse(msg.data) as RemoteEvent;
        setEvents((prev) => [...prev, ev]);
        switch (ev.type) {
          case "approval_required":
            setState("awaiting_approval");
            break;
          case "approved":
          case "step_start":
          case "step_done":
            setState("running");
            break;
          case "rejected":
            setState("paused");
            break;
          case "run_done":
            setState("done");
            es.close();
            setSseConnected(false);
            break;
        }
      } catch {
        /* ignore bad json */
      }
    };
  }, [closeSse]);

  const postCreate = useCallback(
    async (spd: number, ap: boolean): Promise<string> => {
      const r = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario, speed: spd, auto_play: ap }),
      });
      if (!r.ok) throw new Error(`POST /api/runs failed ${r.status}`);
      const run = (await r.json()) as { id: string };
      return run.id;
    },
    [scenario]
  );

  const reset = useCallback(
    async (overrides?: { speed?: number; autoPlay?: boolean }) => {
      closeSse();
      setEvents([]);
      setRunId(null);
      setState("connecting");
      const nextSpeed = overrides?.speed ?? speed;
      const nextAuto = overrides?.autoPlay ?? autoPlayFlag;
      try {
        const id = await postCreate(nextSpeed, nextAuto);
        setRunId(id);
        setSpeedState(nextSpeed);
        setAutoPlayFlag(nextAuto);
        setState(nextAuto ? "running" : "paused");
        setError(null);
        openSse(id);
      } catch (e) {
        setState("error");
        setError(String(e));
      }
    },
    [closeSse, openSse, postCreate, speed, autoPlayFlag]
  );

  // Initial mount
  useEffect(() => {
    if (!enabled || initRef.current) return;
    initRef.current = true;
    (async () => {
      try {
        const id = await postCreate(initialSpeed, autoPlay);
        setRunId(id);
        setState(autoPlay ? "running" : "paused");
        setError(null);
        openSse(id);
      } catch (e) {
        setState("error");
        setError(String(e));
      }
    })();
    return closeSse;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  /* ─── currentIndex derived from events ─── */
  const currentIndex = (() => {
    let latestStep = 0;
    for (const e of events) {
      if (e.type === "step_start" && typeof e.step_no === "number") {
        latestStep = e.step_no;
      }
    }
    return Math.max(0, latestStep - 1); // 0-indexed
  })();

  /* ─── Actions ─── */
  const advance = useCallback(async () => {
    if (!runId) return;
    await fetch(`/api/runs/${runId}/advance`, { method: "POST" });
  }, [runId]);

  const approve = useCallback(async () => {
    if (!runId) return;
    await fetch(`/api/runs/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });
  }, [runId]);

  const reject = useCallback(async () => {
    if (!runId) return;
    await fetch(`/api/runs/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "reject" }),
    });
  }, [runId]);

  const pause = useCallback(async () => {
    if (!runId) return;
    await fetch(`/api/runs/${runId}/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pause" }),
    });
    setState("paused");
  }, [runId]);

  const resume = useCallback(async () => {
    if (!runId) return;
    // 若当前后端状态是 idle/paused → resume
    // 若 done · reset 重建
    if (state === "done") {
      await reset({ autoPlay: true });
      return;
    }
    await fetch(`/api/runs/${runId}/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resume" }),
    });
    setState("running");
  }, [runId, state, reset]);

  const setSpeed = useCallback(
    async (s: number) => {
      await reset({ speed: s });
    },
    [reset]
  );

  const latestEvent = events[events.length - 1] ?? null;

  return {
    runId,
    state,
    currentIndex,
    events,
    latestEvent,
    totalSteps: TOTAL_STEPS,
    sseConnected,
    error,
    speed,
    actions: { advance, approve, reject, pause, resume, reset, setSpeed },
  };
}
