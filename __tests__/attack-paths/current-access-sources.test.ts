/**
 * AP201 / CP-B (Rev 6 Day 3) · lib/attack-paths/current-access-sources.ts — the jewel-wide source list groups and
 * relays the server's words; it classifies nothing itself and ranks nothing.
 *
 * Inputs: the captured producer-shaped summary (__tests__/fixtures/ap201-current-access; provenance in its README,
 * TEST_ONLY: captured from the moto harness over a substituted graph, not a real install) and CONSTRUCTED rows,
 * labelled, for the shapes that body does not carry (feasibility, bound observations, conflicting origins). Nothing
 * here is a product fixture (UI-31).
 *
 * Each describe names the Rev 6 honesty rule it guards; the suite was run against the CP-C-1 head (2535cf96) first
 * (see the AP201-REV6 ledger).
 */
import { describe, expect, it } from "vitest"

import captured from "@/__tests__/fixtures/ap201-current-access/by-crown-jewel-summary.json"
import type { ConvergencePath, CrownJewelConvergence } from "@/lib/attack-paths/convergence-types"
import { currentAccessSources } from "@/lib/attack-paths/current-access-sources"

const SUMMARY = captured as unknown as CrownJewelConvergence

const compute = (n: number) => ({ kind: "EC2Instance", uid: `uid-${n}`, arn: `arn:aws:ec2:eu-west-1:111122223333:instance/i-${n}`, name: `web-${n}` })
const path = (over: Partial<ConvergencePath> & { path_id: string }): ConvergencePath =>
  ({ damage: [], score: 0, confidence: "configured", hop_count: 0, origin_class: "compute", ...over }) as ConvergencePath
const body = (paths: ConvergencePath[], over: Partial<CrownJewelConvergence> = {}): CrownJewelConvergence =>
  ({ system: "Orders", paths_total: paths.length, observed_paths: 0, choke_points: {}, serve_state: "ACTIVE", coverage_state: "READY", paths, ...over })
type S = NonNullable<ReturnType<typeof currentAccessSources>>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const all = (s: any): any[] => [...(s.observed ?? []), ...(s.notObserved ?? s.allowedNotObserved ?? []), ...(s.unknown ?? []), ...(s.blocked ?? []), ...(s.unverified ?? []), ...(s.outOfScope ?? [])]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const byName = (s: S, name: string): any => all(s).find((x) => x.name === name)
const sectionOf = (s: S, name: string) =>
  s.observed.some((x) => x.name === name) ? "observed" : (s.notObserved ?? []).some((x) => x.name === name) ? "not_observed"
    : (s.unknown ?? []).some((x) => x.name === name) ? "unknown" : "other"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const feas = (path_state: string, activity_state: string, extra: Record<string, string> = {}): any => ({ path_state, activity_state, ...extra })
const obs = (over: Record<string, unknown>) =>
  ({ evidence_quality: "observed", attribution: "exact", plane: "network", kind: "vpc_flow", ...over })

