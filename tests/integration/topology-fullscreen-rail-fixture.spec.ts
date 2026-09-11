import { expect, test } from "@playwright/test"
import { seedAuthCookie } from "./live-auth"
import {
  chromeTextDefects,
  ESTATE_URL,
  railHeaderBadgeOverlaps,
  routeSnapshot,
  SNAPSHOT,
} from "./topology-fixture"

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
 *   5. the lane's chips are one per row, each spanning the lane, and the lane
 *      BODY is never shorter than one row — its own min-height, on a content
 *      flex basis. A floor on the lane cannot protect the body inside it: on C1
 *      the Lambda lane measured 402px, far above RAIL_LANE_MIN_PX, while its
 *      body measured 1.75px and showed no chip (2026-09-11),
 *   6. an edge with both ends in the rail is carried by exactly one bundle
 *      path through the corridor between the lanes, neither the label nor the
 *      path itself lands on a rail chip (C1 production, 2026-09-02: 22 labels
 *      piled on the column), and its word is printed exactly once.
 *
 * Two things this payload cannot reach, pinned elsewhere rather than left to a
 * vacuous pass here. It carries no EventBridge / SQS / Step Functions node, so
 * the triggers band never renders and its own floor is pinned in
 * __tests__/topology-fullscreen-rail-scroll.test.tsx. And its two
 * ACTUAL_S3_ACCESS edges hit the same bucket, so it holds exactly ONE rail
 * bundle — the lane-pair label collapse (C1, 2026-09-11: twelve badges reading
 * TARGETS / TRIGGERS stacked in the gutter column) has nothing to collapse here
 * and is pinned on the real twelve-bundle shape in
 * __tests__/topology-rail-bundles.test.ts.
 */
