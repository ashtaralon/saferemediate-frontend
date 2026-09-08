# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-c1-qa-live.spec.ts >> C1 live QA — estate map against the deployed graph >> estate map on the deployed frontend: lanes, NAT chips, ALB band, coverage pill
- Location: tests/integration/topology-estate-c1-qa-live.spec.ts:278:7

# Error details

```
Error: Estate must not add vpc_id when the opening URL did not ask for one

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "https://cyntro-c1.vercel.app/api/proxy/topology-risk/testbed-webshop?customer_id=testbed-webshop&account_id=416651950952&region=eu-west-1&vpc_id=vpc-0c39cde96f29f8f4e",
+ ]
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e4]:
    - generic [ref=e5]: Scope
    - generic [ref=e6]:
      - img [ref=e7]
      - generic [ref=e11]: Organization
      - combobox "Organization" [ref=e12]:
        - option "Cyntro Testbed Webshop" [selected]
    - generic [ref=e13]:
      - img [ref=e14]
      - generic [ref=e18]: Group
      - combobox "Group" [ref=e19]:
        - option "All account groups" [selected]
    - generic [ref=e20]:
      - img [ref=e21]
      - generic [ref=e23]: Account
      - combobox "Account" [ref=e24]:
        - option "All accounts"
        - option "Testbed Webshop · 416651950952" [selected]
    - generic [ref=e25]:
      - img [ref=e26]
      - generic [ref=e31]: Region
      - combobox "Region" [ref=e32]:
        - option "All regions"
        - option "eu-west-1" [selected]
    - generic [ref=e34]: 1 accounts in view
  - generic [ref=e36]:
    - generic [ref=e37]:
      - img [ref=e38]
      - generic [ref=e40]:
        - generic [ref=e41]: Building estate map
        - generic [ref=e42]: Preparing testbed-webshop
        - generic [ref=e43]: Checking for a last-good snapshot before reading the behavioral graph.
    - generic [ref=e44]:
      - generic [ref=e45]:
        - img [ref=e47]
        - generic [ref=e49]: Check last-good estate snapshot
      - generic [ref=e50]:
        - generic [ref=e51]: "2"
        - generic [ref=e52]: Read behavioral resources and relationships
      - generic [ref=e53]:
        - generic [ref=e54]: "3"
        - generic [ref=e55]: Score and assemble the operator view
    - generic [ref=e56]: Cold refreshes normally complete in under 30 seconds. Cyntro never replaces a last-good map with an incomplete response.
  - region "Notifications (F8)":
    - list
  - alert [ref=e57]
```

# Test source

