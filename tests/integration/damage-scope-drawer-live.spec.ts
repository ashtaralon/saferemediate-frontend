/**
 * LIVE Playwright — damage-scope drawer on attack-paths-v2 (rule #72).
 * Requires FRONTEND_URL (or localhost:3000) and deployed backend damage-scope route.
 */
import { test, expect } from "@playwright/test"

const SYSTEM = "alon-prod"
const PATH_ID = "path-5203dfee3012"
const BUCKET_LABEL = /saferemediate-logs/i

test.describe("damage-scope drawer live", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(180_000)
    await page.goto(
      `/attack-paths-v2?system=${SYSTEM}&path=${PATH_ID}&mode=attack-path`,
      { waitUntil: "domcontentloaded" },
    )
    await page.waitForTimeout(8000)
  })

  test("drawer opens with web-traffic observed scope for S3 fixture", async ({
    page,
  }) => {
    const bucket = page.getByText(BUCKET_LABEL).first()
    if ((await bucket.count()) === 0) {
      test.skip(true, "saferemediate-logs node not visible on canvas — pick new fixture")
    }
    await bucket.click()
    const drawer = page.getByTestId("damage-scope-drawer")
    await expect(drawer).toBeVisible({ timeout: 60_000 })
    await expect(drawer.getByText(/web-traffic/i)).toBeVisible()
    await expect(page.getByTestId("damage-scope-cta")).toBeVisible()
  })

  test("modal shows LP confidence breakdown", async ({ page }) => {
    const bucket = page.getByText(BUCKET_LABEL).first()
    if ((await bucket.count()) === 0) {
      test.skip(true, "saferemediate-logs node not visible")
    }
    await bucket.click()
    await page.getByTestId("damage-scope-cta").click({ timeout: 60_000 })
    const modal = page.getByTestId("damage-scope-approval-modal")
    await expect(modal).toBeVisible()
    await expect(page.getByTestId("lp-confidence-score")).toBeVisible()
    await expect(page.getByTestId("lp-confidence-level")).toBeVisible()
  })

  test("shadow button calls iam remediate with mode shadow", async ({ page }) => {
    const bucket = page.getByText(BUCKET_LABEL).first()
    if ((await bucket.count()) === 0) {
      test.skip(true, "saferemediate-logs node not visible")
    }
    await bucket.click()
    await page.getByTestId("damage-scope-cta").click({ timeout: 60_000 })

    const remediatePromise = page.waitForRequest(
      (req) =>
        req.url().includes("/api/proxy/iam-roles/remediate") &&
        req.method() === "POST",
      { timeout: 60_000 },
    )

    await page.getByTestId("run-shadow-btn").click()
    const req = await remediatePromise
    const body = req.postDataJSON() as { mode?: string }
    expect(body.mode).toBe("shadow")
  })
})
