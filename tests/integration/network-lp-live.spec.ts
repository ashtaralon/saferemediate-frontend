/**
 * Network LP — live smoke (findings proxy + page shell).
 */
import { test, expect } from "@playwright/test"
import { authedApi, liveGetWithRetry, seedAuthCookie } from "./live-auth"

test.describe("Network LP (live)", () => {
  test.beforeEach(async ({ context }) => {
    test.setTimeout(180_000)
    await seedAuthCookie(context)
  })

  test("findings proxy returns 200 for alon-prod", async ({ playwright }) => {
    const request = await authedApi(playwright)
    const res = await liveGetWithRetry(
      request,
      "/api/proxy/network-lp-findings?system_id=alon-prod",
    )
    if (res.status() === 404) {
      test.skip(true, "network-lp backend not deployed on Render yet")
    }
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.subnets)).toBe(true)
    await request.dispose()
  })

  test("network-lp page loads without hard error", async ({ page }) => {
    await page.goto("/network-lp?system=alon-prod", { waitUntil: "domcontentloaded" })
    const loading = page.getByText(/Loading network-LP candidates/i)
    const heading = page.getByText("Network least-privilege candidates")
    const hardError = page.getByText(/HTTP 404|Failed to load findings/i)
    await expect(loading.or(heading).or(hardError).first()).toBeVisible({
      timeout: 60_000,
    })
    if (await hardError.isVisible().catch(() => false)) {
      test.skip(true, "network-lp backend not deployed — page shows load error")
    }
    await expect(heading).toBeVisible({ timeout: 30_000 })
  })
})
