# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-c1-qa-live.spec.ts >> C1 live QA — estate map against the deployed graph >> estate map on the deployed frontend: lanes, NAT chips, ALB band, coverage pill
- Location: tests/integration/topology-estate-c1-qa-live.spec.ts:237:7

# Error details

```
Error: estate map did not mount: No systems available yet. Run a sync, then open a system from the dashboard.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e4]:
    - generic [ref=e5]: Scope
    - generic [ref=e6]:
      - img [ref=e7]
      - generic [ref=e11]: Organization
      - combobox "Organization" [disabled] [ref=e12]:
        - option "Not configured" [selected]
    - generic [ref=e13]:
      - img [ref=e14]
      - generic [ref=e18]: Group
      - combobox "Group" [ref=e19]:
        - option "All account groups" [selected]
    - generic [ref=e20]:
      - img [ref=e21]
      - generic [ref=e23]: Account
      - combobox "Account" [ref=e24]:
        - option "All accounts" [selected]
    - generic [ref=e25]:
      - img [ref=e26]
      - generic [ref=e31]: Region
      - combobox "Region" [ref=e32]:
        - option "All regions" [selected]
    - generic [ref=e34]: Scope metadata unavailable
  - generic [ref=e35]: No systems available yet. Run a sync, then open a system from the dashboard.
  - region "Notifications (F8)":
    - list
  - alert [ref=e36]
```

# Test source