```ts
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
  291 |     const riskResponses: Array<{
  292 |       path: string
  293 |       status: number
  294 |       body_status: string | null
  295 |       from_snapshot: boolean | null
  296 |       system_kpis: boolean
  297 |       nodes: number
  298 |     }> = []
  299 |     page.on("response", async response => {
  300 |       const url = new URL(response.url())
  301 |       const isGate =
  302 |         url.pathname === "/api/proxy/admin/customers" ||
  303 |         url.pathname === "/api/proxy/admin/accounts/scope/options/all" ||
  304 |         url.pathname === "/api/proxy/systems" ||
  305 |         url.pathname.startsWith("/api/proxy/topology-risk/")
  306 |       if (isGate) {
  307 |         let body = ""
  308 |         try {
  309 |           body = (await response.text()).slice(0, 400)
  310 |         } catch {
  311 |           body = "<unreadable>"
  312 |         }
  313 |         gate.push({ path: url.pathname + url.search, status: response.status(), body })
  314 |       }
  315 |       if (
  316 |         url.pathname.startsWith("/api/proxy/topology-risk/") &&
  317 |         response.request().method() === "GET"
  318 |       ) {
  319 |         try {
  320 |           const payload = (await response.json()) as TopologyRisk
  321 |           riskResponses.push({
  322 |             path: url.pathname + url.search,
  323 |             status: response.status(),
  324 |             body_status: payload.status ?? null,
  325 |             from_snapshot: payload.from_snapshot ?? null,
  326 |             system_kpis: Boolean((payload as { system_kpis?: unknown }).system_kpis),
  327 |             nodes: (payload.nodes ?? []).length,
  328 |           })
  329 |           if (response.status() === 200) captured.payload = payload
  330 |         } catch {
  331 |           // a non-JSON body is reported below as a missing payload
  332 |         }
  333 |       }
  334 |     })
  335 | 
  336 |     // Cold reads are the norm here, not an error: the proxy's cache key
  337 |     // carries the page's scope (customer_id and friends), so the map's own
  338 |     // read is uncached even after an unscoped probe, and an uncached
  339 |     // topology-risk on C1 runs close to the proxy's 55s ceiling. The first
  340 |     // load therefore both fills that scoped cache and, if it times out,
  341 |     // leaves the page on its "Preparing …" / "unavailable" state. Reload and
  342 |     // wait again — the same thing an operator does — and report how many
  343 |     // loads it took.
  344 |     const mapTab = page.getByTestId("topology-estate-view-map")
  345 |     // "Preparing <system>" / "Building estate map" is the LOADING card, not a
  346 |     // blocked state: matching it as success made every load return at once
  347 |     // (run 33675359540). It is a signal to keep waiting. The timeout card
  348 |     // ("Estate map temporarily unavailable") is a real refusal.
  349 |     const blocked = page.getByText(
  350 |       /Topology risk unavailable|No systems available yet|Estate map temporarily unavailable/i,
  351 |     )
  352 |     const riskUrls: string[] = []
  353 |     page.on("request", request => {
  354 |       const href = request.url()
  355 |       if (href.includes("/api/proxy/topology-risk/")) riskUrls.push(href)
  356 |     })
  357 |     const loads: Array<{ attempt: number; mounted: boolean; reason: string | null; ms: number }> = []
  358 |     let mounted = false
  359 |     for (let attempt = 1; attempt <= 3 && !mounted; attempt += 1) {
  360 |       const t0 = Date.now()
  361 |       await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
  362 |       const firstRisk = await page
  363 |         .waitForRequest(request => request.url().includes("/api/proxy/topology-risk/"), { timeout: 60_000 })
  364 |         .catch(() => null)
  365 |       const unscoped = riskUrls.filter(
  366 |         href => !href.includes("account_id=") || !href.includes("region="),
  367 |       )
  368 |       report("estate-topology-risk-urls", {
  369 |         attempt,
  370 |         first: firstRisk?.url() ?? null,
  371 |         urls: [...riskUrls],
  372 |         unscoped,
  373 |         responses: [...riskResponses],
  374 |       })
  375 |       expect(unscoped, "Estate must not fire an unscoped topology-risk GET on a scoped C1 URL").toEqual([])
  376 |       await expect(mapTab.or(blocked).first()).toBeVisible({ timeout: 90_000 })
  377 |       mounted = await mapTab.isVisible().catch(() => false)
  378 |       expect(
  379 |         riskUrls.filter(href => href.includes("vpc_id=")),
  380 |         "Estate must not add vpc_id when the opening URL did not ask for one",
> 381 |       ).toEqual([])
      |         ^ Error: Estate must not add vpc_id when the opening URL did not ask for one
  382 |       const reason = mounted
  383 |         ? null
  384 |         : ((await blocked.first().textContent().catch(() => null)) ?? "").replace(/\s+/g, " ").trim()
  385 |       loads.push({ attempt, mounted, reason, ms: Date.now() - t0 })
  386 |       if (!mounted && attempt < 3) await page.waitForTimeout(8_000)
  387 |     }
  388 |     report("estate-page", { mounted, loads, gate })
  389 |     if (!mounted) {
  390 |       await shot(page, "c1-estate-blocked")
  391 |       throw new Error(`estate map did not mount after ${loads.length} loads: ${loads[loads.length - 1]?.reason}`)
  392 |     }
  393 |     await page.getByRole("tab", { name: "Network topology" }).click()
  394 |     const dependencies = page
  395 |       .getByTestId("topology-flow-mode-toggle")
  396 |       .getByRole("button", { name: "Dependencies" })
  397 |       .first()
  398 |     await dependencies.click()
  399 |     await expect(dependencies).toHaveAttribute("aria-pressed", "true")
  400 |     await page.waitForTimeout(1500)
  401 |     await shot(page, "c1-estate-embedded")
  402 | 
  403 |     const vpcOptions = await page
  404 |       .getByTestId("topology-vpc-select")
  405 |       .locator("option")
  406 |       .allTextContents()
  407 |       .catch(() => [] as string[])
  408 |     report("scope-gate", gate)
  409 |     report("embedded", {
  410 |       vpc_options: vpcOptions,
  411 |       authority_banner: await bannerText(page, "page"),
  412 |       coverage_pill: await readPill(page, "page"),
  413 |       payload_captured: Boolean(captured.payload),
  414 |       ...(await measureEmbeddedLegibility(page)),
  415 |     })
  416 | 
  417 |     // Fullscreen — Glance first (the default), then Inventory (one icon per node).
  418 |     await page.getByTestId("topology-estate-map-enlarge").click()
  419 |     const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
  420 |     await expect(fullscreen).toBeVisible()
  421 |     await page.waitForTimeout(1500)
  422 |     await shot(page, "c1-fullscreen-glance")
  423 |     const glance = await measureFullscreen(page)
  424 |     report("fullscreen-glance", { ...glance, header_overlaps: await railHeaderBadgeOverlaps(page) })
  425 | 
  426 |     await fullscreen.getByTestId("topology-estate-density-fs-inventory").click()
  427 |     await page.waitForTimeout(1500)
  428 |     await shot(page, "c1-fullscreen-inventory")
  429 |     const inventory = await measureFullscreen(page)
  430 |     const overlaps = await railHeaderBadgeOverlaps(page)
  431 |     const pill = await readPill(page, "fullscreen")
  432 |     report("fullscreen-inventory", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  433 |     await attachJson("fullscreen-inventory.json", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
  434 | 
  435 |     // --- Assertions. Soft where the graph's shape decides what is present.
  436 |     const overlapping = overlaps.filter(o => {
  437 |       const depth = Math.min(o.badge.b, o.headerBox.b) - Math.max(o.badge.t, o.headerBox.t)
  438 |       return depth > 1
  439 |     })
  440 |     expect.soft(overlapping, "no flow label paints over a rail header (touches ≤ 1px are reported, not failed)").toEqual([])
  441 |     for (const lane of ["serverless", "regional"] as const) {
  442 |       const measured = inventory.lanes[lane]
  443 |       if (!measured || !inventory.rail) continue
  444 |       expect.soft(measured.header.t, `${lane} header inside the rail`).toBeGreaterThanOrEqual(inventory.rail.t - 1)
  445 |       expect.soft(measured.header.b, `${lane} header inside the rail`).toBeLessThanOrEqual(inventory.rail.b + 1)
  446 |       expect.soft(measured.header.b, `${lane} header inside the viewport`).toBeLessThanOrEqual(inventory.viewport.h)
  447 |       expect.soft(measured.overflowY, `${lane} lane body owns its scroll`).toBe("auto")
  448 |       if (measured.scrollHeight > measured.clientHeight + 4) {
  449 |         expect.soft(measured.more_pill, `${lane} fold footer counts the chips below`).toBe(`+${measured.below} more ↓`)
  450 |       } else {
  451 |         expect.soft(measured.more_pill, `${lane} has no fold footer without overflow`).toBeNull()
  452 |       }
  453 |     }
  454 |     if (inventory.alb_band && inventory.az_headers) {
  455 |       expect.soft(inventory.alb_band.b, "load balancer band above the AZ headers").toBeLessThanOrEqual(inventory.az_headers.t + 1)
  456 |     }
  457 |     for (const nat of inventory.nat) {
  458 |       if (nat.placement === "subnet") expect.soft(nat.in_subnet_cell, `NAT ${nat.id} pinned inside a subnet cell`).toBe(true)
  459 |       else expect.soft(nat.in_fallback, `NAT ${nat.id} on the labelled fallback strip`).toBe(true)
  460 |     }
  461 |     const payload = captured.payload
  462 |     const payloadNats = payload?.vpc_topology?.edges?.nat_gws ?? []
  463 |     if (payload) {
  464 |       expect.soft(inventory.nat.length, "every NAT gateway of the payload is drawn once").toBe(payloadNats.length)
  465 |     }
  466 | 
  467 |     // Coverage pill: exactly the payload's numbers, or absent when the payload has none.
  468 |     const coverage = payload?.traffic_authority?.lane_coverage ?? null
  469 |     if (coverage) {
  470 |       expect.soft(pill, "coverage pill rendered for a payload with lane_coverage").not.toBeNull()
  471 |       if (pill) {
  472 |         expect.soft(pill.state, "pill state").toBe(coverage.state ?? null)
  473 |         expect.soft(pill.totals, "pill totals").toBe(expectedTotalsText(coverage))
  474 |         for (const lane of COVERAGE_LANES) {
  475 |           const counts = coverage.by_lane?.[lane]
  476 |           const chip = pill.lanes.find(entry => entry.testid === `topology-lane-coverage-${lane}`)
  477 |           if (!counts || counts.state === "empty") expect.soft(chip, `${lane} chip absent for an empty lane`).toBeUndefined()
  478 |           else expect.soft(chip?.state, `${lane} chip state`).toBe(counts.state)
  479 |         }
  480 |         expect.soft(pill.warnings.map(warning => warning.code), "warnings, in the backend's order").toEqual(
  481 |           (coverage.warnings ?? []).map(warning => warning.code),
```