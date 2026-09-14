import { expect, test, type Page } from "@playwright/test"
import { seedAuthCookie } from "./live-auth"
import {
  ESTATE_URL,
  externalEgressSnapshot,
  logicalGroupSnapshot,
  routeSnapshot,
  triggerBundleSnapshot,
} from "./topology-fixture"

/** The External destinations panel must be TOPMOST inside map fullscreen.
 *
 *  WHY A SECOND SPEC AND NOT ANOTHER CASE IN THE GEOMETRY ONE. The geometry
 *  spec measures the panel in the EMBEDDED map, where nothing on the page
 *  claims a z-index at all — so the panel's wrapper wins the paint order at
 *  any value and every probe passes. Fullscreen is a different stacking
 *  world: `topology-estate-map-fullscreen` is `fixed inset-0 z-[200]`. That
 *  layer is the whole defect, and a spec that never enters it cannot see it.
 *  Independent production QA on 5cc2507d found exactly that at 1512x771 —
 *  disclosure expanded, panel present at x=943.5 y=224 460x202.625 with
 *  opacity 1 and an opaque white ground, and `elementFromPoint` inside it
 *  returning the map underneath. Ten automated checks were green at the time.
 *
 *  WHAT IT PINS. Radix's PopperContent reads the CONTENT's computed z-index
 *  in a layout effect and copies it onto the fixed wrapper as an INLINE
 *  style. Three consequences, each asserted below rather than assumed:
 *    · the wrapper's order comes from the content's class, so a stylesheet
 *      rule aimed at `[data-radix-popper-content-wrapper]` can never win
 *      against it — the removed `z-index: 60` rule was inert;
 *    · the panel is portaled to the body, OUTSIDE the fullscreen layer, so
 *      the two are siblings in the root stacking context and the numbers
 *      alone decide; and
 *    · the number that matters is the wrapper's, not the content's.
 *
 *  The hit test is the assertion of record. An opaque panel painted under
 *  the map has opacity 1, an opaque background and correct geometry — every
 *  property except the one a reader actually experiences. Only
 *  `elementFromPoint` distinguishes "drawn" from "visible". */
