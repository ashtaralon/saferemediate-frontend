/**
 * LIVE QA — the estate map on a deployed frontend (C1 by default) against the
 * real graph. Not deterministic on purpose: it reads whatever the deployed
 * backend serves and reports it; the deterministic geometry proofs stay in
 * the *-fixture specs.
 *
 * Two probes. Each prints `C1QA <name> <json>` lines on stdout (the dispatch
 * workflow's log is the written report) and attaches the same JSON plus
 * screenshots to the Playwright report:
 *   1. the topology-risk proxy: inventory by type, NAT gateways and their
 *      subnets, IGWs / VPCEs, the traffic-authority block, and — when the
 *      backend carries topology-risk/v8 — the lane-coverage contract checked
 *      for internal consistency (lane sums, authoritative ≤ eligible);
 *   2. the estate map in Chromium: embedded and fullscreen (Glance, then
 *      Inventory) — both rail lanes on screen with their headers clear of
 *      flow labels, fold counters that equal the chips beyond the fold, the
 *      lane body at least one chip tall after a scroll, NAT chips inside
 *      subnet cells (or on the labelled fallback strip), the load-balancer
 *      band above the AZ headers, and the coverage pill's text equal to the
 *      payload the same page fetched — or absent when the payload has no
 *      lane_coverage (an absent number is honest; an invented one is not).
 *
 * Auth is the site cookie (./live-auth). Vercel-auth protected previews are
 * out of scope: a share token would land in a public workflow log.
 *
 *   FRONTEND_URL=https://cyntro-c1.vercel.app C1_SYSTEM=testbed-webshop \
 *     C1_CUSTOMER_ID=testbed-webshop C1_ACCOUNT_ID=416651950952 \
 *     C1_REGION=eu-west-1 \
 *     npx playwright test tests/integration/topology-estate-c1-qa-live.spec.ts
 */
import fs from "node:fs"
import { expect, test, type Page } from "@playwright/test"
import { authedApi, seedAuthCookie } from "./live-auth"
import { railHeaderBadgeOverlaps } from "./topology-fixture"

const SYSTEM = process.env.C1_SYSTEM || "testbed-webshop"
const CUSTOMER = process.env.C1_CUSTOMER_ID || "testbed-webshop"
const ACCOUNT = process.env.C1_ACCOUNT_ID || "416651950952"
const REGION = process.env.C1_REGION || "eu-west-1"
const SCOPE = new URLSearchParams({
  customer_id: CUSTOMER,
  account_id: ACCOUNT,
  region: REGION,
})
const ESTATE_URL = `/topology/v0.2-estate?systemName=${encodeURIComponent(SYSTEM)}&${SCOPE}`
const TOPOLOGY_RISK_PATH = `/api/proxy/topology-risk/${encodeURIComponent(SYSTEM)}?${SCOPE}`
const COVERAGE_LANES = ["vpc", "serverless", "database", "regional"] as const
// Allowlist on purpose, NOT derived from the FE's LaneCoverageState union: this
// probe reads the live deploy, so an unannounced backend state must fail here.
// Deriving it from the union would let anyone widen the type and silence the
// probe. `not_computed` is BE >= topology-risk/v10 — the canonical projection is
// inactive for the scope, so no endpoint was examined; distinct from `none`,
// which is a real measured zero.
const COVERAGE_STATES = new Set([
  "empty",
  "not_applicable",
  "unknown",
  "not_computed",
  "none",
  "partial",
  "authoritative",
])

interface TopologyNode {
  /** BE >= 2026-09-11: the verified Lambda attachment reading and the graph label. */
  vpc_attachment_state?: string | null
  resource_label?: string | null
  id?: string
  name?: string
  type?: string
  vpc_id?: string | null
  subnet_id?: string | null
  subnet_ids?: string[] | null
}
interface NatGateway {
  id?: string
  name?: string
  subnet_id?: string | null
  vpc_id?: string | null
  public_ip?: string | null
}
interface LaneCounts {
  eligible: number
  authoritative: number
  unknown: number
  not_applicable: number
  state: string
}
interface LaneWarning {
  code: string
  lane: string
  count: number
  message: string
}
interface LaneCoverage extends Omit<LaneCounts, "state"> {
  basis?: string
  mode?: string
  active_generation?: number | null
  state?: string
  by_lane?: Partial<Record<(typeof COVERAGE_LANES)[number], LaneCounts>>
  projection?: Record<string, number>
  rejected_edges?: Record<string, number>
  warnings?: LaneWarning[]
}
interface TopologyRisk {
  system?: string
  status?: string
  refresh_state?: string
  from_snapshot?: boolean
  account_id?: string | null
  region?: string | null
  vpc_id?: string | null
  available_vpcs?: Array<{ vpc_id: string; workload_count?: number }>
  nodes?: TopologyNode[]
  traffic_edges?: unknown[]
  vpc_topology?: {
    subnets?: Array<{ id: string; vpc_id?: string | null; az?: string | null; tier?: string | null }>
    edges?: { igws?: unknown[]; nat_gws?: NatGateway[]; vpces?: unknown[] }
  }
  traffic_authority?: {
    state?: string
    mode?: string
    active_generation?: number | null
    authoritative_endpoint_count?: number
    endpoint_count?: number
    projected_edge_count?: number
    lane_coverage?: LaneCoverage | null
  } | null
}

/** Every measurement of the current test, written out by the afterEach below. */
const measurements: Array<{ name: string; data: unknown }> = []

function report(name: string, data: unknown) {
  measurements.push({ name, data })
  console.log(`C1QA ${name} ${JSON.stringify(data)}`)
}

/** Attachments are written as files under the test's output directory so the
 *  publish step of the workflow can ship them with the screenshots. */
async function attachJson(name: string, data: unknown) {
  const path = test.info().outputPath(name)
  fs.writeFileSync(path, JSON.stringify(data, null, 2))
  await test.info().attach(name, { path, contentType: "application/json" })
}

test.afterEach(async () => {
  if (measurements.length === 0) return
  await attachJson("c1qa-measurements.json", {
    test: test.info().title,
    status: test.info().status,
    measurements: measurements.splice(0, measurements.length),
  })
})

async function shot(page: Page, name: string) {
  const path = test.info().outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: false })
  await test.info().attach(name, { path, contentType: "image/png" })
}

