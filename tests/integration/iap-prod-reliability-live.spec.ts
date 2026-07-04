/**
 * IAP prod reliability — P0 acceptance pins (cyntro_attack-paths_PROD-RELIABILITY).
 *
 * Proves alon-prod Attack Paths data loads without a browser-visible 500 and
 * returns non-empty crown jewels within the latency ceiling on a warm read.
 */
import { test, expect } from "@playwright/test"
import { authedApi, liveBaseUrl, liveGetWithRetry, seedAuthCookie } from "./live-auth"
import { ALON_PROD, FACADE_IAP_QUERY } from "./live-attack-path-pins"

const SYSTEM = process.env.IAP_RELIABILITY_SYSTEM || ALON_PROD
const WARM_LATENCY_CEILING_MS = Number(process.env.IAP_WARM_CEILING_MS || 15_000)

test.describe("IAP prod reliability", () => {
  test.beforeEach(async ({ context }) => {
    await seedAuthCookie(context)
  })

  test("identity-attack-paths proxy returns 200 with crown jewels", async ({
    playwright,
  }) => {
    test.setTimeout(120_000)
    const api = await authedApi(playwright)
    try {
      const t0 = Date.now()
      const res = await liveGetWithRetry(
        api,
        `/api/proxy/identity-attack-paths/${SYSTEM}${FACADE_IAP_QUERY}`,
        4,
        55_000,
      )
      const elapsed = Date.now() - t0
      expect(res.status(), `IAP status ${res.status()}`).toBe(200)
      const body = (await res.json()) as {
        crown_jewels?: unknown[]
        paths?: unknown[]
        error?: string
        fromStaleCache?: boolean
        from_snapshot?: boolean
      }
      expect(body.error, "must not return error envelope on 200").toBeFalsy()
      const jewelCount = (body.crown_jewels ?? []).length
      const pathCount = (body.paths ?? []).length
      expect(
        jewelCount + pathCount,
        "non-empty attack surface (jewels or paths)",
      ).toBeGreaterThan(0)
      expect(elapsed, "warm read latency ceiling").toBeLessThan(WARM_LATENCY_CEILING_MS)
    } finally {
      await api.dispose()
    }
  })

  test("Attack Paths tab loads without 500 error card", async ({ page, context }) => {
    test.setTimeout(120_000)
    await seedAuthCookie(context)
    await page.goto(
      `${liveBaseUrl()}/systems?systemName=${SYSTEM}&tab=attack-paths&jewel=${encodeURIComponent("arn:aws:s3:::saferemediate-logs-745783559495")}`,
      { waitUntil: "domcontentloaded" },
    )
    await page.waitForTimeout(12_000)
    await expect(page.getByText(/500.*Unable to retrieve routing information/i)).toHaveCount(0)
    await expect(page.getByText(/Attack paths not computed yet/i)).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Attack Path", exact: true })).toBeVisible({
      timeout: 60_000,
    })
  })
})
