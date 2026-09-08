# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-c1-qa-live.spec.ts >> C1 live QA — estate map against the deployed graph >> topology-risk on the deployed backend: inventory, edges, and the lane-coverage contract
- Location: tests/integration/topology-estate-c1-qa-live.spec.ts:190:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "testbed-webshop"
Received: undefined
```

# Test source

```ts
  116 | 
  117 | /** Attachments are written as files under the test's output directory so the
  118 |  *  publish step of the workflow can ship them with the screenshots. */
  119 | async function attachJson(name: string, data: unknown) {
  120 |   const path = test.info().outputPath(name)
  121 |   fs.writeFileSync(path, JSON.stringify(data, null, 2))
  122 |   await test.info().attach(name, { path, contentType: "application/json" })
  123 | }
  124 | 
  125 | test.afterEach(async () => {
  126 |   if (measurements.length === 0) return
  127 |   await attachJson("c1qa-measurements.json", {
  128 |     test: test.info().title,
  129 |     status: test.info().status,
  130 |     measurements: measurements.splice(0, measurements.length),
  131 |   })
  132 | })
  133 | 
  134 | async function shot(page: Page, name: string) {
  135 |   const path = test.info().outputPath(`${name}.png`)
  136 |   await page.screenshot({ path, fullPage: false })
  137 |   await test.info().attach(name, { path, contentType: "image/png" })
  138 | }
  139 | 
  140 | /** The coverage pill's text as the UI shows it, from the payload's numbers (the component's format). */
  141 | function expectedTotalsText(coverage: LaneCoverage): string {
  142 |   return (
  143 |     `${coverage.authoritative} of ${coverage.eligible} eligible endpoint${coverage.eligible === 1 ? "" : "s"} covered` +
  144 |     (coverage.unknown > 0 ? ` · ${coverage.unknown} unknown` : "") +
  145 |     (coverage.not_applicable > 0 ? ` · ${coverage.not_applicable} not applicable` : "") +
  146 |     (coverage.active_generation != null ? ` · generation ${coverage.active_generation}` : "")
  147 |   )
  148 | }
  149 | 
  150 | function summarizeTopology(body: TopologyRisk) {
  151 |   const nodes = body.nodes ?? []
  152 |   const byType: Record<string, number> = {}
  153 |   for (const node of nodes) byType[node.type ?? "?"] = (byType[node.type ?? "?"] ?? 0) + 1
  154 |   const natGws = body.vpc_topology?.edges?.nat_gws ?? []
  155 |   const subnetIds = new Set((body.vpc_topology?.subnets ?? []).map(subnet => subnet.id))
  156 |   const authority = body.traffic_authority ?? null
  157 |   return {
  158 |     system: body.system ?? null,
  159 |     account_id: body.account_id ?? null,
  160 |     region: body.region ?? null,
  161 |     vpc_id: body.vpc_id ?? null,
  162 |     available_vpcs: (body.available_vpcs ?? []).map(vpc => ({ vpc_id: vpc.vpc_id, workload_count: vpc.workload_count ?? null })),
  163 |     nodes: nodes.length,
  164 |     by_type: byType,
  165 |     traffic_edges: (body.traffic_edges ?? []).length,
  166 |     subnets: subnetIds.size,
  167 |     nat_gateways: natGws.map(nat => ({
  168 |       id: nat.id ?? null,
  169 |       name: nat.name ?? null,
  170 |       subnet_id: nat.subnet_id ?? null,
  171 |       subnet_in_grid: nat.subnet_id ? subnetIds.has(nat.subnet_id) : false,
  172 |     })),
  173 |     igws: (body.vpc_topology?.edges?.igws ?? []).length,
  174 |     vpces: (body.vpc_topology?.edges?.vpces ?? []).length,
  175 |     traffic_authority: authority
  176 |       ? {
  177 |           state: authority.state ?? null,
  178 |           mode: authority.mode ?? null,
  179 |           active_generation: authority.active_generation ?? null,
  180 |           authoritative_endpoint_count: authority.authoritative_endpoint_count ?? null,
  181 |           endpoint_count: authority.endpoint_count ?? null,
  182 |           projected_edge_count: authority.projected_edge_count ?? null,
  183 |           lane_coverage: authority.lane_coverage ?? null,
  184 |         }
  185 |       : null,
  186 |   }
  187 | }
  188 | 
  189 | test.describe("C1 live QA — estate map against the deployed graph", () => {
  190 |   test("topology-risk on the deployed backend: inventory, edges, and the lane-coverage contract", async ({ playwright }) => {
  191 |     test.setTimeout(240_000)
  192 |     const request = await authedApi(playwright)
  193 |     // Every attempt is recorded with its wall time and the proxy's cache
  194 |     // header: a 50s first read and a 200ms cached one are different facts,
  195 |     // and a 502/503/504 retry (Render cold start) is a third.
  196 |     const attempts: Array<{ status: number; ms: number; x_cache: string | null }> = []
  197 |     let res = await request.get(TOPOLOGY_RISK_PATH)
  198 |     const started = Date.now()
  199 |     let t0 = started
  200 |     attempts.push({ status: res.status(), ms: Date.now() - t0, x_cache: res.headers()["x-cache"] ?? null })
  201 |     for (let i = 1; i < 5 && [502, 503, 504].includes(res.status()); i += 1) {
  202 |       await new Promise(resolve => setTimeout(resolve, 10_000))
  203 |       t0 = Date.now()
  204 |       res = await request.get(TOPOLOGY_RISK_PATH)
  205 |       attempts.push({ status: res.status(), ms: Date.now() - t0, x_cache: res.headers()["x-cache"] ?? null })
  206 |     }
  207 |     report("topology-risk-fetch", { attempts, total_ms: Date.now() - started })
  208 |     const text = await res.text()
  209 |     expect(res.status(), text.slice(0, 500)).toBe(200)
  210 |     const body = JSON.parse(text) as TopologyRisk
  211 |     const summary = summarizeTopology(body)
  212 |     report("topology-risk", summary)
  213 |     await attachJson("topology-risk-summary.json", summary)
  214 |     await request.dispose()
  215 | 
> 216 |     expect(body.system).toBe(SYSTEM)
      |                         ^ Error: expect(received).toBe(expected) // Object.is equality
  217 |     expect(summary.nodes).toBeGreaterThan(0)
  218 | 
  219 |     const coverage = body.traffic_authority?.lane_coverage ?? null
  220 |     report("contract", {
  221 |       lane_coverage_present: Boolean(coverage),
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
```