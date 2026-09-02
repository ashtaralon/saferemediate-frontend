# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-c1-qa-live.spec.ts >> C1 live QA — estate map against the deployed graph >> estate map on the deployed frontend: lanes, NAT chips, ALB band, coverage pill
- Location: tests/integration/topology-estate-c1-qa-live.spec.ts:251:7

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
  201 |     const summary = summarizeTopology(body)
  202 |     report("topology-risk", summary)
  203 |     await attachJson("topology-risk-summary.json", summary)
  204 |     await request.dispose()
  205 | 
  206 |     expect(body.system).toBe(SYSTEM)
  207 |     expect(summary.nodes).toBeGreaterThan(0)
  208 | 
  209 |     const coverage = body.traffic_authority?.lane_coverage ?? null
  210 |     report("contract", {
  211 |       lane_coverage_present: Boolean(coverage),
  212 |       authority_state: body.traffic_authority?.state ?? null,
  213 |       active_generation: body.traffic_authority?.active_generation ?? null,
  214 |     })
  215 |     if (!coverage) return // backend predates topology-risk/v8: nothing to check, and the pill must be absent (probe 2)
  216 | 
  217 |     // Internal consistency of the contract, independent of what the graph holds.
  218 |     expect(coverage.basis).toBe("vpc_flow_logs")
  219 |     expect(COVERAGE_STATES.has(String(coverage.state))).toBe(true)
  220 |     const sums = { eligible: 0, authoritative: 0, unknown: 0, not_applicable: 0 }
  221 |     for (const lane of COVERAGE_LANES) {
  222 |       const counts = coverage.by_lane?.[lane]
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
  293 |     await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  294 |     const mapTab = page.getByTestId("topology-estate-view-map")
  295 |     const blocked = page.getByText(/Topology risk unavailable|No systems available yet/i)
  296 |     await expect(mapTab.or(blocked).first()).toBeVisible({ timeout: 120_000 })
  297 |     if (!(await mapTab.isVisible().catch(() => false))) {
  298 |       const reason = ((await blocked.first().textContent().catch(() => null)) ?? "").replace(/\s+/g, " ").trim()
  299 |       report("estate-page", { mounted: false, reason, gate })
  300 |       await shot(page, "c1-estate-blocked")
> 301 |       throw new Error(`estate map did not mount: ${reason}`)
      |             ^ Error: estate map did not mount: No systems available yet. Run a sync, then open a system from the dashboard.
  302 |     }
  303 |     await page.getByRole("tab", { name: "Network topology" }).click()
  304 |     const dependencies = page
  305 |       .getByTestId("topology-flow-mode-toggle")
  306 |       .getByRole("button", { name: "Dependencies" })
  307 |       .first()
  308 |     await dependencies.click()
  309 |     await expect(dependencies).toHaveAttribute("aria-pressed", "true")
  310 |     await page.waitForTimeout(1500)
  311 |     await shot(page, "c1-estate-embedded")
  312 | 
  313 |     const vpcOptions = await page
  314 |       .getByTestId("topology-vpc-select")
  315 |       .locator("option")
  316 |       .allTextContents()
  317 |       .catch(() => [] as string[])
  318 |     report("scope-gate", gate)
  319 |     report("embedded", {
  320 |       vpc_options: vpcOptions,
  321 |       authority_banner: await bannerText(page, "page"),
  322 |       coverage_pill: await readPill(page, "page"),
  323 |       payload_captured: Boolean(captured.payload),
  324 |       ...(await measureEmbeddedLegibility(page)),
  325 |     })
  326 | 
  327 |     // Fullscreen — Glance first (the default), then Inventory (one icon per node).
  328 |     await page.getByTestId("topology-estate-map-enlarge").click()
  329 |     const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  330 |     await expect(fullscreen).toBeVisible()
  331 |     await page.waitForTimeout(1500)
  332 |     await shot(page, "c1-fullscreen-glance")
  333 |     const glance = await measureFullscreen(page)
  334 |     report("fullscreen-glance", { ...glance, header_overlaps: await railHeaderBadgeOverlaps(page) })
  335 | 
  336 |     await fullscreen.getByTestId("topology-estate-density-fs-inventory").click()
  337 |     await page.waitForTimeout(1500)
  338 |     await shot(page, "c1-fullscreen-inventory")
  339 |     const inventory = await measureFullscreen(page)
  340 |     const overlaps = await railHeaderBadgeOverlaps(page)
  341 |     const pill = await readPill(page, "fullscreen")
  342 |     report("fullscreen-inventory", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  343 |     await attachJson("fullscreen-inventory.json", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  344 | 
  345 |     // --- Assertions. Soft where the graph's shape decides what is present.
  346 |     const overlapping = overlaps.filter(o => {
  347 |       const depth = Math.min(o.badge.b, o.headerBox.b) - Math.max(o.badge.t, o.headerBox.t)
  348 |       return depth > 1
  349 |     })
  350 |     expect.soft(overlapping, "no flow label paints over a rail header (touches ≤ 1px are reported, not failed)").toEqual([])
  351 |     for (const lane of ["serverless", "regional"] as const) {
  352 |       const measured = inventory.lanes[lane]
  353 |       if (!measured || !inventory.rail) continue
  354 |       expect.soft(measured.header.t, `${lane} header inside the rail`).toBeGreaterThanOrEqual(inventory.rail.t - 1)
  355 |       expect.soft(measured.header.b, `${lane} header inside the rail`).toBeLessThanOrEqual(inventory.rail.b + 1)
  356 |       expect.soft(measured.header.b, `${lane} header inside the viewport`).toBeLessThanOrEqual(inventory.viewport.h)
  357 |       expect.soft(measured.overflowY, `${lane} lane body owns its scroll`).toBe("auto")
  358 |       if (measured.scrollHeight > measured.clientHeight + 4) {
  359 |         expect.soft(measured.more_pill, `${lane} fold footer counts the chips below`).toBe(`+${measured.below} more ↓`)
  360 |       } else {
  361 |         expect.soft(measured.more_pill, `${lane} has no fold footer without overflow`).toBeNull()
  362 |       }
  363 |     }
  364 |     if (inventory.alb_band && inventory.az_headers) {
  365 |       expect.soft(inventory.alb_band.b, "load balancer band above the AZ headers").toBeLessThanOrEqual(inventory.az_headers.t + 1)
  366 |     }
  367 |     for (const nat of inventory.nat) {
  368 |       if (nat.placement === "subnet") expect.soft(nat.in_subnet_cell, `NAT ${nat.id} pinned inside a subnet cell`).toBe(true)
  369 |       else expect.soft(nat.in_fallback, `NAT ${nat.id} on the labelled fallback strip`).toBe(true)
  370 |     }
  371 |     const payload = captured.payload
  372 |     const payloadNats = payload?.vpc_topology?.edges?.nat_gws ?? []
  373 |     if (payload) {
  374 |       expect.soft(inventory.nat.length, "every NAT gateway of the payload is drawn once").toBe(payloadNats.length)
  375 |     }
  376 | 
  377 |     // Coverage pill: exactly the payload's numbers, or absent when the payload has none.
  378 |     const coverage = payload?.traffic_authority?.lane_coverage ?? null
  379 |     if (coverage) {
  380 |       expect.soft(pill, "coverage pill rendered for a payload with lane_coverage").not.toBeNull()
  381 |       if (pill) {
  382 |         expect.soft(pill.state, "pill state").toBe(coverage.state ?? null)
  383 |         expect.soft(pill.totals, "pill totals").toBe(expectedTotalsText(coverage))
  384 |         for (const lane of COVERAGE_LANES) {
  385 |           const counts = coverage.by_lane?.[lane]
  386 |           const chip = pill.lanes.find(entry => entry.testid === `topology-lane-coverage-${lane}`)
  387 |           if (!counts || counts.state === "empty") expect.soft(chip, `${lane} chip absent for an empty lane`).toBeUndefined()
  388 |           else expect.soft(chip?.state, `${lane} chip state`).toBe(counts.state)
  389 |         }
  390 |         expect.soft(pill.warnings.map(warning => warning.code), "warnings, in the backend's order").toEqual(
  391 |           (coverage.warnings ?? []).map(warning => warning.code),
  392 |         )
  393 |       }
  394 |     } else {
  395 |       expect.soft(pill, "no coverage pill without lane_coverage in the payload").toBeNull()
  396 |     }
  397 | 
  398 |     // Scroll the Lambda lane when it overflows: the last chip must land inside
  399 |     // a lane body that is at least one chip tall, with both fold pills up.
  400 |     const serverless = inventory.lanes.serverless
  401 |     if (serverless && serverless.scrollHeight > serverless.clientHeight + 4) {
```