/**
 * AP201 / CP-B (Rev 6 Day 3) · CurrentAccessSourceList over the captured producer-shaped by-crown-jewel summary
 * (__tests__/fixtures/ap201-current-access; TEST_ONLY, provenance in its README) and CONSTRUCTED variants, each
 * labelled.
 *
 * Real: the component and lib/attack-paths/current-access-sources.ts. The list says only what the server said:
 * sections by activity, an access-now chip, "Approved need not recorded" on every row, counts per observation and per
 * plane never summed, cross-route dates labelled, conflicting origins said as such.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import captured from "@/__tests__/fixtures/ap201-current-access/by-crown-jewel-summary.json"
import { CurrentAccessSourceList } from "@/components/attack-paths-v2/current-access-source-list"
import type { ConvergencePath, CrownJewelConvergence } from "@/lib/attack-paths/convergence-types"

const SUMMARY = captured as unknown as CrownJewelConvergence

afterEach(() => cleanup())

function mount(data: CrownJewelConvergence | null, selectedPathId: string | null = null, activePaths?: Array<{ id: string }>, jewelType: string | null = null) {
  const onSelectPath = vi.fn()
  render(<CurrentAccessSourceList data={data} activePaths={activePaths} jewelName="acme-data" jewelType={jewelType} selectedPathId={selectedPathId} onSelectPath={onSelectPath} />)
  return onSelectPath
}
const rowOf = (uid: string) => screen.getAllByTestId("current-access-source").find((r) => r.getAttribute("data-source-key") === uid)!
const rowNamed = (name: string) => screen.getAllByTestId("current-access-source").find((r) => r.textContent?.includes(name))!

const path = (over: Partial<ConvergencePath> & { path_id: string }): ConvergencePath =>
  ({ damage: [], score: 0, confidence: "configured", hop_count: 0, origin_class: "compute", ...over }) as ConvergencePath
const body = (paths: ConvergencePath[], over: Partial<CrownJewelConvergence> = {}): CrownJewelConvergence =>
  ({ system: "Orders", paths_total: paths.length, observed_paths: 0, choke_points: {}, serve_state: "ACTIVE", coverage_state: "READY", paths, ...over })
const web1 = { kind: "EC2Instance", uid: "u1", name: "web-1" }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const feas = (path_state: string, activity_state: string, extra: Record<string, string> = {}): any => ({ path_state, activity_state, ...extra })

describe("CurrentAccessSourceList over the captured summary", () => {
  it("groups the five sources by ACTIVITY: three observed (one wholly, two on some planes), two unknown, none 'allowed'", () => {
    mount(SUMMARY)
    const list = screen.getByTestId("current-access-sources")
    expect(list.getAttribute("data-source-count")).toBe("5")
    const names = (section: string) => within(screen.getByTestId(`current-access-section-${section}`)).getAllByTestId("current-access-source").map((r) => r.textContent?.match(/acme-web-\d/)?.[0])
    expect(names("observed")).toEqual(["acme-web-1", "acme-web-2", "acme-web-5"])
    expect(names("unknown")).toEqual(["acme-web-3", "acme-web-4"])
    expect(screen.queryByTestId("current-access-section-not_observed")).toBeNull()
    expect(screen.getAllByTestId("current-access-approval").map((n) => n.textContent)).toEqual(Array(5).fill("Approved need not recorded"))
    // The only allowed uses of "approved": the fixed column text and the sentence that observed is not approved.
    const rest = (list.textContent ?? "").replace(/Approved need not recorded/g, "").replace(/Observed is not approved\./g, "")
    expect(rest).not.toMatch(/legitimate|approved/i)
  })

  it("the header says the observed-source count with its unit and window, and the generation / as-of the answer served", () => {
    mount(SUMMARY)
    expect(screen.getByTestId("current-access-header").textContent).toBe("3 compute sources with observed activity toward acme-data · observation window not reported")
    expect(screen.getByTestId("current-access-totals").textContent).toBe(
      `5 compute sources · 5 compute routes listed · as of ${SUMMARY.as_of} · generation ${SUMMARY.generation}`)
    expect(screen.getByTestId("current-access-section-count-observed").textContent).toBe("(3 compute sources · observation window not reported)")
  })

  it("never claims completeness: the reconciliation line says it is not served", () => {
    mount(SUMMARY)
    expect(screen.getByTestId("current-access-reconciliation").textContent).toMatch(/whether every observed compute is listed is not reported/)
  })

  it("access now is its own chip: the blocked route keeps Unknown activity and reads 'Access now: blocked'; others 'unknown'", () => {
    mount(SUMMARY)
    expect(within(rowNamed("acme-web-4")).getByTestId("current-access-access-now").textContent).toBe("Access now: blocked")
    expect(rowNamed("acme-web-4").getAttribute("data-section")).toBe("unknown")
    expect(within(rowNamed("acme-web-1")).getByTestId("current-access-access-now").textContent).toBe("Access now: unknown")
  })

  it("the inferred route with unavailable planes says Unknown with the reason, never 'no observed activity'", () => {
    mount(SUMMARY)
    const row = rowNamed("acme-web-3")
    expect(within(row).getByTestId("current-access-qualifier").textContent).toBe("unknown — activity not established: identity unavailable, data unavailable")
    expect(row.textContent).not.toMatch(/no observed activity/i)
  })

  it("the observed source shows first/last seen, per-plane hits (never a sum), the observed action, damage as assessed capability", () => {
    mount(SUMMARY)
    const observed = SUMMARY.paths.find((p) => p.evidence_contract?.classification === "observed")!
    const row = rowOf(observed.source_compute!.uid)
    const planes = observed.evidence_contract!.runtime_evidence
    expect(within(row).getByTestId("current-access-seen").textContent).toBe(`first seen ${planes.identity.first_seen!.slice(0, 10)} · last seen ${planes.identity.last_seen!.slice(0, 10)}`)
    const evidence = within(row).getByTestId("current-access-planes").textContent ?? ""
    expect(evidence).toMatch(/identity observed · 3 hits \(cloudtrail_api\)/)
    expect(evidence).toMatch(/network observed · 3 hits \(flow_log_hit\)/)
    expect(evidence).not.toMatch(/9 hits/)
    expect(within(row).getByTestId("current-access-qualifier").textContent).toBe("observed — the evidence contract classifies the route observed")
    expect(within(row).getByTestId("current-access-actions").textContent).toMatch(/s3:GetObject · observed/)
    expect(within(row).getByTestId("current-access-damage").textContent).toMatch(/assessed capability under this foothold/)
    expect(within(row).getByTestId("current-access-identity").textContent).toBe(`identity: ${observed.identity_name}`)
    expect(within(row).getByTestId("current-access-operations").textContent).toBe("not reported")
  })

  it("selecting a source pins its route through the parent; the selected row is current and the list stays", () => {
    const onSelectPath = mount(SUMMARY)
    const first = screen.getAllByTestId("current-access-source")[0]
    fireEvent.click(first)
    expect(onSelectPath).toHaveBeenCalledWith(first.getAttribute("data-primary-path"))
    cleanup()
    mount(SUMMARY, first.getAttribute("data-primary-path"))
    const current = screen.getAllByTestId("current-access-source").filter((r) => r.getAttribute("aria-current") === "true")
    expect(current.map((r) => r.getAttribute("data-source-key"))).toEqual([first.getAttribute("data-source-key")])
  })

  it("each row is a valid button: phrasing content only, an accessible name with all three states", () => {
    mount(SUMMARY)
    for (const row of screen.getAllByTestId("current-access-source")) {
      expect(row.tagName).toBe("BUTTON")
      expect(row.querySelector("div, dl, dt, dd, p, ul, li, h1, h2, h3, h4")).toBeNull()
      expect(row.getAttribute("aria-label")).toMatch(/^acme-web-\d \(EC2Instance\): activity .+; access now .+; approved need not recorded$/)
    }
  })

  it("shows the cardinality returned / eligible / generation total as served, truncation said, and the partial note", () => {
    mount(SUMMARY)
    const c = SUMMARY.cardinality!
    expect(screen.getByTestId("current-access-cardinality").textContent).toBe(`${c.returned_count} returned of ${c.eligible_total} eligible routes · ${c.generation_total} in the generation`)
    expect(screen.getByTestId("current-access-partial").textContent).toMatch(/coverage partial/)
    cleanup()
    mount({ ...SUMMARY, cardinality: { ...c, returned_count: 2, truncated: true } })
    expect(screen.getByTestId("current-access-cardinality").textContent).toMatch(/^2 returned of .* · truncated$/)
  })

  it("routes outside the page's active set are counted in a note, not listed", () => {
    mount(SUMMARY, null, [{ id: SUMMARY.paths[0].path_id }])
    expect(screen.getByTestId("current-access-sources").getAttribute("data-source-count")).toBe("1")
    expect(screen.getByTestId("current-access-inactive").textContent).toMatch(/^4 routes in the answer are not in the page's active path list/)
  })
})

describe("CurrentAccessSourceList over CONSTRUCTED answers", () => {
  it("renders nothing for no answer, a NOT_READY answer, a hold, or an ACTIVE answer with no listed route", () => {
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

  it("observed yesterday, blocked today: under Observed activity, with 'Access now: blocked' and the server's reason", () => {
    mount(body([path({ path_id: "p1", source_compute: web1, feasibility: feas("BLOCKED", "OBSERVED", { activity_detail: "traffic bound to this path on every plane", reason: "network gate CLOSED" }) })]))
    const row = screen.getByTestId("current-access-source")
    expect(row.getAttribute("data-section")).toBe("observed")
    const chip = within(row).getByTestId("current-access-access-now")
    expect(chip.textContent).toBe("Access now: blocked")
    expect(chip.getAttribute("title")).toBe("p1: blocked — network gate CLOSED")
  })

  it("conflicting origin metadata is 'Unknown origin (conflicting metadata)' with both values, never a source", () => {
    mount(body([path({ path_id: "p1", origin_class: "standing_access", source: "role/ops", source_compute: web1 })]))
    expect(screen.queryByTestId("current-access-source")).toBeNull()
    expect(screen.getByTestId("current-access-conflicting-origin").textContent).toMatch(/Unknown origin \(conflicting metadata\)/)
    expect(screen.getByTestId("current-access-conflict-row").textContent).toBe(
      "role/ops · origin class: standing_access · compute reference: EC2Instance u1 · origin class says standing access but a compute reference was served")
  })

  it("a flow seen at two hops shows two observation rows with their own counts and one operation, never a sum", () => {
    mount(body([path({ path_id: "p1", source_compute: web1, feasibility: feas("REACHABLE", "PARTIALLY_OBSERVED"), path_bound_observations: [
      { plane: "network", kind: "flow_log_hit", evidence_quality: "observed", attribution: "exact", hop_ordinal: 1, hit_count: 40, bytes: 900, protocol: 6, dst_port: 5432 },
      { plane: "network", kind: "flow_log_hit", evidence_quality: "observed", attribution: "exact", hop_ordinal: 2, hit_count: 40, protocol: 6, dst_port: 5432 },
    ] })]))
    const rows = screen.getAllByTestId("current-access-observation").map((n) => n.textContent)
    expect(rows).toEqual(["hop 1 · network flow log hit · TCP/5432 · 40 hits · 900 bytes", "hop 2 · network flow log hit · TCP/5432 · 40 hits · bytes not reported"])
    expect(screen.getByTestId("current-access-operations").textContent).toBe("TCP/5432")
    expect(screen.getByTestId("current-access-sources").textContent).not.toMatch(/80 hits/)
  })

  it("a mixed source says its activity and access breakdown and labels its cross-route dates", () => {
    mount(body([
      path({ path_id: "a", source_compute: web1, feasibility: feas("BLOCKED", "OBSERVED"), path_bound_observations: [{ plane: "network", kind: "flow", evidence_quality: "observed", attribution: "exact", first_seen: "2026-10-01T00:00:00Z", last_seen: "2026-10-03T00:00:00Z" }] }),
      path({ path_id: "b", source_compute: web1, feasibility: feas("REACHABLE", "PARTIALLY_OBSERVED"), path_bound_observations: [{ plane: "network", kind: "flow", evidence_quality: "observed", attribution: "sole_consumer", first_seen: "2026-09-28T00:00:00Z", last_seen: "2026-10-02T00:00:00Z" }] }),
      path({ path_id: "c", source_compute: web1, feasibility: feas("REACHABLE", "UNKNOWN") }),
    ]))
    const row = screen.getByTestId("current-access-source")
    expect(row.getAttribute("data-mixed")).toBe("true")
    expect(within(row).getByTestId("current-access-qualifier").textContent).toBe("1 observed · 1 observed on part of the route · 1 unknown across 3 routes")
    expect(within(row).getByTestId("current-access-access-now").textContent).toBe("Access now: 2 reachable · 1 blocked")
    expect(within(row).getByTestId("current-access-seen").textContent).toBe("first seen 2026-09-28 · last seen 2026-10-03 (across 2 routes)")
    expect(within(row).getByTestId("current-access-routes").textContent).toBe("3 routes listed · opens a route the server grades observed")
  })

  it("shared, unattributed activity is said as such, never as this compute's", () => {
    mount(body([path({ path_id: "p1", source_compute: web1, feasibility: feas("REACHABLE", "UNKNOWN"), path_bound_observations: [
      { plane: "data", kind: "cloudtrail_api", evidence_quality: "observed", attribution: "unresolved", hit_count: 99, api_operation: "GetObject" },
    ] })]))
    expect(screen.getByTestId("current-access-shared").textContent).toBe(" · shared activity, not attributable to this compute")
    expect(screen.getByTestId("current-access-sources").textContent).not.toMatch(/99|GetObject/)
  })

  it("a data-plane jewel with no data-plane observation says so; an empty Observed section is never 'no traffic'", () => {
    mount(body([path({ path_id: "p1", source_compute: web1, feasibility: feas("REACHABLE", "UNKNOWN"), path_bound_observations: [
      { evidence_quality: "unknown", plane: "data", kind: "configured_only", coverage_state: "NO_DATA", reason_codes: ["DATA_ACCESS_SUMMARY_ABSENT"] },
    ] })]), null, undefined, "S3Bucket")
    expect(screen.getByTestId("current-access-data-plane").textContent).toMatch(/^Data-plane observations are not projected on this install — network plane only\. S3Bucket use is seen on the data plane; an empty Observed section is not "no traffic"\./)
    cleanup()
    mount(body([path({ path_id: "p1", source_compute: web1 })]), null, undefined, "RDSInstance")
    expect(screen.queryByTestId("current-access-data-plane")).toBeNull()
  })

  it("non-compute origins are listed apart; a route without a contract says so and invents no evidence", () => {
    mount(body([
      path({ path_id: "p1", origin_class: "standing_access", source: "arn:aws:iam::111122223333:role/ops" }),
      path({ path_id: "p2", source_compute: { kind: "LambdaFunction", uid: "u2", name: "fn-2" }, evidence: "configured" }),
    ]))
    expect(screen.getByTestId("current-access-non-compute").textContent).toMatch(/arn:aws:iam::111122223333:role\/ops · standing access/)
    const row = screen.getByTestId("current-access-source")
    expect(row.getAttribute("data-section")).toBe("unknown")
    expect(within(row).getByTestId("current-access-planes").textContent).toBe("no evidence contract served for this route")
    expect(within(row).getByTestId("current-access-seen").textContent).toBe("not reported")
  })
})
