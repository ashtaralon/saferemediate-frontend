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

async function expectPanelBoundedAndTopmost(
  page: Page,
  testId: string,
  viewport: { name: string; width: number; height: number },
) {
  await page.waitForFunction((id) => {
    const panel = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
    if (!panel) return false
    let opacity = 1
    for (let node: Element | null = panel; node && node !== document.documentElement; node = node.parentElement) {
      opacity *= Number(getComputedStyle(node).opacity)
    }
    const rect = panel.getBoundingClientRect()
    const probes: Array<[number, number]> = [
      [rect.left + rect.width * 0.5, rect.top + 6],
      [rect.left + rect.width * 0.5, rect.top + rect.height * 0.5],
      [rect.left + rect.width * 0.5, rect.bottom - 6],
    ]
    return opacity >= 0.999 && probes.every(([x, y]) => {
      const top = document.elementFromPoint(x, y)
      return Boolean(top && (top === panel || panel.contains(top)))
    })
  }, testId)
  const panel = page.getByTestId(testId)
  const rect = await panel.boundingBox()
  expect(rect, `${testId} is measurable at ${viewport.name}`).not.toBeNull()
  expect(rect!.x, `${testId} is off the left at ${viewport.name}`).toBeGreaterThanOrEqual(-1)
  expect(rect!.y, `${testId} is off the top at ${viewport.name}`).toBeGreaterThanOrEqual(-1)
  expect(rect!.x + rect!.width, `${testId} is off the right at ${viewport.name}`).toBeLessThanOrEqual(viewport.width + 1)
  expect(rect!.y + rect!.height, `${testId} is off the bottom at ${viewport.name}`).toBeLessThanOrEqual(viewport.height + 1)
}

