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

/** Is the panel actually READABLE where it is drawn?
 *
 *  Three things can make a detail panel unreadable and only one of them is
 *  opacity, which is why the first two rounds of this fix chased the wrong
 *  property. Measured at 1512x771 (run 34856953477): the panel's own opacity
 *  was 1, its background opaque, every ancestor opacity 1 — and the map still
 *  showed through, because Radix positions its content inside a FIXED wrapper
 *  that carries no z-index, and `z-50` does nothing on the statically
 *  positioned content inside it. So the panel was painting UNDER the map.
 *
 *  The property that covers all three is a hit test: at points inside the
 *  panel, the topmost element must be the panel or something inside it.
 *  Effective opacity is reported alongside it so a future failure says which
 *  of the two it is.
 *
 *  `animationPlayState` is deliberately NOT part of the predicate: it stays
 *  "running" after a keyframe has finished, so a settle-wait built on it can
 *  never become true (run 34856385832 timed out at every viewport on exactly
 *  that). Opacity settling is what "the animation finished" actually means. */
const PANEL_READABILITY = `(() => {
  const el = document.querySelector('[data-testid="topology-external-destinations-details"]')
  if (!el) return null
  let node = el
  let product = 1
  while (node && node !== document.documentElement) {
    product *= Number(getComputedStyle(node).opacity)
    node = node.parentElement
  }
  const r = el.getBoundingClientRect()
  const probes = [
    [r.left + r.width * 0.5, r.top + 6],
    [r.left + r.width * 0.5, r.top + r.height * 0.5],
    [r.left + r.width * 0.5, r.bottom - 6],
    [r.left + 6, r.top + r.height * 0.5],
    [r.right - 6, r.top + r.height * 0.5],
  ]
  const covered = []
  for (const [x, y] of probes) {
    const top = document.elementFromPoint(x, y)
    if (!top || !(el === top || el.contains(top))) {
      covered.push({
        x: Math.round(x),
        y: Math.round(y),
        hit: top ? (top.getAttribute('data-testid') || top.tagName.toLowerCase() + '.' + String(top.className).slice(0, 40)) : 'nothing',
      })
    }
  }
  return { effectiveOpacity: product, covered }
})()`

/** Wait until the panel has settled: opaque, and the topmost element at its
 *  own probe points. Measuring or screenshotting before this reads a mid-fade
 *  or mis-layered frame, which is how an unreadable panel reached the
 *  published artifacts while every geometric assertion passed. */
async function waitForSettledPanel(page: Page, where: string) {
  try {
    await page.waitForFunction(
      `(() => { const s = ${PANEL_READABILITY}; return !!s && s.effectiveOpacity >= 0.999 && s.covered.length === 0 })()`,
      undefined,
      { timeout: 10_000 },
    )
  } catch {
    // Fail with the measurement, not with "it did not settle": the next
    // question is always WHAT is covering it or fading it, and a timeout that
    // does not answer that costs a whole CI round-trip.
    const state = await page.evaluate(`${PANEL_READABILITY}`)
    throw new Error(
      `the external-destinations panel never settled opaque and on top (${where}): ${JSON.stringify(state)}`,
    )
  }
}

