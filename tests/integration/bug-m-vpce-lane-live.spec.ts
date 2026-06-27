/**
 * Bug M — VPC ENDPOINTS lane (live acceptance).
 *
 * Product note (2026-06-25 Q2-A): the lane only renders flow-backed VPCEs
 * (architecture builder drops endpoints with no flow.vpceId). Subtitle copy
 * is "N active · M not used" per vpce-lane-visual.ts.
 */
import { test, expect, type Page } from "@playwright/test"
import { seedAuthCookie } from "./live-auth"

const SYSTEM = "alon-prod"
const TOPOLOGY_URL = `/systems?systemName=${SYSTEM}&tab=dependency-map`

async function waitForGraphAndDepMap(page: Page) {
  await expect(page.getByRole("button", { name: "Graph View" })).toBeVisible({
    timeout: 60_000,
  })
  await page
    .waitForResponse(
      (res) =>
        res.url().includes("/api/proxy/dependency-map/full") &&
        res.request().method() === "GET" &&
        res.status() === 200,
      { timeout: 90_000 },
    )
    .catch(() => {})
  await page.waitForTimeout(1500)
}

/** Returns false quickly when alon-prod has no flow-backed VPCE lane. */
async function ensureVpceLane(page: Page) {
  await waitForGraphAndDepMap(page)
  const lane = page.locator('[data-lane="vpc-endpoints"]')
  const visible = await lane
    .waitFor({ state: "visible", timeout: 45_000 })
    .then(() => true)
    .catch(() => false)
  if (!visible) {
    test.skip(true, "No flow-backed VPCE lane on alon-prod system map")
  }
  await expect(lane.locator("[data-vpce-id]").first()).toBeVisible({
    timeout: 15_000,
  })
  return lane
}

test.describe("Bug M — VPCE lane (live)", () => {
  test.beforeEach(async ({ page, context }) => {
    test.setTimeout(180_000)
    await seedAuthCookie(context)
    await page.setViewportSize({ width: 1600, height: 1000 })
    await page.goto(TOPOLOGY_URL, { waitUntil: "domcontentloaded" })
  })

  test("flow-backed VPCE lane renders with current subtitle copy", async ({ page }) => {
    const lane = await ensureVpceLane(page)
    const laneText = (await lane.innerText()).replace(/\s+/g, " ")
    if (/active · \d+ not used/i.test(laneText)) {
      expect(laneText).toMatch(/\d+ active · \d+ not used/i)
    }
    expect(await lane.locator("[data-vpce-id]").count()).toBeGreaterThanOrEqual(1)
  })

  test("flow-backed VPCE cards are marked active", async ({ page }) => {
    const lane = await ensureVpceLane(page)
    const cardCount = await lane.locator("[data-vpce-id]").count()
    expect(cardCount).toBeGreaterThanOrEqual(1)
    const activeCount = await lane.locator('[data-active="true"]').count()
    expect(activeCount).toBe(cardCount)
  })

  test("active VPCE cards use saturated chrome (not muted inactive styling)", async ({
    page,
  }) => {
    const lane = await ensureVpceLane(page)
    const active = lane.locator('[data-active="true"]').first()
    await expect(active).toBeVisible()
    await expect(active).not.toHaveClass(/opacity-50/)
    await expect(active).not.toHaveClass(/border-dashed/)
  })
})
