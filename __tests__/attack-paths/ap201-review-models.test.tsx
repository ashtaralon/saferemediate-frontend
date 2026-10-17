/**
 * AP201 · independent review findings (Alon 2026-10-17) S6 / S7 / S8 / S12 / S13 on the Attack Path models.
 *
 * TEST_ONLY: every body here is CONSTRUCTED (labelled per case) to carry the one shape a finding is about; nothing is a
 * product fixture or acceptance evidence (UI-31). Each case fails on the unfixed source (removed-fix controls in the
 * AP201 ledger).
 */
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CurrentAccessSourceList } from "@/components/attack-paths-v2/current-access-source-list"
import { PathCVEAssessmentPanel } from "@/components/attack-paths-v2/path-cve-assessment-panel"
import type { AttackPathReport } from "@/components/attack-paths-v2/attack-path-report-types"
import { normalizePathCVEAssessment, pathCVEPanelState } from "@/components/attack-paths-v2/path-cve-model"
import type { ConvergencePath, CrownJewelConvergence } from "@/lib/attack-paths/convergence-types"
import { currentAccessSources, routeAccess, routeActivity } from "@/lib/attack-paths/current-access-sources"
import { targetEntryToJewelSummary, type TargetCatalogEntry } from "@/lib/attack-paths/target-catalog"
import type { PathCVEAssessment } from "@/lib/cve-contracts"

afterEach(() => cleanup())

const path = (over: Partial<ConvergencePath> & { path_id: string }): ConvergencePath =>
  ({ damage: [], score: 0, confidence: "configured", hop_count: 0, origin_class: "compute", ...over }) as ConvergencePath
const body = (paths: ConvergencePath[]): CrownJewelConvergence =>
  ({ system: "Orders", paths_total: paths.length, observed_paths: 0, choke_points: {}, serve_state: "ACTIVE", coverage_state: "READY", paths })
const compute = (n: number) => ({ kind: "EC2Instance", uid: `uid-${n}`, name: `web-${n}` })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const feas = (over: Record<string, string>): any => over
const plane = (state: string, coverage: string[] = ["NO_OBSERVATION"]) => ({ state, coverage_states: coverage })
const contract = (runtime: Record<string, unknown>) =>
  ({ classification: "blocked", evidence: "configured", whole_path_observed: false, gates: {}, runtime_evidence: runtime }) as never

describe("S6 · a served word the page does not know is UNKNOWN, never a client derivation", () => {
  it("CONSTRUCTED: unknown activity_state over three observed planes is UNKNOWN (not OBSERVED from the contract)", () => {
    const p = path({ path_id: "a", source_compute: compute(1), feasibility: feas({ activity_state: "SEEN_RECENTLY" }),
      evidence_contract: contract({ identity: plane("observed"), network: plane("observed"), data: plane("observed") }) })
    expect(routeActivity(p)).toEqual({ activity: "UNKNOWN", basis: "feasibility",
      detail: 'the server sent activity "SEEN_RECENTLY", which this page does not recognise' })
  })

  it("CONSTRUCTED: unknown path_state on a blocked-classified route is UNKNOWN (not BLOCKED from the classification)", () => {
    const p = path({ path_id: "a", source_compute: compute(1), feasibility: feas({ path_state: "PARTIALLY_REACHABLE" }),
      evidence_contract: contract({}) })
    expect(routeAccess(p)).toEqual({ access: "UNKNOWN", basis: "feasibility",
      reason: 'the server sent access "PARTIALLY_REACHABLE", which this page does not recognise' })
  })

  it("CONSTRUCTED: absent served words keep today's behaviour (contract activity, blocked classification)", () => {
    const p = path({ path_id: "a", source_compute: compute(1),
      evidence_contract: contract({ identity: plane("observed"), network: plane("observed"), data: plane("observed") }) })
    expect(routeActivity(p)).toMatchObject({ activity: "OBSERVED", basis: "contract" })
    expect(routeAccess(p)).toMatchObject({ access: "BLOCKED", basis: "classification" })
  })
})

