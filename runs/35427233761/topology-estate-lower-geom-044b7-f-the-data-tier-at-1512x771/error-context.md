# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-lower-geometry-fixture.spec.ts >> lower estate sections stay clear of the data tier at 1512x771
- Location: tests/integration/topology-estate-lower-geometry-fixture.spec.ts:187:7

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
  96  |       covered.push({
  97  |         x: Math.round(x),
  98  |         y: Math.round(y),
  99  |         hit: top ? (top.getAttribute('data-testid') || top.tagName.toLowerCase() + '.' + String(top.className).slice(0, 40)) : 'nothing',
  100 |       })
  101 |     }
  102 |   }
  103 |   return { effectiveOpacity: product, covered }
  104 | })()`
  105 | 
  106 | /** Wait until the panel has settled: opaque, and the topmost element at its
  107 |  *  own probe points. Measuring or screenshotting before this reads a mid-fade
  108 |  *  or mis-layered frame, which is how an unreadable panel reached the
  109 |  *  published artifacts while every geometric assertion passed. */
  110 | async function waitForSettledPanel(page: Page, where: string) {
  111 |   try {
  112 |     await page.waitForFunction(
  113 |       `(() => { const s = ${PANEL_READABILITY}; return !!s && s.effectiveOpacity >= 0.999 && s.covered.length === 0 })()`,
  114 |       undefined,
  115 |       { timeout: 10_000 },
  116 |     )
  117 |   } catch {
  118 |     // Fail with the measurement, not with "it did not settle": the next
  119 |     // question is always WHAT is covering it or fading it, and a timeout that
  120 |     // does not answer that costs a whole CI round-trip.
  121 |     const state = await page.evaluate(`${PANEL_READABILITY}`)
  122 |     throw new Error(
  123 |       `the external-destinations panel never settled opaque and on top (${where}): ${JSON.stringify(state)}`,
  124 |     )
  125 |   }
  126 | }
  127 | 
  128 | /** Every drawn flow badge, and the overlay it is supposed to stay inside. *//** Every drawn flow badge, and the overlay it is supposed to stay inside. */
  129 | async function badgesOutsideOverlay(page: Page) {
  130 |   return page.evaluate(() => {
  131 |     const svg = document.querySelector('[data-testid="topology-flow-overlay"]')
  132 |     if (!svg) return { overlay: null, escaped: [] as Array<Record<string, unknown>> }
  133 |     const o = svg.getBoundingClientRect()
  134 |     const escaped: Array<Record<string, unknown>> = []
  135 |     for (const g of Array.from(document.querySelectorAll('[data-testid="topology-flow-badge"]'))) {
  136 |       const r = g.getBoundingClientRect()
  137 |       if (r.width === 0 && r.height === 0) continue
  138 |       // 1px of tolerance for the stroke the renderer draws on the box edge.
  139 |       if (r.left < o.left - 1 || r.right > o.right + 1 || r.top < o.top - 1 || r.bottom > o.bottom + 1) {
  140 |         escaped.push({
  141 |           text: (g.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
  142 |           left: Math.round(r.left),
  143 |           right: Math.round(r.right),
  144 |           top: Math.round(r.top),
  145 |           bottom: Math.round(r.bottom),
  146 |         })
  147 |       }
  148 |     }
  149 |     // The map's own chrome. A badge clamped back inside the card is contained
  150 |     // and can still be unreadable, stacked on the summary row or the colour
  151 |     // legend; both carry data-flow-obstacle so the nudge pass has to clear
  152 |     // them, and this measures whether it did.
  153 |     const chrome: Array<{ name: string; r: DOMRect }> = []
  154 |     for (const [name, sel] of [
  155 |       ["platform-map summary", '[data-testid="topology-platform-map-summary"]'],
  156 |       ["flow legend", '[data-testid="topology-flow-legend"]'],
  157 |     ] as const) {
  158 |       const el = document.querySelector(sel)
  159 |       if (el) chrome.push({ name, r: el.getBoundingClientRect() })
  160 |     }
  161 |     const overChrome: Array<Record<string, unknown>> = []
  162 |     for (const g of Array.from(document.querySelectorAll('[data-testid="topology-flow-badge"]'))) {
  163 |       const r = g.getBoundingClientRect()
  164 |       if (r.width === 0 && r.height === 0) continue
  165 |       for (const c of chrome) {
  166 |         const w = Math.min(r.right, c.r.right) - Math.max(r.left, c.r.left)
  167 |         const h = Math.min(r.bottom, c.r.bottom) - Math.max(r.top, c.r.top)
  168 |         if (w > 1 && h > 1) {
  169 |           overChrome.push({
  170 |             text: (g.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
  171 |             over: c.name,
  172 |             area: Math.round(w * h),
  173 |           })
  174 |         }
  175 |       }
  176 |     }
  177 |     return {
  178 |       overlay: { left: Math.round(o.left), right: Math.round(o.right), width: Math.round(o.width) },
  179 |       escaped,
  180 |       overChrome,
  181 |       total: document.querySelectorAll('[data-testid="topology-flow-badge"]').length,
  182 |     }
  183 |   })
  184 | }
  185 | 
  186 | for (const vp of VIEWPORTS) {
  187 |   test(`lower estate sections stay clear of the data tier at ${vp.name}`, async ({ context, page }) => {
  188 |     test.setTimeout(150_000)
  189 |     const groups = logicalGroupSnapshot()
  190 |     const triggers = triggerBundleSnapshot(groups.snapshot)
  191 |     const egress = externalEgressSnapshot(triggers.snapshot)
  192 |     await seedAuthCookie(context)
  193 |     await routeSnapshot(page, egress.snapshot)
  194 |     await page.setViewportSize({ width: vp.width, height: vp.height })
  195 |     await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
> 196 |     await expect(page.getByTestId("topology-estate-view-map")).toBeVisible({ timeout: 60_000 })
      |                                                                ^ Error: expect(locator).toBeVisible() failed
  197 |     await page.getByRole("tab", { name: "Network topology" }).click()
  198 | 
  199 |     // --- default state: every on-demand section closed ---------------------
  200 |     const coverage = page.getByTestId("topology-lane-coverage").first()
  201 |     if (await coverage.count()) {
  202 |       await expect(coverage).toHaveAttribute("data-details-open", "false")
  203 |       const box = await coverage.boundingBox()
  204 |       // It measured 71px expanded. The collapsed row is one line of 10px text
  205 |       // in a py-1.5 box; 44px leaves room for a wrapped totals sentence at
  206 |       // 1024 wide without ever re-admitting the lane grid.
  207 |       expect(box!.height, "collapsed coverage row is not the 71px block").toBeLessThanOrEqual(44)
  208 |       await expect(page.getByTestId("topology-lane-coverage-lanes")).toBeHidden()
  209 |     }
  210 | 
  211 |     const band = page.getByTestId("topology-logical-group-band").first()
  212 |     await expect(band).toBeVisible()
  213 |     await expect(band).toHaveAttribute("data-groups-open", "false")
  214 |     // The count must survive collapsing: a reader has to see that groups exist
  215 |     // without opening anything.
  216 |     const bandHeader = band.getByTestId("topology-logical-group-band-header")
  217 |     await expect(bandHeader).toContainText("Logical groups")
  218 |     await expect(bandHeader).toContainText(`(${groups.groups.length})`)
  219 | 
  220 |     const external = page.getByTestId("topology-external-destinations").first()
  221 |     await expect(external).toBeVisible()
  222 |     await expect(external).toHaveAttribute("data-open", "false")
  223 |     await expect(external).toHaveAttribute("data-leg-count", String(egress.legCount))
  224 |     await expect(page.getByTestId("topology-external-destinations-details")).toBeHidden()
  225 | 
  226 |     const s3 = page.getByTestId("topology-lambda-s3-coverage").first()
  227 |     await expect(s3).toBeVisible()
  228 |     await expect(s3).toHaveAttribute("data-open", "false")
  229 |     await expect(s3).toHaveAttribute("data-with-traffic", String(triggers.s3Functions.length))
  230 |     await expect(s3).toHaveAttribute("data-total", String(triggers.lambdas.length))
  231 |     await expect(page.getByTestId("topology-lambda-s3-coverage-details")).toBeHidden()
  232 | 
  233 |     // The strip is centre-justified: an overflow is split between both ends,
  234 |     // so the USERS block is the half that leaves the screen first.
  235 |     const strip = page.getByTestId("topology-users-internet-strip").first()
  236 |     const stripBox = (await strip.boundingBox())!
  237 |     const laneBefore = await page.getByTestId("topology-external-destinations-lane").boundingBox()
  238 |     const usersBox = (await page.getByTestId("topology-users-node").first().boundingBox())!
  239 |     expect(usersBox.x, `Users block clipped at the strip's left edge at ${vp.name}`).toBeGreaterThanOrEqual(
  240 |       stripBox.x - 1,
  241 |     )
  242 |     expect(usersBox.x, `Users block off the left of the viewport at ${vp.name}`).toBeGreaterThanOrEqual(-1)
  243 | 
  244 |     await page.screenshot({
  245 |       path: `test-results/estate-lower-default-${vp.name}.png`,
  246 |       fullPage: false,
  247 |     })
  248 | 
  249 |     // --- nothing paints outside the overlay --------------------------------
  250 |     const contained = await badgesOutsideOverlay(page)
  251 |     expect(contained.overlay, "the flow overlay is drawn").not.toBeNull()
  252 |     expect(contained.total, "the fixture draws flow badges to contain").toBeGreaterThan(0)
  253 |     expect(
  254 |       contained.escaped,
  255 |       `flow badges outside the overlay at ${vp.name}: ${JSON.stringify(contained.escaped)}`,
  256 |     ).toEqual([])
  257 |     expect(
  258 |       contained.overChrome,
  259 |       `flow badges painted over the map's own chrome at ${vp.name}: ${JSON.stringify(contained.overChrome)}`,
  260 |     ).toEqual([])
  261 | 
  262 |     // --- the assertion the first defect was about --------------------------
  263 |     const dataCells = page.locator('[data-tier="data"]')
  264 |     const cellCount = await dataCells.count()
  265 |     expect(cellCount, "the fixture draws a data tier to overlap with").toBeGreaterThan(0)
  266 |     for (let i = 0; i < cellCount; i++) {
  267 |       for (const [name, block] of [
  268 |         ["logical-group band", band],
  269 |         ["external-destinations node", external],
  270 |       ] as const) {
  271 |         const area = await overlapArea(block, dataCells.nth(i))
  272 |         expect(area, `${name} overlaps data-tier cell ${i} by ${area}px^2 at ${vp.name}`).toBe(0)
  273 |       }
  274 |     }
  275 | 
  276 |     // --- on demand, the content is still reachable AND contained -----------
  277 |     await band.getByTestId("topology-logical-group-band-toggle").click()
  278 |     await expect(band).toHaveAttribute("data-groups-open", "true")
  279 |     await expect(band.getByTestId("topology-logical-group")).toHaveCount(groups.groups.length)
  280 |     await expect(band.getByTestId("topology-logical-group-member").first()).toBeVisible()
  281 | 
  282 |     await external.getByTestId("topology-external-destinations-toggle").click()
  283 |     await expect(external).toHaveAttribute("data-open", "true")
  284 |     const panel = page.getByTestId("topology-external-destinations-details")
  285 |     await expect(panel).toBeVisible()
  286 |     await waitForSettledPanel(page, `${vp.name} · measurement`)
  287 |     await expect(panel.getByTestId("topology-external-destination-leg")).toHaveCount(egress.legCount)
  288 | 
  289 |     // Opening it may not change the width of what hosts it by a single pixel:
  290 |     // the panel is portaled, not a sibling column. The node moved off the top
  291 |     // strip and onto the canvas lane, so the lane is what this now measures —
  292 |     // the strip's width became a vacuous check the moment the node left it.
  293 |     const stripAfter = (await strip.boundingBox())!
  294 |     expect(
  295 |       Math.abs(stripAfter.width - stripBox.width),
  296 |       `opening the panel changed the top strip's width at ${vp.name}`,
```