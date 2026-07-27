/**
 * LIVE — Zoom0 Reachability path-authority honesty (P0a/P0b).
 *
 * After #442: fan-in Attack Map must not show estate traffic claims,
 * internet partition banner, or Live Traffic without path-bound volume.
 */
import { test, expect, type Page } from "@playwright/test"
import { liveBaseUrl, seedAuthCookie } from "./live-auth"
import { ALON_PROD, ALON_LOGS_JEWEL_ARN } from "./live-attack-path-pins"

const SYSTEM = process.env.ZOOM0_SYSTEM || ALON_PROD
const JEWEL = encodeURIComponent(
  process.env.ZOOM0_JEWEL_ARN || ALON_LOGS_JEWEL_ARN,
)
const READY_MS = 90_000

async function waitForZoom0(page: Page): Promise<void> {
  await expect(page.getByTestId("zoom0-fan-in")).toBeVisible({
    timeout: READY_MS,
  })
  await expect(page.getByTestId("zoom0-attack-map-slot")).toBeVisible({
    timeout: READY_MS,
  })
}

test.describe("Zoom0 path-authority honesty (live)", () => {
  test.setTimeout(120_000)

  test.beforeEach(async ({ context }) => {
    await seedAuthCookie(context)
  })

  test("Reachability map suppresses unsupported traffic claims", async ({
    page,
    context,
  }) => {
    await seedAuthCookie(context)
    await page.goto(
      `${liveBaseUrl()}/systems?systemName=${SYSTEM}&tab=attack-paths&jewel=${JEWEL}`,
      { waitUntil: "domcontentloaded" },
    )
    await waitForZoom0(page)

    await expect(
      page.getByRole("tab", { name: "Reachability", exact: true }),
    ).toBeVisible()

    const map = page.getByTestId("zoom0-attack-map-slot")
    await expect(map).toBeVisible()

    // P0a: internet partition banner removed
    await expect(map.locator('[data-internet-partition="true"]')).toHaveCount(0)

    // P0a: no Live Traffic legend / no estate Traffic GB claim
    await expect(map.getByText("Live Traffic", { exact: true })).toHaveCount(0)
    await expect(map.getByText(/\d+(\.\d+)?\s*GB/)).toHaveCount(0)
    await expect(map.getByText("Network volume not bound to this path")).toBeVisible({
      timeout: READY_MS,
    })

    // Configured routing honesty cue
    await expect(
      map.getByText(/ROUTES_VIA = configured routing association/i),
    ).toBeVisible()

    // Same-VPC IGW must not appear unless it is a selected-path hop.
    // For saferemediate-logs fan-in the DTO has no IGW hop.
    await expect(map.getByText(/^IGW$/)).toHaveCount(0)
    await expect(map.locator('[data-lane="egress-gateways"]')).toHaveCount(0)
  })
})
