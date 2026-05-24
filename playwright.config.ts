import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Only run smoke tests when services are running (not in default CI build)
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : {
        command: "echo 'E2E server must be running externally. Set E2E_SKIP_WEBSERVER=1 if not.'",
        url: process.env.E2E_BASE_URL || "http://127.0.0.1:3000",
        reuseExistingServer: true,
        timeout: 10_000,
      },
});
