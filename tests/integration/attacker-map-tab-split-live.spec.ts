/**
 * Attacker Map mode chip — live pin.
 *
 * Attacker Map is an internal mode chip next to Attack Path (not a Risk
 * sub-tab). Attack Path mode must not show the embedded flow map; Attacker
 * Map mode shows the map-only panel.
 */
import { test, expect, type Page } from "@playwright/test"
import { liveBaseUrl, seedAuthCookie } from "./live-auth"
import {
  ALON_PROD,
  ALON_LOGS_JEWEL_ARN,
  ALON_LOGS_PATH_DISPLAY_ID,
} from "./live-attack-path-pins"

const SYSTEM = process.env.ATTACKER_MAP_SYSTEM || ALON_PROD
const JEWEL = encodeURIComponent(ALON_LOGS_JEWEL_ARN)
const PATH = ALON_LOGS_PATH_DISPLAY_ID
const ATTACK_PATHS_READY_MS = 90_000

/** Wait for IAP shell to finish loading instead of a fixed sleep. */
async function waitForAttackPathsReady(page: Page): Promise<void> {
  await expect(page.getByText(/Loading attack paths for/i)).toHaveCount(0, {
    timeout: ATTACK_PATHS_READY_MS,
  })
  await expect(page.getByRole("button", { name: "Attack Path", exact: true })).toBeVisible({
    timeout: ATTACK_PATHS_READY_MS,
  })
}

function attackPathsUrl(extraQuery = ""): string {
  return `${liveBaseUrl()}/systems?systemName=${SYSTEM}&tab=attack-paths&jewel=${JEWEL}&path=${PATH}${extraQuery}`
}

test.describe("Attacker Map mode chip", () => {
  test.setTimeout(120_000)

  test.beforeEach(async ({ context }) => {
    await seedAuthCookie(context)
  })

  test("Attack Path mode does not show embedded Attack map", async ({ page, context }) => {
    await seedAuthCookie(context)
    await page.goto(`${attackPathsUrl("&mode=attack-path")}`, { waitUntil: "domcontentloaded" })
    await waitForAttackPathsReady(page)
    await expect(page.getByTestId("attack-path-flow-map-slot")).toHaveCount(0)
  })

  test("Attacker Map mode shows map-only panel", async ({ page, context }) => {
    await seedAuthCookie(context)
    await page.goto(`${attackPathsUrl("&mode=attacker_map")}`, { waitUntil: "domcontentloaded" })
    await waitForAttackPathsReady(page)
    await expect(page.getByTestId("attack-path-flow-map-slot")).toHaveCount(1, {
      timeout: ATTACK_PATHS_READY_MS,
    })
    await expect(page.getByText("Supporting evidence")).toHaveCount(0)
  })

  test("Attacker Map chip sits next to Attack Path in mode bar", async ({ page, context }) => {
    await seedAuthCookie(context)
    await page.goto(`${attackPathsUrl()}`, { waitUntil: "domcontentloaded" })
    await waitForAttackPathsReady(page)
    const attackPathChip = page.getByRole("button", { name: "Attack Path", exact: true })
    const attackerMapChip = page.getByRole("button", { name: "Attacker Map", exact: true })
    await expect(attackerMapChip).toBeVisible()
    await attackerMapChip.click()
    await expect(attackerMapChip).toHaveClass(/text-primary|bg-primary/, {
      timeout: 10_000,
    })
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
    await waitForAttackPathsReady(page)
    const riskAttackPathsTab = page
      .locator("button")
      .filter({ hasText: /^Attack Paths$/ })
      .first()
    await expect(riskAttackPathsTab).toHaveClass(/text-\[#2D51DA\]/)
    await expect(page.getByRole("button", { name: "Attacker Map", exact: true })).toHaveClass(
      /text-primary|bg-primary/,
    )
    await expect(page.getByTestId("attack-path-flow-map-slot")).toHaveCount(1, {
      timeout: ATTACK_PATHS_READY_MS,
    })
  })
})
