import { expect, test } from "@playwright/test"
import { seedAuthCookie } from "./live-auth"
import { ESTATE_URL, railHeaderBadgeOverlaps, routeSnapshot } from "./topology-fixture"

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
 *      scrolled-out chips pin to their lane's edge — never dangle.
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

  // 3: the last Lambda chip is below the lane's fold until the LANE scrolls.
  const chips = laneBody.locator("[data-flow-id]")
  const chipCount = await chips.count()
  expect(chipCount).toBeGreaterThan(0)
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
  // The LANE scrolled — not the page, not the Regional lane.
  expect(await page.evaluate(() => window.scrollY)).toBe(pageScrollBefore)
  expect(await laneBody.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  expect(await fullscreen.getByTestId("topology-regional-lane-body").evaluate(el => el.scrollTop)).toBe(0)
  await expect(fullscreen.getByTestId("topology-serverless-lane-above")).toBeVisible()

  // 4: edge anchoring after the scroll.
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
  expect(anchored.length).toBeGreaterThan(0)
  const tolerance = 16
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
