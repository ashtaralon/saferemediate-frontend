/**
 * BRSS held-state display: a held score is an ABSENCE, never a number.
 *
 * Every payload below copies the literal shape the backend builds (backend
 * branch claude/cf01-lp-d2-combined @ 93ce6beb5):
 *   api/global_org_score.py        — `if held:` return (system_evaluations_held)
 *   api/business_systems_ranked.py — held_systems row + held `error` string
 *   api/business_system.py         — _compose_brss_with_delta held dict
 *   api/issues_summary.py          — V2-usage-unknown summary + held brss_payload
 * Values (system names, counts) are test inputs; no key is invented.
 *
 * Absence assertions are paired: each "no score here" check has a scored
 * control in which the same query DOES find the score, so none is vacuous.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import { NextRequest } from "next/server"

import { HeroBrssCard } from "@/components/dashboard/v3/hero-brss-card"
import { BusinessSystemsRanking } from "@/components/business-system/business-systems-ranking"
import {
  BrssDeltaPanel,
  type DetailEnhancements,
} from "@/components/business-system/detail-enhancement-panels"
import { SystemBlastRadiusHero } from "@/components/system-detail/blast-radius-hero"
import { HomeStatsBanner } from "@/components/home-stats-banner"
import { issuesSummaryBrssHold, orgScoreHold } from "@/lib/brss-held"
import type { BlastRadiusScore } from "@/lib/types"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  try {
    window.localStorage.clear()
  } catch {
    /* no storage */
  }
})

type Route = (url: string) => { status: number; body: unknown } | null

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

// ────────────────────────────────────────────────────────────────────────
// Org hero — /api/global-org-score
// ────────────────────────────────────────────────────────────────────────

