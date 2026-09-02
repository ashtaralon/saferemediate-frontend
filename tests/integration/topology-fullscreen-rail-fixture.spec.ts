import { expect, test } from "@playwright/test"
import { seedAuthCookie } from "./live-auth"
import { ESTATE_URL, railHeaderBadgeOverlaps, routeSnapshot, SNAPSHOT } from "./topology-fixture"

/**
 * Fullscreen right-rail clip — browser geometry regression (deterministic).
 *
 * Before the fix the Regional rail's cards ran past the bottom of the
 * fullscreen frame and no gesture could reach them: the region grid clipped
 * the rail, the content box was pinned to the viewport height, and the
 * density collapse that was meant to shorten the rail can never fire.
 * The rail is now two lanes (Lambda | Regional), each owning its own scroll.
 * This spec proves, in a real browser:
 *   1. both lane headers are on screen at once, with no scrolling,
 *   2. the Lambda lane really overflows (otherwise the test would be
 *      vacuous), owns its own scroll box, and its "+N more" footer counts
 *      exactly the chips below its fold,
 *   3. the last Lambda chip is out of view until the LANE scrolls, and
 *      inside the lane's box and the viewport after — the page and the
 *      Regional lane do not move, and the fold counters flip,
 *   4. flow edges into rail chips end inside the chip, and edges into
 *      scrolled-out chips pin to their lane's edge — never dangle,
 *   5. the lane's chips are dense and two share a row, and the lane body is
 *      never shorter than one row (RAIL_LANE_MIN_PX): the coverage pill
 *      above the grid took the slack the 96px floor had been living on,
 *   6. an edge with both ends in the rail is carried by exactly one bundle
 *      path through the flow corridor, and no flow label paints over a rail
 *      chip (C1 production, 2026-09-02: 22 labels piled on the column).
 */
