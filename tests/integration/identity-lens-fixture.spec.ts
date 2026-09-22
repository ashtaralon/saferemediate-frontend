import { expect, test } from "@playwright/test"

import { seedAuthCookie } from "./live-auth"
import { ESTATE_URL, identitySnapshot, routeSnapshot } from "./topology-fixture"

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
    // The estate snapshot WITH an identity projection: without one the tab
    // correctly reports the projection absent and there is no map to assert on.
    await routeSnapshot(page, identitySnapshot() as never)
  })

  test("the deep link opens the identity lens with the map as its primary content", async ({ page }) => {
    await page.goto(IDENTITY_URL, { waitUntil: "domcontentloaded" })

    const tab = page.getByTestId("estate-identity-access")
    await expect(tab).toBeVisible({ timeout: 60_000 })
    // The tab root paints before the projection resolves, so waiting on it is
    // not waiting for the map. page.evaluate does not retry: without this the
    // read below would be a race against the render it is measuring.
    await expect(page.getByTestId("identity-map")).toBeVisible({ timeout: 60_000 })

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
    // The contract declares seven; all of them are reported one way or another.
    // toHaveCount, not count(): `locator.count()` is a single-shot read with no
    // auto-wait, so it answered 0 for a rail that had simply not rendered yet
    // (run 35568526695, desktop + tablet + mobile).
    await expect(families).toHaveCount(7)
    const count = await families.count()
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

  test("selecting a lens leaves the query untouched", async ({ page }) => {
    // The regression this case exists to hold down. When the toggle wrote
    // `?lens=` back, Next's patched replaceState updated useSearchParams, the
    // App Router re-keyed a page segment whose cache key includes the search
    // string, and the whole estate remounted a few hundred milliseconds after
    // the click -- discarding fullscreen, the fit, and the selection. Three of
    // the six topology specs failed on it (run 35568526695), each on a
    // single-shot assertion that resolved against a subtree already gone.
    //
    // Entering WITHOUT a lens parameter is the point: a URL that already
    // carries one cannot show the difference.
    await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
    const before = await page.evaluate(() => window.location.search)

    await page.getByTestId("topology-estate-view-identity").click()
    await expect(page.getByTestId("identity-map")).toBeVisible({ timeout: 60_000 })
    expect(
      await page.evaluate(() => window.location.search),
      "the lens toggle rewrote the query, which remounts this page",
    ).toBe(before)

    await page.getByTestId("topology-estate-view-inventory").click()
    expect(await page.evaluate(() => window.location.search)).toBe(before)
  })

  test("map state survives the toggle", async ({ page }) => {
    // The consequence, asserted directly rather than inferred from the query.
    // Desktop only, for the same reason the six topology specs are: fullscreen
    // is a desktop surface and its geometry is written for that width. The
    // cause above is width-independent and is checked at all three.
    test.skip(
      test.info().project.name !== "desktop",
      "fullscreen is asserted on the desktop project, as the topology specs are",
    )
    await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })

    await page.getByTestId("topology-estate-view-identity").click()
    await expect(page.getByTestId("identity-map")).toBeVisible({ timeout: 60_000 })
    await page.getByTestId("topology-estate-view-map").click()

    const enlarge = page.getByTestId("topology-estate-map-enlarge")
    await expect(enlarge).toBeVisible({ timeout: 60_000 })
    await enlarge.click()
    const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
    await expect(fullscreen).toBeVisible()
    // A remount landed within one Playwright call of the click that caused it,
    // so this is generous rather than arbitrary; it is also how the other
    // fixture specs in this directory settle the map.
    await page.waitForTimeout(1500)
    await expect(fullscreen, "fullscreen closed itself: the map remounted").toBeVisible()
  })

  test("the map stays readable without horizontal page scroll", async ({ page }) => {
    await page.goto(IDENTITY_URL, { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("estate-identity-access")).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId("identity-map")).toBeVisible({ timeout: 60_000 })

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
