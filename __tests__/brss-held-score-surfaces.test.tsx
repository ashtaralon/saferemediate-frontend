/**
 * Three surfaces flagged for putting a NON-BRSS number beside a held BRSS, or
 * for calling a severity number "blast-radius". Each is mounted through its
 * live composition (app/page.tsx → HomeDashboardV3 / SystemDetailDashboard).
 *
 *   1. System-detail header (components/system-detail-dashboard.tsx) — the
 *      legacy /api/posture-score number + trend delta. NOT RENDERED at this
 *      base: fetchPostureScore/fetchPostureTrend are only called from
 *      fetchAllData, whose sole caller is handleTriggerAutoTag, which nothing
 *      references (#521 replaced the Overview's mount waterfall). The guard
 *      below pins that; reviving the fetch must face the BRSS-held label.
 *   2. Management report drawer (Executive view → "Create report") — its
 *      per-system score is /api/systems `healthScore`
 *      (executive-cockpit.tsx reportSnapshot), a severity-count score.
 *   3. FamilyStrip (Operations view) — plane scores from service_risk_scores,
 *      beside the org BRSS hero.
 *
 * Payloads copy the literal shapes the backend builds (saferemediate-backend
 * @ fede08f83). Values produced by EXECUTING backend code, not typed:
 *   - api/posture_score.py::_build_dimension_scores + _aggregate_posture →
 *     overall_score 73.53, grade "C", confidence "LOW" (inputs in POSTURE).
 *   - api/systems.py::calculate_health_score(0,0,0,0) → 100; (1,1,1,1) → 90.
 *   - api/executive_snapshot.py::compose_system_executive_snapshot on the
 *     route's no-driver branch (_section_error("system", …) for every
 *     section) → EXEC_SNAPSHOT_NOT_READY, verbatim.
 *   - /api/proxy/family-aggregate's body is produced by running that proxy's
 *     own GET over the backend /api/service-risk-scores/all-systems shape.
 * The account-scope roster/options shapes are the ones
 * __tests__/account-scope-context.test.tsx already uses; scope is not the
 * subject here.
 *
 * Absence checks are paired with a control in which the same query DOES find
 * its target, so none of them is vacuous.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { NextRequest } from "next/server"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  router: { push: () => undefined, replace: () => undefined, prefetch: () => undefined, back: () => undefined },
}))
vi.mock("next/navigation", () => ({
  useSearchParams: () => nav.params,
  useRouter: () => nav.router,
  usePathname: () => "/",
}))

import { SystemDetailDashboard } from "@/components/system-detail-dashboard"
import { HomeDashboardV3 } from "@/components/dashboard/v3/home-dashboard-v3"
import { AccountScopeProvider } from "@/lib/account-scope-context"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  nav.params = new URLSearchParams()
  try {
    window.localStorage.clear()
  } catch {
    /* no storage */
  }
})

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
})

type Hit = { status: number; body: unknown }
type Route = (url: string) => Hit | null

/** fetch mock routed by URL. Unrouted URLs 404 so nothing silently succeeds. */
function stubFetch(route: Route) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const hit = route(url) ?? { status: 404, body: { error: "unrouted in test" } }
    return {
      ok: hit.status >= 200 && hit.status < 300,
      status: hit.status,
      headers: new Headers({ "Content-Type": "application/json" }),
      json: async () => hit.body,
      text: async () => JSON.stringify(hit.body),
    } as unknown as Response
  })
  vi.stubGlobal("fetch", fn)
  return fn
}

const SYSTEM = "payment-production"
const CUSTOMER = "testbed-webshop"

const scopeRoutes: Route = (url) => {
  if (url === "/api/proxy/admin/customers") {
    return { status: 200, body: [{ customer_id: CUSTOMER, display_name: "Testbed Webshop" }] }
  }
  if (url.includes("/api/proxy/admin/accounts/scope/options/all")) {
    return {
      status: 200,
      body: {
        customer_id: CUSTOMER,
        accounts: [{ account_id: "111111111111", display_name: "Testbed", regions: ["eu-west-1"], group_ids: [], status: "active" }],
        groups: [],
      },
    }
  }
  return null
}

function withScope(route: Route): Route {
  return (url) => scopeRoutes(url) ?? route(url)
}

