# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-c1-qa-live.spec.ts >> C1 live QA — estate map against the deployed graph >> estate map on the deployed frontend: lanes, NAT chips, ALB band, coverage pill
- Location: tests/integration/topology-estate-c1-qa-live.spec.ts:237:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('topology-estate-view-map').or(getByText(/Topology risk unavailable|No systems available yet/i)).first()
Expected: visible
Timeout: 120000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 120000ms
  - waiting for getByTestId('topology-estate-view-map').or(getByText(/Topology risk unavailable|No systems available yet/i)).first()

```

```yaml
- text: Scope
- img
- text: Organization
- combobox "Organization":
  - option "Cyntro Testbed Webshop" [selected]
- img
- text: Group
- combobox "Group":
  - option "All account groups" [selected]
- img
- text: Account
- combobox "Account":
  - option "All accounts" [selected]
  - option "Testbed Webshop · 416651950952"
- img
- text: Region
- combobox "Region":
  - option "All regions" [selected]
  - option "eu-west-1"
- text: 1 accounts in view
- img
- text: Building estate map Preparing testbed-webshop Checking for a last-good snapshot before reading the behavioral graph.
- img
- text: Check last-good estate snapshot
- img
- text: Read behavioral resources and relationships
- img
- text: Score and assemble the operator view Cold refreshes normally complete in under 30 seconds. Cyntro never replaces a last-good map with an incomplete response.
- region "Notifications (F8)":
  - list
- alert
```

# Test source

```ts
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
  246 |     // The product-scope gate (organization roster, account options, scoped
  247 |     // systems catalog) decides whether the map mounts at all; record what each
  248 |     // of those calls answered so a blocked page comes with its cause.
  249 |     const gate: Array<{ path: string; status: number; body: string }> = []
  250 |     page.on("response", async response => {
  251 |       const url = new URL(response.url())
  252 |       const isGate =
  253 |         url.pathname === "/api/proxy/admin/customers" ||
  254 |         url.pathname === "/api/proxy/admin/accounts/scope/options/all" ||
  255 |         url.pathname === "/api/proxy/systems" ||
  256 |         url.pathname.startsWith("/api/proxy/topology-risk/")
  257 |       if (isGate) {
  258 |         let body = ""
  259 |         try {
  260 |           body = (await response.text()).slice(0, 400)
  261 |         } catch {
  262 |           body = "<unreadable>"
  263 |         }
  264 |         gate.push({ path: url.pathname + url.search, status: response.status(), body })
  265 |       }
  266 |       if (
  267 |         url.pathname.startsWith("/api/proxy/topology-risk/") &&
  268 |         response.request().method() === "GET" &&
  269 |         response.status() === 200
  270 |       ) {
  271 |         try {
  272 |           captured.payload = (await response.json()) as TopologyRisk
  273 |         } catch {
  274 |           // a non-JSON body is reported below as a missing payload
  275 |         }
  276 |       }
  277 |     })
  278 | 
  279 |     await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  280 |     const mapTab = page.getByTestId("topology-estate-view-map")
  281 |     const blocked = page.getByText(/Topology risk unavailable|No systems available yet/i)
