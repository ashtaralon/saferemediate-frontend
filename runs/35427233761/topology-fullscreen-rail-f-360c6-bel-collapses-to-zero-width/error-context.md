# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-fullscreen-rail-fixture.spec.ts >> header rows wrap instead of colliding, and no label collapses to zero width
- Location: tests/integration/topology-fullscreen-rail-fixture.spec.ts:686:5

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
  596 |     expect(b.source, `bundle ${b.label} starts at a lane`).not.toBeNull()
  597 |     // The whole point of the bundle: it names the service it reaches.
  598 |     expect(b.targetId, `bundle ${b.label} names its target`).not.toMatch(/^lane:/)
  599 |     expect(b.target, `bundle ${b.label} ends at the chip it names`).not.toBeNull()
  600 |     // WHICH vertical edge it leaves on is the corridor's choice: with the Lambda
  601 |     // and Regional lanes side by side, a Lambda → S3 bundle hops out of the
  602 |     // right edge into the corridor between them, and the reverse direction
  603 |     // leaves the left edge. What must hold is that it leaves on an edge of its
  604 |     // own lane rather than out of the middle of it, and enters its target the
  605 |     // same way — that is what keeps it off the chips it passes.
  606 |     //
  607 |     // A FEEDER bundle leaves the lane once per member: each dotted leg starts
  608 |     // at its own chip's edge, and the trunk starts where the farthest leg has
  609 |     // already joined the bus, inside a corridor. A plain bundle (a same-lane
  610 |     // stub) starts at the lane's edge itself.
  611 |     if (b.legStarts.length > 0) {
  612 |       expect(
  613 |         corridorBands.some(c => b.start.x >= c.l - 2 && b.start.x <= c.r + 2),
  614 |         `bundle ${b.label}'s trunk starts on a bus in a corridor (x=${Math.round(b.start.x)}, bands ${JSON.stringify(corridorBands)})`,
  615 |       ).toBe(true)
  616 |       for (const leg of b.legStarts) {
  617 |         const leavesAnEdge = Math.min(Math.abs(leg.x - b.source!.l), Math.abs(leg.x - b.source!.r))
  618 |         expect(leavesAnEdge, `a leg of ${b.label} leaves a chip on its source lane's edge`).toBeLessThanOrEqual(tolerance)
  619 |         expect(leg.y, `a leg of ${b.label} leaves within its source lane`).toBeGreaterThanOrEqual(b.source!.t - tolerance)
  620 |         expect(leg.y, `a leg of ${b.label} leaves within its source lane`).toBeLessThanOrEqual(b.source!.b + tolerance)
  621 |       }
  622 |     } else {
  623 |       const leavesAnEdge = Math.min(Math.abs(b.start.x - b.source!.l), Math.abs(b.start.x - b.source!.r))
  624 |       expect(leavesAnEdge, `bundle ${b.label} leaves its source lane on a vertical edge`).toBeLessThanOrEqual(tolerance)
  625 |     }
  626 |     expect(b.start.y, `bundle ${b.label} leaves within its source lane`).toBeGreaterThanOrEqual(b.source!.t - tolerance)
  627 |     expect(b.start.y, `bundle ${b.label} leaves within its source lane`).toBeLessThanOrEqual(b.source!.b + tolerance)
  628 |     const target = b.target!
  629 |     if (target.visible) {
  630 |       const entersAnEdge = Math.min(Math.abs(b.end.x - target.l), Math.abs(b.end.x - target.r))
  631 |       expect(entersAnEdge, `bundle ${b.label} enters its target chip on a vertical edge`).toBeLessThanOrEqual(tolerance)
  632 |       expect(b.end.y, `bundle ${b.label} enters within its target chip`).toBeGreaterThanOrEqual(target.t - tolerance)
  633 |       expect(b.end.y, `bundle ${b.label} enters within its target chip`).toBeLessThanOrEqual(target.b + tolerance)
  634 |     } else {
  635 |       // Target scrolled out of its lane: the arrow must still point INTO the
  636 |       // rail at the chip's column, never dangle over unrelated content.
  637 |       expect(b.end.x, `bundle ${b.label} points into its target's column`).toBeGreaterThanOrEqual(target.column.l - tolerance)
  638 |       expect(b.end.x, `bundle ${b.label} points into its target's column`).toBeLessThanOrEqual(target.column.r + tolerance)
  639 |       expect(b.end.y, `bundle ${b.label} lands on its target's clip boundary`).toBeGreaterThanOrEqual(target.clip.t - tolerance)
  640 |       expect(b.end.y, `bundle ${b.label} lands on its target's clip boundary`).toBeLessThanOrEqual(target.clip.b + tolerance)
  641 |     }
  642 |   }
  643 |   for (const a of anchored) {
  644 |     if (a.visible) {
  645 |       expect(a.end.x, `edge into ${a.id} ends at the chip (x)`).toBeGreaterThanOrEqual(a.chip.l - tolerance)
  646 |       expect(a.end.x, `edge into ${a.id} ends at the chip (x)`).toBeLessThanOrEqual(a.chip.r + tolerance)
  647 |       expect(a.end.y, `edge into ${a.id} ends at the chip (y)`).toBeGreaterThanOrEqual(a.chip.t - tolerance)
  648 |       expect(a.end.y, `edge into ${a.id} ends at the chip (y)`).toBeLessThanOrEqual(a.chip.b + tolerance)
  649 |     } else {
  650 |       // Scrolled out of its lane: pinned to the lane's edge, not left dangling.
  651 |       expect(a.end.y, `edge into scrolled-out ${a.id} pins to its lane`).toBeGreaterThanOrEqual(a.lane.t - tolerance)
  652 |       expect(a.end.y, `edge into scrolled-out ${a.id} pins to its lane`).toBeLessThanOrEqual(a.lane.b + tolerance)
  653 |     }
  654 |   }
  655 | 
  656 |   // Tier rows hug their chips rather than splitting the column 1.35fr : 1.2fr :
  657 |   // 0.65fr — asserted in the platform-map QA spec, not here. Measured 2026-09-10:
  658 |   // at THIS test's 720px-tall viewport the old fr split wasted at most 25px,
  659 |   // because a short column has little slack to misallocate, so a bound placed
  660 |   // here would pass on the broken layout too. The waste needs a tall viewport to
  661 |   // exist, so the assertion lives where the viewport is 2048×1100.
  662 | 
  663 |   await page.screenshot({ path: "test-results/fullscreen-rail-scrolled.png", fullPage: false })
  664 | })
  665 | 
  666 | /**
  667 |  * Header layout across viewport widths — browser geometry regression.
  668 |  *
  669 |  * On C1 (2026-09-10) the fullscreen chrome on a ~460px-wide window was
  670 |  * unreadable: measured in the live browser, the "Cloud topology" eyebrow
  671 |  * (`shrink-0`, 110px) overflowed its squeezed `min-w-0` wrapper by 14px and
  672 |  * painted over the Glance/Inventory toggle, while the system name — the one
  673 |  * label that says WHICH estate this is — truncated to exactly zero width and
  674 |  * disappeared. The Platform-map summary row failed the same way: the label
  675 |  * wrapped to two lines and `N VPC · N AZ · N subnets · N resources` collapsed
  676 |  * to zero width.
  677 |  *
  678 |  * A screenshot review cannot catch the second half of that: a label rendered
  679 |  * at zero width leaves nothing on screen to look wrong. Both rows now wrap
  680 |  * instead of colliding, and this sweeps the widths to prove it.
  681 |  *
  682 |  * Non-vacuity is asserted, not assumed: at the narrowest width the chrome must
  683 |  * actually have wrapped (taller than one row) and the system name must have
  684 |  * real width — otherwise "no overlaps" would pass on an empty header.
  685 |  */
  686 | test("header rows wrap instead of colliding, and no label collapses to zero width", async ({
  687 |   context,
  688 |   page,
  689 | }) => {
  690 |   test.setTimeout(150_000)
  691 |   await seedAuthCookie(context)
  692 |   await routeSnapshot(page)
  693 |   await page.setViewportSize({ width: 1600, height: 900 })
  694 |   await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  695 | 
> 696 |   await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
      |                                                              ^ Error: expect(locator).toBeVisible() failed
  697 |   await page.getByRole("tab", { name: "Network topology" }).click()
  698 | 
  699 |   const INLINE_SUMMARY = '[data-testid="topology-platform-map-summary"]'
  700 |   const FS = '[data-testid="topology-estate-map-fullscreen"]'
  701 |   const FS_CHROME = '[data-testid="topology-estate-fullscreen-chrome"]'
  702 |   const FS_SUMMARY = `${FS} ${INLINE_SUMMARY}`
  703 | 
  704 |   // The inline map's summary row fails at narrow widths too — same shape.
  705 |   await expect(page.locator(INLINE_SUMMARY).first()).toBeVisible()
  706 |   for (const width of [420, 460, 560, 768]) {
  707 |     await page.setViewportSize({ width, height: 900 })
  708 |     await page.waitForTimeout(400)
  709 |     expect(
  710 |       await chromeTextDefects(page, INLINE_SUMMARY),
  711 |       `inline platform-map summary at ${width}px`,
  712 |     ).toEqual({ overlaps: [], collapsed: [] })
  713 |   }
  714 | 
  715 |   await page.setViewportSize({ width: 1600, height: 900 })
  716 |   await page.waitForTimeout(400)
  717 |   await page.getByTestId("topology-estate-map-enlarge").click()
  718 |   await expect(page.getByTestId("topology-estate-map-fullscreen")).toBeVisible()
  719 |   await page.waitForTimeout(900)
  720 | 
  721 |   const NARROWEST = 420
  722 |   for (const width of [NARROWEST, 460, 560, 768, 1024, 1600]) {
  723 |     await page.setViewportSize({ width, height: 900 })
  724 |     // Two frames for the wrap plus the fit-to-viewport refit.
  725 |     await page.waitForTimeout(600)
  726 | 
  727 |     expect(
  728 |       await chromeTextDefects(page, FS_CHROME),
  729 |       `fullscreen chrome at ${width}px`,
  730 |     ).toEqual({ overlaps: [], collapsed: [] })
  731 |     expect(
  732 |       await chromeTextDefects(page, FS_SUMMARY),
  733 |       `fullscreen platform-map summary at ${width}px`,
  734 |     ).toEqual({ overlaps: [], collapsed: [] })
  735 | 
  736 |     // Every control stays reachable inside the viewport — wrapping must not
  737 |     // push the Exit button off the right edge instead of onto the next row.
  738 |     const chromeGeometry = await page.evaluate(
  739 |       ({ chromeSel }) => {
  740 |         const chrome = document.querySelector<HTMLElement>(chromeSel)
  741 |         if (!chrome) throw new Error("fullscreen chrome not found")
  742 |         const escapees: string[] = []
  743 |         for (const el of Array.from(chrome.querySelectorAll<HTMLElement>("button"))) {
  744 |           const r = el.getBoundingClientRect()
  745 |           if (r.width === 0) continue
  746 |           if (r.left < -1 || r.right > window.innerWidth + 1) {
  747 |             escapees.push(`${(el.textContent ?? el.getAttribute("aria-label") ?? "?").trim()} @ ${Math.round(r.left)}..${Math.round(r.right)}`)
  748 |           }
  749 |         }
  750 |         return { height: Math.round(chrome.getBoundingClientRect().height), escapees }
  751 |       },
  752 |       { chromeSel: FS_CHROME },
  753 |     )
  754 |     expect(chromeGeometry.escapees, `controls inside the viewport at ${width}px`).toEqual([])
  755 | 
  756 |     if (width === NARROWEST) {
  757 |       // Non-vacuity 1: the row genuinely could not fit on one 44px line here,
  758 |       // so the sweep is exercising the tight case the bug lived in.
  759 |       expect(chromeGeometry.height, "chrome wrapped at the narrowest width").toBeGreaterThan(44)
  760 |       // Non-vacuity 2: the system name is actually painted, with real width.
  761 |       const nameWidth = await page.evaluate(
  762 |         ({ chromeSel, system }) => {
  763 |           const chrome = document.querySelector<HTMLElement>(chromeSel)
  764 |           const el = Array.from(chrome?.querySelectorAll<HTMLElement>("span") ?? []).find(
  765 |             s => (s.textContent ?? "").trim() === system,
  766 |           )
  767 |           return el ? Math.round(el.getBoundingClientRect().width) : -1
  768 |         },
  769 |         { chromeSel: FS_CHROME, system: SNAPSHOT.system },
  770 |       )
  771 |       expect(nameWidth, "system name is painted with real width").toBeGreaterThan(0)
  772 |     }
  773 |   }
  774 | 
  775 |   await page.setViewportSize({ width: 460, height: 900 })
  776 |   await page.waitForTimeout(600)
  777 |   await page.screenshot({ path: "test-results/fullscreen-chrome-narrow.png", fullPage: false })
  778 | })
  779 | 
```