// ────────────────────────────────────────────────────────────────────────
// Org BRSS — api/global_org_score.py
// ────────────────────────────────────────────────────────────────────────

// The `if held:` return.
const ORG_HELD = {
  global_score: null,
  error: "system_evaluations_held",
  error_codes: ["IAM_USAGE_NOT_MEASURED"],
  message:
    "1 of 2 system(s) are held (IAM_USAGE_NOT_MEASURED): no org score is computed " +
    "while a system's IAM rows are unmeasured or could not be served.",
  held_systems: [
    { system_name: SYSTEM, held: true, error_code: "IAM_USAGE_NOT_MEASURED", unmeasured_iam_roles: 3 },
  ],
  system_count: 0,
  resources_analyzed: 0,
  system_breakdowns: [],
  worst_systems: [],
  partial: { succeeded: 1, failed: 0, held: 1, discovered: 2 },
  version: "global-org-v1",
  computed_at: "2026-09-29T08:00:00+00:00",
}

// GlobalOrgScore.to_dict() + computed_at (the scored return).
const ORG_SCORED = {
  global_score: 72,
  org_risk: 28.0,
  weighted_mean_risk: 24.5,
  weighted_p90_risk: 31.2,
  system_count: 1,
  resources_analyzed: 90,
  system_breakdowns: [
    {
      system_name: SYSTEM,
      system_score: 66,
      plane_scores: { permissions: 61, network: 70, data: 68 },
      convergence_load: 0.4,
      convergence_multiplier: 1.1,
      weak_planes: ["permissions"],
      visibility_ratio: 0.8,
      visibility_penalty: 2.0,
      environment: "production",
      criticality: "STANDARD",
      resource_count: 90,
      system_weight: 1.0,
      system_risk: 34.0,
    },
  ],
  worst_systems: [SYSTEM],
  version: "global-org-v1",
  computed_at: "2026-09-29T08:00:00+00:00",
}

// ────────────────────────────────────────────────────────────────────────
// 1 · System-detail header
// ────────────────────────────────────────────────────────────────────────

// api/posture_score.py get_posture_score return dict. dimensions/aggregate are
// the executed output for total_resources=12, total_roles=5, total_sgs=4,
// total_buckets=3, encrypted_buckets=3, private_buckets=2,
// lp_roles_with_data=5, lp_sum_allowed=40, lp_sum_used=30, sg_with_data=4,
// sg_sum_total_rules=10, sg_sum_unused_rules=2, with_traffic=6, with_api=6.
const POSTURE = {
  system_name: SYSTEM,
  overall_score: 73.53,
  grade: "C",
  confidence: "LOW",
  dimensions: {
    least_privilege: { score: 75.0, weight: 0.3, details: { total_roles: 5, roles_with_policy_data: 5, total_permissions: 40, used_permissions: 30, unused_permissions: 10 } },
    network_security: { score: 80.0, weight: 0.25, details: { total_security_groups: 4, sgs_with_rule_data: 4, total_rules: 10, used_rules: 8, unused_rules: 2 } },
    data_protection: { score: 83.33, weight: 0.15, details: { total_buckets: 3, encrypted_buckets: 3, private_buckets: 2 } },
    compliance: { score: null, weight: 0.15, details: { config_rules_compliant: "N/A", standards_met: [], reason: "no_config_compliance_data" } },
    observability: { score: 50.0, weight: 0.15, details: { total_resources: 12, with_flow_logs: 6, with_cloudtrail: 6 } },
  },
  top_issues: [],
  window_days: 30,
  resources_analyzed: 12,
  timestamp: "2026-09-29T08:00:00+00:00",
}

// api/posture_score.py get_posture_score_trend return (BRSS snapshot history).
const POSTURE_TREND = {
  window_days: 30,
  current: 70,
  previous: 61,
  delta: 9,
  series: [
    { date: "2026-09-27", score: 61, system_count: 2 },
    { date: "2026-09-28", score: 70, system_count: 2 },
  ],
  snapshot_count: 2,
}

// api/issues_summary.py v2_usage_unknown summary: READY, but BRSS held.
const V2_HELD_REASON =
  "usage of 2 V2 IAM role(s) is not measured under the active generation — no posture score computed, no snapshot written."
