import { expect, test, type Locator } from "@playwright/test"
import { seedAuthCookie } from "./live-auth"
import { ESTATE_URL, logicalGroupSnapshot, routeSnapshot } from "./topology-fixture"

/** Lower-section geometry: the two blocks that independent production UI QA
 *  found spending the map's vertical budget, measured at the viewports a real
 *  reader uses.
 *
 *  WHY GEOMETRY AND NOT A SNAPSHOT. The reported defect was not "the wrong
 *  element rendered" — every element was correct and the functional pass was
 *  green. It was that the logical-group band occupied y=615.27..730.52 while
 *  the data tier's own heading sat at y=655.02..664.02, i.e. two correct
 *  elements drawn over each other. Only rectangles catch that, so rectangles
 *  are what this asserts.
 *
 *  1512x771 is the reported failure viewport (the user screenshot is DPR 2, so
 *  its 3024x1542 pixels are 1512x771 CSS px — the CSS number is what layout
 *  sees and therefore what a regression test must use). */
const VIEWPORTS = [
  { name: "1600x900", width: 1600, height: 900 },
  { name: "1512x771", width: 1512, height: 771 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1024x720", width: 1024, height: 720 },
] as const

/** Overlap of two rects in px^2. Zero means they do not intersect at all. */
async function overlapArea(a: Locator, b: Locator): Promise<number> {
  const [ra, rb] = [await a.boundingBox(), await b.boundingBox()]
  if (!ra || !rb) return 0
  const w = Math.min(ra.x + ra.width, rb.x + rb.width) - Math.max(ra.x, rb.x)
  const h = Math.min(ra.y + ra.height, rb.y + rb.height) - Math.max(ra.y, rb.y)
  return w > 0 && h > 0 ? w * h : 0
}

for (const vp of VIEWPORTS) {
  test(`lower estate sections stay clear of the data tier at ${vp.name}`, async ({ context, page }) => {
    test.setTimeout(120_000)
    const { snapshot } = logicalGroupSnapshot()
    await seedAuthCookie(context)
    await routeSnapshot(page, snapshot)
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
    await page.getByRole("tab", { name: "Network topology" }).click()

    // --- default state: both sections closed -------------------------------
    const coverage = page.getByTestId("topology-lane-coverage").first()
    if (await coverage.count()) {
      await expect(coverage).toHaveAttribute("data-details-open", "false")
      const box = await coverage.boundingBox()
      // It measured 71px expanded. The collapsed row is one line of 10px text
      // in a py-1.5 box; 44px leaves room for a wrapped totals sentence at
      // 1024 wide without ever re-admitting the lane grid.
      expect(box!.height, "collapsed coverage row is not the 71px block").toBeLessThanOrEqual(44)
      await expect(page.getByTestId("topology-lane-coverage-lanes")).toBeHidden()
    }

    const band = page.getByTestId("topology-logical-group-band").first()
    await expect(band).toBeVisible()
    await expect(band).toHaveAttribute("data-groups-open", "false")
    // The count must survive collapsing: a reader has to see that groups exist
    // without opening anything.
    await expect(band.getByTestId("topology-logical-group-band-header")).toContainText("Logical groups")
    await expect(band.getByTestId("topology-logical-group-band-header")).toContainText("(1)")

    // --- the assertion the defect is about ---------------------------------
    const dataCells = page.locator('[data-tier="data"]')
    const cellCount = await dataCells.count()
    expect(cellCount, "the fixture draws a data tier to overlap with").toBeGreaterThan(0)
    for (let i = 0; i < cellCount; i++) {
      const area = await overlapArea(band, dataCells.nth(i))
      expect(area, `logical-group band overlaps data-tier cell ${i} by ${area}px^2 at ${vp.name}`).toBe(0)
    }

    // --- on demand, the content is still reachable -------------------------
    await band.getByTestId("topology-logical-group-band-toggle").click()
    await expect(band).toHaveAttribute("data-groups-open", "true")
    await expect(band.getByTestId("topology-logical-group")).toHaveCount(1)
    await expect(band.getByTestId("topology-logical-group-member").first()).toBeVisible()

    if (await coverage.count()) {
      await page.getByTestId("topology-lane-coverage-details-toggle").click()
      await expect(coverage).toHaveAttribute("data-details-open", "true")
      await expect(page.getByTestId("topology-lane-coverage-lanes")).toBeVisible()
    }

    await page.screenshot({
      path: `test-results/estate-lower-geometry-${vp.name}.png`,
      fullPage: false,
    })
  })
}
