import { test, expect, Page } from "@playwright/test";

/**
 * /demo/run 剧本播放 E2E · 覆盖全部播放控件 + 审批链路
 *
 * 工程学笔记：
 *   Next.js 16 Turbopack dev + React 19 在首次访问时 client hydration 有延迟
 *   Playwright 的 .click() simulated mouse 在 hydration 未完成时会 "打到空气"
 *   解决：用 forceClick() helper 等 testid 可用 + waitForFunction DOM click
 */

async function gotoAndHydrate(page: Page) {
  await page.goto("/demo/run?source=client");
  // 等 data-hydrated=true（组件 useEffect 设置 · 保证 handler 已绑定）
  await expect(page.getByTestId("demo-root")).toHaveAttribute(
    "data-hydrated",
    "true",
    { timeout: 15_000 }
  );
}

/** 用原生 DOM click 触发 React 事件 · 绕过 Playwright simulated mouse 的时序坑 */
async function clickById(page: Page, testid: string) {
  await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as
      | HTMLButtonElement
      | HTMLAnchorElement
      | null;
    el?.click();
  }, testid);
}

async function readProgress(page: Page): Promise<string> {
  return await page.getByTestId("progress-indicator").innerText();
}

test.describe("/demo/run 剧本播放", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndHydrate(page);
  });

  test("初始状态 · 待机 · step 1 / 10 · badge 可见", async ({ page }) => {
    await expect(page.getByTestId("runner-state")).toContainText("待机");
    await expect(page.getByTestId("progress-indicator")).toHaveText("1 / 10");
    const badge = page.getByTestId("mode-badge");
    await expect(badge).toBeVisible();
    const mode = await badge.getAttribute("data-mode");
    expect(["mock", "real"]).toContain(mode);
  });

  test("点『下一步』×2 → 进度 3/10 + 右侧切到客户画像", async ({ page }) => {
    await clickById(page, "btn-next");
    await expect(page.getByTestId("progress-indicator")).toHaveText("2 / 10");
    await clickById(page, "btn-next");
    await expect(page.getByTestId("progress-indicator")).toHaveText("3 / 10");
    await expect(page.getByText("张小姐").first()).toBeVisible();
  });

  test("点『播放』→ 运行中 · 等 3s 后自动前进", async ({ page }) => {
    await clickById(page, "btn-play-pause");
    await expect(page.getByTestId("runner-state")).toContainText("运行中");
    await page.waitForTimeout(3500);
    const text = await readProgress(page);
    const [cur] = text.split("/").map((x) => parseInt(x.trim(), 10));
    expect(cur).toBeGreaterThan(1);
  });

  test("速度切换 · 点 4x 后高亮", async ({ page }) => {
    await clickById(page, "btn-speed-4");
    await expect(page.getByTestId("btn-speed-4")).toHaveClass(/text-alive/);
  });

  test("step ledger · 直接点 step 5 跳转 · 右侧切到尺码推荐", async ({ page }) => {
    await clickById(page, "step-row-5");
    await expect(page.getByTestId("progress-indicator")).toHaveText("5 / 10");
    await expect(page.getByText("尺码推荐").first()).toBeVisible();
  });

  test("重置按钮 · 回到 step 1 / 待机", async ({ page }) => {
    await clickById(page, "btn-next");
    await clickById(page, "btn-next");
    await clickById(page, "btn-reset");
    await expect(page.getByTestId("progress-indicator")).toHaveText("1 / 10");
    await expect(page.getByTestId("runner-state")).toContainText("待机");
  });

  test("审批链路 · step 9 → HITL → 点『审核并发送』→ 进入 step 10", async ({ page }) => {
    await clickById(page, "step-row-9");
    await expect(page.getByTestId("progress-indicator")).toHaveText("9 / 10");
    // 播放 · 让它立即进入 awaiting_approval
    await clickById(page, "btn-play-pause");
    await expect(page.getByTestId("runner-state")).toContainText("等待审批", {
      timeout: 8000,
    });
    await expect(page.getByTestId("btn-approve")).toBeVisible();
    await clickById(page, "btn-approve");
    await expect(page.getByTestId("progress-indicator")).toHaveText("10 / 10", {
      timeout: 8000,
    });
  });
});