/** Every drawn flow badge, and the overlay it is supposed to stay inside. *//** Every drawn flow badge, and the overlay it is supposed to stay inside. */
async function badgesOutsideOverlay(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')
    if (!root) return { overlay: null, escaped: [] as Array<Record<string, unknown>> }
    const svg = root.querySelector('[data-testid="topology-flow-overlay"]')
    if (!svg) return { overlay: null, escaped: [] as Array<Record<string, unknown>> }
    const o = svg.getBoundingClientRect()
    const escaped: Array<Record<string, unknown>> = []
    for (const g of Array.from(root.querySelectorAll('[data-testid="topology-flow-badge"]'))) {
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
      const el = root.querySelector(sel)
      if (el) chrome.push({ name, r: el.getBoundingClientRect() })
    }
    const overChrome: Array<Record<string, unknown>> = []
    for (const g of Array.from(root.querySelectorAll('[data-testid="topology-flow-badge"]'))) {
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
      total: root.querySelectorAll('[data-testid="topology-flow-badge"]').length,
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
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
    await page.getByRole("tab", { name: "Network topology" }).click()
    await page.getByTestId("topology-estate-map-enlarge").click()
    const map = page.getByTestId("topology-estate-map-fullscreen")
    await expect(map).toBeVisible()

    // --- default state: every on-demand section closed ---------------------
    const coverageTrigger = map.getByTestId("topology-lane-coverage-trigger")
    await expect(coverageTrigger).toBeVisible()
    await expect(coverageTrigger).toHaveAttribute("aria-label", "Flow-log coverage")
    await expect(coverageTrigger).toHaveAttribute("aria-expanded", "false")
    // Coverage no longer taxes the map's vertical budget. Its detailed row is
    // not mounted until the operator asks for it from the toolbar.
    await expect(map.getByTestId("topology-lane-coverage")).toHaveCount(0)
    await expect(page.getByTestId("topology-lane-coverage-panel")).toHaveCount(0)

    const groupsTrigger = map.getByTestId("topology-logical-group-band-toggle")
    await expect(groupsTrigger).toBeVisible()
    await expect(groupsTrigger).toHaveAttribute("aria-label", `Logical groups, ${groups.groups.length}`)
    await expect(groupsTrigger).toHaveAttribute("aria-expanded", "false")
    await expect(groupsTrigger).toContainText(`Groups (${groups.groups.length})`)
    // Group detail is portaled on demand and consumes no Data-tier height.
    await expect(page.getByTestId("topology-logical-group-band")).toHaveCount(0)
    await expect(
      map.getByTestId("topology-region-frame").getByTestId("topology-logical-group-band"),
    ).toHaveCount(0)

    const groupsBox = (await groupsTrigger.boundingBox())!
    expect(groupsBox.x, `Groups control off the left at ${vp.name}`).toBeGreaterThanOrEqual(-1)
    expect(groupsBox.y, `Groups control off the top at ${vp.name}`).toBeGreaterThanOrEqual(-1)
    expect(groupsBox.x + groupsBox.width, `Groups control off the right at ${vp.name}`).toBeLessThanOrEqual(vp.width + 1)
    expect(groupsBox.y + groupsBox.height, `Groups control off the bottom at ${vp.name}`).toBeLessThanOrEqual(vp.height + 1)
    expect(
      await overlapArea(groupsTrigger, coverageTrigger),
      `Groups and Coverage controls overlap at ${vp.name}`,
    ).toBe(0)
    const lensToggle = map.getByTestId("topology-flow-mode-toggle")
    await expect(lensToggle).toBeVisible()
    expect(
      await overlapArea(groupsTrigger, lensToggle),
      `Groups and Map lens controls overlap at ${vp.name}`,
    ).toBe(0)

    const external = map.getByTestId("topology-external-destinations")
    await expect(external).toBeVisible()
    await expect(external).toHaveAttribute("data-open", "false")
    await expect(external).toHaveAttribute("data-leg-count", String(egress.legCount))
    await expect(page.getByTestId("topology-external-destinations-details")).toBeHidden()

    const s3 = map.getByTestId("topology-lambda-s3-coverage")
    await expect(s3).toBeVisible()
    await expect(s3).toHaveAttribute("data-open", "false")
    await expect(s3).toHaveAttribute("data-with-traffic", String(triggers.s3Functions.length))
    await expect(s3).toHaveAttribute("data-total", String(triggers.lambdas.length))
    await expect(page.getByTestId("topology-lambda-s3-coverage-details")).toBeHidden()
    const triggerDetails = map.getByTestId("topology-triggers-detail-trigger")
    await expect(triggerDetails).toBeVisible()
    await expect(triggerDetails).toHaveAttribute("aria-expanded", "false")
    await expect(page.getByTestId("topology-triggers-detail-panel")).toHaveCount(0)

    // The strip is centre-justified: an overflow is split between both ends,
    // so the USERS block is the half that leaves the screen first.
    const strip = map.getByTestId("topology-users-internet-strip")
    const stripBox = (await strip.boundingBox())!
    const laneBefore = await map.getByTestId("topology-external-destinations-lane").boundingBox()
    const usersBox = (await map.getByTestId("topology-users-node").boundingBox())!
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
    const dataCells = map.locator('[data-tier="data"]')
    const cellCount = await dataCells.count()
    expect(cellCount, "the fixture draws a data tier to overlap with").toBeGreaterThan(0)
    for (let i = 0; i < cellCount; i++) {
      for (const [name, block] of [["external-destinations node", external]] as const) {
        const area = await overlapArea(block, dataCells.nth(i))
        expect(area, `${name} overlaps data-tier cell ${i} by ${area}px^2 at ${vp.name}`).toBe(0)
      }
    }

    // Physical database instances remain in their evidence-backed Data cells.
    // The group/member panel is a second view over those members, never their
    // replacement on the canvas.
    const physicalDataMemberIds = groups.groups
      .filter(group => group.protocol === "MEMBER_OF_CLUSTER")
      .flatMap(group => group.members)
      .filter(member => member.subnet_id)
      .map(member => member.id)
    const dataPlacement = await map.evaluate((root, ids) => ids.map(id => {
      const node = Array.from(root.querySelectorAll<HTMLElement>("[data-flow-id]"))
        .find(element => element.dataset.flowId === id)
      const cell = node?.closest<HTMLElement>('[data-tier="data"]') ?? null
      const nodeRect = node?.getBoundingClientRect()
      const cellRect = cell?.getBoundingClientRect()
      return {
        id,
        rendered: Boolean(node && nodeRect && nodeRect.width > 0 && nodeRect.height > 0),
        inDataCell: Boolean(cell),
        contained: Boolean(
          nodeRect && cellRect &&
          nodeRect.left >= cellRect.left - 1 && nodeRect.right <= cellRect.right + 1 &&
          nodeRect.top >= cellRect.top - 1 && nodeRect.bottom <= cellRect.bottom + 1
        ),
        topmost: Boolean(node && nodeRect && (() => {
          const hit = document.elementFromPoint(
            nodeRect.left + nodeRect.width / 2,
            nodeRect.top + nodeRect.height / 2,
          )
          return hit && (hit === node || node.contains(hit))
        })()),
      }
    }), physicalDataMemberIds)
    expect(physicalDataMemberIds.length, "the fixture has physical Data members").toBeGreaterThan(0)
    expect(
      dataPlacement.filter(item => !item.rendered || !item.inDataCell || !item.contained || !item.topmost),
      `physical Data nodes hidden or covered at ${vp.name}`,
    ).toEqual([])

    const dataTopBefore = await map.evaluate(root => {
      const region = root.querySelector('[data-testid="topology-region-frame"]')
      const cells = Array.from(root.querySelectorAll<HTMLElement>('[data-tier="data"]'))
      if (!region || cells.length === 0) return null
      const regionTop = region.getBoundingClientRect().top
      return Math.min(...cells.map(cell => cell.getBoundingClientRect().top)) - regionTop
    })
    expect(dataTopBefore, `Data tier has a measurable top at ${vp.name}`).not.toBeNull()

    // --- on demand, the content is still reachable AND contained -----------
    await groupsTrigger.focus()
    if (vp.name === "1512x771") await groupsTrigger.click()
    else await page.keyboard.press("Enter")
    await expect(groupsTrigger).toHaveAttribute("aria-expanded", "true")
    const groupsPanel = page.getByTestId("topology-logical-group-band")
    await expect(groupsPanel).toHaveAttribute("role", "dialog")
    await expect(groupsPanel.getByTestId("topology-logical-group")).toHaveCount(groups.groups.length)
    await expect(groupsPanel.getByTestId("topology-logical-group-member").first()).toBeVisible()
    await expectPanelBoundedAndTopmost(page, "topology-logical-group-band", vp)
    await expect(
      map.getByTestId("topology-region-frame").getByTestId("topology-logical-group-band"),
    ).toHaveCount(0)
    const dataTopWhileOpen = await map.evaluate(root => {
      const region = root.querySelector('[data-testid="topology-region-frame"]')
      const cells = Array.from(root.querySelectorAll<HTMLElement>('[data-tier="data"]'))
      if (!region || cells.length === 0) return null
      const regionTop = region.getBoundingClientRect().top
      return Math.min(...cells.map(cell => cell.getBoundingClientRect().top)) - regionTop
    })
    expect(
      Math.abs((dataTopWhileOpen ?? Number.NaN) - dataTopBefore!),
      `opening Groups shifted the Data tier at ${vp.name}`,
    ).toBeLessThanOrEqual(1)
    await groupsPanel.getByTestId("topology-logical-group-member").first().focus()
    await page.keyboard.press("Escape")
    await expect(groupsPanel).toHaveCount(0)
    await expect(groupsTrigger).toBeFocused()

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
    const laneAfter = await map.getByTestId("topology-external-destinations-lane").boundingBox()
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

    await coverageTrigger.focus()
    await coverageTrigger.click()
    await expect(coverageTrigger).toHaveAttribute("aria-expanded", "true")
    const coveragePanel = page.getByTestId("topology-lane-coverage-panel")
    await expect(coveragePanel).toBeVisible()
    await expect(coveragePanel).toHaveAttribute("role", "dialog")
    await expect(coveragePanel.getByTestId("topology-lane-coverage-lanes")).toBeVisible()
    await page.waitForFunction(() => {
      const panel = document.querySelector<HTMLElement>('[data-testid="topology-lane-coverage-panel"]')
      if (!panel) return false
      let node: Element | null = panel
      let opacity = 1
      while (node && node !== document.documentElement) {
        opacity *= Number(getComputedStyle(node).opacity)
        node = node.parentElement
      }
      if (opacity < 0.999) return false
      const rect = panel.getBoundingClientRect()
      return [
        [rect.left + rect.width * 0.5, rect.top + 6],
        [rect.left + rect.width * 0.5, rect.top + rect.height * 0.5],
        [rect.left + rect.width * 0.5, rect.bottom - 6],
      ].every(([x, y]) => {
        const top = document.elementFromPoint(x, y)
        return Boolean(top && (top === panel || panel.contains(top)))
      })
    })
    const coverageReadability = await coveragePanel.evaluate(panel => {
      const rect = panel.getBoundingClientRect()
      const style = getComputedStyle(panel)
      const alpha = /rgba?\(([^)]+)\)/.exec(style.backgroundColor)?.[1]
        .split(",")
        .map(value => value.trim())[3]
      const probes: Array<[number, number]> = [
        [rect.left + rect.width * 0.5, rect.top + 6],
        [rect.left + rect.width * 0.5, rect.top + rect.height * 0.5],
        [rect.left + rect.width * 0.5, rect.bottom - 6],
      ]
      let ancestor: Element | null = panel
      let effectiveOpacity = 1
      while (ancestor && ancestor !== document.documentElement) {
        effectiveOpacity *= Number(getComputedStyle(ancestor).opacity)
        ancestor = ancestor.parentElement
      }
      return {
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        backgroundAlpha: alpha === undefined ? 1 : Number(alpha),
        effectiveOpacity,
        coveredProbes: probes.filter(([x, y]) => {
          const top = document.elementFromPoint(x, y)
          return !top || !(top === panel || panel.contains(top))
        }).length,
      }
    })
    expect(coverageReadability.rect.left).toBeGreaterThanOrEqual(-1)
    expect(coverageReadability.rect.top).toBeGreaterThanOrEqual(-1)
    expect(coverageReadability.rect.right).toBeLessThanOrEqual(vp.width + 1)
    expect(coverageReadability.rect.bottom).toBeLessThanOrEqual(vp.height + 1)
    expect(coverageReadability.backgroundAlpha).toBe(1)
    expect(coverageReadability.effectiveOpacity).toBeGreaterThanOrEqual(0.999)
    expect(coverageReadability.coveredProbes).toBe(0)
    await page.keyboard.press("Escape")
    await expect(coveragePanel).toHaveCount(0)
    await expect(coverageTrigger).toBeFocused()

    // Narrow screens keep the topology honest instead of compressing the VPC
    // under its off-VPC lanes. Prove the final regional rail can be reached by
    // the region's own horizontal canvas and is neither clipped nor covered at
    // the end of that scroll range.
    const railAccess = await map.evaluate(async root => {
      const region = root.querySelector<HTMLElement>('[data-testid="topology-region-frame"]')
      const rail = root.querySelector<HTMLElement>('[data-testid="topology-edge-services-rail"]')
      if (!region || !rail) return null
      const previousScrollLeft = region.scrollLeft
      const maxScroll = Math.max(0, region.scrollWidth - region.clientWidth)
      region.scrollLeft = maxScroll
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      const regionRect = region.getBoundingClientRect()
      const railRect = rail.getBoundingClientRect()
      const hit = document.elementFromPoint(
        railRect.left + railRect.width / 2,
        railRect.top + Math.min(railRect.height / 2, 80),
      )
      const result = {
        maxScroll,
        railLeft: railRect.left,
        railRight: railRect.right,
        regionLeft: regionRect.left,
        regionRight: regionRect.right,
        topmost: Boolean(hit && (hit === rail || rail.contains(hit))),
      }
      region.scrollLeft = previousScrollLeft
      return result
    })
    expect(railAccess, `regional rail is measurable at ${vp.name}`).not.toBeNull()
    expect(railAccess!.maxScroll, `region has a horizontal access range at ${vp.name}`).toBeGreaterThan(0)
    expect(railAccess!.railLeft, `regional rail clipped left at max scroll at ${vp.name}`).toBeGreaterThanOrEqual(
      railAccess!.regionLeft - 1,
    )
    expect(railAccess!.railRight, `regional rail clipped right at max scroll at ${vp.name}`).toBeLessThanOrEqual(
      railAccess!.regionRight + 1,
    )
    expect(railAccess!.topmost, `regional rail covered at max scroll at ${vp.name}`).toBe(true)

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

test("logical-group detail remains keyboard reachable at a 375px viewport", async ({ context, page }) => {
  test.setTimeout(120_000)
  const groups = logicalGroupSnapshot()
  await seedAuthCookie(context)
  await routeSnapshot(page, groups.snapshot)
  const viewport = { name: "375x812", width: 375, height: 812 }
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  await page.getByRole("tab", { name: "Network topology" }).click()
  await page.getByTestId("topology-estate-map-enlarge").click()
  const map = page.getByTestId("topology-estate-map-fullscreen")
  const trigger = map.getByTestId("topology-logical-group-band-toggle")
  await expect(trigger).toBeVisible()
  const triggerBox = (await trigger.boundingBox())!
  expect(triggerBox.x).toBeGreaterThanOrEqual(-1)
  expect(triggerBox.x + triggerBox.width).toBeLessThanOrEqual(viewport.width + 1)
  await expect(page.getByTestId("topology-logical-group-band")).toHaveCount(0)

  await trigger.focus()
  await page.keyboard.press("Enter")
  const panel = page.getByTestId("topology-logical-group-band")
  await expect(panel.getByTestId("topology-logical-group")).toHaveCount(groups.groups.length)
  await expectPanelBoundedAndTopmost(page, "topology-logical-group-band", viewport)
  await page.keyboard.press("Escape")
  await expect(panel).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(map).toBeVisible()
})
