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
  // Responsive projects exist ONLY for the identity-lens spec. The six
  // topology specs keep running exactly as they did, on desktop, because their
  // geometry assertions are written for that width -- widening them here would
  // change what they mean rather than add coverage.
  //
  // Viewport + hasTouch rather than a device descriptor: the descriptors for
  // phones and tablets carry `defaultBrowserType: "webkit"`, and CI installs
  // chromium only (fixture-e2e.yml). A webkit project would not run.
  projects: [
    { name: "desktop" },
    {
      name: "tablet",
      testMatch: ["**/identity-lens-fixture.spec.ts"],
      use: { viewport: { width: 834, height: 1112 }, hasTouch: true },
    },
    {
      name: "mobile",
      testMatch: ["**/identity-lens-fixture.spec.ts"],
      use: { viewport: { width: 390, height: 844 }, hasTouch: true },
    },
  ],
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
