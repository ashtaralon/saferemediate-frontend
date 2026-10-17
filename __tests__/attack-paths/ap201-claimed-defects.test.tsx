/**
 * AP201 (CP-A) · reproductions of the read-only audit's claimed defects on the Attack Path tab, written BEFORE any fix.
 * Each case asserts the behaviour the approved plan requires, so on the unfixed source (d4033f63) a reproduced defect
 * FAILS, and a claim that does not reproduce PASSES and gets no fix. The audit ids (C = crash, M = misreport,
 * I = invented value) are the ones in PLAN-ATTACK-PATH-IMPLEMENTATION-2026-10-17.md §3.3.
 *
 * TEST_ONLY inputs: the captured target catalog (__tests__/fixtures/ap182-lifecycle; provenance in its README) and
 * CONSTRUCTED bodies labelled per case. Nothing here is a product fixture or acceptance evidence (UI-31).
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import capturedSection from "@/__tests__/fixtures/ap182-lifecycle/target-catalog-section.json"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { JewelRiskSummary } from "@/lib/attack-paths/convergence-types"

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  router: { push: () => undefined, replace: () => undefined, prefetch: () => undefined, back: () => undefined },
}))
vi.mock("next/navigation", () => ({
  useSearchParams: () => nav.params,
  useRouter: () => nav.router,
  usePathname: () => "/attack-paths-v2",
}))

import { AttackPathsV2 } from "@/components/attack-paths-v2/attack-paths-v2"
import { AtlasLateralChainCanvas, AtlasLateralLensPanel } from "@/components/attack-paths-v2/atlas-lateral-lens"
import { toCrownJewelSummary } from "@/lib/attack-paths/crown-jewel-v2-navigation"
import { crownJewelFromArnName } from "@/lib/attack-paths/use-crown-jewel-convergence"
import type { AtlasLateralResponse } from "@/components/attack-paths-v2/use-atlas-lateral"
import { BusinessImpactPanel } from "@/components/business-impact/business-impact-panel"
import { compilePathListRow } from "@/components/attack-paths-v2/compile-path-list-row"
import { PathCVEAssessmentPanel } from "@/components/attack-paths-v2/path-cve-assessment-panel"
import type { AttackPathReport } from "@/components/attack-paths-v2/attack-path-report-types"
import { useAttackPathReport } from "@/components/attack-paths-v2/use-attack-path-report"
import { Zoom0RiskHeader } from "@/components/attack-paths-v2/zoom0-risk-header"
import { AccountScopeProvider } from "@/lib/account-scope-context"

type Section = { system_name: string; customer_id: string; account_id: string; targets: Array<Record<string, unknown>> }
const SECTION = capturedSection as unknown as Section
const SYSTEM = SECTION.system_name
const idOf = (name: string, kind: string) => String(SECTION.targets.find((t) => t.name === name && t.kind === kind)!.target_id)

type Answer = { status: number; body: unknown } | "pending"
type Served = { section?: unknown; summary?: Answer; blastRadius?: Answer; reports?: Record<string, Answer>; regions?: string[]; iap?: Answer }

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}
const answer = (a: Answer) => (a === "pending" ? new Promise<Response>(() => undefined) : respond(a.status, a.body))

function serve(s: Served = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url === "/api/proxy/admin/customers") return respond(200, [{ customer_id: SECTION.customer_id, display_name: SECTION.customer_id }])
    if (url.includes("/api/proxy/admin/accounts/scope/options/all")) {
      return respond(200, { customer_id: SECTION.customer_id,
        accounts: [{ account_id: SECTION.account_id, display_name: SECTION.customer_id, regions: s.regions ?? [], group_ids: [], status: "active" }], groups: [] })
    }
    if (url.startsWith("/api/proxy/systems")) return respond(200, { systems: [{ name: SYSTEM }] })
    if (url.startsWith(`/api/proxy/attack-paths/${encodeURIComponent(SYSTEM)}/targets`)) return respond(200, s.section ?? capturedSection)
    if (url.includes("/identity-attack-paths/") && s.iap) return answer(s.iap)
    if (url.includes("/by-crown-jewel/summary") && s.summary) return answer(s.summary)
    if (url.includes("/blast-radius") && s.blastRadius) return answer(s.blastRadius)
    const report = url.match(/\/api\/proxy\/attack-paths\/path\/([^/]+)\/report/)
    if (report && s.reports?.[decodeURIComponent(report[1])]) return answer(s.reports[decodeURIComponent(report[1])])
    return respond(502, { detail: "bad gateway" })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}
const calls = (f: ReturnType<typeof serve>, needle: string) => f.mock.calls.filter((c) => String(c[0]).includes(needle)).length
const tick = (ms = 60) => act(() => new Promise((r) => setTimeout(r, ms)))

beforeEach(() => {
  for (const key of Array.from(nav.params.keys())) nav.params.delete(key)
  nav.params.set("system", SYSTEM)
  window.localStorage.clear()
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

const mountPage = () => act(async () => { render(<AccountScopeProvider><AttackPathsV2 systemName={SYSTEM} /></AccountScopeProvider>) })

// ── crashes ──────────────────────────────────────────────────────────────────────────────────────────────────────

describe("C1 · the risk header over a server risk_summary without damage_types", () => {
  it("renders instead of throwing (CONSTRUCTED: no damage_types anywhere)", () => {
    const risk = { observed_paths: 0, configured_paths: 0, evidence: "configured" } as unknown as JewelRiskSummary
    expect(() => render(<Zoom0RiskHeader risk={risk} />)).not.toThrow()
  })
})

describe("C4 · an ARN deep link (the id buildAttackPathsV2CjUrl writes) on the Exposure tab", () => {
  it("renders instead of throwing on the missing jewel (captured catalog; ?jewel=<arn>&mode=exposure)", async () => {
    serve()
    const arn = String(SECTION.targets.find((t) => t.name === "bucket-1")!.arn)
    nav.params.set("jewel", arn)
    nav.params.set("mode", "exposure")
    await expect(mountPage()).resolves.toBeUndefined()
  })
})

describe("C2 · a CVE assessment missing the arrays the panel spreads and measures", () => {
  it("renders the panel instead of throwing (CONSTRUCTED: ACTIVE summary, one assessment with scalars only)", () => {
    const report = {
      report_id: "r1", path_id: "p1", claims: [], gates: [], attacker_steps: [], damage_matrix: [],
      cve_summary: { status: "ACTIVE_FINDINGS", message: "1 active finding" },
      cve_assessments: [{ assessment_id: "a1", path_id: "p1", finding_id: "f1", node_id: "n1", cve_id: "CVE-2026-0001",
        mode: "CURRENT", verdict: "EXPLOITABLE_NOW", message: "exploitable" }],
    } as unknown as AttackPathReport
    expect(() => render(<PathCVEAssessmentPanel report={report} />)).not.toThrow()
    expect(screen.getAllByTestId("path-cve-assessment")).toHaveLength(1)
  })
  it("a decision with no cve_id is counted as unreadable, not rendered blank (CONSTRUCTED: two real verdicts)", () => {
    // Real verdicts (VERDICT_PRIORITY keys): with an unknown verdict the comparator is NaN and never reaches the id.
    const report = {
      report_id: "r2", path_id: "p1", claims: [], gates: [], attacker_steps: [], damage_matrix: [],
      cve_summary: { status: "ACTIVE_FINDINGS", message: "2 active findings" },
      cve_assessments: [
        { assessment_id: "a1", path_id: "p1", finding_id: "f1", node_id: "n1", cve_id: "CVE-2026-0001", mode: "CURRENT", verdict: "UNVERIFIED", message: "x",
          evidence_refs: [], blocking_control_refs: [], satisfied_preconditions: [], missing_preconditions: [], blocking_gates: [], missing_evidence: [], reachable_next_hops: [], reachable_crown_jewels: [] },
        { assessment_id: "a2", path_id: "p1", finding_id: "f2", node_id: "n2", cve_id: null, mode: "CURRENT", verdict: "UNVERIFIED", message: "y",
          evidence_refs: [], blocking_control_refs: [], satisfied_preconditions: [], missing_preconditions: [], blocking_gates: [], missing_evidence: [], reachable_next_hops: [], reachable_crown_jewels: [] },
        { assessment_id: "a3", path_id: "p1", finding_id: "f3", node_id: "n3", cve_id: "CVE-2026-0002", mode: "CURRENT", verdict: "EXPLOITABLE_NOW", message: "z",
          evidence_refs: [], blocking_control_refs: [], satisfied_preconditions: [], missing_preconditions: [], blocking_gates: [], missing_evidence: [], reachable_next_hops: [], reachable_crown_jewels: [] },
      ],
    } as unknown as AttackPathReport
    expect(() => render(<PathCVEAssessmentPanel report={report} />)).not.toThrow()
    const shown = screen.getAllByTestId("path-cve-assessment").map((el) => el.getAttribute("data-assessment-id"))
    expect(shown).toEqual(["a3", "a1"])
    expect(screen.getByTestId("path-cve-unreadable").textContent).toMatch(/1 current access decision was served without a CVE id/)
  })
})

describe("C3 · a business-impact scenario missing the fields the card dereferences", () => {
  it("renders the card instead of throwing (CONSTRUCTED: scenario with only id, title, effect, path_count)", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes("/api/proxy/business-impact/scenarios/")) {
        return respond(200, { scenarios: [{ scenario_id: "s1", title: "Data theft", business_effect: "effect", path_count: 1 }] })
      }
      return respond(502, { detail: "bad gateway" })
    }))
    await expect(act(async () => { render(<BusinessImpactPanel systemName={SYSTEM} pathId="p1" />) })).resolves.toBeUndefined()
    await waitFor(() => expect(screen.queryByText(/Calculating unique business scenarios/)).toBeNull())
    expect(screen.getByText("Data theft")).toBeInTheDocument()
    // The expanded grid dereferences six more optional fields: open it.
    await act(async () => { fireEvent.click(screen.getByText(/Calculation, assumptions, and regulatory exposure/)) })
    expect(screen.getByText(/No monetary components are defined yet/)).toBeInTheDocument()
    expect(screen.getByText(/No potentially applicable rule pack/)).toBeInTheDocument()
    expect(screen.getByText(/No high-provenance comparable/)).toBeInTheDocument()
    expect(screen.getByText(/Confidence not reported/)).toBeInTheDocument()
  })
})

describe("C5 · an atlas simulation body without chains / dead_ends / evidence_bundle", () => {
  // A reachable, selected foothold: with candidates=[] the panel never reads response.chains (the earlier form of this
  // case was vacuous).
  const foothold = {
    workload_id: "i-0c5", workload_name: "web-1", workload_type: "EC2Instance", role_arn: null, role_name: null,
    foothold_likelihood: "EXPOSED", foothold_reasons: ["public_ingress"], observed_access_to_jewel: false,
    access_last_seen: null, security_group_ids: [], atlas_rank: 1,
    atlas_evaluation: { state: "REACHABLE", chain_count: 1, dead_end_count: 0 },
  } as unknown as Parameters<typeof AtlasLateralLensPanel>[0]["candidates"][number]
  const response = { catalog_version: "atlas-c1", elapsed_ms: 12 } as unknown as AtlasLateralResponse

  it("the lens panel renders and says the answer is unreadable — never 'No chain found' (CONSTRUCTED: {catalog_version, elapsed_ms} only)", () => {
    expect(() => render(
      <AtlasLateralLensPanel candidates={[foothold]} selectedFootholdId={foothold.workload_id} selectedFoothold={foothold} response={response}
        evaluation={null} candidatesLoading={false} simulationLoading={false} error={null}
        onSelectFoothold={() => undefined} onRetry={() => undefined} />,
    )).not.toThrow()
    expect(screen.getByTestId("atlas-response-unreadable")).toBeInTheDocument()
    expect(screen.queryByText(/No chain found within modeled scope/)).toBeNull()
    expect(screen.queryByText(/dead ends explored/)).toBeNull()
  })

  it("the chain canvas renders and says the answer is unreadable (same body)", () => {
    expect(() => render(
      <AtlasLateralChainCanvas selectedFoothold={foothold} response={response} loading={false} jewelName="bucket-1"
        evaluation={null} recommendedFoothold={null} onSelectFoothold={() => undefined} />,
    )).not.toThrow()
    expect(screen.getByTestId("atlas-canvas-unreadable")).toBeInTheDocument()
    expect(screen.queryByText(/found no replay-validated chain/)).toBeNull()
  })

  it("the chain canvas over an empty chains list WITHOUT dead_ends renders the no-route copy instead of throwing (CONSTRUCTED)", () => {
    const emptyChains = { catalog_version: "atlas-c1", elapsed_ms: 12, chains: [] } as unknown as AtlasLateralResponse
    expect(() => render(
      <AtlasLateralChainCanvas selectedFoothold={foothold} response={emptyChains} loading={false} jewelName="bucket-1"
        evaluation={null} recommendedFoothold={null} onSelectFoothold={() => undefined} />,
    )).not.toThrow()
    expect(screen.getByText(/No lateral route found from web-1 to bucket-1/)).toBeInTheDocument()
    expect(screen.getByText(/an unreported number of dead ends/)).toBeInTheDocument()
  })
})

describe("C6 · a legacy damage_types entry that is not a string", () => {
  it("compiles the row instead of throwing (CONSTRUCTED: damage_types [42])", () => {
    const path = { id: "p-c6", nodes: [], edges: [], hop_count: 0, damage_types: [42] } as unknown as IdentityAttackPath
    expect(() => compilePathListRow(path, null, null as never)).not.toThrow()
  })
})

// ── invented values ─────────────────────────────────────────────────────────────────────────────────────────────

describe("I1 · the risk header invents a headline, a mitigation and serving states", () => {
  it("says nothing the server did not author (CONSTRUCTED: no headline, hint, serve_state or coverage_state)", () => {
    const risk = { observed_paths: 1, configured_paths: 0, evidence: "configured", damage_types: [] } as unknown as JewelRiskSummary
    render(<Zoom0RiskHeader risk={risk} />)
    expect(screen.queryByText("Configured path risk")).toBeNull()
    expect(screen.queryByText(/Tighten least-privilege for the path identity/)).toBeNull()
    const header = screen.getByTestId("zoom0-risk-header")
    expect(header.getAttribute("data-serve-state")).not.toBe("ACTIVE")
    expect(header.getAttribute("data-coverage-state")).not.toBe("READY")
  })

  it("an absent evidence word is 'Not reported', not 'Configured'; the mitigation affordance stays without the invented hint (CONSTRUCTED)", () => {
    const risk = { observed_paths: 0, configured_paths: 0 } as unknown as JewelRiskSummary
    const onMitigate = vi.fn()
    render(<Zoom0RiskHeader risk={risk} onMitigate={onMitigate} />)
    expect(screen.queryByText(/Configured/)).toBeNull()
    expect(screen.getAllByText(/Not reported/).length).toBeGreaterThan(0)
    const button = screen.getByTestId("zoom0-risk-mitigate")
    expect(button.getAttribute("data-hint")).toBe("absent")
    expect(button.textContent).not.toMatch(/Tighten least-privilege/)
    fireEvent.click(button)
    expect(onMitigate).toHaveBeenCalledTimes(1)
  })
})

describe("I3 · a catalog row with a severity label but no max_severity", () => {
  it("shows no risk score of 0 beside HIGH (CONSTRUCTED: aurora-a without max_severity)", async () => {
    serve({ section: { ...SECTION, targets: SECTION.targets.map((t) => {
      if (t.name !== "aurora-a") return t
      const { max_severity: _drop, ...rest } = t
      return { ...rest, max_severity_label: "HIGH" }
    }) } })
    await mountPage()
    const rows = await screen.findAllByText("aurora-a")
    const row = rows.map((el) => el.closest("button")).find((b) => b && /HIGH/.test(b.textContent ?? "")) as HTMLElement
    expect(row).toBeTruthy()
    expect(within(row).queryByLabelText("Risk score 0")).toBeNull()
    expect(row.textContent).not.toMatch(/\b0\s*aurora-a/)
  })
})

// ── misreports ──────────────────────────────────────────────────────────────────────────────────────────────────

describe("M1 · the CVE report of the previous pin under a new pin", () => {
  it("clears the old report while the new one loads (CONSTRUCTED reports: A answers, B never does)", async () => {
    serve({ reports: {
      A: { status: 200, body: { report_id: "r-A", path_id: "A", claims: [], gates: [], attacker_steps: [], damage_matrix: [] } },
      B: "pending",
    } })
    const pathA = { id: "A", attack_path_id: "A", nodes: [], edges: [] } as unknown as IdentityAttackPath
    const pathB = { id: "B", attack_path_id: "B", nodes: [], edges: [] } as unknown as IdentityAttackPath
    const { result, rerender } = renderHook(({ p }) => useAttackPathReport(p), { initialProps: { p: pathA } })
    await waitFor(() => expect(result.current.report?.path_id).toBe("A"))
    rerender({ p: pathB })
    await waitFor(() => expect(result.current.loading).toBe(true))
    expect(result.current.report).toBeNull()
  })
})

describe("M2 · a deep-linked pin while the summary is still loading", () => {
  it("is loading, never 'This path is not present in the current Neptune result' (captured bucket-1; summary pending)", async () => {
    const f = serve({ summary: "pending" })
    nav.params.set("jewel", idOf("bucket-1", "S3Bucket"))
    nav.params.set("path", "p-deep-link")
    await mountPage()
    await waitFor(() => expect(calls(f, "/by-crown-jewel/summary")).toBeGreaterThan(0))
    await tick()
    expect(screen.queryByText(/not present in the current Neptune result/)).toBeNull()
  })
})

describe("M4 · a 200 hold answer to the summary read", () => {
  it("is named and not retried as a cold backend (CONSTRUCTED hold body; the plan's V3-PERF-06/07)", async () => {
    const { useCrownJewelConvergence } = await import("@/lib/attack-paths/use-crown-jewel-convergence")
    const f = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes("/by-crown-jewel/summary")) return respond(200, { semantic_status: "not_recorded", hold_reason: "JEWEL_NOT_IN_IAP_PUBLICATION" })
      return respond(502, { detail: "bad gateway" })
    })
    vi.stubGlobal("fetch", f)
    const jewel = { id: "arn:aws:s3:::bucket-1", canonical_id: "arn:aws:s3:::bucket-1", name: "bucket-1", type: "S3Bucket",
      severity: "HIGH", path_count: 2, highest_risk_score: 80, is_internet_exposed: false, data_classification: null, target_state: "observed" }
    const { result } = renderHook(() => useCrownJewelConvergence("Orders", jewel as never))
    await waitFor(() => expect(result.current.error).toMatch(/JEWEL_NOT_IN_IAP_PUBLICATION/))
    expect(result.current.retrying).toBe(false)
    expect(result.current.loading).toBe(false)
  })

  it("a final 4xx (404) is named in the server's words and not retried; a 503 still climbs the ladder (CONSTRUCTED)", async () => {
    const { useCrownJewelConvergence } = await import("@/lib/attack-paths/use-crown-jewel-convergence")
    const jewel = { id: "arn:aws:s3:::bucket-1", canonical_id: "arn:aws:s3:::bucket-1", name: "bucket-1", type: "S3Bucket",
      severity: "HIGH", path_count: 2, highest_risk_score: 80, is_internet_exposed: false, data_classification: null, target_state: "observed" }
    const summaryAnswers = (status: number, body: unknown) => vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes("/by-crown-jewel/summary")) return respond(status, body)
      return respond(502, { detail: "bad gateway" })
    })
    vi.stubGlobal("fetch", summaryAnswers(404, { detail: "no such jewel in the active publication" }))
    const final = renderHook(() => useCrownJewelConvergence("Orders", jewel as never))
    await waitFor(() => expect(final.result.current.error).toMatch(/no such jewel in the active publication/))
    expect(final.result.current.error).not.toMatch(/busy/i)
    expect(final.result.current.retrying).toBe(false)
    expect(final.result.current.loading).toBe(false)
    expect(final.result.current.data).toBeNull()
    final.unmount()
    // CONTROL: a 503 is a cold backend; the ladder (AP188) still retries it.
    vi.stubGlobal("fetch", summaryAnswers(503, { detail: "warming" }))
    const cold = renderHook(() => useCrownJewelConvergence("Orders", jewel as never))
    await waitFor(() => expect(cold.result.current.retrying).toBe(true))
    cold.unmount()
  })

  it("the summary proxy's own 502 wrapper ({error: 'Failed to load crown jewel summary'}) is a cold backend: still retried (CONSTRUCTED from the proxy route)", async () => {
    // app/api/proxy/attack-paths/[systemName]/by-crown-jewel/summary/route.ts answers backend 5xx and its own timeout
    // with a legacy {error} body; iapHold reads that as kind "error". It must not be settled.
    const { useCrownJewelConvergence } = await import("@/lib/attack-paths/use-crown-jewel-convergence")
    const jewel = { id: "arn:aws:s3:::bucket-1", canonical_id: "arn:aws:s3:::bucket-1", name: "bucket-1", type: "S3Bucket",
      severity: "HIGH", path_count: 2, highest_risk_score: 80, is_internet_exposed: false, data_classification: null, target_state: "observed" }
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes("/by-crown-jewel/summary")) return respond(502, { error: "Failed to load crown jewel summary", status: 502 })
      return respond(502, { detail: "bad gateway" })
    }))
    const { result, unmount } = renderHook(() => useCrownJewelConvergence("Orders", jewel as never))
    await waitFor(() => expect(result.current.retrying).toBe(true))
    expect(result.current.settled).toBe(false)
    unmount()
  })

  it("'unavailable' splits by source: a 200 semantic hold is settled, a typed 503 reader failure keeps the ladder (CONSTRUCTED)", async () => {
    const { useCrownJewelConvergence } = await import("@/lib/attack-paths/use-crown-jewel-convergence")
    const jewel = { id: "arn:aws:s3:::bucket-1", canonical_id: "arn:aws:s3:::bucket-1", name: "bucket-1", type: "S3Bucket",
      severity: "HIGH", path_count: 2, highest_risk_score: 80, is_internet_exposed: false, data_classification: null, target_state: "observed" }
    const summaryAnswers = (status: number, body: unknown) => vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes("/by-crown-jewel/summary")) return respond(status, body)
      return respond(502, { detail: "bad gateway" })
    })
    vi.stubGlobal("fetch", summaryAnswers(200, { semantic_status: "unavailable", hold_reason: "SNAPSHOT_MISSING" }))
    const settled = renderHook(() => useCrownJewelConvergence("Orders", jewel as never))
    await waitFor(() => expect(settled.result.current.settled).toBe(true))
    expect(settled.result.current.error).toMatch(/Unavailable — SNAPSHOT_MISSING/)
    expect(settled.result.current.retrying).toBe(false)
    settled.unmount()
    // the same word on a 503 is the reader failing right now (use-cached-fetch: 503 is transient)
    vi.stubGlobal("fetch", summaryAnswers(503, { semantic_status: "unavailable", hold_reason: "SEMANTIC_READ_UNAVAILABLE: READER_ERROR" }))
    const transient = renderHook(() => useCrownJewelConvergence("Orders", jewel as never))
    await waitFor(() => expect(transient.result.current.retrying).toBe(true))
    expect(transient.result.current.settled).toBe(false)
    transient.unmount()
  })

  it("settled is cleared when the selection moves to a jewel the hook does not read (authoritative zero) (CONSTRUCTED)", async () => {
    const { useCrownJewelConvergence } = await import("@/lib/attack-paths/use-crown-jewel-convergence")
    const held = { id: "arn:aws:s3:::bucket-1", canonical_id: "arn:aws:s3:::bucket-1", name: "bucket-1", type: "S3Bucket",
      severity: "HIGH", path_count: 2, highest_risk_score: 80, is_internet_exposed: false, data_classification: null, target_state: "observed" }
    const zero = { ...held, id: "arn:aws:s3:::bucket-0", canonical_id: "arn:aws:s3:::bucket-0", name: "bucket-0", severity: null,
      path_count: 0, highest_risk_score: null, target_state: "no_modeled_route", catalog_path_count: 0 }
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes("/by-crown-jewel/summary")) return respond(200, { semantic_status: "not_recorded", hold_reason: "X" })
      return respond(502, { detail: "bad gateway" })
    }))
    const h = renderHook(({ j }: { j: unknown }) => useCrownJewelConvergence("Orders", j as never), {
      initialProps: { j: held as unknown },
    })
    await waitFor(() => expect(h.result.current.settled).toBe(true))
    h.rerender({ j: zero as unknown })
    await waitFor(() => expect(h.result.current.settled).toBe(false))
    expect(h.result.current.error).toBeNull()
    h.unmount()
  })
})

describe("retry storm · the legacy IAP read on a 502 backend", () => {
  // SMOKE ONLY. This mounted page cannot observe the loop: the re-render that re-arms the 8 s timer is deferred past
  // each act scope, so it counts 2 reads with and without the bound (probe, run 6). The bound itself is proven by
  // __tests__/attack-paths/use-bounded-auto-retry.test.ts over the hook the page now uses.
  it("the background IAP auto-retry fires on a 502 (captured catalog; IAP 502) — smoke, not the bound", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const f = serve()
      const base = f.getMockImplementation()!
      f.mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input)
        // A 502 whose body settles inside the fake-timer advance (a real Response.json() settles in real time).
        if (url.includes("/identity-attack-paths/")) {
          return { ok: false, status: 502, json: async () => ({ detail: "bad gateway" }) } as unknown as Response
        }
        return base(input)
      })
      nav.params.set("jewel", idOf("bucket-1", "S3Bucket"))
      await mountPage()
      await act(async () => { await vi.advanceTimersByTimeAsync(8_000) })
      const iapReads = f.mock.calls.filter((c) => /identity-attack-paths\/Orders\?/.test(String(c[0]))).length
      expect(iapReads).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("M6 · a PARTIAL answer with no listed path", () => {
  it("is not 'No attack paths … today' (captured bucket-1; CONSTRUCTED summary ACTIVE/PARTIAL, paths [])", async () => {
    const f = serve({ summary: { status: 200, body: { system: SYSTEM, serve_state: "ACTIVE", coverage_state: "PARTIAL", paths_total: 0, paths: [] } } })
    nav.params.set("jewel", idOf("bucket-1", "S3Bucket"))
    await mountPage()
    await waitFor(() => expect(calls(f, "/by-crown-jewel/summary")).toBeGreaterThan(0))
    await waitFor(() => expect(screen.getByTestId("paths-partial-state")).toBeInTheDocument())
    expect(screen.queryByText(/No attack paths to/)).toBeNull()
    expect(screen.getByTestId("paths-partial-state").textContent).toMatch(/does not claim that no route exists/)
  })
})

describe("M4 (page) · the rail over a 200 hold answer to the summary read", () => {
  it("names the hold with a Retry, never 'Loading paths for this jewel…' (captured bucket-1; CONSTRUCTED hold body)", async () => {
    const f = serve({ summary: { status: 200, body: { semantic_status: "not_recorded", hold_reason: "JEWEL_NOT_IN_IAP_PUBLICATION" } } })
    nav.params.set("jewel", idOf("bucket-1", "S3Bucket"))
    await mountPage()
    await waitFor(() => expect(calls(f, "/by-crown-jewel/summary")).toBeGreaterThan(0))
    await waitFor(() => expect(screen.getByTestId("paths-hard-error-reason")).toBeInTheDocument())
    expect(screen.getByTestId("paths-hard-error-reason").textContent).toMatch(/JEWEL_NOT_IN_IAP_PUBLICATION/)
    expect(screen.getByText("Paths not served for this target")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Retry paths/ })).toBeInTheDocument()
    expect(screen.queryByText(/Loading paths for this jewel/)).toBeNull()
    // Two mounted hooks (page + fan-in panel) each read the summary once; that the hold is not retried is proven at
    // the hook in the M4 describe above (retrying=false, settled=true), not by counting here.
  })
})

describe("I3 (lite jewels) · summaries built from an id / arn alone", () => {
  it("carry no severity, score or exposure — nothing is known about them (toCrownJewelSummary, crownJewelFromArnName)", () => {
    const lite = toCrownJewelSummary({ id: "arn:aws:s3:::bucket-9", name: "bucket-9", type: "S3Bucket" })
    expect(lite.severity).toBeNull()
    expect(lite.highest_risk_score).toBeNull()
    expect(lite.is_internet_exposed).toBeNull()
    const fromArn = crownJewelFromArnName("arn:aws:s3:::bucket-9", "bucket-9")
    expect(fromArn?.severity).toBeNull()
    expect(fromArn?.highest_risk_score).toBeNull()
    expect(fromArn?.is_internet_exposed).toBeNull()
    // a full summary passes through untouched
    const full = toCrownJewelSummary({ ...lite, path_count: 3, severity: "HIGH", highest_risk_score: 70 })
    expect(full.severity).toBe("HIGH")
    expect(full.highest_risk_score).toBe(70)
  })
})

describe("M13 · the header when the catalog is NOT_READY", () => {
  it("never substitutes blast-radius totals (CONSTRUCTED: NOT_READY catalog; blast radius 7 paths / 3 targets)", async () => {
    // The blast-radius read fires only for one selected account + region (blast-radius-scope.ts): select them the way
    // the scope provider persists a selection.
    window.localStorage.setItem("cyntro-product-scope",
      JSON.stringify({ customerId: SECTION.customer_id, groupId: "all", accountId: SECTION.account_id, region: "eu-west-1" }))
    const f = serve({
      section: { ...SECTION, serve_state: "NOT_READY", not_ready_reason: "projection_pending", targets: [], counts: {}, total_targets: 0 },
      blastRadius: { status: 200, body: { verdict: { attack_paths: 7, reachable_crown_jewels: 3 } } },
      regions: ["eu-west-1"],
    })
    await mountPage()
    await waitFor(() => expect(calls(f, "/blast-radius")).toBeGreaterThan(0))
    await tick()
    expect(screen.queryByText(/7 active paths/)).toBeNull()
    expect(screen.queryByText(/3 reachable targets/)).toBeNull()
  })
})

describe("M14 · a 200 catalog body that is not a catalog", () => {
  it("is unavailable, never 'No crown jewels detected' (CONSTRUCTED body {unexpected: true}; IAP answers 200 with no rows so the rail itself renders)", async () => {
    // With the IAP read failing too, the page's full-page "Could not load attack paths" would stand in front of the
    // rail and this case would pass for the wrong reason. A 200 IAP envelope with no rows lets the rail speak.
    const f = serve({ section: { unexpected: true }, iap: { status: 200, body: { semantic_status: "populated", crown_jewels: [], attack_paths: [] } } })
    await mountPage()
    await waitFor(() => expect(calls(f, "/targets")).toBeGreaterThan(0))
    await waitFor(() => expect(screen.getByTestId("crown-jewel-hold")).toBeInTheDocument())
    const hold = screen.getByTestId("crown-jewel-hold")
    expect(hold.getAttribute("data-hold-kind")).toBe("unavailable")
    expect(hold.textContent).toMatch(/TARGET_CATALOG_UNREADABLE/)
    expect(screen.queryByText(/No crown jewels detected/)).toBeNull()
    expect(screen.queryByText(/Could not load attack paths/)).toBeNull()
  })
})