const ISSUES_SUMMARY_HELD = {
  total: 4, critical: 1, high: 1, medium: 1, low: 1,
  avg_health_score: null,
  serve_state: "READY",
  analysis_complete: true,
  counts_are_partial: true,
  failed_analyzers: [],
  failed_analyzer_codes: {},
  resources: { total: 12, with_issues: 4, unused_permission_gaps: null, iam_roles: 5, security_groups: 4, s3_buckets: 3 },
  system_name: SYSTEM,
  success: true,
  blast_radius_score: { serve_state: "READY", analysis_complete: true, score: null, delta: null, snapshot_persisted: false, held_reason: V2_HELD_REASON },
}

function headerRoutes(): Route {
  return withScope((url) => {
    if (url.includes("/api/proxy/issues-summary")) return { status: 200, body: ISSUES_SUMMARY_HELD }
    if (url.includes("/api/proxy/posture-score/trend")) return { status: 200, body: POSTURE_TREND }
    if (url.includes(`/api/proxy/posture-score/${SYSTEM}`)) return { status: 200, body: POSTURE }
    return null
  })
}

describe("system-detail header — the legacy posture score is not on the live route", () => {
  it.each(["overview", "least-privilege"])(
    "tab %s: the header never requests or shows /api/posture-score beside the BRSS",
    async (initialTab) => {
      const fetchMock = stubFetch(headerRoutes())
      render(
        <AccountScopeProvider>
          <SystemDetailDashboard systemName={SYSTEM} onBack={() => undefined} initialTab={initialTab} />
        </AccountScopeProvider>,
      )
      // Control: the mount DID run its reads (so the absence below is not a
      // component that fetched nothing).
      await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(2))
      await act(async () => {
        await new Promise((r) => setTimeout(r, 300))
      })
      const urls = fetchMock.mock.calls.map((c) => String(c[0]))
      expect(urls.filter((u) => u.includes("/api/proxy/posture-score"))).toEqual([])
      expect(screen.queryByText(/Posture ·/)).toBeNull()
      expect(document.body.textContent).not.toContain("Posture computed")
      // Control: had the header asked, the stub would have answered.
      const answered = await (await fetch(`/api/proxy/posture-score/${SYSTEM}`)).json()
      expect(answered.grade).toBe("C")
    },
  )
})

// ────────────────────────────────────────────────────────────────────────
// 2 · Management report drawer (Executive view)
// ────────────────────────────────────────────────────────────────────────

// api/executive_snapshot.py compose_system_executive_snapshot, executed on the
// route's no-driver branch — verbatim output.
const EXEC_SNAPSHOT_NOT_READY = {
  schema_version: 1,
  source: "neo4j",
  system_name: SYSTEM,
  computed_at: "2026-09-29T08:00:00+00:00",
  serve_state: "NOT_READY",
  analysis_complete: false,
  counts_are_partial: true,
  narrative: {
    tone: "unavailable",
    title: "Material risk is not established",
    body: "Cyntro has not completed a graph-backed attack-path reading for payment-production. No zero-risk conclusion is available.",
  },
  material_risk: {
    serve_state: "NOT_READY", analysis_complete: false, counts_are_lower_bounds: false, reason: "system_unavailable",
    systems_discovered: null, systems_scanned: null, systems_uncomputed: null, attack_paths: null, crown_jewels: null,
    high_risk_targets: null, critical_risk_targets: null, externally_exposed_jewels: null, top_risks: [], top_paths: [],
  },
  resource_risk: { serve_state: "NOT_READY", analysis_complete: false, reason: "resource_risk_unavailable", total: null, by_severity: {}, top_findings: [] },
  remediation: {
    serve_state: "NOT_READY", analysis_complete: false, reason: "remediation_candidates_unavailable", detail: "Neo4j not connected",
    returned_count: null, ready_on_page: null, held_on_page: null, more_may_exist: null, top_candidates: [],
  },
  evidence: { serve_state: "NOT_READY", analysis_complete: false, reason: "evidence_coverage_unavailable", healthy: null, degraded: null, missing: null, total: null, top_blockers: [] },
  outcomes: { serve_state: "NOT_READY", analysis_complete: false, reason: "system_outcomes_unavailable", events_count: null, permissions_removed: null, rollbacks_count: null },
  context: { serve_state: "NOT_READY", analysis_complete: false, reason: "system_context_unavailable", resource_count: null, resource_families: {} },
}

