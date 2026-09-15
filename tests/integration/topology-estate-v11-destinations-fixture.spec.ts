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

    const destination = lane.getByTestId("topology-external-destination-node")
    await expect(destination).toHaveCount(1)
    await expect(destination).toContainText("18.202.1.10")
    await expect(destination).toHaveAttribute("data-identity", "address")
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
    await expect(item).toContainText("ports 443")
    await expect(item).toContainText("31 observations")
    await expect(panel.getByTestId("topology-unidentified-external-peers")).toContainText(
      "No IGW path is drawn without an exact classified destination and configured gateway",
    )

    await item.focus()
    await page.keyboard.press("Escape")
    await expect(panel).toHaveCount(0)
    await expect(toggle).toBeFocused()
  })
}

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