describe("S7 · the data-plane note is built only from data-plane states the server served", () => {
  const allNotObserved = contract({ identity: plane("not_observed"), network: plane("not_observed"), data: plane("not_observed") })

  it("CONSTRUCTED: a route with no evidence contract is 'not reported', never evidence of 'no observation'", () => {
    const s = currentAccessSources(body([
      path({ path_id: "a", source_compute: compute(1), evidence_contract: allNotObserved }),
      path({ path_id: "b", source_compute: compute(2) }),
    ]), { jewelType: "S3Bucket" })!
    expect(s.dataPlane).toEqual({ noDataObservation: false, observedRouteCount: 0, notReportedRouteCount: 1, routeCount: 2,
      servedStates: ["not observed", "NO_OBSERVATION"], summaryAbsent: false })
  })

  it("CONSTRUCTED: a contract whose data plane carries no state is 'not reported' too", () => {
    const s = currentAccessSources(body([
      path({ path_id: "a", source_compute: compute(1), evidence_contract: contract({ identity: plane("not_observed"), network: plane("not_observed") }) }),
    ]), { jewelType: "S3Bucket" })!
    expect(s.dataPlane).toMatchObject({ noDataObservation: false, notReportedRouteCount: 1, servedStates: [] })
  })

  it("CONSTRUCTED (rendered): 'No data-plane observation is bound to any listed route' only when every route served a state", () => {
    render(<CurrentAccessSourceList data={body([
      path({ path_id: "a", source_compute: compute(1), evidence_contract: allNotObserved }),
      path({ path_id: "b", source_compute: compute(2) }),
    ])} jewelName="acme-data" jewelType="S3Bucket" selectedPathId={null} onSelectPath={vi.fn()} />)
    const note = screen.getByTestId("current-access-data-plane").textContent ?? ""
    expect(note).not.toMatch(/No data-plane observation is bound to any listed route/)
    expect(note).not.toMatch(/no evidence contract/)
    expect(note).toBe('No listed route served an observed data plane. S3Bucket use is seen on the data plane; an empty Observed section is not "no traffic". Data-plane state not reported for 1 of 2 listed routes; its activity there is unknown. Served data-plane states: not observed, NO_OBSERVATION.')
    cleanup()

    render(<CurrentAccessSourceList data={body([
      path({ path_id: "a", source_compute: compute(1), evidence_contract: allNotObserved }),
    ])} jewelName="acme-data" jewelType="S3Bucket" selectedPathId={null} onSelectPath={vi.fn()} />)
    expect(screen.getByTestId("current-access-data-plane").textContent).toMatch(/^No data-plane observation is bound to any listed route — network and identity planes only\./)
  })
})

describe("S8 · all-unknown header never reads '0 compute sources with observed activity'", () => {
  it("CONSTRUCTED: every source UNKNOWN says activity is unknown for all of them", () => {
    render(<CurrentAccessSourceList data={body([
      path({ path_id: "a", source_compute: compute(1) }),
      path({ path_id: "b", source_compute: compute(2) }),
    ])} jewelName="acme-data" selectedPathId={null} onSelectPath={vi.fn()} />)
    const header = screen.getByTestId("current-access-header").textContent
    expect(header).toBe("Activity unknown for all 2 compute sources listed toward acme-data · observation window not reported")
    expect(header).not.toMatch(/\b0 compute sources/)
  })

  it("CONSTRUCTED: one source, unknown, is said as the one source", () => {
    render(<CurrentAccessSourceList data={body([path({ path_id: "a", source_compute: compute(1) })])}
      jewelName="acme-data" selectedPathId={null} onSelectPath={vi.fn()} />)
    expect(screen.getByTestId("current-access-header").textContent).toBe("Activity unknown for the one compute source listed toward acme-data · observation window not reported")
  })
})