/** The coverage pill's text as the UI shows it, from the payload's numbers (the component's format). */
function expectedTotalsText(coverage: LaneCoverage): string {
  // `not_computed` (BE >= topology-risk/v10): the canonical projection is not
  // active for this scope, so `authoritative` is a counter that never ran. The
  // pill states the denominator — which IS measured — and no covered fraction.
  return (
    (coverage.state === "not_computed"
      ? `${coverage.eligible} eligible endpoint${coverage.eligible === 1 ? "" : "s"}, coverage not measured`
      : `${coverage.authoritative} of ${coverage.eligible} eligible endpoint${coverage.eligible === 1 ? "" : "s"} covered`) +
    (coverage.unknown > 0 ? ` · ${coverage.unknown} unknown` : "") +
    (coverage.not_applicable > 0 ? ` · ${coverage.not_applicable} not applicable` : "") +
    (coverage.active_generation != null ? ` · generation ${coverage.active_generation}` : "")
  )
}

function summarizeTopology(body: TopologyRisk) {
  const nodes = body.nodes ?? []
  const byType: Record<string, number> = {}
  for (const node of nodes) byType[node.type ?? "?"] = (byType[node.type ?? "?"] ?? 0) + 1
  // Nodes the payload places nowhere: no subnet_id and no IN_SUBNET-derived
  // subnet_ids. Before backend #1996 a node with a VPC but no subnet evidence
  // was handed head() of every subnet in its VPC and drawn in that cell; it now
  // arrives like this and lands in the unplaced area. Regional and serverless
  // types belong in the first count by nature, so both are reported by type
  // rather than asserted; the second is the population the guess used to place.
  const noSubnetByType: Record<string, number> = {}
  const vpcNoSubnetByType: Record<string, number> = {}
  for (const node of nodes) {
    const hasSubnet = Boolean(node.subnet_id) || (node.subnet_ids ?? []).length > 0
    if (hasSubnet) continue
    const type = node.type ?? "?"
    noSubnetByType[type] = (noSubnetByType[type] ?? 0) + 1
    if (node.vpc_id) vpcNoSubnetByType[type] = (vpcNoSubnetByType[type] ?? 0) + 1
  }
  // The three review defects landed 2026-09-11: the verified attachment state
  // per function (contradicted the coverage warning before), the graph label
  // behind an unplaced node (a cluster or target group is a group, not a gap),
  // and S3 observed_actions as action NAMES (four edges carried characters).
  const lambdaAttachmentStates: Record<string, number> = {}
  const unplacedLabels: Record<string, number> = {}
  for (const node of nodes) {
    if (node.type === "Lambda") {
      const state = node.vpc_attachment_state ?? "absent"
      lambdaAttachmentStates[state] = (lambdaAttachmentStates[state] ?? 0) + 1
    }
    const placed = Boolean(node.subnet_id) || (node.subnet_ids ?? []).length > 0
    if (!placed) {
      const label = node.resource_label ?? `type:${node.type ?? "?"}`
      unplacedLabels[label] = (unplacedLabels[label] ?? 0) + 1
    }
  }
  const s3EdgeActions = (body.traffic_edges ?? [])
    .map(edge => edge as { protocol?: string; source_id?: string; target_id?: string; observed_actions?: unknown })
    .filter(edge => edge.protocol === "ACTUAL_S3_ACCESS")
    .slice(0, 12)
    .map(edge => ({
      source_id: edge.source_id ?? null,
      target_id: edge.target_id ?? null,
      observed_actions: edge.observed_actions ?? null,
    }))
  // Outbound edges and where they go (2026-09-11 review, finding 2). Every
  // egress / edge_service edge with a destination count, so a run can say
  // whether the served projection names destinations at all.
  const egressEdges = (body.traffic_edges ?? [])
    .map(edge => edge as {
      edge_class?: string; source_id?: string; target_id?: string
      external_destinations?: number | null; egress_breakdown?: unknown
      destinations?: Array<{ address?: string; kind?: string; observation_count?: number }> | null
      via_igw?: boolean | null; egress_path?: string | null
      structural_route?: string | null; via_nat_id?: string | null; via_igw_id?: string | null
      egress_hops?: Array<{ kind?: string; id?: string; subnet_id?: string | null }> | null
      route_basis?: string | null
    })
    .filter(edge => edge.edge_class === "egress" || edge.edge_class === "edge_service")
    .slice(0, 16)
    .map(edge => ({
      source_id: edge.source_id ?? null,
      target_id: edge.target_id ?? null,
      external_destinations: edge.external_destinations ?? null,
      egress_breakdown: edge.egress_breakdown ?? null,
      destinations: (edge.destinations ?? []).slice(0, 3).map(d => ({
        address: d.address ?? null, kind: d.kind ?? null, observation_count: d.observation_count ?? null,
      })),
      via_igw: edge.via_igw ?? null,
      egress_path: edge.egress_path ?? null,
      structural_route: edge.structural_route ?? null,
      via_nat_id: edge.via_nat_id ?? null,
      via_igw_id: edge.via_igw_id ?? null,
      egress_hops: edge.egress_hops ?? null,
      route_basis: edge.route_basis ?? null,
    }))
  const natGws = body.vpc_topology?.edges?.nat_gws ?? []
  const subnetIds = new Set((body.vpc_topology?.subnets ?? []).map(subnet => subnet.id))
  const authority = body.traffic_authority ?? null
  return {
    system: body.system ?? null,
    account_id: body.account_id ?? null,
    region: body.region ?? null,
    vpc_id: body.vpc_id ?? null,
    available_vpcs: (body.available_vpcs ?? []).map(vpc => ({ vpc_id: vpc.vpc_id, workload_count: vpc.workload_count ?? null })),
    nodes: nodes.length,
    by_type: byType,
    no_subnet_by_type: noSubnetByType,
    vpc_but_no_subnet_by_type: vpcNoSubnetByType,
    traffic_edges: (body.traffic_edges ?? []).length,
    lambda_attachment_states: lambdaAttachmentStates,
    unplaced_labels: unplacedLabels,
    s3_edge_actions: s3EdgeActions,
    egress_edges: egressEdges,
    subnets: subnetIds.size,
    nat_gateways: natGws.map(nat => ({
      id: nat.id ?? null,
      name: nat.name ?? null,
      subnet_id: nat.subnet_id ?? null,
      subnet_in_grid: nat.subnet_id ? subnetIds.has(nat.subnet_id) : false,
      public_ip: nat.public_ip ?? null,
    })),
    igws: (body.vpc_topology?.edges?.igws ?? []).length,
    vpces: (body.vpc_topology?.edges?.vpces ?? []).length,
    traffic_authority: authority
      ? {
          state: authority.state ?? null,
          mode: authority.mode ?? null,
          active_generation: authority.active_generation ?? null,
          authoritative_endpoint_count: authority.authoritative_endpoint_count ?? null,
          endpoint_count: authority.endpoint_count ?? null,
          projected_edge_count: authority.projected_edge_count ?? null,
          lane_coverage: authority.lane_coverage ?? null,
        }
      : null,
  }
}

