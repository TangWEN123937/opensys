import { test, expect } from "@playwright/test";

test.describe("Landing", () => {
  test("Hero CTA『启动自驾』→ 跳转 /dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("你的").first()).toBeVisible();

    const cta = page.getByRole("link", { name: /启动自驾/ });
    await expect(cta).toBeVisible();
    await cta.click();

    await page.waitForURL("**/dashboard", { timeout: 10_000 });
    expect(page.url()).toContain("/dashboard");
    await expect(page.getByRole("heading", { name: /小红书/ })).toBeVisible();
  });

  test("顶部 pill nav · 『工作台』链接可用", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("banner");
    const link = nav.getByRole("link", { name: "工作台" });
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL("**/dashboard");
  });

  test("Pricing 区可见 · 专业版卡片渐变亮", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("banner");
    await nav.getByRole("link", { name: "定价" }).click();
    await page.waitForTimeout(800);
    await expect(page.getByText("专业版").first()).toBeVisible();
    await expect(page.getByText("按动作付费，不按座位。")).toBeVisible();
  });
});
