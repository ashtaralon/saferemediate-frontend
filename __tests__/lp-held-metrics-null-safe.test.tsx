/**
 * Withheld usage-derived values render as held — never 0, 0%, "null%", or a crash.
 *
 * Shapes are the backend's own models (saferemediate-backend, PR #2281 head 7fcd1d609):
 *   GET  /api/least-privilege/metrics       — MetricsResponse (api/least_privilege.py). The three
 *        usage-derived fields are what row U3 nulls; `error_code` / `held_reason` are the pair every
 *        held BRSS already carries, and the pair this card reads.
 *   GET  /api/issues-summary                — the `elif usage_unverified_inputs:` brss_payload
 *        (api/issues_summary.py), verbatim keys.
 *   POST /api/least-privilege/simulate-fix  — SimulateFixResponse, legacy branch (row U5): severity,
 *        gap, BRS before/after and confidence null.
 * Numbers and names are test inputs; no key is invented beyond the ones named above.
 *
 * Each "not shown" assertion has a control in which the same query finds the real value.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import { WildcardBloatCard } from "@/components/dashboard/v3/wildcard-bloat-card"
import { SystemBlastRadiusHero } from "@/components/system-detail/blast-radius-hero"
import { IAMSimulateFixModal } from "@/components/IAMSimulateFixModal"
import { issuesSummaryBrssHold, lpMetricsHold, readyOverviewBrss } from "@/lib/brss-held"
import type { SimulateFixResponse } from "@/lib/types"

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

function serveMetrics(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      if (url.includes("/api/proxy/least-privilege/metrics")) return Response.json(body)
      return Response.json({ error: "unrouted in test" }, { status: 404 })
    }),
  )
}

// ── /api/least-privilege/metrics ───────────────────────────────────────

const UNVERIFIED = "IAM_USAGE_GENERATION_UNVERIFIED"
const METRICS_HELD_REASON = "test input: usage counts are read off an unverified IAM usage generation"

function metricsScored() {
  return {
    totalRoles: 12,
    analyzedRoles: 12,
    rolesWithBloat: 5,
    averageBloatPercentage: 37.6,
    totalUnusedPermissions: 1234,
    totalRecommendedReductions: 1234,
    lastAnalysisDate: "2026-09-29T10:00:00+00:00",
    bloatPercentageDeltaPp: -2.5,
    bloatBaselineAgeDays: 7,
    bloatBaselineTimestamp: "2026-09-22T10:00:00+00:00",
  }
}

function metricsHeld(overrides: Record<string, unknown> = {}) {
  return {
    ...metricsScored(),
    rolesWithBloat: null,
    averageBloatPercentage: null,
    totalUnusedPermissions: null,
    totalRecommendedReductions: null,
    bloatPercentageDeltaPp: null,
    bloatBaselineAgeDays: null,
    bloatBaselineTimestamp: null,
    error_code: UNVERIFIED,
    held_reason: METRICS_HELD_REASON,
    ...overrides,
  }
}

describe("Wildcard Bloat card — withheld /metrics values", () => {
  it("renders held with the typed code and reason, and no number", async () => {
    serveMetrics(metricsHeld())
    render(<WildcardBloatCard />)

    const held = await screen.findByTestId("wildcard-bloat-held")
    expect(within(held).getByTestId("brss-held-code").textContent).toBe(UNVERIFIED)
    expect(within(held).getByTestId("brss-held-reason").textContent).toBe(METRICS_HELD_REASON)
    expect(held.textContent).toContain("not available")
    expect(screen.getByText("Not computed yet — this is not an all-clear")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/\d\s*%/)
    expect(document.body.textContent).not.toContain("unused permissions across")
    expect(document.body.textContent).not.toContain("NaN")
  })

  it("holds each field on its own: one null count is enough, and nothing crashes", async () => {
    serveMetrics({ ...metricsScored(), totalUnusedPermissions: null })
    render(<WildcardBloatCard />)

    const held = await screen.findByTestId("wildcard-bloat-held")
    // No code sent: the notice says so rather than guessing one.
    expect(within(held).getByTestId("brss-held-no-code")).toBeTruthy()
    expect(document.body.textContent).not.toContain("38")
    expect(document.body.textContent).not.toContain("-2.5pp")
  })

  it.each([["averageBloatPercentage"], ["rolesWithBloat"], ["totalUnusedPermissions"]])(
    "a null %s alone holds the card",
    async (field) => {
      serveMetrics({ ...metricsScored(), [field]: null })
      render(<WildcardBloatCard />)
      expect(await screen.findByTestId("wildcard-bloat-held")).toBeTruthy()
    },
  )

  it("control: real values render exactly as before", async () => {
    serveMetrics(metricsScored())
    const { container } = render(<WildcardBloatCard />)

    await screen.findByText("38")
    expect(screen.queryByTestId("wildcard-bloat-held")).toBeNull()
    const text = container.textContent ?? ""
    expect(text).toContain("38%")
    expect(text).toContain("-2.5pp")
    expect(text).toContain("1,234 unused permissions across 5 / 12 roles")
    expect(text).toContain("vs 7d ago — narrowing")
  })

  it("the helper holds on a null or absent value and passes a scored payload", () => {
    expect(lpMetricsHold(metricsScored())).toBeNull()
    expect(lpMetricsHold(metricsHeld())).toEqual({ codes: [UNVERIFIED], reason: METRICS_HELD_REASON })
    const { averageBloatPercentage: _omit, ...absent } = metricsScored()
    expect(lpMetricsHold(absent)).toEqual({ codes: [], reason: null })
  })
})

// ── /api/issues-summary: the hold carries its typed code ───────────────

const BRSS_HELD_REASON =
  "3 scored resource(s) carry inputs graded from IAM usage the active generation has not verified — " +
  "no current posture score served, no snapshot written."

function issuesSummaryUnverified() {
  return {
    serve_state: "READY",
    analysis_complete: true,
    blast_radius_score: {
      serve_state: "READY",
      analysis_complete: true,
      score: null,
      coverage: {
        ratio: 0.5,
        scanned_types: ["IAMRole", "S3Bucket"],
        excluded_types: ["IAMUser"],
        scanned_instance_count: 3,
        known_instance_count: 6,
        registry_total: 4,
      },
      delta: null,
      snapshot_persisted: false,
      error_code: UNVERIFIED,
      held_reason: BRSS_HELD_REASON,
      historical_score: null,
      historical_score_withheld_reason: "SNAPSHOT_VERIFICATION_NOT_RECORDED",
    },
    failed_analyzer_codes: {},
  }
}

describe("issues summary — a held BRSS carries error_code to the hero", () => {
  it("the helper returns the score's typed code with the backend's reason", () => {
    expect(issuesSummaryBrssHold(issuesSummaryUnverified())).toEqual({
      codes: [UNVERIFIED],
      reason: BRSS_HELD_REASON,
    })
    expect(readyOverviewBrss(issuesSummaryUnverified()).hold?.codes).toEqual([UNVERIFIED])
  })

  it("the typed code comes before the analyzer codes, without duplicates", () => {
    const payload = {
      ...issuesSummaryUnverified(),
      failed_analyzer_codes: { iam: "ANALYZER_TIMEOUT", s3: UNVERIFIED },
    }
    expect(issuesSummaryBrssHold(payload)?.codes).toEqual([UNVERIFIED, "ANALYZER_TIMEOUT"])
  })

  it("the hero shows the code, not the no-code sentence", () => {
    const state = readyOverviewBrss(issuesSummaryUnverified())
    render(
      <SystemBlastRadiusHero
        brss={null}
        brssHistory={[]}
        systemName="test-system"
        resourceCount={6}
        emptyReason={state.emptyReason}
        hold={state.hold}
      />,
    )
    const notice = screen.getByTestId("system-brss-held-notice")
    expect(within(notice).getByTestId("brss-held-code").textContent).toBe(UNVERIFIED)
    expect(within(notice).getByTestId("brss-held-reason").textContent).toBe(BRSS_HELD_REASON)
    expect(within(notice).queryByTestId("brss-held-no-code")).toBeNull()
  })
})

// ── simulate-fix legacy branch (U5) ────────────────────────────────────

function simulateFix(held: boolean): SimulateFixResponse {
  return {
    resource: {
      id: "test-role", type: "IAMRole", system: "test-system",
      severity: held ? null : "HIGH",
      ...(held ? { severity_withheld_reason: UNVERIFIED } : {}),
      shared: false, shared_confidence: "unknown", consumers: [],
    },
    problem: {
      summary: "test input summary",
      gap_percent: held ? null : 40,
      unused_count: held ? null : 8,
      used_count: held ? null : 12,
      top_risk_reasons: [],
    },
    evidence: {
      observation_window_days: 30, evidence_sources: ["CloudTrail"],
      confidence: held ? null : "medium",
      ...(held ? { confidence_withheld_reason: UNVERIFIED } : {}),
      completeness: "partial", caveats: [], visibility_signals: { cloudtrail: true },
    },
    simulation: {
      action_type: "none", summary: "No removal is authorized by this preview.",
      kept_permissions: 20, removed_permissions: 0, kept_examples: [], removed_examples: [],
    },
    projected_effect: {
      blast_radius_score_before: held ? null : 55, blast_radius_score_after: null,
      blast_radius_score_delta: null, family_scores_before: null, family_scores_after: null,
      resource_risk_contribution_before: null, resource_risk_contribution_after: null,
      projection_available: false, current_state_available: !held,
    },
    safety: {
      decision: "blocked", decision_canonical: "BLOCK", rollback_available: false,
      snapshot_required: true, preflight_required: true, unsafe_reasons: [],
    },
    decision_persistence: {
      persisted: false, decision_key: "", evaluated_at: "", expires_at: "",
    },
  }
}

function metric(label: string): HTMLElement {
  const heading = screen.getByText(label)
  if (!heading.parentElement) throw new Error(`Metric ${label} has no container`)
  return heading.parentElement
}

describe("IAMSimulateFixModal — withheld severity, gap, BRS and confidence", () => {
  it("renders every withheld value as Unknown with its reason", () => {
    render(<IAMSimulateFixModal isOpen onClose={() => {}} result={simulateFix(true)} />)

    const severity = screen.getByTestId("simulate-fix-severity")
    expect(severity.textContent).toBe("Unknown")
    expect(severity.getAttribute("data-held")).toBe("true")
    expect(screen.getByTestId("simulate-fix-severity-withheld-reason").textContent).toBe(UNVERIFIED)
    expect(within(metric("Gap %")).getByText("Unknown")).toBeTruthy()
    expect(within(metric("Unused Permissions")).getByText("Unknown")).toBeTruthy()
    expect(within(metric("Used Permissions")).getByText("Unknown")).toBeTruthy()
    expect(document.body.textContent).not.toContain("null")
    expect(screen.queryByText("0%")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Evidence" }))
    expect(within(metric("Confidence")).getByText("Confidence withheld: IAM usage generation not verified")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Impact" }))
    expect(screen.getByText("Current score unavailable")).toBeTruthy()
  })

  it("a null confidence with no reason reads Unknown, never a grade", () => {
    const result = simulateFix(true)
    delete result.evidence.confidence_withheld_reason
    render(<IAMSimulateFixModal isOpen onClose={() => {}} result={result} />)
    fireEvent.click(screen.getByRole("button", { name: "Evidence" }))
    expect(within(metric("Confidence")).getByText("Unknown")).toBeTruthy()
  })

  it("control: real values render as before", () => {
    render(<IAMSimulateFixModal isOpen onClose={() => {}} result={simulateFix(false)} />)

    // Value assertions first: they also pass against the pre-change modal.
    expect(screen.getByText("HIGH")).toBeTruthy()
    expect(within(metric("Gap %")).getByText("40%")).toBeTruthy()
    expect(within(metric("Unused Permissions")).getByText("8")).toBeTruthy()
    expect(within(metric("Used Permissions")).getByText("12")).toBeTruthy()
    // The only Unknown is rollback readiness, which this body does not report.
    expect(screen.queryAllByText("Unknown").map((el) => el.getAttribute("data-testid"))).toEqual([
      "simulate-fix-rollback-ready",
    ])

    fireEvent.click(screen.getByRole("button", { name: "Evidence" }))
    expect(within(metric("Confidence")).getByText("Medium")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Impact" }))
    expect(screen.getByText("55")).toBeTruthy()

    expect(screen.getByTestId("simulate-fix-severity").textContent).toBe("HIGH")
    expect(screen.getByTestId("simulate-fix-severity").getAttribute("data-held")).toBeNull()
    expect(screen.queryByTestId("simulate-fix-severity-withheld-reason")).toBeNull()
  })
})