test("fullscreen: each off-VPC rail lane scrolls in its track, both lanes stay on screen, edges stay anchored", async ({
  context,
  page,
}) => {
  test.setTimeout(150_000)
  await seedAuthCookie(context)
  await routeSnapshot(page)
  // A short viewport on purpose. Side by side each lane owns the column's whole
  // height rather than half of it, so the payload's 14 Lambdas and 18 regional
  // services must STILL overflow here — otherwise the fold assertions below
  // would pass without measuring anything.
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

  // 1b: the VPC chrome rows are sized to what they hold. At this height the
  // column cannot give every row its preferred size, and the band row (load
  // balancers · NAT fallback · AZ headers) was the one row whose wrapper had
  // no intrinsic minimum: with `minmax(auto, max-content)` its track resolved
  // to ~24px for ~108px of content on C1 (c1-ui-qa run 34576457683, 1600×900)
  // and the band painted over the Web tier. Used track sizes, not the authored
  // template — the question is what the layout engine did with the shortage.
  const chrome = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')!
    const grid = root.querySelector<HTMLElement>('[data-testid="topology-single-vpc-grid"]')
    const band = root.querySelector<HTMLElement>('[data-testid="topology-vpc-band-row"]')
    const azRow = root.querySelector<HTMLElement>('[data-flow-obstacle="az-header-row"]')
    const firstTier = root.querySelector<HTMLElement>('[data-testid="topology-tier-stack"]')
    if (!grid || !band || !azRow || !firstTier) return null
    const tracks = getComputedStyle(grid)
      .gridTemplateRows.split(" ")
      .map(v => Math.round(parseFloat(v)))
    const cells = Array.from(root.querySelectorAll<HTMLElement>('[data-testid="topology-subnet-cell-chrome"]'))
    const azBottom = azRow.getBoundingClientRect().bottom
    return {
      tracks,
      band_track: tracks[1],
      band_content: band.scrollHeight,
      band_bottom: Math.round(band.getBoundingClientRect().bottom),
      first_tier_top: Math.round(firstTier.getBoundingClientRect().top),
      cells: cells.length,
      cells_under_az_headers: cells.filter(cell => cell.getBoundingClientRect().top < azBottom - 1).length,
    }
  })
  expect(chrome, "single-VPC grid, band row, AZ header row and Web tier are rendered").not.toBeNull()
  expect(chrome!.tracks.length, "chrome, band, three tiers").toBe(5)
  expect(chrome!.cells, "subnet cells are drawn, so the overlap count below is not vacuous").toBeGreaterThan(0)
  expect(
    chrome!.band_track,
    `the band row's track is ${chrome!.band_track}px for ${chrome!.band_content}px of content — the chrome row was starved`,
  ).toBeGreaterThanOrEqual(chrome!.band_content - 1)
  expect(
    chrome!.first_tier_top,
    `the Web tier starts at ${chrome!.first_tier_top}px, above the band row's bottom at ${chrome!.band_bottom}px`,
  ).toBeGreaterThanOrEqual(chrome!.band_bottom - 1)
  expect(chrome!.cells_under_az_headers, "no subnet cell starts above the AZ header row's bottom edge").toBe(0)

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
    // A bundle's own label is the trunk's badge; the "API" badges on its feeder
    // legs are per-member marks, excluded here (`data-flow-feeder`).
    const bundleLabel = (group: Element) =>
      group.querySelector('[data-testid="topology-flow-badge"]:not([data-flow-feeder]) text')?.textContent ?? ""
    const bundles = Array.from(root.querySelectorAll<SVGGElement>("g[data-flow-bundle]")).map(group => ({
      count: Number(group.getAttribute("data-flow-bundle")),
      members: (group.getAttribute("data-flow-members") ?? "").split("|").filter(Boolean),
      label: bundleLabel(group),
      // Feeders: one dotted leg and one "API" badge per member, or none for a
      // bundle drawn as a plain trunk (a same-lane stub).
      feederLegs: ((group.querySelector("[data-flow-feeder-legs]")?.getAttribute("d") ?? "").match(/M /g) ?? []).length,
      feederBadges: group.querySelectorAll("[data-flow-feeder]").length,
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
    // The PATH, not just its label. With the two lanes side by side a bundle
    // that routes out to the leftmost corridor is drawn back across the lane it
    // just left, straight over that lane's chips (measured 2026-09-10 on this
    // payload: the S3-access bundle crossed the ConfidenceScorer chip). Sample
    // each bundle path along its length, skipping the ends — a path is supposed
    // to touch its own two endpoints.
    const pathsOverChips: Array<{ label: string; target: string | null; chips: string[] }> = []
    for (const group of Array.from(root.querySelectorAll<SVGGElement>("g[data-flow-bundle]"))) {
      const path = group.querySelector("path") as SVGPathElement | null
      const ctm = path?.getScreenCTM()
      if (!path || !ctm) continue
      const len = path.getTotalLength()
      if (!len) continue
      const hit = new Set<string>()
      for (let d = 8; d <= len - 8; d += 4) {
        const p = path.getPointAtLength(d)
        const s = new DOMPoint(p.x, p.y).matrixTransform(ctm)
        for (const chip of railChips) {
          const c = chip.getBoundingClientRect()
          if (s.x > c.left + 2 && s.x < c.right - 2 && s.y > c.top + 2 && s.y < c.bottom - 2) {
            hit.add(chip.getAttribute("data-flow-id") ?? chip.getAttribute("data-flow-ids") ?? "?")
          }
        }
      }
      if (hit.size > 0) {
        pathsOverChips.push({
          label: bundleLabel(group),
          target: group.getAttribute("data-flow-target"),
          chips: [...hit],
        })
      }
    }
    return { expected, bundles, labelsOverChips, pathsOverChips }
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
    // A feeder bundle gives EVERY member its own leg to the bus and its own
    // "API" mark at the chip it leaves — the Lambda → S3 shape Alon asked for
    // (2026-09-11): follow a function to the bus, the bus to the bucket. A
    // bundle with no legs is a same-lane stub and has no marks either.
    if (bundle.feederLegs > 0) {
      expect(bundle.feederLegs, `bundle ${bundle.label} has one leg per member`).toBe(bundle.members.length)
      expect(bundle.feederBadges, `bundle ${bundle.label} marks every leg`).toBe(bundle.members.length)
    } else {
      expect(bundle.feederBadges).toBe(0)
    }
  }
  // Non-vacuous: this payload's Lambda → S3 access is a feeder bundle.
  expect(bundling.bundles.some(bundle => bundle.feederLegs > 0), "a feeder bundle is drawn").toBe(true)
  expect(bundling.labelsOverChips, "no flow label paints over a rail chip").toEqual([])
  expect(bundling.pathsOverChips, "no bundle path is drawn across a rail chip").toEqual([])

  // 6b: one label per LANE PAIR, not one per receiving chip. Grouping by target
  // chip is right for a fan-IN — four Lambdas writing one bucket read as a
  // single `S3 access ×4` — but a 1:1 pairing across the same two lanes makes
  // one bundle per edge and every one of them shows the same word. C1's six
  // EventBridge rules firing six Lambdas measured TWELVE badges stacked in the
  // gutter column, reading TARGETS / TRIGGERS over and over (2026-09-11), which
  // is the opposite of seeing the traffic between the services. Every arrow
  // stays — each still lands on the service it names, asserted above — and the
  // count moves into the one badge that speaks for them.
  const labelling = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')!
    const laneOf = (el: Element | null) =>
      el?.closest('[data-testid="topology-serverless-tier"]')
        ? "lane:serverless"
        : el?.closest('[data-testid="topology-regional-data-tier"]')
          ? "lane:regional"
          : "lane:?"
    const pairs = new Map<string, { words: string[]; arrows: number }>()
    for (const group of Array.from(root.querySelectorAll<SVGGElement>("g[data-flow-bundle]"))) {
      const source = group.getAttribute("data-flow-source") ?? "?"
      const targetId = group.getAttribute("data-flow-target")
      const target = targetId ? root.querySelector(`[data-flow-id="${CSS.escape(targetId)}"]`) : null
      const key = `${source}→${laneOf(target)}`
      const entry = pairs.get(key) ?? { words: [], arrows: 0 }
      entry.arrows += 1
      // The count is the part that legitimately differs; the repeated WORD is
      // the defect, so compare the label with its `×N` stripped. The trunk's
      // badge only: the per-member "API" marks on feeder legs are not labels.
      const label =
        group.querySelector('[data-testid="topology-flow-badge"]:not([data-flow-feeder]) text')?.textContent ?? ""
      const word = label.replace(/\s*×\s*\d+\s*$/, "").trim()
      if (word) entry.words.push(word)
      pairs.set(key, entry)
    }
    const badges = Array.from(
      root.querySelectorAll('[data-testid="topology-flow-badge"]:not([data-flow-feeder]) text'),
    ).map(t => (t.textContent ?? "").trim())
    return { pairs: [...pairs.entries()].map(([key, v]) => ({ key, ...v })), badges }
  })
  console.log(`RAIL LABELLING ${JSON.stringify(labelling)}`)
  for (const pair of labelling.pairs) {
    const dupes = pair.words.filter((word, i) => pair.words.indexOf(word) !== i)
    expect(dupes, `${pair.key} repeats a label across ${pair.arrows} arrows`).toEqual([])
  }
  // Coverage, stated rather than implied: THIS payload cannot exercise the
  // collapse. Its two ACTUAL_S3_ACCESS edges hit the same bucket, so per-chip
  // grouping already yields one bundle with one word — measured 2026-09-11,
  // pairs = [{"key":"lane:serverless→lane:regional","words":["S3 access"],
  // "arrows":1}]. The duplicate check above would therefore pass on the
  // pre-collapse renderer too; the collapse itself is pinned on the C1 twelve-
  // bundle shape in __tests__/topology-rail-bundles.test.ts
  // (collapseRailBundleBadges). What this assertion is worth is the browser
  // half: a rail bundle exists at all, and it labels its word exactly once.
  expect(
    labelling.pairs,
    `one rail lane pair, one word — pairs ${JSON.stringify(labelling.pairs)}`,
  ).toEqual([{ key: "lane:serverless→lane:regional", words: ["S3 access"], arrows: 1 }])

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
  // 5c: the floor this spec's header has always claimed, now read off the DOM.
  // It belongs to the BODY, not to the lane: on C1 the Lambda lane measured
  // 402px — far above RAIL_LANE_MIN_PX, so the lane floor never bound — while
  // its body measured 1.75px and showed no Lambda chip at all, because the body
  // was the lane's only `flex: 1 1 0%` child and a 0% basis absorbs the whole
  // overrun of everything beside it (the triggers band, 291.5px of the 402).
  // A content basis shares the deficit; the body's own min-height keeps one row.
  const laneFloors = await fullscreen.evaluate(root => {
    const out: Record<string, { minH: number; h: number; chip: number; basis: string; grow: string }> = {}
    for (const lane of ["serverless", "regional"]) {
      const body = root.querySelector<HTMLElement>(`[data-testid="topology-${lane}-lane-body"]`)
      if (!body) continue
      const cs = getComputedStyle(body)
      const chip = body.querySelector<HTMLElement>("[data-flow-id]")
      out[lane] = {
        minH: Number.parseFloat(cs.minHeight) || 0,
        h: +body.getBoundingClientRect().height.toFixed(2),
        chip: chip ? +chip.getBoundingClientRect().height.toFixed(2) : 0,
        basis: cs.flexBasis,
        grow: cs.flexGrow,
      }
    }
    return out
  })
  console.log(`RAIL LANE FLOORS ${JSON.stringify(laneFloors)}`)
  expect(Object.keys(laneFloors).sort()).toEqual(["regional", "serverless"])
  for (const [lane, m] of Object.entries(laneFloors)) {
    expect(m.chip, `${lane} lane renders a chip to size its floor against`).toBeGreaterThan(0)
    expect(
      m.minH,
      `${lane} body's floor (${m.minH}px) holds a whole chip (${m.chip}px)`,
    ).toBeGreaterThanOrEqual(m.chip - 1)
    expect(m.h, `${lane} body (${m.h}px) is at least its own floor (${m.minH}px)`).toBeGreaterThanOrEqual(
      m.minH - 1,
    )
    // The mechanism, not just the outcome: a 0% basis puts the whole deficit on
    // the chips no matter how generous the floor above them is.
    expect(m.basis, `${lane} body has a content flex basis, not 0%`).not.toBe("0%")
    expect(m.grow, `${lane} body still grows into the lane`).not.toBe("0")
  }
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
      badge: { l: number; t: number; r: number; b: number } | null
      railLeft: number
      targetId: string | null
      /** Where each feeder leg leaves — a member chip's edge — in screen coordinates. */
      legStarts: Array<{ x: number; y: number }>
    }> = []
    const railLeft = root
      .querySelector('[data-testid="topology-edge-services-rail"]')!
      .getBoundingClientRect().left
    for (const group of Array.from(root.querySelectorAll<SVGGElement>("g[data-flow-bundle]"))) {
      const path = group.querySelector("path") as SVGPathElement | null
      const ctm = path?.getScreenCTM()
      if (!path || !ctm) continue
      const p0 = path.getPointAtLength(0)
      const p1 = path.getPointAtLength(path.getTotalLength())
      const start = new DOMPoint(p0.x, p0.y).matrixTransform(ctm)
      const end = new DOMPoint(p1.x, p1.y).matrixTransform(ctm)
      // The legs are one path of `M x y …` subpaths; each subpath's first point
      // is where a member leaves its chip.
      const legsD = group.querySelector("[data-flow-feeder-legs]")?.getAttribute("d") ?? ""
      const legStarts = Array.from(legsD.matchAll(/M\s+(-?[\d.]+)\s+(-?[\d.]+)/g)).map(m => {
        const pt = new DOMPoint(Number(m[1]), Number(m[2])).matrixTransform(ctm)
        return { x: pt.x, y: pt.y }
      })
      out.push({
        label: group.querySelector('[data-testid="topology-flow-badge"]:not([data-flow-feeder]) text')?.textContent ?? "",
        start: { x: start.x, y: start.y },
        end: { x: end.x, y: end.y },
        source: laneBox(group.getAttribute("data-flow-source")),
        target: chipBox(group.getAttribute("data-flow-target")),
        targetId: group.getAttribute("data-flow-target"),
        badge: box(group.querySelector('[data-testid="topology-flow-badge"]:not([data-flow-feeder]) rect')),
        railLeft,
        legStarts,
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
  // Bundle badges belong in a CORRIDOR — never over a lane's chips: the bus fan
  // used to march 7px per bundle straight out of the 48px corridor and drop the
  // later badges onto the lane headers (C1 production, 2026-09-02). Two
  // corridors qualify now that the lanes sit side by side: the gutter left of
  // the rail, and the gap BETWEEN the lanes, which is where a bundle's label
  // sits on its own line when it fits. "Left of the rail" was the old
  // one-corridor form of this and would now reject the on-line placement that
  // is the point of the arrangement.
  const corridorBands = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')!
    return ["topology-flow-corridor", "topology-interlane-corridor"].flatMap(id => {
      const el = root.querySelector(`[data-testid="${id}"]`)
      if (!el) return []
      const r = el.getBoundingClientRect()
      return [{ id, l: r.left, r: r.right }]
    })
  })
  expect(corridorBands.length, "the frame renders the corridors the buses run in").toBeGreaterThan(0)
  const badges = bundleAnchors.flatMap(b => (b.badge ? [{ label: b.label, rect: b.badge, railLeft: b.railLeft }] : []))
  for (const [i, b] of badges.entries()) {
    const band = corridorBands.find(c => b.rect.l >= c.l - 2 && b.rect.r <= c.r + 2)
    expect(
      band ?? (b.rect.r <= b.railLeft ? { id: "left of rail" } : null),
      `bundle ${b.label}'s badge (${Math.round(b.rect.l)}..${Math.round(b.rect.r)}) sits in a corridor, not over a lane — bands ${JSON.stringify(corridorBands)}`,
    ).not.toBeNull()
    for (const other of badges.slice(i + 1)) {
      const overlaps =
        b.rect.r > other.rect.l &&
        b.rect.l < other.rect.r &&
        b.rect.b > other.rect.t &&
        b.rect.t < other.rect.b
      expect(overlaps, `${b.label} and ${other.label} do not stack on each other`).toBe(false)
    }
  }
  for (const b of bundleAnchors) {
    expect(b.source, `bundle ${b.label} starts at a lane`).not.toBeNull()
    // The whole point of the bundle: it names the service it reaches.
    expect(b.targetId, `bundle ${b.label} names its target`).not.toMatch(/^lane:/)
    expect(b.target, `bundle ${b.label} ends at the chip it names`).not.toBeNull()
    // WHICH vertical edge it leaves on is the corridor's choice: with the Lambda
    // and Regional lanes side by side, a Lambda → S3 bundle hops out of the
    // right edge into the corridor between them, and the reverse direction
    // leaves the left edge. What must hold is that it leaves on an edge of its
    // own lane rather than out of the middle of it, and enters its target the
    // same way — that is what keeps it off the chips it passes.
    //
    // A FEEDER bundle leaves the lane once per member: each dotted leg starts
    // at its own chip's edge, and the trunk starts where the farthest leg has
    // already joined the bus, inside a corridor. A plain bundle (a same-lane
    // stub) starts at the lane's edge itself.
    if (b.legStarts.length > 0) {
      expect(
        corridorBands.some(c => b.start.x >= c.l - 2 && b.start.x <= c.r + 2),
        `bundle ${b.label}'s trunk starts on a bus in a corridor (x=${Math.round(b.start.x)}, bands ${JSON.stringify(corridorBands)})`,
      ).toBe(true)
      for (const leg of b.legStarts) {
        const leavesAnEdge = Math.min(Math.abs(leg.x - b.source!.l), Math.abs(leg.x - b.source!.r))
        expect(leavesAnEdge, `a leg of ${b.label} leaves a chip on its source lane's edge`).toBeLessThanOrEqual(tolerance)
        expect(leg.y, `a leg of ${b.label} leaves within its source lane`).toBeGreaterThanOrEqual(b.source!.t - tolerance)
        expect(leg.y, `a leg of ${b.label} leaves within its source lane`).toBeLessThanOrEqual(b.source!.b + tolerance)
      }
    } else {
      const leavesAnEdge = Math.min(Math.abs(b.start.x - b.source!.l), Math.abs(b.start.x - b.source!.r))
      expect(leavesAnEdge, `bundle ${b.label} leaves its source lane on a vertical edge`).toBeLessThanOrEqual(tolerance)
    }
    expect(b.start.y, `bundle ${b.label} leaves within its source lane`).toBeGreaterThanOrEqual(b.source!.t - tolerance)
    expect(b.start.y, `bundle ${b.label} leaves within its source lane`).toBeLessThanOrEqual(b.source!.b + tolerance)
    const target = b.target!
    if (target.visible) {
      const entersAnEdge = Math.min(Math.abs(b.end.x - target.l), Math.abs(b.end.x - target.r))
      expect(entersAnEdge, `bundle ${b.label} enters its target chip on a vertical edge`).toBeLessThanOrEqual(tolerance)
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

  // Tier rows hug their chips rather than splitting the column 1.35fr : 1.2fr :
  // 0.65fr — asserted in the platform-map QA spec, not here. Measured 2026-09-10:
  // at THIS test's 720px-tall viewport the old fr split wasted at most 25px,
  // because a short column has little slack to misallocate, so a bound placed
  // here would pass on the broken layout too. The waste needs a tall viewport to
  // exist, so the assertion lives where the viewport is 2048×1100.

  await page.screenshot({ path: "test-results/fullscreen-rail-scrolled.png", fullPage: false })
})

/**
 * Header layout across viewport widths — browser geometry regression.
 *
 * On C1 (2026-09-10) the fullscreen chrome on a ~460px-wide window was
 * unreadable: measured in the live browser, the "Cloud topology" eyebrow
 * (`shrink-0`, 110px) overflowed its squeezed `min-w-0` wrapper by 14px and
 * painted over the Glance/Inventory toggle, while the system name — the one
 * label that says WHICH estate this is — truncated to exactly zero width and
 * disappeared. The Platform-map summary row failed the same way: the label
 * wrapped to two lines and `N VPC · N AZ · N subnets · N resources` collapsed
 * to zero width.
 *
 * A screenshot review cannot catch the second half of that: a label rendered
 * at zero width leaves nothing on screen to look wrong. Both rows now wrap
 * instead of colliding, and this sweeps the widths to prove it.
 *
 * Non-vacuity is asserted, not assumed: at the narrowest width the chrome must
 * actually have wrapped (taller than one row) and the system name must have
 * real width — otherwise "no overlaps" would pass on an empty header.
 */
test("header rows wrap instead of colliding, and no label collapses to zero width", async ({
  context,
  page,
}) => {
  test.setTimeout(150_000)
  await seedAuthCookie(context)
  await routeSnapshot(page)
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })

  await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  await page.getByRole("tab", { name: "Network topology" }).click()

  const INLINE_SUMMARY = '[data-testid="topology-platform-map-summary"]'
  const FS = '[data-testid="topology-estate-map-fullscreen"]'
  const FS_CHROME = '[data-testid="topology-estate-fullscreen-chrome"]'
  const FS_SUMMARY = `${FS} ${INLINE_SUMMARY}`

  // The inline map's summary row fails at narrow widths too — same shape.
  await expect(page.locator(INLINE_SUMMARY).first()).toBeVisible()
  for (const width of [420, 460, 560, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(400)
    expect(
      await chromeTextDefects(page, INLINE_SUMMARY),
      `inline platform-map summary at ${width}px`,
    ).toEqual({ overlaps: [], collapsed: [] })
  }

  await page.setViewportSize({ width: 1600, height: 900 })
  await page.waitForTimeout(400)
  await page.getByTestId("topology-estate-map-enlarge").click()
  await expect(page.getByTestId("topology-estate-map-fullscreen")).toBeVisible()
  await page.waitForTimeout(900)

  const NARROWEST = 420
  for (const width of [NARROWEST, 460, 560, 768, 1024, 1600]) {
    await page.setViewportSize({ width, height: 900 })
    // Two frames for the wrap plus the fit-to-viewport refit.
    await page.waitForTimeout(600)

    expect(
      await chromeTextDefects(page, FS_CHROME),
      `fullscreen chrome at ${width}px`,
    ).toEqual({ overlaps: [], collapsed: [] })
    expect(
      await chromeTextDefects(page, FS_SUMMARY),
      `fullscreen platform-map summary at ${width}px`,
    ).toEqual({ overlaps: [], collapsed: [] })

    // Every control stays reachable inside the viewport — wrapping must not
    // push the Exit button off the right edge instead of onto the next row.
    const chromeGeometry = await page.evaluate(
      ({ chromeSel }) => {
        const chrome = document.querySelector<HTMLElement>(chromeSel)
        if (!chrome) throw new Error("fullscreen chrome not found")
        const escapees: string[] = []
        for (const el of Array.from(chrome.querySelectorAll<HTMLElement>("button"))) {
          const r = el.getBoundingClientRect()
          if (r.width === 0) continue
          if (r.left < -1 || r.right > window.innerWidth + 1) {
            escapees.push(`${(el.textContent ?? el.getAttribute("aria-label") ?? "?").trim()} @ ${Math.round(r.left)}..${Math.round(r.right)}`)
          }
        }
        return { height: Math.round(chrome.getBoundingClientRect().height), escapees }
      },
      { chromeSel: FS_CHROME },
    )
    expect(chromeGeometry.escapees, `controls inside the viewport at ${width}px`).toEqual([])

    if (width === NARROWEST) {
      // Non-vacuity 1: the row genuinely could not fit on one 44px line here,
      // so the sweep is exercising the tight case the bug lived in.
      expect(chromeGeometry.height, "chrome wrapped at the narrowest width").toBeGreaterThan(44)
      // Non-vacuity 2: the system name is actually painted, with real width.
      const nameWidth = await page.evaluate(
        ({ chromeSel, system }) => {
          const chrome = document.querySelector<HTMLElement>(chromeSel)
          const el = Array.from(chrome?.querySelectorAll<HTMLElement>("span") ?? []).find(
            s => (s.textContent ?? "").trim() === system,
          )
          return el ? Math.round(el.getBoundingClientRect().width) : -1
        },
        { chromeSel: FS_CHROME, system: SNAPSHOT.system },
      )
      expect(nameWidth, "system name is painted with real width").toBeGreaterThan(0)
    }
  }

  await page.setViewportSize({ width: 460, height: 900 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: "test-results/fullscreen-chrome-narrow.png", fullPage: false })
})
