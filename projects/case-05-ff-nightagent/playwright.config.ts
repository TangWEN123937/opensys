import { defineConfig, devices } from "@playwright/test";

/**
 * FF-Autopilot · Playwright E2E 配置
 *
 * 约定：
 *   - 默认 baseURL http://127.0.0.1:3333 （已跑着的 dev server）
 *   - 用系统 Chrome（channel: 'chrome'），避免 download chromium
 *   - 单进程顺序执行，避免多 run 竞争内存 store
 *   - 超时宽松，SSE 流式动辄 15-30s
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3333",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: "chromium-system",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
