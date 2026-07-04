/**
 * Attacker Map mode chip — live pin.
 *
 * Attacker Map is an internal mode chip next to Attack Path (not a Risk
 * sub-tab). Attack Path mode must not show the embedded flow map; Attacker
 * Map mode shows the map-only panel.
 */
import { test, expect } from "@playwright/test"
import { liveBaseUrl, seedAuthCookie } from "./live-auth"
import {
  ALON_PROD,
  ALON_LOGS_JEWEL_ARN,
  ALON_LOGS_PATH_DISPLAY_ID,
} from "./live-attack-path-pins"

const SYSTEM = process.env.ATTACKER_MAP_SYSTEM || ALON_PROD
const JEWEL = encodeURIComponent(ALON_LOGS_JEWEL_ARN)
const PATH = ALON_LOGS_PATH_DISPLAY_ID

test.describe("Attacker Map mode chip", () => {
  test.beforeEach(async ({ context }) => {
    await seedAuthCookie(context)
  })

  test("Attack Path mode does not show embedded Attack map", async ({ page, context }) => {
    await seedAuthCookie(context)
    await page.goto(
      `${liveBaseUrl()}/systems?systemName=${SYSTEM}&tab=attack-paths&jewel=${JEWEL}&path=${PATH}&mode=attack-path`,
      { waitUntil: "domcontentloaded" },
    )
    await page.waitForTimeout(8000)
    await expect(page.getByTestId("attack-path-flow-map-slot")).toHaveCount(0)
  })

  test("Attacker Map mode shows map-only panel", async ({ page, context }) => {
    await seedAuthCookie(context)
    await page.goto(
      `${liveBaseUrl()}/systems?systemName=${SYSTEM}&tab=attack-paths&jewel=${JEWEL}&path=${PATH}&mode=attacker_map`,
      { waitUntil: "domcontentloaded" },
    )
    await page.waitForTimeout(8000)
    await expect(page.getByTestId("attack-path-flow-map-slot")).toHaveCount(1)
    await expect(page.getByText("Supporting evidence")).toHaveCount(0)
  })

  test("Attacker Map chip sits next to Attack Path in mode bar", async ({ page, context }) => {
    await seedAuthCookie(context)
    await page.goto(
      `${liveBaseUrl()}/systems?systemName=${SYSTEM}&tab=attack-paths&jewel=${JEWEL}`,
      { waitUntil: "domcontentloaded" },
    )
    await page.waitForTimeout(8000)
    const attackPathChip = page.getByRole("button", { name: "Attack Path", exact: true })
    const attackerMapChip = page.getByRole("button", { name: "Attacker Map", exact: true })
    await expect(attackPathChip).toBeVisible({ timeout: 60_000 })
    await expect(attackerMapChip).toBeVisible()
    await attackerMapChip.click()
    await page.waitForTimeout(500)
    await expect(attackerMapChip).toHaveClass(/text-primary|bg-primary/)
  })

  test("Legacy tab=attacker-map deep link opens Attack Paths on Attacker Map mode", async ({
    page,
    context,
  }) => {
    await seedAuthCookie(context)
    await page.goto(
      `${liveBaseUrl()}/systems?systemName=${SYSTEM}&tab=attacker-map&jewel=${JEWEL}&path=${PATH}`,
      { waitUntil: "domcontentloaded" },
    )
    await page.waitForTimeout(8000)
    const riskAttackPathsTab = page
      .locator("button")
      .filter({ hasText: /^Attack Paths$/ })
      .first()
    await expect(riskAttackPathsTab).toHaveClass(/text-\[#2D51DA\]/)
    await expect(page.getByRole("button", { name: "Attacker Map", exact: true })).toHaveClass(
      /text-primary|bg-primary/,
    )
    await expect(page.getByTestId("attack-path-flow-map-slot")).toHaveCount(1)
  })
})
