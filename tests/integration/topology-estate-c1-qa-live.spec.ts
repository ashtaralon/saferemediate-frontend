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
 *     npx playwright test tests/integration/topology-estate-c1-qa-live.spec.ts
 */
import fs from "node:fs"
import { expect, test, type Page } from "@playwright/test"
import { authedApi, liveGetWithRetry, seedAuthCookie } from "./live-auth"
import { railHeaderBadgeOverlaps } from "./topology-fixture"

const SYSTEM = process.env.C1_SYSTEM || "testbed-webshop"
const ESTATE_URL = `/topology/v0.2-estate?systemName=${encodeURIComponent(SYSTEM)}`
const TOPOLOGY_RISK_PATH = `/api/proxy/topology-risk/${encodeURIComponent(SYSTEM)}`
const COVERAGE_LANES = ["vpc", "serverless", "database", "regional"] as const
const COVERAGE_STATES = new Set(["empty", "not_applicable", "unknown", "none", "partial", "authoritative"])

interface TopologyNode {
  id?: string
  name?: string
  type?: string
  vpc_id?: string | null
  subnet_id?: string | null
}
interface NatGateway {
  id?: string
  name?: string
  subnet_id?: string | null
  vpc_id?: string | null
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
  return (
    `${coverage.authoritative} of ${coverage.eligible} eligible endpoint${coverage.eligible === 1 ? "" : "s"} covered` +
    (coverage.unknown > 0 ? ` · ${coverage.unknown} unknown` : "") +
    (coverage.not_applicable > 0 ? ` · ${coverage.not_applicable} not applicable` : "") +
    (coverage.active_generation != null ? ` · generation ${coverage.active_generation}` : "")
  )
}

function summarizeTopology(body: TopologyRisk) {
  const nodes = body.nodes ?? []
  const byType: Record<string, number> = {}
  for (const node of nodes) byType[node.type ?? "?"] = (byType[node.type ?? "?"] ?? 0) + 1
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
    traffic_edges: (body.traffic_edges ?? []).length,
    subnets: subnetIds.size,
    nat_gateways: natGws.map(nat => ({
      id: nat.id ?? null,
      name: nat.name ?? null,
      subnet_id: nat.subnet_id ?? null,
      subnet_in_grid: nat.subnet_id ? subnetIds.has(nat.subnet_id) : false,
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
    const res = await liveGetWithRetry(request, TOPOLOGY_RISK_PATH)
    const text = await res.text()
    expect(res.status(), text.slice(0, 500)).toBe(200)
    const body = JSON.parse(text) as TopologyRisk
    const summary = summarizeTopology(body)
    report("topology-risk", summary)
    await attachJson("topology-risk-summary.json", summary)
    await request.dispose()

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
    page.on("response", async response => {
      if (
        response.url().includes("/api/proxy/topology-risk/") &&
        response.request().method() === "GET" &&
        response.status() === 200
      ) {
        try {
          captured.payload = (await response.json()) as TopologyRisk
        } catch {
          // a non-JSON body is reported below as a missing payload
        }
      }
    })

    await page.goto(ESTATE_URL, { waitUntil: "domcontentloaded" })
    const mapTab = page.getByTestId("topology-estate-view-map")
    const blocked = page.getByText(/Topology risk unavailable|No systems available yet/i)
    await expect(mapTab.or(blocked).first()).toBeVisible({ timeout: 120_000 })
    if (!(await mapTab.isVisible().catch(() => false))) {
      const reason = ((await blocked.first().textContent().catch(() => null)) ?? "").replace(/\s+/g, " ").trim()
      report("estate-page", { mounted: false, reason })
      await shot(page, "c1-estate-blocked")
      throw new Error(`estate map did not mount: ${reason}`)
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
    report("embedded", {
      vpc_options: vpcOptions,
      authority_banner: await bannerText(page, "page"),
      coverage_pill: await readPill(page, "page"),
      payload_captured: Boolean(captured.payload),
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
    expect.soft(overlaps, "no flow label paints over a rail header").toEqual([])
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
    for (const nat of inventory.nat) {
      if (nat.placement === "subnet") expect.soft(nat.in_subnet_cell, `NAT ${nat.id} pinned inside a subnet cell`).toBe(true)
      else expect.soft(nat.in_fallback, `NAT ${nat.id} on the labelled fallback strip`).toBe(true)
    }
    const payload = captured.payload
    const payloadNats = payload?.vpc_topology?.edges?.nat_gws ?? []
    if (payload) {
      expect.soft(inventory.nat.length, "every NAT gateway of the payload is drawn once").toBe(payloadNats.length)
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
      await last.scrollIntoViewIfNeeded()
      await page.waitForTimeout(500)
      const after = await last.boundingBox()
      const bodyAfter = await laneBody.boundingBox()
      const scrolled = {
        chip: after,
        body: bodyAfter,
        lane_scrollTop: await laneBody.evaluate(el => el.scrollTop),
        page_scrolled: (await page.evaluate(() => window.scrollY)) !== pageScrollBefore,
        above_pill: await fullscreen.getByTestId("topology-serverless-lane-above").textContent().catch(() => null),
        more_pill: await fullscreen.getByTestId("topology-serverless-lane-more").textContent().catch(() => null),
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
      warnings: Array.from(pill.querySelectorAll('[data-testid="topology-lane-coverage-warning"]')).map(el => ({
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
  nat: Array<{ id: string | null; placement: string | null; in_subnet_cell: boolean; in_fallback: boolean }>
  nat_fallback_text: string | null
  alb_band: Box | null
  az_headers: Box | null
  igw_chips: number
  vpce_chips: number
  users_internet_strip: boolean
  subnet_cells: number
  service_icons: number
  stack_tiles: number
  flow_badges: number
  authority_banner: string | null
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
        in_subnet_cell: Boolean(chip.closest('[data-testid="topology-subnet-cell"]')),
        in_fallback: Boolean(chip.closest('[data-testid="topology-nat-gateway-fallback"]')),
      })),
      nat_fallback_text: text(root.querySelector('[data-testid="topology-nat-gateway-fallback"]')) || null,
      alb_band: rect(root.querySelector('[data-testid="topology-alb-band"]')),
      az_headers: rect(
        root.querySelector('[data-testid="topology-vpc-az-headers"], [data-testid="topology-az-column-headers"]'),
      ),
      igw_chips: count('[data-testid="topology-igw-rail-chip"]'),
      vpce_chips: count('[data-testid="topology-vpce-rail-chip"]'),
      users_internet_strip: Boolean(root.querySelector('[data-testid="topology-users-internet-strip"]')),
      subnet_cells: count('[data-testid="topology-subnet-cell"]'),
      service_icons: count('[data-testid="topology-service-node-icon"]'),
      stack_tiles: count('[data-testid="topology-density-stack-tile"], [data-testid="topology-service-stack"]'),
      flow_badges: count('[data-testid="topology-flow-badge"]'),
      authority_banner: text(root.querySelector('[data-testid="topology-traffic-authority-state"]')) || null,
    }
  })
}