test.describe("C1 live QA — estate map against the deployed graph", () => {
  test("topology-risk on the deployed backend: inventory, edges, and the lane-coverage contract", async ({ playwright }) => {
    test.setTimeout(240_000)
    const request = await authedApi(playwright)
    // Every attempt is recorded with its wall time and the proxy's cache
    // header: a 50s first read and a 200ms cached one are different facts,
    // and a 502/503/504 retry (Render cold start) is a third.
    const attempts: Array<{ status: number; ms: number; x_cache: string | null }> = []
    let res = await request.get(TOPOLOGY_RISK_PATH)
    const started = Date.now()
    let t0 = started
    attempts.push({ status: res.status(), ms: Date.now() - t0, x_cache: res.headers()["x-cache"] ?? null })
    for (let i = 1; i < 5 && [502, 503, 504].includes(res.status()); i += 1) {
      await new Promise(resolve => setTimeout(resolve, 10_000))
      t0 = Date.now()
      res = await request.get(TOPOLOGY_RISK_PATH)
      attempts.push({ status: res.status(), ms: Date.now() - t0, x_cache: res.headers()["x-cache"] ?? null })
    }
    report("topology-risk-fetch", { attempts, total_ms: Date.now() - started })
    let text = await res.text()
    expect(res.status(), text.slice(0, 500)).toBe(200)
    let body = JSON.parse(text) as TopologyRisk
    for (let i = 0; i < 4 && (body.status === "computing" || !body.system); i += 1) {
      report("topology-risk-computing", {
        attempt: i + 1,
        refresh_state: body.refresh_state ?? null,
      })
      await new Promise(resolve => setTimeout(resolve, 8_000))
      t0 = Date.now()
      res = await request.get(TOPOLOGY_RISK_PATH)
      attempts.push({ status: res.status(), ms: Date.now() - t0, x_cache: res.headers()["x-cache"] ?? null })
      text = await res.text()
      expect(res.status(), text.slice(0, 500)).toBe(200)
      body = JSON.parse(text) as TopologyRisk
    }
    const summary = summarizeTopology(body)
    report("topology-risk", summary)
    await attachJson("topology-risk-summary.json", summary)
    await request.dispose()

    expect(body.status, "serving must not stay on a computing envelope").not.toBe("computing")
    expect(body.system).toBe(SYSTEM)
    expect(summary.nodes).toBeGreaterThan(0)

    const coverage = body.traffic_authority?.lane_coverage ?? null
    report("contract", {
      lane_coverage_present: Boolean(coverage),
      authority_state: body.traffic_authority?.state ?? null,
      active_generation: body.traffic_authority?.active_generation ?? null,
    })
    if (!coverage) return // backend predates topology-risk/v8: nothing to check, and the pill must be absent (probe 2)

    // Internal consistency of the contract, independent of what the graph holds.
    expect(coverage.basis).toBe("vpc_flow_logs")
    expect(COVERAGE_STATES.has(String(coverage.state))).toBe(true)
    const sums = { eligible: 0, authoritative: 0, unknown: 0, not_applicable: 0 }
    for (const lane of COVERAGE_LANES) {
      const counts = coverage.by_lane?.[lane]
      expect(counts, `by_lane.${lane}`).toBeTruthy()
      if (!counts) continue
      expect(COVERAGE_STATES.has(counts.state), `${lane}.state`).toBe(true)
      expect(counts.authoritative, `${lane}: authoritative ≤ eligible`).toBeLessThanOrEqual(counts.eligible)
      sums.eligible += counts.eligible
      sums.authoritative += counts.authoritative
      sums.unknown += counts.unknown
      sums.not_applicable += counts.not_applicable
    }
    expect(coverage.eligible).toBe(sums.eligible)
    expect(coverage.authoritative).toBe(sums.authoritative)
    expect(coverage.unknown).toBe(sums.unknown)
    expect(coverage.not_applicable).toBe(sums.not_applicable)
    expect(coverage.authoritative).toBeLessThanOrEqual(coverage.eligible)
    for (const warning of coverage.warnings ?? []) {
      expect(typeof warning.code).toBe("string")
      expect(typeof warning.message).toBe("string")
      expect(warning.count).toBeGreaterThan(0)
    }
    report("contract-consistency", {
      classified: sums.eligible + sums.unknown + sums.not_applicable,
      nodes: summary.nodes,
      warnings: (coverage.warnings ?? []).map(warning => `${warning.code}(${warning.lane}:${warning.count})`),
      projection: coverage.projection ?? null,
      rejected_edges: coverage.rejected_edges ?? null,
    })
  })

  test("estate map on the deployed frontend: lanes, NAT chips, ALB band, coverage pill", async ({ context, page }) => {
    test.setTimeout(300_000)
    await seedAuthCookie(context)
    await page.setViewportSize({ width: 1600, height: 900 })
    const pageErrors: string[] = []
    page.on("pageerror", error => pageErrors.push(String(error.message ?? error)))
    // Assigned from a response listener: an object property, not a `let`, so
    // control-flow analysis does not narrow it to null at the read sites.
    const captured: { payload: TopologyRisk | null } = { payload: null }
    // The product-scope gate (organization roster, account options, scoped
    // systems catalog) decides whether the map mounts at all; record what each
    // of those calls answered so a blocked page comes with its cause.
    const gate: Array<{ path: string; status: number; body: string }> = []
    const riskResponses: Array<{
      path: string
      status: number
      body_status: string | null
      from_snapshot: boolean | null
      system_kpis: boolean
      nodes: number
    }> = []
    page.on("response", async response => {
      const url = new URL(response.url())
      const isGate =
        url.pathname === "/api/proxy/admin/customers" ||
        url.pathname === "/api/proxy/admin/accounts/scope/options/all" ||
        url.pathname === "/api/proxy/systems" ||
        url.pathname.startsWith("/api/proxy/topology-risk/")
      if (isGate) {
        let body = ""
        try {
          body = (await response.text()).slice(0, 400)
        } catch {
          body = "<unreadable>"
        }
        gate.push({ path: url.pathname + url.search, status: response.status(), body })
      }
      if (
        url.pathname.startsWith("/api/proxy/topology-risk/") &&
        response.request().method() === "GET"
      ) {
        try {
          const payload = (await response.json()) as TopologyRisk
          riskResponses.push({
            path: url.pathname + url.search,
            status: response.status(),
            body_status: payload.status ?? null,
            from_snapshot: payload.from_snapshot ?? null,
            system_kpis: Boolean((payload as { system_kpis?: unknown }).system_kpis),
            nodes: (payload.nodes ?? []).length,
          })
          if (response.status() === 200) captured.payload = payload
        } catch {
          // a non-JSON body is reported below as a missing payload
        }
      }
    })

    // Cold reads are the norm here, not an error: the proxy's cache key
    // carries the page's scope (customer_id and friends), so the map's own
    // read is uncached even after an unscoped probe, and an uncached
    // topology-risk on C1 runs close to the proxy's 55s ceiling. The first
    // load therefore both fills that scoped cache and, if it times out,
    // leaves the page on its "Preparing …" / "unavailable" state. Reload and
    // wait again — the same thing an operator does — and report how many
    // loads it took.
    const mapTab = page.getByTestId("topology-estate-view-map")
    // "Preparing <system>" / "Building estate map" is the LOADING card, not a
    // blocked state: matching it as success made every load return at once
    // (run 33675359540). It is a signal to keep waiting. The timeout card
    // ("Estate map temporarily unavailable") is a real refusal.
    const blocked = page.getByText(
      /Topology risk unavailable|No systems available yet|Estate map temporarily unavailable/i,
    )
    const riskUrls: string[] = []
    page.on("request", request => {
      const href = request.url()
      if (href.includes("/api/proxy/topology-risk/")) riskUrls.push(href)
    })
    const loads: Array<{ attempt: number; mounted: boolean; reason: string | null; ms: number }> = []
    let mounted = false
    for (let attempt = 1; attempt <= 3 && !mounted; attempt += 1) {
      const t0 = Date.now()
      await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
      const firstRisk = await page
        .waitForRequest(request => request.url().includes("/api/proxy/topology-risk/"), { timeout: 60_000 })
        .catch(() => null)
      const unscoped = riskUrls.filter(
        href => !href.includes("account_id=") || !href.includes("region="),
      )
      report("estate-topology-risk-urls", {
        attempt,
        first: firstRisk?.url() ?? null,
        urls: [...riskUrls],
        unscoped,
        responses: [...riskResponses],
      })
      expect(unscoped, "Estate must not fire an unscoped topology-risk GET on a scoped C1 URL").toEqual([])
      await expect(mapTab.or(blocked).first()).toBeVisible({ timeout: 90_000 })
      mounted = await mapTab.isVisible().catch(() => false)
      expect(
        riskUrls.filter(href => href.includes("vpc_id=")),
        "Estate must not add vpc_id when the opening URL did not ask for one",
      ).toEqual([])
      const reason = mounted
        ? null
        : ((await blocked.first().textContent().catch(() => null)) ?? "").replace(/\s+/g, " ").trim()
      loads.push({ attempt, mounted, reason, ms: Date.now() - t0 })
      if (!mounted && attempt < 3) await page.waitForTimeout(8_000)
    }
    report("estate-page", { mounted, loads, gate })
    if (!mounted) {
      await shot(page, "c1-estate-blocked")
      throw new Error(`estate map did not mount after ${loads.length} loads: ${loads[loads.length - 1]?.reason}`)
    }
    await page.getByRole("tab", { name: "Network topology" }).click()
    const dependencies = page
      .getByTestId("topology-flow-mode-toggle")
      .getByRole("button", { name: "Dependencies" })
      .first()
    await dependencies.click()
    await expect(dependencies).toHaveAttribute("aria-pressed", "true")
    await page.waitForTimeout(1500)
    await shot(page, "c1-estate-embedded")

    const vpcOptions = await page
      .getByTestId("topology-vpc-select")
      .locator("option")
      .allTextContents()
      .catch(() => [] as string[])
    report("scope-gate", gate)
    report("embedded", {
      vpc_options: vpcOptions,
      authority_banner: await bannerText(page, "page"),
      coverage_pill: await readPill(page, "page"),
      payload_captured: Boolean(captured.payload),
      ...(await measureEmbeddedLegibility(page)),
    })

    // Fullscreen — Glance first (the default), then Inventory (one icon per node).
    await page.getByTestId("topology-estate-map-enlarge").click()
    const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
    await expect(fullscreen).toBeVisible()
    await page.waitForTimeout(1500)
    await shot(page, "c1-fullscreen-glance")
    const glance = await measureFullscreen(page)
    report("fullscreen-glance", { ...glance, header_overlaps: await railHeaderBadgeOverlaps(page) })

    await fullscreen.getByTestId("topology-estate-density-fs-inventory").click()
    await page.waitForTimeout(1500)
    await shot(page, "c1-fullscreen-inventory")
    const inventory = await measureFullscreen(page)
    const overlaps = await railHeaderBadgeOverlaps(page)
    const pill = await readPill(page, "fullscreen")
    report("fullscreen-inventory", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })
    await attachJson("fullscreen-inventory.json", { ...inventory, header_overlaps: overlaps, coverage_pill: pill })

    // --- Assertions. Soft where the graph's shape decides what is present.
    const overlapping = overlaps.filter(o => {
      const depth = Math.min(o.badge.b, o.headerBox.b) - Math.max(o.badge.t, o.headerBox.t)
      return depth > 1
    })
    expect.soft(overlapping, "no flow label paints over a rail header (touches ≤ 1px are reported, not failed)").toEqual([])
    for (const lane of ["serverless", "regional"] as const) {
      const measured = inventory.lanes[lane]
      if (!measured || !inventory.rail) continue
      expect.soft(measured.header.t, `${lane} header inside the rail`).toBeGreaterThanOrEqual(inventory.rail.t - 1)
      expect.soft(measured.header.b, `${lane} header inside the rail`).toBeLessThanOrEqual(inventory.rail.b + 1)
      expect.soft(measured.header.b, `${lane} header inside the viewport`).toBeLessThanOrEqual(inventory.viewport.h)
      expect.soft(measured.overflowY, `${lane} lane body owns its scroll`).toBe("auto")
      if (measured.scrollHeight > measured.clientHeight + 4) {
        expect.soft(measured.more_pill, `${lane} fold footer counts the chips below`).toBe(`+${measured.below} more ↓`)
      } else {
        expect.soft(measured.more_pill, `${lane} has no fold footer without overflow`).toBeNull()
      }
    }
    if (inventory.alb_band && inventory.az_headers) {
      expect.soft(inventory.alb_band.b, "load balancer band above the AZ headers").toBeLessThanOrEqual(inventory.az_headers.t + 1)
    }
    if (inventory.band_row && inventory.first_tier) {
      expect.soft(
        inventory.first_tier.t,
        "the Web tier starts below the band row (load balancers · NAT fallback · AZ headers)",
      ).toBeGreaterThanOrEqual(inventory.band_row.b - 1)
    }
    expect.soft(inventory.cells_under_az_headers, "no subnet cell starts above the AZ header row's bottom edge").toBe(0)
    for (const nat of inventory.nat) {
      if (nat.placement === "subnet") expect.soft(nat.in_subnet_cell, `NAT ${nat.id} pinned inside a subnet cell`).toBe(true)
      else expect.soft(nat.in_fallback, `NAT ${nat.id} on the labelled fallback strip`).toBe(true)
    }
    const payload = captured.payload
    const payloadNats = payload?.vpc_topology?.edges?.nat_gws ?? []
    // Placement honesty, both sides of the proxy: what the payload leaves
    // without a subnet and what the map put in the unplaced area. Reported,
    // not asserted — the renderer decides per type which of the former belong
    // in the latter (a regional service has no subnet and is not unplaced).
    const placement = payload ? summarizeTopology(payload) : null
    report("unplaced", {
      ui: inventory.unplaced,
      logical_groups: inventory.logical_groups,
      payload_no_subnet_by_type: placement?.no_subnet_by_type ?? null,
      payload_vpc_but_no_subnet_by_type: placement?.vpc_but_no_subnet_by_type ?? null,
    })
    if (payload) {
      expect.soft(inventory.nat.length, "every NAT gateway of the payload is drawn once").toBe(payloadNats.length)
      // Asserted since production read clean (run 34682112619 after #867):
      // the same 1px touch tolerance the rail-header check uses, so two
      // neighbours sharing an edge are reported, not failed.
      expect
        .soft(
          inventory.labels_over_nat_chips.filter(o => o.overlap_px > 1),
          "no flow badge is painted over a NAT gateway chip (touches ≤ 1px are reported, not failed)",
        )
        .toEqual([])
    }

    // Coverage pill: exactly the payload's numbers, or absent when the payload has none.
    const coverage = payload?.traffic_authority?.lane_coverage ?? null
    if (coverage) {
      expect.soft(pill, "coverage pill rendered for a payload with lane_coverage").not.toBeNull()
      if (pill) {
        expect.soft(pill.state, "pill state").toBe(coverage.state ?? null)
        expect.soft(pill.totals, "pill totals").toBe(expectedTotalsText(coverage))
        for (const lane of COVERAGE_LANES) {
          const counts = coverage.by_lane?.[lane]
          const chip = pill.lanes.find(entry => entry.testid === `topology-lane-coverage-${lane}`)
          if (!counts || counts.state === "empty") expect.soft(chip, `${lane} chip absent for an empty lane`).toBeUndefined()
          else expect.soft(chip?.state, `${lane} chip state`).toBe(counts.state)
        }
        expect.soft(pill.warnings.map(warning => warning.code), "warnings, in the backend's order").toEqual(
          (coverage.warnings ?? []).map(warning => warning.code),
        )
      }
    } else {
      expect.soft(pill, "no coverage pill without lane_coverage in the payload").toBeNull()
    }

    // Scroll the Lambda lane when it overflows: the last chip must land inside
    // a lane body that is at least one chip tall, with both fold pills up.
    const serverless = inventory.lanes.serverless
    if (serverless && serverless.scrollHeight > serverless.clientHeight + 4) {
      const laneBody = fullscreen.getByTestId("topology-serverless-lane-body")
      const chips = laneBody.locator("[data-flow-id], [data-flow-ids]")
      const chipCount = await chips.count()
      const last = chips.nth(chipCount - 1)
      const pageScrollBefore = await page.evaluate(() => window.scrollY)
      // scrollIntoViewIfNeeded waits on the page viewport. The last Lambda
      // chip lives in a nested overflow lane, so that wait never finishes
      // (c1-ui-qa #32 hit the 300s test timeout after the map had mounted).
      await laneBody.evaluate(el => {
        el.scrollTop = el.scrollHeight
      })
      await page.waitForTimeout(500)
      const after = await last.boundingBox()
      const bodyAfter = await laneBody.boundingBox()
      const scrolled = {
        chip: after,
        body: bodyAfter,
        lane_scrollTop: await laneBody.evaluate(el => el.scrollTop),
        page_scrolled: (await page.evaluate(() => window.scrollY)) !== pageScrollBefore,
        above_pill: await page.evaluate(() => {
          const root = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')
          const el = root?.querySelector('[data-testid="topology-serverless-lane-above"]')
          return (el?.textContent ?? "").replace(/\s+/g, " ").trim() || null
        }),
        more_pill: await page.evaluate(() => {
          const root = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')
          const el = root?.querySelector('[data-testid="topology-serverless-lane-more"]')
          return (el?.textContent ?? "").replace(/\s+/g, " ").trim() || null
        }),
        header_overlaps: await railHeaderBadgeOverlaps(page),
      }
      report("fullscreen-inventory-scrolled", scrolled)
      await shot(page, "c1-fullscreen-inventory-scrolled")
      if (after && bodyAfter) {
        expect.soft(after.y, "scrolled chip inside its lane body (top)").toBeGreaterThanOrEqual(bodyAfter.y - 1)
        expect.soft(after.y + after.height, "scrolled chip inside its lane body (bottom)").toBeLessThanOrEqual(bodyAfter.y + bodyAfter.height + 1)
        expect.soft(bodyAfter.height, "lane body at least one chip tall").toBeGreaterThanOrEqual(after.height)
      }
      expect.soft(scrolled.page_scrolled, "the lane scrolled, not the page").toBe(false)
      expect.soft(scrolled.header_overlaps, "headers still clear after the scroll").toEqual([])
    }

    report("page-errors", pageErrors)
    expect.soft(pageErrors, "no uncaught page errors").toEqual([])
  })
})