// api/global_org_score.py, the `if held:` return. held_systems entries are the
// _evaluate_system held dict: system_name, held, error_code, unmeasured_iam_roles.
const ORG_HELD = {
  global_score: null,
  error: "system_evaluations_held",
  error_codes: ["IAM_USAGE_NOT_MEASURED"],
  message:
    "1 of 2 system(s) are held (IAM_USAGE_NOT_MEASURED): no org score is computed " +
    "while a system's IAM rows are unmeasured or could not be served.",
  held_systems: [
    {
      system_name: "payment-production",
      held: true,
      error_code: "IAM_USAGE_NOT_MEASURED",
      unmeasured_iam_roles: 3,
    },
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
  system_count: 2,
  resources_analyzed: 140,
  system_breakdowns: [
    {
      system_name: "payment-production",
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
  worst_systems: ["payment-production"],
  version: "global-org-v1",
  computed_at: "2026-09-29T08:00:00+00:00",
}

// Legacy weighted mean the hero used to fall back to. Must never be fetched.
const LEGACY_POSTURE = { overall_score: 88, resources_analyzed: 140, system_count: 2, source: "legacy" }

const TREND = {
  window_days: 30,
  current: 70,
  previous: 65,
  delta: 5,
  series: [
    { date: "2026-09-27", score: 65, system_count: 2 },
    { date: "2026-09-28", score: 70, system_count: 2 },
  ],
  snapshot_count: 2,
}

function orgRoutes(org: unknown): Route {
  return (url) => {
    if (url.includes("/api/proxy/global-org-score")) return { status: 200, body: org }
    if (url.includes("/api/proxy/posture-score/trend")) return { status: 200, body: TREND }
    if (url.includes("/api/proxy/posture-score")) return { status: 200, body: LEGACY_POSTURE }
    return null
  }
}

describe("org hero — held org score", () => {
  it("renders the typed code, the backend's reason and the held system — no number", async () => {
    const fetchMock = stubFetch(orgRoutes(ORG_HELD))
    render(<HeroBrssCard />)

    const held = await screen.findByTestId("org-brss-held")
    expect(within(held).getByText("system_evaluations_held")).toBeTruthy()
    expect(within(held).getByText("IAM_USAGE_NOT_MEASURED")).toBeTruthy()
    expect(within(held).getByText(ORG_HELD.message)).toBeTruthy()
    const row = within(held).getByTestId("org-brss-held-system-payment-production")
    expect(row.textContent).toContain("payment-production")
    expect(row.textContent).toContain("usage of 3 IAM roles not measured")
    expect(within(held).getByTestId("org-brss-held-count").textContent).toBe("1 of 2 systems held")

    // No score anywhere in the card: not the legacy 88, not a trend value, no /100.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByTestId("org-brss-score")).toBeNull()
    expect(document.body.textContent).not.toMatch(/\/100/)
    expect(document.body.textContent).not.toContain("88")
    expect(document.body.textContent).not.toContain("+5 pts")
    // The legacy fallback endpoint is never consulted.
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => /\/api\/proxy\/posture-score(\?|$)/.test(u))).toBe(false)
  })

  it("a held answer evicts a cached score instead of standing beside it", async () => {
    window.localStorage.setItem(
      "cyntro:swr:global-org-score",
      JSON.stringify({ ts: Date.now(), data: ORG_SCORED }),
    )
    stubFetch(orgRoutes(ORG_HELD))
    render(<HeroBrssCard />)

    await screen.findByTestId("org-brss-held")
    expect(screen.queryByTestId("org-brss-score")).toBeNull()
    expect(window.localStorage.getItem("cyntro:swr:global-org-score")).toBeNull()
  })

  it("a non-held failure (global_score null) is an error card, not the legacy score", async () => {
    const fetchMock = stubFetch(
      orgRoutes({
        global_score: null,
        error: "all_system_evaluations_failed",
        message: "Discovered 2 system(s) but every per-system BRSS computation failed.",
        system_count: 0,
        resources_analyzed: 0,
        system_breakdowns: [],
        worst_systems: [],
        partial: { succeeded: 0, failed: 2, discovered: 2 },
        version: "global-org-v1",
      }),
    )
    render(<HeroBrssCard />)
    await screen.findByText(/every per-system BRSS computation failed/)
    expect(document.body.textContent).not.toContain("88")
    expect(document.body.textContent).not.toMatch(/\/100/)
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => /\/api\/proxy\/posture-score(\?|$)/.test(u))).toBe(false)
  })

  it("control: a scored org renders its number (the absence checks above are not vacuous)", async () => {
    stubFetch(orgRoutes(ORG_SCORED))
    render(<HeroBrssCard />)
    const score = await screen.findByTestId("org-brss-score")
    expect(score.textContent).toContain("72")
    expect(score.textContent).toContain("/100")
    expect(screen.queryByTestId("org-brss-held")).toBeNull()
    expect(orgScoreHold(ORG_SCORED)).toBeNull()
  })
})

// ────────────────────────────────────────────────────────────────────────
// Ranking — /api/business-systems/ranked
// ────────────────────────────────────────────────────────────────────────

const HELD_REASON =
  "usage of 3 V2 IAM role(s) is not measured under the active generation — no BRSS score computed."

// api/business_systems_ranked.py held_systems.append({...}).
const HELD_ROW = {
  name: "payment-production",
  kind: "BUSINESS_SYSTEM",
  member_count: 97,
  business_tier: "MISSION_CRITICAL",
  owner: null,
  brss_score: null,
  held: true,
  error_code: "IAM_USAGE_NOT_MEASURED",
  held_reason: HELD_REASON,
  unmeasured_iam_roles: 3,
  href: "/business-systems?systemName=payment-production",
}

// api/business_systems_ranked.py systems.append({...}).
const SCORED_ROW = {
  name: "checkout",
  kind: "BUSINESS_SYSTEM",
  rankable: true,
  member_count: 41,
  business_tier: "STANDARD",
  owner: null,
  tier_multiplier: 1.0,
  brss_score: 71.2,
  system_rank_score: 71.2,
  coverage_ratio: 0.8,
  coverage_ceiling: 90,
  coverage: { scanned_types: ["IAMRole"], excluded_types: [], scanned_instance_count: 40, known_instance_count: 41 },
  resource_count: 40,
  ownership_unverified_count: null,
  ownership_unverified_reason: "not countable within the tenant boundary",
  scanned_families_empty_under_scope: [],
  top_drivers: [],
  shared_resource_drivers: [],
  href: "/business-systems?systemName=checkout",
}

