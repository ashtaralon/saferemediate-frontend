import { expect, test, type Locator, type Page } from "@playwright/test"
import { seedAuthCookie } from "./live-auth"
import {
  ESTATE_URL,
  externalEgressSnapshot,
  logicalGroupSnapshot,
  noEgressSnapshot,
  routeSnapshot,
  triggerBundleSnapshot,
} from "./topology-fixture"

/** The acceptance this spec exists for: the map must DRAW the traffic leaving
 *  the VPC, from the IGW the map itself draws to the destinations it reached.
 *
 *  WHY THE OLD ASSERTIONS DID NOT COVER IT. Every earlier check was satisfied
 *  by a header sentence: the strip named a chain, the popover listed the legs,
 *  and both passed while the canvas showed nothing continuing past the
 *  gateway. A reader looking at the map could not see where the traffic went.
 *  So the assertion of record here is GEOMETRIC — a drawn path whose two
 *  endpoints land on the IGW chip and on a destination node — and it is
 *  checked on the real overlay, not on a data attribute that could be present
 *  while nothing is drawn.
 *
 *  This spec FAILS on 5cc2507d by construction: that build renders no external
 *  lane, so there is no destination chip for an edge to end on.
 *
 *  Glance AND Inventory: the two densities swap chips for stack tiles and have
 *  already broken flow anchoring once (every edge vanished at Fit, 2026-07-04).
 *  A continuation that exists in one density only is half a feature. */
const VIEWPORTS = [
  { name: "1600x900", width: 1600, height: 900 },
  { name: "1512x771", width: 1512, height: 771 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1024x720", width: 1024, height: 720 },
] as const

const DENSITIES = ["glance", "inventory"] as const

/** Both endpoints of every drawn gateway -> destination path, in CLIENT
 *  coordinates, beside the rects they are supposed to land on.
 *
 *  `getPointAtLength` + `getScreenCTM` rather than parsing `d`: the path is a
 *  curve through routed waypoints, so its control points say nothing about
 *  where the line visibly starts and ends. The SVG API answers exactly that,
 *  through whatever transform the zoom applied. */
const CONTINUATION_GEOMETRY = `(() => {
  const svg = document.querySelector('[data-testid="topology-flow-overlay"]')
  const igw = document.querySelector('[data-flow-id="__igw__"]')
  const out = { hasOverlay: !!svg, hasIgw: !!igw, igwRect: null, paths: [], destinations: [] }
  if (igw) {
    const r = igw.getBoundingClientRect()
    out.igwRect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  }
  for (const node of Array.from(document.querySelectorAll('[data-testid="topology-external-destination-node"], [data-testid="topology-external-destination-unknown"]'))) {
    const r = node.getBoundingClientRect()
    out.destinations.push({
      flowId: node.getAttribute('data-flow-id'),
      identity: node.getAttribute('data-identity') || 'unknown-group',
      rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
    })
  }
  if (!svg) return out
  for (const g of Array.from(svg.querySelectorAll('g[data-flow-source="__igw__"]'))) {
    const target = g.getAttribute('data-flow-target') || ''
    if (target.indexOf('extdst:') !== 0) continue
    const path = g.querySelector('path[d]')
    if (!path) continue
    const total = path.getTotalLength()
    if (!total) continue
    const m = path.getScreenCTM()
    if (!m) continue
    const a = path.getPointAtLength(0).matrixTransform(m)
    const b = path.getPointAtLength(total).matrixTransform(m)
    out.paths.push({ target: target, start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y }, length: total })
  }
  return out
})()`

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/** Within `pad` px of the rect. The overlay leaves a small gap at each end for
 *  the arrowhead and the chip's own border, so an endpoint that lands exactly
 *  on the edge is correct and one that lands 200px away is not. */
function near(p: { x: number; y: number }, r: Rect, pad = 28): boolean {
  return (
    p.x >= r.left - pad && p.x <= r.right + pad && p.y >= r.top - pad && p.y <= r.bottom + pad
  )
}

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  return w > 0 && h > 0 ? w * h : 0
}

async function rectOf(loc: Locator): Promise<Rect | null> {
  const b = await loc.boundingBox()
  return b ? { left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height } : null
}

/** Topmost + opaque, the same predicate the fullscreen stacking spec uses:
 *  a panel drawn under the map has opacity 1 and correct geometry and is
 *  still invisible. */
