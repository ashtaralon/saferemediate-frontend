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
  310 |     // Warm the page's OWN cache key first. The API probe above warms the
  311 |     // UNSCOPED read; the page asks for a scoped one, a different proxy key
  312 |     // that is therefore still cold, and an uncached C1 topology read sits
  313 |     // right at the proxy's ~55s ceiling (53.8s in run 33681801338, over it in
  314 |     // 33683706108, where the page never mounted). A warm-up that times out is
  315 |     // not wasted: the backend keeps computing its snapshot, so the next
  316 |     // attempt is faster. Cheap requests, not page loads, so a cold read costs
  317 |     // seconds of budget rather than a whole attempt.
  318 |     const warm: Array<{ attempt: number; status: number | null; ms: number }> = []
  319 |     for (let attempt = 1; attempt <= 4; attempt += 1) {
  320 |       const t0 = Date.now()
  321 |       let status: number | null = null
  322 |       try {
  323 |         const res = await page.request.get(
  324 |           `/api/proxy/topology-risk/${encodeURIComponent(SYSTEM)}?customer_id=${encodeURIComponent(SYSTEM)}`,
  325 |           { timeout: 60_000 }, // just past the proxy's ~55s ceiling
  326 |         )
  327 |         status = res.status()
  328 |       } catch {
  329 |         status = null // the proxy aborted the cold read; try again
  330 |       }
  331 |       warm.push({ attempt, status, ms: Date.now() - t0 })
  332 |       if (status === 200) break
  333 |     }
  334 |     report("scoped-cache-warm", warm)
  335 | 
  336 |     const loads: Array<{ attempt: number; mounted: boolean; reason: string | null; ms: number }> = []
  337 |     let mounted = false
  338 |     for (let attempt = 1; attempt <= 3 && !mounted; attempt += 1) {
  339 |       const t0 = Date.now()
  340 |       let reason: string | null = null
  341 |       try {
  342 |         await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 })
  343 |         await expect(mapTab.or(blocked).first()).toBeVisible({ timeout: 120_000 })
  344 |         mounted = await mapTab.isVisible().catch(() => false)
  345 |         reason = mounted
  346 |           ? null
  347 |           : ((await blocked.first().textContent({ timeout: 5_000 }).catch(() => null)) ?? "")
  348 |               .replace(/\s+/g, " ")
  349 |               .trim()
  350 |       } catch (error) {
  351 |         // A load that settles into neither the map nor a refusal is ONE failed
  352 |         // attempt, not the end of the run. It used to throw straight out of
  353 |         // the loop, so the retry this loop exists for never happened.
  354 |         reason = `load did not settle: ${(error as Error).message.split("\n")[0]}`
  355 |       }
  356 |       loads.push({ attempt, mounted, reason, ms: Date.now() - t0 })
  357 |       if (!mounted && attempt < 3) await page.waitForTimeout(15_000)
  358 |     }
  359 |     report("estate-page", { mounted, loads, gate })
  360 |     if (!mounted) {
  361 |       await shot(page, "c1-estate-blocked")
> 362 |       throw new Error(`estate map did not mount after ${loads.length} loads: ${loads[loads.length - 1]?.reason}`)
      |             ^ Error: estate map did not mount after 3 loads: No systems available yet. Run a sync, then open a system from the dashboard.
  363 |     }
  364 |     await page.getByRole("tab", { name: "Network topology" }).click()
  365 |     const dependencies = page
  366 |       .getByTestId("topology-flow-mode-toggle")
  367 |       .getByRole("button", { name: "Dependencies" })
  368 |       .first()
  369 |     await dependencies.click()
  370 |     await expect(dependencies).toHaveAttribute("aria-pressed", "true")
  371 |     await page.waitForTimeout(1500)
  372 |     await shot(page, "c1-estate-embedded")
  373 | 
  374 |     const vpcOptions = await page
  375 |       .getByTestId("topology-vpc-select")
  376 |       .locator("option")
  377 |       .allTextContents()
  378 |       .catch(() => [] as string[])
  379 |     report("scope-gate", gate)
  380 |     report("embedded", {
  381 |       vpc_options: vpcOptions,
  382 |       authority_banner: await bannerText(page, "page"),
  383 |       coverage_pill: await readPill(page, "page"),
  384 |       payload_captured: Boolean(captured.payload),
  385 |       ...(await measureEmbeddedLegibility(page)),
  386 |     })
  387 | 
  388 |     // Fullscreen — Glance first (the default), then Inventory (one icon per node).
  389 |     await page.getByTestId("topology-estate-map-enlarge").click()
  390 |     const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  391 |     await expect(fullscreen).toBeVisible()
  392 |     await page.waitForTimeout(1500)
  393 |     await shot(page, "c1-fullscreen-glance")
  394 |     const glance = await measureFullscreen(page)
  395 |     report("fullscreen-glance", { ...glance, header_overlaps: await railHeaderBadgeOverlaps(page) })
  396 | 
  397 |     await fullscreen.getByTestId("topology-estate-density-fs-inventory").click()
  398 |     await page.waitForTimeout(1500)
  399 |     await shot(page, "c1-fullscreen-inventory")
  400 |     const inventory = await measureFullscreen(page)
  401 |     const overlaps = await railHeaderBadgeOverlaps(page)
  402 |     const pill = await readPill(page, "fullscreen")
  403 |     report("fullscreen-inventory", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  404 |     await attachJson("fullscreen-inventory.json", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  405 | 
  406 |     // --- Assertions. Soft where the graph's shape decides what is present.
  407 |     const overlapping = overlaps.filter(o => {
  408 |       const depth = Math.min(o.badge.b, o.headerBox.b) - Math.max(o.badge.t, o.headerBox.t)
  409 |       return depth > 1
  410 |     })
  411 |     expect.soft(overlapping, "no flow label paints over a rail header (touches ≤ 1px are reported, not failed)").toEqual([])
  412 |     for (const lane of ["serverless", "regional"] as const) {
  413 |       const measured = inventory.lanes[lane]
  414 |       if (!measured || !inventory.rail) continue
  415 |       expect.soft(measured.header.t, `${lane} header inside the rail`).toBeGreaterThanOrEqual(inventory.rail.t - 1)
  416 |       expect.soft(measured.header.b, `${lane} header inside the rail`).toBeLessThanOrEqual(inventory.rail.b + 1)
  417 |       expect.soft(measured.header.b, `${lane} header inside the viewport`).toBeLessThanOrEqual(inventory.viewport.h)
  418 |       expect.soft(measured.overflowY, `${lane} lane body owns its scroll`).toBe("auto")
  419 |       if (measured.scrollHeight > measured.clientHeight + 4) {
  420 |         expect.soft(measured.more_pill, `${lane} fold footer counts the chips below`).toBe(`+${measured.below} more ↓`)
  421 |       } else {
  422 |         expect.soft(measured.more_pill, `${lane} has no fold footer without overflow`).toBeNull()
  423 |       }
  424 |     }
  425 |     if (inventory.alb_band && inventory.az_headers) {
  426 |       expect.soft(inventory.alb_band.b, "load balancer band above the AZ headers").toBeLessThanOrEqual(inventory.az_headers.t + 1)
  427 |     }
  428 |     for (const nat of inventory.nat) {
  429 |       if (nat.placement === "subnet") expect.soft(nat.in_subnet_cell, `NAT ${nat.id} pinned inside a subnet cell`).toBe(true)
  430 |       else expect.soft(nat.in_fallback, `NAT ${nat.id} on the labelled fallback strip`).toBe(true)
  431 |     }
  432 |     const payload = captured.payload
  433 |     const payloadNats = payload?.vpc_topology?.edges?.nat_gws ?? []
  434 |     if (payload) {
  435 |       expect.soft(inventory.nat.length, "every NAT gateway of the payload is drawn once").toBe(payloadNats.length)
  436 |     }
  437 | 
  438 |     // Coverage pill: exactly the payload's numbers, or absent when the payload has none.
  439 |     const coverage = payload?.traffic_authority?.lane_coverage ?? null
  440 |     if (coverage) {
  441 |       expect.soft(pill, "coverage pill rendered for a payload with lane_coverage").not.toBeNull()
  442 |       if (pill) {
  443 |         expect.soft(pill.state, "pill state").toBe(coverage.state ?? null)
  444 |         expect.soft(pill.totals, "pill totals").toBe(expectedTotalsText(coverage))
  445 |         for (const lane of COVERAGE_LANES) {
  446 |           const counts = coverage.by_lane?.[lane]
  447 |           const chip = pill.lanes.find(entry => entry.testid === `topology-lane-coverage-${lane}`)
  448 |           if (!counts || counts.state === "empty") expect.soft(chip, `${lane} chip absent for an empty lane`).toBeUndefined()
  449 |           else expect.soft(chip?.state, `${lane} chip state`).toBe(counts.state)
  450 |         }
  451 |         expect.soft(pill.warnings.map(warning => warning.code), "warnings, in the backend's order").toEqual(
  452 |           (coverage.warnings ?? []).map(warning => warning.code),
  453 |         )
  454 |       }
  455 |     } else {
  456 |       expect.soft(pill, "no coverage pill without lane_coverage in the payload").toBeNull()
  457 |     }
  458 | 
  459 |     // Scroll the Lambda lane when it overflows: the last chip must land inside
  460 |     // a lane body that is at least one chip tall, with both fold pills up.
  461 |     const serverless = inventory.lanes.serverless
  462 |     if (serverless && serverless.scrollHeight > serverless.clientHeight + 4) {
```