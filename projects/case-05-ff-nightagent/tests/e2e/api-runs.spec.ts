import { test, expect } from "@playwright/test";

test.describe("API · /api/runs 端到端", () => {
  test("POST /api/runs · 创建 + GET 返回 summary", async ({ request }) => {
    const r = await request.post("/api/runs", {
      data: { scenario: "ecom-dm", speed: 8, auto_play: false },
    });
    expect(r.status()).toBe(201);
    const run = await r.json();
    expect(run.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(run.state).toBe("running");
    expect(run.total_steps).toBe(10);

    const g = await request.get(`/api/runs/${run.id}`);
    expect(g.status()).toBe(200);
    const detail = await g.json();
    expect(Array.isArray(detail.events)).toBe(true);
  });

  test("POST /api/runs/:id/advance · 手动推进 · events 增加", async ({ request }) => {
    const run = await (
      await request.post("/api/runs", {
        data: { speed: 1, auto_play: false },
      })
    ).json();

    for (let i = 0; i < 3; i++) {
      const r = await request.post(`/api/runs/${run.id}/advance`);
      expect(r.status()).toBe(200);
    }

    const detail = await (await request.get(`/api/runs/${run.id}`)).json();
    expect(detail.current_step).toBe(3);
    expect(detail.events.length).toBeGreaterThanOrEqual(10); // 1 run_started + 3 * 6
  });

  test("404 for unknown run id", async ({ request }) => {
    const r = await request.get("/api/runs/nonexistent");
    expect(r.status()).toBe(404);
  });

  test("advance 到 approval 后 · POST approve · state 变为 running 再到 done", async ({
    request,
  }) => {
    const run = await (
      await request.post("/api/runs", {
        data: { speed: 1, auto_play: false },
      })
    ).json();

    // advance 9 步到 approval
    for (let i = 0; i < 9; i++) {
      await request.post(`/api/runs/${run.id}/advance`);
    }

    let detail = await (await request.get(`/api/runs/${run.id}`)).json();
    expect(detail.state).toBe("awaiting_approval");

    // approve
    const ar = await request.post(`/api/runs/${run.id}/approve`, {
      data: { decision: "approve" },
    });
    expect(ar.status()).toBe(200);

    // 手动模式下 approve 推进到 step 10 · 再 advance 一次跑完最后一步
    await request.post(`/api/runs/${run.id}/advance`);

    detail = await (await request.get(`/api/runs/${run.id}`)).json();
    expect(detail.state).toBe("done");
    expect(detail.current_step).toBe(10);

    const types = detail.events.map((e: { type: string }) => e.type);
    for (const required of ["run_started", "approval_required", "approved", "run_done"]) {
      expect(types).toContain(required);
    }
  });

  test("SSE · 消费完整流到 run_done（用原生 fetch 流式）", async ({ request }) => {
    const run = await (
      await request.post("/api/runs", {
        data: { speed: 16, auto_play: true },
      })
    ).json();

    // 用原生 fetch 读 stream（Playwright request.get 会等 body 结束 · 不适合 SSE）
    const res = await fetch(`http://127.0.0.1:3333/api/runs/${run.id}/events`, {
      signal: AbortSignal.timeout(25_000),
    });
    expect(res.ok).toBe(true);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const types = new Set<string>();
    let approvalPosted = false;
    let sawRunDone = false;

    outer: while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        try {
          const ev = JSON.parse(line.slice(5).trim());
          types.add(ev.type);
          if (ev.type === "approval_required" && !approvalPosted) {
            approvalPosted = true;
            await request.post(`/api/runs/${run.id}/approve`, {
              data: { decision: "approve" },
            });
          }
          if (ev.type === "run_done") {
            sawRunDone = true;
            break outer;
          }
        } catch {
          /* ignore */
        }
      }
    }

    expect(sawRunDone).toBe(true);
    for (const t of [
      "run_started",
      "step_start",
      "thought",
      "tool_call",
      "tool_result",
      "artifact",
      "step_done",
      "approval_required",
      "approved",
      "run_done",
    ]) {
      expect(types).toContain(t);
    }
  });
});