function rankedPayload(systems: unknown[], held: typeof HELD_ROW[]) {
  const payload: Record<string, unknown> = {
    systems,
    count: systems.length,
    held_systems: held,
    held_count: held.length,
    positioning: "logical_blast_radius",
    positioning_copy:
      "Cyntro maps your cloud into logical systems and ranks where exploitable blast radius is highest.",
    context_coverage: { coverage_ratio: 0, phase4_copy_unlocked: false },
    scope: { customer_id: null, account_id: null },
    computed_at: "2026-09-29T08:00:00+00:00",
  }
  if (held.length) {
    const codes = [...new Set(held.map((h) => h.error_code))].sort()
    payload.error_codes = codes
    payload.error =
      `${held.length} system(s) held, not ranked (${codes.join(", ")}): ` +
      held.map((h) => `${h.name}: ${h.held_reason}`).join("; ")
  }
  return payload
}

describe("ranking — scored and held systems together", () => {
  it("lists the held system with its code and reason, outside the ranking, with no score", async () => {
    stubFetch((url) =>
      url.includes("/api/proxy/business-systems/ranked")
        ? { status: 200, body: rankedPayload([SCORED_ROW], [HELD_ROW]) }
        : null,
    )
    render(<BusinessSystemsRanking />)

    const heldRow = await screen.findByTestId("bsm-held-row-payment-production")
    expect(heldRow.textContent).toContain("payment-production")
    expect(heldRow.textContent).toContain("held")
    expect(within(heldRow).getByTestId("bsm-held-code-payment-production").textContent).toBe(
      "IAM_USAGE_NOT_MEASURED",
    )
    expect(within(heldRow).getByTestId("bsm-held-reason-payment-production").textContent).toBe(
      HELD_REASON,
    )
    // No score and no rank for the held system.
    expect(heldRow.textContent).not.toMatch(/BRSS\s+\d/)
    expect(heldRow.textContent).not.toMatch(/#\d/)
    expect(screen.queryByTestId("bsm-rank-row-payment-production")).toBeNull()
    expect(screen.getByTestId("bsm-held-count").textContent).toBe("1 held")

    // Control in the same render: the scored system is ranked #1 with its number.
    const scoredRow = screen.getByTestId("bsm-rank-row-checkout")
    expect(scoredRow.textContent).toContain("#1")
    expect(scoredRow.textContent).toContain("BRSS 71.2")
  })

  it("every system held: the list renders held rows, not an error in place of the list", async () => {
    stubFetch((url) =>
      url.includes("/api/proxy/business-systems/ranked")
        ? { status: 200, body: rankedPayload([], [HELD_ROW]) }
        : null,
    )
    render(<BusinessSystemsRanking />)
    const heldRow = await screen.findByTestId("bsm-held-row-payment-production")
    expect(heldRow.textContent).toContain(HELD_REASON)
    expect(screen.getByTestId("bsm-ranking")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/BRSS\s+\d/)
  })

  it("control: a fully scored ranking has no held section", async () => {
    stubFetch((url) =>
      url.includes("/api/proxy/business-systems/ranked")
        ? { status: 200, body: rankedPayload([SCORED_ROW], []) }
        : null,
    )
    render(<BusinessSystemsRanking />)
    const scoredRow = await screen.findByTestId("bsm-rank-row-checkout")
    expect(scoredRow.textContent).toContain("BRSS 71.2")
    expect(scoredRow.textContent).toContain("Coverage 80%")
    expect(screen.queryByTestId("bsm-held-systems")).toBeNull()
  })
})

// ────────────────────────────────────────────────────────────────────────
// Detail — /api/business-system/{name}/detail-enhancements
// ────────────────────────────────────────────────────────────────────────

// api/business_system.py _compose_brss_with_delta held return, and the
// brss_delta_attribution the route builds from `delta = brss.get("delta") or {}`.
const DETAIL_HELD: DetailEnhancements = {
  system_name: "payment-production",
  brss: {
    score: null,
    top_drivers: [],
    held: true,
    error: "IAM_USAGE_NOT_MEASURED",
    error_code: "IAM_USAGE_NOT_MEASURED",
    unmeasured_iam_roles: 3,
    held_reason:
      "usage of 3 V2 IAM role(s) is not measured under the active generation — no posture score computed, no snapshot written.",
  },
  brss_delta_attribution: {
    previous_score: null,
    current_score: null,
    score_delta: null,
    state_change: null,
    scope_expansion: null,
    resources_added: undefined,
    resources_removed: undefined,
    resources_changed: undefined,
    previous_timestamp: null,
  },
  remediation_actions: [],
}

const DETAIL_SCORED: DetailEnhancements = {
  system_name: "checkout",
  brss: { score: 65.5, coverage_ratio: 0.8, coverage_ceiling: 90, top_drivers: [] },
  brss_delta_attribution: {
    previous_score: 60.0,
    current_score: 65.5,
    score_delta: 5.5,
    state_change: 5.5,
    scope_expansion: 0,
    resources_added: 1,
    resources_removed: 0,
    resources_changed: 2,
    previous_timestamp: "2026-09-28T08:00:00+00:00",
  },
}

describe("detail — held BRSS", () => {
  it("shows the typed code and reason; no before/after numbers", () => {
    render(<BrssDeltaPanel pack={DETAIL_HELD} />)
    const panel = screen.getByTestId("brss-held-panel")
    expect(within(panel).getByText("IAM_USAGE_NOT_MEASURED")).toBeTruthy()
    expect(within(panel).getByText(DETAIL_HELD.brss!.held_reason!)).toBeTruthy()
    expect(screen.queryByTestId("brss-delta-panel")).toBeNull()
    expect(panel.textContent).not.toMatch(/\d+\.\d/)
    expect(panel.textContent).not.toMatch(/Previous|Current/)
  })

  it("control: a scored system shows before/after", () => {
    render(<BrssDeltaPanel pack={DETAIL_SCORED} />)
    const panel = screen.getByTestId("brss-delta-panel")
    expect(panel.textContent).toContain("60.0")
    expect(panel.textContent).toContain("65.5")
    expect(panel.textContent).toMatch(/\d+\.\d/)
    expect(screen.queryByTestId("brss-held-panel")).toBeNull()
  })
})

// ────────────────────────────────────────────────────────────────────────
// Issues summary — /api/issues/summary (V2 usage unknown)
// ────────────────────────────────────────────────────────────────────────

const V2_HELD_REASON =
  "usage of 2 V2 IAM role(s) is not measured under the active generation — no posture score computed, no snapshot written."

// api/issues_summary.py `summary = {...}` with v2_usage_unknown: READY and
// complete, but avg_health_score / unused_permission_gaps null, counts partial,
// and the held brss_payload — which still carries the overlay (the overlay block
// runs after the held branch), whose score is a number over the measured subset.
function issuesSummaryV2Unknown() {
  return {
    total: 4,
    critical: 1,
    high: 1,
    medium: 1,
    low: 1,
    avg_health_score: null,
    serve_state: "READY",
    analysis_complete: true,
    counts_are_partial: true,
    failed_analyzers: [],
    failed_analyzer_codes: {},
    by_severity: { critical: 1, high: 1, medium: 1, low: 1 },
    by_source: { iam: 2, securityGroups: 1, s3: 1, networkAcls: 0 },
    byCategory: {
      leastPrivilege: { total: 4, iam: 2, securityGroups: 1, s3: 1, networkAcls: 0 },
      networkExposure: { total: 0, publicPorts: 0, openCidrs: 0 },
      permissions: {
        allowed: 40,
        used: 30,
        unused: 10,
        gap_percentage: 25.0,
        unmeasured_resources: 2,
        counts_are_partial: true,
      },
    },
    resources: {
      total: 12,
      with_issues: 4,
      unused_permission_gaps: null,
      iam_roles: 5,
      security_groups: 4,
      s3_buckets: 3,
    },
    trend: { direction: "stable", change: 0, period: "7d" },
    infrastructure: {
      containerClusters: 0,
      kubernetesWorkloads: 0,
      standaloneVMs: 0,
      vmScalingGroups: 0,
      relationalDatabases: 0,
      blockStorage: 0,
      fileStorage: 0,
      objectStorage: 0,
    },
    observation_days: 365,
    system_name: "payment-production",
    success: true,
    blast_radius_score: {
      serve_state: "READY",
      analysis_complete: true,
      score: null,
      coverage: {
        ratio: 0.33,
        scanned_types: ["IAMRole", "S3Bucket", "SecurityGroup", "NetworkACL"],
        excluded_types: ["KMSKey"],
        scanned_instance_count: 12,
        known_instance_count: 30,
        registry_total: 12,
      },
      delta: null,
      snapshot_persisted: false,
      held_reason: V2_HELD_REASON,
      overlay: {
        score: 64,
        score_base: 70,
        convergence_multiplier: 1.1,
        convergence_load: 0.4,
        weak_planes: ["permissions"],
        visibility_penalty: 2.0,
        visibility_ratio: 0.33,
        environment: "production",
        base_breakdown: {},
        version: "system-overlay-v1",
      },
    },
  }
}

describe("issues summary — held BRSS reaches the system hero as held", () => {
  it("the helper reads the V2-unknown payload as held, with the backend's reason and no invented code", () => {
    const hold = issuesSummaryBrssHold(issuesSummaryV2Unknown())
    expect(hold).toEqual({ codes: [], reason: V2_HELD_REASON })
  })

  it("the hero never paints the overlay's number for a score-less BRSS", () => {
    const brss = issuesSummaryV2Unknown().blast_radius_score as unknown as BlastRadiusScore
    render(
      <SystemBlastRadiusHero
        brss={brss}
        brssHistory={[]}
        systemName="payment-production"
        resourceCount={12}
        hold={issuesSummaryBrssHold(issuesSummaryV2Unknown())}
      />,
    )
    const empty = screen.getByTestId("system-blast-radius-hero-empty")
    expect(empty.getAttribute("data-empty-reason")).toBe("held")
    expect(empty.textContent).toContain("held for payment-production")
    expect(empty.textContent).toContain(V2_HELD_REASON)
    expect(screen.getByTestId("brss-held-no-code")).toBeTruthy()
    expect(document.body.textContent).not.toContain("64")
    expect(document.body.textContent).not.toMatch(/\/100/)
    expect(screen.queryByTestId("system-blast-radius-hero")).toBeNull()
  })

  it("an analyzer-held summary shows the typed analyzer code and integrityReason", () => {
    render(
      <SystemBlastRadiusHero
        brss={null}
        brssHistory={[]}
        systemName="payment-production"
        resourceCount={0}
        emptyReason="incomplete"
        hold={{
          codes: ["DATA_ENGINE_VERSION_MISSING"],
          reason:
            "The issues summary could not be computed. Counts are unavailable — this is not an empty result set. IAM roles are not served (DATA_ENGINE_VERSION_MISSING).",
        }}
      />,
    )
    const empty = screen.getByTestId("system-blast-radius-hero-empty")
    expect(within(empty).getByTestId("brss-held-code").textContent).toBe("DATA_ENGINE_VERSION_MISSING")
    expect(empty.textContent).toContain("IAM roles are not served")
  })

  it("control: a scored BRSS renders its number", () => {
    const scored = {
      score: 70,
      score_raw: 72,
      coverage_ceiling: 90,
      coverage_ratio: 0.8,
      coverage_excluded_types: [],
      total_contribution: 10,
      scaled_contribution: 8,
      tail_contribution: 2,
      resource_count: 12,
      per_family: { iam: 66, network: 74, data: 71 },
      top_drivers: [],
      version: "brss-v1",
    } as unknown as BlastRadiusScore
    render(
      <SystemBlastRadiusHero brss={scored} brssHistory={[]} systemName="checkout" resourceCount={12} />,
    )
    expect(screen.getByTestId("system-blast-radius-hero").textContent).toContain("/100")
    expect(screen.getByTestId("system-blast-radius-hero").textContent).toContain("70")
  })
})

describe("issues summary — legacy home health widget", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  it("avg_health_score null maps to null — not the legacy metric, not 100 — and renders 'Not computed'", async () => {
    const fetchMock = stubFetch((url) => {
      if (url.includes("/api/proxy/issues-summary")) return { status: 200, body: issuesSummaryV2Unknown() }
      if (url.includes("/api/proxy/dashboard-metrics"))
        return { status: 200, body: { avg_health_score: 91, averageScore: 91 } }
      return null
    })
    const { fetchInfrastructure } = await import("@/lib/api-client")
    const infra = await fetchInfrastructure()
    expect(infra.stats.avgHealthScore).toBeNull()
    expect(infra.stats.averageScore).toBeNull()
    expect(fetchMock.mock.calls.map((c) => String(c[0])).some((u) => u.includes("dashboard-metrics"))).toBe(false)

    render(<HomeStatsBanner {...infra.stats} />)
    expect(screen.getByTestId("home-avg-health-not-computed").textContent).toBe("Not computed")
    expect(screen.queryByTestId("home-avg-health-score")).toBeNull()
    expect(document.body.textContent).not.toContain("100")
    expect(document.body.textContent).not.toContain("91")
  })

  it("control: a READY scored summary shows its avg_health_score", async () => {
    stubFetch((url) =>
      url.includes("/api/proxy/issues-summary")
        ? { status: 200, body: { ...issuesSummaryV2Unknown(), avg_health_score: 82, counts_are_partial: false } }
        : null,
    )
    const { fetchInfrastructure } = await import("@/lib/api-client")
    const infra = await fetchInfrastructure()
    expect(infra.stats.avgHealthScore).toBe(82)
    render(<HomeStatsBanner {...infra.stats} />)
    expect(screen.getByTestId("home-avg-health-score").textContent).toBe("82")
    expect(screen.queryByTestId("home-avg-health-not-computed")).toBeNull()
  })
})

