/// <reference types="vitest/globals" />
/**
 * Usage-derived values the backend withholds (backend claude/cf01-lp-withhold-followup-core @ e1fc37413)
 * render held or Unknown — never 0, 0%, 100 or a crash.
 *
 * Shapes and key names are the backend's own:
 *   /api/issues-summary   byCategory.permissions {allowed, used, unused, gap_percentage: null, withheld_reason}
 *                         and resources.unused_permission_gaps: null + unused_permission_gaps_withheld_reason
 *                         (api/issues_summary.py).
 *   /least-privilege/issues  summary.totalExcessPermissions: null + totalExcessPermissions_withheld_reason
 *                         (unified/lp/endpoint.py); rows lpScore: null + lpScore_withheld_reason, blastRadius.brs /
 *                         .components: null + brs_withheld_reason / components_withheld_reason
 *                         (unified/lp/capabilities.py).
 *   /least-privilege/metrics bloatDeltaWithheldReason (api/least_privilege.py MetricsResponse).
 * The IAM row is the captured testbed-webshop fixture used by lp-withheld-row.test.tsx; other numbers are test inputs.
 * Every "held" assertion has a control in which the same surface shows the real value.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"

import {
  homeGapAnalysisFromSummary,
  permissionTotalsWithheld,
  UNUSED_PERMISSIONS_UNAVAILABLE_COPY,
  unusedPermissionsWithheld,
  unusedPermissionsWithheldReason,
  unusedPermissionsWithheldReasonCopy,
} from "@/lib/brss-held"
import { IAM_USAGE_UNKNOWN_FALLBACK, iamUsageWithheldCopy } from "@/lib/lp-readiness-copy"
import { SeverityDistributionCard } from "@/components/dashboard/v2/severity-distribution-card"
import { LPTopIssuesCard } from "@/components/dashboard/v3/lp-top-issues-card"
import { WildcardBloatCard } from "@/components/dashboard/v3/wildcard-bloat-card"
import { RemediationDrawer } from "@/components/LeastPrivilegeTab"
import { normalizeLPResponse } from "@/lib/lp-normalize"
import { resolveLPDrawerPreview } from "@/lib/lp-review-routing"
import captured from "@/__tests__/fixtures/lp-issues-testbed-webshop-2026-09-28.json"

const UNVERIFIED = "IAM_USAGE_GENERATION_UNVERIFIED"
const NOT_ZERO = `${IAM_USAGE_UNKNOWN_FALLBACK}. This is not zero unused permissions.`

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

function serve(path: string, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      if (url.includes(path)) return Response.json(body)
      return Response.json({ error: "unrouted in test" }, { status: 404 })
    }),
  )
}

// ── issues-summary permission totals ───────────────────────────────────

function summaryScored() {
  return {
    total: 4,
    byCategory: {
      permissions: {
        allowed: 40, used: 30, unused: 10, gap_percentage: 25.0,
        unmeasured_resources: 0, counts_are_partial: false,
      },
    },
    resources: { total: 12, with_issues: 4, unused_permission_gaps: 10, iam_roles: 2 },
  }
}

function summaryWithheld() {
  return {
    total: 4,
    byCategory: {
      permissions: {
        allowed: null, used: null, unused: null, gap_percentage: null,
        withheld_reason: UNVERIFIED, unverified_usage_inputs: 2,
        unmeasured_resources: 0, counts_are_partial: true,
      },
    },
    resources: {
      total: 12, with_issues: 4, unused_permission_gaps: null,
      unused_permission_gaps_withheld_reason: UNVERIFIED, iam_roles: 2,
    },
  }
}

describe("issues-summary permission totals — withheld is not 0", () => {
  it("each withholding signal alone holds, and a scored payload does not", () => {
    expect(unusedPermissionsWithheld(summaryWithheld())).toBe(true)
    expect(unusedPermissionsWithheld(summaryScored())).toBe(false)
    // Permission totals alone (resources still numeric).
    const permsOnly = { ...summaryScored(), byCategory: summaryWithheld().byCategory }
    expect(unusedPermissionsWithheld(permsOnly)).toBe(true)
    // unused_permission_gaps alone (the V2 hold: no permission reason).
    const gapsOnly = { ...summaryScored(), resources: { ...summaryScored().resources, unused_permission_gaps: null } }
    expect(unusedPermissionsWithheld(gapsOnly)).toBe(true)
    // One null total is enough; so is a reason with no null.
    expect(permissionTotalsWithheld({ allowed: 40, used: 30, unused: null, gap_percentage: 25 })).toBe(true)
    expect(permissionTotalsWithheld({ allowed: 40, used: 30, unused: 10, gap_percentage: 25, withheld_reason: UNVERIFIED })).toBe(true)
    expect(permissionTotalsWithheld(summaryScored().byCategory.permissions)).toBe(false)
  })

  it("the reason and its copy come from the backend's typed code; no code keeps the caller's sentence", () => {
    expect(unusedPermissionsWithheldReason(summaryWithheld())).toBe(UNVERIFIED)
    expect(unusedPermissionsWithheldReasonCopy(summaryWithheld())).toBe(NOT_ZERO)
    const gapsOnly = { ...summaryScored(), resources: { ...summaryScored().resources, unused_permission_gaps: null } }
    expect(unusedPermissionsWithheldReasonCopy(gapsOnly)).toBeNull()
    expect(iamUsageWithheldCopy("ACTIVE_GENERATION_UNKNOWN")).toBe(
      "Usage unknown — ACTIVE_GENERATION_UNKNOWN: no active IAM usage generation",
    )
  })

  it("legacy home Gap Analysis: withheld totals are null with the reason, never 0 at 99%", () => {
    expect(homeGapAnalysisFromSummary(summaryWithheld())).toEqual({
      allowed: null, used: null, unused: null, confidence: null,
      roleName: "2 IAM Roles Analyzed", withheldCopy: NOT_ZERO,
    })
    const gapsOnly = { ...summaryScored(), resources: { ...summaryScored().resources, unused_permission_gaps: null } }
    expect(homeGapAnalysisFromSummary(gapsOnly).withheldCopy).toBe(UNUSED_PERMISSIONS_UNAVAILABLE_COPY)
  })

  it("control: legacy home maps real totals exactly as before", () => {
    expect(homeGapAnalysisFromSummary(summaryScored())).toEqual({
      allowed: 40, used: 30, unused: 10, confidence: 95, roleName: "2 IAM Roles Analyzed",
    })
  })

  it("V2 severity card footnote: withheld totals say so, never '0/0 permissions unused'", () => {
    render(
      <SeverityDistributionCard
        state={{ data: summaryWithheld() as never, loading: false, error: null, fetchedAt: null }}
        onRetry={() => {}}
      />,
    )
    expect(screen.getByTestId("permission-footnote-withheld").textContent).toBe(NOT_ZERO)
    expect(document.body.textContent).not.toMatch(/permissions unused/)
  })

  it("control: V2 severity card footnote shows real totals as before", () => {
    render(
      <SeverityDistributionCard
        state={{ data: summaryScored() as never, loading: false, error: null, fetchedAt: null }}
        onRetry={() => {}}
      />,
    )
    expect(screen.queryByTestId("permission-footnote-withheld")).toBeNull()
    expect(document.body.textContent).toContain("10/40 permissions unused · 25% gap")
  })
})

// ── /least-privilege/issues summary: totalExcessPermissions ────────────

function issuesBody(excess: number | null, gapPercents: number[]) {
  return {
    summary: {
      totalResources: 3,
      totalExcessPermissions: excess,
      ...(excess === null ? { totalExcessPermissions_withheld_reason: UNVERIFIED } : {}),
      iamIssuesCount: 2, networkIssuesCount: 1, s3IssuesCount: 0, criticalCount: 1, highCount: 1,
    },
    resources: gapPercents.map((gapPercent, i) => ({
      id: `row-${i}`, resourceType: "IAMRole", resourceName: `test-role-${i}`, systemName: "test-system",
      allowedCount: 20, gapCount: 5, gapPercent,
    })),
  }
}

describe("Top LP issues card — withheld excess total", () => {
  it("renders Unknown with the code and reason, never '0 excess permissions'", async () => {
    serve("/api/proxy/least-privilege/issues", issuesBody(null, [25]))
    render(<LPTopIssuesCard />)
    const held = await screen.findByTestId("lp-top-issues-excess-held")
    expect(within(held).getByTestId("brss-held-code").textContent).toBe(UNVERIFIED)
    expect(within(held).getByTestId("brss-held-reason").textContent).toBe(IAM_USAGE_UNKNOWN_FALLBACK)
    expect(document.body.textContent).toContain("3 resources · Unknown excess permissions")
    expect(document.body.textContent).not.toContain("0 excess permissions")
  })

  it("with no gap rows it is not an all-clear", async () => {
    serve("/api/proxy/least-privilege/issues", issuesBody(null, []))
    render(<LPTopIssuesCard />)
    await screen.findByTestId("lp-top-issues-excess-held")
    expect(screen.getByText("Not computed yet — this is not an all-clear")).toBeTruthy()
    expect(document.body.textContent).not.toContain("None show excess permissions")
  })

  it("control: a real total renders as before", async () => {
    serve("/api/proxy/least-privilege/issues", issuesBody(42, [25]))
    render(<LPTopIssuesCard />)
    await screen.findByText("test-role-0")
    expect(document.body.textContent).toContain("3 resources · 42 excess permissions across IAM (2)")
    expect(screen.queryByTestId("lp-top-issues-excess-held")).toBeNull()
  })

  it("control: a real total with no gap rows keeps its empty state", async () => {
    serve("/api/proxy/least-privilege/issues", issuesBody(0, []))
    render(<LPTopIssuesCard />)
    expect(await screen.findByText("3 resources analyzed. None show excess permissions.")).toBeTruthy()
  })
})

// ── /least-privilege/metrics: withheld delta ───────────────────────────

function metrics(extra: Record<string, unknown>) {
  return {
    totalRoles: 12, analyzedRoles: 12, rolesWithBloat: 5, averageBloatPercentage: 37.6,
    totalUnusedPermissions: 1234, totalRecommendedReductions: 1234,
    lastAnalysisDate: "2026-09-29T10:00:00+00:00",
    bloatPercentageDeltaPp: null, bloatBaselineAgeDays: null, bloatBaselineTimestamp: null,
    ...extra,
  }
}

describe("Wildcard Bloat card — withheld delta", () => {
  it("says why the delta is withheld instead of 'appears once ~7 days'", async () => {
    serve("/api/proxy/least-privilege/metrics", metrics({ bloatDeltaWithheldReason: UNVERIFIED }))
    render(<WildcardBloatCard />)
    const held = await screen.findByTestId("wildcard-bloat-delta-held")
    expect(within(held).getByTestId("brss-held-code").textContent).toBe(UNVERIFIED)
    expect(within(held).getByTestId("brss-held-reason").textContent).toBe(IAM_USAGE_UNKNOWN_FALLBACK)
    expect(document.body.textContent).not.toContain("appears once")
    expect(document.body.textContent).toContain("38%")
  })

  it("a delta number beside a withheld reason is not shown", async () => {
    serve(
      "/api/proxy/least-privilege/metrics",
      metrics({ bloatDeltaWithheldReason: UNVERIFIED, bloatPercentageDeltaPp: -2.5, bloatBaselineAgeDays: 7 }),
    )
    render(<WildcardBloatCard />)
    await screen.findByTestId("wildcard-bloat-delta-held")
    expect(document.body.textContent).not.toContain("-2.5pp")
  })

  it("control: no baseline yet keeps its own sentence", async () => {
    serve("/api/proxy/least-privilege/metrics", metrics({}))
    render(<WildcardBloatCard />)
    await screen.findByText("38")
    expect(document.body.textContent).toContain("appears once")
    expect(screen.queryByTestId("wildcard-bloat-delta-held")).toBeNull()
  })
})

// ── /least-privilege/issues rows: lpScore, blastRadius.brs / components ─

type Row = Record<string, unknown> & { blastRadius: Record<string, unknown> }

/** The captured row under a VERIFIED generation, so only the withheld fields below differ. */
function capturedVerified(): { resources: Row[] } & Record<string, unknown> {
  const payload = JSON.parse(JSON.stringify(captured))
  payload.readiness_by_lane.cloudtrail_iam_usage.generation = {
    ...payload.readiness_by_lane.cloudtrail_iam_usage.generation,
    known: true, negative_authority_permitted: true, blockers: [],
  }
  return payload
}