const PANEL_TOPMOST = (testid: string) => `(() => {
  const el = document.querySelector('[data-testid="${testid}"]')
  if (!el) return null
  let node = el, product = 1
  while (node && node !== document.documentElement) {
    product *= Number(getComputedStyle(node).opacity)
    node = node.parentElement
  }
  const r = el.getBoundingClientRect()
  const probes = [
    ['top', r.left + r.width * 0.5, r.top + 6],
    ['middle', r.left + r.width * 0.5, r.top + r.height * 0.5],
    ['bottom', r.left + r.width * 0.5, r.bottom - 6],
  ]
  const covered = []
  for (const [name, x, y] of probes) {
    const top = document.elementFromPoint(x, y)
    if (!top || !(el === top || el.contains(top))) {
      covered.push({ probe: name, hit: top ? (top.getAttribute('data-testid') || top.tagName.toLowerCase()) : 'nothing' })
    }
  }
  return { effectiveOpacity: product, covered, rect: { x: r.left, y: r.top, w: r.width, h: r.height } }
})()`

async function waitTopmost(page: Page, testid: string, where: string) {
  try {
    await page.waitForFunction(
      `(() => { const s = ${PANEL_TOPMOST(testid)}; return !!s && s.effectiveOpacity >= 0.999 && s.covered.length === 0 })()`,
      undefined,
      { timeout: 10_000 },
    )
  } catch {
    const state = await page.evaluate(PANEL_TOPMOST(testid))
    throw new Error(`${testid} never settled opaque and on top (${where}): ${JSON.stringify(state)}`)
  }
}