describe("Rev 6 §3.1 · REACHABLE with UNKNOWN or missing activity is Unknown, never 'no observed activity'", () => {
  it("captured body: the inferred route whose identity and data planes are unavailable is Unknown activity", () => {
    const s = currentAccessSources(SUMMARY)!
    expect(sectionOf(s, "acme-web-3")).toBe("unknown")
    expect(byName(s, "acme-web-3").routes[0]).toMatchObject({ activity: "UNKNOWN",
      activityDetail: "activity not established: identity unavailable, data unavailable" })
  })

  it("CONSTRUCTED: served REACHABLE + UNKNOWN keeps the server's detail; REACHABLE with no activity word is Unknown too", () => {
    const s = currentAccessSources(body([
      path({ path_id: "a", source_compute: compute(1), feasibility: feas("REACHABLE", "UNKNOWN", { activity_detail: "no path-bound observation for this execution location" }) }),
      path({ path_id: "b", source_compute: compute(2), feasibility: { path_state: "REACHABLE" } as never }),
    ]))!
    expect(s.notObserved ?? []).toEqual([])
    expect(byName(s, "web-1").routes[0]).toMatchObject({ activity: "UNKNOWN", access: "REACHABLE",
      activityDetail: "no path-bound observation for this execution location" })
    expect(byName(s, "web-2").routes[0]).toMatchObject({ activity: "UNKNOWN", activityBasis: "none" })
  })

  it("only a served NOT_OBSERVED (or every plane not_observed with collected coverage) is 'Allowed, no observed activity'", () => {
    const covered = { state: "not_observed", coverage_states: ["NO_OBSERVATION"] }
    const contract = { classification: "inferred", evidence: "configured", whole_path_observed: false, gates: {},
      runtime_evidence: { identity: covered, network: covered, data: covered },
      permission_coverage: { actions: {}, evaluated_actions: [], complete: false } } as never
    const s = currentAccessSources(body([
      path({ path_id: "a", source_compute: compute(1), feasibility: feas("REACHABLE", "NOT_OBSERVED", { activity_detail: "covered, nothing seen on this path" }) }),
      path({ path_id: "b", source_compute: compute(2), evidence_contract: contract }),
    ]))!
    expect((s.notObserved ?? []).map((x) => x.name)).toEqual(["web-1", "web-2"])
  })

  it("an action whose runtime the server did not send is 'not_reported', never 'not_observed' or 'allowed, unobserved'", () => {
    const contract = { classification: "inferred", evidence: "configured", whole_path_observed: false, gates: {}, runtime_evidence: {},
      permission_coverage: { actions: { "s3:GetObject": { permission: "ALLOWED" } }, evaluated_actions: [], complete: false } } as never
    const src = byName(currentAccessSources(body([path({ path_id: "a", source_compute: compute(1), evidence_contract: contract })]))!, "web-1")
    expect(src.routes[0].actions[0].runtime).toBe("not_reported")
    expect(src.allowedUnobservedActions).toEqual([])
  })
})

describe("Rev 6 §3.7 · activity, access now and approval are three independent states", () => {
  it("captured body: partly observed routes are Observed activity (on the planes named), not 'unverified'", () => {
    const s = currentAccessSources(SUMMARY)!
    expect(s.observed.map((x) => x.name)).toEqual(["acme-web-1", "acme-web-2", "acme-web-5"])
    expect(byName(s, "acme-web-2").routes[0]).toMatchObject({ activity: "PARTIALLY_OBSERVED",
      activityDetail: "observed on identity, network; not every plane of this route was observed" })
    expect(byName(s, "acme-web-1").routes[0]).toMatchObject({ activity: "OBSERVED", activityBasis: "contract",
      activityDetail: "observed on every plane (runtime evidence)" })
  })

  it("observed in the window, blocked now: listed under Observed activity with access now BLOCKED (UI-10 / UI-47)", () => {
    const s = currentAccessSources(body([
      path({ path_id: "a", source_compute: compute(1), feasibility: feas("BLOCKED", "OBSERVED", { reason: "network gate CLOSED" }) }),
      path({ path_id: "b", source_compute: compute(2), feasibility: feas("OUT_OF_SCOPE", "PARTIALLY_OBSERVED") }),
    ]))!
    expect(s.observed.map((x) => x.name)).toEqual(["web-1", "web-2"])
    expect(byName(s, "web-1").routes[0]).toMatchObject({ activity: "OBSERVED", access: "BLOCKED", accessReason: "network gate CLOSED" })
    expect(byName(s, "web-2").routes[0].access).toBe("OUT_OF_SCOPE")
  })

  it("observation never upgrades access: without a served path_state access is UNKNOWN unless the server classified the route blocked", () => {
    const s = currentAccessSources(SUMMARY)!
    expect(byName(s, "acme-web-1").routes[0].access).toBe("UNKNOWN")
    expect(byName(s, "acme-web-4").routes[0]).toMatchObject({ access: "BLOCKED", accessBasis: "classification", activity: "UNKNOWN" })
    expect(sectionOf(s, "acme-web-4")).toBe("unknown")
  })

  it("approval is not_recorded on every source; nothing is approved", () => {
    expect(new Set(all(currentAccessSources(SUMMARY)!).map((x) => x.approval))).toEqual(new Set(["not_recorded"]))
  })

  it("a source with routes in several states keeps per-state counts; it is grouped by its best served activity word", () => {
    const src = byName(currentAccessSources(body([
      path({ path_id: "b", source_compute: compute(1), feasibility: feas("REACHABLE", "UNKNOWN") }),
      path({ path_id: "a", source_compute: compute(1), feasibility: feas("BLOCKED", "OBSERVED") }),
    ]))!, "web-1")
    expect(src).toMatchObject({ section: "observed", activityCounts: { OBSERVED: 1, UNKNOWN: 1 }, accessCounts: { BLOCKED: 1, REACHABLE: 1 }, primaryPathId: "a" })
  })
})

