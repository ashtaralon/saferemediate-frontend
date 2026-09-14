import { expect, test } from "@playwright/test"
import { seedAuthCookie } from "./live-auth"
import {
  ESTATE_URL,
  SNAPSHOT,
  externalEgressSnapshot,
  noEgressSnapshot,
  routeSnapshot,
  triggerBundleSnapshot,
} from "./topology-fixture"

/** What the map SAYS, not where it draws it.
 *
 *  Independent production UI QA found three claims the Dependencies view made
 *  that its payload does not support: traffic stopped dead at the IGW, six
 *  EventBridge rules firing six Lambdas read as twelve relationships, and the
 *  Lambda -> S3 lane reduced six functions to a bare "x4". Each is a semantic
 *  defect with correct geometry, so each needs an assertion on the words and
 *  the counts. The negative cases matter as much: an external node drawn when
 *  nothing leaves the VPC would be the same class of error in the other
 *  direction.
 *
 *  1512x771 is the viewport the defects were reported at. */
const VIEWPORT = { width: 1512, height: 771 }

async function openMap(context: import("@playwright/test").BrowserContext, page: import("@playwright/test").Page, snapshot: typeof SNAPSHOT) {
  await seedAuthCookie(context)
  await routeSnapshot(page, snapshot)
  await page.setViewportSize(VIEWPORT)
  await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  await page.getByRole("tab", { name: "Network topology" }).click()
}

// ---------------------------------------------------------------------------
// F3 — the traffic that leaves does not stop at the IGW.
// ---------------------------------------------------------------------------
test("external egress continues past the IGW, and says the route is configured and the addresses sampled", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000)
  const egress = externalEgressSnapshot()
  expect(egress.legCount, "the captured payload has egress legs to continue").toBeGreaterThan(0)
  expect(egress.completeLegs, "one leg's sample covers its whole count").toBe(1)
  await openMap(context, page, egress.snapshot)

  const node = page.getByTestId("topology-external-destinations").first()
  await expect(node).toBeVisible()
  await expect(node).toHaveAttribute("data-leg-count", String(egress.legCount))
  await expect(node).toHaveAttribute("data-max-distinct-upper-bound", String(egress.expectedUpperBound))
  // Not every sample is complete, so the node may not claim an inventory.
  await expect(node).toHaveAttribute("data-sample-complete", "false")
  const summary = node.getByTestId("topology-external-destinations-summary")
  await expect(summary).toContainText(`up to ${egress.expectedUpperBound} distinct`)
  await expect(summary).toContainText("addresses sampled")
  await expect(summary).not.toContainText("addresses complete")

  await node.getByTestId("topology-external-destinations-toggle").click()
  const details = node.getByTestId("topology-external-destinations-details")
  await expect(details).toBeVisible()
  // The hops, in path order, and the honesty about what kind of claim each is.
  await expect(details).toContainText(egress.hopCaption)
  await expect(details).toContainText("Route is configured (route tables)")
  await expect(details).toContainText("Counts are observed")
  await expect(details).toContainText("names no destination identities")
  // Never an AWS service identity: the payload's destinations[] is empty.
  await expect(details).not.toContainText("Amazon S3")
  await expect(details).not.toContainText("AWS service")

  const legs = node.getByTestId("topology-external-destination-leg")
  await expect(legs).toHaveCount(egress.legCount)
  await expect(legs.filter({ hasText: "all 3 shown" })).toHaveCount(egress.completeLegs)
  await expect(legs.filter({ hasText: "5 of" })).toHaveCount(egress.legCount - egress.completeLegs)
})

test("an older generation that recorded no addresses says so rather than promising a sample", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000)
  // The captured payload itself: distinct COUNTS on every egress leg, no
  // egress_breakdown and no sample_hosts at all.
  await openMap(context, page, SNAPSHOT)
  const node = page.getByTestId("topology-external-destinations").first()
  await expect(node).toBeVisible()
  const summary = node.getByTestId("topology-external-destinations-summary")
  await expect(summary).toContainText("no addresses recorded")
  await expect(summary).not.toContainText("addresses sampled")
  await node.getByTestId("topology-external-destinations-toggle").click()
  await expect(node.getByTestId("topology-external-destinations-details")).toContainText(
    "recorded no addresses at all",
  )
})

