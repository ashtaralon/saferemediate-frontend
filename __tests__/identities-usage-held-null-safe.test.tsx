/**
 * Withheld usage-derived values render as held ("Unknown") — never a crash,
 * 0, 0%, 100, "Minimal", "Low" or a fixed percentage — and real values render
 * exactly as before.
 *
 * Shapes are the backend's own (saferemediate-backend, stacked on #2281/#2291,
 * branch claude/cf01-lp-withhold-followup-apis):
 *   /api/identities/{nhi,human,third-party,privileged}  IdentitySummary
 *     (api/identities.py) — `_served_identities` nulls risk_score and the
 *     used/unused counts and sets `usage_withheld_reason`; risk_level and
 *     gap_percentage are nulled once this frontend tolerates them.
 *   /api/identities/overview  IdentityOverview — risk counts null,
 *     risk_distribution {}, `usage_withheld_reason`; total_unused_permissions
 *     and avg_gap_percentage null once tolerated.
 *   /api/identities/detail/{name}  basic_info.risk_level/risk_score,
 *     permission_analysis.{used,unused}_count/gap_percentage/confidence and
 *     damage_classification counts + damage_score null.
 *   /api/systems  `_serve_systems_payload` — health/critical/high/... null
 *     and `findings_withheld_reason`.
 *   /api/posture-score/{system}  least_privilege.score, overall_score, grade
 *     null; held + error_code + held_reason.
 *   /api/remediation-candidates  unused_count null.
 * Names and numbers are synthetic test inputs; no key is invented beyond those.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))
vi.mock("@/components/iam-permission-analysis-modal", () => ({ IAMPermissionAnalysisModal: () => null }))
vi.mock("@/components/nhi-profile/network-plane", () => ({ NetworkPlane: () => null }))
vi.mock("@/components/nhi-profile/data-plane", () => ({ DataPlane: () => null }))

import { NHITab } from "@/components/identities/nhi-tab"
import { HumanIdentitiesTab } from "@/components/identities/human-identities-tab"
import { ThirdPartyTab } from "@/components/identities/third-party-tab"
import { PrivilegedAccessTab } from "@/components/identities/privileged-access-tab"
import { IdentitiesOverviewTab } from "@/components/identities/identities-overview-tab"
import { NHIProfilePage } from "@/components/nhi-profile/nhi-profile-page"
import { PermissionPlane } from "@/components/nhi-profile/permission-plane"
import { PostureGradeCard } from "@/components/dashboard/v2/posture-grade-card"
import { SafeRemediationsQueueCard } from "@/components/dashboard/v3/safe-remediations-queue-card"
import type { PostureScoreData, SourceState } from "@/components/dashboard/v2/use-home-data"
import { pickWorstSystemName } from "@/lib/pick-worst-system"
import {
  HELD_COLOR,
  HELD_LABEL,
  HELD_TITLE,
  firstOrHeld,
  gradeCountOrHeld,
  identityRowsHold,
  meanOrHeld,
  sumOrHeld,
  systemFindingsWithheld,
  systemValue,
} from "@/lib/usage-held"

const UNVERIFIED = "IAM_USAGE_GENERATION_UNVERIFIED"

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

function serve(routes: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    for (const [prefix, body] of Object.entries(routes)) {
      if (url.startsWith(prefix)) return Response.json(body)
    }
    return Response.json({ error: "unrouted in test" }, { status: 404 })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

// ── IdentitySummary rows (api/identities.py) ───────────────────────────

function identity(overrides: Record<string, unknown> = {}) {
  return {
    arn: "arn:test:role/nhi-a",
    name: "nhi-a",
    identity_type: "NHI",
    sub_type: "Lambda Execution Role",
    system_name: "test-system",
    risk_level: "High",
    risk_score: 61.5,
    permissions_count: 40,
    used_permissions_count: 28,
    unused_permissions_count: 12,
    gap_percentage: 30.4,
    last_activity: "2026-09-01T00:00:00Z",
    attached_resources: [],
    policies: ["policy-a"],
    trust_principals: ["lambda.amazonaws.com"],
    is_admin: true,
    has_wildcard: false,
    is_cross_account: false,
    observation_days: 90,
    confidence: 80,
    ...overrides,
  }
}

/** What the backend serves once every usage-derived field is withheld. */
function withheld(overrides: Record<string, unknown> = {}) {
  return identity({
    risk_level: null,
    risk_score: null,
    used_permissions_count: null,
    unused_permissions_count: null,
    gap_percentage: null,
    usage_withheld_reason: UNVERIFIED,
    ...overrides,
  })
}

