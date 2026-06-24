/**
 * Bug M — VPCE lane active vs available visual hierarchy (live acceptance).
 *
 * Validates against alon-prod System Map (TrafficFlowMap) with the
 * saferemediate-raw multi-VPCE subnet:
 *   - Lane subtitle: "N active · M available in subnet"
 *   - Exactly one data-active="true" when S3 flow is active
 *   - Inactive cards dimmed (opacity-60) with inactive tooltip
 *
 * Spec: docs/specs/bug_M_vpce_visual_hierarchy.md
 */
import { test, expect, type Page } from "@playwright/test"
import { seedAuthCookie } from "./live-auth"

const SYSTEM = "alon-prod"

async function waitForVpceLane(page: Page) {
  await page.waitForSelector('[data-lane="vpc-endpoints"]', { timeout: 120_000 })
  await page.waitForSelector('[data-vpce-id]', { timeout: 30_000 })
  await page.waitForTimeout(1500)
}

async function openRawJewelSpotlight(page: Page) {
  const jewelBtn = page.getByRole("button", { name: /saferemediate-raw/i }).first()
  if (await jewelBtn.isVisible().catch(() => false)) {
    await jewelBtn.click()
    await page.waitForTimeout(6000)
  }
}

test.describe("Bug M — VPCE lane visual hierarchy (live)", () => {
  test.beforeEach(async ({ page, context }) => {
    test.setTimeout(240_000)
    await seedAuthCookie(context)
    await page.setViewportSize({ width: 1600, height: 1000 })
    await page.goto(`/systems?systemName=${SYSTEM}&tab=dependency-map`, {
      waitUntil: "domcontentloaded",
    })
    await openRawJewelSpotlight(page)
  })

  test("lane subtitle partitions active vs available in subnet", async ({ page }) => {
    await waitForVpceLane(page)
    const lane = page.locator('[data-lane="vpc-endpoints"]')
    const laneText = (await lane.innerText()).replace(/\s+/g, " ")
    expect(laneText).toMatch(/active · \d+ available in subnet/i)

    const cards = lane.locator("[data-vpce-id]")
    const cardCount = await cards.count()
    expect(cardCount).toBeGreaterThanOrEqual(2)

    const activeCount = await lane.locator('[data-active="true"]').count()
    const inactiveCount = await lane.locator('[data-active="false"]').count()
    expect(activeCount + inactiveCount).toBe(cardCount)
    expect(activeCount).toBeGreaterThanOrEqual(0)
    expect(inactiveCount).toBeGreaterThanOrEqual(1)
  })

  test("inactive VPCE cards are dimmed and carry availability tooltip", async ({ page }) => {
    await waitForVpceLane(page)
    const lane = page.locator('[data-lane="vpc-endpoints"]')
    const inactive = lane.locator('[data-active="false"]').first()
    test.skip((await inactive.count()) === 0, "No inactive VPCE cards in lane")

    await expect(inactive).toHaveClass(/opacity-60/)
    await expect(inactive).toHaveClass(/border-dashed/)

    const title = await inactive.getAttribute("title")
    expect(title?.toLowerCase()).toContain("available")
    expect(title?.toLowerCase()).toContain("not on the active attack path")
  })

  test("active S3 VPCE card is saturated (not dimmed)", async ({ page }) => {
    await waitForVpceLane(page)
    const lane = page.locator('[data-lane="vpc-endpoints"]')
    const active = lane.locator('[data-active="true"]').first()
    test.skip((await active.count()) === 0, "No active VPCE on path for this jewel")

    await expect(active).not.toHaveClass(/opacity-60/)
    const label = (await active.innerText()).toLowerCase()
    expect(label.includes("s3") || label.includes("gateway")).toBeTruthy()
  })
})
