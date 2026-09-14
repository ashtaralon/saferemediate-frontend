import { expect, test, type Locator, type Page } from "@playwright/test"
import { seedAuthCookie } from "./live-auth"
import {
  ESTATE_URL,
  externalEgressSnapshot,
  logicalGroupSnapshot,
  routeSnapshot,
  triggerBundleSnapshot,
} from "./topology-fixture"

/** Lower-section geometry: the blocks that independent production UI QA found
 *  spending the map's vertical budget, measured at the viewports a real reader
 *  uses.
 *
 *  WHY GEOMETRY AND NOT A SNAPSHOT. The reported defect was not "the wrong
 *  element rendered" — every element was correct and the functional pass was
 *  green. It was that the logical-group band occupied y=615.27..730.52 while
 *  the data tier's own heading sat at y=655.02..664.02, i.e. two correct
 *  elements drawn over each other. Only rectangles catch that, so rectangles
 *  are what this asserts.
 *
 *  The second review pass added three more rectangle facts, each for a defect
 *  the first set of assertions passed straight through:
 *    · the expanded External destinations detail was a horizontal SIBLING, so
 *      opening it widened the strip until the text was unreadable and pushed
 *      the Users block off screen at 1024x720. Non-overlap with the data tier
 *      said nothing about that, so the strip's own width is now compared
 *      before and after opening, the panel is required to sit inside the
 *      viewport, and its type is required to be legible.
 *    · the logical groups' membership badges painted outside the map card
 *      entirely. Every flow badge is now required to sit inside the overlay.
 *
 *  1512x771 is the reported failure viewport (the user screenshot is DPR 2, so
 *  its 3024x1542 pixels are 1512x771 CSS px — the CSS number is what layout
 *  sees and therefore what a regression test must use).
 *
 *  The payload is all three builders chained, so one screenshot per viewport
 *  carries the six-group band, the external-destinations chain and the Lambda
 *  S3 panel at once — the state a reader actually meets. */
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