for (const density of DENSITIES) {
  for (const vp of VIEWPORTS) {
    test(`the IGW continues into the external lane at ${vp.name} · ${density}`, async ({
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
      await page.getByTestId(`topology-estate-density-${density}`).click()

      // --- DEFAULT state: the lane is on the canvas without a click ---------
      const lane = page.getByTestId("topology-external-destinations-lane")
      await expect(lane, "the external-destination lane is not drawn by default").toBeVisible()
      const nodeCount = Number(await lane.getAttribute("data-node-count"))
      expect(nodeCount, `no destination node drawn at ${vp.name}·${density}`).toBeGreaterThan(0)
      await expect(lane).toHaveAttribute("data-gateway-id", egress.igwId)
      expect(Number(await lane.getAttribute("data-total-named"))).toBe(egress.expectedNamed)

      // Identity, not decoration: exactly one node carries the payload's
      // attribution and every other drawn node stays an address.
      expect(Number(await lane.getAttribute("data-attributed-count"))).toBe(1)
      const attributed = lane.locator('[data-identity="aws_service"]')
      await expect(attributed).toHaveCount(1)
      await expect(attributed).toContainText(egress.attributedService)
      const addresses = lane.locator('[data-identity="address"]')
      expect(await addresses.count()).toBeGreaterThan(0)

      // Two provenances, never merged into one claim.
      const provenance = page.getByTestId("topology-external-destinations-provenance")
      await expect(provenance).toContainText("observed")
      await expect(provenance).toContainText("configured routing")

      // --- the acceptance: a DRAWN edge, gateway chip to destination chip ---
      await expect
        .poll(
          async () => {
            const g = (await page.evaluate(CONTINUATION_GEOMETRY)) as {
              paths: Array<{ target: string }>
            }
            return g.paths.length
          },
          {
            timeout: 20_000,
            message: `no IGW → external-destination edge is drawn at ${vp.name}·${density}`,
          },
        )
        .toBeGreaterThan(0)

      const geo = (await page.evaluate(CONTINUATION_GEOMETRY)) as {
        hasOverlay: boolean
        hasIgw: boolean
        igwRect: Rect | null
        paths: Array<{ target: string; start: { x: number; y: number }; end: { x: number; y: number }; length: number }>
        destinations: Array<{ flowId: string; identity: string; rect: Rect }>
      }
      expect(geo.hasOverlay, "the flow overlay is drawn").toBe(true)
      expect(geo.hasIgw, "the in-map IGW chip is drawn").toBe(true)
      expect(geo.igwRect, "the IGW chip has a rect to leave from").not.toBeNull()

      const byId = new Map(geo.destinations.map(d => [d.flowId, d.rect]))
      const landed = geo.paths.filter(p => {
        const dst = byId.get(p.target)
        if (!dst) return false
        // Either orientation: the overlay routes right-to-left when the
        // destination sits left of the gateway at a narrow viewport.
        const forward = near(p.start, geo.igwRect!) && near(p.end, dst)
        const reverse = near(p.end, geo.igwRect!) && near(p.start, dst)
        return forward || reverse
      })
      expect(
        landed.length,
        `a gateway→destination path is drawn but neither end lands on the chips at ${vp.name}·${density}: ${JSON.stringify(
          { igw: geo.igwRect, paths: geo.paths, destinations: geo.destinations },
        )}`,
      ).toBeGreaterThan(0)
      // A zero-length or hairline path would satisfy "an edge exists" while
      // drawing nothing a reader can see.
      expect(Math.max(...landed.map(p => p.length)), "the drawn continuation is a hairline").toBeGreaterThan(8)

      // --- containment: past the boundary, clear of the tiers it must not hide
      // The canvas is a horizontal scroll region with a width floor, so at a
      // narrow viewport the lane can sit to the right of the fold. Bring it
      // into view before measuring and before the frame: "visible by default"
      // means no disclosure to open, not that every viewport is wide enough to
      // hold the whole estate at once.
      await lane.scrollIntoViewIfNeeded()
      const laneRect = (await rectOf(lane))!
      const boundaryRect = await rectOf(page.getByTestId("topology-vpc-boundary-column"))
      if (boundaryRect) {
        expect(
          laneRect.left,
          `the external lane is not outside the VPC boundary at ${vp.name}·${density}`,
        ).toBeGreaterThanOrEqual(boundaryRect.right - 1)
      }
      // Inside the VIEWPORT once scrolled to, which is the claim that matters:
      // a lane drawn off the right edge of the window is not on the map.
      expect(laneRect.left, `lane off the left at ${vp.name}·${density}`).toBeGreaterThanOrEqual(-1)
      expect(
        laneRect.right,
        `lane not brought fully into view at ${vp.name}·${density}`,
      ).toBeLessThanOrEqual(vp.width + 1)
      const dataCells = page.locator('[data-tier="data"]')
      const cells = await dataCells.count()
      for (let i = 0; i < cells; i++) {
        const cell = await rectOf(dataCells.nth(i))
        if (!cell) continue
        expect(
          overlap(laneRect, cell),
          `the external lane overlaps data-tier cell ${i} at ${vp.name}·${density}`,
        ).toBe(0)
      }
      const rail = await rectOf(page.getByTestId("topology-edge-services-rail"))
      if (rail) {
        expect(
          overlap(laneRect, rail),
          `the external lane overlaps the services rail at ${vp.name}·${density}`,
        ).toBe(0)
      }
      // Readable, not a 6px sliver.
      expect(laneRect.right - laneRect.left, `lane too narrow to read at ${vp.name}`).toBeGreaterThanOrEqual(120)

      await page.screenshot({
        path: `test-results/estate-egress-map-default-${density}-${vp.name}.png`,
        fullPage: false,
      })

      // --- ON DEMAND: the bounded set says what it withheld -----------------
      const hidden = Number(await lane.getAttribute("data-hidden-count"))
      expect(hidden, "the fixture draws more destinations than the bound").toBeGreaterThan(0)
      const more = page.getByTestId("topology-external-destinations-more")
      await expect(more).toBeVisible()
      await expect(more).toContainText(`+${hidden}`)
      await more.click()
      await waitTopmost(page, "topology-external-destinations-more-details", `${vp.name}·${density}`)
      await page.keyboard.press("Escape")

      // The per-leg evidence detail, in the lane rather than the top strip.
      const external = page.getByTestId("topology-external-destinations")
      await expect(external).toHaveAttribute("data-open", "false")
      await external.getByTestId("topology-external-destinations-toggle").click()
      await expect(external).toHaveAttribute("data-open", "true")
      await waitTopmost(page, "topology-external-destinations-details", `${vp.name}·${density}`)
      await expect(
        page.getByTestId("topology-external-destinations-details").getByTestId("topology-external-destination-leg"),
      ).toHaveCount(egress.legCount)

      await page.screenshot({
        path: `test-results/estate-egress-map-expanded-${density}-${vp.name}.png`,
        fullPage: false,
      })
    })
  }
}

test("no lane, and no gateway continuation, when nothing leaves the VPC", async ({
  context,
  page,
}) => {
  // The negative that keeps every assertion above honest: a spec that only
  // ever sees a payload WITH egress cannot tell "drew the evidence" from
  // "always draws a lane".
  test.setTimeout(120_000)
  const empty = noEgressSnapshot()
  await seedAuthCookie(context)
  await routeSnapshot(page, empty.snapshot)
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  await page.getByRole("tab", { name: "Network topology" }).click()
  // The map itself still rendered — otherwise this passes on a blank page.
  await expect(page.getByTestId("topology-region-fill-grid")).toBeVisible()
  await expect(page.getByTestId("topology-external-destinations-lane")).toHaveCount(0)
  await expect(page.getByTestId("topology-external-destination-node")).toHaveCount(0)
  const geo = (await page.evaluate(CONTINUATION_GEOMETRY)) as { paths: unknown[] }
  expect(geo.paths, "a gateway→destination edge was drawn with no egress in the payload").toEqual([])
})
