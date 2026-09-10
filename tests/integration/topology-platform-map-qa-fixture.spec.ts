import { expect, test } from "@playwright/test"
import { seedAuthCookie } from "./live-auth"
import { ESTATE_URL, SNAPSHOT, railHeaderBadgeOverlaps, routeSnapshot } from "./topology-fixture"

// Deterministic fixture spec (renamed from *-qa-live 2026-09-02): it never
// reaches a backend — see tests/integration/topology-fixture.ts.

test("fullscreen platform map shows named Lambda, protected AZ labels, directional flow, legend, and e2e service path", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000)
  await seedAuthCookie(context)
  await routeSnapshot(page)
  await page.setViewportSize({ width: 2048, height: 1100 })
  await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })

  // The page resolves the system through the product scope + scoped catalog
  // (all answered by routeSnapshot) before it mounts the map and its tabs.
  await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  await page.getByRole("tab", { name: "Network topology" }).click()
  await expect(page.getByRole("heading", { name: "Service index" })).toBeVisible()
  await expect(page.getByText("Next worst")).toHaveCount(0)

  const dependencies = page
    .getByTestId("topology-flow-mode-toggle")
    .getByRole("button", { name: "Dependencies" })
    .first()
  await dependencies.click()
  await expect(dependencies).toHaveAttribute("aria-pressed", "true")
  const legend = page.getByTestId("topology-flow-legend").first()
  await expect(legend).toBeVisible()
  await expect(legend).toContainText("Service call")
  await expect(legend).toContainText("AWS data service")
  await expect(legend).toContainText("VPC endpoint")
  await expect(legend).toContainText("Internet egress")
  await expect(legend).toContainText("Database")
  const authorityState = page.getByTestId("topology-traffic-authority-state").first()
  await expect(authorityState).toContainText("Confirmed TCP paths")
  await expect(authorityState).toContainText("missing segment is not evidence of no traffic")

  // Flow-log coverage pill: every number is the payload's lane_coverage block.
  const coverage = SNAPSHOT.traffic_authority.lane_coverage
  const pill = page.getByTestId("topology-lane-coverage").first()
  await expect(pill).toBeVisible()
  await expect(pill.getByTestId("topology-lane-coverage-totals")).toHaveText(
    `${coverage.authoritative} of ${coverage.eligible} eligible endpoints covered · ${coverage.unknown} unknown · ${coverage.not_applicable} not applicable · generation 7`,
  )
  await expect(pill.getByTestId("topology-lane-coverage-serverless")).toHaveAttribute("data-lane-state", "unknown")
  await expect(pill.getByTestId("topology-lane-coverage-regional")).toHaveAttribute("data-lane-state", "not_applicable")
  await expect(pill.getByTestId("topology-coverage-gap")).toHaveCount(
    (SNAPSHOT.traffic_authority.coverage_gaps ?? coverage.warnings).length,
  )

  await page.getByTestId("topology-estate-map-enlarge").click()
  const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  await expect(fullscreen).toBeVisible()

  const lambda = fullscreen.getByRole("button", { name: /alon-prod-continuous-traffic/i })
  await expect(lambda).toBeVisible()
  const lambdaBox = await lambda.boundingBox()
  expect(lambdaBox).not.toBeNull()
  expect(lambdaBox!.x).toBeGreaterThanOrEqual(0)
  expect(lambdaBox!.y).toBeGreaterThanOrEqual(0)
  expect(lambdaBox!.x + lambdaBox!.width).toBeLessThanOrEqual(2048)
  expect(lambdaBox!.y + lambdaBox!.height).toBeLessThanOrEqual(1100)

  const movingPacket = fullscreen.getByTestId("topology-flow-packet").first()
  await expect(movingPacket).toBeAttached()
  await expect(movingPacket.locator("animateMotion, animatemotion")).toHaveAttribute("dur", "6.4s")
  const firstPosition = await movingPacket.evaluate(packet => {
    const rect = packet.getBoundingClientRect()
    return { x: rect.x, y: rect.y }
  })
  await page.waitForTimeout(550)
  const secondPosition = await movingPacket.evaluate(packet => {
    const rect = packet.getBoundingClientRect()
    return { x: rect.x, y: rect.y }
  })
  expect(
    Math.abs(firstPosition.x - secondPosition.x) + Math.abs(firstPosition.y - secondPosition.y),
  ).toBeGreaterThan(2)

  const azLabels = fullscreen.locator('[data-flow-obstacle="az-header-row"] [title^="eu-west-1"]')
  const azCount = await azLabels.count()
  expect(azCount).toBeGreaterThanOrEqual(2)
  for (let index = 0; index < azCount; index += 1) {
    const label = azLabels.nth(index)
    const isTopmost = await label.evaluate(element => {
      const rect = element.getBoundingClientRect()
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return top === element || element.contains(top)
    })
    expect(isTopmost).toBe(true)
  }

  // Rail tier headers are flow obstacles: no edge label paints over them.
  await page.waitForTimeout(600) // double-rAF measure after the fit
  expect(await railHeaderBadgeOverlaps(page)).toEqual([])

  // The IGW / VPCE column is named like the two lanes beside it, and its
  // counts are the chips it actually renders — asserted against the DOM rather
  // than against a number, so a header that outgrows its column fails here.
  const boundaryHeader = fullscreen.getByTestId("topology-boundary-rail-header")
  await expect(boundaryHeader).toContainText("VPC boundary")
  const igwChips = await fullscreen.getByTestId("topology-igw-rail-chip").count()
  const vpceChips = await fullscreen.getByTestId("topology-vpce-rail-chip").count()
  expect(igwChips + vpceChips).toBeGreaterThan(0)
  await expect(boundaryHeader).toContainText(
    `${igwChips} internet ${igwChips === 1 ? "gateway" : "gateways"} · ${vpceChips} endpoints`,
  )

  // Tier rows hug their chips. They used to split the column's whole leftover
  // height 1.35fr : 1.2fr : 0.65fr, which spends it on whichever tier is listed
  // first rather than on whichever tier holds anything: measured on this payload
  // at 1800×1000, Web took 245px to show ONE chip per subnet — 84px of it blank
  // below that chip — while App fitted two rows into 218px, 26% of the column
  // blank overall. A fr split cannot be caught by reading the CSS (every row
  // looks symmetrical) or by a jsdom test (no layout), so this is measured in
  // the browser, at this spec's tall viewport: the waste only exists when the
  // column has height to misallocate (at 1600×720 the same split wasted 25px,
  // which is why the assertion is not in the rail spec).
  const measureTierSlack = () =>
    page.evaluate(() => {
      const root = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')!
      const grid = root.querySelector<HTMLElement>('[data-testid="topology-single-vpc-grid"]')
      const frame = root.querySelector('[data-testid="topology-vpc-frame"]')
      if (!grid || !frame) return null
      // Named chips carry data-flow-id, Glance stack tiles data-flow-ids, so this
      // measures real content at whichever density the map opened in.
      const perCell = () =>
        Array.from(frame.querySelectorAll<HTMLElement>('[data-testid="topology-subnet-cell-workloads"]')).flatMap(
          cell => {
            const chips = Array.from(cell.querySelectorAll<HTMLElement>("[data-flow-id], [data-flow-ids]"))
            if (chips.length === 0) return []
            const bottom = cell.getBoundingClientRect().bottom
            const lowest = Math.max(...chips.map(c => c.getBoundingClientRect().bottom))
            return [{ chips: chips.length, blankBelow: Math.round(bottom - lowest) }]
          },
        )
      const worst = (cells: Array<{ blankBelow: number }>) =>
        cells.reduce((max, c) => Math.max(max, c.blankBelow), 0)
      const live = perCell()
      // The same measurement under the row template this replaced, applied to the
      // live grid and reverted straight after — a bound nothing can violate is
      // decoration, and this one had to be moved once already to find a viewport
      // where the defect is reachable.
      const kept = { rows: grid.style.gridTemplateRows, align: grid.style.alignContent }
      grid.style.gridTemplateRows = "auto auto minmax(0, 1.35fr) minmax(0, 1.2fr) minmax(0, 0.65fr)"
      grid.style.alignContent = "stretch"
      void grid.getBoundingClientRect() // flush layout before re-measuring
      const underFrSplit = worst(perCell())
      grid.style.gridTemplateRows = kept.rows
      grid.style.alignContent = kept.align
      void grid.getBoundingClientRect()
      return { live, worst: worst(live), underFrSplit, restored: worst(perCell()) }
    })
  const tierSlack = await measureTierSlack()
  expect(tierSlack, "the VPC grid exposes the row template to re-measure").not.toBeNull()
  expect(tierSlack!.live.length, "the VPC frame has tier cells holding chips to measure").toBeGreaterThan(0)
  expect(
    tierSlack!.worst,
    `a tier leaves ${tierSlack!.worst}px blank below its chips — rows must hug content, not split the column`,
  ).toBeLessThanOrEqual(48)
  expect(
    tierSlack!.underFrSplit,
    `the fr split this replaced wastes only ${tierSlack!.underFrSplit}px here, so the bound above proves nothing`,
  ).toBeGreaterThan(48)
  expect(tierSlack!.restored, "the row template is restored after the control measurement").toBeLessThanOrEqual(48)


  await lambda.click()
  const detail = page.getByTestId("topology-service-detail-panel")
  await expect(detail).toBeVisible()
  await expect(detail.getByText("Service inspector")).toBeVisible()
  await expect(detail.getByText("AWS-managed runtime · not VPC-attached").first()).toBeVisible()
  const pathMap = detail.getByTestId("topology-service-path-map")
  await expect(pathMap).toBeVisible()
  await expect(pathMap).toContainText("Neptune graph")
  await expect(pathMap).toContainText("Generation 7 · confirmed TCP")
  await expect(pathMap).toContainText("alon-prod-continuous-traffic")
  await expect(pathMap).toContainText("alon-demo-data-bucket-745783559495")
  // The words, not the graph relationship type. The identifier an operator
  // would paste into Cypher stays on the hover title.
  const s3Segment = pathMap.getByText("S3 access", { exact: true }).first()
  await expect(s3Segment).toBeVisible()
  await expect(s3Segment).toHaveAttribute("title", "S3 access · ACTUAL_S3_ACCESS")
  await expect(pathMap.getByText("ACTUAL_S3_ACCESS")).toHaveCount(0)
  await expect(pathMap.getByTestId("topology-inspector-flow-packet").first()).toBeAttached()
  await expect(detail.getByText("alon-demo-data-bucket-745783559495").last()).toBeVisible()
  await expect(detail).toHaveAttribute("data-expanded", "false")

  const resize = detail.getByTestId("topology-service-detail-resize")
  await resize.click()
  await expect(detail).toHaveAttribute("data-expanded", "true")
  const expandedBox = await detail.boundingBox()
  expect(expandedBox).not.toBeNull()
  expect(expandedBox!.width).toBeGreaterThan(1900)
  await resize.click()
  await expect(detail).toHaveAttribute("data-expanded", "false")

  await page.screenshot({
    path: "test-results/topology-platform-map-fullscreen.png",
    fullPage: false,
  })

  await detail.getByRole("button", { name: "Close service details" }).click()
  await expect(detail).toHaveCount(0)

  const ssmMessagesVpce = fullscreen
    .getByTestId("topology-vpce-rail-chip")
    .filter({ hasText: "SSM Messages" })
    .first()
  await expect(ssmMessagesVpce).toBeVisible()
  await ssmMessagesVpce.click()

  const vpceDetail = page.getByTestId("topology-service-detail-panel")
  await expect(vpceDetail).toBeVisible()
  await expect(vpceDetail.getByText("SSM Messages VPC endpoint").first()).toBeVisible()
  await expect(vpceDetail.getByText("Network boundary · Interface endpoint")).toBeVisible()
  const vpcePathMap = vpceDetail.getByTestId("topology-service-path-map")
  await expect(vpcePathMap).toContainText("SafeRemediate-Test-Frontend-1")
  await expect(vpcePathMap).toContainText("AWS SSM Messages")
  await expect(vpcePathMap.getByText(/^(traffic|AWS service|via VPCE)$/).first()).toBeVisible()
  await expect(vpcePathMap.getByText(/ACTUAL_TRAFFIC|AWS_SERVICE|VPC_ENDPOINT/)).toHaveCount(0)

  const focusedPacket = fullscreen
    .locator('[data-testid="topology-flow-packet"][data-flow-focused="true"]')
    .first()
  await expect(focusedPacket).toBeAttached()
  await expect(focusedPacket.locator("animateMotion, animatemotion")).toHaveAttribute("dur", "4.8s")

  await vpceDetail.getByTestId("topology-service-detail-resize").click()
  await expect(vpceDetail).toHaveAttribute("data-expanded", "true")
  await page.screenshot({
    path: "test-results/topology-platform-map-vpce-expanded.png",
    fullPage: false,
  })
})