/** Every drawn flow badge, and the overlay it is supposed to stay inside. */
async function badgesOutsideOverlay(page: Page) {
  return page.evaluate(() => {
    const svg = document.querySelector('[data-testid="topology-flow-overlay"]')
    if (!svg) return { overlay: null, escaped: [] as Array<Record<string, unknown>> }
    const o = svg.getBoundingClientRect()
    const escaped: Array<Record<string, unknown>> = []
    for (const g of Array.from(document.querySelectorAll('[data-testid="topology-flow-badge"]'))) {
      const r = g.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      // 1px of tolerance for the stroke the renderer draws on the box edge.
      if (r.left < o.left - 1 || r.right > o.right + 1 || r.top < o.top - 1 || r.bottom > o.bottom + 1) {
        escaped.push({
          text: (g.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
          left: Math.round(r.left),
          right: Math.round(r.right),
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
        })
      }
    }
    return {
      overlay: { left: Math.round(o.left), right: Math.round(o.right), width: Math.round(o.width) },
      escaped,
      total: document.querySelectorAll('[data-testid="topology-flow-badge"]').length,
    }
  })
}

for (const vp of VIEWPORTS) {
  test(`lower estate sections stay clear of the data tier at ${vp.name}`, async ({ context, page }) => {
    test.setTimeout(150_000)
    const groups = logicalGroupSnapshot()
    const triggers = triggerBundleSnapshot(groups.snapshot)
    const egress = externalEgressSnapshot(triggers.snapshot)
    await seedAuthCookie(context)
    await routeSnapshot(page, egress.snapshot)
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
    await page.getByRole("tab", { name: "Network topology" }).click()

    // --- default state: every on-demand section closed ---------------------
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
    const bandHeader = band.getByTestId("topology-logical-group-band-header")
    await expect(bandHeader).toContainText("Logical groups")
    await expect(bandHeader).toContainText(`(${groups.groups.length})`)

    const external = page.getByTestId("topology-external-destinations").first()
    await expect(external).toBeVisible()
    await expect(external).toHaveAttribute("data-open", "false")
    await expect(external).toHaveAttribute("data-leg-count", String(egress.legCount))
    await expect(page.getByTestId("topology-external-destinations-details")).toBeHidden()

    const s3 = page.getByTestId("topology-lambda-s3-coverage").first()
    await expect(s3).toBeVisible()
    await expect(s3).toHaveAttribute("data-open", "false")
    await expect(s3).toHaveAttribute("data-with-traffic", String(triggers.s3Functions.length))
    await expect(s3).toHaveAttribute("data-total", String(triggers.lambdas.length))
    await expect(page.getByTestId("topology-lambda-s3-coverage-details")).toBeHidden()

    // The strip is centre-justified: an overflow is split between both ends,
    // so the USERS block is the half that leaves the screen first.
    const strip = page.getByTestId("topology-users-internet-strip").first()
    const stripBox = (await strip.boundingBox())!
    const usersBox = (await page.getByTestId("topology-users-node").first().boundingBox())!
    expect(usersBox.x, `Users block clipped at the strip's left edge at ${vp.name}`).toBeGreaterThanOrEqual(
      stripBox.x - 1,
    )
    expect(usersBox.x, `Users block off the left of the viewport at ${vp.name}`).toBeGreaterThanOrEqual(-1)

    await page.screenshot({
      path: `test-results/estate-lower-default-${vp.name}.png`,
      fullPage: false,
    })

    // --- nothing paints outside the overlay --------------------------------
    const contained = await badgesOutsideOverlay(page)
    expect(contained.overlay, "the flow overlay is drawn").not.toBeNull()
    expect(contained.total, "the fixture draws flow badges to contain").toBeGreaterThan(0)
    expect(
      contained.escaped,
      `flow badges outside the overlay at ${vp.name}: ${JSON.stringify(contained.escaped)}`,
    ).toEqual([])

    // --- the assertion the first defect was about --------------------------
    const dataCells = page.locator('[data-tier="data"]')
    const cellCount = await dataCells.count()
    expect(cellCount, "the fixture draws a data tier to overlap with").toBeGreaterThan(0)
    for (let i = 0; i < cellCount; i++) {
      for (const [name, block] of [
        ["logical-group band", band],
        ["external-destinations node", external],
      ] as const) {
        const area = await overlapArea(block, dataCells.nth(i))
        expect(area, `${name} overlaps data-tier cell ${i} by ${area}px^2 at ${vp.name}`).toBe(0)
      }
    }

    // --- on demand, the content is still reachable AND contained -----------
    await band.getByTestId("topology-logical-group-band-toggle").click()
    await expect(band).toHaveAttribute("data-groups-open", "true")
    await expect(band.getByTestId("topology-logical-group")).toHaveCount(groups.groups.length)
    await expect(band.getByTestId("topology-logical-group-member").first()).toBeVisible()

    await external.getByTestId("topology-external-destinations-toggle").click()
    await expect(external).toHaveAttribute("data-open", "true")
    const panel = page.getByTestId("topology-external-destinations-details")
    await expect(panel).toBeVisible()
    await expect(panel.getByTestId("topology-external-destination-leg")).toHaveCount(egress.legCount)

    // Opening it may not change the strip's width by a single pixel: the panel
    // is portaled, not a sibling column.
    const stripAfter = (await strip.boundingBox())!
    expect(
      Math.abs(stripAfter.width - stripBox.width),
      `opening the panel widened the top strip at ${vp.name}`,
    ).toBeLessThanOrEqual(1)

    // Inside the viewport, and big enough to read.
    const panelBox = (await panel.boundingBox())!
    expect(panelBox.x, `panel off the left at ${vp.name}`).toBeGreaterThanOrEqual(-1)
    expect(panelBox.y, `panel off the top at ${vp.name}`).toBeGreaterThanOrEqual(-1)
    expect(panelBox.x + panelBox.width, `panel off the right at ${vp.name}`).toBeLessThanOrEqual(vp.width + 1)
    expect(panelBox.y + panelBox.height, `panel off the bottom at ${vp.name}`).toBeLessThanOrEqual(
      vp.height + 1,
    )
    expect(panelBox.width, `panel too narrow to read at ${vp.name}`).toBeGreaterThanOrEqual(260)

    const readable = await page.evaluate(() => {
      const p = document.querySelector('[data-testid="topology-external-destinations-details"]')
      if (!p) return null
      const legs = Array.from(p.querySelectorAll<HTMLElement>('[data-testid="topology-external-destination-leg"]'))
      const px = (el: Element) => parseFloat(getComputedStyle(el).fontSize)
      return {
        captionPx: px(p.querySelector("p")!),
        minLegPx: Math.min(...legs.map(px)),
        // A wrapped line is fine; a line wider than its own box is clipped text.
        clipped: legs.filter(el => el.scrollWidth > el.clientWidth + 1).length,
      }
    })
    expect(readable, "the panel is measurable").not.toBeNull()
    expect(readable!.captionPx, `panel caption below 11px at ${vp.name}`).toBeGreaterThanOrEqual(11)
    expect(readable!.minLegPx, `panel leg text below 11px at ${vp.name}`).toBeGreaterThanOrEqual(11)
    expect(readable!.clipped, `clipped leg lines at ${vp.name}`).toBe(0)

    // Close by the control, not by Escape: the estate view installs its own
    // Escape handler for the topmost surface and this spec is not here to
    // arbitrate between the two.
    await external.getByTestId("topology-external-destinations-toggle").click()
    await expect(external).toHaveAttribute("data-open", "false")

    await s3.getByTestId("topology-lambda-s3-coverage-toggle").click()
    await expect(s3).toHaveAttribute("data-open", "true")
    await expect(s3.getByTestId("topology-lambda-s3-coverage-function")).toHaveCount(
      triggers.s3Functions.length,
    )

    if (await coverage.count()) {
      await page.getByTestId("topology-lane-coverage-details-toggle").click()
      await expect(coverage).toHaveAttribute("data-details-open", "true")
      await expect(page.getByTestId("topology-lane-coverage-lanes")).toBeVisible()
    }

    // Opening a disclosure scrolls it into view, and the map is a horizontally
    // scrollable region, so the expanded frame would otherwise be taken from
    // wherever the last click left it. Reset the HORIZONTAL scroll only and
    // bring the map back into frame: scrolling the window to 0 as well pushed
    // the map itself below the fold at 1024x720 and the frame showed nothing
    // it was taken for (run 34850735271).
    await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-scroll-region]"))) {
        el.scrollLeft = 0
      }
      document
        .querySelector('[data-testid="topology-estate-view-map"]')
        ?.scrollIntoView({ block: "start" })
    })
    // The panel is reopened for the frame, so the expanded screenshot shows
    // the state the assertions above measured.
    await external.getByTestId("topology-external-destinations-toggle").click()
    await expect(panel).toBeVisible()
    await page.screenshot({
      path: `test-results/estate-lower-geometry-${vp.name}.png`,
      fullPage: false,
    })
  })
}
