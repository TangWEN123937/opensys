import { test, expect } from "@playwright/test";

test.describe("Dashboard · Sidebar nav", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("FF-").first()).toBeVisible();
  });

  test("sidebar → 审批 · 可点跳", async ({ page }) => {
    await page.getByRole("link", { name: /^审批/ }).first().click();
    await page.waitForURL("**/approvals");
    await expect(page.getByRole("heading", { name: "审批收件箱" })).toBeVisible();
  });

  test("sidebar → 计划任务", async ({ page }) => {
    await page.getByRole("link", { name: /^计划任务/ }).click();
    await page.waitForURL("**/schedules");
    await expect(page.getByRole("heading", { name: "计划任务" })).toBeVisible();
  });

  test("sidebar → Agents 与 MCP · 工具列表可见", async ({ page }) => {
    await page.getByRole("link", { name: /Agents 与 MCP/ }).click();
    await page.waitForURL("**/agents");
    await expect(page.getByText("xiaohongshu-api").first()).toBeVisible();
    await expect(page.getByText("skyvern-browser").first()).toBeVisible();
  });

  test("sidebar → 设置 · 品牌语气 textarea 可见", async ({ page }) => {
    await page.getByRole("link", { name: /^设置/ }).click();
    await page.waitForURL("**/settings");
    await expect(page.getByText("品牌语气")).toBeVisible();
    await expect(page.getByText("自主边界")).toBeVisible();
  });

  test("顶部『审计回放』→ /goals/[id]/timeline", async ({ page }) => {
    await page.getByRole("link", { name: /审计回放/ }).click();
    await page.waitForURL("**/timeline");
    await expect(page.getByText(/全部事件/)).toBeVisible();
  });

  test("顶部『观看剧本演示』→ /demo/run", async ({ page }) => {
    await page.getByRole("link", { name: /观看剧本演示/ }).click();
    await page.waitForURL("**/demo/run**");
  });

  test("Sidebar『剧本演示』LIVE 徽章 · 直达", async ({ page }) => {
    const demoLink = page
      .getByRole("complementary")
      .getByRole("link", { name: /剧本演示/ });
    await expect(demoLink).toBeVisible();
    await demoLink.click();
    await page.waitForURL("**/demo/run**");
  });
});