describe("Rev 6 §3.2 · point A needs origin_class compute AND a canonical source_compute", () => {
  it("CONSTRUCTED conflicts render as Unknown origin with both values; nothing is reassigned to a source", () => {
    const s = currentAccessSources(body([
      path({ path_id: "a", source_compute: compute(1), origin_class: "standing_access" }),
      path({ path_id: "b", source_compute: compute(2), origin_class: null }),
      path({ path_id: "c", origin_class: "compute" }),
      path({ path_id: "d", origin_class: "identity", source: "role/ops" }),
    ]))!
    expect(s.sourceCount).toBe(0)
    expect((s.conflictingOrigin ?? []).map((r) => [r.pathId, r.conflict?.originClass ?? null, r.conflict?.computeUid ?? null])).toEqual([
      ["a", "standing_access", "uid-1"], ["b", null, "uid-2"], ["c", "compute", null],
    ])
    expect(s.conflictingOrigin[0].conflict?.why).toBe("origin class says standing access but a compute reference was served")
    expect(s.nonCompute.map((r) => [r.pathId, r.originClass])).toEqual([["d", "identity"]])
  })

  it("captured body: every path is origin_class compute with a canonical ref, so all five are sources and none conflicts", () => {
    const s = currentAccessSources(SUMMARY)!
    expect(s.sourceCount).toBe(5)
    expect(s.conflictingOrigin ?? []).toEqual([])
    expect(s.nonCompute).toEqual([])
  })
})

describe("Rev 6 §3.3 / §3.8 · counts relayed, never summed; shared activity never credited", () => {
  it("one flow seen at two hops of one route is two observation rows with their own counts, never one sum", () => {
    const src = byName(currentAccessSources(body([path({ path_id: "a", source_compute: compute(1), feasibility: feas("REACHABLE", "PARTIALLY_OBSERVED"),
      path_bound_observations: [obs({ hop_ordinal: 1, hit_count: 40, bytes: 900, protocol: 6, dst_port: 5432 }),
        obs({ hop_ordinal: 2, hit_count: 40, bytes: 900, protocol: 6, dst_port: 5432 })] })]))!, "web-1")
    expect(src.routes[0].observations.map((o: { hopOrdinal: number; hitCount: number }) => [o.hopOrdinal, o.hitCount])).toEqual([[1, 40], [2, 40]])
    expect(src.operations).toEqual(["TCP/5432"])
    expect(JSON.stringify(src)).not.toMatch(/\b80\b|\b1800\b/)
  })

  it("cross-route dates are a labelled summary: first/last across the routes that measured, with the route count", () => {
    const src = byName(currentAccessSources(body([
      path({ path_id: "a", source_compute: compute(1), feasibility: feas("REACHABLE", "PARTIALLY_OBSERVED"), path_bound_observations: [obs({ first_seen: "2026-10-01T00:00:00Z", last_seen: "2026-10-05T00:00:00Z" })] }),
      path({ path_id: "b", source_compute: compute(1), feasibility: feas("REACHABLE", "PARTIALLY_OBSERVED"), path_bound_observations: [obs({ first_seen: "2026-09-20T00:00:00Z", last_seen: "2026-10-02T00:00:00Z" })] }),
      path({ path_id: "c", source_compute: compute(1), feasibility: feas("REACHABLE", "UNKNOWN") }),
    ]))!, "web-1")
    expect(src).toMatchObject({ firstSeen: "2026-09-20T00:00:00Z", lastSeen: "2026-10-05T00:00:00Z", seenRouteCount: 2 })
  })

  it("unresolved or missing attribution is shared activity: no count, no date, no operation credited to the compute", () => {
    const src = byName(currentAccessSources(body([path({ path_id: "a", source_compute: compute(1), feasibility: feas("REACHABLE", "UNKNOWN"),
      path_bound_observations: [obs({ attribution: "unresolved", hit_count: 9, dst_port: 443, first_seen: "2026-10-01T00:00:00Z" }),
        obs({ attribution: undefined, hit_count: 3 })] })]))!, "web-1")
    expect(src).toMatchObject({ sharedActivity: true, firstSeen: null, operations: [] })
    expect(src.routes[0].observations).toEqual([])
  })

  it("an observation of quality other than observed is never a count", () => {
    const src = byName(currentAccessSources(body([path({ path_id: "a", source_compute: compute(1),
      path_bound_observations: [obs({ evidence_quality: "configured_only", hit_count: 5 })] })]))!, "web-1")
    expect(src.routes[0].observations).toEqual([])
  })
})