```ts
  168 |           mode: authority.mode ?? null,
  169 |           active_generation: authority.active_generation ?? null,
  170 |           authoritative_endpoint_count: authority.authoritative_endpoint_count ?? null,
  171 |           endpoint_count: authority.endpoint_count ?? null,
  172 |           projected_edge_count: authority.projected_edge_count ?? null,
  173 |           lane_coverage: authority.lane_coverage ?? null,
  174 |         }
  175 |       : null,
  176 |   }
  177 | }
  178 | 
  179 | test.describe("C1 live QA — estate map against the deployed graph", () => {
  180 |   test("topology-risk on the deployed backend: inventory, edges, and the lane-coverage contract", async ({ playwright }) => {
  181 |     test.setTimeout(240_000)
  182 |     const request = await authedApi(playwright)
  183 |     const res = await liveGetWithRetry(request, TOPOLOGY_RISK_PATH)
  184 |     const text = await res.text()
  185 |     expect(res.status(), text.slice(0, 500)).toBe(200)
  186 |     const body = JSON.parse(text) as TopologyRisk
  187 |     const summary = summarizeTopology(body)
  188 |     report("topology-risk", summary)
  189 |     await attachJson("topology-risk-summary.json", summary)
  190 |     await request.dispose()
  191 | 
  192 |     expect(body.system).toBe(SYSTEM)
  193 |     expect(summary.nodes).toBeGreaterThan(0)
  194 | 
  195 |     const coverage = body.traffic_authority?.lane_coverage ?? null
  196 |     report("contract", {
  197 |       lane_coverage_present: Boolean(coverage),
  198 |       authority_state: body.traffic_authority?.state ?? null,
  199 |       active_generation: body.traffic_authority?.active_generation ?? null,
  200 |     })
  201 |     if (!coverage) return // backend predates topology-risk/v8: nothing to check, and the pill must be absent (probe 2)
  202 | 
  203 |     // Internal consistency of the contract, independent of what the graph holds.
  204 |     expect(coverage.basis).toBe("vpc_flow_logs")
  205 |     expect(COVERAGE_STATES.has(String(coverage.state))).toBe(true)
  206 |     const sums = { eligible: 0, authoritative: 0, unknown: 0, not_applicable: 0 }
  207 |     for (const lane of COVERAGE_LANES) {
  208 |       const counts = coverage.by_lane?.[lane]
  209 |       expect(counts, `by_lane.${lane}`).toBeTruthy()
  210 |       if (!counts) continue
  211 |       expect(COVERAGE_STATES.has(counts.state), `${lane}.state`).toBe(true)
  212 |       expect(counts.authoritative, `${lane}: authoritative ≤ eligible`).toBeLessThanOrEqual(counts.eligible)
  213 |       sums.eligible += counts.eligible
  214 |       sums.authoritative += counts.authoritative
  215 |       sums.unknown += counts.unknown
  216 |       sums.not_applicable += counts.not_applicable
  217 |     }
  218 |     expect(coverage.eligible).toBe(sums.eligible)
  219 |     expect(coverage.authoritative).toBe(sums.authoritative)
  220 |     expect(coverage.unknown).toBe(sums.unknown)
  221 |     expect(coverage.not_applicable).toBe(sums.not_applicable)
  222 |     expect(coverage.authoritative).toBeLessThanOrEqual(coverage.eligible)
  223 |     for (const warning of coverage.warnings ?? []) {
  224 |       expect(typeof warning.code).toBe("string")
  225 |       expect(typeof warning.message).toBe("string")
  226 |       expect(warning.count).toBeGreaterThan(0)
  227 |     }
  228 |     report("contract-consistency", {
  229 |       classified: sums.eligible + sums.unknown + sums.not_applicable,
  230 |       nodes: summary.nodes,
  231 |       warnings: (coverage.warnings ?? []).map(warning => `${warning.code}(${warning.lane}:${warning.count})`),
  232 |       projection: coverage.projection ?? null,
  233 |       rejected_edges: coverage.rejected_edges ?? null,
  234 |     })
  235 |   })
  236 | 
  237 |   test("estate map on the deployed frontend: lanes, NAT chips, ALB band, coverage pill", async ({ context, page }) => {
  238 |     test.setTimeout(300_000)
  239 |     await seedAuthCookie(context)
  240 |     await page.setViewportSize({ width: 1600, height: 900 })
  241 |     const pageErrors: string[] = []
  242 |     page.on("pageerror", error => pageErrors.push(String(error.message ?? error)))
  243 |     // Assigned from a response listener: an object property, not a `let`, so
  244 |     // control-flow analysis does not narrow it to null at the read sites.
  245 |     const captured: { payload: TopologyRisk | null } = { payload: null }
  246 |     page.on("response", async response => {
  247 |       if (
  248 |         response.url().includes("/api/proxy/topology-risk/") &&
  249 |         response.request().method() === "GET" &&
  250 |         response.status() === 200
  251 |       ) {
  252 |         try {
  253 |           captured.payload = (await response.json()) as TopologyRisk
  254 |         } catch {
  255 |           // a non-JSON body is reported below as a missing payload
  256 |         }
  257 |       }
  258 |     })
  259 | 
  260 |     await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  261 |     const mapTab = page.getByTestId("topology-estate-view-map")
  262 |     const blocked = page.getByText(/Topology risk unavailable|No systems available yet/i)
  263 |     await expect(mapTab.or(blocked).first()).toBeVisible({ timeout: 120_000 })
  264 |     if (!(await mapTab.isVisible().catch(() => false))) {
  265 |       const reason = ((await blocked.first().textContent().catch(() => null)) ?? "").replace(/\s+/g, " ").trim()
  266 |       report("estate-page", { mounted: false, reason })
  267 |       await shot(page, "c1-estate-blocked")
> 268 |       throw new Error(`estate map did not mount: ${reason}`)
      |             ^ Error: estate map did not mount: No systems available yet. Run a sync, then open a system from the dashboard.
  269 |     }
  270 |     await page.getByRole("tab", { name: "Network topology" }).click()
  271 |     const dependencies = page
  272 |       .getByTestId("topology-flow-mode-toggle")
  273 |       .getByRole("button", { name: "Dependencies" })
  274 |       .first()
  275 |     await dependencies.click()
  276 |     await expect(dependencies).toHaveAttribute("aria-pressed", "true")
  277 |     await page.waitForTimeout(1500)
  278 |     await shot(page, "c1-estate-embedded")
  279 | 
  280 |     const vpcOptions = await page
  281 |       .getByTestId("topology-vpc-select")
  282 |       .locator("option")
  283 |       .allTextContents()
  284 |       .catch(() => [] as string[])
  285 |     report("embedded", {
  286 |       vpc_options: vpcOptions,
  287 |       authority_banner: await bannerText(page, "page"),
  288 |       coverage_pill: await readPill(page, "page"),
  289 |       payload_captured: Boolean(captured.payload),
  290 |     })
  291 | 
  292 |     // Fullscreen — Glance first (the default), then Inventory (one icon per node).
  293 |     await page.getByTestId("topology-estate-map-enlarge").click()
  294 |     const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  295 |     await expect(fullscreen).toBeVisible()
  296 |     await page.waitForTimeout(1500)
  297 |     await shot(page, "c1-fullscreen-glance")
  298 |     const glance = await measureFullscreen(page)
  299 |     report("fullscreen-glance", { ...glance, header_overlaps: await railHeaderBadgeOverlaps(page) })
  300 | 
  301 |     await fullscreen.getByTestId("topology-estate-density-fs-inventory").click()
  302 |     await page.waitForTimeout(1500)
  303 |     await shot(page, "c1-fullscreen-inventory")
  304 |     const inventory = await measureFullscreen(page)
  305 |     const overlaps = await railHeaderBadgeOverlaps(page)
  306 |     const pill = await readPill(page, "fullscreen")
  307 |     report("fullscreen-inventory", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  308 |     await attachJson("fullscreen-inventory.json", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  309 | 
  310 |     // --- Assertions. Soft where the graph's shape decides what is present.
  311 |     expect.soft(overlaps, "no flow label paints over a rail header").toEqual([])
  312 |     for (const lane of ["serverless", "regional"] as const) {
  313 |       const measured = inventory.lanes[lane]
  314 |       if (!measured || !inventory.rail) continue
  315 |       expect.soft(measured.header.t, `${lane} header inside the rail`).toBeGreaterThanOrEqual(inventory.rail.t - 1)
  316 |       expect.soft(measured.header.b, `${lane} header inside the rail`).toBeLessThanOrEqual(inventory.rail.b + 1)
  317 |       expect.soft(measured.header.b, `${lane} header inside the viewport`).toBeLessThanOrEqual(inventory.viewport.h)
  318 |       expect.soft(measured.overflowY, `${lane} lane body owns its scroll`).toBe("auto")
  319 |       if (measured.scrollHeight > measured.clientHeight + 4) {
  320 |         expect.soft(measured.more_pill, `${lane} fold footer counts the chips below`).toBe(`+${measured.below} more ↓`)
  321 |       } else {
  322 |         expect.soft(measured.more_pill, `${lane} has no fold footer without overflow`).toBeNull()
  323 |       }
  324 |     }
  325 |     if (inventory.alb_band && inventory.az_headers) {
  326 |       expect.soft(inventory.alb_band.b, "load balancer band above the AZ headers").toBeLessThanOrEqual(inventory.az_headers.t + 1)
  327 |     }
  328 |     for (const nat of inventory.nat) {
  329 |       if (nat.placement === "subnet") expect.soft(nat.in_subnet_cell, `NAT ${nat.id} pinned inside a subnet cell`).toBe(true)
  330 |       else expect.soft(nat.in_fallback, `NAT ${nat.id} on the labelled fallback strip`).toBe(true)
  331 |     }
  332 |     const payload = captured.payload
  333 |     const payloadNats = payload?.vpc_topology?.edges?.nat_gws ?? []
  334 |     if (payload) {
  335 |       expect.soft(inventory.nat.length, "every NAT gateway of the payload is drawn once").toBe(payloadNats.length)
  336 |     }
  337 | 
  338 |     // Coverage pill: exactly the payload's numbers, or absent when the payload has none.
  339 |     const coverage = payload?.traffic_authority?.lane_coverage ?? null
  340 |     if (coverage) {
  341 |       expect.soft(pill, "coverage pill rendered for a payload with lane_coverage").not.toBeNull()
  342 |       if (pill) {
  343 |         expect.soft(pill.state, "pill state").toBe(coverage.state ?? null)
  344 |         expect.soft(pill.totals, "pill totals").toBe(expectedTotalsText(coverage))
  345 |         for (const lane of COVERAGE_LANES) {
  346 |           const counts = coverage.by_lane?.[lane]
  347 |           const chip = pill.lanes.find(entry => entry.testid === `topology-lane-coverage-${lane}`)
  348 |           if (!counts || counts.state === "empty") expect.soft(chip, `${lane} chip absent for an empty lane`).toBeUndefined()
  349 |           else expect.soft(chip?.state, `${lane} chip state`).toBe(counts.state)
  350 |         }
  351 |         expect.soft(pill.warnings.map(warning => warning.code), "warnings, in the backend's order").toEqual(
  352 |           (coverage.warnings ?? []).map(warning => warning.code),
  353 |         )
  354 |       }
  355 |     } else {
  356 |       expect.soft(pill, "no coverage pill without lane_coverage in the payload").toBeNull()
  357 |     }
  358 | 
  359 |     // Scroll the Lambda lane when it overflows: the last chip must land inside
  360 |     // a lane body that is at least one chip tall, with both fold pills up.
  361 |     const serverless = inventory.lanes.serverless
  362 |     if (serverless && serverless.scrollHeight > serverless.clientHeight + 4) {
  363 |       const laneBody = fullscreen.getByTestId("topology-serverless-lane-body")
  364 |       const chips = laneBody.locator("[data-flow-id], [data-flow-ids]")
  365 |       const chipCount = await chips.count()
  366 |       const last = chips.nth(chipCount - 1)
  367 |       const pageScrollBefore = await page.evaluate(() => window.scrollY)
  368 |       await last.scrollIntoViewIfNeeded()
```