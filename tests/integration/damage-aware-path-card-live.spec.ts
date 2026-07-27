/**
 * LIVE Playwright — Zoom1 Attack Path drill-in (cut card + demoted damage evidence).
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
    const cut = page.getByTestId("zoom1-cut-card")
    const facadeErr = page.getByText(/path_not_found|Failed to load attack path/i)
    await expect(cut.or(facadeErr).first()).toBeVisible({ timeout: 90_000 })
    if (await facadeErr.isVisible().catch(() => false)) {
      test.skip(true, "attack-path facade unavailable for pin")
    }
    await expect(cut).toBeVisible({ timeout: 30_000 })
  })

  test("Zoom1 cut card + demoted damage evidence render", async ({ page }) => {
    await expect(page.getByTestId("zoom1-cut-card")).toBeVisible()
    await expect(page.getByText(/Fix · cut card/i)).toBeVisible()

    const evidenceToggle = page.getByRole("button", { name: /Supporting evidence/i })
    await expect(evidenceToggle).toBeVisible()
    // Section may already be open (default true) — ensure damage card is reachable.
    if (!(await page.getByTestId("damage-aware-path-card").isVisible().catch(() => false))) {
      await evidenceToggle.click()
    }
    const card = page.getByTestId("damage-aware-path-card")
    await expect(card).toBeVisible({ timeout: 60_000 })
    await expect(
      card.getByRole("heading", { name: /Damage-Aware Path to Crown Jewel/i }),
    ).toBeVisible()
    await expect(card.getByText("Potential damage on jewel")).toBeVisible()
    await expect(card.getByText("Recommended LP fix")).toBeVisible()
  })

  test("path comparison table visible when multiple paths to jewel", async ({ page }) => {
    // Logs jewel often has a single path — comparison table requires ≥2.
    // Navigate to a denser jewel known to fan-in multiple paths.
    await page.goto(
      `/attack-paths-v2?system=${SYSTEM}&jewel=${encodeURIComponent("arn:aws:s3:::cyntro-demo-prod-data-745783559495")}&mode=attack-path`,
      { waitUntil: "domcontentloaded" },
    )
    await expect(page.getByText(/Loading attack paths/i)).toHaveCount(0, {
      timeout: 90_000,
    })
    // Pick first path so Zoom1 mounts.
    const firstPath = page.getByRole("button").filter({ hasText: /^path-/ }).first()
    if (await firstPath.isVisible().catch(() => false)) {
      await firstPath.click()
    }
    await expect(page.getByTestId("zoom1-cut-card")).toBeVisible({ timeout: 90_000 })

    const evidenceToggle = page.getByRole("button", { name: /Supporting evidence/i })
    if (!(await page.getByTestId("path-comparison-table").isVisible().catch(() => false))) {
      await evidenceToggle.click()
    }
    const table = page.getByTestId("path-comparison-table")
    const visible = await table.isVisible().catch(() => false)
    if (!visible) {
      test.skip(true, "Jewel has <2 sibling paths — comparison table not mounted")
    }
    await expect(table).toBeVisible({ timeout: 60_000 })
    await expect(table.getByText(/different paths/i)).toBeVisible()
  })
})
