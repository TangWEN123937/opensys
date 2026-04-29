import { test, expect, Page, APIRequestContext } from "@playwright/test";

/**
 * Backend-mode E2E · 验证 UI 点击 → 真 POST → DB 改 → SSE 推 → DOM 同步
 *
 * 三段式（feedback_ui_clickthrough_verification）：
 *   ① 后端 curl 通         · api-runs.spec 已覆盖
 *   ② 前端 wire 到 API     · 本文件确认 data-source=backend
 *   ③ 点击 DOM 真变         · click → 等服务端状态 → UI 反映
 */

async function gotoAndReady(page: Page) {
  await page.goto("/demo/run");
  await expect(page.getByTestId("demo-root")).toHaveAttribute(
    "data-hydrated",
    "true",
    { timeout: 15_000 }
  );
  // 等到 backend 模式（上游 POST /api/runs 完成 · data-source 变 backend）
  await expect(page.getByTestId("demo-root")).toHaveAttribute(
    "data-source",
    "backend",
    { timeout: 10_000 }
  );
}

async function latestRunId(request: APIRequestContext): Promise<string> {
  const r = await request.get("/api/runs");
  const j = await r.json();
  const items = (j.items ?? []) as Array<{ id: string; created_at: number }>;
  items.sort((a, b) => b.created_at - a.created_at);
  expect(items[0], "至少有一条 run").toBeDefined();
  return items[0].id;
}

test.describe("/demo/run · backend 双模式 · UI → API 真链路", () => {
  test("挂载即 backend 模式 · ModeBadge=真数据 · SSE 连上 · event count >0", async ({
    page,
    request,
  }) => {
    await gotoAndReady(page);

    // 顶部 badge 是"真数据"
    await expect(page.getByTestId("mode-badge")).toHaveAttribute(
      "data-mode",
      "real",
      { timeout: 6_000 }
    );

    // 给 SSE 1.5s 时间累积首批事件
    await page.waitForTimeout(1500);
    const source = await page.getByTestId("source-indicator").innerText();
    expect(source).toMatch(/backend · sse/);

    // 后端真有 run · 且 events 数 > 0
    const id = await latestRunId(request);
    const detail = await (await request.get(`/api/runs/${id}`)).json();
    expect(detail.total_steps).toBe(10);
    expect(detail.events.length).toBeGreaterThan(0);
  });

  test("UI 点 Pause → 后端 state=paused → UI runner-state=已暂停", async ({
    page,
    request,
  }) => {
    await gotoAndReady(page);
    // 等 SSE 推几个事件 · 让后端确实在 running
    await page.waitForTimeout(1500);

    const id = await latestRunId(request);
    // 点 Pause
    await page.evaluate(() => {
      (
        document.querySelector(
          '[data-testid="btn-play-pause"]'
        ) as HTMLButtonElement
      )?.click();
    });

    // UI 应显示"已暂停"
    await expect(page.getByTestId("runner-state")).toContainText("已暂停", {
      timeout: 6_000,
    });

    // 后端真 state=paused
    const detail = await (await request.get(`/api/runs/${id}`)).json();
    expect(detail.state).toBe("paused");
  });

  test("UI 点 Next → POST /advance 真触发 → 后端 current_step 增加 1", async ({
    page,
    request,
  }) => {
    await gotoAndReady(page);
    // 先 pause 不让 auto 推进干扰
    await page.evaluate(() => {
      (
        document.querySelector(
          '[data-testid="btn-play-pause"]'
        ) as HTMLButtonElement
      )?.click();
    });
    await expect(page.getByTestId("runner-state")).toContainText("已暂停", {
      timeout: 6_000,
    });

    const id = await latestRunId(request);
    const before = (await (await request.get(`/api/runs/${id}`)).json())
      .current_step as number;

    // 点 Next
    await page.evaluate(() => {
      (
        document.querySelector(
          '[data-testid="btn-next"]'
        ) as HTMLButtonElement
      )?.click();
    });
    await page.waitForTimeout(800);

    const after = (await (await request.get(`/api/runs/${id}`)).json())
      .current_step as number;
    expect(after).toBeGreaterThan(before);
  });

  test("跑到 HITL → 点 Approve → 后端 state=running 或 done", async ({
    page,
    request,
  }) => {
    await gotoAndReady(page);
    // 等后端自动推进到 HITL（需要 ~5-9 秒 · speed=3）
    await expect(page.getByTestId("runner-state")).toContainText("等待审批", {
      timeout: 15_000,
    });
    const id = await latestRunId(request);
    const before = await (await request.get(`/api/runs/${id}`)).json();
    expect(before.state).toBe("awaiting_approval");

    // 点 Approve
    await page.evaluate(() => {
      (
        document.querySelector(
          '[data-testid="btn-approve"]'
        ) as HTMLButtonElement
      )?.click();
    });
    await page.waitForTimeout(1500);

    const after = await (await request.get(`/api/runs/${id}`)).json();
    expect(["running", "done"]).toContain(after.state);
  });
});
