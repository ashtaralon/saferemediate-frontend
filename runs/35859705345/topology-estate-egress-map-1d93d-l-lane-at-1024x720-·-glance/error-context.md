# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-egress-map-fixture.spec.ts >> the IGW continues into the external lane at 1024x720 · glance
- Location: tests/integration/topology-estate-egress-map-fixture.spec.ts:165:9

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator:  getByTestId('topology-external-destinations')
Expected: "true"
Received: "false"
Timeout:  5000ms

Call log:
  - Expect "toHaveAttribute" with timeout 5000ms
  - waiting for getByTestId('topology-external-destinations')
    14 × locator resolved to <div data-open="false" data-leg-count="9" data-sample-complete="false" data-unknown-distinct-legs="0" data-max-distinct-upper-bound="2579" data-testid="topology-external-destinations" class="flex flex-col items-start gap-1 min-w-0 w-full">…</div>
       - unexpected value "false"

```

```yaml
- text: 9 workloads NAT nat-fixture0a1b2c3d4 IGW igw-03bb3f19b706abbc4
- button "External destinations 9 workloads · up to 2579 distinct · addresses sampled"
```

# Test source

```ts
  284 |           `continuation ${p.target} is drawn SOLID — it reads as a measured path at ${vp.name}·${density}`,
  285 |         ).not.toBeNull()
  286 |         expect(
  287 |           p.animations,
  288 |           `continuation ${p.target} is animated as live traffic at ${vp.name}·${density}`,
  289 |         ).toBe(0)
  290 |       }
  291 | 
  292 |       // --- containment: past the boundary, clear of the tiers it must not hide
  293 |       // The canvas is a horizontal scroll region with a width floor, so at a
  294 |       // narrow viewport the lane can sit to the right of the fold. Bring it
  295 |       // into view before measuring and before the frame: "visible by default"
  296 |       // means no disclosure to open, not that every viewport is wide enough to
  297 |       // hold the whole estate at once.
  298 |       await lane.scrollIntoViewIfNeeded()
  299 |       const laneRect = (await rectOf(lane))!
  300 |       const boundaryRect = await rectOf(page.getByTestId("topology-vpc-boundary-column"))
  301 |       if (boundaryRect) {
  302 |         expect(
  303 |           laneRect.left,
  304 |           `the external lane is not outside the VPC boundary at ${vp.name}·${density}`,
  305 |         ).toBeGreaterThanOrEqual(boundaryRect.right - 1)
  306 |       }
  307 |       // Inside the VIEWPORT once scrolled to, which is the claim that matters:
  308 |       // a lane drawn off the right edge of the window is not on the map.
  309 |       expect(laneRect.left, `lane off the left at ${vp.name}·${density}`).toBeGreaterThanOrEqual(-1)
  310 |       expect(
  311 |         laneRect.right,
  312 |         `lane not brought fully into view at ${vp.name}·${density}`,
  313 |       ).toBeLessThanOrEqual(vp.width + 1)
  314 |       const dataCells = page.locator('[data-tier="data"]')
  315 |       const cells = await dataCells.count()
  316 |       for (let i = 0; i < cells; i++) {
  317 |         const cell = await rectOf(dataCells.nth(i))
  318 |         if (!cell) continue
  319 |         expect(
  320 |           overlap(laneRect, cell),
  321 |           `the external lane overlaps data-tier cell ${i} at ${vp.name}·${density}`,
  322 |         ).toBe(0)
  323 |       }
  324 |       const rail = await rectOf(page.getByTestId("topology-edge-services-rail"))
  325 |       if (rail) {
  326 |         expect(
  327 |           overlap(laneRect, rail),
  328 |           `the external lane overlaps the services rail at ${vp.name}·${density}`,
  329 |         ).toBe(0)
  330 |       }
  331 |       // Readable, not a 6px sliver.
  332 |       expect(laneRect.right - laneRect.left, `lane too narrow to read at ${vp.name}`).toBeGreaterThanOrEqual(120)
  333 | 
  334 |       await page.screenshot({
  335 |         path: `test-results/estate-egress-map-default-${density}-${vp.name}.png`,
  336 |         fullPage: false,
  337 |       })
  338 | 
  339 |       // --- ON DEMAND: the bounded set says what it withheld -----------------
  340 |       const hidden = Number(await lane.getAttribute("data-hidden-count"))
  341 |       expect(hidden, "the fixture draws more destinations than the bound").toBeGreaterThan(0)
  342 |       const more = page.getByTestId("topology-external-destinations-more")
  343 |       await expect(more).toBeVisible()
  344 |       await expect(more).toContainText(`+${hidden}`)
  345 |       await more.click()
  346 |       await waitTopmost(page, "topology-external-destinations-more-details", `${vp.name}·${density}`)
  347 | 
  348 |       // The disclosure must CONTAIN the destinations it offers. It previously
  349 |       // said "these are the rest" over an empty panel, because the map counted
  350 |       // the withheld nodes and discarded them.
  351 |       const moreDetails = page.getByTestId("topology-external-destinations-more-details")
  352 |       const items = moreDetails.getByTestId("topology-external-destinations-more-item")
  353 |       await expect(
  354 |         items,
  355 |         `the +${hidden} disclosure lists nothing at ${vp.name}·${density}`,
  356 |       ).toHaveCount(hidden)
  357 |       // Each carries what makes it a finding rather than a string: what it is,
  358 |       // and which workloads were observed reaching it.
  359 |       const evidence = await items.evaluateAll(els =>
  360 |         els.map(el => ({
  361 |           identity: el.getAttribute("data-identity"),
  362 |           sources: (el.getAttribute("data-sources") ?? "").split(",").filter(Boolean),
  363 |           text: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
  364 |         })),
  365 |       )
  366 |       for (const row of evidence) {
  367 |         expect(["aws_service", "address"]).toContain(row.identity)
  368 |         expect(row.sources.length, `a listed destination names no source: ${row.text}`).toBeGreaterThan(0)
  369 |         expect(row.text, "a listed destination carries no source evidence").toContain("reached by")
  370 |       }
  371 |       // The payload is sample-only; the panel must not read as an inventory.
  372 |       await expect(moreDetails).toContainText("not an inventory")
  373 | 
  374 |       await page.screenshot({
  375 |         path: `test-results/estate-egress-map-more-${density}-${vp.name}.png`,
  376 |         fullPage: false,
  377 |       })
  378 |       await page.keyboard.press("Escape")
  379 | 
  380 |       // The per-leg evidence detail, in the lane rather than the top strip.
  381 |       const external = page.getByTestId("topology-external-destinations")
  382 |       await expect(external).toHaveAttribute("data-open", "false")
  383 |       await external.getByTestId("topology-external-destinations-toggle").click()
