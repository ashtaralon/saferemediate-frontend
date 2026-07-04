/**
 * Attacker Map tab split — live pin.
 *
 * Attack Paths and Attacker Map are sibling Risk tabs. The embedded
 * per-path Attack map (AttackPathLaneFlowMap) must NOT appear on Attack
 * Paths; it lives on Attacker Map only (1:1 move from the old right panel).
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

test.describe("Attacker Map tab split", () => {
  test.beforeEach(async ({ context }) => {
    await seedAuthCookie(context)
  })

  test("Attack Paths tab does not show embedded Attack map", async ({ page, context }) => {
    await seedAuthCookie(context)
    await page.goto(`${liveBaseUrl()}/systems?systemName=${SYSTEM}&tab=attack-paths`, {
      waitUntil: "domcontentloaded",
    })
    // AttackPathsV2 is dynamically imported — allow mount time.
    await page.waitForTimeout(5000)
    await expect(page.getByTestId("attack-path-flow-map-slot")).toHaveCount(0)
  })

  test("Attacker Map tab shows embedded Attack map when a path is selected", async ({
    page,
    context,
  }) => {
    await seedAuthCookie(context)
    await page.goto(
      `${liveBaseUrl()}/systems?systemName=${SYSTEM}&tab=attacker-map&jewel=${JEWEL}&path=${PATH}`,
      { waitUntil: "domcontentloaded" },
    )
    await page.waitForTimeout(8000)
    await expect(page.getByTestId("attack-path-flow-map-slot")).toHaveCount(1)
    await expect(page.getByRole("button", { name: "Attack Path", exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Lateral Movement", exact: true })).toHaveCount(0)
    await expect(page.getByText("Supporting evidence")).toHaveCount(0)
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