const VIEWPORTS = [
  { name: "1600x900", width: 1600, height: 900 },
  { name: "1512x771", width: 1512, height: 771 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1024x720", width: 1024, height: 720 },
] as const

/** Everything needed to say WHY the panel is or is not on top, in one read.
 *
 *  Reported together on purpose: a bare "covered" tells you the panel lost
 *  without saying to what or by how much, and that costs a CI round trip to
 *  find out. `hit` names the element that won each probe. */
const STACKING_PROBE = `(() => {
  const el = document.querySelector('[data-testid="topology-external-destinations-details"]')
  if (!el) return null
  const wrapper = el.closest('[data-radix-popper-content-wrapper]')
  const fs = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')
  const zOf = (n) => {
    if (!n) return null
    const v = getComputedStyle(n).zIndex
    return v === 'auto' ? null : Number(v)
  }
  let node = el
  let product = 1
  while (node && node !== document.documentElement) {
    product *= Number(getComputedStyle(node).opacity)
    node = node.parentElement
  }
  const r = el.getBoundingClientRect()
  const probes = [
    ['top', r.left + r.width * 0.5, r.top + 6],
    ['middle', r.left + r.width * 0.5, r.top + r.height * 0.5],
    ['bottom', r.left + r.width * 0.5, r.bottom - 6],
    ['left', r.left + 6, r.top + r.height * 0.5],
    ['right', r.right - 6, r.top + r.height * 0.5],
  ]
  const covered = []
  for (const [name, x, y] of probes) {
    const top = document.elementFromPoint(x, y)
    if (!top || !(el === top || el.contains(top))) {
      covered.push({
        probe: name,
        x: Math.round(x),
        y: Math.round(y),
        hit: top
          ? (top.getAttribute('data-testid') || top.tagName.toLowerCase() + '.' + String(top.className).slice(0, 48))
          : 'nothing',
      })
    }
  }
  return {
    hasWrapper: !!wrapper,
    wrapperZ: zOf(wrapper),
    contentZ: zOf(el),
    fullscreenZ: zOf(fs),
    // The panel is portaled to the body, so it is NOT a descendant of the
    // fullscreen layer. That is precisely why the z-indexes have to be
    // compared: if this were ever true, the layer would carry the panel with
    // it and the numbers would stop mattering.
    panelInsideFullscreen: !!(fs && wrapper && fs.contains(wrapper)),
    effectiveOpacity: product,
    rect: { x: r.left, y: r.top, w: r.width, h: r.height },
    covered,
  }
})()`

async function probe(page: Page) {
  return page.evaluate(STACKING_PROBE) as Promise<{
    hasWrapper: boolean
    wrapperZ: number | null
    contentZ: number | null
    fullscreenZ: number | null
    panelInsideFullscreen: boolean
    effectiveOpacity: number
    rect: { x: number; y: number; w: number; h: number }
    covered: Array<{ probe: string; x: number; y: number; hit: string }>
  } | null>
}

/** Settle on the same predicate the assertions use, so a screenshot can never
 *  capture a frame the measurements would have rejected. */
async function waitForSettledPanel(page: Page, where: string) {
  try {
    await page.waitForFunction(
      `(() => { const s = ${STACKING_PROBE}; return !!s && s.effectiveOpacity >= 0.999 && s.covered.length === 0 })()`,
      undefined,
      { timeout: 10_000 },
    )
  } catch {
    const state = await probe(page)
    throw new Error(
      `the panel never settled opaque and on top in fullscreen (${where}): ${JSON.stringify(state)}`,
    )
  }
}

for (const vp of VIEWPORTS) {
  test(`external-destinations panel is topmost inside map fullscreen at ${vp.name}`, async ({
    context,
    page,
  }) => {
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

    // --- enter the real z-200 layer ----------------------------------------
    await page.getByTestId("topology-estate-map-enlarge").click()
    const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
    await expect(fullscreen).toBeVisible()

    // Anchor the test to the layer it is about. If the fullscreen z-index is
    // ever changed, this line says so directly instead of leaving a hit test
    // to fail somewhere further down with a confusing message.
    const fullscreenZ = await fullscreen.evaluate(el => getComputedStyle(el).zIndex)
    expect(fullscreenZ, "the fullscreen layer no longer carries z-index 200").toBe("200")

    // The trigger lives INSIDE that layer; the panel will not.
    const external = fullscreen.getByTestId("topology-external-destinations")
    await expect(external).toBeVisible()
    await expect(external).toHaveAttribute("data-open", "false")
    await expect(external).toHaveAttribute("data-leg-count", String(egress.legCount))
    await page.screenshot({
      path: `test-results/estate-fullscreen-default-${vp.name}.png`,
      fullPage: false,
    })

    // --- open it and measure the paint order -------------------------------
    await external.getByTestId("topology-external-destinations-toggle").click()
    await expect(external).toHaveAttribute("data-open", "true")
    const panel = page.getByTestId("topology-external-destinations-details")
    await expect(panel).toHaveCount(1)
    await expect(panel).toBeVisible()
    await waitForSettledPanel(page, `${vp.name} · measurement`)

    const s = await probe(page)
    expect(s, "the panel is measurable in fullscreen").not.toBeNull()
    expect(s!.hasWrapper, "Radix no longer wraps the content in a popper wrapper").toBe(true)
    expect(
      s!.panelInsideFullscreen,
      "the panel is portaled into the fullscreen layer now — the z-index comparison below no longer describes the real stacking",
    ).toBe(false)

    // The mechanism, asserted rather than trusted: the wrapper's order is the
    // CONTENT's order, copied inline. If Radix ever stops propagating it, the
    // wrapper falls back to `auto` and this fails with that fact named.
    expect(s!.contentZ, `the panel content carries no z-index at ${vp.name}`).not.toBeNull()
    expect(s!.wrapperZ, `the popper wrapper carries no z-index at ${vp.name}`).not.toBeNull()
    expect(
      s!.wrapperZ,
      `Radix did not copy the content's z-index onto the wrapper at ${vp.name} (content ${s!.contentZ}, wrapper ${s!.wrapperZ})`,
    ).toBe(s!.contentZ)

    // The invariant that makes it visible, stated as the comparison rather
    // than as a magic number, so it keeps holding if either layer moves.
    expect(s!.fullscreenZ, "the fullscreen layer is measurable").not.toBeNull()
    expect(
      s!.wrapperZ!,
      `the panel's wrapper (${s!.wrapperZ}) is not above the fullscreen layer (${s!.fullscreenZ}) at ${vp.name}`,
    ).toBeGreaterThan(s!.fullscreenZ!)

    // The assertion of record. Everything above can be right and the reader
    // still see the map: this is the one that matches what they experience.
    expect(
      s!.covered,
      `something paints over the panel inside fullscreen at ${vp.name} — an opaque panel under the map is invisible, not translucent: ${JSON.stringify(s!.covered)}`,
    ).toEqual([])
    expect(
      s!.effectiveOpacity,
      `panel's effective opacity is below 1 in fullscreen at ${vp.name}`,
    ).toBeGreaterThanOrEqual(0.999)

    // Contained and legible where it landed — fullscreen has its own chrome
    // and its own collision boundary, so the embedded measurement does not
    // carry over.
    expect(s!.rect.x, `panel off the left at ${vp.name}`).toBeGreaterThanOrEqual(-1)
    expect(s!.rect.y, `panel off the top at ${vp.name}`).toBeGreaterThanOrEqual(-1)
    expect(s!.rect.x + s!.rect.w, `panel off the right at ${vp.name}`).toBeLessThanOrEqual(vp.width + 1)
    expect(s!.rect.y + s!.rect.h, `panel off the bottom at ${vp.name}`).toBeLessThanOrEqual(
      vp.height + 1,
    )
    expect(s!.rect.w, `panel too narrow to read at ${vp.name}`).toBeGreaterThanOrEqual(260)
    await expect(panel.getByTestId("topology-external-destination-leg")).toHaveCount(egress.legCount)

    const legible = await panel.evaluate(p => {
      const px = (el: Element) => parseFloat(getComputedStyle(el).fontSize)
      const legs = Array.from(
        p.querySelectorAll<HTMLElement>('[data-testid="topology-external-destination-leg"]'),
      )
      return {
        captionPx: px(p.querySelector("p")!),
        minLegPx: Math.min(...legs.map(px)),
        clipped: legs.filter(el => el.scrollWidth > el.clientWidth + 1).length,
      }
    })
    expect(legible.captionPx, `panel caption below 11px at ${vp.name}`).toBeGreaterThanOrEqual(11)
    expect(legible.minLegPx, `panel leg text below 11px at ${vp.name}`).toBeGreaterThanOrEqual(11)
    expect(legible.clipped, `clipped leg lines at ${vp.name}`).toBe(0)

    await page.screenshot({
      path: `test-results/estate-fullscreen-expanded-${vp.name}.png`,
      fullPage: false,
    })

    // The panel closes with its own control and fullscreen still stands: a
    // popover that tore the layer down would also "pass" every check above.
    await external.getByTestId("topology-external-destinations-toggle").click()
    await expect(external).toHaveAttribute("data-open", "false")
    await expect(fullscreen).toBeVisible()
  })
}
