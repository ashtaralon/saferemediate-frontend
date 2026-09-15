import { expect, test, type Page } from "@playwright/test"
import { seedAuthCookie } from "./live-auth"
import {
  ESTATE_URL,
  routeSnapshot,
  v11ExternalDestinationSnapshot,
} from "./topology-fixture"

const VIEWPORTS = [
  { name: "desktop", width: 1600, height: 900 },
  { name: "narrow", width: 375, height: 812 },
] as const

async function openMap(page: Page, snapshot: Record<string, unknown>) {
  await routeSnapshot(page, snapshot)
  await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  await page.getByRole("tab", { name: "Network topology" }).click()
}

async function expectPanelOnTop(page: Page, testId: string) {
  await page.waitForFunction((id) => {
    const panel = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
    if (!panel) return false
    const rect = panel.getBoundingClientRect()
    if (rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight) return false
    let opacity = 1
    for (let node: Element | null = panel; node && node !== document.documentElement; node = node.parentElement) {
      opacity *= Number(getComputedStyle(node).opacity)
    }
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 8)
    return opacity >= 0.999 && Boolean(top && (top === panel || panel.contains(top)))
  }, testId)
}

for (const viewport of VIEWPORTS) {
  test(`v11 draws only the exact IGW continuation and exposes evidence detail at ${viewport.name}`, async ({ context, page }) => {
    test.setTimeout(120_000)
    const fixture = v11ExternalDestinationSnapshot()
    await seedAuthCookie(context)
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.emulateMedia({ reducedMotion: "reduce" })
    await openMap(page, fixture.snapshot)

    const lane = page.getByTestId("topology-external-destinations-lane")
    await expect(lane).toBeVisible()
    await expect(lane).toHaveAttribute("data-gateway-id", fixture.exactIgwId)
    await expect(lane).toHaveAttribute("data-detail-state", "complete")
    await expect(lane).toHaveAttribute("data-unlinked-count", "0")
    await expect(lane).toHaveAttribute("data-unidentified-upper-bound", "1")
    await expect(lane).toHaveAttribute("data-evidence-state", "observed")
    await expect(lane).toHaveAttribute("data-rejected-node-count", "0")
    await expect(lane).toHaveAttribute("data-rejected-edge-count", "0")

    const destination = lane.getByTestId("topology-external-destination-node")
    await expect(destination).toHaveCount(1)
    await expect(destination).toContainText("18.202.1.10")
    await expect(destination).toHaveAttribute("data-identity", "address")
    await expect(destination).toHaveAttribute("data-evidence-type", "observed")
    await expect(destination).not.toContainText("S3")
    await expect(lane.getByTestId("topology-external-destinations-unidentified")).toContainText(
      "kept separate · no IGW line inferred",
    )

    await lane.scrollIntoViewIfNeeded()
    const target = `extdst:${fixture.contract.external_destination_projection.nodes[0].id}`
    const continuation = page.locator(
      `g[data-flow-source="__igw__"][data-flow-target="${target}"]`,
    )
    await expect(continuation).toHaveCount(1, { timeout: 20_000 })
    await expect(continuation).toHaveAttribute("data-flow-authority", "inferred")
    await expect(continuation).toHaveAttribute("data-flow-path-basis", "synthetic_expansion")
    await expect(continuation).toHaveAttribute("data-flow-motion", "none")
    await expect(continuation).toHaveAttribute("data-flow-relationship", "VISUAL_CONTINUATION")
    await expect(continuation).toHaveAttribute("data-flow-destination-evidence", "observed")
    await expect(continuation).toHaveAttribute("data-flow-gateway-evidence", "configured")
    await expect(continuation).toHaveAttribute("data-flow-gateway-traversal-observed", "false")
    await expect(continuation).toHaveAttribute(
      "data-flow-projection-path-basis",
      "observed_destination_with_configured_route",
    )
    await expect(continuation.locator("animate, animateMotion, animateTransform")).toHaveCount(0)

    const toggle = lane.getByTestId("topology-external-destinations-toggle")
    await toggle.click()
    const panel = page.getByTestId("topology-external-destinations-details")
    await expectPanelOnTop(page, "topology-external-destinations-details")
    await expect(panel.getByTestId("topology-external-destination-detail-state")).toHaveAttribute(
      "data-detail-state",
      "complete",
    )
    await expect(panel).toContainText("Destination details complete: 1 of 1 returned")
    await expect(panel).toContainText("Gateway continuation is configured routing")
    await expect(panel).toContainText("does not claim the gateway hop was observed per packet")
    const item = panel.getByTestId("topology-external-destination-projection-item")
    await expect(item).toHaveAttribute("data-gateway-linked", "true")
    await expect(item).toHaveAttribute("data-evidence-type", "observed")
    await expect(item).toContainText("ports 443")
    await expect(item).toContainText("31 observations")
    await expect(item).toContainText("observed evidence")
    await expect(panel.getByTestId("topology-unidentified-external-peers")).toContainText(
      "No IGW path is drawn without an exact classified destination and configured gateway",
    )

    await item.focus()
    await page.keyboard.press("Escape")
    await expect(panel).toHaveCount(0)
    await expect(toggle).toBeFocused()
  })
}