/** What the stacked backend serves TODAY: counts withheld, risk_level and gap still served. */
function withheldCountsOnly(overrides: Record<string, unknown> = {}) {
  return identity({
    risk_score: null,
    used_permissions_count: null,
    unused_permissions_count: null,
    usage_withheld_reason: UNVERIFIED,
    ...overrides,
  })
}

function detailPayload(overrides: { basic?: object; perm?: object; damage?: object } = {}) {
  return {
    basic_info: { name: "nhi-a", risk_level: "High", risk_score: 61.5, ...overrides.basic },
    permission_analysis: {
      allowed_count: 40,
      used_count: 28,
      unused_count: 12,
      gap_percentage: 30.4,
      allowed_actions: ["s3:GetObject", "s3:PutObject"],
      used_actions: ["s3:GetObject"],
      unused_actions: ["s3:PutObject"],
      confidence: 80,
      ...overrides.perm,
    },
    damage_classification: {
      read_count: 1,
      write_count: 1,
      delete_count: 0,
      admin_count: 0,
      encrypt_count: 0,
      damage_score: 10,
      details: { WRITE: ["s3:PutObject"] },
      ...overrides.damage,
    },
    temporal_activity: null,
    network_reachability: null,
    blast_radius: null,
    policies: ["policy-a"],
    trust_principals: ["lambda.amazonaws.com"],
    recommendations: [],
  }
}

function detailWithheld() {
  return detailPayload({
    basic: { risk_level: null, risk_score: null, usage_withheld_reason: UNVERIFIED },
    perm: { used_count: null, unused_count: null, gap_percentage: null, confidence: null, usage_withheld_reason: UNVERIFIED },
    damage: { read_count: null, write_count: null, delete_count: null, admin_count: null, encrypt_count: null, damage_score: null },
  })
}

function heldCells(testId: string) {
  return screen.queryAllByTestId(testId)
}

/** Rendered text outside the risk-filter <option>s (which always list the grades). */
function shown(text: string) {
  return screen.queryAllByText(text).filter((el) => el.tagName !== "OPTION")
}

// ── NHI tab ────────────────────────────────────────────────────────────