> 384 |       await expect(external).toHaveAttribute("data-open", "true")
      |                              ^ Error: expect(locator).toHaveAttribute(expected) failed
  385 |       await waitTopmost(page, "topology-external-destinations-details", `${vp.name}·${density}`)
  386 |       await expect(
  387 |         page.getByTestId("topology-external-destinations-details").getByTestId("topology-external-destination-leg"),
  388 |       ).toHaveCount(egress.legCount)
  389 | 
  390 |       await page.screenshot({
  391 |         path: `test-results/estate-egress-map-expanded-${density}-${vp.name}.png`,
  392 |         fullPage: false,
  393 |       })
  394 |     })
  395 |   }
  396 | }
  397 | 
  398 | test("no lane, and no gateway continuation, when nothing leaves the VPC", async ({
  399 |   context,
  400 |   page,
  401 | }) => {
  402 |   // The negative that keeps every assertion above honest: a spec that only
  403 |   // ever sees a payload WITH egress cannot tell "drew the evidence" from
  404 |   // "always draws a lane".
  405 |   test.setTimeout(120_000)
  406 |   const empty = noEgressSnapshot()
  407 |   await seedAuthCookie(context)
  408 |   await routeSnapshot(page, empty.snapshot)
  409 |   await page.setViewportSize({ width: 1600, height: 900 })
  410 |   await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  411 |   await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
  412 |   await page.getByRole("tab", { name: "Network topology" }).click()
  413 |   // The map itself still rendered — otherwise this passes on a blank page.
  414 |   await expect(page.getByTestId("topology-region-fill-grid")).toBeVisible()
  415 |   await expect(page.getByTestId("topology-external-destinations-lane")).toHaveCount(0)
  416 |   await expect(page.getByTestId("topology-external-destination-node")).toHaveCount(0)
  417 |   const geo = (await page.evaluate(CONTINUATION_GEOMETRY)) as { paths: unknown[] }
  418 |   expect(geo.paths, "a gateway→destination edge was drawn with no egress in the payload").toEqual([])
  419 | })
  420 | 
```