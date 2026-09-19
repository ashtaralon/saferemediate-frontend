# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-platform-map-qa-fixture.spec.ts >> Escape closes the service drawer before it closes the fullscreen map
- Location: tests/integration/topology-platform-map-qa-fixture.spec.ts:797:5

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
  706 |   expect(groups, "six production-style groups, as the C1 band draws").toHaveLength(6)
  707 |   await routeSnapshot(page, snapshot)
  708 |   await page.setViewportSize({ width: 2048, height: 1100 })
  709 |   await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  710 |   await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
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
> 806 |   await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
      |                                                              ^ Error: expect(locator).toBeVisible() failed
  807 |   await page.getByRole("tab", { name: "Network topology" }).click()
  808 | 
  809 |   const panel = page.getByTestId("topology-service-detail-panel")
  810 |   const igwChip = page.getByTestId("topology-igw-rail-chip").first()
  811 |   const enlarge = page.getByTestId("topology-estate-map-enlarge")
  812 |   const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  813 | 
  814 |   // 1. Embedded: the drawer owns Escape, and there is no fullscreen to confuse it.
  815 |   await expect(igwChip).toBeVisible()
  816 |   await igwChip.click()
  817 |   await expect(panel).toBeVisible()
  818 |   await page.keyboard.press("Escape")
  819 |   await expect(panel).toBeHidden()
  820 | 
  821 |   // The enlarge control is reachable again — the concrete thing the open
  822 |   // drawer blocked in production.
  823 |   await expect(enlarge).toBeVisible()
  824 |   await enlarge.click()
  825 |   await expect(fullscreen).toBeVisible({ timeout: 60_000 })
  826 | 
  827 |   // 2. Fullscreen + drawer: Escape takes the drawer and LEAVES the map up.
  828 |   const fsChip = fullscreen.getByTestId("topology-igw-rail-chip").first()
  829 |   await expect(fsChip).toBeVisible()
  830 |   await fsChip.click()
  831 |   await expect(panel).toBeVisible()
  832 |   await page.keyboard.press("Escape")
  833 |   await expect(panel).toBeHidden()
  834 |   await expect(fullscreen).toBeVisible()
  835 | 
  836 |   // 3. Nothing selected: Escape now belongs to fullscreen.
  837 |   await page.keyboard.press("Escape")
  838 |   await expect(fullscreen).toBeHidden()
  839 | })
  840 | 
```