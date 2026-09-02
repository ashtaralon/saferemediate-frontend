import { expect, test } from "@playwright/test"
import { seedAuthCookie } from "./live-auth"
import { ESTATE_URL, routeSnapshot } from "./topology-fixture"

/**
 * Fullscreen right-rail clip — browser geometry regression (deterministic).
 *
 * Before the fix the Regional rail's cards ran past the bottom of the
 * fullscreen frame and no gesture could reach them: the region grid clipped
 * the rail, the content box was pinned to the viewport height, and the
 * density collapse that was meant to shorten the rail can never fire.
 * This spec proves, in a real browser:
 *   1. the rail overflows its track (otherwise the test would be vacuous),
 *   2. it owns exactly one scroll box,
 *   3. the last Regional chip is out of view before scrolling and fully
 *      inside the rail's box and the viewport after scrolling the RAIL,
 *   4. flow edges into rail chips end inside the chip after the scroll, and
 *      edges into scrolled-out chips pin to the rail edge — never dangle.
 */
test("fullscreen: the off-VPC rail scrolls inside its track and edges stay anchored", async ({
  context,
  page,
}) => {
  test.setTimeout(150_000)
  await seedAuthCookie(context)
  await routeSnapshot(page)
  // A short viewport on purpose: 16 Lambdas + 18 regional services must not fit.
  await page.setViewportSize({ width: 1600, height: 820 })
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
  // Inventory density: one icon per real node, so the rail is as tall as the data.
  await fullscreen.getByTestId("topology-estate-density-fs-inventory").click()

  const rail = fullscreen.getByTestId("topology-edge-services-rail")
  await expect(rail).toBeVisible()
  // Let the fit settle (double rAF + the gridSourceNodes refit).
  await page.waitForTimeout(900)

  // 1 + 2: real overflow, one scroll owner.
  const metrics = await rail.evaluate(el => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    overflowY: getComputedStyle(el).overflowY,
    nestedScrollers: el.querySelectorAll("[class*='overflow-y-auto']").length,
  }))
  expect(metrics.overflowY).toBe("auto")
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight + 40)
  expect(metrics.nestedScrollers).toBe(0)

  // 3: the last Regional chip is below the rail's visible box until the rail scrolls.
  const chips = rail.locator('[data-testid="topology-regional-data-tier"] [data-flow-id]')
  const chipCount = await chips.count()
  expect(chipCount).toBeGreaterThan(0)
  const last = chips.nth(chipCount - 1)
  const railBox = await rail.boundingBox()
  const before = await last.boundingBox()
  expect(railBox).not.toBeNull()
  expect(before).not.toBeNull()
  expect(before!.y + before!.height).toBeGreaterThan(railBox!.y + railBox!.height)

  const pageScrollBefore = await page.evaluate(() => window.scrollY)
  await last.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400) // capture-phase scroll listener → rAF re-measure
  const after = await last.boundingBox()
  const railAfter = await rail.boundingBox()
  expect(after).not.toBeNull()
  expect(railAfter).not.toBeNull()
  expect(after!.y).toBeGreaterThanOrEqual(railAfter!.y - 1)
  expect(after!.y + after!.height).toBeLessThanOrEqual(railAfter!.y + railAfter!.height + 1)
  expect(after!.y + after!.height).toBeLessThanOrEqual(820)
  // The RAIL scrolled, not the page.
  expect(await page.evaluate(() => window.scrollY)).toBe(pageScrollBefore)
  const railScrollTop = await rail.evaluate(el => el.scrollTop)
  expect(railScrollTop).toBeGreaterThan(0)

  // 4: edge anchoring after the scroll.
  const anchored = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')!
    const railEl = root.querySelector('[data-testid="topology-edge-services-rail"]')!
    const railRect = railEl.getBoundingClientRect()
    const out: Array<{
      id: string
      visible: boolean
      end: { x: number; y: number }
      chip: { l: number; t: number; r: number; b: number }
      rail: { t: number; b: number }
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
      out.push({
        id,
        visible: r.bottom > railRect.top && r.top < railRect.bottom,
        end: { x: end.x, y: end.y },
        chip: { l: r.left, t: r.top, r: r.right, b: r.bottom },
        rail: { t: railRect.top, b: railRect.bottom },
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
      // Scrolled out of the rail: pinned to the rail's edge, not left dangling.
      expect(a.end.y, `edge into scrolled-out ${a.id} pins to the rail`).toBeGreaterThanOrEqual(a.rail.t - tolerance)
      expect(a.end.y, `edge into scrolled-out ${a.id} pins to the rail`).toBeLessThanOrEqual(a.rail.b + tolerance)
    }
  }

  await page.screenshot({ path: "test-results/fullscreen-rail-scrolled.png", fullPage: false })
})