describe("Rev 6 §3.6 · no client ranking", () => {
  it("sources in a section are ordered by name, never by score or recency", () => {
    const s = currentAccessSources(body([
      path({ path_id: "a", score: 99, source_compute: { ...compute(1), name: "zeta" }, feasibility: feas("REACHABLE", "OBSERVED"), path_bound_observations: [obs({ last_seen: "2026-10-16T00:00:00Z" })] }),
      path({ path_id: "b", score: 1, source_compute: { ...compute(2), name: "alpha" }, feasibility: feas("REACHABLE", "OBSERVED"), path_bound_observations: [obs({ last_seen: "2026-01-01T00:00:00Z" })] }),
    ]))!
    expect(s.observed.map((x) => x.name)).toEqual(["alpha", "zeta"])
  })
})

describe("Rev 6 §3.9 / §3.11 · header facts and the data-plane line come from served fields", () => {
  it("window from the observations, as_of and generation from the answer; none invented when absent", () => {
    const s = currentAccessSources(body([path({ path_id: "a", source_compute: compute(1), feasibility: feas("REACHABLE", "OBSERVED"),
      path_bound_observations: [obs({ window_start: "2026-09-17T00:00:00Z", window_end: "2026-10-17T00:00:00Z" })] })],
      { as_of: "2026-10-17T06:00:00Z", generation: "gen-9" }))!
    expect(s).toMatchObject({ window: { start: "2026-09-17T00:00:00Z", end: "2026-10-17T00:00:00Z" }, asOf: "2026-10-17T06:00:00Z", generation: "gen-9" })
    expect(currentAccessSources(body([path({ path_id: "a", source_compute: compute(1) })]))).toMatchObject({ window: null, asOf: null, generation: null })
  })

  it("a data-plane jewel with no observed data plane on any route gets the note, with the producer's absence code when served", () => {
    const s = currentAccessSources(body([path({ path_id: "a", source_compute: compute(1), feasibility: feas("REACHABLE", "PARTIALLY_OBSERVED"),
      path_bound_observations: [obs({}), { evidence_quality: "unknown", plane: "data", kind: "configured_only", coverage_state: "NO_DATA", reason_codes: ["DATA_ACCESS_SUMMARY_ABSENT"] }] })]),
      { jewelType: "S3Bucket" })!
    // S7 (review 2026-10-17): this route serves no data-plane state, so it is "not reported", never "no observation".
    expect(s.dataPlane).toMatchObject({ noDataObservation: false, observedRouteCount: 0, notReportedRouteCount: 1, summaryAbsent: true })
    expect(currentAccessSources(body([path({ path_id: "a", source_compute: compute(1) })]), { jewelType: "RDSInstance" })!.dataPlane).toBeNull()
  })

  it("captured body (an S3 jewel): one route serves an observed data plane, so the 'no data-plane observation' note does not apply", () => {
    const s = currentAccessSources(SUMMARY)!
    expect(s.jewelType).toBe("S3Bucket")
    expect(s.dataPlane?.noDataObservation).toBe(false)
  })
})

