/**
 * AP201 / CP-B · CurrentAccessSourceList over the captured producer-shaped by-crown-jewel summary
 * (__tests__/fixtures/ap201-current-access; provenance in its README) and CONSTRUCTED variants, each labelled.
 *
 * Real: the component and lib/attack-paths/current-access-sources.ts. The list says only what the server said:
 * sections from its classification, "Approval not recorded" on every row, per-plane hits never summed, mixed sources
 * said as mixed, and the strongest route pinned through the parent's selection.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import captured from "@/__tests__/fixtures/ap201-current-access/by-crown-jewel-summary.json"
import { CurrentAccessSourceList } from "@/components/attack-paths-v2/current-access-source-list"
import type { ConvergencePath, CrownJewelConvergence } from "@/lib/attack-paths/convergence-types"

const SUMMARY = captured as unknown as CrownJewelConvergence

afterEach(() => cleanup())

function mount(data: CrownJewelConvergence | null, selectedPathId: string | null = null, activePaths?: Array<{ id: string }>) {
  const onSelectPath = vi.fn()
  render(<CurrentAccessSourceList data={data} activePaths={activePaths} jewelName="bucket-1" selectedPathId={selectedPathId} onSelectPath={onSelectPath} />)
  return onSelectPath
}
const rowOf = (uid: string) => screen.getAllByTestId("current-access-source").find((r) => r.getAttribute("data-source-key") === uid)!

const path = (over: Partial<ConvergencePath> & { path_id: string }): ConvergencePath =>
  ({ damage: [], score: 0, confidence: "configured", hop_count: 0, ...over }) as ConvergencePath
const body = (paths: ConvergencePath[], over: Partial<CrownJewelConvergence> = {}): CrownJewelConvergence =>
  ({ system: "Orders", paths_total: paths.length, observed_paths: 0, choke_points: {}, serve_state: "ACTIVE", coverage_state: "READY", paths, ...over })
const web1 = { kind: "EC2Instance", uid: "u1", name: "web-1" }

describe("CurrentAccessSourceList over the captured summary", () => {
  it("lists every compute source once, under the server's section, and says approval is not recorded on each", () => {
    mount(SUMMARY)
    const list = screen.getByTestId("current-access-sources")
    expect(list.getAttribute("data-source-count")).toBe(String(SUMMARY.paths.length))
    const rows = screen.getAllByTestId("current-access-source")
    expect(rows.map((r) => r.getAttribute("data-source-key")).sort()).toEqual(SUMMARY.paths.map((p) => p.source_compute!.uid).sort())
    expect(screen.getAllByTestId("current-access-approval")).toHaveLength(rows.length)
    expect(list.textContent).not.toMatch(/legitimate/i)
    expect(within(screen.getByTestId("current-access-section-observed")).getByText(/Observed activity toward bucket-1/)).toBeInTheDocument()
    expect(screen.getByTestId("current-access-section-allowed_not_observed")).toBeInTheDocument()
    expect(screen.getByTestId("current-access-section-blocked")).toBeInTheDocument()
    expect(screen.getByTestId("current-access-section-unverified")).toBeInTheDocument()
    expect(screen.queryByTestId("current-access-section-out_of_scope")).toBeNull()
    expect(screen.queryByTestId("current-access-non-compute")).toBeNull()
    expect(screen.queryByTestId("current-access-inactive")).toBeNull()
  })

  it("the observed source shows the server's seen window, per-plane hits (never a sum), the observed action and what kind of observed", () => {
    mount(SUMMARY)
    const observed = SUMMARY.paths.find((p) => p.evidence_contract?.classification === "observed")!
    const row = rowOf(observed.source_compute!.uid)
    const planes = observed.evidence_contract!.runtime_evidence
    expect(within(row).getByTestId("current-access-seen").textContent).toContain(`${planes.identity.first_seen!.slice(0, 10)} → ${planes.identity.last_seen!.slice(0, 10)}`)
    const evidence = within(row).getByTestId("current-access-planes").textContent ?? ""
    expect(evidence).toMatch(/identity observed · 3 hits \(cloudtrail_api\)/)
    expect(evidence).toMatch(/network observed · 3 hits \(flow_log_hit\)/)
    expect(evidence).toMatch(/data observed · 3 hits \(s3_access_log\)/)
    expect(evidence).not.toMatch(/9 hits/)
    expect(within(row).getByTestId("current-access-qualifier").textContent).toBe("whole path observed (contract)")
    expect(within(row).getByTestId("current-access-actions").textContent).toMatch(/s3:GetObject · observed/)
    expect(within(row).getByTestId("current-access-damage").textContent).toMatch(/write · read/)
    expect(within(row).queryByTestId("current-access-coverage")).toBeNull()
  })

  it("a source with no observed plane says 'not measured' and names what the answer could not see; an inferred one says why it is 'allowed'", () => {
    mount(SUMMARY)
    const blocked = SUMMARY.paths.find((p) => p.evidence_contract?.classification === "blocked")!
    const row = rowOf(blocked.source_compute!.uid)
    expect(within(row).getByTestId("current-access-seen").textContent).toMatch(/not measured/)
    expect(within(row).getByTestId("current-access-coverage").textContent).toBe("identity unavailable · network unavailable · data unavailable")
    expect(within(row).queryByTestId("current-access-qualifier")).toBeNull()
    const inferred = SUMMARY.paths.find((p) => p.evidence_contract?.classification === "inferred")!
    expect(within(rowOf(inferred.source_compute!.uid)).getByTestId("current-access-qualifier").textContent).toBe("no observed activity (contract)")
  })

  it("selecting a source pins its strongest route through the parent; the selected row is current and the list stays", () => {
    const onSelectPath = mount(SUMMARY)
    const first = screen.getAllByTestId("current-access-source")[0]
    fireEvent.click(first)
    expect(onSelectPath).toHaveBeenCalledWith(first.getAttribute("data-primary-path"))
    cleanup()
    mount(SUMMARY, first.getAttribute("data-primary-path"))
    const current = screen.getAllByTestId("current-access-source").filter((r) => r.getAttribute("aria-current") === "true")
    expect(current.map((r) => r.getAttribute("data-source-key"))).toEqual([first.getAttribute("data-source-key")])
    expect(screen.getAllByTestId("current-access-source").length).toBe(SUMMARY.paths.length)
  })

  it("each row is a valid button: phrasing content only, a concise accessible name, no toggle semantics", () => {
    mount(SUMMARY)
    for (const row of screen.getAllByTestId("current-access-source")) {
      expect(row.tagName).toBe("BUTTON")
      expect(row.querySelector("div, dl, dt, dd, p, ul, li, h1, h2, h3, h4")).toBeNull()
      expect(row.getAttribute("aria-label")).toMatch(/^acme-web-\d \(EC2Instance\): .*; approval not recorded$/)
      expect(row.hasAttribute("aria-pressed")).toBe(false)
    }
  })

  it("shows the cardinality as the server said it, and the partial note whenever the answer is not every route — truncated or not", () => {
    mount(SUMMARY)
    expect(screen.getByTestId("current-access-cardinality").textContent).toBe("5 of 5 routes listed")
    expect(screen.getByTestId("current-access-partial").textContent).toMatch(/coverage partial/)
    cleanup()
    mount({ ...SUMMARY, cardinality: { ...SUMMARY.cardinality!, returned_count: 2, truncated: true } })
    expect(screen.getByTestId("current-access-cardinality").textContent).toBe("2 of 5 routes listed · truncated")
    expect(screen.getByTestId("current-access-partial").textContent).toMatch(/coverage partial/)
  })

  it("routes outside the page's active set are counted in a note, not listed (CONSTRUCTED: one active id)", () => {
    const keep = SUMMARY.paths[0].path_id
    mount(SUMMARY, null, [{ id: keep }])
    expect(screen.getByTestId("current-access-sources").getAttribute("data-source-count")).toBe("1")
    expect(screen.getByTestId("current-access-inactive").textContent).toMatch(/^4 routes in the answer are not in the page's active path list and are not listed here\./)
  })
})

describe("CurrentAccessSourceList over CONSTRUCTED answers", () => {
  it("renders nothing for no answer, a NOT_READY answer, a hold, or an ACTIVE answer with no listed route (the page says those)", () => {
    const silent = (data: unknown) => {
      const { container } = render(<CurrentAccessSourceList data={data as CrownJewelConvergence | null} jewelName="j" selectedPathId={null} onSelectPath={() => undefined} />)
      expect(container.textContent).toBe("")
      cleanup()
    }
    silent(null)
    silent(body([], { serve_state: "NOT_READY" }))
    silent({ semantic_status: "not_recorded", hold_reason: "X" })
    silent(body([]))
  })

  it("non-compute origins are listed apart, never as sources; a route without a contract says so instead of inventing evidence", () => {
    mount(body([
      path({ path_id: "p1", origin_class: "standing_access", source: "arn:aws:iam::111122223333:role/ops", identity_name: "ops" }),
      path({ path_id: "p2", origin_class: "compute", source_compute: { kind: "Lambda", uid: "u2", name: "fn-2" }, evidence: "configured" }),
    ]))
    expect(screen.getByTestId("current-access-sources").getAttribute("data-source-count")).toBe("1")
    expect(screen.getByTestId("current-access-sources").textContent).toMatch(/1 compute source · 1 compute route to bucket-1 · 1 other-origin route/)
    expect(screen.getByTestId("current-access-non-compute").textContent).toMatch(/arn:aws:iam::111122223333:role\/ops · standing_access/)
    const row = screen.getByTestId("current-access-source")
    expect(row.getAttribute("data-section")).toBe("allowed_not_observed")
    expect(within(row).getByTestId("current-access-qualifier").textContent).toBe("configured (legacy whole-path word)")
    expect(within(row).getByTestId("current-access-planes").textContent).toBe("no evidence contract served for this route")
    expect(within(row).getByTestId("current-access-seen").textContent).toBe("not measured")
  })

  it("a source with several routes opens its strongest-evidence route and is said as MIXED with the per-section breakdown", () => {
    const onSelectPath = vi.fn()
    render(<CurrentAccessSourceList data={body([
      path({ path_id: "p-configured", origin_class: "compute", source_compute: web1, evidence: "configured", score: 90 }),
      path({ path_id: "p-observed", origin_class: "compute", source_compute: web1, evidence: "observed", confidence: "observed", score: 10 }),
      path({ path_id: "p-blocked", origin_class: "compute", source_compute: web1, evidence: "blocked", score: 95 }),
    ])} jewelName="j" selectedPathId={null} onSelectPath={onSelectPath} />)
    const row = screen.getByTestId("current-access-source")
    expect(row.getAttribute("data-section")).toBe("observed")
    expect(row.getAttribute("data-mixed")).toBe("true")
    expect(row.getAttribute("aria-label")).toBe("web-1 (EC2Instance): mixed routes; approval not recorded")
    expect(within(row).getByTestId("current-access-qualifier").textContent).toBe("mixed · 1 observed · 1 allowed, not observed · 1 blocked (listed under the strongest route)")
    expect(within(row).getByTestId("current-access-routes").textContent).toBe("3 listed · 1 observed · 1 allowed, not observed · 1 blocked · opens the strongest-evidence route")
    fireEvent.click(row)
    expect(onSelectPath).toHaveBeenCalledTimes(1)
    expect(onSelectPath).toHaveBeenCalledWith("p-observed")
  })

  it("feasibility words are relayed as the kind of observed / allowed they are; the contract is credited only for its own verdict", () => {
    const inferredContract = { classification: "inferred", evidence: "configured", whole_path_observed: false,
      gates: { identity: "OPEN_CONFIG", network: "OPEN_CONFIG", data: "UNKNOWN" }, runtime_evidence: {},
      permission_coverage: { actions: {}, evaluated_actions: [], complete: false } } as never
    mount(body([
      path({ path_id: "p1", origin_class: "compute", source_compute: web1, feasibility: { path_state: "REACHABLE", activity_state: "OBSERVED" } }),
      path({ path_id: "p2", origin_class: "compute", source_compute: { kind: "EC2Instance", uid: "u2", name: "web-2" }, feasibility: { path_state: "REACHABLE", activity_state: "UNKNOWN" } }),
      path({ path_id: "p3", origin_class: "compute", source_compute: { kind: "EC2Instance", uid: "u3", name: "web-3" }, feasibility: { path_state: "BLOCKED", activity_state: "OBSERVED" } }),
      // observed by feasibility while the contract says inferred: the contract must not be credited with "observed"
      path({ path_id: "p4", origin_class: "compute", source_compute: { kind: "EC2Instance", uid: "u4", name: "web-4" }, evidence_contract: inferredContract, feasibility: { path_state: "UNVERIFIED", activity_state: "OBSERVED" } }),
      // the legacy whole-path word alone
      path({ path_id: "p5", origin_class: "compute", source_compute: { kind: "EC2Instance", uid: "u5", name: "web-5" }, evidence: "observed", confidence: "observed" }),
    ]))
    expect(within(rowOf("u1")).getByTestId("current-access-qualifier").textContent).toBe("activity observed (server feasibility)")
    expect(within(rowOf("u2")).getByTestId("current-access-qualifier").textContent).toBe("activity unknown (server feasibility)")
    expect(rowOf("u3").getAttribute("data-section")).toBe("blocked")
    expect(within(rowOf("u4")).getByTestId("current-access-qualifier").textContent).toBe("activity observed (server feasibility) · path unverified")
    expect(within(rowOf("u5")).getByTestId("current-access-qualifier").textContent).toBe("observed (legacy whole-path word)")
    expect(screen.queryByText(/Observed activity toward/)?.closest("[data-testid]")?.getAttribute("data-testid")).toBe("current-access-section-observed")
  })

  it("shared, unattributed activity is said as such, never as this source's", () => {
    mount(body([
      path({ path_id: "p1", origin_class: "compute", source_compute: web1, evidence: "observed", confidence: "observed",
        path_bound_observations: [
          { plane: "network", kind: "flow_log_hit", evidence_quality: "observed", attribution: "exact", hit_count: 2, dst_port: 443, first_seen: "2026-10-01T00:00:00Z", last_seen: "2026-10-02T00:00:00Z", summary_key: "n1" },
          { plane: "data", kind: "cloudtrail_api", evidence_quality: "observed", attribution: "unresolved", hit_count: 99, api_operation: "GetObject" },
        ] }),
    ]))
    const row = screen.getByTestId("current-access-source")
    expect(within(row).getByTestId("current-access-seen").textContent).toMatch(/2026-10-01 → 2026-10-02 · shared activity on a role, not attributed to this source/)
    expect(within(row).getByTestId("current-access-planes").textContent).toMatch(/network flow_log_hit · 2 hits · port 443/)
    expect(within(row).getByTestId("current-access-planes").textContent).not.toMatch(/99/)
  })
})