test("v11 keeps observed and legacy-unverified destination evidence distinct", async ({ context, page }) => {
  test.setTimeout(120_000)
  const fixture = v11ExternalDestinationSnapshot()
  await seedAuthCookie(context)
  await page.setViewportSize({ width: 1366, height: 768 })
  const snapshot = structuredClone(fixture.snapshot)
  const projection = snapshot.external_destination_projection
  const observedNode = projection.nodes[0]
  projection.nodes.push({
    ...observedNode,
    id: "external-destination:legacy-browser",
    address: "18.202.1.11",
    observation_count: null,
    total_bytes: null,
    first_seen: null,
    last_seen: null,
    evidence_type: "legacy_unverified",
    evidence_source: "legacy_behavioral_graph",
    evidence_ids: [],
    projection_generation: null,
  })
  projection.edges.push({
    ...projection.edges[0],
    target_id: "external-destination:legacy-browser",
    destination_evidence: "legacy_unverified",
    path_basis: "legacy_destination_with_configured_route",
  })
  projection.nodes.push({
    ...observedNode,
    id: "external-destination:mixed-browser",
    address: "18.202.1.12",
    evidence_type: "mixed",
    evidence_source: "mixed",
    projection_generation: null,
  })
  projection.edges.push({
    ...projection.edges[0],
    target_id: "external-destination:mixed-browser",
    destination_evidence: "mixed",
    path_basis: "mixed_destination_with_configured_route",
  })
  projection.counts.returned_destination_nodes = 3
  projection.counts.named_destination_nodes_before_bound = 3
  projection.counts.per_workload_distinct_upper_bound = 3
  await openMap(page, snapshot)

  const lane = page.getByTestId("topology-external-destinations-lane")
  await expect(lane).toHaveAttribute("data-evidence-state", "mixed")
  await expect(lane.getByTestId("topology-external-destinations-provenance")).toContainText(
    "Observed + legacy/unverified identities",
  )
  await expect(lane.locator('[data-testid="topology-external-destination-node"][data-evidence-type="observed"]')).toHaveCount(1)
  await expect(lane.locator('[data-testid="topology-external-destination-node"][data-evidence-type="legacy_unverified"]')).toHaveCount(1)
  await expect(lane.locator('[data-testid="topology-external-destination-node"][data-evidence-type="mixed"]')).toHaveCount(1)
  const observedContinuation = page.locator('g[data-flow-target^="extdst:"][data-flow-destination-evidence="observed"]')
  const legacyContinuation = page.locator('g[data-flow-target^="extdst:"][data-flow-destination-evidence="legacy_unverified"]')
  const mixedContinuation = page.locator('g[data-flow-target^="extdst:"][data-flow-destination-evidence="mixed"]')
  await expect(observedContinuation).toHaveAttribute(
    "data-flow-projection-path-basis",
    "observed_destination_with_configured_route",
  )
  await expect(legacyContinuation).toHaveAttribute(
    "data-flow-projection-path-basis",
    "legacy_destination_with_configured_route",
  )
  await expect(mixedContinuation).toHaveAttribute(
    "data-flow-projection-path-basis",
    "mixed_destination_with_configured_route",
  )
  for (const continuation of [observedContinuation, legacyContinuation, mixedContinuation]) {
    await expect(continuation).toHaveAttribute("data-flow-gateway-evidence", "configured")
    await expect(continuation).toHaveAttribute("data-flow-gateway-traversal-observed", "false")
  }

  await lane.getByTestId("topology-external-destinations-toggle").click()
  const panel = page.getByTestId("topology-external-destinations-details")
  await expectPanelOnTop(page, "topology-external-destinations-details")
  await expect(panel).toContainText("mix observed and legacy, unverified evidence")
  await expect(panel.locator('[data-testid="topology-external-destination-projection-item"][data-evidence-type="observed"]')).toContainText("observed evidence")
  await expect(panel.locator('[data-testid="topology-external-destination-projection-item"][data-evidence-type="legacy_unverified"]')).toContainText("legacy/unverified evidence")
  await expect(panel.locator('[data-testid="topology-external-destination-projection-item"][data-evidence-type="mixed"]')).toContainText("mixed observed + legacy/unverified evidence")
})

test("v11 rejects malformed continuation evidence and draws no destination line", async ({ context, page }) => {
  test.setTimeout(120_000)
  const fixture = v11ExternalDestinationSnapshot()
  await seedAuthCookie(context)
  await page.setViewportSize({ width: 1366, height: 768 })
  const snapshot = structuredClone(fixture.snapshot)
  snapshot.external_destination_projection.edges[0].destination_evidence = "legacy_unverified"
  await openMap(page, snapshot)

  const lane = page.getByTestId("topology-external-destinations-lane")
  await expect(lane).toHaveAttribute("data-detail-state", "partial")
  await expect(lane).toHaveAttribute("data-unlinked-count", "1")
  await expect(lane).toHaveAttribute("data-rejected-edge-count", "1")
  await expect(lane.getByTestId("topology-external-destination-projection-unavailable")).toContainText(
    "1 continuation edge was rejected",
  )
  await expect(page.getByTestId("topology-external-destination-node")).toHaveCount(0)
  await expect(page.locator('g[data-flow-target^="extdst:"]')).toHaveCount(0)
})

