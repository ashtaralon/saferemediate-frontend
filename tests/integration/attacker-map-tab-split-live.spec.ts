/**
 * Attacker Map tab split — live pin (PR #286).
 *
 * Attack Paths and Attacker Map are sibling Risk tabs. Attack Paths must
 * NOT mount the Attacker Map canvas; Attacker Map tab must mount it.
 */
import { test, expect } from "@playwright/test"
import { liveBaseUrl, seedAuthCookie } from "./live-auth"

const SYSTEM = process.env.ATTACKER_MAP_SYSTEM || "alon-prod"

test.describe("Attacker Map tab split", () => {
  test.beforeEach(async ({ context }) => {
    await seedAuthCookie(context)
  })

  test("Attack Paths tab does not mount Attacker Map", async ({ page, context }) => {
    await seedAuthCookie(context)
    await page.goto(`${liveBaseUrl()}/systems?systemName=${SYSTEM}&tab=attack-paths`, {
      waitUntil: "domcontentloaded",
    })
    // AttackPathsV2 is dynamically imported — allow mount time.
    await page.waitForTimeout(5000)
    await expect(page.getByTestId("attacker-map-root")).toHaveCount(0)
  })

  test("Attacker Map tab mounts Attacker Map", async ({ page, context }) => {
    await seedAuthCookie(context)
    await page.goto(`${liveBaseUrl()}/systems?systemName=${SYSTEM}&tab=attacker-map`, {
      waitUntil: "domcontentloaded",
    })
    await page.waitForTimeout(5000)
    await expect(page.getByTestId("attacker-map-root")).toHaveCount(1)
  })

  test("Deep link tab=attacker-map selects Attacker Map sub-tab", async ({ page, context }) => {
    await seedAuthCookie(context)
    await page.goto(`${liveBaseUrl()}/systems?systemName=${SYSTEM}&tab=attacker-map`, {
      waitUntil: "domcontentloaded",
    })
    await page.waitForTimeout(3000)
    const attackerTab = page.getByRole("button", { name: "Attacker Map", exact: true })
    await expect(attackerTab).toBeVisible()
    await expect(attackerTab).toHaveClass(/text-\[#2D51DA\]/)
  })
})
