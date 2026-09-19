# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-platform-map-qa-fixture.spec.ts >> fullscreen platform map shows named Lambda, protected AZ labels, directional flow, legend, and e2e service path
- Location: tests/integration/topology-platform-map-qa-fixture.spec.ts:8:5

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
  3   | import { ESTATE_URL, SNAPSHOT, logicalGroupSnapshot, railHeaderBadgeOverlaps, routeSnapshot } from "./topology-fixture"
  4   | 
  5   | // Deterministic fixture spec (renamed from *-qa-live 2026-09-02): it never
  6   | // reaches a backend — see tests/integration/topology-fixture.ts.
  7   | 
  8   | test("fullscreen platform map shows named Lambda, protected AZ labels, directional flow, legend, and e2e service path", async ({
  9   |   context,
  10  |   page,
  11  | }) => {
  12  |   test.setTimeout(120_000)
  13  |   await seedAuthCookie(context)
  14  |   await routeSnapshot(page)
  15  |   await page.setViewportSize({ width: 2048, height: 1100 })
  16  |   await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  17  | 
  18  |   // The page resolves the system through the product scope + scoped catalog
  19  |   // (all answered by routeSnapshot) before it mounts the map and its tabs.
> 20  |   await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
      |                                                              ^ Error: expect(locator).toBeVisible() failed
  21  |   await page.getByRole("tab", { name: "Network topology" }).click()
  22  |   await expect(page.getByRole("heading", { name: "Service index" })).toBeVisible()
  23  |   await expect(page.getByText("Next worst")).toHaveCount(0)
  24  | 
  25  |   const dependencies = page
  26  |     .getByTestId("topology-flow-mode-toggle")
  27  |     .getByRole("button", { name: "Dependencies" })
  28  |     .first()
  29  |   await dependencies.click()
  30  |   await expect(dependencies).toHaveAttribute("aria-pressed", "true")
  31  |   const legend = page.getByTestId("topology-flow-legend").first()
  32  |   await expect(legend).toBeVisible()
  33  |   await expect(legend).toContainText("Service call")
  34  |   await expect(legend).toContainText("AWS data service")
  35  |   await expect(legend).toContainText("VPC endpoint")
  36  |   await expect(legend).toContainText("Internet egress")
  37  |   await expect(legend).toContainText("Database")
  38  |   const authorityState = page.getByTestId("topology-traffic-authority-state").first()
  39  |   await expect(authorityState).toContainText("Confirmed TCP paths")
  40  |   await expect(authorityState).toContainText("missing segment is not evidence of no traffic")
  41  | 
  42  |   // Flow-log coverage pill: every number is the payload's lane_coverage block.
  43  |   const coverage = SNAPSHOT.traffic_authority.lane_coverage
  44  |   const pill = page.getByTestId("topology-lane-coverage").first()
  45  |   await expect(pill).toBeVisible()
  46  |   await expect(pill.getByTestId("topology-lane-coverage-totals")).toHaveText(
  47  |     `${coverage.authoritative} of ${coverage.eligible} eligible endpoints covered · ${coverage.unknown} unknown · ${coverage.not_applicable} not applicable · generation 7`,
  48  |   )
  49  |   await expect(pill.getByTestId("topology-lane-coverage-serverless")).toHaveAttribute("data-lane-state", "unknown")
  50  |   await expect(pill.getByTestId("topology-lane-coverage-regional")).toHaveAttribute("data-lane-state", "not_applicable")
  51  |   await expect(pill.getByTestId("topology-coverage-gap")).toHaveCount(
  52  |     (SNAPSHOT.traffic_authority.coverage_gaps ?? coverage.warnings).length,
  53  |   )
  54  | 
  55  |   // The INLINE map, before fullscreen: this is the surface in the operator's own
  56  |   // screenshot, and it is the tight one — the Lambda and Regional lanes take the
  57  |   // right third, so the VPC frame is ~950px. It is a single-frame canvas like
  58  |   // the fullscreen one, so its IGW and endpoints are in the VPC BOUNDARY column
  59  |   // beside the frame, not on the header line, and the VPC id — which used to
  60  |   // lose that line to five pills and render as "VPC…" — has it to itself.
  61  |   // Document-wide is unambiguous here and only here: the fullscreen overlay is
  62  |   // not mounted yet, so exactly one map exists. Every query AFTER the enlarge
  63  |   // click has to scope to the overlay.
  64  |   await expect(page.getByTestId("topology-estate-map-fullscreen")).toHaveCount(0)
  65  |   const inlineGeom = await page.evaluate(() => {
  66  |     const column = document.querySelector('[data-testid="topology-vpc-boundary-column"]')
  67  |     const frame = document.querySelector('[data-testid="topology-vpc-frame"]')
  68  |     const id = document.querySelector('[data-testid="topology-vpc-frame-id"]') as HTMLElement | null
  69  |     if (!column || !frame || !id) return null
  70  |     const c = column.getBoundingClientRect()
  71  |     const f = frame.getBoundingClientRect()
  72  |     return {
  73  |       idVisibleFraction: id.clientWidth / id.scrollWidth,
  74  |       headerStrip: document.querySelector('[data-testid="topology-vpc-boundary-strip"]') !== null,
  75  |       rightOfFrame: c.left >= f.right - 1,
  76  |       clippedPills: [
  77  |         ...document.querySelectorAll(
  78  |           '[data-testid="topology-igw-rail-chip"],[data-testid="topology-vpce-rail-chip"]',
  79  |         ),
  80  |       ].filter(el => {
  81  |         const r = el.getBoundingClientRect()
  82  |         return r.width < 40 || r.left < c.left - 1 || r.right > c.right + 1
  83  |       }).length,
  84  |     }
  85  |   })
  86  |   expect(inlineGeom).not.toBeNull()
  87  |   expect(inlineGeom!.headerStrip).toBe(false)
  88  |   expect(inlineGeom!.rightOfFrame).toBe(true)
  89  |   // Every device fits the column: none clipped, none narrower than a pill.
  90  |   expect(inlineGeom!.clippedPills).toBe(0)
  91  |   expect(inlineGeom!.idVisibleFraction).toBeGreaterThan(0.6)
  92  | 
  93  |   await page.getByTestId("topology-estate-map-enlarge").click()
  94  |   const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  95  |   await expect(fullscreen).toBeVisible()
  96  | 
  97  |   const lambda = fullscreen.getByRole("button", { name: /alon-prod-continuous-traffic/i })
  98  |   await expect(lambda).toBeVisible()
  99  |   const lambdaBox = await lambda.boundingBox()
  100 |   expect(lambdaBox).not.toBeNull()
  101 |   expect(lambdaBox!.x).toBeGreaterThanOrEqual(0)
  102 |   expect(lambdaBox!.y).toBeGreaterThanOrEqual(0)
  103 |   expect(lambdaBox!.x + lambdaBox!.width).toBeLessThanOrEqual(2048)
  104 |   expect(lambdaBox!.y + lambdaBox!.height).toBeLessThanOrEqual(1100)
  105 | 
  106 |   const movingPacket = fullscreen.getByTestId("topology-flow-packet").first()
  107 |   await expect(movingPacket).toBeAttached()
  108 |   await expect(movingPacket.locator("animateMotion, animatemotion")).toHaveAttribute("dur", "6.4s")
  109 |   const firstPosition = await movingPacket.evaluate(packet => {
  110 |     const rect = packet.getBoundingClientRect()
  111 |     return { x: rect.x, y: rect.y }
  112 |   })
  113 |   await page.waitForTimeout(550)
  114 |   const secondPosition = await movingPacket.evaluate(packet => {
  115 |     const rect = packet.getBoundingClientRect()
  116 |     return { x: rect.x, y: rect.y }
  117 |   })
  118 |   expect(
  119 |     Math.abs(firstPosition.x - secondPosition.x) + Math.abs(firstPosition.y - secondPosition.y),
  120 |   ).toBeGreaterThan(2)
```