/** Embedded map: labels painted over off-VPC rail chips, and unknown-glyph nodes. */
async function measureEmbeddedLegibility(page: Page): Promise<{
  labels_over_rail_chips: Array<{ label: string; chip: string | null }>
  unknown_glyph_nodes: Array<{ name: string; title: string | null }>
  rail_chips: number
  flow_badges: number
}> {
  return page.evaluate(() => {
    const fullscreen = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')
    const rails = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="topology-edge-services-rail"]')).filter(
      el => !fullscreen || !fullscreen.contains(el),
    )
    const rail = rails[0] ?? null
    const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim()
    const intersects = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
    const chips = rail
      ? Array.from(rail.querySelectorAll<HTMLElement>("[data-flow-id], [data-flow-ids]")).filter(chip => chip.getBoundingClientRect().height > 0)
      : []
    const badges = Array.from(document.querySelectorAll<SVGGElement>('[data-testid="topology-flow-badge"]')).filter(
      badge => !fullscreen || !fullscreen.contains(badge),
    )
    const labelsOver: Array<{ label: string; chip: string | null }> = []
    for (const badge of badges) {
      const box = badge.querySelector("rect")
      if (!box) continue
      const r = box.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const label = (badge.querySelector("text")?.textContent ?? "").trim()
      for (const chip of chips) {
        if (intersects(r, chip.getBoundingClientRect())) {
          labelsOver.push({ label, chip: chip.getAttribute("data-flow-id") ?? chip.getAttribute("data-flow-ids") })
        }
      }
    }
    const unknown = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="topology-service-node-icon"]'))
      .filter(chip => !fullscreen || !fullscreen.contains(chip))
      .filter(chip => Array.from(chip.querySelectorAll("span")).some(span => span.childElementCount === 0 && span.textContent?.trim() === "?"))
      .map(chip => ({ name: text(chip), title: chip.getAttribute("title") }))
    return { labels_over_rail_chips: labelsOver, unknown_glyph_nodes: unknown, rail_chips: chips.length, flow_badges: badges.length }
  })
}