describe("S12 · CVE normaliser keeps absent distinguishable from empty", () => {
  const scalars = { assessment_id: "a1", path_id: "p1", finding_id: "f1", node_id: "n1", cve_id: "CVE-2026-0001",
    mode: "CURRENT", verdict: "UNVERIFIED", message: "x", attacker_position: "internet", confidence: "INFERRED" }
  const report = (assessments: unknown) => ({
    report_id: "r1", path_id: "p1", claims: [], gates: [], attacker_steps: [], damage_matrix: [],
    cve_summary: { status: "ACTIVE_FINDINGS", message: "1 active finding", finding_count: 1, assessment_count: 1 },
    ...(assessments === undefined ? {} : { cve_assessments: assessments }),
  }) as unknown as AttackPathReport

  it("CONSTRUCTED: an absent list field is named as not reported; a served empty list is not", () => {
    const view = normalizePathCVEAssessment({ ...scalars, satisfied_preconditions: [] } as unknown as PathCVEAssessment)!
    expect(view.satisfied_preconditions).toEqual([])
    expect(view.notReportedFields).not.toContain("satisfied_preconditions")
    expect(view.notReportedFields).toContain("evidence_refs")
    expect(view.notReportedFields).toContain("missing_preconditions")
  })

  it("CONSTRUCTED (rendered): absent says 'Not reported'; a served empty list says 'None returned'", () => {
    render(<PathCVEAssessmentPanel report={report([{ ...scalars, satisfied_preconditions: [] }])} />)
    const evidence = screen.getByTestId("path-cve-evidence")
    expect(evidence.textContent).toMatch(/SatisfiedNone returned/)
    expect(evidence.textContent).toMatch(/Missing or blockedNot reported/)
    expect(evidence.textContent).toMatch(/Evidence and preconditions · references not reported/)
    expect(evidence.textContent).not.toMatch(/0 references|No missing item returned|No evidence reference returned/)
    cleanup()

    const served = { ...scalars, satisfied_preconditions: [], missing_preconditions: [], blocking_gates: [], missing_evidence: [],
      evidence_refs: [], blocking_control_refs: [] }
    render(<PathCVEAssessmentPanel report={report([served])} />)
    const ev2 = screen.getByTestId("path-cve-evidence")
    expect(ev2.textContent).toMatch(/0 references/)
    expect(ev2.textContent).toMatch(/No missing item returned/)
    expect(within(ev2).queryByTestId("path-cve-not-reported")).toBeNull()
  })

  it("CONSTRUCTED: an absent assessment list is 'not reported'; a served empty list keeps 'not returned'", () => {
    expect(pathCVEPanelState(report(undefined), "CURRENT").message).toMatch(/^CVE decisions were not reported: this report carries no assessment list\./)
    expect(pathCVEPanelState(report([]), "CURRENT").message).toMatch(/^Current access CVE decisions were not returned\./)
  })
})

describe("S13 · absent catalog counts stay absent (target catalog adapter)", () => {
  it("CONSTRUCTED: missing observed / standing / path counts are not invented as 0", () => {
    const e = { target_id: "t1", kind: "S3Bucket", name: "b", arn: null, native_id: null, region: null, account_id: null,
      is_internet_exposed: null, data_classification: null, data_classification_source: "unknown", inventory_present: true,
      max_severity: 0, max_severity_label: null, manifest_path_count: null, state: "observed", crown_jewel_source: null } as unknown as TargetCatalogEntry
    const j = targetEntryToJewelSummary(e)
    expect("observed_path_count" in j).toBe(false)
    expect("standing_access_count" in j).toBe(false)
    expect("materialized_path_count" in j).toBe(false)
    expect(j.catalog_path_count).toBeNull()
    const served = targetEntryToJewelSummary({ ...e, path_count: 0, observed_path_count: 0, standing_access_count: 2 })
    expect(served).toMatchObject({ materialized_path_count: 0, observed_path_count: 0, standing_access_count: 2 })
  })
})
