/**
 * AP201 / CP-B · lib/attack-paths/current-access-sources.ts — the jewel-wide source list groups and relays the
 * server's words; it classifies nothing itself.
 *
 * Inputs: the captured producer-shaped summary (__tests__/fixtures/ap201-current-access; provenance in its README) and
 * CONSTRUCTED rows, labelled, for the shapes that body does not carry (feasibility, bound observations, non-compute
 * origins). Nothing here is a product fixture (UI-31).
 */
import { describe, expect, it } from "vitest"

import captured from "@/__tests__/fixtures/ap201-current-access/by-crown-jewel-summary.json"
import type { ConvergencePath, CrownJewelConvergence } from "@/lib/attack-paths/convergence-types"
import { currentAccessSources, routeSection } from "@/lib/attack-paths/current-access-sources"
import { pathClassification } from "@/lib/attack-paths/path-evidence-view"

const SUMMARY = captured as unknown as CrownJewelConvergence

const compute = (n: number) => ({ kind: "EC2Instance", uid: `uid-${n}`, arn: `arn:aws:ec2:eu-west-1:111122223333:instance/i-${n}`, name: `web-${n}` })
const path = (over: Partial<ConvergencePath> & { path_id: string }): ConvergencePath =>
  ({ damage: [], score: 0, confidence: "configured", hop_count: 0, ...over }) as ConvergencePath
const body = (paths: ConvergencePath[], over: Partial<CrownJewelConvergence> = {}): CrownJewelConvergence =>
  ({ system: "Orders", paths_total: paths.length, observed_paths: 0, choke_points: {}, serve_state: "ACTIVE", coverage_state: "READY", paths, ...over })
const byName = (s: ReturnType<typeof currentAccessSources>, name: string) =>
  [...s!.observed, ...s!.allowedNotObserved, ...s!.blocked, ...s!.unverified, ...s!.outOfScope].find((x) => x.name === name)!

describe("routeSection: the server's words only", () => {
  it("activity OBSERVED or evidence observed is observed; the rest follow path_state, then the classification", () => {
    expect(routeSection(path({ path_id: "a", feasibility: { path_state: "REACHABLE", activity_state: "OBSERVED" } }))).toBe("observed")
    expect(routeSection(path({ path_id: "b", evidence: "observed", confidence: "observed" }))).toBe("observed")
    expect(routeSection(path({ path_id: "c", feasibility: { path_state: "REACHABLE", activity_state: "NOT_OBSERVED" } }))).toBe("allowed_not_observed")
    expect(routeSection(path({ path_id: "d", evidence: "configured" }))).toBe("allowed_not_observed")
    expect(routeSection(path({ path_id: "e", feasibility: { path_state: "BLOCKED", activity_state: "UNKNOWN" } }))).toBe("blocked")
    expect(routeSection(path({ path_id: "f", evidence: "blocked" }))).toBe("blocked")
    expect(routeSection(path({ path_id: "g", feasibility: { path_state: "OUT_OF_SCOPE", activity_state: "UNKNOWN" } }))).toBe("out_of_scope")
    expect(routeSection(path({ path_id: "h", evidence: "unverified" }))).toBe("unverified")
    expect(routeSection(path({ path_id: "i", feasibility: { path_state: "UNVERIFIED", activity_state: "UNKNOWN" } }))).toBe("unverified")
    // CONSTRUCTED: a word this reader does not know is never promoted.
    expect(routeSection(path({ path_id: "j", evidence: "live" as never }))).toBe("unverified")
  })

  it("a BLOCKED or OUT_OF_SCOPE path_state is never current access, whatever the activity; REACHABLE + UNKNOWN is allowed with activity unknown", () => {
    expect(routeSection(path({ path_id: "o", feasibility: { path_state: "BLOCKED", activity_state: "OBSERVED" } }))).toBe("blocked")
    expect(routeSection(path({ path_id: "p", feasibility: { path_state: "OUT_OF_SCOPE", activity_state: "OBSERVED" } }))).toBe("out_of_scope")
    expect(routeSection(path({ path_id: "q", feasibility: { path_state: "UNVERIFIED", activity_state: "OBSERVED" } }))).toBe("observed")
    expect(routeSection(path({ path_id: "r", feasibility: { path_state: "REACHABLE", activity_state: "UNKNOWN" } }))).toBe("allowed_not_observed")
    const s = currentAccessSources(body([
      path({ path_id: "r", source_compute: compute(1), origin_class: "compute", feasibility: { path_state: "REACHABLE", activity_state: "UNKNOWN" } }),
    ]))!
    expect(s.allowedNotObserved[0].routes[0].activityState).toBe("UNKNOWN")
  })

  it("the server's evidence_contract classification outranks the legacy word (one reader: pathClassification)", () => {
    const contract = (classification: string) => ({ classification, evidence: "configured", whole_path_observed: false,
      gates: { identity: "UNKNOWN", network: "UNKNOWN", data: "UNKNOWN" }, runtime_evidence: {}, permission_coverage: { actions: {}, evaluated_actions: [], complete: false } }) as never
    expect(routeSection(path({ path_id: "k", evidence: "configured", evidence_contract: contract("blocked") }))).toBe("blocked")
    expect(routeSection(path({ path_id: "l", evidence: "configured", evidence_contract: contract("unknown") }))).toBe("unverified")
    expect(routeSection(path({ path_id: "m", evidence: "unverified", evidence_contract: contract("observed") }))).toBe("observed")
    // and feasibility outranks the contract
    expect(routeSection(path({ path_id: "n", evidence_contract: contract("observed"), feasibility: { path_state: "BLOCKED", activity_state: "NOT_OBSERVED" } }))).toBe("blocked")
  })
})

