/**
 * LIVE Playwright — Damage-Aware Path Card renders on Attack Paths v2.
 */
import { test, expect } from "@playwright/test"
import { seedAuthCookie } from "./live-auth"
import {
  ALON_PROD,
  ALON_LOGS_JEWEL_ARN,
  ALON_LOGS_PATH_DISPLAY_ID,
} from "./live-attack-path-pins"

const SYSTEM = ALON_PROD
const PATH_ID = ALON_LOGS_PATH_DISPLAY_ID
const JEWEL_ID = encodeURIComponent(ALON_LOGS_JEWEL_ARN)

test.describe("damage-aware path card live", () => {
  test.beforeEach(async ({ page, context }) => {
    test.setTimeout(180_000)
    await seedAuthCookie(context)
    await page.goto(
      `/attack-paths-v2?system=${SYSTEM}&jewel=${JEWEL_ID}&path=${PATH_ID}&mode=attack-path`,
      { waitUntil: "domcontentloaded" },
    )
    await page.waitForTimeout(12000)
  })

  test("card renders with path, damage matrix, and LP sections", async ({ page }) => {
    const card = page.getByTestId("damage-aware-path-card")
    await expect(card).toBeVisible({ timeout: 60_000 })
    await expect(card.getByRole("heading", { name: /Damage-Aware Path to Crown Jewel/i })).toBeVisible()
    await expect(card.getByText("Potential damage on jewel")).toBeVisible()
    await expect(card.getByText("Why", { exact: true })).toBeVisible()
    await expect(card.getByText("Recommended LP fix")).toBeVisible()
    await expect(card.getByText("Expected result")).toBeVisible()
    // Fixture path may be network-blocked (Blocked) or live (READ/WRITE/…)
    await expect(card.getByText(/READ|WRITE|DELETE|ADMIN|Blocked/i).first()).toBeVisible()
  })

  test("path comparison table visible when multiple paths to jewel", async ({ page }) => {
    const table = page.getByTestId("path-comparison-table")
    await expect(table).toBeVisible({ timeout: 60_000 })
    await expect(table.getByText(/different paths/i)).toBeVisible()
  })
})