async function bannerText(page: Page, scope: "page" | "fullscreen"): Promise<string | null> {
  return page.evaluate(scopeArg => {
    const root =
      scopeArg === "fullscreen"
        ? document.querySelector('[data-testid="topology-estate-map-fullscreen"]')
        : document
    const el = root?.querySelector('[data-testid="topology-traffic-authority-state"]')
    const text = (el?.textContent ?? "").replace(/\s+/g, " ").trim()
    return text || null
  }, scope)
}

interface PillReading {
  state: string | null
  totals: string
  lanes: Array<{ testid: string | null; state: string | null; text: string }>
  warnings: Array<{ code: string | null; text: string }>
}

async function readPill(page: Page, scope: "page" | "fullscreen"): Promise<PillReading | null> {
  return page.evaluate(scopeArg => {
    const root =
      scopeArg === "fullscreen"
        ? document.querySelector('[data-testid="topology-estate-map-fullscreen"]')
        : document
    const pill = root?.querySelector('[data-testid="topology-lane-coverage"]')
    if (!pill) return null
    const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim()
    return {
      state: pill.getAttribute("data-coverage-state"),
      totals: text(pill.querySelector('[data-testid="topology-lane-coverage-totals"]')),
      lanes: Array.from(pill.querySelectorAll("[data-lane-state]")).map(el => ({
        testid: el.getAttribute("data-testid"),
        state: el.getAttribute("data-lane-state"),
        text: text(el),
      })),
      warnings: Array.from(pill.querySelectorAll('[data-testid="topology-coverage-gap"]')).map(el => ({
        code: el.getAttribute("data-warning-code"),
        text: text(el),
      })),
    }
  }, scope)
}