/** api/systems.py system_obj; health_score = calculate_health_score(c, h, m, l). */
function systemRow(findings: { critical: number; high: number; medium: number; low: number }, healthScore: number) {
  const total = findings.critical + findings.high + findings.medium + findings.low
  return {
    name: SYSTEM,
    displayName: SYSTEM,
    SystemName: SYSTEM,
    environment: "production",
    region: "eu-west-1",
    account_id: "111111111111",
    resourceCount: 12,
    resourceTypes: ["IAMRole"],
    criticality: "MISSION CRITICAL",
    status: healthScore >= 80 ? "healthy" : healthScore >= 60 ? "warning" : "at_risk",
    lastScan: "Unknown",
    lastScanAt: null,
    lastScanKind: null,
    resourceMetadataAt: null,
    health_score: healthScore,
    healthScore,
    critical_count: findings.critical,
    criticalIssues: findings.critical,
    high_count: findings.high,
    highIssues: findings.high,
    medium_count: findings.medium,
    mediumIssues: findings.medium,
    low_count: findings.low,
    lowIssues: findings.low,
    totalFindings: total,
    owner: null,
    businessCriticality: "MISSION CRITICAL",
    kind: "BUSINESS_SYSTEM",
    rankable: true,
    rejected: false,
    boundaryReason: null,
  }
}

function catalog(row: ReturnType<typeof systemRow>) {
  return {
    systems: [row],
    count: 1,
    success: true,
    scope: { customer_id: CUSTOMER, account_id: null, account_ids: [null], region: null, authoritative: true },
    timestamp: "2026-09-29T08:00:00+00:00",
  }
}

async function openReport(systems: unknown) {
  stubFetch(
    withScope((url) => {
      if (url.startsWith("/api/proxy/systems")) return { status: 200, body: systems }
      if (url.includes(`/api/proxy/dashboard/systems/${SYSTEM}`)) return { status: 200, body: EXEC_SNAPSHOT_NOT_READY }
      if (url.includes("/api/proxy/global-org-score")) return { status: 200, body: ORG_HELD }
      return null
    }),
  )
  render(
    <AccountScopeProvider>
      <HomeDashboardV3 initialSystem="" />
    </AccountScopeProvider>,
  )
  const open = await screen.findByRole("button", { name: /Create report/ })
  // The report context arrives from the cockpit once the snapshot lands.
  await waitFor(() => expect(document.body.textContent).toContain("Material risk is not established"))
  fireEvent.click(open)
  return screen.findByRole("dialog", { name: "Management report generator" })
}

describe("management report — the system score is a severity health score, never 'blast-radius'", () => {
  it("zero findings: /api/systems healthScore 100 is labelled a severity health score, not a blast-radius score", async () => {
    const dialog = await openReport(catalog(systemRow({ critical: 0, high: 0, medium: 0, low: 0 }, 100)))

    const sentence = await within(dialog).findByTestId("report-top-system-score")
    expect(sentence.textContent).toBe(
      "Its severity health score is 100/100 — computed from open finding counts, not the blast-radius score.",
    )
    const text = dialog.textContent ?? ""
    // No "blast-radius" wording attached to a number anywhere in the report.
    expect(text).not.toMatch(/blast-radius score is \d/i)
    expect(text).not.toMatch(/blast-radius security score\./i)
    expect(text).not.toContain("Current score")
    expect(within(dialog).getByText("Severity health score")).toBeTruthy()
    expect(within(dialog).getByTestId("report-score-method").textContent).toContain(
      "It is not the Blast Radius Security Score (BRSS)",
    )
    expect(text).not.toContain("Lower system BRSS indicates greater blast-radius risk")
  })

  it("control: a scored system with findings still renders its number, under the same label", async () => {
    const dialog = await openReport(catalog(systemRow({ critical: 1, high: 1, medium: 1, low: 1 }, 90)))
    const sentence = await within(dialog).findByTestId("report-top-system-score")
    expect(sentence.textContent).toBe(
      "Its severity health score is 90/100 — computed from open finding counts, not the blast-radius score.",
    )
    expect(within(dialog).getAllByText("90/100").length).toBeGreaterThan(0)
  })
})

// ────────────────────────────────────────────────────────────────────────
// 3 · FamilyStrip (Operations view)
// ────────────────────────────────────────────────────────────────────────