> 282 |     await expect(mapTab.or(blocked).first()).toBeVisible({ timeout: 120_000 })
      |                                              ^ Error: expect(locator).toBeVisible() failed
  283 |     if (!(await mapTab.isVisible().catch(() => false))) {
  284 |       const reason = ((await blocked.first().textContent().catch(() => null)) ?? "").replace(/\s+/g, " ").trim()
  285 |       report("estate-page", { mounted: false, reason, gate })
  286 |       await shot(page, "c1-estate-blocked")
  287 |       throw new Error(`estate map did not mount: ${reason}`)
  288 |     }
  289 |     await page.getByRole("tab", { name: "Network topology" }).click()
  290 |     const dependencies = page
  291 |       .getByTestId("topology-flow-mode-toggle")
  292 |       .getByRole("button", { name: "Dependencies" })
  293 |       .first()
  294 |     await dependencies.click()
  295 |     await expect(dependencies).toHaveAttribute("aria-pressed", "true")
  296 |     await page.waitForTimeout(1500)
  297 |     await shot(page, "c1-estate-embedded")
  298 | 
  299 |     const vpcOptions = await page
  300 |       .getByTestId("topology-vpc-select")
  301 |       .locator("option")
  302 |       .allTextContents()
  303 |       .catch(() => [] as string[])
  304 |     report("scope-gate", gate)
  305 |     report("embedded", {
  306 |       vpc_options: vpcOptions,
  307 |       authority_banner: await bannerText(page, "page"),
  308 |       coverage_pill: await readPill(page, "page"),
  309 |       payload_captured: Boolean(captured.payload),
  310 |       ...(await measureEmbeddedLegibility(page)),
  311 |     })
  312 | 
  313 |     // Fullscreen — Glance first (the default), then Inventory (one icon per node).
  314 |     await page.getByTestId("topology-estate-map-enlarge").click()
  315 |     const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  316 |     await expect(fullscreen).toBeVisible()
  317 |     await page.waitForTimeout(1500)
  318 |     await shot(page, "c1-fullscreen-glance")
  319 |     const glance = await measureFullscreen(page)
  320 |     report("fullscreen-glance", { ...glance, header_overlaps: await railHeaderBadgeOverlaps(page) })
  321 | 
  322 |     await fullscreen.getByTestId("topology-estate-density-fs-inventory").click()
  323 |     await page.waitForTimeout(1500)
  324 |     await shot(page, "c1-fullscreen-inventory")
  325 |     const inventory = await measureFullscreen(page)
  326 |     const overlaps = await railHeaderBadgeOverlaps(page)
  327 |     const pill = await readPill(page, "fullscreen")
  328 |     report("fullscreen-inventory", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  329 |     await attachJson("fullscreen-inventory.json", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  330 | 
  331 |     // --- Assertions. Soft where the graph's shape decides what is present.
  332 |     const overlapping = overlaps.filter(o => {
  333 |       const depth = Math.min(o.badge.b, o.headerBox.b) - Math.max(o.badge.t, o.headerBox.t)
  334 |       return depth > 1
  335 |     })
  336 |     expect.soft(overlapping, "no flow label paints over a rail header (touches ≤ 1px are reported, not failed)").toEqual([])
  337 |     for (const lane of ["serverless", "regional"] as const) {
  338 |       const measured = inventory.lanes[lane]
  339 |       if (!measured || !inventory.rail) continue
  340 |       expect.soft(measured.header.t, `${lane} header inside the rail`).toBeGreaterThanOrEqual(inventory.rail.t - 1)
  341 |       expect.soft(measured.header.b, `${lane} header inside the rail`).toBeLessThanOrEqual(inventory.rail.b + 1)
  342 |       expect.soft(measured.header.b, `${lane} header inside the viewport`).toBeLessThanOrEqual(inventory.viewport.h)
  343 |       expect.soft(measured.overflowY, `${lane} lane body owns its scroll`).toBe("auto")
  344 |       if (measured.scrollHeight > measured.clientHeight + 4) {
  345 |         expect.soft(measured.more_pill, `${lane} fold footer counts the chips below`).toBe(`+${measured.below} more ↓`)
  346 |       } else {
  347 |         expect.soft(measured.more_pill, `${lane} has no fold footer without overflow`).toBeNull()
  348 |       }
  349 |     }
  350 |     if (inventory.alb_band && inventory.az_headers) {
  351 |       expect.soft(inventory.alb_band.b, "load balancer band above the AZ headers").toBeLessThanOrEqual(inventory.az_headers.t + 1)
  352 |     }
  353 |     for (const nat of inventory.nat) {
  354 |       if (nat.placement === "subnet") expect.soft(nat.in_subnet_cell, `NAT ${nat.id} pinned inside a subnet cell`).toBe(true)
  355 |       else expect.soft(nat.in_fallback, `NAT ${nat.id} on the labelled fallback strip`).toBe(true)
  356 |     }
  357 |     const payload = captured.payload
  358 |     const payloadNats = payload?.vpc_topology?.edges?.nat_gws ?? []
  359 |     if (payload) {
  360 |       expect.soft(inventory.nat.length, "every NAT gateway of the payload is drawn once").toBe(payloadNats.length)
  361 |     }
  362 | 
  363 |     // Coverage pill: exactly the payload's numbers, or absent when the payload has none.
  364 |     const coverage = payload?.traffic_authority?.lane_coverage ?? null
  365 |     if (coverage) {
  366 |       expect.soft(pill, "coverage pill rendered for a payload with lane_coverage").not.toBeNull()
  367 |       if (pill) {
  368 |         expect.soft(pill.state, "pill state").toBe(coverage.state ?? null)
  369 |         expect.soft(pill.totals, "pill totals").toBe(expectedTotalsText(coverage))
  370 |         for (const lane of COVERAGE_LANES) {
  371 |           const counts = coverage.by_lane?.[lane]
  372 |           const chip = pill.lanes.find(entry => entry.testid === `topology-lane-coverage-${lane}`)
  373 |           if (!counts || counts.state === "empty") expect.soft(chip, `${lane} chip absent for an empty lane`).toBeUndefined()
  374 |           else expect.soft(chip?.state, `${lane} chip state`).toBe(counts.state)
  375 |         }
  376 |         expect.soft(pill.warnings.map(warning => warning.code), "warnings, in the backend's order").toEqual(
  377 |           (coverage.warnings ?? []).map(warning => warning.code),
  378 |         )
  379 |       }
  380 |     } else {
  381 |       expect.soft(pill, "no coverage pill without lane_coverage in the payload").toBeNull()
  382 |     }
```