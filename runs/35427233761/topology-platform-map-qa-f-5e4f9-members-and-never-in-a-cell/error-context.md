# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-platform-map-qa-fixture.spec.ts >> a logical group is drawn in its own band beside the placement-gap area, linked to its members and never in a cell
- Location: tests/integration/topology-platform-map-qa-fixture.spec.ts:694:5

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
  610 | 
  611 | // ---------------------------------------------------------------------------
  612 | // Inspector identity (2026-09-12 review, defect A). The IGW chip is keyed by the
  613 | // `__igw__` canvas anchor so egress edges have one stable target; the chip
  614 | // itself carries the gateway's AWS id (data-igw-id). Selecting it used to send
  615 | // the ANCHOR to Inventory as a resource id — "InternetGateway __igw__ not found
  616 | // in graph" — although the payload named the gateway. This drives the real
  617 | // click path and reads the ids off the requests the page actually makes.
  618 | // ---------------------------------------------------------------------------
  619 | test("the IGW inspector asks Inventory about the gateway's AWS id, never the __igw__ anchor", async ({
  620 |   context,
  621 |   page,
  622 | }) => {
  623 |   test.setTimeout(120_000)
  624 |   await seedAuthCookie(context)
  625 |   await routeSnapshot(page)
  626 |   // Every resource read the panel can make, answered "not in this fixture":
  627 |   // the assertion is the id in the URL, not the dossier a backend would render.
  628 |   const resourceReads: string[] = []
  629 |   for (const pattern of [
  630 |     "**/api/proxy/inspector/**",
  631 |     "**/api/proxy/operational-map/**",
  632 |     "**/api/proxy/decision-coverage/**",
  633 |   ]) {
  634 |     await page.route(pattern, async route => {
  635 |       resourceReads.push(route.request().url())
  636 |       await route.fulfill({
  637 |         status: 404,
  638 |         contentType: "application/json",
  639 |         body: JSON.stringify({ detail: "not in this fixture" }),
  640 |       })
  641 |     })
  642 |   }
  643 |   const everyProxyRequest: string[] = []
  644 |   page.on("request", request => {
  645 |     if (request.url().includes("/api/proxy/")) everyProxyRequest.push(request.url())
  646 |   })
  647 | 
  648 |   await page.setViewportSize({ width: 2048, height: 1100 })
  649 |   await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  650 |   await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  651 |   await page.getByRole("tab", { name: "Network topology" }).click()
  652 | 
  653 |   const igwChip = page.getByTestId("topology-igw-rail-chip").first()
  654 |   await expect(igwChip).toBeVisible()
  655 |   // Canvas identity and AWS identity, side by side on the chip.
  656 |   await expect(igwChip).toHaveAttribute("data-flow-id", "__igw__")
  657 |   const gatewayId = await igwChip.getAttribute("data-igw-id")
  658 |   expect(gatewayId).toMatch(/^igw-[0-9a-f]+$/)
  659 |   const payloadIgwIds = (SNAPSHOT.vpc_topology.edges.igws as Array<{ id: string }>).map(igw => igw.id)
  660 |   expect(payloadIgwIds).toContain(gatewayId)
  661 | 
  662 |   await igwChip.click()
  663 |   const panel = page.getByTestId("topology-service-detail-panel")
  664 |   await expect(panel).toBeVisible()
  665 |   await expect(panel.getByTestId("estate-operations-resource-id")).toHaveText(gatewayId!)
  666 |   await expect(panel.getByTestId("estate-anchor-identity-unresolved")).toHaveCount(0)
  667 | 
  668 |   // Inventory was asked about the gateway by its own id…
  669 |   await expect
  670 |     .poll(() => resourceReads.filter(url => url.includes("/api/proxy/inspector/")).length)
  671 |     .toBeGreaterThan(0)
  672 |   for (const url of resourceReads.filter(url => url.includes("/api/proxy/inspector/"))) {
  673 |     expect(new URL(url).pathname).toBe(`/api/proxy/inspector/${encodeURIComponent(gatewayId!)}`)
  674 |   }
  675 |   // …and so were the operational reads. The anchor reached no request at all.
  676 |   await expect
  677 |     .poll(() => resourceReads.filter(url => url.includes("/api/proxy/operational-map/")).length)
  678 |     .toBeGreaterThan(0)
  679 |   for (const url of resourceReads.filter(url => url.includes("/api/proxy/operational-map/"))) {
  680 |     expect(url).toContain(`resource_id=${gatewayId}`)
  681 |   }
  682 |   expect(everyProxyRequest.filter(url => url.includes("__igw__"))).toEqual([])
  683 | })
  684 | 
  685 | // ---------------------------------------------------------------------------
  686 | // Logical groups (2026-09-12 review, defect B). The captured payload carries no
  687 | // target group, ASG or DB cluster, so this fixture adds ONE target group to the
  688 | // drawn VPC, bound by TARGETS edges to two of the payload's own EC2 instances in
  689 | // two zones, and asserts the band it lands in: neutral, beside the amber
  690 | // placement-gap area, linked to those members, spanning their zones, and never
  691 | // drawn inside an AZ x tier cell. Fixture data in a test file; the product code
  692 | // renders only what the payload it was handed says.
  693 | // ---------------------------------------------------------------------------
  694 | test("a logical group is drawn in its own band beside the placement-gap area, linked to its members and never in a cell", async ({
  695 |   context,
  696 |   page,
  697 | }) => {
  698 |   test.setTimeout(120_000)
  699 |   await seedAuthCookie(context)
  700 | 
  701 |   // Canonical builder in topology-fixture.ts — the geometry spec measures the
  702 |   // same band, and two constructions of one shape is the twin fork this repo
  703 |   // lints against.
  704 |   const { snapshot, groups, targetGroup, members, expectedAzs } = logicalGroupSnapshot()
  705 |   expect(members.length, "the captured payload has EC2 instances in at least two zones of the drawn VPC").toBeGreaterThanOrEqual(2)
  706 |   expect(groups, "six production-style groups, as the C1 band draws").toHaveLength(6)
  707 |   await routeSnapshot(page, snapshot)
  708 |   await page.setViewportSize({ width: 2048, height: 1100 })
  709 |   await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
> 710 |   await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
      |                                                              ^ Error: expect(locator).toBeVisible() failed
  711 |   await page.getByRole("tab", { name: "Network topology" }).click()
  712 | 
  713 |   const band = page.getByTestId("topology-logical-group-band").first()
  714 |   await expect(band).toBeVisible()
  715 |   await expect(band.getByTestId("topology-logical-group-band-header")).toHaveText(
  716 |     `Logical groups · members carry the placement (${groups.length})`,
  717 |   )
  718 |   await expect(band).toContainText("Not a collector gap")
  719 |   await expect(band).not.toContainText("does not say where")
  720 |   // Every group the payload names is drawn, each linked to its own members and
  721 |   // spanning its own zones — the band, not one row of it.
  722 |   await expect(band.getByTestId("topology-logical-group")).toHaveCount(groups.length)
  723 |   for (const group of groups) {
  724 |     const row = band.locator(
  725 |       `[data-testid="topology-logical-group"][data-node-id="${group.node.id}"]`,
  726 |     )
  727 |     await expect(row).toHaveCount(1)
  728 |     await expect(row).toHaveAttribute(
  729 |       "data-member-ids",
  730 |       group.members.map(member => member.id).join("|"),
  731 |     )
  732 |     await expect(row).toHaveAttribute("data-scope-azs", group.expectedAzs.join("|"))
  733 |     await expect(row.getByTestId("topology-logical-group-member")).toHaveCount(group.members.length)
  734 |   }
  735 |   const entry = band.locator(
  736 |     `[data-testid="topology-logical-group"][data-node-id="${targetGroup.id}"]`,
  737 |   )
  738 |   await expect(entry).toHaveAttribute("data-node-id", targetGroup.id)
  739 |   await expect(entry).toHaveAttribute("data-member-ids", members.map(member => member.id).join("|"))
  740 |   await expect(entry).toHaveAttribute("data-scope-azs", expectedAzs.join("|"))
  741 |   await expect(entry.getByTestId("topology-logical-group-member")).toHaveCount(members.length)
  742 |   await expect(entry.getByTestId("topology-logical-group-scope")).toContainText(`spans ${expectedAzs.join(", ")}`)
  743 |   await expect(entry.getByTestId("topology-placement-picker")).toHaveCount(0)
  744 | 
  745 |   // Never counted as a placement gap: whatever else this payload leaves
  746 |   // unplaced, the amber area does not list the group and its count is its own
  747 |   // chips, not the groups.
  748 |   const area = page.getByTestId("topology-unplaced-area").first()
  749 |   if (await area.count()) {
  750 |     await expect(area.locator(`[data-flow-id="${targetGroup.id}"]`)).toHaveCount(0)
  751 |     await expect(area).not.toContainText(targetGroup.name)
  752 |     const header = (await area.getByTestId("topology-unplaced-area-header").textContent()) ?? ""
  753 |     const counted = Number(/\((\d+)\)/.exec(header)?.[1] ?? Number.NaN)
  754 |     expect(counted).toBe(await area.getByTestId("topology-service-node-icon").count())
  755 |   }
  756 | 
  757 |   // Geometry: inside the region frame, below every AZ x tier cell — the group
  758 |   // chip is in the band and in no cell.
  759 |   const geom = await page.evaluate(({ groupId }) => {
  760 |     const bandEl = document.querySelector('[data-testid="topology-logical-group-band"]')
  761 |     const region = document.querySelector('[data-testid="topology-region-frame"]')
  762 |     const cells = Array.from(
  763 |       document.querySelectorAll('[data-testid="topology-cell-glance"], [data-testid="topology-cell-inventory"]'),
  764 |     )
  765 |     if (!bandEl || !region) return null
  766 |     const b = bandEl.getBoundingClientRect()
  767 |     return {
  768 |       cells: cells.length,
  769 |       insideRegion: region.contains(bandEl),
  770 |       belowEveryCell: cells.every(cell => cell.getBoundingClientRect().bottom <= b.top + 1),
  771 |       chipInCell: cells.some(cell => cell.querySelector(`[data-flow-id="${groupId}"]`) !== null),
  772 |       chipInBand: bandEl.querySelector(`[data-flow-id="${groupId}"]`) !== null,
  773 |     }
  774 |   }, { groupId: targetGroup.id })
  775 |   expect(geom).not.toBeNull()
  776 |   expect(geom!.cells).toBeGreaterThan(0)
  777 |   expect(geom!.insideRegion).toBe(true)
  778 |   expect(geom!.belowEveryCell).toBe(true)
  779 |   expect(geom!.chipInCell).toBe(false)
  780 |   expect(geom!.chipInBand).toBe(true)
  781 | })
  782 | 
  783 | // ---------------------------------------------------------------------------
  784 | // Escape dismisses the TOPMOST surface (C1 production QA run 34747728564).
  785 | //
  786 | // The drawer is `fixed inset-y-0 right-0 z-[220] w-[720px]` with role="dialog",
  787 | // and it covers the map header controls. The module's only Escape handler used
  788 | // to be installed inside the `mapEnlarged` effect and called closeEnlarged():
  789 | // embedded had no Escape at all, and in fullscreen Escape tore the map down
  790 | // from under the still-open drawer. The live probe measured
  791 | // `closed_on_escape: false` and then spent its entire 300s budget on click
  792 | // retries the drawer was intercepting.
  793 | //
  794 | // Deterministic here on purpose: the contract is keyboard dismissal order, and
  795 | // it must not depend on a production graph being reachable.
  796 | // ---------------------------------------------------------------------------
  797 | test("Escape closes the service drawer before it closes the fullscreen map", async ({
  798 |   context,
  799 |   page,
  800 | }) => {
  801 |   test.setTimeout(120_000)
  802 |   await seedAuthCookie(context)
  803 |   await routeSnapshot(page)
  804 |   await page.setViewportSize({ width: 2048, height: 1100 })
  805 |   await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  806 |   await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  807 |   await page.getByRole("tab", { name: "Network topology" }).click()
  808 | 
  809 |   const panel = page.getByTestId("topology-service-detail-panel")
  810 |   const igwChip = page.getByTestId("topology-igw-rail-chip").first()
```