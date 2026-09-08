# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-c1-qa-live.spec.ts >> C1 live QA — estate map against the deployed graph >> estate map on the deployed frontend: lanes, NAT chips, ALB band, coverage pill
- Location: tests/integration/topology-estate-c1-qa-live.spec.ts:278:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('topology-estate-view-map').or(getByText(/Topology risk unavailable|No systems available yet|Estate map temporarily unavailable/i)).first()
Expected: visible
Timeout: 120000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 120000ms
  - waiting for getByTestId('topology-estate-view-map').or(getByText(/Topology risk unavailable|No systems available yet|Estate map temporarily unavailable/i)).first()

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
  241 |     })
  242 |     if (!coverage) return // backend predates topology-risk/v8: nothing to check, and the pill must be absent (probe 2)
  243 | 
  244 |     // Internal consistency of the contract, independent of what the graph holds.
  245 |     expect(coverage.basis).toBe("vpc_flow_logs")
  246 |     expect(COVERAGE_STATES.has(String(coverage.state))).toBe(true)
  247 |     const sums = { eligible: 0, authoritative: 0, unknown: 0, not_applicable: 0 }
  248 |     for (const lane of COVERAGE_LANES) {
  249 |       const counts = coverage.by_lane?.[lane]
  250 |       expect(counts, `by_lane.${lane}`).toBeTruthy()
  251 |       if (!counts) continue
  252 |       expect(COVERAGE_STATES.has(counts.state), `${lane}.state`).toBe(true)
  253 |       expect(counts.authoritative, `${lane}: authoritative ≤ eligible`).toBeLessThanOrEqual(counts.eligible)
  254 |       sums.eligible += counts.eligible
  255 |       sums.authoritative += counts.authoritative
  256 |       sums.unknown += counts.unknown
  257 |       sums.not_applicable += counts.not_applicable
  258 |     }
  259 |     expect(coverage.eligible).toBe(sums.eligible)
  260 |     expect(coverage.authoritative).toBe(sums.authoritative)
  261 |     expect(coverage.unknown).toBe(sums.unknown)
  262 |     expect(coverage.not_applicable).toBe(sums.not_applicable)
  263 |     expect(coverage.authoritative).toBeLessThanOrEqual(coverage.eligible)
  264 |     for (const warning of coverage.warnings ?? []) {
  265 |       expect(typeof warning.code).toBe("string")
  266 |       expect(typeof warning.message).toBe("string")
  267 |       expect(warning.count).toBeGreaterThan(0)
  268 |     }
  269 |     report("contract-consistency", {
  270 |       classified: sums.eligible + sums.unknown + sums.not_applicable,
  271 |       nodes: summary.nodes,
  272 |       warnings: (coverage.warnings ?? []).map(warning => `${warning.code}(${warning.lane}:${warning.count})`),
  273 |       projection: coverage.projection ?? null,
  274 |       rejected_edges: coverage.rejected_edges ?? null,
  275 |     })
  276 |   })
  277 | 
  278 |   test("estate map on the deployed frontend: lanes, NAT chips, ALB band, coverage pill", async ({ context, page }) => {
  279 |     test.setTimeout(300_000)
  280 |     await seedAuthCookie(context)
  281 |     await page.setViewportSize({ width: 1600, height: 900 })
  282 |     const pageErrors: string[] = []
  283 |     page.on("pageerror", error => pageErrors.push(String(error.message ?? error)))
  284 |     // Assigned from a response listener: an object property, not a `let`, so
  285 |     // control-flow analysis does not narrow it to null at the read sites.
  286 |     const captured: { payload: TopologyRisk | null } = { payload: null }
  287 |     // The product-scope gate (organization roster, account options, scoped
  288 |     // systems catalog) decides whether the map mounts at all; record what each
  289 |     // of those calls answered so a blocked page comes with its cause.
  290 |     const gate: Array<{ path: string; status: number; body: string }> = []
  291 |     page.on("response", async response => {
  292 |       const url = new URL(response.url())
  293 |       const isGate =
  294 |         url.pathname === "/api/proxy/admin/customers" ||
  295 |         url.pathname === "/api/proxy/admin/accounts/scope/options/all" ||
  296 |         url.pathname === "/api/proxy/systems" ||
  297 |         url.pathname.startsWith("/api/proxy/topology-risk/")
  298 |       if (isGate) {
  299 |         let body = ""
  300 |         try {
  301 |           body = (await response.text()).slice(0, 400)
  302 |         } catch {
  303 |           body = "<unreadable>"
  304 |         }
  305 |         gate.push({ path: url.pathname + url.search, status: response.status(), body })
  306 |       }
  307 |       if (
  308 |         url.pathname.startsWith("/api/proxy/topology-risk/") &&
  309 |         response.request().method() === "GET" &&
  310 |         response.status() === 200
  311 |       ) {
  312 |         try {
  313 |           captured.payload = (await response.json()) as TopologyRisk
  314 |         } catch {
  315 |           // a non-JSON body is reported below as a missing payload
  316 |         }
  317 |       }
  318 |     })
  319 | 
  320 |     // Cold reads are the norm here, not an error: the proxy's cache key
  321 |     // carries the page's scope (customer_id and friends), so the map's own
  322 |     // read is uncached even after an unscoped probe, and an uncached
  323 |     // topology-risk on C1 runs close to the proxy's 55s ceiling. The first
  324 |     // load therefore both fills that scoped cache and, if it times out,
  325 |     // leaves the page on its "Preparing …" / "unavailable" state. Reload and
  326 |     // wait again — the same thing an operator does — and report how many
  327 |     // loads it took.
  328 |     const mapTab = page.getByTestId("topology-estate-view-map")
  329 |     // "Preparing <system>" / "Building estate map" is the LOADING card, not a
  330 |     // blocked state: matching it as success made every load return at once
  331 |     // (run 33675359540). It is a signal to keep waiting. The timeout card
  332 |     // ("Estate map temporarily unavailable") is a real refusal.
  333 |     const blocked = page.getByText(
  334 |       /Topology risk unavailable|No systems available yet|Estate map temporarily unavailable/i,
  335 |     )
  336 |     const loads: Array<{ attempt: number; mounted: boolean; reason: string | null; ms: number }> = []
  337 |     let mounted = false
  338 |     for (let attempt = 1; attempt <= 3 && !mounted; attempt += 1) {
  339 |       const t0 = Date.now()
  340 |       await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
> 341 |       await expect(mapTab.or(blocked).first()).toBeVisible({ timeout: 120_000 })
      |                                                ^ Error: expect(locator).toBeVisible() failed
  342 |       mounted = await mapTab.isVisible().catch(() => false)
  343 |       const reason = mounted
  344 |         ? null
  345 |         : ((await blocked.first().textContent().catch(() => null)) ?? "").replace(/\s+/g, " ").trim()
  346 |       loads.push({ attempt, mounted, reason, ms: Date.now() - t0 })
  347 |       if (!mounted && attempt < 3) await page.waitForTimeout(8_000)
  348 |     }
  349 |     report("estate-page", { mounted, loads, gate })
  350 |     if (!mounted) {
  351 |       await shot(page, "c1-estate-blocked")
  352 |       throw new Error(`estate map did not mount after ${loads.length} loads: ${loads[loads.length - 1]?.reason}`)
  353 |     }
  354 |     await page.getByRole("tab", { name: "Network topology" }).click()
  355 |     const dependencies = page
  356 |       .getByTestId("topology-flow-mode-toggle")
  357 |       .getByRole("button", { name: "Dependencies" })
  358 |       .first()
  359 |     await dependencies.click()
  360 |     await expect(dependencies).toHaveAttribute("aria-pressed", "true")
  361 |     await page.waitForTimeout(1500)
  362 |     await shot(page, "c1-estate-embedded")
  363 | 
  364 |     const vpcOptions = await page
  365 |       .getByTestId("topology-vpc-select")
  366 |       .locator("option")
  367 |       .allTextContents()
  368 |       .catch(() => [] as string[])
  369 |     report("scope-gate", gate)
  370 |     report("embedded", {
  371 |       vpc_options: vpcOptions,
  372 |       authority_banner: await bannerText(page, "page"),
  373 |       coverage_pill: await readPill(page, "page"),
  374 |       payload_captured: Boolean(captured.payload),
  375 |       ...(await measureEmbeddedLegibility(page)),
  376 |     })
  377 | 
  378 |     // Fullscreen — Glance first (the default), then Inventory (one icon per node).
  379 |     await page.getByTestId("topology-estate-map-enlarge").click()
  380 |     const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  381 |     await expect(fullscreen).toBeVisible()
  382 |     await page.waitForTimeout(1500)
  383 |     await shot(page, "c1-fullscreen-glance")
  384 |     const glance = await measureFullscreen(page)
  385 |     report("fullscreen-glance", { ...glance, header_overlaps: await railHeaderBadgeOverlaps(page) })
  386 | 
  387 |     await fullscreen.getByTestId("topology-estate-density-fs-inventory").click()
  388 |     await page.waitForTimeout(1500)
  389 |     await shot(page, "c1-fullscreen-inventory")
  390 |     const inventory = await measureFullscreen(page)
  391 |     const overlaps = await railHeaderBadgeOverlaps(page)
  392 |     const pill = await readPill(page, "fullscreen")
  393 |     report("fullscreen-inventory", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  394 |     await attachJson("fullscreen-inventory.json", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  395 | 
  396 |     // --- Assertions. Soft where the graph's shape decides what is present.
  397 |     const overlapping = overlaps.filter(o => {
  398 |       const depth = Math.min(o.badge.b, o.headerBox.b) - Math.max(o.badge.t, o.headerBox.t)
  399 |       return depth > 1
  400 |     })
  401 |     expect.soft(overlapping, "no flow label paints over a rail header (touches ≤ 1px are reported, not failed)").toEqual([])
  402 |     for (const lane of ["serverless", "regional"] as const) {
  403 |       const measured = inventory.lanes[lane]
  404 |       if (!measured || !inventory.rail) continue
  405 |       expect.soft(measured.header.t, `${lane} header inside the rail`).toBeGreaterThanOrEqual(inventory.rail.t - 1)
  406 |       expect.soft(measured.header.b, `${lane} header inside the rail`).toBeLessThanOrEqual(inventory.rail.b + 1)
  407 |       expect.soft(measured.header.b, `${lane} header inside the viewport`).toBeLessThanOrEqual(inventory.viewport.h)
  408 |       expect.soft(measured.overflowY, `${lane} lane body owns its scroll`).toBe("auto")
  409 |       if (measured.scrollHeight > measured.clientHeight + 4) {
  410 |         expect.soft(measured.more_pill, `${lane} fold footer counts the chips below`).toBe(`+${measured.below} more ↓`)
  411 |       } else {
  412 |         expect.soft(measured.more_pill, `${lane} has no fold footer without overflow`).toBeNull()
  413 |       }
  414 |     }
  415 |     if (inventory.alb_band && inventory.az_headers) {
  416 |       expect.soft(inventory.alb_band.b, "load balancer band above the AZ headers").toBeLessThanOrEqual(inventory.az_headers.t + 1)
  417 |     }
  418 |     for (const nat of inventory.nat) {
  419 |       if (nat.placement === "subnet") expect.soft(nat.in_subnet_cell, `NAT ${nat.id} pinned inside a subnet cell`).toBe(true)
  420 |       else expect.soft(nat.in_fallback, `NAT ${nat.id} on the labelled fallback strip`).toBe(true)
  421 |     }
  422 |     const payload = captured.payload
  423 |     const payloadNats = payload?.vpc_topology?.edges?.nat_gws ?? []
  424 |     if (payload) {
  425 |       expect.soft(inventory.nat.length, "every NAT gateway of the payload is drawn once").toBe(payloadNats.length)
  426 |     }
  427 | 
  428 |     // Coverage pill: exactly the payload's numbers, or absent when the payload has none.
  429 |     const coverage = payload?.traffic_authority?.lane_coverage ?? null
  430 |     if (coverage) {
  431 |       expect.soft(pill, "coverage pill rendered for a payload with lane_coverage").not.toBeNull()
  432 |       if (pill) {
  433 |         expect.soft(pill.state, "pill state").toBe(coverage.state ?? null)
  434 |         expect.soft(pill.totals, "pill totals").toBe(expectedTotalsText(coverage))
  435 |         for (const lane of COVERAGE_LANES) {
  436 |           const counts = coverage.by_lane?.[lane]
  437 |           const chip = pill.lanes.find(entry => entry.testid === `topology-lane-coverage-${lane}`)
  438 |           if (!counts || counts.state === "empty") expect.soft(chip, `${lane} chip absent for an empty lane`).toBeUndefined()
  439 |           else expect.soft(chip?.state, `${lane} chip state`).toBe(counts.state)
  440 |         }
  441 |         expect.soft(pill.warnings.map(warning => warning.code), "warnings, in the backend's order").toEqual(
```