interface Box {
  l: number
  t: number
  r: number
  b: number
  w: number
  h: number
}
interface LaneMeasure {
  header: Box
  header_text: string
  body: Box
  scrollHeight: number
  clientHeight: number
  overflowY: string
  chips: number
  above: number
  below: number
  more_pill: string | null
  above_pill: string | null
}
interface FullscreenMeasure {
  viewport: { w: number; h: number }
  layout: string
  rail: Box | null
  lanes: { serverless: LaneMeasure | null; regional: LaneMeasure | null }
  nat: Array<{ id: string | null; placement: string | null; in_subnet_cell: boolean; in_fallback: boolean; title: string | null }>
  nat_fallback_text: string | null
  alb_band: Box | null
  az_headers: Box | null
  band_row: Box | null
  first_tier: Box | null
  cells_under_az_headers: number
  igw_chips: number
  vpce_chips: number
  /** The VPC BOUNDARY column (IGW top, endpoints bottom) beside the frame, and its captions. */
  vpc_boundary_column: boolean
  boundary_captions: string[]
  /** Rail bundle shapes (2026-09-11): same-lane trunks, feeder legs + their per-member marks, and the words the trunks carry. */
  rail_trunks: number
  rail_bundle_paths: number
  rail_feeder_legs: number
  rail_feeder_marks: number
  rail_bundle_words: string[]
  /** Per trunk word: how far its badge's centre sits from the trunk's bus (px). */
  rail_trunk_badge_offsets: Array<{ label: string; offset_px: number }>
  rail_chip_captions: string[]
  users_internet_strip: boolean
  subnet_cells: number
  /** Every AZ x tier cell with the chips drawn in it (2026-09-11: an Aurora
   *  instance or the Neptune writer must appear in ONE zone, its own). */
  cells: Array<{ az: string | null; tier: string | null; chips: string[] }>
  labels_over_rail_chips: Array<{ label: string; chip: string | null; overlap_px: number }>
  labels_over_nat_chips: Array<{ label: string; chip: string | null; overlap_px: number }>
  unknown_glyph_nodes: Array<{ name: string; title: string | null }>
  service_icons: number
  stack_tiles: number
  flow_badges: number
  authority_banner: string | null
  unplaced: {
    header: string | null
    total: number
    by_reason: Record<string, number>
    names: string[]
  }
  /** The logical-group band beside the unplaced area: the classifier's
   *  `logical-group` verdict, drawn as groups and never counted above. */
  logical_groups: {
    header: string | null
    total: number
    names: string[]
    /** Members the payload's TARGETS / LAUNCHES edges link to each group. */
    member_counts: number[]
  }
}

