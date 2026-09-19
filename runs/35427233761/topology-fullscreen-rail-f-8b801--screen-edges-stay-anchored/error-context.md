# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-fullscreen-rail-fixture.spec.ts >> fullscreen: each off-VPC rail lane scrolls in its track, both lanes stay on screen, edges stay anchored
- Location: tests/integration/topology-fullscreen-rail-fixture.spec.ts:49:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('topology-estate-view-map')
Expected: visible
Timeout: 60000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 60000ms
  - waiting for getByTestId('topology-estate-view-map')

```

```yaml
- heading "CYNTRO" [level=1]
- paragraph: Cloud Security Platform
- textbox "Enter password"
- button "Enter" [disabled]
- region "Notifications (F8)":
  - list
- alert
```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test"
  2   | import { seedAuthCookie } from "./live-auth"
  3   | import {
  4   |   chromeTextDefects,
  5   |   ESTATE_URL,
  6   |   railHeaderBadgeOverlaps,
  7   |   routeSnapshot,
  8   |   SNAPSHOT,
  9   | } from "./topology-fixture"
  10  | 
  11  | /**
  12  |  * Fullscreen right-rail clip — browser geometry regression (deterministic).
  13  |  *
  14  |  * Before the fix the Regional rail's cards ran past the bottom of the
  15  |  * fullscreen frame and no gesture could reach them: the region grid clipped
  16  |  * the rail, the content box was pinned to the viewport height, and the
  17  |  * density collapse that was meant to shorten the rail can never fire.
  18  |  * The rail is now two lanes (Lambda | Regional), each owning its own scroll.
  19  |  * This spec proves, in a real browser:
  20  |  *   1. both lane headers are on screen at once, with no scrolling,
  21  |  *   2. the Lambda lane really overflows (otherwise the test would be
  22  |  *      vacuous), owns its own scroll box, and its "+N more" footer counts
  23  |  *      exactly the chips below its fold,
  24  |  *   3. the last Lambda chip is out of view until the LANE scrolls, and
  25  |  *      inside the lane's box and the viewport after — the page and the
  26  |  *      Regional lane do not move, and the fold counters flip,
  27  |  *   4. flow edges into rail chips end inside the chip, and edges into
  28  |  *      scrolled-out chips pin to their lane's edge — never dangle,
  29  |  *   5. the lane's chips are one per row, each spanning the lane, and the lane
  30  |  *      BODY is never shorter than one row — its own min-height, on a content
  31  |  *      flex basis. A floor on the lane cannot protect the body inside it: on C1
  32  |  *      the Lambda lane measured 402px, far above RAIL_LANE_MIN_PX, while its
  33  |  *      body measured 1.75px and showed no chip (2026-09-11),
  34  |  *   6. an edge with both ends in the rail is carried by exactly one bundle
  35  |  *      path through the corridor between the lanes, neither the label nor the
  36  |  *      path itself lands on a rail chip (C1 production, 2026-09-02: 22 labels
  37  |  *      piled on the column), and its word is printed exactly once.
  38  |  *
  39  |  * Two things this payload cannot reach, pinned elsewhere rather than left to a
  40  |  * vacuous pass here. It carries no EventBridge / SQS / Step Functions node, so
  41  |  * the triggers band never renders and its own floor is pinned in
  42  |  * __tests__/topology-fullscreen-rail-scroll.test.tsx. And its two
  43  |  * ACTUAL_S3_ACCESS edges hit the same bucket, so it holds exactly ONE rail
  44  |  * bundle — the lane-pair label collapse (C1, 2026-09-11: twelve badges reading
  45  |  * TARGETS / TRIGGERS stacked in the gutter column) has nothing to collapse here
  46  |  * and is pinned on the real twelve-bundle shape in
  47  |  * __tests__/topology-rail-bundles.test.ts.
  48  |  */
  49  | test("fullscreen: each off-VPC rail lane scrolls in its track, both lanes stay on screen, edges stay anchored", async ({
  50  |   context,
  51  |   page,
  52  | }) => {
  53  |   test.setTimeout(150_000)
  54  |   await seedAuthCookie(context)
  55  |   await routeSnapshot(page)
  56  |   // A short viewport on purpose. Side by side each lane owns the column's whole
  57  |   // height rather than half of it, so the payload's 14 Lambdas and 18 regional
  58  |   // services must STILL overflow here — otherwise the fold assertions below
  59  |   // would pass without measuring anything.
  60  |   await page.setViewportSize({ width: 1600, height: 720 })
  61  |   await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  62  | 
  63  |   // The page resolves the system through the product scope + scoped catalog
  64  |   // (all answered by routeSnapshot) before it mounts the map and its tabs.
> 65  |   await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
      |                                                              ^ Error: expect(locator).toBeVisible() failed
  66  |   await page.getByRole("tab", { name: "Network topology" }).click()
  67  |   const dependencies = page
  68  |     .getByTestId("topology-flow-mode-toggle")
  69  |     .getByRole("button", { name: "Dependencies" })
  70  |     .first()
  71  |   await dependencies.click()
  72  |   await expect(dependencies).toHaveAttribute("aria-pressed", "true")
  73  | 
  74  |   await page.getByTestId("topology-estate-map-enlarge").click()
  75  |   const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  76  |   await expect(fullscreen).toBeVisible()
  77  |   // Inventory density: one icon per real node, so the lanes are as tall as the data.
  78  |   await fullscreen.getByTestId("topology-estate-density-fs-inventory").click()
  79  | 
  80  |   const rail = fullscreen.getByTestId("topology-edge-services-rail")
  81  |   await expect(rail).toBeVisible()
  82  |   // Let the fit settle (double rAF + the gridSourceNodes refit).
  83  |   await page.waitForTimeout(900)
  84  | 
  85  |   // Rail tier headers are flow obstacles: no edge label paints over them.
  86  |   expect(await railHeaderBadgeOverlaps(page)).toEqual([])
  87  | 
  88  |   // 1: both lane headers on screen, inside the rail's box, before any scroll.
  89  |   const railBox = await rail.boundingBox()
  90  |   expect(railBox).not.toBeNull()
  91  |   for (const header of ["serverless-tier-header", "regional-tier-header"]) {
  92  |     const box = await fullscreen.locator(`[data-flow-obstacle="${header}"]`).boundingBox()
  93  |     expect(box, header).not.toBeNull()
  94  |     expect(box!.y, header).toBeGreaterThanOrEqual(railBox!.y - 1)
  95  |     expect(box!.y + box!.height, header).toBeLessThanOrEqual(railBox!.y + railBox!.height + 1)
  96  |     expect(box!.y + box!.height, header).toBeLessThanOrEqual(720)
  97  |   }
  98  | 
  99  |   // 1b: the VPC chrome rows are sized to what they hold. At this height the
  100 |   // column cannot give every row its preferred size, and the band row (load
  101 |   // balancers · NAT fallback · AZ headers) was the one row whose wrapper had
  102 |   // no intrinsic minimum: with `minmax(auto, max-content)` its track resolved
  103 |   // to ~24px for ~108px of content on C1 (c1-ui-qa run 34576457683, 1600×900)
  104 |   // and the band painted over the Web tier. Used track sizes, not the authored
  105 |   // template — the question is what the layout engine did with the shortage.
  106 |   const chrome = await page.evaluate(() => {
  107 |     const root = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')!
  108 |     const grid = root.querySelector<HTMLElement>('[data-testid="topology-single-vpc-grid"]')
  109 |     const band = root.querySelector<HTMLElement>('[data-testid="topology-vpc-band-row"]')
  110 |     const azRow = root.querySelector<HTMLElement>('[data-flow-obstacle="az-header-row"]')
  111 |     const firstTier = root.querySelector<HTMLElement>('[data-testid="topology-tier-stack"]')
  112 |     if (!grid || !band || !azRow || !firstTier) return null
  113 |     const tracks = getComputedStyle(grid)
  114 |       .gridTemplateRows.split(" ")
  115 |       .map(v => Math.round(parseFloat(v)))
  116 |     const cells = Array.from(root.querySelectorAll<HTMLElement>('[data-testid="topology-subnet-cell-chrome"]'))
  117 |     const azBottom = azRow.getBoundingClientRect().bottom
  118 |     return {
  119 |       tracks,
  120 |       band_track: tracks[1],
  121 |       band_content: band.scrollHeight,
  122 |       band_bottom: Math.round(band.getBoundingClientRect().bottom),
  123 |       first_tier_top: Math.round(firstTier.getBoundingClientRect().top),
  124 |       cells: cells.length,
  125 |       cells_under_az_headers: cells.filter(cell => cell.getBoundingClientRect().top < azBottom - 1).length,
  126 |     }
  127 |   })
  128 |   expect(chrome, "single-VPC grid, band row, AZ header row and Web tier are rendered").not.toBeNull()
  129 |   expect(chrome!.tracks.length, "chrome, band, three tiers").toBe(5)
  130 |   expect(chrome!.cells, "subnet cells are drawn, so the overlap count below is not vacuous").toBeGreaterThan(0)
  131 |   expect(
  132 |     chrome!.band_track,
  133 |     `the band row's track is ${chrome!.band_track}px for ${chrome!.band_content}px of content — the chrome row was starved`,
  134 |   ).toBeGreaterThanOrEqual(chrome!.band_content - 1)
  135 |   expect(
  136 |     chrome!.first_tier_top,
  137 |     `the Web tier starts at ${chrome!.first_tier_top}px, above the band row's bottom at ${chrome!.band_bottom}px`,
  138 |   ).toBeGreaterThanOrEqual(chrome!.band_bottom - 1)
  139 |   expect(chrome!.cells_under_az_headers, "no subnet cell starts above the AZ header row's bottom edge").toBe(0)
  140 | 
  141 |   // 2: real overflow in the Lambda lane, one scroll owner, honest fold count.
  142 |   const laneBody = fullscreen.getByTestId("topology-serverless-lane-body")
  143 |   const lane = await laneBody.evaluate(el => {
  144 |     const box = el.getBoundingClientRect()
  145 |     let below = 0
  146 |     for (const chip of Array.from(el.querySelectorAll("[data-flow-id]"))) {
  147 |       if (chip.getBoundingClientRect().bottom > box.bottom + 1) below += 1
  148 |     }
  149 |     return {
  150 |       scrollHeight: el.scrollHeight,
  151 |       clientHeight: el.clientHeight,
  152 |       overflowY: getComputedStyle(el).overflowY,
  153 |       below,
  154 |     }
  155 |   })
  156 |   expect(lane.overflowY).toBe("auto")
  157 |   expect(lane.scrollHeight).toBeGreaterThan(lane.clientHeight + 20)
  158 |   expect(lane.below).toBeGreaterThan(0)
  159 |   const more = fullscreen.getByTestId("topology-serverless-lane-more")
  160 |   await expect(more).toBeVisible()
  161 |   await expect(more).toHaveText(`+${lane.below} more ↓`)
  162 |   await expect(fullscreen.getByTestId("topology-serverless-lane-above")).toHaveCount(0)
  163 | 
  164 |   // 6: intra-rail edges are bundled through the corridor. Every payload edge
  165 |   // whose both ends resolve to rail chips is carried by exactly one bundle
```