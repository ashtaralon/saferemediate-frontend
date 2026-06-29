import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "tests/integration",
  testMatch: "*-live.spec.ts",
  // Vitest live/API specs share tests/integration; keep them off the Playwright glob.
  testIgnore: ["**/*.vitest.spec.ts"],
  timeout: 180_000,
  use: {
    baseURL: process.env.FRONTEND_URL || "http://localhost:3000",
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
    channel: "chrome",
  },
})
