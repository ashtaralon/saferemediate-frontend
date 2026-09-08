# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-c1-qa-live.spec.ts >> C1 live QA — estate map against the deployed graph >> estate map on the deployed frontend: lanes, NAT chips, ALB band, coverage pill
- Location: tests/integration/topology-estate-c1-qa-live.spec.ts:261:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('topology-estate-view-map').or(getByText(/Topology risk unavailable|No systems available yet/i)).first()
Expected: visible
Timeout: 150000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 150000ms
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
  - option "All accounts"
  - option "Testbed Webshop · 416651950952" [selected]
- img
- text: Region
- combobox "Region":
  - option "All regions"
  - option "eu-west-1" [selected]
- text: 1 accounts in view
- img
- text: Building estate map Preparing testbed-webshop A peer is computing the live graph. This view will update automatically.
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
  222 |       authority_state: body.traffic_authority?.state ?? null,
  223 |       active_generation: body.traffic_authority?.active_generation ?? null,
  224 |     })
  225 |     if (!coverage) return // backend predates topology-risk/v8: nothing to check, and the pill must be absent (probe 2)
  226 | 
  227 |     // Internal consistency of the contract, independent of what the graph holds.
  228 |     expect(coverage.basis).toBe("vpc_flow_logs")
  229 |     expect(COVERAGE_STATES.has(String(coverage.state))).toBe(true)
  230 |     const sums = { eligible: 0, authoritative: 0, unknown: 0, not_applicable: 0 }
  231 |     for (const lane of COVERAGE_LANES) {
  232 |       const counts = coverage.by_lane?.[lane]
  233 |       expect(counts, `by_lane.${lane}`).toBeTruthy()
  234 |       if (!counts) continue
  235 |       expect(COVERAGE_STATES.has(counts.state), `${lane}.state`).toBe(true)
  236 |       expect(counts.authoritative, `${lane}: authoritative ≤ eligible`).toBeLessThanOrEqual(counts.eligible)
  237 |       sums.eligible += counts.eligible
  238 |       sums.authoritative += counts.authoritative
  239 |       sums.unknown += counts.unknown
  240 |       sums.not_applicable += counts.not_applicable
  241 |     }
  242 |     expect(coverage.eligible).toBe(sums.eligible)
  243 |     expect(coverage.authoritative).toBe(sums.authoritative)
  244 |     expect(coverage.unknown).toBe(sums.unknown)
  245 |     expect(coverage.not_applicable).toBe(sums.not_applicable)
  246 |     expect(coverage.authoritative).toBeLessThanOrEqual(coverage.eligible)
  247 |     for (const warning of coverage.warnings ?? []) {
  248 |       expect(typeof warning.code).toBe("string")
  249 |       expect(typeof warning.message).toBe("string")
  250 |       expect(warning.count).toBeGreaterThan(0)
  251 |     }
  252 |     report("contract-consistency", {
  253 |       classified: sums.eligible + sums.unknown + sums.not_applicable,
  254 |       nodes: summary.nodes,
  255 |       warnings: (coverage.warnings ?? []).map(warning => `${warning.code}(${warning.lane}:${warning.count})`),
  256 |       projection: coverage.projection ?? null,
  257 |       rejected_edges: coverage.rejected_edges ?? null,
  258 |     })
  259 |   })
  260 | 
  261 |   test("estate map on the deployed frontend: lanes, NAT chips, ALB band, coverage pill", async ({ context, page }) => {
  262 |     test.setTimeout(300_000)
  263 |     await seedAuthCookie(context)
  264 |     await page.setViewportSize({ width: 1600, height: 900 })
  265 |     const pageErrors: string[] = []
  266 |     page.on("pageerror", error => pageErrors.push(String(error.message ?? error)))
  267 |     // Assigned from a response listener: an object property, not a `let`, so
  268 |     // control-flow analysis does not narrow it to null at the read sites.
  269 |     const captured: { payload: TopologyRisk | null } = { payload: null }
  270 |     // The product-scope gate (organization roster, account options, scoped
  271 |     // systems catalog) decides whether the map mounts at all; record what each
  272 |     // of those calls answered so a blocked page comes with its cause.
  273 |     const gate: Array<{ path: string; status: number; body: string }> = []
  274 |     page.on("response", async response => {
  275 |       const url = new URL(response.url())
  276 |       const isGate =
  277 |         url.pathname === "/api/proxy/admin/customers" ||
  278 |         url.pathname === "/api/proxy/admin/accounts/scope/options/all" ||
  279 |         url.pathname === "/api/proxy/systems" ||
  280 |         url.pathname.startsWith("/api/proxy/topology-risk/")
  281 |       if (isGate) {
  282 |         let body = ""
  283 |         try {
  284 |           body = (await response.text()).slice(0, 400)
  285 |         } catch {
  286 |           body = "<unreadable>"
  287 |         }
  288 |         gate.push({ path: url.pathname + url.search, status: response.status(), body })
  289 |       }
  290 |       if (
  291 |         url.pathname.startsWith("/api/proxy/topology-risk/") &&
  292 |         response.request().method() === "GET" &&
  293 |         response.status() === 200
  294 |       ) {
  295 |         try {
  296 |           captured.payload = (await response.json()) as TopologyRisk
  297 |         } catch {
  298 |           // a non-JSON body is reported below as a missing payload
  299 |         }
  300 |       }
  301 |     })
  302 | 
  303 |     // Cold reads are the norm here, not an error: the proxy's cache key
  304 |     // carries the page's scope (customer_id and friends), so the map's own
  305 |     // read is uncached even after an unscoped probe, and an uncached
  306 |     // topology-risk on C1 runs close to the proxy's 55s ceiling. The first
  307 |     // load therefore both fills that scoped cache and, if it times out,
  308 |     // leaves the page on its "Preparing …" / "unavailable" state. Reload and
  309 |     // wait again — the same thing an operator does — and report how many
  310 |     // loads it took.
  311 |     const mapTab = page.getByTestId("topology-estate-view-map")
  312 |     // "Preparing <system>" is the map's LOADING card, not a blocked state:
  313 |     // matching it here made every load return at once and the probe spent its
  314 |     // three attempts in a minute without ever waiting for the map (run
  315 |     // 33675359540). Only a real refusal short-circuits the wait.
  316 |     const blocked = page.getByText(/Topology risk unavailable|No systems available yet/i)
  317 |     const loads: Array<{ attempt: number; mounted: boolean; reason: string | null; ms: number }> = []
  318 |     let mounted = false
  319 |     for (let attempt = 1; attempt <= 3 && !mounted; attempt += 1) {
  320 |       const t0 = Date.now()
  321 |       await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
> 322 |       await expect(mapTab.or(blocked).first()).toBeVisible({ timeout: 150_000 })
      |                                                ^ Error: expect(locator).toBeVisible() failed
  323 |       mounted = await mapTab.isVisible().catch(() => false)
  324 |       const reason = mounted
  325 |         ? null
  326 |         : ((await blocked.first().textContent().catch(() => null)) ?? "").replace(/\s+/g, " ").trim()
  327 |       loads.push({ attempt, mounted, reason, ms: Date.now() - t0 })
  328 |       if (!mounted && attempt < 3) await page.waitForTimeout(20_000)
  329 |     }
  330 |     report("estate-page", { mounted, loads, gate })
  331 |     if (!mounted) {
  332 |       await shot(page, "c1-estate-blocked")
  333 |       throw new Error(`estate map did not mount after ${loads.length} loads: ${loads[loads.length - 1]?.reason}`)
  334 |     }
  335 |     await page.getByRole("tab", { name: "Network topology" }).click()
  336 |     const dependencies = page
  337 |       .getByTestId("topology-flow-mode-toggle")
  338 |       .getByRole("button", { name: "Dependencies" })
  339 |       .first()
  340 |     await dependencies.click()
  341 |     await expect(dependencies).toHaveAttribute("aria-pressed", "true")
  342 |     await page.waitForTimeout(1500)
  343 |     await shot(page, "c1-estate-embedded")
  344 | 
  345 |     const vpcOptions = await page
  346 |       .getByTestId("topology-vpc-select")
  347 |       .locator("option")
  348 |       .allTextContents()
  349 |       .catch(() => [] as string[])
  350 |     report("scope-gate", gate)
  351 |     report("embedded", {
  352 |       vpc_options: vpcOptions,
  353 |       authority_banner: await bannerText(page, "page"),
  354 |       coverage_pill: await readPill(page, "page"),
  355 |       payload_captured: Boolean(captured.payload),
  356 |       ...(await measureEmbeddedLegibility(page)),
  357 |     })
  358 | 
  359 |     // Fullscreen — Glance first (the default), then Inventory (one icon per node).
  360 |     await page.getByTestId("topology-estate-map-enlarge").click()
  361 |     const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  362 |     await expect(fullscreen).toBeVisible()
  363 |     await page.waitForTimeout(1500)
  364 |     await shot(page, "c1-fullscreen-glance")
  365 |     const glance = await measureFullscreen(page)
  366 |     report("fullscreen-glance", { ...glance, header_overlaps: await railHeaderBadgeOverlaps(page) })
  367 | 
  368 |     await fullscreen.getByTestId("topology-estate-density-fs-inventory").click()
  369 |     await page.waitForTimeout(1500)
  370 |     await shot(page, "c1-fullscreen-inventory")
  371 |     const inventory = await measureFullscreen(page)
  372 |     const overlaps = await railHeaderBadgeOverlaps(page)
  373 |     const pill = await readPill(page, "fullscreen")
  374 |     report("fullscreen-inventory", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  375 |     await attachJson("fullscreen-inventory.json", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  376 | 
  377 |     // --- Assertions. Soft where the graph's shape decides what is present.
  378 |     const overlapping = overlaps.filter(o => {
  379 |       const depth = Math.min(o.badge.b, o.headerBox.b) - Math.max(o.badge.t, o.headerBox.t)
  380 |       return depth > 1
  381 |     })
  382 |     expect.soft(overlapping, "no flow label paints over a rail header (touches ≤ 1px are reported, not failed)").toEqual([])
  383 |     for (const lane of ["serverless", "regional"] as const) {
  384 |       const measured = inventory.lanes[lane]
  385 |       if (!measured || !inventory.rail) continue
  386 |       expect.soft(measured.header.t, `${lane} header inside the rail`).toBeGreaterThanOrEqual(inventory.rail.t - 1)
  387 |       expect.soft(measured.header.b, `${lane} header inside the rail`).toBeLessThanOrEqual(inventory.rail.b + 1)
  388 |       expect.soft(measured.header.b, `${lane} header inside the viewport`).toBeLessThanOrEqual(inventory.viewport.h)
  389 |       expect.soft(measured.overflowY, `${lane} lane body owns its scroll`).toBe("auto")
  390 |       if (measured.scrollHeight > measured.clientHeight + 4) {
  391 |         expect.soft(measured.more_pill, `${lane} fold footer counts the chips below`).toBe(`+${measured.below} more ↓`)
  392 |       } else {
  393 |         expect.soft(measured.more_pill, `${lane} has no fold footer without overflow`).toBeNull()
  394 |       }
  395 |     }
  396 |     if (inventory.alb_band && inventory.az_headers) {
  397 |       expect.soft(inventory.alb_band.b, "load balancer band above the AZ headers").toBeLessThanOrEqual(inventory.az_headers.t + 1)
  398 |     }
  399 |     for (const nat of inventory.nat) {
  400 |       if (nat.placement === "subnet") expect.soft(nat.in_subnet_cell, `NAT ${nat.id} pinned inside a subnet cell`).toBe(true)
  401 |       else expect.soft(nat.in_fallback, `NAT ${nat.id} on the labelled fallback strip`).toBe(true)
  402 |     }
  403 |     const payload = captured.payload
  404 |     const payloadNats = payload?.vpc_topology?.edges?.nat_gws ?? []
  405 |     if (payload) {
  406 |       expect.soft(inventory.nat.length, "every NAT gateway of the payload is drawn once").toBe(payloadNats.length)
  407 |     }
  408 | 
  409 |     // Coverage pill: exactly the payload's numbers, or absent when the payload has none.
  410 |     const coverage = payload?.traffic_authority?.lane_coverage ?? null
  411 |     if (coverage) {
  412 |       expect.soft(pill, "coverage pill rendered for a payload with lane_coverage").not.toBeNull()
  413 |       if (pill) {
  414 |         expect.soft(pill.state, "pill state").toBe(coverage.state ?? null)
  415 |         expect.soft(pill.totals, "pill totals").toBe(expectedTotalsText(coverage))
  416 |         for (const lane of COVERAGE_LANES) {
  417 |           const counts = coverage.by_lane?.[lane]
  418 |           const chip = pill.lanes.find(entry => entry.testid === `topology-lane-coverage-${lane}`)
  419 |           if (!counts || counts.state === "empty") expect.soft(chip, `${lane} chip absent for an empty lane`).toBeUndefined()
  420 |           else expect.soft(chip?.state, `${lane} chip state`).toBe(counts.state)
  421 |         }
  422 |         expect.soft(pill.warnings.map(warning => warning.code), "warnings, in the backend's order").toEqual(
```