function withheldRow(fields: Array<"lpScore" | "brs" | "components">) {
  const payload = capturedVerified()
  const row = payload.resources[0]
  if (fields.includes("lpScore")) {
    row.lpScore = null
    row.lpScore_withheld_reason = UNVERIFIED
  }
  for (const scored of ["brs", "components"] as const) {
    if (fields.includes(scored)) {
      row.blastRadius[scored] = null
      row.blastRadius[`${scored}_withheld_reason`] = UNVERIFIED
    }
  }
  return payload
}

function renderDrawer(payload: unknown) {
  const resource = normalizeLPResponse(payload).resources[0]
  render(
    <RemediationDrawer
      resource={resource as never}
      onClose={() => {}}
      preview={resolveLPDrawerPreview(resource.resourceType)}
    />,
  )
  return resource
}

function lpScoreCard(): HTMLElement {
  const label = screen.getByText("LP Score")
  if (!label.parentElement) throw new Error("LP Score card has no container")
  return label.parentElement
}

describe("/issues rows — withheld lpScore", () => {
  it("is not derived back from gapPercent, and the drawer shows Unknown with the reason", () => {
    const resource = renderDrawer(withheldRow(["lpScore"]))
    expect(resource.lpScore).toBeNull()
    expect(resource.lpScoreWithheldReason).toBe(UNVERIFIED)
    const card = lpScoreCard()
    expect(within(card).getByTestId("lp-score-withheld").textContent).toBe("Unknown")
    expect(card.textContent).toContain(IAM_USAGE_UNKNOWN_FALLBACK)
    expect(card.textContent).not.toContain("N/A")
    expect(card.textContent).not.toContain("38%")
  })

  it("control: a real lpScore renders as before", () => {
    const resource = renderDrawer(capturedVerified())
    expect(resource.lpScore).toBe(37.9)
    const card = lpScoreCard()
    expect(card.textContent).toContain("38%")
    expect(card.textContent).toContain("62% unused")
    expect(within(card).queryByTestId("lp-score-withheld")).toBeNull()
  })
})