/** Every drawn flow badge, and the overlay it is supposed to stay inside. *//** Every drawn flow badge, and the overlay it is supposed to stay inside. */
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
    // The map's own chrome. A badge clamped back inside the card is contained
    // and can still be unreadable, stacked on the summary row or the colour
    // legend; both carry data-flow-obstacle so the nudge pass has to clear
    // them, and this measures whether it did.
    const chrome: Array<{ name: string; r: DOMRect }> = []
    for (const [name, sel] of [
      ["platform-map summary", '[data-testid="topology-platform-map-summary"]'],
      ["flow legend", '[data-testid="topology-flow-legend"]'],
    ] as const) {
      const el = document.querySelector(sel)
      if (el) chrome.push({ name, r: el.getBoundingClientRect() })
    }
    const overChrome: Array<Record<string, unknown>> = []
    for (const g of Array.from(document.querySelectorAll('[data-testid="topology-flow-badge"]'))) {
      const r = g.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      for (const c of chrome) {
        const w = Math.min(r.right, c.r.right) - Math.max(r.left, c.r.left)
        const h = Math.min(r.bottom, c.r.bottom) - Math.max(r.top, c.r.top)
        if (w > 1 && h > 1) {
          overChrome.push({
            text: (g.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
            over: c.name,
            area: Math.round(w * h),
          })
        }
      }
    }
    return {
      overlay: { left: Math.round(o.left), right: Math.round(o.right), width: Math.round(o.width) },
      escaped,
      overChrome,
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
    const laneBefore = await page.getByTestId("topology-external-destinations-lane").boundingBox()
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
    expect(
      contained.overChrome,
      `flow badges painted over the map's own chrome at ${vp.name}: ${JSON.stringify(contained.overChrome)}`,
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
    await waitForSettledPanel(page, `${vp.name} · measurement`)
    await expect(panel.getByTestId("topology-external-destination-leg")).toHaveCount(egress.legCount)

    // Opening it may not change the width of what hosts it by a single pixel:
    // the panel is portaled, not a sibling column. The node moved off the top
    // strip and onto the canvas lane, so the lane is what this now measures —
    // the strip's width became a vacuous check the moment the node left it.
    const stripAfter = (await strip.boundingBox())!
    expect(
      Math.abs(stripAfter.width - stripBox.width),
      `opening the panel changed the top strip's width at ${vp.name}`,
    ).toBeLessThanOrEqual(1)
    const laneAfter = await page.getByTestId("topology-external-destinations-lane").boundingBox()
    expect(
      Math.abs((laneAfter?.width ?? laneBefore?.width ?? 0) - (laneBefore?.width ?? 0)),
      `opening the panel widened the external lane at ${vp.name}`,
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
      const cs = getComputedStyle(p)
      const bg = cs.backgroundColor
      // rgb(...) is opaque; rgba(...) carries the alpha as the 4th component.
      const alpha = /rgba?\(([^)]+)\)/.exec(bg)?.[1].split(",").map(v => v.trim())[3]
      return {
        captionPx: px(p.querySelector("p")!),
        minLegPx: Math.min(...legs.map(px)),
        // A wrapped line is fine; a line wider than its own box is clipped text.
        clipped: legs.filter(el => el.scrollWidth > el.clientWidth + 1).length,
        background: bg,
        backgroundAlpha: alpha === undefined ? 1 : Number(alpha),
        // An opaque background is not enough: a running entrance keyframe
        // fades the whole element and its text paints through to the map.
        opacity: Number(cs.opacity),
        animationName: cs.animationName,
        effectiveOpacity: (() => {
          let node: Element | null = p
          let product = 1
          while (node && node !== document.documentElement) {
            product *= Number(getComputedStyle(node).opacity)
            node = node.parentElement
          }
          return product
        })(),
        // Nothing may paint over the panel's own box: an opaque panel drawn
        // UNDER the map reads exactly like a translucent one.
        coveredProbes: (() => {
          const r = p.getBoundingClientRect()
          const probes: Array<[number, number]> = [
            [r.left + r.width * 0.5, r.top + 6],
            [r.left + r.width * 0.5, r.top + r.height * 0.5],
            [r.left + r.width * 0.5, r.bottom - 6],
          ]
          return probes.filter(([x, y]) => {
            const top = document.elementFromPoint(x, y)
            return !top || !(p === top || p.contains(top))
          }).length
        })(),
      }
    })
    expect(readable, "the panel is measurable").not.toBeNull()
    expect(readable!.captionPx, `panel caption below 11px at ${vp.name}`).toBeGreaterThanOrEqual(11)
    expect(readable!.minLegPx, `panel leg text below 11px at ${vp.name}`).toBeGreaterThanOrEqual(11)
    expect(readable!.clipped, `clipped leg lines at ${vp.name}`).toBe(0)
    // A panel with a transparent ground paints its text onto the map and is
    // unreadable however large the type is.
    expect(
      readable!.backgroundAlpha,
      `panel ground is not opaque at ${vp.name} (${readable!.background})`,
    ).toBe(1)
    expect(readable!.opacity, `panel is translucent at ${vp.name}`).toBe(1)
    // The one that matters: an ancestor can fade the panel just as effectively.
    expect(
      readable!.effectiveOpacity,
      `panel's EFFECTIVE opacity is below 1 at ${vp.name}`,
    ).toBeGreaterThanOrEqual(0.999)
    expect(
      readable!.coveredProbes,
      `something paints over the panel at ${vp.name} — an opaque panel under the map reads as translucent`,
    ).toBe(0)
    // animationName is reported, not asserted: a FINISHED keyframe still reads
    // back as `enter` with playState `running`, so asserting it fails forever
    // on a panel that is already settled (run 34856385832).

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
    // The published artifact is the evidence, so it waits for the same settled
    // state the assertions measured rather than catching a mid-fade frame.
    await waitForSettledPanel(page, `${vp.name} · expanded screenshot`)
    await page.screenshot({
      path: `test-results/estate-lower-geometry-${vp.name}.png`,
      fullPage: false,
    })
  })
}
