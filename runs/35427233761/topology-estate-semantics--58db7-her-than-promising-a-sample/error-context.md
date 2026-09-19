# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-semantics-fixture.spec.ts >> an older generation that recorded no addresses says so rather than promising a sample
- Location: tests/integration/topology-estate-semantics-fixture.spec.ts:143:5

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
  4   |   ESTATE_URL,
  5   |   SNAPSHOT,
  6   |   externalEgressSnapshot,
  7   |   noEgressSnapshot,
  8   |   routeSnapshot,
  9   |   triggerBundleSnapshot,
  10  | } from "./topology-fixture"
  11  | 
  12  | /** What the map SAYS, not where it draws it.
  13  |  *
  14  |  *  Independent production UI QA found three claims the Dependencies view made
  15  |  *  that its payload does not support: traffic stopped dead at the IGW, six
  16  |  *  EventBridge rules firing six Lambdas read as twelve relationships, and the
  17  |  *  Lambda -> S3 lane reduced six functions to a bare "x4". Each is a semantic
  18  |  *  defect with correct geometry, so each needs an assertion on the words and
  19  |  *  the counts. The negative cases matter as much: an external node drawn when
  20  |  *  nothing leaves the VPC would be the same class of error in the other
  21  |  *  direction.
  22  |  *
  23  |  *  1512x771 is the viewport the defects were reported at. */
  24  | const VIEWPORT = { width: 1512, height: 771 }
  25  | 
  26  | async function openMap(context: import("@playwright/test").BrowserContext, page: import("@playwright/test").Page, snapshot: typeof SNAPSHOT) {
  27  |   await seedAuthCookie(context)
  28  |   await routeSnapshot(page, snapshot)
  29  |   await page.setViewportSize(VIEWPORT)
  30  |   await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
> 31  |   await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
      |                                                              ^ Error: expect(locator).toBeVisible() failed
  32  |   await page.getByRole("tab", { name: "Network topology" }).click()
  33  | }
  34  | 
  35  | // ---------------------------------------------------------------------------
  36  | // F3 — the traffic that leaves does not stop at the IGW.
  37  | // ---------------------------------------------------------------------------
  38  | test("external egress continues past the IGW, and says the route is configured and the addresses sampled", async ({
  39  |   context,
  40  |   page,
  41  | }) => {
  42  |   test.setTimeout(120_000)
  43  |   const egress = externalEgressSnapshot()
  44  |   expect(egress.legCount, "the captured payload has egress legs to continue").toBeGreaterThan(0)
  45  |   expect(egress.completeLegs, "one leg's sample covers its whole count").toBe(1)
  46  |   await openMap(context, page, egress.snapshot)
  47  | 
  48  |   const node = page.getByTestId("topology-external-destinations").first()
  49  |   await expect(node).toBeVisible()
  50  |   await expect(node).toHaveAttribute("data-leg-count", String(egress.legCount))
  51  |   await expect(node).toHaveAttribute("data-max-distinct-upper-bound", String(egress.expectedUpperBound))
  52  |   await expect(node).toHaveAttribute("data-unknown-distinct-legs", "0")
  53  |   // Not every sample is complete, so the node may not claim an inventory.
  54  |   await expect(node).toHaveAttribute("data-sample-complete", "false")
  55  |   const summary = node.getByTestId("topology-external-destinations-summary")
  56  |   await expect(summary).toContainText(`up to ${egress.expectedUpperBound} distinct`)
  57  |   await expect(summary).toContainText("addresses sampled")
  58  |   await expect(summary).not.toContainText("addresses complete")
  59  |   await expect(summary).not.toContainText("up to 0 distinct")
  60  | 
  61  |   await node.getByTestId("topology-external-destinations-toggle").click()
  62  |   const details = page.getByTestId("topology-external-destinations-details")
  63  |   await expect(details).toBeVisible()
  64  |   // The hops, in path order, and the honesty about what kind of claim each is.
  65  |   await expect(details).toContainText(egress.hopCaption)
  66  |   await expect(details).toContainText("Route is configured (route tables)")
  67  |   await expect(details).toContainText("Counts are observed")
  68  |   await expect(details).toContainText("names no destination identities")
  69  |   // Never an AWS service identity: the payload's destinations[] is empty.
  70  |   await expect(details).not.toContainText("Amazon S3")
  71  |   await expect(details).not.toContainText("AWS service")
  72  | 
  73  |   const legs = details.getByTestId("topology-external-destination-leg")
  74  |   await expect(legs).toHaveCount(egress.legCount)
  75  |   await expect(legs.filter({ hasText: "all 3 shown" })).toHaveCount(egress.completeLegs)
  76  |   await expect(legs.filter({ hasText: "5 of" })).toHaveCount(egress.legCount - egress.completeLegs)
  77  | })
  78  | 
  79  | // ---------------------------------------------------------------------------
  80  | // The chain, not another Internet block. Independent review, 2026-09-14: the
  81  | // node followed the static Internet chip on the same neutral dashed rule that
  82  | // joins Users to Internet, so it read as `Users -> Internet -> another
  83  | // Internet` rather than as the continuation of the workloads' egress.
  84  | // ---------------------------------------------------------------------------
  85  | test("the egress chain names the map's own gateway, so the continuation is the IGW the map draws", async ({
  86  |   context,
  87  |   page,
  88  | }) => {
  89  |   test.setTimeout(120_000)
  90  |   const egress = externalEgressSnapshot()
  91  |   await openMap(context, page, egress.snapshot)
  92  | 
  93  |   const chain = page.getByTestId("topology-external-egress-chain").first()
  94  |   await expect(chain).toBeVisible()
  95  |   await expect(chain).toHaveAttribute("data-workloads", String(egress.legCount))
  96  |   await expect(chain).toHaveAttribute("data-nat-ids", egress.natId)
  97  |   await expect(chain).toHaveAttribute("data-igw-ids", egress.igwId)
  98  |   // It reads as a path, source first: N workloads, then each gateway.
  99  |   await expect(chain.getByTestId("topology-egress-chain-source")).toHaveText(
  100 |     `${egress.legCount} workloads`,
  101 |   )
  102 |   const hops = chain.getByTestId("topology-egress-hop")
  103 |   await expect(hops).toHaveCount(2)
  104 |   await expect(hops.nth(0)).toHaveAttribute("data-hop-kind", "nat")
  105 |   await expect(hops.nth(1)).toHaveAttribute("data-hop-kind", "igw")
  106 | 
  107 |   // THE connection: the gateway the chain names is the gateway chip the map
  108 |   // draws on the VPC boundary, not some other account's.
  109 |   const mapIgws = page.locator('[data-testid="topology-igw-rail-chip"]')
  110 |   const drawnIgwIds = await mapIgws.evaluateAll(els =>
  111 |     els.map(el => el.getAttribute("data-igw-id") ?? ""),
  112 |   )
  113 |   expect(drawnIgwIds.length, "the fixture draws an IGW chip to connect to").toBeGreaterThan(0)
  114 |   expect(drawnIgwIds, "the chain's gateway is one the map actually draws").toContain(egress.igwId)
  115 |   await expect(hops.nth(1)).toHaveAttribute("data-hop-id", egress.igwId)
  116 | 
  117 |   // And it is laid out as a continuation: the chain runs from the Internet
  118 |   // block into the External node, left to right, on one baseline.
  119 |   const geom = await page.evaluate(() => {
  120 |     const box = (sel: string) => {
  121 |       const el = document.querySelector(sel)
  122 |       if (!el) return null
  123 |       const r = el.getBoundingClientRect()
  124 |       return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }
  125 |     }
  126 |     return {
  127 |       internet: box('[data-testid="topology-internet-node"]'),
  128 |       chain: box('[data-testid="topology-external-egress-chain"]'),
  129 |       node: box('[data-testid="topology-external-destinations"]'),
  130 |     }
  131 |   })
```