// api/service_risk_scores.py get_all_systems_with_layers return for one
// system; aggregate_layers is that function's loop over the one row
// (round(score*rc/rc, 2), float weight, 1 contributing system).
const ALL_SYSTEMS = {
  systems: [
    {
      name: SYSTEM,
      SystemName: SYSTEM,
      layers: {
        privilege: { score: 61, resource_count: 40 },
        network: { score: 70, resource_count: 30 },
        data: { score: 68, resource_count: 20 },
      },
      system_score: 66,
      criticality: "STANDARD",
      environment: "production",
      resource_count: 90,
    },
  ],
  total: 1,
  aggregate_layers: {
    privilege: { score: 61.0, weight: 40.0, contributing_systems: 1 },
    network: { score: 70.0, weight: 30.0, contributing_systems: 1 },
    data: { score: 68.0, weight: 20.0, contributing_systems: 1 },
  },
  errors: [],
  scope: { customer_id: CUSTOMER, account_id: null, region: null, authoritative: true },
  computed_at: "2026-09-29T08:00:00+00:00",
}

let FAMILY_AGGREGATE: unknown = null

beforeAll(async () => {
  // Run the real proxy over the backend shape; its output is what the strip reads.
  const real = globalThis.fetch
  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      json: async () => ALL_SYSTEMS,
    }) as unknown as Response) as typeof fetch
  try {
    const { GET } = await import("@/app/api/proxy/family-aggregate/route")
    FAMILY_AGGREGATE = await (await GET(new NextRequest("https://app.example/api/proxy/family-aggregate"))).json()
  } finally {
    globalThis.fetch = real
  }
})

function operationsRoutes(org: unknown): Route {
  return withScope((url) => {
    if (url.includes("/api/proxy/global-org-score")) return { status: 200, body: org }
    if (url.includes("/api/proxy/family-aggregate")) return { status: 200, body: FAMILY_AGGREGATE }
    return null
  })
}

/** Each FamilyStrip tile (label + score + "/100" in one card) — not a number found elsewhere. */
function expectStripTiles() {
  for (const [label, score] of [["Data", "68"], ["Permissions", "61"], ["Network", "70"]]) {
    const tile = screen
      .getAllByText(label)
      .map((el) => el.closest("section"))
      .find((sec) => sec?.textContent === `${label}${score}/100`)
    expect(tile, `${label} tile with ${score}/100`).toBeTruthy()
  }
}

function mountOperations() {
  nav.params = new URLSearchParams("view=operations")
  render(
    <AccountScopeProvider>
      <HomeDashboardV3 initialSystem="" />
    </AccountScopeProvider>,
  )
}

describe("FamilyStrip beside a held org BRSS", () => {
  it("the proxy output the strip reads is the backend's aggregate, translated", () => {
    expect(FAMILY_AGGREGATE).toEqual({
      families: {
        privilege: { score: 61, weight: 40, contributing_systems: 1 },
        network: { score: 70, weight: 30, contributing_systems: 1 },
        data: { score: 68, weight: 20, contributing_systems: 1 },
      },
      contributing_systems: 1,
      total_systems: 1,
      errors: [],
    })
  })

  it("held: the strip says its plane scores are a different metric and do not reflect the held BRSS — and still shows them", async () => {
    stubFetch(operationsRoutes(ORG_HELD))
    mountOperations()

    await screen.findByTestId("org-brss-held")
    const note = await screen.findByTestId("family-strip-brss-held-note")
    expect(note.textContent).toContain("service risk scores")
    expect(note.textContent).toContain("a different metric from the Blast Radius Score")
    expect(note.textContent).toContain(
      "do not reflect the org BRSS, which is held (system_evaluations_held, IAM_USAGE_NOT_MEASURED)",
    )
    // Real data is labelled, not hidden.
    for (const n of ["61", "70", "68"]) expect(screen.getAllByText(n).length).toBeGreaterThan(0)
    expectStripTiles()
  })

  it("control: a scored org BRSS carries no held note, and the plane scores render", async () => {
    stubFetch(operationsRoutes(ORG_SCORED))
    mountOperations()

    const score = await screen.findByTestId("org-brss-score")
    expect(score.textContent).toContain("72")
    await waitFor(() => expect(screen.getAllByText("61").length).toBeGreaterThan(0))
    expectStripTiles()
    expect(screen.queryByTestId("family-strip-brss-held-note")).toBeNull()
  })
})