describe("conservation and holds", () => {
  it("every served path is one route of one source, a conflict row, or a non-compute row; inactive routes are counted", () => {
    const s = currentAccessSources(SUMMARY, { activePathIds: new Set(["path-mat-a9911e7a2972"]) })!
    expect(s.routeCount + s.excludedInactive + s.nonCompute.length + (s.conflictingOrigin ?? []).length).toBe(SUMMARY.paths.length)
    expect(s.excludedInactive).toBe(4)
  })

  it("a NOT_READY or held answer has no sources (unknown, not empty); no answer is null", () => {
    expect(currentAccessSources(null)).toBeNull()
    expect(currentAccessSources(body([], { serve_state: "NOT_READY", coverage_state: "NOT_READY" }))!.sourceCount).toBe(0)
  })

  it("names why the list is not every route (the captured answer is coverage PARTIAL)", () => {
    expect(currentAccessSources(SUMMARY)!.partial).toBeTruthy()
  })
})

describe("review R1 (frozen c0c05ceb) · section from all routes; activity never from gates; not-observed needs coverage", () => {
  const contractWith = (classification: string, planes: Record<string, unknown>) => ({ classification, evidence: "configured",
    whole_path_observed: false, gates: {}, runtime_evidence: planes,
    permission_coverage: { actions: {}, evaluated_actions: [], complete: false } }) as never
  const covered = { state: "not_observed", coverage_states: ["NO_OBSERVATION"] }

  it("SF1: one NOT_OBSERVED route and one UNKNOWN route is Unknown, never 'Allowed, no observed activity'", () => {
    const s = currentAccessSources(body([
      path({ path_id: "p1", source_compute: compute(1), feasibility: feas("REACHABLE", "NOT_OBSERVED") }),
      path({ path_id: "p2", source_compute: compute(1), feasibility: feas("REACHABLE", "UNKNOWN") }),
    ]))!
    expect(sectionOf(s, "web-1")).toBe("unknown")
  })

  it("SF2: a gate-based 'observed' classification with no observed plane is Unknown; three observed planes are observed whatever the class", () => {
    const unavailable = { state: "unavailable" }
    const s = currentAccessSources(body([
      path({ path_id: "a", source_compute: compute(1), evidence_contract: contractWith("observed", { identity: unavailable, network: unavailable, data: unavailable }) }),
      path({ path_id: "b", source_compute: compute(2), evidence_contract: contractWith("inferred", { identity: { state: "observed" }, network: { state: "observed" }, data: { state: "observed" } }) }),
      path({ path_id: "c", source_compute: compute(3), evidence: "observed", confidence: "observed" }),
    ]))!
    expect(byName(s, "web-1").routes[0].activity).toBe("UNKNOWN")
    expect(byName(s, "web-2").routes[0]).toMatchObject({ activity: "OBSERVED", activityDetail: "observed on every plane (runtime evidence)" })
    expect(byName(s, "web-3").routes[0]).toMatchObject({ activity: "UNKNOWN", activityBasis: "legacy" })
  })

  it("SF3: not observed with NOT_READY / NO_DATA coverage is Unknown with those words, served or not", () => {
    const planes = { identity: covered, network: { state: "not_observed", coverage_states: ["NOT_READY"] }, data: { state: "not_observed", coverage_states: ["NO_DATA"] } }
    const s = currentAccessSources(body([
      path({ path_id: "a", source_compute: compute(1), evidence_contract: contractWith("inferred", planes) }),
      path({ path_id: "b", source_compute: compute(2), evidence_contract: contractWith("inferred", planes),
        feasibility: feas("REACHABLE", "NOT_OBSERVED", { activity_detail: "covered, nothing seen on this path" }) }),
    ]))!
    expect(s.notObserved).toEqual([])
    expect(byName(s, "web-1").routes[0]).toMatchObject({ activity: "UNKNOWN", activityDetail: "activity not established: network NOT_READY, data NO_DATA" })
    expect(byName(s, "web-2").routes[0]).toMatchObject({ activity: "UNKNOWN",
      activityDetail: "the server says not observed, but coverage is incomplete: network NOT_READY, data NO_DATA" })
  })
})