describe("NHITab", () => {
  it("renders withheld risk, counts and gap as Unknown without crashing", async () => {
    serve({
      "/api/proxy/identities/nhi": [withheld()],
      "/api/proxy/identities/detail/": detailWithheld(),
    })
    render(<NHITab />)

    expect(await screen.findByText("nhi-a")).toBeInTheDocument()
    for (const id of ["nhi-critical-count", "nhi-total-unused", "nhi-avg-gap", "nhi-row-unused", "nhi-row-gap", "nhi-row-risk"]) {
      expect(heldCells(id)).toHaveLength(1)
      expect(screen.getByTestId(id)).toHaveTextContent(HELD_LABEL)
    }
    expect(screen.getByTestId("nhi-usage-held")).toHaveTextContent(UNVERIFIED)
    expect(screen.getByTestId("nhi-usage-held")).toHaveTextContent(HELD_TITLE)
    // No fabricated percentages or grades anywhere in the row.
    expect(screen.queryByText("0%")).not.toBeInTheDocument()
    expect(shown("Low")).toHaveLength(0)

    // The withheld row is reachable through the Unknown filter and not through a grade.
    const [riskSelect] = screen.getAllByRole("combobox")
    fireEvent.change(riskSelect, { target: { value: "low" } })
    expect(screen.queryByText("nhi-a")).not.toBeInTheDocument()
    fireEvent.change(riskSelect, { target: { value: "unknown" } })
    expect(screen.getByText("nhi-a")).toBeInTheDocument()

    // Detail: used/unused/gap/damage are held; damage never reads "Minimal".
    fireEvent.click(screen.getByText("nhi-a"))
    expect(await screen.findByTestId("nhi-damage-score")).toHaveTextContent(HELD_LABEL)
    expect(screen.getByTestId("nhi-detail-used")).toHaveTextContent(HELD_LABEL)
    expect(screen.getByTestId("nhi-detail-unused")).toHaveTextContent(HELD_LABEL)
    expect(screen.getByTestId("nhi-detail-gap")).toHaveTextContent(HELD_TITLE)
    expect(screen.queryByText("Minimal")).not.toBeInTheDocument()
    expect(screen.queryByText(/Remediate .* Unused Permission/)).not.toBeInTheDocument()
  })

  it("does not crash on today's partial hold (counts null, grade and gap served)", async () => {
    serve({ "/api/proxy/identities/nhi": [withheldCountsOnly()] })
    render(<NHITab />)
    expect(await screen.findByText("nhi-a")).toBeInTheDocument()
    expect(screen.getByTestId("nhi-row-unused")).toHaveTextContent(HELD_LABEL)
    expect(screen.getByTestId("nhi-total-unused")).toHaveTextContent(HELD_LABEL)
    expect(screen.getByTestId("nhi-usage-held")).toHaveTextContent(UNVERIFIED)
    // Served values still render verbatim.
    expect(shown("High")).toHaveLength(1)
    expect(screen.getAllByText("30%")).toHaveLength(2) // the row's gap and the one-row average
    expect(screen.queryByTestId("nhi-row-gap")).not.toBeInTheDocument()
  })

  it("renders real values exactly as before", async () => {
    serve({
      "/api/proxy/identities/nhi": [identity(), identity({ arn: "arn:test:role/nhi-b", name: "nhi-b", risk_level: "Critical", unused_permissions_count: 3, gap_percentage: 69.6 })],
      "/api/proxy/identities/detail/": detailPayload(),
    })
    render(<NHITab />)
    expect(await screen.findByText("nhi-a")).toBeInTheDocument()
    expect(screen.queryByTestId("nhi-usage-held")).not.toBeInTheDocument()
    expect(screen.queryAllByText(HELD_LABEL).filter((el) => el.getAttribute("data-held"))).toHaveLength(0)
    expect(screen.getByText("15")).toBeInTheDocument() // 12 + 3 unused
    expect(screen.getByText("50%")).toBeInTheDocument() // mean(30.4, 69.6)
    expect(screen.getByText("30%")).toBeInTheDocument()
    expect(screen.getByText("70%")).toBeInTheDocument()
    expect(shown("High")).toHaveLength(1)
    expect(shown("Critical")).toHaveLength(1)
    expect(screen.queryByRole("option", { name: HELD_LABEL })).not.toBeInTheDocument()

    fireEvent.click(screen.getByText("nhi-a"))
    expect(await screen.findByText("Minimal")).toBeInTheDocument() // real damage_score 10
    expect(screen.getByText("Used: 28")).toBeInTheDocument()
    expect(screen.getByText("Unused: 12")).toBeInTheDocument()
    expect(screen.getByText("30% permissions can be removed")).toBeInTheDocument()
    expect(screen.getByText("Remediate 12 Unused Permissions")).toBeInTheDocument()
  })
})

// ── Human / third-party / privileged tabs ──────────────────────────────

