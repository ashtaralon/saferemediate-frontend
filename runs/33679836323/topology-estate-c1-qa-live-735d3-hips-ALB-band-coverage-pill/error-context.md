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
  223 |       expect(counts, `by_lane.${lane}`).toBeTruthy()
  224 |       if (!counts) continue
  225 |       expect(COVERAGE_STATES.has(counts.state), `${lane}.state`).toBe(true)
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
  252 |     test.setTimeout(300_000)
  253 |     await seedAuthCookie(context)
  254 |     await page.setViewportSize({ width: 1600, height: 900 })
  255 |     const pageErrors: string[] = []
  256 |     page.on("pageerror", error => pageErrors.push(String(error.message ?? error)))
  257 |     // Assigned from a response listener: an object property, not a `let`, so
  258 |     // control-flow analysis does not narrow it to null at the read sites.
  259 |     const captured: { payload: TopologyRisk | null } = { payload: null }
  260 |     // The product-scope gate (organization roster, account options, scoped
  261 |     // systems catalog) decides whether the map mounts at all; record what each
  262 |     // of those calls answered so a blocked page comes with its cause.
  263 |     const gate: Array<{ path: string; status: number; body: string }> = []
  264 |     page.on("response", async response => {
  265 |       const url = new URL(response.url())
  266 |       const isGate =
  267 |         url.pathname === "/api/proxy/admin/customers" ||
  268 |         url.pathname === "/api/proxy/admin/accounts/scope/options/all" ||
  269 |         url.pathname === "/api/proxy/systems" ||
  270 |         url.pathname.startsWith("/api/proxy/topology-risk/")
  271 |       if (isGate) {
  272 |         let body = ""
  273 |         try {
  274 |           body = (await response.text()).slice(0, 400)
  275 |         } catch {
  276 |           body = "<unreadable>"
  277 |         }
  278 |         gate.push({ path: url.pathname + url.search, status: response.status(), body })
  279 |       }
  280 |       if (
  281 |         url.pathname.startsWith("/api/proxy/topology-risk/") &&
  282 |         response.request().method() === "GET" &&
  283 |         response.status() === 200
  284 |       ) {
  285 |         try {
  286 |           captured.payload = (await response.json()) as TopologyRisk
  287 |         } catch {
  288 |           // a non-JSON body is reported below as a missing payload
  289 |         }
  290 |       }
  291 |     })
  292 | 
  293 |     // Cold reads are the norm here, not an error: the proxy's cache key
  294 |     // carries the page's scope (customer_id and friends), so the map's own
  295 |     // read is uncached even after an unscoped probe, and an uncached
  296 |     // topology-risk on C1 runs close to the proxy's 55s ceiling. The first
  297 |     // load therefore both fills that scoped cache and, if it times out,
  298 |     // leaves the page on its "Preparing …" / "unavailable" state. Reload and
  299 |     // wait again — the same thing an operator does — and report how many
  300 |     // loads it took.
  301 |     const mapTab = page.getByTestId("topology-estate-view-map")
  302 |     // "Preparing <system>" is the map's LOADING card, not a blocked state:
  303 |     // matching it here made every load return at once and the probe spent its
  304 |     // three attempts in a minute without ever waiting for the map (run
  305 |     // 33675359540). Only a real refusal short-circuits the wait.
  306 |     const blocked = page.getByText(/Topology risk unavailable|No systems available yet/i)
  307 |     const loads: Array<{ attempt: number; mounted: boolean; reason: string | null; ms: number }> = []
  308 |     let mounted = false
  309 |     for (let attempt = 1; attempt <= 3 && !mounted; attempt += 1) {
  310 |       const t0 = Date.now()
  311 |       await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  312 |       await expect(mapTab.or(blocked).first()).toBeVisible({ timeout: 150_000 })
  313 |       mounted = await mapTab.isVisible().catch(() => false)
  314 |       const reason = mounted
  315 |         ? null
  316 |         : ((await blocked.first().textContent().catch(() => null)) ?? "").replace(/\s+/g, " ").trim()
  317 |       loads.push({ attempt, mounted, reason, ms: Date.now() - t0 })
  318 |       if (!mounted && attempt < 3) await page.waitForTimeout(20_000)
  319 |     }
  320 |     report("estate-page", { mounted, loads, gate })
  321 |     if (!mounted) {
  322 |       await shot(page, "c1-estate-blocked")
> 323 |       throw new Error(`estate map did not mount after ${loads.length} loads: ${loads[loads.length - 1]?.reason}`)
      |             ^ Error: estate map did not mount after 3 loads: No systems available yet. Run a sync, then open a system from the dashboard.
  324 |     }
  325 |     await page.getByRole("tab", { name: "Network topology" }).click()
  326 |     const dependencies = page
  327 |       .getByTestId("topology-flow-mode-toggle")
  328 |       .getByRole("button", { name: "Dependencies" })
  329 |       .first()
  330 |     await dependencies.click()
  331 |     await expect(dependencies).toHaveAttribute("aria-pressed", "true")
  332 |     await page.waitForTimeout(1500)
  333 |     await shot(page, "c1-estate-embedded")
  334 | 
  335 |     const vpcOptions = await page
  336 |       .getByTestId("topology-vpc-select")
  337 |       .locator("option")
  338 |       .allTextContents()
  339 |       .catch(() => [] as string[])
  340 |     report("scope-gate", gate)
  341 |     report("embedded", {
  342 |       vpc_options: vpcOptions,
  343 |       authority_banner: await bannerText(page, "page"),
  344 |       coverage_pill: await readPill(page, "page"),
  345 |       payload_captured: Boolean(captured.payload),
  346 |       ...(await measureEmbeddedLegibility(page)),
  347 |     })
  348 | 
  349 |     // Fullscreen — Glance first (the default), then Inventory (one icon per node).
  350 |     await page.getByTestId("topology-estate-map-enlarge").click()
  351 |     const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  352 |     await expect(fullscreen).toBeVisible()
  353 |     await page.waitForTimeout(1500)
  354 |     await shot(page, "c1-fullscreen-glance")
  355 |     const glance = await measureFullscreen(page)
  356 |     report("fullscreen-glance", { ...glance, header_overlaps: await railHeaderBadgeOverlaps(page) })
  357 | 
  358 |     await fullscreen.getByTestId("topology-estate-density-fs-inventory").click()
  359 |     await page.waitForTimeout(1500)
  360 |     await shot(page, "c1-fullscreen-inventory")
  361 |     const inventory = await measureFullscreen(page)
  362 |     const overlaps = await railHeaderBadgeOverlaps(page)
  363 |     const pill = await readPill(page, "fullscreen")
  364 |     report("fullscreen-inventory", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  365 |     await attachJson("fullscreen-inventory.json", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  366 | 
  367 |     // --- Assertions. Soft where the graph's shape decides what is present.
  368 |     const overlapping = overlaps.filter(o => {
  369 |       const depth = Math.min(o.badge.b, o.headerBox.b) - Math.max(o.badge.t, o.headerBox.t)
  370 |       return depth > 1
  371 |     })
  372 |     expect.soft(overlapping, "no flow label paints over a rail header (touches ≤ 1px are reported, not failed)").toEqual([])
  373 |     for (const lane of ["serverless", "regional"] as const) {
  374 |       const measured = inventory.lanes[lane]
  375 |       if (!measured || !inventory.rail) continue
  376 |       expect.soft(measured.header.t, `${lane} header inside the rail`).toBeGreaterThanOrEqual(inventory.rail.t - 1)
  377 |       expect.soft(measured.header.b, `${lane} header inside the rail`).toBeLessThanOrEqual(inventory.rail.b + 1)
  378 |       expect.soft(measured.header.b, `${lane} header inside the viewport`).toBeLessThanOrEqual(inventory.viewport.h)
  379 |       expect.soft(measured.overflowY, `${lane} lane body owns its scroll`).toBe("auto")
  380 |       if (measured.scrollHeight > measured.clientHeight + 4) {
  381 |         expect.soft(measured.more_pill, `${lane} fold footer counts the chips below`).toBe(`+${measured.below} more ↓`)
  382 |       } else {
  383 |         expect.soft(measured.more_pill, `${lane} has no fold footer without overflow`).toBeNull()
  384 |       }
  385 |     }
  386 |     if (inventory.alb_band && inventory.az_headers) {
  387 |       expect.soft(inventory.alb_band.b, "load balancer band above the AZ headers").toBeLessThanOrEqual(inventory.az_headers.t + 1)
  388 |     }
  389 |     for (const nat of inventory.nat) {
  390 |       if (nat.placement === "subnet") expect.soft(nat.in_subnet_cell, `NAT ${nat.id} pinned inside a subnet cell`).toBe(true)
  391 |       else expect.soft(nat.in_fallback, `NAT ${nat.id} on the labelled fallback strip`).toBe(true)
  392 |     }
  393 |     const payload = captured.payload
  394 |     const payloadNats = payload?.vpc_topology?.edges?.nat_gws ?? []
  395 |     if (payload) {
  396 |       expect.soft(inventory.nat.length, "every NAT gateway of the payload is drawn once").toBe(payloadNats.length)
  397 |     }
  398 | 
  399 |     // Coverage pill: exactly the payload's numbers, or absent when the payload has none.
  400 |     const coverage = payload?.traffic_authority?.lane_coverage ?? null
  401 |     if (coverage) {
  402 |       expect.soft(pill, "coverage pill rendered for a payload with lane_coverage").not.toBeNull()
  403 |       if (pill) {
  404 |         expect.soft(pill.state, "pill state").toBe(coverage.state ?? null)
  405 |         expect.soft(pill.totals, "pill totals").toBe(expectedTotalsText(coverage))
  406 |         for (const lane of COVERAGE_LANES) {
  407 |           const counts = coverage.by_lane?.[lane]
  408 |           const chip = pill.lanes.find(entry => entry.testid === `topology-lane-coverage-${lane}`)
  409 |           if (!counts || counts.state === "empty") expect.soft(chip, `${lane} chip absent for an empty lane`).toBeUndefined()
  410 |           else expect.soft(chip?.state, `${lane} chip state`).toBe(counts.state)
  411 |         }
  412 |         expect.soft(pill.warnings.map(warning => warning.code), "warnings, in the backend's order").toEqual(
  413 |           (coverage.warnings ?? []).map(warning => warning.code),
  414 |         )
  415 |       }
  416 |     } else {
  417 |       expect.soft(pill, "no coverage pill without lane_coverage in the payload").toBeNull()
  418 |     }
  419 | 
  420 |     // Scroll the Lambda lane when it overflows: the last chip must land inside
  421 |     // a lane body that is at least one chip tall, with both fold pills up.
  422 |     const serverless = inventory.lanes.serverless
  423 |     if (serverless && serverless.scrollHeight > serverless.clientHeight + 4) {
```