describe("currentAccessSources over the captured producer-shaped summary", () => {
  it("conserves every served path: each is one route of one compute source, or a non-compute row", () => {
    const s = currentAccessSources(SUMMARY)!
    const sections = [s.observed, s.allowedNotObserved, s.blocked, s.unverified, s.outOfScope]
    const routes = sections.flat().flatMap((x) => x.routes.map((r) => r.pathId))
    expect(new Set([...routes, ...s.nonCompute.map((r) => r.pathId)])).toEqual(new Set(SUMMARY.paths.map((p) => p.path_id)))
    expect(routes.length + s.nonCompute.length).toBe(SUMMARY.paths.length)
    expect(s.sourceCount).toBe(sections.flat().length)
    expect(s.routeCount).toBe(routes.length)
  })

  it("every captured path names a compute origin, so none is a non-compute row, and sections follow the server's classification", () => {
    const s = currentAccessSources(SUMMARY)!
    expect(s.nonCompute).toEqual([])
    const expected = { observed: [] as string[], allowed_not_observed: [] as string[], blocked: [] as string[], unverified: [] as string[] }
    for (const p of SUMMARY.paths) {
      const cls = pathClassification({ evidence_contract: p.evidence_contract ?? null, evidence_type: p.evidence ?? p.confidence })
      const section = cls === "observed" ? "observed" : cls === "inferred" ? "allowed_not_observed" : cls === "blocked" ? "blocked" : "unverified"
      expected[section].push(p.source_compute!.name!)
    }
    expect(s.observed.map((x) => x.name).sort()).toEqual(expected.observed.sort())
    expect(s.allowedNotObserved.map((x) => x.name).sort()).toEqual(expected.allowed_not_observed.sort())
    expect(s.blocked.map((x) => x.name).sort()).toEqual(expected.blocked.sort())
    expect(s.unverified.map((x) => x.name).sort()).toEqual(expected.unverified.sort())
    expect(s.observed.length).toBeGreaterThan(0)
    expect(s.observed[0].routes[0].fromContract).toBe(true)
    // whole_path_observed is relayed, never inferred: true on the observed route, false on the others
    expect(s.observed[0].routes[0].wholePathObserved).toBe(true)
    for (const src of [...s.allowedNotObserved, ...s.blocked, ...s.unverified]) expect(src.routes[0].wholePathObserved).toBe(false)
    expect(s.excludedInactive).toBe(0)
  })

  it("routes outside the caller's active set are counted, not listed (the path list's filter applies to sources too)", () => {
    const keep = SUMMARY.paths[0].path_id
    const s = currentAccessSources(SUMMARY, { activePathIds: new Set([keep]) })!
    expect(s.sourceCount).toBe(1)
    expect(s.routeCount).toBe(1)
    expect(s.excludedInactive).toBe(SUMMARY.paths.length - 1)
    const [only] = [...s.observed, ...s.allowedNotObserved, ...s.blocked, ...s.unverified]
    expect(only.routes[0].pathId).toBe(keep)
    // null / absent set = no filter
    expect(currentAccessSources(SUMMARY, { activePathIds: null })!.sourceCount).toBe(SUMMARY.paths.length)
  })

  it("relays each route's contract: planes, gates, actions and the coverage sentence -- nothing merged into a verdict", () => {
    const s = currentAccessSources(SUMMARY)!
    for (const p of SUMMARY.paths) {
      const source = byName(s, p.source_compute!.name!)
      const route = source.routes.find((r) => r.pathId === p.path_id)!
      const contract = p.evidence_contract!
      expect(route.gates).toEqual({ identity: contract.gates.identity, network: contract.gates.network, data: contract.gates.data })
      expect(route.planes!.map((pl) => [pl.plane, pl.state])).toEqual(
        (["identity", "network", "data"] as const).map((pl) => [pl, contract.runtime_evidence[pl].state]))
      for (const pl of route.planes!) {
        const served = contract.runtime_evidence[pl.plane]
        expect(pl.hitCount).toBe(served.hit_count ?? null)
        expect(pl.firstSeen).toBe(served.first_seen ?? null)
        expect(pl.kinds).toEqual(served.kinds ?? [])
      }
      expect(route.actions.map((a) => a.action)).toEqual(Object.keys(contract.permission_coverage.actions).sort())
      expect(route.permissionCoverage).toMatch(/of 2 actions have an evaluated permission/)
    }
  })

  it("the observed source's first / last seen are the server's observed-plane timestamps; a source with no observed plane has none", () => {
    const s = currentAccessSources(SUMMARY)!
    const [observed] = s.observed
    const planes = observed.routes[0].planes!.filter((p) => p.state === "observed")
    expect(planes.length).toBeGreaterThan(0)
    expect(observed.firstSeen).toBe(planes.map((p) => p.firstSeen).sort()[0])
    expect(observed.lastSeen).toBe(planes.map((p) => p.lastSeen).sort().reverse()[0])
    expect(observed.observedActions).toEqual(["s3:GetObject"])
    // s3:PutObject is NOT_EVALUATED, not ALLOWED: it is neither observed nor "allowed, unobserved"
    expect(observed.allowedUnobservedActions).toEqual([])
    expect(observed.coverageGaps).toEqual([])
    const blocked = s.blocked[0]
    expect(blocked.routes[0].planes!.every((p) => p.state === "unavailable")).toBe(true)
    expect(blocked.firstSeen).toBeNull()
    expect(blocked.lastSeen).toBeNull()
    expect(blocked.coverageGaps).toEqual(["identity unavailable", "network unavailable", "data unavailable"])
    // The captured summary publishes no bound observations: none invented.
    for (const src of [...s.observed, ...s.allowedNotObserved, ...s.blocked, ...s.unverified]) {
      expect(src.observations).toEqual([])
      expect(src.approval).toBe("not_recorded")
      expect(src.identities.length).toBeGreaterThan(0)
    }
    expect(s.cardinality).toEqual(SUMMARY.cardinality)
    expect(JSON.stringify(s)).not.toMatch(/legitimate/i)
  })

  it("names the coverage gaps the server reported (the inferred route: network configured only, identity / data unavailable)", () => {
    const s = currentAccessSources(SUMMARY)!
    const inferred = s.allowedNotObserved[0]
    expect(inferred.coverageGaps).toEqual(["identity unavailable", "network not observed (NO_OBSERVATION)", "data unavailable"])
    expect(inferred.observedActions).toEqual(["s3:GetObject"])
  })

  it("names why the list is not every route (the captured answer is coverage PARTIAL)", () => {
    expect(currentAccessSources(SUMMARY)!.partial).toBe("coverage partial")
  })
})