test("v11 treats a missing projection as unavailable and never uses legacy destination fallback", async ({ context, page }) => {
  test.setTimeout(120_000)
  const fixture = v11ExternalDestinationSnapshot()
  await seedAuthCookie(context)
  await page.setViewportSize({ width: 1366, height: 768 })
  const snapshot = structuredClone(fixture.snapshot)
  snapshot.external_destination_projection = null
  await openMap(page, snapshot)

  const lane = page.getByTestId("topology-external-destinations-lane")
  await expect(lane).toHaveAttribute("data-detail-state", "unavailable")
  await expect(lane).toHaveAttribute("data-evidence-state", "unavailable")
  await expect(lane.getByTestId("topology-external-destination-projection-unavailable")).toContainText(
    "Destination projection is unavailable",
  )
  await expect(page.getByTestId("topology-external-destination-node")).toHaveCount(0)
  await expect(page.locator('g[data-flow-target^="extdst:"]')).toHaveCount(0)

  await lane.getByTestId("topology-external-destinations-toggle").click()
  const panel = page.getByTestId("topology-external-destinations-details")
  await expectPanelOnTop(page, "topology-external-destinations-details")
  await expect(panel).toContainText("Destination projection evidence is unavailable")
  await expect(panel).toContainText("No gateway continuation is drawn")
})

test("v11 leaves a destination unlinked when the projection names a different gateway", async ({ context, page }) => {
  test.setTimeout(120_000)
  const fixture = v11ExternalDestinationSnapshot()
  await seedAuthCookie(context)
  await page.setViewportSize({ width: 1366, height: 768 })
  const snapshot = structuredClone(fixture.snapshot)
  snapshot.external_destination_projection.edges[0].source_id = "igw-not-on-this-canvas"
  await openMap(page, snapshot)

  const lane = page.getByTestId("topology-external-destinations-lane")
  await expect(lane).toHaveAttribute("data-detail-state", "partial")
  await expect(lane).toHaveAttribute("data-unlinked-count", "1")
  await expect(lane.getByTestId("topology-external-destinations-unlinked")).toContainText(
    "exact IGW link unavailable · no line drawn",
  )
  await expect(page.getByTestId("topology-external-destination-node")).toHaveCount(0)
  await expect(page.locator('g[data-flow-target^="extdst:"]')).toHaveCount(0)
})

test("v11 marks bounded destination details as truncated", async ({ context, page }) => {
  test.setTimeout(120_000)
  const fixture = v11ExternalDestinationSnapshot()
  await seedAuthCookie(context)
  await page.setViewportSize({ width: 1366, height: 768 })
  const snapshot = structuredClone(fixture.snapshot)
  snapshot.external_destination_projection.detail_complete = false
  snapshot.external_destination_projection.truncated = true
  snapshot.external_destination_projection.counts.named_destination_nodes_before_bound = 4
  await openMap(page, snapshot)

  let lane = page.getByTestId("topology-external-destinations-lane")
  await expect(lane).toHaveAttribute("data-detail-state", "truncated")
  await expect(lane).toHaveAttribute("data-unreturned-count", "3")
  await expect(lane.getByTestId("topology-external-destinations-truncated")).toContainText(
    "3 destination details not returned",
  )
  let toggle = lane.getByTestId("topology-external-destinations-toggle")
  await toggle.click()
  let panel = page.getByTestId("topology-external-destinations-details")
  await expect(panel).toContainText("Destination details truncated: 1 returned; 3 not returned")
})

test("v11 shows counted destinations whose identities are unavailable", async ({ context, page }) => {
  test.setTimeout(120_000)
  const fixture = v11ExternalDestinationSnapshot()
  await seedAuthCookie(context)
  await page.setViewportSize({ width: 1366, height: 768 })
  const snapshot = structuredClone(fixture.snapshot)
  snapshot.external_destination_projection.detail_complete = false
  snapshot.external_destination_projection.truncated = true
  snapshot.external_destination_projection.counts.named_destination_nodes_before_bound = 4
  snapshot.external_destination_projection.nodes = []
  snapshot.external_destination_projection.edges = []
  snapshot.external_destination_projection.counts.returned_destination_nodes = 0
  snapshot.external_destination_projection.counts.unlinked_returned_destination_nodes = 0
  await openMap(page, snapshot)

  const lane = page.getByTestId("topology-external-destinations-lane")
  await expect(lane).toHaveAttribute("data-detail-state", "unavailable")
  await expect(page.getByTestId("topology-external-destination-node")).toHaveCount(0)
  const toggle = lane.getByTestId("topology-external-destinations-toggle")
  await toggle.click()
  const panel = page.getByTestId("topology-external-destinations-details")
  await expect(panel).toContainText("Destination identities unavailable: 4 were counted, but no detail was returned")
})