describe("HumanIdentitiesTab", () => {
  const human = (o: Record<string, unknown> = {}) =>
    identity({ arn: "arn:test:user/human-a", name: "human-a", identity_type: "Human", sub_type: "IAM User", ...o })

  it("renders a withheld risk, unused count and gap as Unknown", async () => {
    serve({ "/api/proxy/identities/human": [withheld({ arn: "arn:test:user/human-a", name: "human-a", identity_type: "Human" })] })
    render(<HumanIdentitiesTab />)
    expect(await screen.findByText("human-a")).toBeInTheDocument()
    expect(screen.getByTestId("human-row-unused")).toHaveTextContent(HELD_LABEL)
    expect(screen.getByTestId("human-row-risk")).toHaveTextContent(HELD_LABEL)
    expect(screen.getByTestId("human-usage-held")).toHaveTextContent(UNVERIFIED)
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "low" } })
    expect(screen.queryByText("human-a")).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "unknown" } })
    fireEvent.click(screen.getByText("human-a"))
    expect(screen.getByTestId("human-detail-gap")).toHaveTextContent(`Gap: ${HELD_LABEL}`)
  })

  it("renders real values exactly as before", async () => {
    serve({ "/api/proxy/identities/human": [human()] })
    render(<HumanIdentitiesTab />)
    expect(await screen.findByText("human-a")).toBeInTheDocument()
    expect(screen.queryByTestId("human-usage-held")).not.toBeInTheDocument()
    expect(screen.getByText("12")).toBeInTheDocument()
    expect(shown("High")).toHaveLength(1)
    fireEvent.click(screen.getByText("human-a"))
    expect(screen.getByTestId("human-detail-gap")).toHaveTextContent("Gap: 30.4% · 90d observed · 80% confidence")
  })
})

describe("ThirdPartyTab", () => {
  const tp = (o: Record<string, unknown> = {}) =>
    ({ arn: "arn:test:role/tp-a", name: "tp-a", identity_type: "ThirdParty", is_cross_account: true, trust_principals: ["arn:test:root"], ...o })

  it("renders a withheld risk, unused count and gap as Unknown", async () => {
    serve({ "/api/proxy/identities/third-party": [withheld(tp())] })
    render(<ThirdPartyTab />)
    expect(await screen.findByText("tp-a")).toBeInTheDocument()
    expect(screen.getByTestId("third-party-row-risk")).toHaveTextContent(HELD_LABEL)
    expect(screen.getByTestId("third-party-usage-held")).toHaveTextContent(UNVERIFIED)
    fireEvent.click(screen.getByText("tp-a"))
    expect(screen.getByTestId("third-party-detail-unused")).toHaveTextContent(`Permissions: 40 (${HELD_LABEL} unused)`)
    expect(screen.getByTestId("third-party-detail-gap")).toHaveTextContent(`Gap: ${HELD_LABEL}`)
  })

  it("renders real values exactly as before", async () => {
    serve({ "/api/proxy/identities/third-party": [identity(tp())] })
    render(<ThirdPartyTab />)
    expect(await screen.findByText("tp-a")).toBeInTheDocument()
    expect(screen.queryByTestId("third-party-usage-held")).not.toBeInTheDocument()
    expect(screen.getByText("High")).toBeInTheDocument()
    fireEvent.click(screen.getByText("tp-a"))
    expect(screen.getByTestId("third-party-detail-unused")).toHaveTextContent("Permissions: 40 (12 unused)")
    expect(screen.getByTestId("third-party-detail-gap")).toHaveTextContent("Gap: 30.4%")
  })
})