test("fullscreen: each off-VPC rail lane scrolls in its track, both lanes stay on screen, edges stay anchored", async ({
  context,
  page,
}) => {
  test.setTimeout(150_000)
  await seedAuthCookie(context)
  await routeSnapshot(page)
  // A short viewport on purpose: 16 Lambdas + 18 regional services must not
  // fit even after both lanes take their share of the column.
  await page.setViewportSize({ width: 1600, height: 720 })
  await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })

  // The page resolves the system through the product scope + scoped catalog
  // (all answered by routeSnapshot) before it mounts the map and its tabs.
  await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  await page.getByRole("tab", { name: "Network topology" }).click()
  const dependencies = page
    .getByTestId("topology-flow-mode-toggle")
    .getByRole("button", { name: "Dependencies" })
    .first()
  await dependencies.click()
  await expect(dependencies).toHaveAttribute("aria-pressed", "true")

  await page.getByTestId("topology-estate-map-enlarge").click()
  const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  await expect(fullscreen).toBeVisible()
  // Inventory density: one icon per real node, so the lanes are as tall as the data.
  await fullscreen.getByTestId("topology-estate-density-fs-inventory").click()

  const rail = fullscreen.getByTestId("topology-edge-services-rail")
  await expect(rail).toBeVisible()
  // Let the fit settle (double rAF + the gridSourceNodes refit).
  await page.waitForTimeout(900)

  // Rail tier headers are flow obstacles: no edge label paints over them.
  expect(await railHeaderBadgeOverlaps(page)).toEqual([])

  // 1: both lane headers on screen, inside the rail's box, before any scroll.
  const railBox = await rail.boundingBox()
  expect(railBox).not.toBeNull()
  for (const header of ["serverless-tier-header", "regional-tier-header"]) {
    const box = await fullscreen.locator(`[data-flow-obstacle="${header}"]`).boundingBox()
    expect(box, header).not.toBeNull()
    expect(box!.y, header).toBeGreaterThanOrEqual(railBox!.y - 1)
    expect(box!.y + box!.height, header).toBeLessThanOrEqual(railBox!.y + railBox!.height + 1)
    expect(box!.y + box!.height, header).toBeLessThanOrEqual(720)
  }

  // 2: real overflow in the Lambda lane, one scroll owner, honest fold count.
  const laneBody = fullscreen.getByTestId("topology-serverless-lane-body")
  const lane = await laneBody.evaluate(el => {
    const box = el.getBoundingClientRect()
    let below = 0
    for (const chip of Array.from(el.querySelectorAll("[data-flow-id]"))) {
      if (chip.getBoundingClientRect().bottom > box.bottom + 1) below += 1
    }
    return {
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      overflowY: getComputedStyle(el).overflowY,
      below,
    }
  })
  expect(lane.overflowY).toBe("auto")
  expect(lane.scrollHeight).toBeGreaterThan(lane.clientHeight + 20)
  expect(lane.below).toBeGreaterThan(0)
  const more = fullscreen.getByTestId("topology-serverless-lane-more")
  await expect(more).toBeVisible()
  await expect(more).toHaveText(`+${lane.below} more ↓`)
  await expect(fullscreen.getByTestId("topology-serverless-lane-above")).toHaveCount(0)

  // 6: intra-rail edges are bundled through the corridor. Every payload edge
  // whose both ends resolve to rail chips is carried by exactly one bundle
  // path (members are "source→target"), and no flow label box intersects a
  // rail chip.
  const bundling = await page.evaluate((edges: Array<{ source_id: string; target_id: string }>) => {
    const root = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')
    const rail = root?.querySelector('[data-testid="topology-edge-services-rail"]')
    if (!root || !rail) throw new Error("fullscreen rail is not rendered")
    const inRail = (id: string) => {
      const el = root.querySelector(`[data-flow-id="${CSS.escape(id)}"]`)
      return Boolean(el && rail.contains(el))
    }
    const expected = edges
      .filter(edge => inRail(edge.source_id) && inRail(edge.target_id))
      .map(edge => `${edge.source_id}→${edge.target_id}`)
    const bundles = Array.from(root.querySelectorAll<SVGGElement>("g[data-flow-bundle]")).map(group => ({
      count: Number(group.getAttribute("data-flow-bundle")),
      members: (group.getAttribute("data-flow-members") ?? "").split("|").filter(Boolean),
      label: group.querySelector("text")?.textContent ?? "",
      source: group.getAttribute("data-flow-source"),
      target: group.getAttribute("data-flow-target"),
    }))
    const railChips = Array.from(rail.querySelectorAll<HTMLElement>("[data-flow-id], [data-flow-ids]")).filter(
      chip => chip.getBoundingClientRect().height > 0,
    )
    const labelsOverChips: string[] = []
    for (const badge of Array.from(root.querySelectorAll<SVGGElement>('[data-testid="topology-flow-badge"]'))) {
      const box = badge.querySelector("rect")
      if (!box) continue
      const r = box.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      for (const chip of railChips) {
        const c = chip.getBoundingClientRect()
        if (r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top) {
          labelsOverChips.push(badge.querySelector("text")?.textContent ?? "")
        }
      }
    }
    return { expected, bundles, labelsOverChips }
  }, SNAPSHOT.traffic_edges as Array<{ source_id: string; target_id: string }>)
  expect(bundling.expected.length, "the captured payload carries an intra-rail edge").toBeGreaterThan(0)
  expect(bundling.bundles.flatMap(bundle => bundle.members).sort()).toEqual([...bundling.expected].sort())
  for (const bundle of bundling.bundles) {
    expect(bundle.count, `bundle ${bundle.label} counts its members`).toBe(bundle.members.length)
    // The source is the lane the traffic comes from; the TARGET is the chip
    // that receives it, so the arrow names a service rather than a column.
    expect(bundle.source, "a bundle leaves a lane").toMatch(/^lane:(serverless|regional)$/)
    expect(bundle.target, `bundle ${bundle.label} names the service it reaches`).not.toMatch(/^lane:/)
    expect(
      bundle.members.every(member => member.endsWith(`→${bundle.target}`)),
      `every member of ${bundle.label} ends at ${bundle.target}`,
    ).toBe(true)
  }
  expect(bundling.labelsOverChips, "no flow label paints over a rail chip").toEqual([])

  // 3: the last Lambda chip is below the lane's fold until the LANE scrolls.
  const chips = laneBody.locator("[data-flow-id]")
  const chipCount = await chips.count()
  expect(chipCount).toBeGreaterThan(0)
  // 5a: one chip per row, each spanning the lane, so an inbound edge can
  // reach any chip's left edge without crossing a neighbour.
  const [first, second] = await Promise.all([chips.nth(0).boundingBox(), chips.nth(1).boundingBox()])
  expect(first).not.toBeNull()
  expect(second).not.toBeNull()
  expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height - 1)
  expect(Math.abs(first!.x - second!.x)).toBeLessThan(1)
  const laneBodyBox = await laneBody.boundingBox()
  expect(first!.width).toBeGreaterThan(laneBodyBox!.width * 0.8)
  const last = chips.nth(chipCount - 1)
  const bodyBox = await laneBody.boundingBox()
  const before = await last.boundingBox()
  expect(bodyBox).not.toBeNull()
  expect(before).not.toBeNull()
  expect(before!.y + before!.height).toBeGreaterThan(bodyBox!.y + bodyBox!.height)

  const pageScrollBefore = await page.evaluate(() => window.scrollY)
  await last.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400) // capture-phase scroll listener → rAF re-measure
  const after = await last.boundingBox()
  const bodyAfter = await laneBody.boundingBox()
  expect(after).not.toBeNull()
  expect(bodyAfter).not.toBeNull()
  expect(after!.y).toBeGreaterThanOrEqual(bodyAfter!.y - 1)
  expect(after!.y + after!.height).toBeLessThanOrEqual(bodyAfter!.y + bodyAfter!.height + 1)
  expect(after!.y + after!.height).toBeLessThanOrEqual(720)
  // 5b: the lane body is at least one chip tall even with both fold pills up.
  expect(bodyAfter!.height).toBeGreaterThanOrEqual(after!.height)
  // The LANE scrolled — not the page, not the Regional lane.
  expect(await page.evaluate(() => window.scrollY)).toBe(pageScrollBefore)
  expect(await laneBody.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  expect(await fullscreen.getByTestId("topology-regional-lane-body").evaluate(el => el.scrollTop)).toBe(0)
  await expect(fullscreen.getByTestId("topology-serverless-lane-above")).toBeVisible()

  // 4: edge anchoring after the scroll. Edges into a rail CHIP end at the chip
  // (or pin to its lane's edge when it is scrolled out); intra-rail BUNDLES
  // leave their source lane's left edge and end at the CHIP they name — at
  // its left edge when it is on screen, on its clip boundary when the lane
  // has scrolled it away.
  const bundleAnchors = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')!
    const box = (el: Element | null) => {
      const r = el?.getBoundingClientRect()
      return r ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null
    }
    const laneBox = (key: string | null) =>
      box(
        root.querySelector(
          key === "lane:serverless"
            ? '[data-testid="topology-serverless-tier"]'
            : '[data-testid="topology-regional-data-tier"]',
        ),
      )
    // Mirror the overlay's own endpoint clipping: a chip is clamped against
    // every scrollable / overflow-hidden ancestor, and a chip scrolled fully
    // out of its lane collapses to a point on that clip boundary on purpose
    // (so the arrow points INTO the rail instead of dangling). Measure the
    // clamped box the renderer actually targets, not the raw chip rect.
    const chipBox = (id: string | null) => {
      if (!id) return null
      const el = root.querySelector<HTMLElement>(`[data-flow-id="${CSS.escape(id)}"]`)
      if (!el) return null
      const r = el.getBoundingClientRect()
      let clipL = -Infinity, clipT = -Infinity, clipR = Infinity, clipB = Infinity
      let p: HTMLElement | null = el.parentElement
      while (p && p !== root) {
        const st = window.getComputedStyle(p)
        if (/(auto|scroll|hidden)/.test(st.overflowY + st.overflowX)) {
          const pr = p.getBoundingClientRect()
          clipL = Math.max(clipL, pr.left)
          clipT = Math.max(clipT, pr.top)
          clipR = Math.min(clipR, pr.right)
          clipB = Math.min(clipB, pr.bottom)
        }
        p = p.parentElement
      }
      const L = Math.max(r.left, clipL)
      const T = Math.max(r.top, clipT)
      const R = Math.min(r.right, clipR)
      const B = Math.min(r.bottom, clipB)
      return {
        l: L,
        t: T,
        r: R,
        b: B,
        column: { l: r.left, r: r.right },
        clip: { t: clipT, b: clipB },
        visible: R > L && B > T,
      }
    }
    const out: Array<{
      label: string
      start: { x: number; y: number }
      end: { x: number; y: number }
      source: { l: number; t: number; r: number; b: number } | null
      target: {
        l: number
        t: number
        r: number
        b: number
        column: { l: number; r: number }
        clip: { t: number; b: number }
        visible: boolean
      } | null
      targetId: string | null
    }> = []
    for (const group of Array.from(root.querySelectorAll<SVGGElement>("g[data-flow-bundle]"))) {
      const path = group.querySelector("path") as SVGPathElement | null
      const ctm = path?.getScreenCTM()
      if (!path || !ctm) continue
      const p0 = path.getPointAtLength(0)
      const p1 = path.getPointAtLength(path.getTotalLength())
      const start = new DOMPoint(p0.x, p0.y).matrixTransform(ctm)
      const end = new DOMPoint(p1.x, p1.y).matrixTransform(ctm)
      out.push({
        label: group.querySelector("text")?.textContent ?? "",
        start: { x: start.x, y: start.y },
        end: { x: end.x, y: end.y },
        source: laneBox(group.getAttribute("data-flow-source")),
        target: chipBox(group.getAttribute("data-flow-target")),
        targetId: group.getAttribute("data-flow-target"),
      })
    }
    return out
  })
  const anchored = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')!
    const railEl = root.querySelector('[data-testid="topology-edge-services-rail"]')!
    const out: Array<{
      id: string
      visible: boolean
      end: { x: number; y: number }
      chip: { l: number; t: number; r: number; b: number }
      lane: { t: number; b: number }
    }> = []
    for (const chip of Array.from(railEl.querySelectorAll<HTMLElement>("[data-flow-id]"))) {
      const id = chip.getAttribute("data-flow-id")
      if (!id) continue
      const group = root.querySelector(`g[data-flow-target="${CSS.escape(id)}"]`)
      const path = group?.querySelector("path") as SVGPathElement | null
      if (!path) continue
      const pt = path.getPointAtLength(path.getTotalLength())
      const ctm = path.getScreenCTM()
      if (!ctm) continue
      const end = new DOMPoint(pt.x, pt.y).matrixTransform(ctm)
      const r = chip.getBoundingClientRect()
      const laneEl = chip.closest('[data-testid$="-lane-body"]') ?? railEl
      const laneRect = laneEl.getBoundingClientRect()
      out.push({
        id,
        visible: r.bottom > laneRect.top && r.top < laneRect.bottom,
        end: { x: end.x, y: end.y },
        chip: { l: r.left, t: r.top, r: r.right, b: r.bottom },
        lane: { t: laneRect.top, b: laneRect.bottom },
      })
    }
    return out
  })
  // The captured payload's only rail-bound edge is the intra-rail Lambda → S3
  // access, which is now a bundle; a payload with in-VPC → rail edges also
  // exercises the chip anchoring below.
  expect(anchored.length + bundleAnchors.length).toBeGreaterThan(0)
  const tolerance = 16
  for (const b of bundleAnchors) {
    expect(b.source, `bundle ${b.label} starts at a lane`).not.toBeNull()
    // The whole point of the bundle: it names the service it reaches.
    expect(b.targetId, `bundle ${b.label} names its target`).not.toMatch(/^lane:/)
    expect(b.target, `bundle ${b.label} ends at the chip it names`).not.toBeNull()
    expect(Math.abs(b.start.x - b.source!.l), `bundle ${b.label} leaves its source lane's left edge`).toBeLessThanOrEqual(tolerance)
    expect(b.start.y, `bundle ${b.label} leaves within its source lane`).toBeGreaterThanOrEqual(b.source!.t - tolerance)
    expect(b.start.y, `bundle ${b.label} leaves within its source lane`).toBeLessThanOrEqual(b.source!.b + tolerance)
    const target = b.target!
    if (target.visible) {
      expect(Math.abs(b.end.x - target.l), `bundle ${b.label} enters its target chip's left edge`).toBeLessThanOrEqual(tolerance)
      expect(b.end.y, `bundle ${b.label} enters within its target chip`).toBeGreaterThanOrEqual(target.t - tolerance)
      expect(b.end.y, `bundle ${b.label} enters within its target chip`).toBeLessThanOrEqual(target.b + tolerance)
    } else {
      // Target scrolled out of its lane: the arrow must still point INTO the
      // rail at the chip's column, never dangle over unrelated content.
      expect(b.end.x, `bundle ${b.label} points into its target's column`).toBeGreaterThanOrEqual(target.column.l - tolerance)
      expect(b.end.x, `bundle ${b.label} points into its target's column`).toBeLessThanOrEqual(target.column.r + tolerance)
      expect(b.end.y, `bundle ${b.label} lands on its target's clip boundary`).toBeGreaterThanOrEqual(target.clip.t - tolerance)
      expect(b.end.y, `bundle ${b.label} lands on its target's clip boundary`).toBeLessThanOrEqual(target.clip.b + tolerance)
    }
  }
  for (const a of anchored) {
    if (a.visible) {
      expect(a.end.x, `edge into ${a.id} ends at the chip (x)`).toBeGreaterThanOrEqual(a.chip.l - tolerance)
      expect(a.end.x, `edge into ${a.id} ends at the chip (x)`).toBeLessThanOrEqual(a.chip.r + tolerance)
      expect(a.end.y, `edge into ${a.id} ends at the chip (y)`).toBeGreaterThanOrEqual(a.chip.t - tolerance)
      expect(a.end.y, `edge into ${a.id} ends at the chip (y)`).toBeLessThanOrEqual(a.chip.b + tolerance)
    } else {
      // Scrolled out of its lane: pinned to the lane's edge, not left dangling.
      expect(a.end.y, `edge into scrolled-out ${a.id} pins to its lane`).toBeGreaterThanOrEqual(a.lane.t - tolerance)
      expect(a.end.y, `edge into scrolled-out ${a.id} pins to its lane`).toBeLessThanOrEqual(a.lane.b + tolerance)
    }
  }

  await page.screenshot({ path: "test-results/fullscreen-rail-scrolled.png", fullPage: false })
})
