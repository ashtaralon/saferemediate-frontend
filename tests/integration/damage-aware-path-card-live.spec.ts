/**
 * LIVE Playwright — Damage-Aware Path Card renders on Attack Paths v2.
 */
import { test, expect } from "@playwright/test"

const SYSTEM = "alon-prod"
const PATH_ID = "path-5203dfee3012"
const JEWEL_ID = encodeURIComponent("arn:aws:s3:::saferemediate-logs-745783559495")

test.describe("damage-aware path card live", () => {
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
      `/attack-paths-v2?system=${SYSTEM}&jewel=${JEWEL_ID}&path=${PATH_ID}&mode=attack-path`,
      { waitUntil: "domcontentloaded" },
    )
    await page.waitForTimeout(12000)
  })

  test("card renders with path, damage matrix, and LP sections", async ({ page }) => {
    const card = page.getByTestId("damage-aware-path-card")
    await expect(card).toBeVisible({ timeout: 60_000 })
    await expect(card.getByRole("heading", { name: /Damage-Aware Path to Crown Jewel/i })).toBeVisible()
    await expect(card.getByText("Damage on jewel")).toBeVisible()
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
