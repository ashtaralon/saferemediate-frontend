import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "tests/integration",
  // *-live.spec.ts reach a deployed frontend/backend; *-fixture.spec.ts are
  // deterministic browser geometry specs that intercept the topology routes
  // (tests/integration/topology-fixture.ts) and need only a running app.
  testMatch: ["*-live.spec.ts", "*-fixture.spec.ts"],
  // Vitest live/API specs share tests/integration; keep them off the Playwright glob.
  testIgnore: ["**/*.vitest.spec.ts"],
  timeout: 180_000,
  use: {
    baseURL: process.env.FRONTEND_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    // Google Chrome by default (matches the live specs); PW_CHANNEL=chromium
    // lets CI drive the Playwright-installed Chromium instead.
    ...(process.env.PW_CHANNEL === "chromium" ? {} : { channel: "chrome" }),
  },
})