describe("PrivilegedAccessTab", () => {
  it("withholds the unused total when any row is withheld", async () => {
    serve({
      "/api/proxy/identities/privileged": [
        identity({ arn: "arn:test:role/priv-a", name: "priv-a" }),
        withheld({ arn: "arn:test:role/priv-b", name: "priv-b" }),
      ],
    })
    render(<PrivilegedAccessTab />)
    expect(await screen.findByText("priv-b")).toBeInTheDocument()
    expect(screen.getByTestId("privileged-row-unused")).toHaveTextContent(HELD_LABEL)
    expect(screen.getByTestId("privileged-usage-held")).toHaveTextContent(UNVERIFIED)
    // 12 from the measured row alone is not the total: no removable-count claim.
    expect(screen.queryByText(/unused privileged permissions can be removed/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByText("priv-b"))
    expect(screen.getByTestId("privileged-detail-gap")).toHaveTextContent(`Gap: ${HELD_LABEL}`)
  })

  it("renders real values exactly as before", async () => {
    serve({
      "/api/proxy/identities/privileged": [
        identity({ arn: "arn:test:role/priv-a", name: "priv-a" }),
        identity({ arn: "arn:test:role/priv-b", name: "priv-b", unused_permissions_count: 1000 }),
      ],
    })
    render(<PrivilegedAccessTab />)
    expect(await screen.findByText("priv-b")).toBeInTheDocument()
    expect(screen.queryByTestId("privileged-usage-held")).not.toBeInTheDocument()
    expect(screen.getByText(/1,012 unused privileged permissions can be removed/)).toBeInTheDocument()
    fireEvent.click(screen.getByText("priv-a"))
    expect(screen.getByTestId("privileged-detail-gap")).toHaveTextContent("Gap: 30.4%")
  })
})

// ── Overview tab ───────────────────────────────────────────────────────

function overview(overrides: Record<string, unknown> = {}) {
  return {
    total_identities: 3,
    nhi_count: 2,
    human_count: 1,
    third_party_count: 0,
    privileged_count: 1,
    critical_risk_count: 1,
    high_risk_count: 1,
    medium_risk_count: 0,
    low_risk_count: 1,
    total_permissions: 200,
    total_unused_permissions: 50,
    avg_gap_percentage: 25.26,
    admin_identities: 1,
    wildcard_identities: 0,
    cross_account_identities: 0,
    nhi_breakdown: { "Lambda Execution Role": 2 },
    risk_distribution: { Critical: 1, High: 1, Low: 1 },
    ...overrides,
  }
}

describe("IdentitiesOverviewTab", () => {
  it("org overview: withheld risk counts, unused total and gap render Unknown", async () => {
    serve({
      "/api/proxy/identities/overview": overview({
        critical_risk_count: null,
        high_risk_count: null,
        medium_risk_count: null,
        low_risk_count: null,
        total_unused_permissions: null,
        avg_gap_percentage: null,
        risk_distribution: {},
        usage_withheld_reason: UNVERIFIED,
      }),
    })
    render(<IdentitiesOverviewTab />)
    expect(await screen.findByTestId("identities-overview-usage-held")).toHaveTextContent(UNVERIFIED)
    for (const id of [
      "identities-overview-risk-critical",
      "identities-overview-risk-high",
      "identities-overview-risk-medium",
      "identities-overview-risk-low",
      "identities-overview-total-unused",
      "identities-overview-avg-gap",
    ]) {
      expect(screen.getByTestId(id)).toHaveTextContent(HELD_LABEL)
    }
    expect(screen.queryByText(/% Unused/)).not.toBeInTheDocument()
    expect(screen.queryByText(/critical-risk identities detected/)).not.toBeInTheDocument()
    expect(screen.getByText(/1 identities have admin-level access\./)).toBeInTheDocument()
  })

  it("org overview: today's partial hold (risk counts only) does not crash", async () => {
    serve({
      "/api/proxy/identities/overview": overview({
        critical_risk_count: null,
        high_risk_count: null,
        medium_risk_count: null,
        low_risk_count: null,
        risk_distribution: {},
        usage_withheld_reason: UNVERIFIED,
      }),
    })
    render(<IdentitiesOverviewTab />)
    expect(await screen.findByTestId("identities-overview-risk-critical")).toHaveTextContent(HELD_LABEL)
    expect(screen.getByText("50")).toBeInTheDocument()
    expect(screen.getByText("25.3%")).toBeInTheDocument()
  })

  it("per-system aggregation never counts a withheld grade as Low or a null count as 0", async () => {
    serve({
      "/api/proxy/identities/nhi": [identity({ risk_level: "Low" }), withheld({ arn: "arn:test:role/nhi-b", name: "nhi-b" })],
      "/api/proxy/identities/human": [],
      "/api/proxy/identities/third-party": [],
      "/api/proxy/identities/privileged": [],
    })
    render(<IdentitiesOverviewTab systemName="test-system" />)
    expect(await screen.findByTestId("identities-overview-usage-held")).toHaveTextContent(UNVERIFIED)
    expect(screen.getByTestId("identities-overview-risk-low")).toHaveTextContent(HELD_LABEL)
    expect(screen.getByTestId("identities-overview-total-unused")).toHaveTextContent(HELD_LABEL)
    expect(screen.getByTestId("identities-overview-avg-gap")).toHaveTextContent(HELD_LABEL)
  })

  it("renders real values exactly as before (org and per-system)", async () => {
    serve({ "/api/proxy/identities/overview": overview() })
    render(<IdentitiesOverviewTab />)
    expect(await screen.findByText("25.3%")).toBeInTheDocument()
    expect(screen.queryByTestId("identities-overview-usage-held")).not.toBeInTheDocument()
    expect(screen.getByText("50")).toBeInTheDocument()
    expect(screen.getByText("75% Used")).toBeInTheDocument()
    expect(screen.getByText("25% Unused")).toBeInTheDocument()
    expect(screen.getByText(/1 critical-risk identities detected\. 1 identities have admin-level access\./)).toBeInTheDocument()
    cleanup()

    serve({
      "/api/proxy/identities/nhi": [identity(), identity({ arn: "arn:test:role/nhi-b", name: "nhi-b", risk_level: "Low", unused_permissions_count: 8, gap_percentage: 10 })],
      "/api/proxy/identities/human": [],
      "/api/proxy/identities/third-party": [],
      "/api/proxy/identities/privileged": [],
    })
    render(<IdentitiesOverviewTab systemName="test-system" />)
    expect(await screen.findByText("20")).toBeInTheDocument() // 12 + 8
    expect(screen.getByText("20.2%")).toBeInTheDocument() // mean(30.4, 10)
    expect(screen.queryByTestId("identities-overview-usage-held")).not.toBeInTheDocument()
  })
})

// ── NHI profile page + permission plane ────────────────────────────────

describe("NHIProfilePage", () => {
  it("renders withheld unused, gap and confidence as Unknown, never 0 / 0%", async () => {
    serve({
      "/api/proxy/identities/nhi": [withheld()],
      "/api/proxy/identities/detail/": detailWithheld(),
    })
    render(<NHIProfilePage identityName="nhi-a" />)
    expect(await screen.findByTestId("nhi-profile-unused")).toHaveTextContent(HELD_LABEL)
    expect(screen.getByTestId("nhi-profile-gap")).toHaveTextContent(HELD_LABEL)
    // Unknown in the Unknown color — never the Low green a missing grade used to get.
    expect(screen.getByText("Unknown Risk")).toHaveStyle({ color: HELD_COLOR })
    expect(screen.queryByText("0%")).not.toBeInTheDocument()
    expect(screen.getByTestId("permission-plane-damage")).toHaveTextContent(`Damage: ${HELD_LABEL}`)
    expect(screen.queryByText("Minimal")).not.toBeInTheDocument()
  })

  it("renders real values exactly as before", async () => {
    serve({
      "/api/proxy/identities/nhi": [identity()],
      "/api/proxy/identities/detail/": detailPayload(),
    })
    render(<NHIProfilePage identityName="nhi-a" />)
    expect(await screen.findByText("High Risk")).toBeInTheDocument()
    expect(screen.getByTestId("nhi-profile-confidence")).toHaveTextContent("80% confidence")
    expect(screen.getByText("Unused", { selector: "div" }).previousElementSibling).toHaveTextContent(/^12$/)
    expect(screen.getByText("Gap", { selector: "div" }).previousElementSibling).toHaveTextContent(/^30%$/)
    expect(screen.queryByTestId("nhi-profile-unused")).not.toBeInTheDocument()
  })

  it("keeps a real 0 confidence as 0, and holds a confidence nobody sent", () => {
    expect(firstOrHeld([0, undefined])).toBe(0)
    expect(firstOrHeld([0, 45])).toBe(45)
    expect(firstOrHeld([undefined, null])).toBeNull()
  })
})

describe("PermissionPlane", () => {
  it("does not re-derive a withheld split from the action lists", () => {
    render(<PermissionPlane identityName="nhi-a" detail={detailWithheld()} identity={null} onRemediate={() => {}} />)
    expect(screen.getByTestId("permission-plane-used")).toHaveTextContent(`${HELD_LABEL} used / 40 total`)
    expect(screen.getByTestId("permission-plane-unused")).toHaveTextContent(HELD_LABEL)
    expect(screen.getByTestId("permission-plane-damage-score")).toHaveTextContent(HELD_LABEL)
    expect(screen.queryByText(/unused permission\(s\) can be removed/)).not.toBeInTheDocument()
    expect(screen.queryByText("Minimal")).not.toBeInTheDocument()
  })

  it("renders real values exactly as before", () => {
    render(<PermissionPlane identityName="nhi-a" detail={detailPayload()} identity={null} onRemediate={() => {}} />)
    expect(screen.getByTestId("permission-plane-used")).toHaveTextContent("28 used / 40 total")
    expect(screen.getByText("12 unused")).toBeInTheDocument()
    expect(screen.getByText("Damage: Minimal")).toBeInTheDocument()
    expect(screen.getByText("Minimal")).toBeInTheDocument()
    expect(screen.queryByTestId("permission-plane-unused")).not.toBeInTheDocument()
  })
})

// ── Posture grade card (/api/posture-score) ────────────────────────────

function postureState(data: PostureScoreData | null): SourceState<PostureScoreData> {
  return { data, loading: false, error: null, fetchedAt: null } as unknown as SourceState<PostureScoreData>
}

function posture(overrides: Partial<PostureScoreData> = {}): PostureScoreData {
  return {
    system_name: "test-system",
    overall_score: 72,
    grade: "C",
    dimensions: {
      least_privilege: { score: 64, weight: 0.3 },
      network_security: { score: 80, weight: 0.25 },
    },
    ...overrides,
  }
}

describe("PostureGradeCard", () => {
  it("held posture shows the typed code and reason, and no score", () => {
    render(
      <PostureGradeCard
        onRetry={() => {}}
        state={postureState(
          posture({
            overall_score: null,
            grade: null,
            held: true,
            error_code: UNVERIFIED,
            held_reason: "test input: least-privilege dimension graded from unverified usage",
            dimensions: { least_privilege: { score: null, weight: 0.3, score_withheld_reason: UNVERIFIED }, network_security: { score: 80, weight: 0.25 } },
          }),
        )}
      />,
    )
    const notice = screen.getByTestId("posture-grade-held-notice")
    expect(within(notice).getByText(UNVERIFIED)).toBeInTheDocument()
    expect(notice).toHaveTextContent("test input: least-privilege dimension graded from unverified usage")
    expect(screen.queryByText("/100")).not.toBeInTheDocument()
  })

  it("a withheld LP dimension beside a real overall renders Unknown, not 0", () => {
    render(
      <PostureGradeCard
        onRetry={() => {}}
        state={postureState(posture({ dimensions: { least_privilege: { score: null, weight: 0.3 }, network_security: { score: 80, weight: 0.25 } } }))}
      />,
    )
    expect(screen.getByTestId("posture-dimension-held")).toHaveTextContent(HELD_LABEL)
    expect(screen.queryByText("0")).not.toBeInTheDocument()
  })

  it("renders real values exactly as before", () => {
    render(<PostureGradeCard onRetry={() => {}} state={postureState(posture())} />)
    expect(screen.getByText("72")).toBeInTheDocument()
    expect(screen.getByText("64")).toBeInTheDocument()
    expect(screen.getByText("80")).toBeInTheDocument()
    expect(screen.queryByTestId("posture-dimension-held")).not.toBeInTheDocument()
    expect(screen.queryByTestId("posture-grade-held")).not.toBeInTheDocument()
  })
})

// ── Safe remediations queue (/api/remediation-candidates) ──────────────

function sharedCandidates(unused: number | null) {
  return {
    data: {
      candidates: [
        {
          resource_type: "IAMRole",
          resource_id: "role-a",
          system: "test-system",
          unused_count: unused,
          total_permissions: 40,
          severity: "HIGH",
          safety: { can_auto_apply: true },
        },
      ],
    },
    isStale: false,
    cachedAt: null,
    staleReason: null,
    loading: false,
    isComputing: false,
    error: null,
    hold: null,
    retry: () => {},
  } as never
}

describe("SafeRemediationsQueueCard", () => {
  it("a withheld unused count renders Unknown, not 0", () => {
    render(<SafeRemediationsQueueCard shared={sharedCandidates(null)} />)
    expect(screen.getByTestId("queue-card-unused")).toHaveTextContent(HELD_LABEL)
    expect(screen.queryByText(/· 0 unused/)).not.toBeInTheDocument()
  })

  it("renders real values exactly as before", () => {
    render(<SafeRemediationsQueueCard shared={sharedCandidates(7)} />)
    expect(screen.getByText(/test-system · 7 unused \/ 40 total/)).toBeInTheDocument()
    expect(screen.queryByTestId("queue-card-unused")).not.toBeInTheDocument()
  })
})

// ── pickWorstSystemName (/api/systems) ─────────────────────────────────

describe("pickWorstSystemName with withheld systems", () => {
  const heldSystem = (name: string) => ({
    name,
    health_score: null,
    healthScore: null,
    critical_count: null,
    criticalIssues: null,
    high_count: null,
    highIssues: null,
    findings_withheld_reason: UNVERIFIED,
  })

  it("never ranks a withheld system as if its values were 0", () => {
    const rows = [
      heldSystem("held-a"),
      // Ranked on made-up zeros, held-a (health 0) would beat this healthy system.
      { name: "measured", health_score: 90, critical_count: 0, high_count: 0 },
    ]
    expect(pickWorstSystemName(rows)).toBe("measured")
  })

  it("keeps the backend's order when every system is withheld", () => {
    expect(pickWorstSystemName([heldSystem("first"), heldSystem("second")])).toBe("first")
  })
})

// ── Pure helpers ───────────────────────────────────────────────────────

describe("usage-held helpers", () => {
  it("aggregates withhold on any held input and match the old arithmetic otherwise", () => {
    expect(sumOrHeld([1, 2, 3])).toBe(6)
    expect(sumOrHeld([1, null, 3])).toBeNull()
    expect(sumOrHeld([])).toBe(0)
    expect(meanOrHeld([10, 20], 0)).toBe(15)
    expect(meanOrHeld([10, null], 0)).toBeNull()
    expect(meanOrHeld([], 0)).toBe(0)
    expect(gradeCountOrHeld(["Critical", "Low"], "Critical")).toBe(1)
    expect(gradeCountOrHeld(["Critical", null], "Critical")).toBeNull()
  })

  it("systemValue reads the ?? spelling chain minus the trailing 0", () => {
    expect(systemValue({ health_score: 45, healthScore: 99 }, ["health_score", "healthScore"])).toBe(45)
    expect(systemValue({ healthScore: 99 }, ["health_score", "healthScore"])).toBe(99)
    expect(systemValue({ health_score: null, healthScore: null }, ["health_score", "healthScore"])).toBeNull()
    expect(systemValue({}, ["health_score"])).toBeNull()
  })

  it("systemFindingsWithheld: explicit hold only, never an omitted key", () => {
    expect(systemFindingsWithheld({ findings_withheld_reason: UNVERIFIED })).toBe(true)
    expect(systemFindingsWithheld({ critical_count: null, criticalIssues: null })).toBe(true)
    expect(systemFindingsWithheld({ critical_count: 2 })).toBe(false)
    expect(systemFindingsWithheld({ critical_count: null, criticalIssues: 2 })).toBe(false)
  })

  it("identityRowsHold: codes verbatim, null when every value is present", () => {
    expect(identityRowsHold([identity()])).toBeNull()
    expect(identityRowsHold([withheld()])).toEqual({ codes: [UNVERIFIED], reason: HELD_TITLE })
    expect(identityRowsHold([identity({ gap_percentage: null })])).toEqual({ codes: [], reason: HELD_TITLE })
  })
})

// Guard against a silent fetch loop / unawaited state in the mounted tabs.
describe("mount settles", () => {
  it("each identity tab fetches once", async () => {
    const f = serve({ "/api/proxy/identities/nhi": [withheld()] })
    render(<NHITab />)
    await screen.findByText("nhi-a")
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1))
  })
})
