/**
 * LIVE Playwright — damage-scope drawer hands off to IAM LP modal (rule #72).
 * Shadow persistence uses /api/proxy/remediation/execute mode=shadow (canonical).
 */
import { test, expect } from "@playwright/test"

const SYSTEM = "alon-prod"
const PATH_ID = "path-5203dfee3012"
const ROLE_NAME = "alon-demo-ec2-role"
const BUCKET_LABEL = /saferemediate-logs/i
const SHADOW_ANNOTATION = `damage-scope:${PATH_ID}`

async function openDamageScopeDrawer(page: import("@playwright/test").Page) {
  const bucket = page.getByText(BUCKET_LABEL).first()
  if ((await bucket.count()) === 0) {
    test.skip(true, "saferemediate-logs node not visible on canvas — pick new fixture")
  }
  await bucket.click()
  const drawer = page.getByTestId("damage-scope-drawer")
  await expect(drawer).toBeVisible({ timeout: 60_000 })
  return drawer
}

test.describe("damage-scope LP modal handoff live", () => {
  test.beforeEach(async ({ page, context }) => {
    test.setTimeout(180_000)
    const base = process.env.FRONTEND_URL || "http://localhost:3000"
    await context.addCookies([
      {
        name: "cyntro_auth",
        value: "authenticated",
        domain: new URL(base).hostname,
        path: "/",
      },
    ])
    await page.goto(
      `/attack-paths-v2?system=${SYSTEM}&path=${PATH_ID}&mode=attack-path`,
      { waitUntil: "domcontentloaded" },
    )
    await page.waitForTimeout(8000)
  })

  test("drawer CTA opens existing LP modal pre-populated with path role", async ({
    page,
  }) => {
    await openDamageScopeDrawer(page)
    await page.getByTestId("damage-scope-cta").click({ timeout: 60_000 })

    const modal = page.getByTestId("iam-permission-analysis-modal")
    await expect(modal).toBeVisible({ timeout: 60_000 })
    await expect(modal.getByText(/Permission Usage/i)).toBeVisible()
    await expect(modal.getByRole("button", { name: "Simulate fix" })).toBeVisible()
    await expect(modal.getByText(ROLE_NAME)).toBeVisible()
  })

  test("canonical shadow execute persists ShadowIAMRemediation for path role", async ({
    page,
    request,
  }) => {
    await openDamageScopeDrawer(page)
    await page.getByTestId("damage-scope-cta").click({ timeout: 60_000 })
    const modal = page.getByTestId("iam-permission-analysis-modal")
    await expect(modal).toBeVisible({ timeout: 60_000 })
    await expect(modal.getByText(ROLE_NAME)).toBeVisible()

    // Simulate fix is preview-only; shadow audit uses remediation/execute mode=shadow.
    await modal.getByRole("button", { name: "Simulate fix" }).click({ timeout: 60_000 })
    await expect(page.getByText(/Simulation complete/i)).toBeVisible({ timeout: 120_000 })

    const cutoffBefore = Date.now()

    const execRes = await request.post("/api/proxy/remediation/execute", {
      data: {
        role_name: ROLE_NAME,
        mode: "shadow",
        dry_run: false,
        annotation: SHADOW_ANNOTATION,
        create_snapshot: true,
      },
    })
    expect(execRes.ok()).toBeTruthy()
    const execBody = await execRes.json()
    expect(execBody.mode === "shadow" || execBody.success === true).toBeTruthy()

    let found = false
    for (let attempt = 0; attempt < 12; attempt++) {
      const listRes = await request.get(
        `/api/proxy/remediation/shadow-records?role_name=${encodeURIComponent(ROLE_NAME)}&hours=1&limit=50`,
      )
      expect(listRes.ok()).toBeTruthy()
      const listBody = (await listRes.json()) as {
        records?: Array<{ annotation?: string; created_at?: string }>
      }
      const records = listBody.records ?? []
      found = records.some((r) => {
        if (!r.annotation?.includes(PATH_ID)) return false
        if (!r.created_at) return true
        const created = new Date(r.created_at).getTime()
        return !Number.isNaN(created) && created >= cutoffBefore - 5000
      })
      if (found) break
      await page.waitForTimeout(5000)
    }
    expect(found).toBe(true)
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
})