// ── Wiring of surfaces too large to mount here (same source-check pattern as brss-held-display) ──

describe("wiring: the system Overview and legacy home apply the helpers above", () => {
  async function source(file: string): Promise<string> {
    const fs = await import("node:fs")
    const path = await import("node:path")
    return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8")
  }

  it("the system Overview names the permissions' own typed reason first", async () => {
    const src = await source("components/system-detail-dashboard.tsx")
    expect(src).toContain("if (unusedPermissionsWithheld(summaryData)) {")
    expect(src).toMatch(/setGapError\(\s*unusedPermissionsWithheldReasonCopy\(summaryData\) \?\?/)
  })

  it("the legacy home maps through homeGapAnalysisFromSummary and renders a null as Unknown", async () => {
    const src = await source("app/page.tsx")
    expect(src).toContain("const newGapData = homeGapAnalysisFromSummary(summaryJson)")
    for (const value of ["gapAllowed", "gapUsed", "gapUnused"]) {
      expect(src).toContain(`{${value} ?? "Unknown"}`)
    }
    expect(src).toContain('{gapConfidence == null ? "Unknown" : `${gapConfidence}%`}')
    expect(src).toContain('{removableGapPercent == null ? "Unknown" : `${removableGapPercent}%`}')
    expect(src).not.toMatch(/permissions\.(allowed|used|unused|gap_percentage) \|\| 0/)
  })
})