test("no external destinations node when nothing leaves the VPC", async ({ context, page }) => {
  test.setTimeout(120_000)
  const none = noEgressSnapshot()
  // Guard against passing because the map failed to draw: the payload still
  // holds its other edges, and the map still renders its cells.
  expect(none.remainingEdges, "the payload still has non-egress edges").toBeGreaterThan(0)
  await openMap(context, page, none.snapshot)
  await expect(page.locator('[data-tier="data"]').first()).toBeVisible()
  await expect(page.getByTestId("topology-external-destinations")).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// F4 — one relationship, drawn once, counted in connections.
// ---------------------------------------------------------------------------
test("six rules firing six functions are one bundle of six, not two bundles of six", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000)
  const triggers = triggerBundleSnapshot()
  expect(triggers.expectedPairs).toBe(6)
  expect(triggers.expectedEdgeRows).toBe(12)
  await openMap(context, page, triggers.snapshot)

  // Every badge that stands for a collapsed trunk word.
  const collapsed = page.locator('[data-testid="topology-flow-badge"][data-bundle-spellings]')
  await expect(collapsed.first()).toBeVisible({ timeout: 30_000 })
  // Matched on the COUNTS, not on a spelling order: which of the two the badge
  // prints follows payload edge order, and pinning that order here would make
  // this test assert the fixture's array literal instead of the collapse.
  const mirrored = page.locator(
    `[data-testid="topology-flow-badge"][data-bundle-pairs="${triggers.expectedPairs}"]` +
      `[data-bundle-edges="${triggers.expectedEdgeRows}"]`,
  )
  await expect(mirrored, "one badge speaks for both spellings").toHaveCount(1)
  const spellings = ((await mirrored.getAttribute("data-bundle-spellings")) ?? "").split(",")
  expect([...spellings].sort()).toEqual(["TARGETS", "TRIGGERS"])
  const [printed, twin] = spellings

  // The duplication itself: no second badge repeats the same relationship.
  await expect(
    page.locator(`[data-testid="topology-flow-badge"][data-bundle-spellings="${twin}"]`),
    `${twin} never gets a badge of its own once it is a twin of ${printed}`,
  ).toHaveCount(0)
  // The DRAWN words only: a badge group also contains its <title>, and the
  // title is where the twin spelling is supposed to live, so reading the group
  // would find it in exactly the place this change put it.
  const drawn = await page
    .locator('[data-testid="topology-flow-badge"][data-bundle-spellings] text')
    .allTextContents()
  expect(
    drawn.filter(t => t.includes(twin)),
    `trunk badges read ${JSON.stringify(drawn)}`,
  ).toHaveLength(0)
  expect(drawn.filter(t => t.trim() === `${printed} \u00d7${triggers.expectedPairs}`)).toHaveLength(1)

  // The twin spelling and the row count survive, on demand, in the title.
  const title = (await mirrored.locator("title").textContent()) ?? ""
  expect(title).toContain(`also recorded as ${twin}`)
  expect(title).toContain("12 edge rows in the graph for 6 connections")
})

test("the Lambda lane states S3 traffic from 4 of 6, names the four, and records no action", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000)
  const triggers = triggerBundleSnapshot()
  expect(triggers.s3Functions).toHaveLength(4)
  expect(triggers.lambdas).toHaveLength(6)
  await openMap(context, page, triggers.snapshot)

  const panel = page.getByTestId("topology-lambda-s3-coverage").first()
  await expect(panel).toBeVisible()
  await expect(panel).toHaveAttribute("data-with-traffic", "4")
  await expect(panel).toHaveAttribute("data-total", "6")
  await expect(panel).toHaveAttribute("data-no-actions-recorded", "true")
  const toggle = panel.getByTestId("topology-lambda-s3-coverage-toggle")
  await expect(toggle).toHaveText("S3 traffic from 4 of 6 functions")
  await expect(panel.getByTestId("topology-lambda-s3-coverage-details")).toBeHidden()

  await toggle.click()
  const names = panel.getByTestId("topology-lambda-s3-coverage-function")
  await expect(names).toHaveCount(4)
  for (const fn of triggers.s3Functions) {
    await expect(panel.locator(`[data-function-id="${fn.id}"]`)).toHaveCount(1)
  }
  // The two without an edge are not named as having traffic.
  for (const fn of triggers.lambdas.slice(4)) {
    await expect(panel.locator(`[data-function-id="${fn.id}"]`)).toHaveCount(0)
  }
  await expect(panel).toContainText("2 functions have no recorded S3 edge")
  // observed_actions is empty on all four: say so, never name an operation.
  await expect(panel.getByTestId("topology-lambda-s3-no-actions")).toContainText(
    "No specific S3 actions were recorded",
  )
  await expect(panel).not.toContainText("GetObject")
  await expect(panel).not.toContainText("PutObject")
})
