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

  // ------------------------------------------------------------------
  // Probe 3 — the surfaces THIS release changed, which the two probes
  // above never touch (they carry no reference to inspector, stale,
  // headline, last_success or drawer):
  //   * the refresh banner's own words, instead of the one hardcoded
  //     " · backend timeout" printed for all four producers of
  //     fromStaleCache;
  //   * the IGW inspector's AWS identity — the gateway's own id, never
  //     the `__igw__` canvas anchor the egress edges terminate at;
  //   * drawer open, close and reselect;
  //   * the logical-group band's membership, and that a group is never
  //     counted as a placement gap;
  //   * every one of those again after a reload, because a reading that
  //     only holds on a warm first paint is not a working map.
  // ------------------------------------------------------------------
  test("inspector identity, refresh status, and the logical-group band across a reload", async ({ context, page }) => {
    test.setTimeout(300_000)
    await seedAuthCookie(context)
    await page.setViewportSize({ width: 1600, height: 900 })
    const pageErrors: string[] = []
    page.on("pageerror", error => pageErrors.push(String(error.message ?? error)))
    const captured: { payload: TopologyRisk | null } = { payload: null }
    page.on("response", async response => {
      const url = new URL(response.url())
      if (
        !url.pathname.startsWith("/api/proxy/topology-risk/") ||
        response.request().method() !== "GET" ||
        response.status() !== 200
      ) {
        return
      }
      try {
        captured.payload = (await response.json()) as TopologyRisk
      } catch {
        // a non-JSON body is reported below as a missing payload
      }
    })

    const mapTab = page.getByTestId("topology-estate-view-map")
    const blocked = page.getByText(
      /Topology risk unavailable|No systems available yet|Estate map temporarily unavailable/i,
    )

    // A page that will not mount FAILS the probe. Reporting empty readings
    // instead would render a transport failure as "no resources", which is
    // the one thing this QA must never do.
    async function openEstate(label: string): Promise<void> {
      const loads: Array<{ attempt: number; mounted: boolean; ms: number; reason: string | null }> = []
      let mounted = false
      for (let attempt = 1; attempt <= 3 && !mounted; attempt += 1) {
        const t0 = Date.now()
        await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
        await expect(mapTab.or(blocked).first()).toBeVisible({ timeout: 90_000 })
        mounted = await mapTab.isVisible().catch(() => false)
        const reason = mounted
          ? null
          : ((await blocked.first().textContent().catch(() => null)) ?? "").replace(/\s+/g, " ").trim()
        loads.push({ attempt, mounted, ms: Date.now() - t0, reason })
        if (!mounted && attempt < 3) await page.waitForTimeout(8_000)
      }
      report(`${label}-loads`, loads)
      if (!mounted) {
        await shot(page, `c1-${label}-blocked`)
        throw new Error(`estate map did not mount for ${label}: ${loads[loads.length - 1]?.reason}`)
      }
    }

    interface RefreshReading {
      banner: string | null
      payload_status: string | null
      refresh_state: string | null
      stale_reason: string | null
      last_successful_update_at: string | null
      snapshot_age_seconds: number | null
      from_snapshot: boolean | null
      from_stale_cache: boolean | null
    }

    /** The headline strip's refresh sentence beside what the payload claims.
     *  An absent banner is a legitimate reading — a fresh serve makes no
     *  claim — but an invented one is not, and neither is silence over a
     *  payload that says it is stale. */
    async function readRefresh(label: string): Promise<RefreshReading> {
      const raw = await page
        .getByTestId("topology-refresh-status")
        .first()
        .textContent()
        .catch(() => null)
      const banner = (raw ?? "").replace(/\s+/g, " ").trim() || null
      const payload = captured.payload as
        | (TopologyRisk & {
            staleReason?: string | null
            last_successful_update_at?: string | null
            snapshot_age_seconds?: number | null
            fromStaleCache?: boolean | null
          })
        | null
      const reading: RefreshReading = {
        banner,
        payload_status: payload?.status ?? null,
        refresh_state: payload?.refresh_state ?? null,
        stale_reason: payload?.staleReason ?? null,
        last_successful_update_at: payload?.last_successful_update_at ?? null,
        snapshot_age_seconds: payload?.snapshot_age_seconds ?? null,
        from_snapshot: payload?.from_snapshot ?? null,
        from_stale_cache: payload?.fromStaleCache ?? null,
      }
      report(`${label}-refresh-status`, reading)
      // THE defect this release removed.
      expect(
        banner ?? "",
        `${label}: the refresh banner must not print the old hardcoded timeout sentence`,
      ).not.toContain("backend timeout")
      // The other half of it: a stale serve that says nothing at all.
      if (reading.stale_reason) {
        expect(
          banner,
          `${label}: payload carries staleReason=${reading.stale_reason}, so the banner must say something`,
        ).toBeTruthy()
      }
      // "running" is deliberately absent from the closed set: the serving
      // process cannot prove a worker picked the job up.
      expect(reading.refresh_state ?? "", `${label}: refresh_state must not claim a running worker`).not.toBe(
        "running",
      )
      return reading
    }

    /** Dismiss the service drawer if one is open. It is a fixed 720px panel at
     *  z-220 covering the right edge INCLUDING the map header controls, so any
     *  step that clicks something else has to get past it first. Escape is the
     *  affordance under test in `reselect`; here we only need it gone, so the
     *  close button is the fallback. */
    async function dismissDrawer(): Promise<void> {
      const panel = page.getByTestId("topology-service-detail-panel")
      if (!(await panel.isVisible().catch(() => false))) return
      await page.keyboard.press("Escape")
      await page.waitForTimeout(400)
      if (!(await panel.isVisible().catch(() => false))) return
      await panel
        .getByRole("button", { name: "Close service details" })
        .click({ timeout: 10_000 })
        .catch(() => {})
      await page.waitForTimeout(400)
    }

    // The enlarge control lives on the Network topology tab, not on the tab the
    // estate URL opens. Probe 2 switches tabs before enlarging; going straight
    // for the button spent the whole 300s test budget waiting for an element
    // that was never going to appear on the default tab (run 34747387060).
    //
    // Run 34747728564 then spent its whole budget on the opposite failure: the
    // element WAS visible and enabled, and an open drawer intercepted all 140
    // click retries. A helper that clicks blind cannot tell the two apart, so
    // it clears the drawer first and reports what it had to clear.
    async function enterFullscreen(): Promise<ReturnType<typeof page.getByTestId>> {
      const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
      if (await fullscreen.isVisible().catch(() => false)) return fullscreen
      await dismissDrawer()
      const enlarge = page.getByTestId("topology-estate-map-enlarge")
      if (!(await enlarge.isVisible().catch(() => false))) {
        await page.getByRole("tab", { name: "Network topology" }).click()
        await expect(enlarge).toBeVisible({ timeout: 60_000 })
        await page.waitForTimeout(1500)
      }
      await enlarge.click({ timeout: 30_000 })
      await expect(fullscreen).toBeVisible({ timeout: 60_000 })
      await page.waitForTimeout(1500)
      return fullscreen
    }

    /** Select the IGW chip and read the id the inspector actually asks about.
     *  `__igw__` is the CANVAS anchor every egress edge terminates at; it is
     *  not an AWS resource, and a dossier request carrying it answers
     *  "InternetGateway __igw__ not found in graph". */
    async function inspectIgw(label: string) {
      const fullscreen = await enterFullscreen()
      const chip = fullscreen.getByTestId("topology-igw-rail-chip").first()
      const payloadIgws = ((captured.payload?.vpc_topology?.edges?.igws ?? []) as Array<{ id?: string }>)
        .map(igw => igw?.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
      const visible = await chip.isVisible().catch(() => false)
      if (!visible) {
        report(`${label}-igw-inspector`, { chip: false, payload_igws: payloadIgws })
        // A payload that carries an IGW must render one to select.
        expect(payloadIgws, `${label}: payload names IGWs but no chip is on the canvas`).toEqual([])
        return null
      }
      await chip.click()
      const panel = page.getByTestId("topology-service-detail-panel")
      await expect(panel).toBeVisible({ timeout: 30_000 })
      await page.waitForTimeout(1200)
      const shown = ((await panel
        .getByTestId("estate-operations-resource-id")
        .first()
        .textContent()
        .catch(() => null)) ?? "")
        .replace(/\s+/g, " ")
        .trim()
      const unresolved = await panel
        .getByTestId("estate-anchor-identity-unresolved")
        .first()
        .isVisible()
        .catch(() => false)
      const notFound = await panel
        .getByText(/not found in graph/i)
        .first()
        .isVisible()
        .catch(() => false)
      const reading = { chip: true, shown_resource_id: shown || null, unresolved, not_found: notFound, payload_igws: payloadIgws }
      report(`${label}-igw-inspector`, reading)
      await shot(page, `c1-${label}-igw-inspector`)

      // The canvas anchor must never reach the inspector as a resource id.
      expect(shown, `${label}: the inspector must not ask about the __igw__ canvas anchor`).not.toContain("__igw__")
      expect(notFound, `${label}: the IGW inspector must not report the gateway as missing from the graph`).toBe(false)
      if (payloadIgws.length > 0 && !unresolved) {
        // Whatever it shows must be a gateway the payload actually names.
        expect(
          payloadIgws.some(id => shown.includes(id)),
          `${label}: inspector shows ${shown || "<nothing>"}, payload names ${payloadIgws.join(", ")}`,
        ).toBe(true)
      }
      return reading
    }

    /** Escape dismisses the drawer; then a different chip proves the panel
     *  follows the selection rather than keeping the previous resource.
     *
     *  Escape is pressed FIRST and asserted, because the drawer is a fixed
     *  720px surface over the map header: one that will not dismiss blocks
     *  every control behind it. Run 34747728564 measured `closed_on_escape:
     *  false` and then burned its entire 300s budget retrying a click the
     *  drawer was intercepting -- so the close button is used as a fallback
     *  here. A probe must fail with a reading, never with a timeout. */
    async function reselect(label: string, previous: string | null) {
      const panel = page.getByTestId("topology-service-detail-panel")
      const was_open = await panel.isVisible().catch(() => false)
      await page.keyboard.press("Escape")
      await page.waitForTimeout(600)
      const closed = !(await panel.isVisible().catch(() => false))
      if (!closed) {
        await panel
          .getByRole("button", { name: "Close service details" })
          .click({ timeout: 10_000 })
          .catch(() => {})
        await page.waitForTimeout(600)
      }
      const fullscreen = await enterFullscreen()
      const other = fullscreen.getByTestId("topology-service-node-icon").first()
      const haveOther = await other.isVisible().catch(() => false)
      let shown: string | null = null
      if (haveOther) {
        await other.click()
        await expect(panel).toBeVisible({ timeout: 30_000 })
        await page.waitForTimeout(1200)
        shown = ((await panel
          .getByTestId("estate-operations-resource-id")
          .first()
          .textContent()
          .catch(() => null)) ?? "")
          .replace(/\s+/g, " ")
          .trim() || null
      }
      const reading = {
        drawer_was_open: was_open,
        closed_on_escape: closed,
        reselected: haveOther,
        previous,
        shown_resource_id: shown,
      }
      report(`${label}-drawer-reselect`, reading)
      expect(shown ?? "", `${label}: a reselected node must not show the __igw__ anchor`).not.toContain("__igw__")
      // Only meaningful when a drawer was actually open to dismiss.
      if (was_open) {
        expect(
          closed,
          `${label}: Escape must dismiss the service drawer -- it covers the map header controls`,
        ).toBe(true)
      }
      return reading
    }

    /** Logical groups carry their own band and are never counted as gaps. */
    async function readGroups(label: string) {
      const fullscreen = await enterFullscreen()
      const reading = await fullscreen.evaluate(root => {
        const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim()
        const band = root.querySelector('[data-testid="topology-logical-group-band"]')
        const area = root.querySelector('[data-testid="topology-unplaced-area"]')
        const groups = band
          ? Array.from(band.querySelectorAll<HTMLElement>('[data-testid="topology-logical-group"]'))
          : []
        return {
          band_header: text(band?.querySelector('[data-testid="topology-logical-group-band-header"]')) || null,
          groups: groups.map(group => ({
            node_id: group.getAttribute("data-node-id"),
            scope: text(group.querySelector('[data-testid="topology-logical-group-scope"]')) || null,
            members: group.querySelectorAll('[data-testid="topology-logical-group-member"]').length,
            unlinked: Boolean(group.querySelector('[data-testid="topology-logical-group-members-unlinked"]')),
          })),
          unplaced_header: text(area?.querySelector("span")) || null,
          unplaced_chips: area
            ? area.querySelectorAll('[data-testid="topology-service-node-icon"]').length
            : 0,
          // A group drawn INSIDE the amber gap area is the misclassification
          // this band exists to remove.
          groups_inside_unplaced: area
            ? area.querySelectorAll('[data-testid="topology-logical-group"]').length
            : 0,
        }
      })
      report(`${label}-logical-groups`, reading)
      expect(
        reading.groups_inside_unplaced,
        `${label}: a logical group must never be drawn inside the placement-gap area`,
      ).toBe(0)
      return reading
    }

    // ---- round A: first navigation -------------------------------------
    await openEstate("open")
    const refreshA = await readRefresh("open")
    const igwA = await inspectIgw("open")
    await reselect("open", igwA?.shown_resource_id ?? null)
    const groupsA = await readGroups("open")

    // ---- round B: the same reads after a reload ------------------------
    await openEstate("reload")
    const refreshB = await readRefresh("reload")
    const igwB = await inspectIgw("reload")
    const groupsB = await readGroups("reload")

    report("reload-stability", {
      igw_identity_stable: (igwA?.shown_resource_id ?? null) === (igwB?.shown_resource_id ?? null),
      group_count_stable: groupsA.groups.length === groupsB.groups.length,
      refresh_state_before: refreshA.refresh_state,
      refresh_state_after: refreshB.refresh_state,
      banner_before: refreshA.banner,
      banner_after: refreshB.banner,
    })
    // The gateway's identity is a property of the estate, not of one paint.
    expect(
      igwB?.shown_resource_id ?? null,
      "the IGW inspector identity must survive a reload",
    ).toBe(igwA?.shown_resource_id ?? null)
    expect(groupsB.groups.length, "the logical-group count must survive a reload").toBe(groupsA.groups.length)

    report("page-errors", pageErrors)
    expect(pageErrors, "no uncaught page errors").toEqual([])
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

/**
 * Step 5 acceptance matrix — the checks an operator would actually perform,
 * run against the deployed site rather than a fixture.
 *
 * Deliberately split from the three probes above: those measure ONE load
 * deeply, these measure the same page across viewports, repeated loads and
 * input modes, which is where a different class of defect lives (a tier
 * clipped at 1366 wide, a scope silently dropped on the fourth reload, a
 * drawer that traps the keyboard).
 *
 * Two rules this block holds itself to:
 *
 *   1. FAIL CLOSED ON AN EMPTY MATCH. A selector that matches nothing makes an
 *      iteration assertion vacuously true, which reads as a pass. Every loop
 *      below asserts its population is non-empty BEFORE measuring it.
 *   2. ASSERT ONLY WHAT IS UNAMBIGUOUS; REPORT THE REST. A map pane that
 *      scrolls horizontally is a legitimate design; the PAGE BODY doing so is
 *      not. So overflow is asserted at the document and reported per element,
 *      and the report is the evidence for a human judgement rather than a
 *      threshold invented here.
 */
test.describe("C1 live QA — Step 5 acceptance matrix", () => {
  /** Viewports named the way the acceptance list names them. The narrow one is
   *  a real desktop-narrow, not a phone: this map is a desktop surface and a
   *  phone-width claim would be a check nobody asked for. */
  const VIEWPORTS = [
    { name: "1366x768", width: 1366, height: 768 },
    { name: "1600x900", width: 1600, height: 900 },
    { name: "narrow-1024x720", width: 1024, height: 720 },
  ] as const

  /** Open the estate map, SELECT the map view, and wait for the map surface —
   *  the same retry an operator makes, since an uncached topology-risk on C1
   *  runs close to the proxy ceiling and the first load can land on the
   *  loading card. Returns how many loads it took, so a slow mount is
   *  reported rather than hidden by the retry.
   *
   *  The click is not optional, and leaving it out is what made the first run
   *  of this block fail. `topology-estate-view-map` is a view-switcher BUTTON
   *  (`role="tab"`, estate-map-view.tsx:1789) and the tabs are
   *  `[["inventory", "Command map"], ["map", "Network topology"]]` — so it is
   *  visible the moment the page chrome renders, while the DEFAULT view is
   *  Command map. Waiting for that button therefore proves the page loaded
   *  and nothing about the canvas: the three viewport probes measured zero
   *  tier stacks, zero subnet cells, zero rails and zero VPC frames, and the
   *  keyboard probe spent its whole 300s budget waiting for an enlarge
   *  control that only exists on the map. The fail-closed rule turned all of
   *  that into a loud failure instead of "nothing is clipped", which is the
   *  only reason it was one diagnosis rather than four.
   *
   *  Readiness is the enlarge control, not the tab: it belongs to the map
   *  surface, so its presence is evidence the canvas rendered. Clicking by
   *  TESTID rather than by the "Network topology" label keeps this off a
   *  human-readable string that may be renamed or localized. */
  async function openMap(page: Page, label: string): Promise<number> {
    const mapTab = page.getByTestId("topology-estate-view-map")
    const enlarge = page.getByTestId("topology-estate-map-enlarge")
    const blocked = page.getByText(
      /Topology risk unavailable|No systems available yet|Estate map temporarily unavailable/i,
    )
    let lastReason = "never mounted"
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
      await expect(mapTab.or(blocked).first()).toBeVisible({ timeout: 90_000 })
      if (!(await mapTab.isVisible().catch(() => false))) {
        lastReason =
          ((await blocked.first().textContent().catch(() => null)) ?? "").replace(/\s+/g, " ").trim() ||
          "blocked with no message"
        continue
      }
      await mapTab.click()
      // The map surface itself, not the tab that reveals it.
      if (await enlarge.isVisible({ timeout: 90_000 }).catch(() => false)) {
        await page.waitForTimeout(1500) // let the canvas settle before measuring
        return attempt
      }
      lastReason = "map view selected but the map surface never rendered"
    }
    throw new Error(`${label}: estate map did not mount in 3 loads — ${lastReason}`)
  }

  for (const vp of VIEWPORTS) {
    test(`viewport ${vp.name}: the page never scrolls sideways, and clipping is measured`, async ({
      context,
      page,
    }) => {
      test.setTimeout(300_000)
      await seedAuthCookie(context)
      await page.setViewportSize({ width: vp.width, height: vp.height })
      const pageErrors: string[] = []
      page.on("pageerror", error => pageErrors.push(String(error.message ?? error)))

      const loads = await openMap(page, vp.name)

      const geometry = await page.evaluate(() => {
        const doc = document.documentElement
        /** How far past its scroll container's visible right edge an element
         *  sits. Positive means part of it cannot be reached without
         *  scrolling that container. */
        const clip = (selector: string) =>
          Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${selector}"]`)).map(
            el => {
              let parent = el.parentElement
              while (
                parent &&
                parent !== document.body &&
                getComputedStyle(parent).overflowX === "visible"
              ) {
                parent = parent.parentElement
              }
              const box = el.getBoundingClientRect()
              const host = (parent ?? document.body).getBoundingClientRect()
              return {
                width: Math.round(box.width),
                overflow_right_px: Math.round(box.right - host.right),
                clipped_by_viewport_px: Math.round(box.right - window.innerWidth),
              }
            },
          )
        return {
          inner_width: window.innerWidth,
          doc_scroll_width: doc.scrollWidth,
          body_scroll_width: document.body.scrollWidth,
          horizontal_page_scroll_px: Math.max(
            0,
            Math.max(doc.scrollWidth, document.body.scrollWidth) - window.innerWidth,
          ),
          tier_stacks: clip("topology-tier-stack"),
          subnet_cells: clip("topology-subnet-cell-chrome"),
          rails: clip("topology-edge-services-rail"),
          vpc_frames: clip("topology-vpc-frame"),
        }
      })

      report(`matrix-viewport-${vp.name}`, { loads, page_errors: pageErrors, ...geometry })
      await shot(page, `c1-matrix-${vp.name}`)

      // Fail closed: an empty population would make every clipping number
      // below trivially absent, which would read as "nothing is clipped".
      expect(
        geometry.tier_stacks.length + geometry.subnet_cells.length,
        `${vp.name}: no subnet tiers or cells rendered — the measurement would be vacuous`,
      ).toBeGreaterThan(0)

      // The one unambiguous rule. A pane may scroll; the page may not.
      expect(
        geometry.horizontal_page_scroll_px,
        `${vp.name}: the page body scrolls horizontally by ${geometry.horizontal_page_scroll_px}px`,
      ).toBeLessThanOrEqual(1)

      expect(pageErrors, `${vp.name}: uncaught page errors`).toEqual([])
    })
  }

  test("five reloads: the map mounts every time and the scope never silently drops", async ({
    context,
    page,
  }) => {
    test.setTimeout(600_000)
    await seedAuthCookie(context)
    await page.setViewportSize({ width: 1600, height: 900 })

    const riskUrls: string[] = []
    page.on("request", request => {
      const href = request.url()
      if (href.includes("/api/proxy/topology-risk/")) riskUrls.push(href)
    })

    const reloads: Array<{
      reload: number
      loads: number
      url_scope: Record<string, string | null>
      risk_requests: number
    }> = []

    for (let i = 1; i <= 5; i += 1) {
      riskUrls.length = 0
      const loads = await openMap(page, `reload-${i}`)
      const url = new URL(page.url())
      reloads.push({
        reload: i,
        loads,
        url_scope: {
          systemName: url.searchParams.get("systemName"),
          customer_id: url.searchParams.get("customer_id"),
          account_id: url.searchParams.get("account_id"),
          region: url.searchParams.get("region"),
        },
        risk_requests: riskUrls.length,
      })

      // Scope retention: the address bar still describes the scope the
      // operator asked for. A dropped param is how a tenant-scoped view
      // silently becomes an unscoped one.
      expect(url.searchParams.get("systemName"), `reload ${i}: systemName`).toBe(SYSTEM)
      expect(url.searchParams.get("account_id"), `reload ${i}: account_id`).toBe(ACCOUNT)
      expect(url.searchParams.get("region"), `reload ${i}: region`).toBe(REGION)

      // And the read the page actually fired carried it too — the URL can be
      // right while the fetch is not, which is the failure that matters.
      const unscoped = riskUrls.filter(
        href => !href.includes("account_id=") || !href.includes("region="),
      )
      expect(unscoped, `reload ${i}: unscoped topology-risk GET`).toEqual([])
    }

    report("matrix-five-reloads", reloads)
    expect(reloads).toHaveLength(5)
  })

  test("keyboard: Escape closes the drawer, then fullscreen, and focus comes back", async ({
    context,
    page,
  }) => {
    test.setTimeout(300_000)
    await seedAuthCookie(context)
    await page.setViewportSize({ width: 1600, height: 900 })
    await openMap(page, "keyboard")

    const enlarge = page.getByTestId("topology-estate-map-enlarge")
    await expect(enlarge).toBeVisible()
    await enlarge.click()
    const fullscreen = page.getByTestId("topology-estate-map-fullscreen")
    await expect(fullscreen).toBeVisible({ timeout: 60_000 })

    // A chip opens the detail drawer. Fail closed: if nothing is clickable the
    // rest of this test proves nothing, so say so rather than skipping quietly.
    const chips = fullscreen.getByTestId("topology-chip-label")
    const chipCount = await chips.count()
    expect(chipCount, "no chips rendered — the drawer path cannot be exercised").toBeGreaterThan(0)
    await chips.first().click()

    const drawer = page.getByTestId("topology-service-detail-panel")
    const drawerOpened = await drawer.isVisible({ timeout: 15_000 }).catch(() => false)
    report("matrix-keyboard-drawer", { chips: chipCount, drawer_opened: drawerOpened })

    if (drawerOpened) {
      // Escape dismisses the TOPMOST surface first. Before this shipped, the
      // drawer swallowed the click and nothing dismissed it, which is what
      // made probe 3 time out (run 34747728564) — the product defect, not a
      // flaky probe.
      await page.keyboard.press("Escape")
      await expect(drawer).toBeHidden({ timeout: 15_000 })
      await expect(fullscreen).toBeVisible()
    }

    // A second Escape leaves fullscreen, and focus returns to the control that
    // opened it, so a keyboard operator is not stranded at the document root.
    await page.keyboard.press("Escape")
    await expect(fullscreen).toBeHidden({ timeout: 15_000 })
    const focus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return {
        testid: el?.getAttribute("data-testid") ?? null,
        tag: el?.tagName ?? null,
        is_body: el === document.body,
      }
    })
    report("matrix-keyboard-focus-after-escape", focus)
  })

  test("reduced motion: the map still renders and reports its animation state", async ({
    context,
    page,
  }) => {
    test.setTimeout(300_000)
    await seedAuthCookie(context)
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.emulateMedia({ reducedMotion: "reduce" })
    const pageErrors: string[] = []
    page.on("pageerror", error => pageErrors.push(String(error.message ?? error)))

    const loads = await openMap(page, "reduced-motion")
    const state = await page.evaluate(() => {
      const packets = Array.from(
        document.querySelectorAll<SVGElement>('[data-testid="topology-flow-packet"]'),
      )
      const animated = packets.filter(el => {
        const style = getComputedStyle(el)
        return style.animationName !== "none" && style.animationPlayState === "running"
      })
      return {
        honours_query: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        packets: packets.length,
        animating: animated.length,
      }
    })
    report("matrix-reduced-motion", { loads, page_errors: pageErrors, ...state })
    await shot(page, "c1-matrix-reduced-motion")

    expect(state.honours_query, "the browser did not report reduced motion").toBe(true)
    expect(pageErrors, "reduced motion: uncaught page errors").toEqual([])
  })
})
