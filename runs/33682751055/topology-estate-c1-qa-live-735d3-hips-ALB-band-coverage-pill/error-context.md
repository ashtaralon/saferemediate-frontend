# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-c1-qa-live.spec.ts >> C1 live QA — estate map against the deployed graph >> estate map on the deployed frontend: lanes, NAT chips, ALB band, coverage pill
- Location: tests/integration/topology-estate-c1-qa-live.spec.ts:251:7

# Error details

```
Error: estate map did not mount after 3 loads: No systems available yet. Run a sync, then open a system from the dashboard.
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
  226 |       expect(counts.authoritative, `${lane}: authoritative ≤ eligible`).toBeLessThanOrEqual(counts.eligible)
  227 |       sums.eligible += counts.eligible
  228 |       sums.authoritative += counts.authoritative
  229 |       sums.unknown += counts.unknown
  230 |       sums.not_applicable += counts.not_applicable
  231 |     }
  232 |     expect(coverage.eligible).toBe(sums.eligible)
  233 |     expect(coverage.authoritative).toBe(sums.authoritative)
  234 |     expect(coverage.unknown).toBe(sums.unknown)
  235 |     expect(coverage.not_applicable).toBe(sums.not_applicable)
  236 |     expect(coverage.authoritative).toBeLessThanOrEqual(coverage.eligible)
  237 |     for (const warning of coverage.warnings ?? []) {
  238 |       expect(typeof warning.code).toBe("string")
  239 |       expect(typeof warning.message).toBe("string")
  240 |       expect(warning.count).toBeGreaterThan(0)
  241 |     }
  242 |     report("contract-consistency", {
  243 |       classified: sums.eligible + sums.unknown + sums.not_applicable,
  244 |       nodes: summary.nodes,
  245 |       warnings: (coverage.warnings ?? []).map(warning => `${warning.code}(${warning.lane}:${warning.count})`),
  246 |       projection: coverage.projection ?? null,
  247 |       rejected_edges: coverage.rejected_edges ?? null,
  248 |     })
  249 |   })
  250 | 
  251 |   test("estate map on the deployed frontend: lanes, NAT chips, ALB band, coverage pill", async ({ context, page }) => {
  252 |     // The first uncached topology read on C1 takes ~54s and this test drives
  253 |     // three probes plus a scroll phase after it; 300s left no headroom and the
  254 |     // run died mid-phase with its measurements already taken (run 33681801338).
  255 |     test.setTimeout(600_000)
  256 |     await seedAuthCookie(context)
  257 |     await page.setViewportSize({ width: 1600, height: 900 })
  258 |     const pageErrors: string[] = []
  259 |     page.on("pageerror", error => pageErrors.push(String(error.message ?? error)))
  260 |     // Assigned from a response listener: an object property, not a `let`, so
  261 |     // control-flow analysis does not narrow it to null at the read sites.
  262 |     const captured: { payload: TopologyRisk | null } = { payload: null }
  263 |     // The product-scope gate (organization roster, account options, scoped
  264 |     // systems catalog) decides whether the map mounts at all; record what each
  265 |     // of those calls answered so a blocked page comes with its cause.
  266 |     const gate: Array<{ path: string; status: number; body: string }> = []
  267 |     page.on("response", async response => {
  268 |       const url = new URL(response.url())
  269 |       const isGate =
  270 |         url.pathname === "/api/proxy/admin/customers" ||
  271 |         url.pathname === "/api/proxy/admin/accounts/scope/options/all" ||
  272 |         url.pathname === "/api/proxy/systems" ||
  273 |         url.pathname.startsWith("/api/proxy/topology-risk/")
  274 |       if (isGate) {
  275 |         let body = ""
  276 |         try {
  277 |           body = (await response.text()).slice(0, 400)
  278 |         } catch {
  279 |           body = "<unreadable>"
  280 |         }
  281 |         gate.push({ path: url.pathname + url.search, status: response.status(), body })
  282 |       }
  283 |       if (
  284 |         url.pathname.startsWith("/api/proxy/topology-risk/") &&
  285 |         response.request().method() === "GET" &&
  286 |         response.status() === 200
  287 |       ) {
  288 |         try {
  289 |           captured.payload = (await response.json()) as TopologyRisk
  290 |         } catch {
  291 |           // a non-JSON body is reported below as a missing payload
  292 |         }
  293 |       }
  294 |     })
  295 | 
  296 |     // Cold reads are the norm here, not an error: the proxy's cache key
  297 |     // carries the page's scope (customer_id and friends), so the map's own
  298 |     // read is uncached even after an unscoped probe, and an uncached
  299 |     // topology-risk on C1 runs close to the proxy's 55s ceiling. The first
  300 |     // load therefore both fills that scoped cache and, if it times out,
  301 |     // leaves the page on its "Preparing …" / "unavailable" state. Reload and
  302 |     // wait again — the same thing an operator does — and report how many
  303 |     // loads it took.
  304 |     const mapTab = page.getByTestId("topology-estate-view-map")
  305 |     // "Preparing <system>" is the map's LOADING card, not a blocked state:
  306 |     // matching it here made every load return at once and the probe spent its
  307 |     // three attempts in a minute without ever waiting for the map (run
  308 |     // 33675359540). Only a real refusal short-circuits the wait.
  309 |     const blocked = page.getByText(/Topology risk unavailable|No systems available yet/i)
  310 |     const loads: Array<{ attempt: number; mounted: boolean; reason: string | null; ms: number }> = []
  311 |     let mounted = false
  312 |     for (let attempt = 1; attempt <= 3 && !mounted; attempt += 1) {
  313 |       const t0 = Date.now()
  314 |       await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  315 |       await expect(mapTab.or(blocked).first()).toBeVisible({ timeout: 150_000 })
  316 |       mounted = await mapTab.isVisible().catch(() => false)
  317 |       const reason = mounted
  318 |         ? null
  319 |         : ((await blocked.first().textContent().catch(() => null)) ?? "").replace(/\s+/g, " ").trim()
  320 |       loads.push({ attempt, mounted, reason, ms: Date.now() - t0 })
  321 |       if (!mounted && attempt < 3) await page.waitForTimeout(20_000)
  322 |     }
  323 |     report("estate-page", { mounted, loads, gate })
  324 |     if (!mounted) {
  325 |       await shot(page, "c1-estate-blocked")
> 326 |       throw new Error(`estate map did not mount after ${loads.length} loads: ${loads[loads.length - 1]?.reason}`)
      |             ^ Error: estate map did not mount after 3 loads: No systems available yet. Run a sync, then open a system from the dashboard.
  327 |     }
  328 |     await page.getByRole("tab", { name: "Network topology" }).click()
  329 |     const dependencies = page
  330 |       .getByTestId("topology-flow-mode-toggle")
  331 |       .getByRole("button", { name: "Dependencies" })
  332 |       .first()
  333 |     await dependencies.click()
  334 |     await expect(dependencies).toHaveAttribute("aria-pressed", "true")
  335 |     await page.waitForTimeout(1500)
  336 |     await shot(page, "c1-estate-embedded")
  337 | 
  338 |     const vpcOptions = await page
  339 |       .getByTestId("topology-vpc-select")
  340 |       .locator("option")
  341 |       .allTextContents()
  342 |       .catch(() => [] as string[])
  343 |     report("scope-gate", gate)
  344 |     report("embedded", {
  345 |       vpc_options: vpcOptions,
  346 |       authority_banner: await bannerText(page, "page"),
  347 |       coverage_pill: await readPill(page, "page"),
  348 |       payload_captured: Boolean(captured.payload),
  349 |       ...(await measureEmbeddedLegibility(page)),
  350 |     })
  351 | 
  352 |     // Fullscreen — Glance first (the default), then Inventory (one icon per node).
  353 |     await page.getByTestId("topology-estate-map-enlarge").click()
  354 |     const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  355 |     await expect(fullscreen).toBeVisible()
  356 |     await page.waitForTimeout(1500)
  357 |     await shot(page, "c1-fullscreen-glance")
  358 |     const glance = await measureFullscreen(page)
  359 |     report("fullscreen-glance", { ...glance, header_overlaps: await railHeaderBadgeOverlaps(page) })
  360 | 
  361 |     await fullscreen.getByTestId("topology-estate-density-fs-inventory").click()
  362 |     await page.waitForTimeout(1500)
  363 |     await shot(page, "c1-fullscreen-inventory")
  364 |     const inventory = await measureFullscreen(page)
  365 |     const overlaps = await railHeaderBadgeOverlaps(page)
  366 |     const pill = await readPill(page, "fullscreen")
  367 |     report("fullscreen-inventory", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  368 |     await attachJson("fullscreen-inventory.json", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  369 | 
  370 |     // --- Assertions. Soft where the graph's shape decides what is present.
  371 |     const overlapping = overlaps.filter(o => {
  372 |       const depth = Math.min(o.badge.b, o.headerBox.b) - Math.max(o.badge.t, o.headerBox.t)
  373 |       return depth > 1
  374 |     })
  375 |     expect.soft(overlapping, "no flow label paints over a rail header (touches ≤ 1px are reported, not failed)").toEqual([])
  376 |     for (const lane of ["serverless", "regional"] as const) {
  377 |       const measured = inventory.lanes[lane]
  378 |       if (!measured || !inventory.rail) continue
  379 |       expect.soft(measured.header.t, `${lane} header inside the rail`).toBeGreaterThanOrEqual(inventory.rail.t - 1)
  380 |       expect.soft(measured.header.b, `${lane} header inside the rail`).toBeLessThanOrEqual(inventory.rail.b + 1)
  381 |       expect.soft(measured.header.b, `${lane} header inside the viewport`).toBeLessThanOrEqual(inventory.viewport.h)
  382 |       expect.soft(measured.overflowY, `${lane} lane body owns its scroll`).toBe("auto")
  383 |       if (measured.scrollHeight > measured.clientHeight + 4) {
  384 |         expect.soft(measured.more_pill, `${lane} fold footer counts the chips below`).toBe(`+${measured.below} more ↓`)
  385 |       } else {
  386 |         expect.soft(measured.more_pill, `${lane} has no fold footer without overflow`).toBeNull()
  387 |       }
  388 |     }
  389 |     if (inventory.alb_band && inventory.az_headers) {
  390 |       expect.soft(inventory.alb_band.b, "load balancer band above the AZ headers").toBeLessThanOrEqual(inventory.az_headers.t + 1)
  391 |     }
  392 |     for (const nat of inventory.nat) {
  393 |       if (nat.placement === "subnet") expect.soft(nat.in_subnet_cell, `NAT ${nat.id} pinned inside a subnet cell`).toBe(true)
  394 |       else expect.soft(nat.in_fallback, `NAT ${nat.id} on the labelled fallback strip`).toBe(true)
  395 |     }
  396 |     const payload = captured.payload
  397 |     const payloadNats = payload?.vpc_topology?.edges?.nat_gws ?? []
  398 |     if (payload) {
  399 |       expect.soft(inventory.nat.length, "every NAT gateway of the payload is drawn once").toBe(payloadNats.length)
  400 |     }
  401 | 
  402 |     // Coverage pill: exactly the payload's numbers, or absent when the payload has none.
  403 |     const coverage = payload?.traffic_authority?.lane_coverage ?? null
  404 |     if (coverage) {
  405 |       expect.soft(pill, "coverage pill rendered for a payload with lane_coverage").not.toBeNull()
  406 |       if (pill) {
  407 |         expect.soft(pill.state, "pill state").toBe(coverage.state ?? null)
  408 |         expect.soft(pill.totals, "pill totals").toBe(expectedTotalsText(coverage))
  409 |         for (const lane of COVERAGE_LANES) {
  410 |           const counts = coverage.by_lane?.[lane]
  411 |           const chip = pill.lanes.find(entry => entry.testid === `topology-lane-coverage-${lane}`)
  412 |           if (!counts || counts.state === "empty") expect.soft(chip, `${lane} chip absent for an empty lane`).toBeUndefined()
  413 |           else expect.soft(chip?.state, `${lane} chip state`).toBe(counts.state)
  414 |         }
  415 |         expect.soft(pill.warnings.map(warning => warning.code), "warnings, in the backend's order").toEqual(
  416 |           (coverage.warnings ?? []).map(warning => warning.code),
  417 |         )
  418 |       }
  419 |     } else {
  420 |       expect.soft(pill, "no coverage pill without lane_coverage in the payload").toBeNull()
  421 |     }
  422 | 
  423 |     // Scroll the Lambda lane when it overflows: the last chip must land inside
  424 |     // a lane body that is at least one chip tall, with both fold pills up.
  425 |     const serverless = inventory.lanes.serverless
  426 |     if (serverless && serverless.scrollHeight > serverless.clientHeight + 4) {
```