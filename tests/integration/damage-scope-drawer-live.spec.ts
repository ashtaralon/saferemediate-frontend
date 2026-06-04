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

  test("drawer opens in fullscreen canvas and is inside fullscreen subtree", async ({
    page,
  }) => {
    let target = page.locator("[data-resource-id]").filter({ hasText: BUCKET_LABEL }).first()
    if ((await target.count()) === 0) {
      target = page.getByText(BUCKET_LABEL).first()
    }
    if ((await target.count()) === 0) {
      test.skip(true, "saferemediate-logs node not visible on canvas")
    }

    await page.getByTestId("canvas-fullscreen-toggle").click()
    await page.waitForFunction(() => !!document.fullscreenElement, null, {
      timeout: 15_000,
    })

    await target.click()

    const drawer = page.getByTestId("damage-scope-drawer")
    await expect(drawer).toBeVisible({ timeout: 60_000 })
    await expect(drawer.getByText("Damage scope")).toBeVisible()
    await expect(drawer.getByTestId("damage-reduction-badge")).toBeVisible()

    const insideFullscreen = await page.evaluate(() => {
      const fs = document.fullscreenElement
      const el = document.querySelector('[data-testid="damage-scope-drawer"]')
      return !!(fs && el && fs.contains(el))
    })
    expect(insideFullscreen).toBe(true)

    await page.getByRole("button", { name: "Close" }).first().click()
    await expect(drawer).not.toBeVisible({ timeout: 10_000 })

    await page.evaluate(() => document.exitFullscreen())
    await page.waitForFunction(() => !document.fullscreenElement, null, {
      timeout: 10_000,
    })
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
