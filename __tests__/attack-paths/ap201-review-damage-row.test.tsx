/**
 * AP201 review T-6 (Alon, 2026-10-17): DamageComparison rendered a CVE-enabled damage row whose list fields were
 * absent by calling `.length` on undefined -- a throw. A row the server sent without a list now renders "Not
 * reported" for that list (absent is not "none"), and the served lists render as before.
 * Real: PathCVEAssessmentPanel and DamageComparison. CONSTRUCTED (labelled): the report body, shaped like the
 * phase-3 fixtures in __tests__/path-cve-phase3.test.tsx, with the damage row's lists left out.
 */
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { PathCVEAssessmentPanel } from "@/components/attack-paths-v2/path-cve-assessment-panel"

afterEach(() => cleanup())

const ASSESSMENT = {
  assessment_id: "assessment-current", path_id: "path-1", finding_id: "finding-1",
  node_id: "arn:aws:ec2:eu-west-1:123456789012:instance/i-0123456789abcdef0", cve_id: "CVE-2026-4242", mode: "CURRENT",
  attacker_position: "internet", role_in_path: "ENTRY", verdict: "EXPLOITABLE_NOW", reason_codes: ["NETWORK_PATH_OPEN"],
  exploit_preconditions: ["NETWORK_PATH_OPEN"], satisfied_preconditions: ["NETWORK_PATH_OPEN"], missing_preconditions: [],
  blocking_gates: [], message: "Exploitable now.",
}
const report = (row: Record<string, unknown>) => ({
  report_id: "report-1", report_version: "2", compiler_version: "2.0.0", path_id: "path-1",
  claims: [], gates: {}, attacker_steps: [], damage_matrix: [],
  cve_assessments: [ASSESSMENT],
  cve_summary: { status: "ACTIVE_FINDINGS", finding_count: 1, assessment_count: 1, coverage_states: ["CURRENT"],
    message: "One active scanner-confirmed CVE is evaluated on this path.", evidence_refs: ["scanner:finding-1"] },
  cve_enabled_damage: [{ assessment_id: ASSESSMENT.assessment_id, finding_id: ASSESSMENT.finding_id, cve_id: ASSESSMENT.cve_id,
    node_id: ASSESSMENT.node_id, mode: "CURRENT", verdict: ASSESSMENT.verdict, usable: "YES", blocker: null, ...row }],
})

describe("T-6 · a damage row without its lists", () => {
  it("renders 'Not reported' for each absent list instead of throwing", () => {
    expect(() => render(<PathCVEAssessmentPanel report={report({}) as never} />)).not.toThrow()
    const comparison = screen.getByTestId("path-cve-damage-comparison")
    expect(within(comparison).getAllByTestId("path-cve-list-not-reported")).toHaveLength(5)
    expect(within(comparison).queryByText("None returned")).toBeNull()
  })

  it("a served empty list is still 'none', and a served list still renders", () => {
    render(<PathCVEAssessmentPanel report={report({ current_reachable_damage: ["read public metadata"], cve_enabled_damage: [],
      newly_reachable_assets: [], newly_reachable_crown_jewels: [], exfiltration_routes: [] }) as never} />)
    const comparison = screen.getByTestId("path-cve-damage-comparison")
    expect(within(comparison).getByText("read public metadata")).toBeInTheDocument()
    expect(within(comparison).getAllByText("None returned")).toHaveLength(3)
    expect(within(comparison).queryByTestId("path-cve-list-not-reported")).toBeNull()
  })
})
