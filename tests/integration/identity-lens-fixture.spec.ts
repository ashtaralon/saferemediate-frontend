import { expect, test } from "@playwright/test"

import { seedAuthCookie } from "./live-auth"
import { ESTATE_URL, routeSnapshot } from "./topology-fixture"

/**
 * The Identity & access lens, at the three widths a reader actually uses.
 *
 * Deliberately its own spec rather than an extension of the topology ones:
 * those assert the Network topology lens and its geometry, and repurposing
 * them would change what they prove. This one navigates by the lens deep link,
 * so it never depends on which view the page opens by default -- that default
 * is the network product's to choose, not this spec's to assume.
 *
 * Runs under the desktop, tablet and mobile projects (playwright.config.ts).
 * The same assertions run at every width: the map is the tab's primary
 * content, the shared viewport controls are present, and nothing is fabricated
 * where the producer sent nothing.
 */

const IDENTITY_URL = `${ESTATE_URL}&lens=identity`

test.describe("Estate · Identity & access lens", () => {
  test.beforeEach(async ({ context, page }) => {
    test.setTimeout(120_000)
    await seedAuthCookie(context)
    await routeSnapshot(page)
  })

  test("the deep link opens the identity lens with the map as its primary content", async ({ page }) => {
    await page.goto(IDENTITY_URL, { waitUntil: "domcontentloaded" })

    const tab = page.getByTestId("estate-identity-access")
    await expect(tab).toBeVisible({ timeout: 60_000 })

    // The lens the URL asked for, not the page default.
    await expect(page.getByTestId("topology-estate-view-identity")).toHaveAttribute(
      "aria-selected", "true",
    )

    // Primary content: the map precedes the evidence sections in the document,
    // which is the order a screen reader announces and the order a reader sees.
    const order = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="estate-identity-access"]')
      if (!root) return null
      const map = root.querySelector('[data-testid="identity-map"]')
      const receipts = root.querySelector('[data-testid="identity-receipts"], [data-testid="identity-receipts-none"]')
      if (!map || !receipts) return null
      // Node.DOCUMENT_POSITION_FOLLOWING === 4
      return (map.compareDocumentPosition(receipts) & 4) === 4 ? "map-first" : "map-after"
    })
    expect(order).toBe("map-first")
  })

  test("the shared viewport controls are on the identity map", async ({ page }) => {
    await page.goto(IDENTITY_URL, { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("estate-identity-access")).toBeVisible({ timeout: 60_000 })

    const controls = page.getByTestId("identity-map-controls")
    await expect(controls).toBeVisible()
    await expect(page.getByTestId("identity-map-zoom-in")).toBeVisible()
    await expect(page.getByTestId("identity-map-zoom-out")).toBeVisible()
    await expect(page.getByTestId("identity-map-fit")).toBeVisible()

    // The readout is relative to fit, so it starts at 100% and rises on zoom in.
    const readout = page.getByTestId("identity-map-zoom-readout")
    await expect(readout).toHaveText("100%")
    await page.getByTestId("identity-map-zoom-in").click()
    await expect(readout).not.toHaveText("100%")
    await page.getByTestId("identity-map-fit").click()
    await expect(readout).toHaveText("100%")
  })

  test("absent relationship families are named, never drawn as zero", async ({ page }) => {
    await page.goto(IDENTITY_URL, { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("estate-identity-access")).toBeVisible({ timeout: 60_000 })

    const families = page.getByTestId("identity-map-taxonomy-family")
    const count = await families.count()
    // The contract declares seven; all of them are reported one way or another.
    expect(count).toBe(7)
    for (let i = 0; i < count; i++) {
      const state = await families.nth(i).getAttribute("data-state")
      expect(["present", "unavailable"]).toContain(state)
      if (state === "unavailable") {
        // It says which payload key would carry it -- not "0".
        await expect(families.nth(i)).toContainText("unavailable")
        await expect(families.nth(i)).not.toContainText("0 edges")
      }
    }
  })

  test("the map stays readable without horizontal page scroll", async ({ page }) => {
    await page.goto(IDENTITY_URL, { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("estate-identity-access")).toBeVisible({ timeout: 60_000 })

    // The canvas may pan inside its own frame; the PAGE must not scroll
    // sideways at any width. This is the assertion the desktop-only suite
    // could never make.
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)

    // The text reading of the same graph is always in the DOM, which is what
    // keeps the lens usable where three lanes cannot fit.
    await expect(page.getByTestId("identity-map-fallback")).toBeAttached()
  })
})
