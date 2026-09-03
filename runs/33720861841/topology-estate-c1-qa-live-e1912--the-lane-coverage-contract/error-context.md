# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-c1-qa-live.spec.ts >> C1 live QA — estate map against the deployed graph >> topology-risk on the deployed backend: inventory, edges, and the lane-coverage contract
- Location: tests/integration/topology-estate-c1-qa-live.spec.ts:180:7

# Error details

```
Error: apiRequestContext.get: read ETIMEDOUT
Call log:
  - → GET https://cyntro-c1.vercel.app/api/proxy/topology-risk/testbed-webshop
    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.7778.96 Safari/537.36
    - accept: */*
    - accept-encoding: gzip,deflate,br
    - Cookie: cyntro_auth=authenticated

```

# Test source

```ts
  94  |     projected_edge_count?: number
  95  |     lane_coverage?: LaneCoverage | null
  96  |   } | null
  97  | }
  98  | 
  99  | /** Every measurement of the current test, written out by the afterEach below. */
  100 | const measurements: Array<{ name: string; data: unknown }> = []
  101 | 
  102 | function report(name: string, data: unknown) {
  103 |   measurements.push({ name, data })
  104 |   console.log(`C1QA ${name} ${JSON.stringify(data)}`)
  105 | }
  106 | 
  107 | /** Attachments are written as files under the test's output directory so the
  108 |  *  publish step of the workflow can ship them with the screenshots. */
  109 | async function attachJson(name: string, data: unknown) {
  110 |   const path = test.info().outputPath(name)
  111 |   fs.writeFileSync(path, JSON.stringify(data, null, 2))
  112 |   await test.info().attach(name, { path, contentType: "application/json" })
  113 | }
  114 | 
  115 | test.afterEach(async () => {
  116 |   if (measurements.length === 0) return
  117 |   await attachJson("c1qa-measurements.json", {
  118 |     test: test.info().title,
  119 |     status: test.info().status,
  120 |     measurements: measurements.splice(0, measurements.length),
  121 |   })
  122 | })
  123 | 
  124 | async function shot(page: Page, name: string) {
  125 |   const path = test.info().outputPath(`${name}.png`)
  126 |   await page.screenshot({ path, fullPage: false })
  127 |   await test.info().attach(name, { path, contentType: "image/png" })
  128 | }
  129 | 
  130 | /** The coverage pill's text as the UI shows it, from the payload's numbers (the component's format). */
  131 | function expectedTotalsText(coverage: LaneCoverage): string {
  132 |   return (
  133 |     `${coverage.authoritative} of ${coverage.eligible} eligible endpoint${coverage.eligible === 1 ? "" : "s"} covered` +
  134 |     (coverage.unknown > 0 ? ` · ${coverage.unknown} unknown` : "") +
  135 |     (coverage.not_applicable > 0 ? ` · ${coverage.not_applicable} not applicable` : "") +
  136 |     (coverage.active_generation != null ? ` · generation ${coverage.active_generation}` : "")
  137 |   )
  138 | }
  139 | 
  140 | function summarizeTopology(body: TopologyRisk) {
  141 |   const nodes = body.nodes ?? []
  142 |   const byType: Record<string, number> = {}
  143 |   for (const node of nodes) byType[node.type ?? "?"] = (byType[node.type ?? "?"] ?? 0) + 1
  144 |   const natGws = body.vpc_topology?.edges?.nat_gws ?? []
  145 |   const subnetIds = new Set((body.vpc_topology?.subnets ?? []).map(subnet => subnet.id))
  146 |   const authority = body.traffic_authority ?? null
  147 |   return {
  148 |     system: body.system ?? null,
  149 |     account_id: body.account_id ?? null,
  150 |     region: body.region ?? null,
  151 |     vpc_id: body.vpc_id ?? null,
  152 |     available_vpcs: (body.available_vpcs ?? []).map(vpc => ({ vpc_id: vpc.vpc_id, workload_count: vpc.workload_count ?? null })),
  153 |     nodes: nodes.length,
  154 |     by_type: byType,
  155 |     traffic_edges: (body.traffic_edges ?? []).length,
  156 |     subnets: subnetIds.size,
  157 |     nat_gateways: natGws.map(nat => ({
  158 |       id: nat.id ?? null,
  159 |       name: nat.name ?? null,
  160 |       subnet_id: nat.subnet_id ?? null,
  161 |       subnet_in_grid: nat.subnet_id ? subnetIds.has(nat.subnet_id) : false,
  162 |     })),
  163 |     igws: (body.vpc_topology?.edges?.igws ?? []).length,
  164 |     vpces: (body.vpc_topology?.edges?.vpces ?? []).length,
  165 |     traffic_authority: authority
  166 |       ? {
  167 |           state: authority.state ?? null,
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
  183 |     // Every attempt is recorded with its wall time and the proxy's cache
  184 |     // header: a 50s first read and a 200ms cached one are different facts,
  185 |     // and a 502/503/504 retry (Render cold start) is a third.
  186 |     const attempts: Array<{ status: number; ms: number; x_cache: string | null }> = []
  187 |     let res = await request.get(TOPOLOGY_RISK_PATH)
  188 |     const started = Date.now()
  189 |     let t0 = started
  190 |     attempts.push({ status: res.status(), ms: Date.now() - t0, x_cache: res.headers()["x-cache"] ?? null })
  191 |     for (let i = 1; i < 5 && [502, 503, 504].includes(res.status()); i += 1) {
  192 |       await new Promise(resolve => setTimeout(resolve, 10_000))
  193 |       t0 = Date.now()
> 194 |       res = await request.get(TOPOLOGY_RISK_PATH)
      |                           ^ Error: apiRequestContext.get: read ETIMEDOUT
  195 |       attempts.push({ status: res.status(), ms: Date.now() - t0, x_cache: res.headers()["x-cache"] ?? null })
  196 |     }
  197 |     report("topology-risk-fetch", { attempts, total_ms: Date.now() - started })
  198 |     const text = await res.text()
  199 |     expect(res.status(), text.slice(0, 500)).toBe(200)
  200 |     const body = JSON.parse(text) as TopologyRisk
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
  252 |     // The first uncached topology read on C1 takes ~54s and this test drives
  253 |     // three probes plus a scroll phase after it; 300s left no headroom and the
  254 |     // run died mid-phase with its measurements already taken (run 33681801338).
  255 |     test.setTimeout(900_000)
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
```