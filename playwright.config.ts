import { defineConfig, devices } from "@playwright/test";

// E2e runs hermetically: a local mock (e2e/mocks/upstream.mjs) stands in for
// apple.news / publisher / Wayback, selected via the wrangler `e2e` env.
// Port 5199 (not 5173) so a normally-running dev server is never reused.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5199",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "node e2e/mocks/upstream.mjs",
      url: "http://127.0.0.1:8799/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "pnpm dev --port 5199 --strictPort",
      url: "http://localhost:5199",
      reuseExistingServer: false,
      env: { CLOUDFLARE_ENV: "e2e" },
    },
  ],
});
