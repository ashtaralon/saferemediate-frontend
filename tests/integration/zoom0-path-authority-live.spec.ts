/**
 * LIVE — Zoom0 Current Access path-authority honesty (P0a/P0b).
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
  // Clear any auto-selected path so Zoom0 fan-in (no path pin) mounts.
  const url = new URL(page.url())
  if (url.searchParams.has("path")) {
    url.searchParams.delete("path")
    await page.goto(url.toString(), { waitUntil: "domcontentloaded" })
  }
  await expect(page.getByText(/Loading attack paths for/i)).toHaveCount(0, {
    timeout: READY_MS,
  })
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

  test("Current Access map suppresses unsupported traffic claims", async ({
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
      page.getByRole("tab", { name: "Current Access", exact: true }),
    ).toBeVisible()

    // Model-level hop detail for all fan-in paths must settle first.
    await expect(page.getByTestId("zoom0-path-details-loading")).toHaveCount(0, {
      timeout: READY_MS,
    })

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

    // Compressed evidence view + configured vs observed visual language
    await expect(map.getByText(/Compressed evidence view/i)).toBeVisible()
    await expect(map.getByText(/in-system paths? shown/i)).toBeVisible()
    await expect(map.getByText("Path membership", { exact: true })).toBeVisible()
    await expect(map.getByText("Configured", { exact: true })).toBeVisible()
    await expect(
      map.getByText("Security Gap (finding)", { exact: true }),
    ).toBeVisible()

    // Amber reserved for findings: CJ + IGW chrome must stay neutral.
    const cj = map.locator('[data-testid="crown-jewel-node-button"]')
    if ((await cj.count()) > 0) {
      await expect(cj.first()).toHaveAttribute("data-cj-chrome", "neutral")
    }
    const gateways = map.locator('[data-gateway-id][data-gateway-chrome="neutral"]')
    // Present only when an IGW/NAT hop is on the DTO (logs jewel has none).
    if ((await gateways.count()) > 0) {
      await expect(gateways.first()).toHaveAttribute("data-gateway-chrome", "neutral")
    }

    // Gateway / VPCE ownership chips (N of M paths) when those hops exist
    const ownershipChips = map.locator("[data-path-ownership-chip]")
    const ownershipCount = await ownershipChips.count()
    if (ownershipCount > 0) {
      await expect(ownershipChips.first()).toBeVisible()
      await expect(ownershipChips.first()).toContainText(/\d+ of \d+ paths?/)
    }

    // Same-VPC IGW must not appear unless it is a selected-path hop.
    // For saferemediate-logs fan-in the DTO has no IGW hop.
    await expect(map.getByText(/^IGW$/)).toHaveCount(0)
    await expect(map.locator('[data-lane="egress-gateways"]')).toHaveCount(0)

    // FE route-precedence must not invent public-internet claims.
    await expect(map.locator('[data-crosses-internet="true"]')).toHaveCount(0)
    await expect(map.locator("[data-route-precedence-via]")).toHaveCount(0)
    await expect(map.getByText(/via IGW/i)).toHaveCount(0)
    await expect(map.getByText(/Available · Not selected/i)).toHaveCount(0)

    // Partial detail failure must surface, never silent incomplete map.
    // (Count may be 0 when all details succeed — assert no silent drop.)
    const partial = page.getByTestId("zoom0-partial-detail-failure")
    const unavailable = page.getByTestId("zoom0-path-details-unavailable")
    const blocked = page.getByTestId("zoom0-fallback-map-blocked")
    // Healthy SERVE: map draws without fallback / unavailable blockers.
    await expect(blocked).toHaveCount(0)
    await expect(unavailable).toHaveCount(0)
    // If a sibling detail failed, the honesty chip must be visible.
    if ((await partial.count()) > 0) {
      await expect(partial).toContainText(/Map is incomplete/i)
    }
  })
})