// ────────────────────────────────────────────────────────────────────────
// Proxy — /api/proxy/issues-summary
// ────────────────────────────────────────────────────────────────────────

describe("issues-summary proxy never replays or caches a score it cannot vouch for", () => {
  function scoredSummary() {
    const s = issuesSummaryV2Unknown()
    return {
      ...s,
      avg_health_score: 82,
      counts_are_partial: false,
      resources: { ...s.resources, unused_permission_gaps: 10 },
      blast_radius_score: { ...s.blast_radius_score, score: 70, held_reason: undefined },
    }
  }

  it("a stale replay after a backend failure carries no score", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { GET } = await import("@/app/api/proxy/issues-summary/route")
    const url = "https://app.example/api/proxy/issues-summary?systemName=stale-replay-case"

    stubFetch(() => ({ status: 200, body: scoredSummary() }))
    const first = await (await GET(new NextRequest(url))).json()
    expect(first.avg_health_score).toBe(82) // control: the live answer carries it

    // Age the cache past its TTL so the next request goes to the backend.
    const realNow = Date.now
    vi.spyOn(Date, "now").mockImplementation(() => realNow() + 6 * 60 * 1000)
    stubFetch(() => ({ status: 503, body: { detail: "down" } }))
    const replay = await (await GET(new NextRequest(url))).json()
    expect(replay.fromStaleCache).toBe(true)
    expect(replay.avg_health_score).toBeNull()
    expect(replay.blast_radius_score).toBeNull()
    expect(replay.total).toBe(4) // counts may still be shown, marked stale
  })

  it("a held-BRSS summary is passed through intact and not cached", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { GET } = await import("@/app/api/proxy/issues-summary/route")
    const url = "https://app.example/api/proxy/issues-summary?systemName=held-no-cache-case"

    const fetchMock = stubFetch(() => ({ status: 200, body: issuesSummaryV2Unknown() }))
    const res1 = await GET(new NextRequest(url))
    const body1 = await res1.json()
    expect(res1.status).toBe(200)
    expect(body1.blast_radius_score.held_reason).toBe(V2_HELD_REASON)
    expect(body1.avg_health_score).toBeNull()
    expect(body1.counts_are_partial).toBe(true)
    expect(res1.headers.get("Cache-Control")).toBe("no-store")

    await GET(new NextRequest(url))
    expect(fetchMock).toHaveBeenCalledTimes(2) // no cache HIT for a held answer
  })
})
