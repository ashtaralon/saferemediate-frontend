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
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.subnets)).toBe(true)
    await request.dispose()
  })

  test("network-lp page loads without hard error", async ({ page }) => {
    await page.goto("/network-lp?system=alon-prod", { waitUntil: "domcontentloaded" })
    await expect(page.getByText("Network least-privilege candidates")).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByText(/Failed to load|HTTP 5\d\d/i)).not.toBeVisible()
  })
})