async function measureFullscreen(page: Page): Promise<FullscreenMeasure> {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="topology-estate-map-fullscreen"]')
    if (!root) throw new Error("fullscreen map is not open")
    const rect = (el: Element | null) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }
    }
    const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim()
    const count = (selector: string) => root.querySelectorAll(selector).length
    const intersects = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
    /** Flow labels whose box paints over a chip of the given container. */
    const labelsOverChips = (container: Element | null, chipSelector = "[data-flow-id], [data-flow-ids]") => {
      const out: Array<{ label: string; chip: string | null; overlap_px: number }> = []
      if (!container) return out
      const chips = Array.from(container.querySelectorAll<HTMLElement>(chipSelector)).filter(
        chip => chip.getBoundingClientRect().height > 0,
      )
      for (const badge of Array.from(root.querySelectorAll<SVGGElement>('[data-testid="topology-flow-badge"]'))) {
        const box = badge.querySelector("rect")
        if (!box) continue
        const r = box.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const label = (badge.querySelector("text")?.textContent ?? "").trim()
        for (const chip of chips) {
          const c = chip.getBoundingClientRect()
          if (intersects(r, c)) {
            // How deep the boxes overlap on the shallower axis: a 1px touch
            // between neighbours reads differently from a tag across a label.
            const overlap_px = Math.round(
              Math.min(Math.min(r.right, c.right) - Math.max(r.left, c.left), Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top)),
            )
            out.push({ label, chip: chip.getAttribute("data-flow-id") ?? chip.getAttribute("data-flow-ids"), overlap_px })
          }
        }
      }
      return out
    }
    /** Service chips whose glyph is the unknown-type fallback ("?"). */
    const unknownGlyphNodes = (scope: Element) =>
      Array.from(scope.querySelectorAll<HTMLElement>('[data-testid="topology-service-node-icon"]'))
        .filter(chip => Array.from(chip.querySelectorAll("span")).some(span => span.childElementCount === 0 && span.textContent?.trim() === "?"))
        .map(chip => ({ name: text(chip), title: chip.getAttribute("title") }))
    const measureLane = (lane: string) => {
      const header = root.querySelector(`[data-flow-obstacle="${lane}-tier-header"]`)
      const body = root.querySelector<HTMLElement>(`[data-testid="topology-${lane}-lane-body"]`)
      const headerBox = rect(header)
      const bodyBox = rect(body)
      if (!header || !body || !headerBox || !bodyBox) return null
      let above = 0
      let below = 0
      let chips = 0
      for (const chip of Array.from(body.querySelectorAll("[data-flow-id], [data-flow-ids]"))) {
        const r = chip.getBoundingClientRect()
        if (r.height === 0) continue
        chips += 1
        if (r.bottom > bodyBox.b + 1) below += 1
        else if (r.top < bodyBox.t - 1) above += 1
      }
      return {
        header: headerBox,
        header_text: text(header),
        body: bodyBox,
        scrollHeight: body.scrollHeight,
        clientHeight: body.clientHeight,
        overflowY: getComputedStyle(body).overflowY,
        chips,
        above,
        below,
        more_pill: text(root.querySelector(`[data-testid="topology-${lane}-lane-more"]`)) || null,
        above_pill: text(root.querySelector(`[data-testid="topology-${lane}-lane-above"]`)) || null,
      }
    }
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      layout: root.querySelector('[data-testid="topology-single-vpc-grid"]')
        ? "single-vpc"
        : root.querySelector('[data-testid="topology-compare-fill"]')
          ? "multi-vpc"
          : "unknown",
      rail: rect(root.querySelector('[data-testid="topology-edge-services-rail"]')),
      lanes: { serverless: measureLane("serverless"), regional: measureLane("regional") },
      nat: Array.from(root.querySelectorAll<HTMLElement>('[data-testid="topology-nat-gateway-chip"]')).map(chip => ({
        id: chip.getAttribute("data-nat-id"),
        placement: chip.getAttribute("data-nat-placement"),
        // SubnetCell wraps a pinned chip in topology-subnet-cell-nat (the cell
        // itself carries a dynamic test id); the fallback strip wraps the rest.
        in_subnet_cell: Boolean(chip.closest('[data-testid="topology-subnet-cell-nat"]')),
        in_fallback: Boolean(chip.closest('[data-testid="topology-nat-gateway-fallback"]')),
        title: chip.getAttribute("title"),
      })),
      nat_fallback_text: text(root.querySelector('[data-testid="topology-nat-gateway-fallback"]')) || null,
      alb_band: rect(root.querySelector('[data-testid="topology-alb-band"]')),
      az_headers: rect(
        root.querySelector('[data-testid="topology-vpc-az-headers"], [data-testid="topology-az-column-headers"]'),
      ),
      // The band row (load balancers · NAT fallback · AZ headers) must end
      // before the Web tier starts. Its grid track used to be starved on a
      // short viewport and the band painted over the public subnet cells
      // (run 34576457683 at 1600×900).
      band_row: rect(root.querySelector('[data-testid="topology-vpc-band-row"]')),
      first_tier: rect(root.querySelector('[data-testid="topology-tier-stack"]')),
      cells_under_az_headers: (() => {
        const azRow = root.querySelector('[data-flow-obstacle="az-header-row"]')
        if (!azRow) return 0
        const azBottom = azRow.getBoundingClientRect().bottom
        return Array.from(root.querySelectorAll('[data-testid="topology-subnet-cell-chrome"]')).filter(
          cell => cell.getBoundingClientRect().top < azBottom - 1,
        ).length
      })(),
      igw_chips: count('[data-testid="topology-igw-rail-chip"]'),
      vpce_chips: count('[data-testid="topology-vpce-rail-chip"]'),
      vpc_boundary_column: Boolean(root.querySelector('[data-testid="topology-vpc-boundary-column"]')),
      boundary_captions: Array.from(root.querySelectorAll('[data-testid="topology-boundary-caption"]')).map(el => text(el)),
      rail_trunks: count('g[data-flow-target^="trunk:"]'),
      rail_bundle_paths: count("g[data-flow-bundle]"),
      rail_feeder_legs: Array.from(root.querySelectorAll("[data-flow-feeder-legs]")).reduce(
        (n, el) => n + ((el.getAttribute("d") ?? "").match(/M /g) ?? []).length,
        0,
      ),
      rail_feeder_marks: count("[data-flow-feeder]"),
      rail_bundle_words: Array.from(
        root.querySelectorAll('[data-testid="topology-flow-badge"]:not([data-flow-feeder]) text'),
      ).map(el => text(el)),
      rail_trunk_badge_offsets: Array.from(root.querySelectorAll<SVGGElement>('g[data-flow-target^="trunk:"]')).flatMap(group => {
        const path = group.querySelector("path") as SVGPathElement | null
        const badge = group.querySelector('[data-testid="topology-flow-badge"]:not([data-flow-feeder]) rect')
        const ctm = path?.getScreenCTM()
        if (!path || !badge || !ctm) return []
        const len = path.getTotalLength()
        if (!len) return []
        // The trunk polyline ends on its bus (busX, farthest chip), so the end
        // point's x IS the bus.
        const tail = path.getPointAtLength(len)
        const end = new DOMPoint(tail.x, tail.y).matrixTransform(ctm)
        const r = badge.getBoundingClientRect()
        return [
          {
            label: text(group.querySelector('[data-testid="topology-flow-badge"]:not([data-flow-feeder]) text')),
            offset_px: Math.round(Math.abs((r.left + r.right) / 2 - end.x)),
          },
        ]
      }),
      rail_chip_captions: Array.from(root.querySelectorAll('[data-testid="topology-chip-caption"]')).map(el => text(el)),
      users_internet_strip: Boolean(root.querySelector('[data-testid="topology-users-internet-strip"]')),
      subnet_cells: count('[data-testid="topology-subnet-cell-chrome"]'),
      cells: Array.from(
        root.querySelectorAll<HTMLElement>('[data-testid="topology-subnet-cell-workloads"], [data-testid="topology-subnet-cell"]'),
      ).map(cell => ({
        az: cell.getAttribute("data-az"),
        tier: cell.getAttribute("data-tier"),
        chips: Array.from(
          cell.querySelectorAll<HTMLElement>('[data-testid="topology-service-node-icon"], [data-testid="topology-service-stack"]'),
        ).map(chip => (chip.getAttribute("title") ?? text(chip)).split(" · ")[0]),
      })),
      // Labels painted over rail chips and nodes drawn with the unknown glyph:
      // both are legibility defects an operator sees before anything else.
      labels_over_rail_chips: labelsOverChips(root.querySelector('[data-testid="topology-edge-services-rail"]')),
      // A NAT chip is a hop an egress line legs through (2026-09-11 review
      // finding 2); a badge laid over it hides the gateway's own label (QA run
      // 34661856217 had the egress bundle tag on the NAT's top edge, and the
      // TG feeder mark touching its right edge).
      labels_over_nat_chips: labelsOverChips(root, '[data-testid="topology-nat-gateway-chip"]'),
      unknown_glyph_nodes: unknownGlyphNodes(root),
      service_icons: count('[data-testid="topology-service-node-icon"]'),
      stack_tiles: count('[data-testid="topology-density-stack-tile"], [data-testid="topology-service-stack"]'),
      flow_badges: count('[data-testid="topology-flow-badge"]'),
      authority_banner: text(root.querySelector('[data-testid="topology-traffic-authority-state"]')) || null,
      // The unplaced area: what the graph does not place, by the renderer's
      // own reason code. After backend #1996 a node with a VPC but no subnet
      // evidence is no longer guessed into a cell, so `no-subnet-in-graph` is
      // where such a node shows up. Names are bounded; the counts are not.
      unplaced: (() => {
        const area = root.querySelector('[data-testid="topology-unplaced-area"]')
        if (!area) return { header: null, total: 0, by_reason: {}, names: [] }
        const chips = Array.from(area.querySelectorAll<HTMLElement>('[data-testid="topology-service-node-icon"]'))
        const byReason: Record<string, number> = {}
        for (const group of Array.from(area.querySelectorAll<HTMLElement>('[data-testid="topology-unplaced-group"]'))) {
          const reason = group.getAttribute("data-unplaced-reason") ?? "?"
          byReason[reason] = group.querySelectorAll('[data-testid="topology-service-node-icon"]').length
        }
        return {
          header: text(area.querySelector("span")) || null,
          total: chips.length,
          by_reason: byReason,
          names: chips.slice(0, 12).map(chip => chip.getAttribute("title") || text(chip)),
        }
      })(),
      // Logical groups are the classifier's own verdict and are no longer
      // counted or headed as placement gaps (2026-09-12 review): reported from
      // their own band, with the members the payload links to each.
      logical_groups: (() => {
        const band = root.querySelector('[data-testid="topology-logical-group-band"]')
        if (!band) return { header: null, total: 0, names: [], member_counts: [] }
        const groups = Array.from(band.querySelectorAll<HTMLElement>('[data-testid="topology-logical-group"]'))
        return {
          header: text(band.querySelector('[data-testid="topology-logical-group-band-header"]')) || null,
          total: groups.length,
          names: groups.map(group => {
            const chip = group.querySelector<HTMLElement>('[data-testid="topology-service-node-icon"]')
            return chip?.getAttribute("title") || text(chip) || group.getAttribute("data-node-id") || ""
          }),
          member_counts: groups.map(
            group => (group.getAttribute("data-member-ids") ?? "").split("|").filter(Boolean).length,
          ),
        }
      })(),
    }
  })
}
