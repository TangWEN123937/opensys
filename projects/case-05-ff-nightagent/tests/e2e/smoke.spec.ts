import { test, expect } from "@playwright/test";

/**
 * Smoke · 所有路由 200 + 首屏有预期中文/英文文案
 */

const ROUTES: Array<[string, string]> = [
  ["/", "自驾"],
  ["/dashboard", "FF-Autopilot"],
  ["/goals", "目标"],
  ["/goals/growth-plan-q2/timeline", "回放"],
  ["/approvals", "审批收件箱"],
  ["/schedules", "计划任务"],
  ["/agents", "Agents 与 MCP"],
  ["/settings", "设置"],
  ["/demo/run", "电商客服"],
];

for (const [path, expected] of ROUTES) {
  test(`GET ${path} → 200 + 首屏命中「${expected}」`, async ({ page }) => {
    const resp = await page.goto(path);
    expect(resp?.status(), `${path} HTTP status`).toBe(200);
    await expect(page.locator("body")).toContainText(expected, {
      timeout: 8000,
    });
  });
}

test("GET /api/health → 200 · ok=true", async ({ request }) => {
  const r = await request.get("/api/health");
  expect(r.status()).toBe(200);
  const j = await r.json();
  expect(j.ok).toBe(true);
  expect(j.service).toBe("ff-autopilot");
});

test("GET /api/mode → 200 · 有 mode 字段", async ({ request }) => {
  const r = await request.get("/api/mode");
  expect(r.status()).toBe(200);
  const j = await r.json();
  expect(["mock", "real"]).toContain(j.mode);
});