describe("currentAccessSources over CONSTRUCTED rows", () => {
  it("groups several routes of one compute into one source, led by its strongest route", () => {
    const s = currentAccessSources(body([
      path({ path_id: "p1", source_compute: compute(1), origin_class: "compute", evidence: "configured", score: 90, identity_name: "role-a" }),
      path({ path_id: "p2", source_compute: compute(1), origin_class: "compute", evidence: "observed", confidence: "observed", score: 10, identity_name: "role-b" }),
      path({ path_id: "p3", source_compute: compute(2), origin_class: "compute", evidence: "configured", score: 50 }),
    ]))!
    expect(s.sourceCount).toBe(2)
    expect(s.routeCount).toBe(3)
    expect(s.observed.map((x) => x.key)).toEqual(["uid-1"])
    expect(s.observed[0].primaryPathId).toBe("p2")
    expect(s.observed[0].routes.map((r) => [r.pathId, r.section])).toEqual([["p2", "observed"], ["p1", "allowed_not_observed"]])
    expect(s.observed[0].identities).toEqual(["role-a", "role-b"])
    expect(s.observed[0].routes[0].planes).toBeNull()
    expect(s.observed[0].routes[0].gates).toBeNull()
    expect(s.observed[0].routes[0].permissionCoverage).toBeNull()
    expect(s.allowedNotObserved.map((x) => x.key)).toEqual(["uid-2"])
  })

  it("keeps resolved bound observations and never sums them; shared activity is flagged, not attributed", () => {
    const s = currentAccessSources(body([
      path({ path_id: "p1", source_compute: compute(1), origin_class: "compute", evidence: "observed", confidence: "observed",
        path_bound_observations: [
          { plane: "network", kind: "flow_log_hit", evidence_quality: "observed", attribution: "exact", hop_ordinal: 1, hit_count: 14, bytes: 4096, dst_port: 3306, protocol: 6, first_seen: "2026-10-01T00:00:00Z", last_seen: "2026-10-10T00:00:00Z", summary_key: "net-1" },
          { plane: "network", kind: "flow_log_hit", evidence_quality: "observed", attribution: "exact", hop_ordinal: 1, hit_count: 3, bytes: 512, dst_port: 3306, protocol: 6, first_seen: "2026-10-05T00:00:00Z", last_seen: "2026-10-12T00:00:00Z", summary_key: "net-2" },
          { plane: "data", kind: "cloudtrail_api", evidence_quality: "observed", attribution: "unresolved", hop_ordinal: 4, hit_count: 99, api_operation: "GetObject" },
          { plane: "data", kind: "configured_only", evidence_quality: "configured", attribution: "exact", coverage_state: "NO_OBSERVATION", reason_codes: ["DATA_ACCESS_SUMMARY_ABSENT"] },
        ] }),
    ]))!
    const [src] = s.observed
    expect(src.observations.map((o) => [o.summaryKey, o.hitCount, o.bytes, o.dstPort])).toEqual([["net-1", 14, 4096, 3306], ["net-2", 3, 512, 3306]])
    expect(src.sharedActivity).toBe(true)
    expect(src.firstSeen).toBe("2026-10-01T00:00:00Z")
    expect(src.lastSeen).toBe("2026-10-12T00:00:00Z")
    expect(JSON.stringify(src)).not.toMatch(/"hitCount":17|"bytes":4608|"hitCount":99/)
  })

  it("an observation that names NO attribution is shared activity, never this source's (CONSTRUCTED)", () => {
    const s = currentAccessSources(body([
      path({ path_id: "p1", source_compute: compute(1), origin_class: "compute", evidence: "observed", confidence: "observed",
        path_bound_observations: [
          { plane: "network", kind: "flow_log_hit", evidence_quality: "observed", hit_count: 5, first_seen: "2026-10-01T00:00:00Z", last_seen: "2026-10-02T00:00:00Z", summary_key: "n0" },
        ] }),
    ]))!
    const [src] = s.observed
    expect(src.observations).toEqual([])
    expect(src.sharedActivity).toBe(true)
    expect(src.firstSeen).toBeNull()
    expect(src.lastSeen).toBeNull()
  })

  it("a value the server did not send is 'not reported', never a default: plane state, action runtime / permission", () => {
    const contract = { classification: "inferred", evidence: "configured", whole_path_observed: false,
      gates: { identity: "OPEN_CONFIG" },
      runtime_evidence: { identity: {}, network: { state: "observed", hit_count: 2 }, data: { state: "not_observed" } },
      permission_coverage: { actions: { "s3:PutObject": { permission: "ALLOWED" }, "s3:GetObject": { runtime: "not_observed" }, "s3:ListBucket": { permission: "ALLOWED", runtime: "not_observed" } }, evaluated_actions: [], complete: false } } as never
    const s = currentAccessSources(body([
      path({ path_id: "p1", source_compute: compute(1), origin_class: "compute", evidence_contract: contract }),
    ]))!
    const [src] = s.allowedNotObserved
    expect(src.routes[0].planes!.map((p) => [p.plane, p.state])).toEqual([["identity", "not_reported"], ["network", "observed"], ["data", "not_observed"]])
    expect(src.coverageGaps).toEqual(["identity not reported", "data not observed"])
    expect(src.routes[0].gates).toEqual({ identity: "OPEN_CONFIG", network: null, data: null })
    expect(src.routes[0].actions.map((a) => [a.action, a.permission, a.runtime])).toEqual([
      ["s3:GetObject", "NOT_REPORTED", "not_observed"], ["s3:ListBucket", "ALLOWED", "not_observed"], ["s3:PutObject", "ALLOWED", "not_reported"]])
    // only an ALLOWED action whose runtime the server said is not_observed is "allowed, not observed"
    expect(src.observedActions).toEqual([])
    expect(src.allowedUnobservedActions).toEqual(["s3:ListBucket"])
  })

  it("an ALLOWED action no route observed is 'allowed, unobserved'; an unreadable contract relays nothing", () => {
    const contract = { classification: "inferred", evidence: "configured", whole_path_observed: false,
      gates: { identity: "OPEN_CONFIG", network: "OPEN_CONFIG", data: "UNKNOWN" },
      runtime_evidence: { identity: { state: "not_observed", kinds: ["configured_only"], coverage_states: ["NO_OBSERVATION"] }, network: { state: "unavailable" }, data: { state: "unavailable" } },
      permission_coverage: { actions: { "s3:PutObject": { permission: "ALLOWED", runtime: "not_observed" }, "s3:GetObject": { permission: "EXPLICIT_DENY", runtime: "not_observed" } }, evaluated_actions: ["s3:PutObject", "s3:GetObject"], complete: true } } as never
    const s = currentAccessSources(body([
      path({ path_id: "p1", source_compute: compute(1), origin_class: "compute", evidence_contract: contract }),
      path({ path_id: "p2", source_compute: compute(2), origin_class: "compute", evidence_contract: { classification: 7, gates: "x", runtime_evidence: 3 } as never }),
    ]))!
    const a = s.allowedNotObserved.find((x) => x.key === "uid-1")!
    expect(a.allowedUnobservedActions).toEqual(["s3:PutObject"])
    expect(a.observedActions).toEqual([])
    expect(a.coverageGaps).toEqual(["identity not observed (NO_OBSERVATION)", "network unavailable", "data unavailable"])
    expect(a.routes[0].permissionCoverage).toBe("All 2 actions have an evaluated permission")
    // the unreadable contract: its classification is not a known word, so pathClassification falls back to the legacy
    // word ("configured" -> inferred); planes / gates null, no actions, and the route is NOT marked fromContract
    const u = s.allowedNotObserved.find((x) => x.key === "uid-2")!
    expect(u.routes[0].classification).toBe("inferred")
    expect(u.routes[0].fromContract).toBe(false)
    expect(u.routes[0].planes).toBeNull()
    expect(u.routes[0].gates).toBeNull()
    expect(u.routes[0].actions).toEqual([])
    expect(u.coverageGaps).toEqual([])
  })

  it("only an OBSERVED plane dates a source: a configured-only plane's window never becomes 'seen' (CONSTRUCTED)", () => {
    // The captured body's unobserved planes carry no timestamps, so this shape has to be constructed: a server could
    // publish a window on a not_observed / unavailable plane (the configuration's validity window, not activity).
    const contract = { classification: "inferred", evidence: "configured", whole_path_observed: false,
      gates: { identity: "OPEN_CONFIG", network: "OPEN_CONFIG", data: "UNKNOWN" },
      runtime_evidence: {
        identity: { state: "not_observed", kinds: ["configured_only"], first_seen: "2026-01-01T00:00:00Z", last_seen: "2026-10-01T00:00:00Z", coverage_states: ["NO_OBSERVATION"] },
        network: { state: "unavailable", first_seen: "2026-02-01T00:00:00Z", last_seen: "2026-09-01T00:00:00Z" },
        data: { state: "unavailable" },
      },
      permission_coverage: { actions: {}, evaluated_actions: [], complete: false } } as never
    const s = currentAccessSources(body([
      path({ path_id: "p1", source_compute: compute(1), origin_class: "compute", evidence_contract: contract }),
    ]))!
    const [src] = s.allowedNotObserved
    expect(src.firstSeen).toBeNull()
    expect(src.lastSeen).toBeNull()
    // the window is still relayed on the plane itself, labelled by its state
    expect(src.routes[0].planes!.find((p) => p.plane === "identity")).toMatchObject({ state: "not_observed", firstSeen: "2026-01-01T00:00:00Z" })
  })

  it("a row without a compute origin is a non-compute row, never a source; an unreadable source_compute too", () => {
    const s = currentAccessSources(body([
      path({ path_id: "p1", origin_class: "standing_access", source: "arn:aws:iam::111122223333:role/ops", identity_name: "ops" }),
      path({ path_id: "p2", origin_class: "compute", source_compute: { kind: "", uid: "" } as never }),
      path({ path_id: "p3", origin_class: "compute", source_compute: compute(3), evidence: "configured" }),
    ]))!
    expect(s.nonCompute.map((r) => [r.pathId, r.originClass])).toEqual([["p1", "standing_access"], ["p2", "compute"]])
    expect(s.sourceCount).toBe(1)
    expect(s.routeCount).toBe(1)
  })

  it("a NOT_READY or held answer has no sources (unknown, not empty); no answer is null", () => {
    expect(currentAccessSources(null)).toBeNull()
    const notReady = currentAccessSources(body([], { serve_state: "NOT_READY", coverage_state: "NOT_READY" }))!
    expect(notReady.sourceCount).toBe(0)
    expect(notReady.partial).toBeNull()
    const held = currentAccessSources({ semantic_status: "not_recorded", hold_reason: "X" } as unknown as CrownJewelConvergence)!
    expect(held.sourceCount).toBe(0)
  })
})
