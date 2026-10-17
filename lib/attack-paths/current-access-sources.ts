/**
 * (AP201 / CP-B, revised for Rev 6 Day 3) The jewel-wide Current Access source list: every compute source the
 * by-crown-jewel answer names, grouped by canonical compute identity, read from the fields the backend already serves.
 * This is the temporary authoritative reader of the approved plan (P5.1): it groups and relays server words; it
 * classifies nothing itself and ranks nothing.
 *
 * Three INDEPENDENT states per route, each from served fields (Rev 6 §3.7):
 * - ACTIVITY in the window -- `feasibility.activity_state` (OBSERVED | PARTIALLY_OBSERVED | NOT_OBSERVED | UNKNOWN)
 *   with its `activity_detail` when the server composed it. Without feasibility, the route's own contract words:
 *   `classification: observed` is observed; per-plane `runtime_evidence` states are relayed (some plane observed =
 *   observed on that plane; every plane `not_observed` = not observed); anything else is UNKNOWN with the reason.
 *   UNKNOWN is never "not observed" and never zero.
 * - ACCESS NOW -- `feasibility.path_state` (REACHABLE | UNVERIFIED | BLOCKED | OUT_OF_SCOPE) with its `reason`;
 *   without feasibility only a served blocked classification says BLOCKED; everything else is UNKNOWN. Observation never
 *   upgrades access, and a blocked route keeps its activity ("observed in window, blocked now" is a valid row).
 * - APPROVAL -- no approved-need producer exists (APD-09), so every source is `not_recorded`. Nothing here may ever
 *   call a source legitimate or approved.
 *
 * Point A (AP3-001): a route is a compute source only when `origin_class` is `compute` AND `source_compute` is a
 * canonical ref (uid + kind). The producer derives the two from different row fields, so they can disagree; a
 * disagreement is shown as "Unknown origin (conflicting metadata)" with both values, never reassigned.
 *
 * Observations: only `path_bound_observations` with `evidence_quality: observed` and `attribution: exact |
 * sole_consumer` are this source's; any other (or none) is shared activity, never credited. Hits and bytes are relayed
 * per observation and per route plane, NEVER summed across hops of a route or across routes (design §4).
 */
import type { ConvergencePath, CrownJewelConvergence } from "./convergence-types"
import { readConvergencePaths } from "./convergence-readiness"
import {
  pathClassification,
  permissionCoverageLine,
  type PathClassification,
  type PathEvidenceContract,
} from "./path-evidence-view"

/** The list groups sources by ACTIVITY only (Rev 6 §3.7). */
export type SourceSection = "observed" | "not_observed" | "unknown"

export type RouteActivity = "OBSERVED" | "PARTIALLY_OBSERVED" | "NOT_OBSERVED" | "UNKNOWN"
export type RouteAccess = "REACHABLE" | "UNVERIFIED" | "BLOCKED" | "OUT_OF_SCOPE" | "UNKNOWN"
export type SourceApproval = "not_recorded"

export interface SourceObservation {
  pathId: string
  hopOrdinal: number | null
  plane: string
  kind: string
  attribution: string
  coverageState: string | null
  firstSeen: string | null
  lastSeen: string | null
  hitCount: number | null
  bytes: number | null
  protocol: number | null
  dstPort: number | null
  apiOperation: string | null
  windowStart: string | null
  windowEnd: string | null
  summaryKey: string | null
}

export const PLANES = ["identity", "network", "data"] as const
export type Plane = (typeof PLANES)[number]
export const NOT_REPORTED = "not_reported"

/** One plane of one route's `evidence_contract.runtime_evidence`, relayed. */
export interface RoutePlane {
  plane: Plane
  state: string
  kinds: string[]
  firstSeen: string | null
  lastSeen: string | null
  hitCount: number | null
  coverageStates: string[]
}

export interface RouteAction {
  action: string
  permission: string
  runtime: string
  techniqueId: string | null
}

export interface SourceRoute {
  pathId: string
  attackPathId: string | null
  activity: RouteActivity
  /** Where the activity word came from and what the server said about it, verbatim when it said something. */
  activityBasis: "feasibility" | "contract" | "legacy" | "none"
  activityDetail: string
  access: RouteAccess
  accessBasis: "feasibility" | "classification" | "none"
  accessReason: string | null
  classification: PathClassification
  wholePathObserved: boolean | null
  identity: string | null
  damage: string[]
  impactHeadline: string | null
  planes: RoutePlane[] | null
  gates: Record<Plane, string | null> | null
  actions: RouteAction[]
  permissionCoverage: string | null
  /** Resolved observations of this route, relayed one per hop -- one flow seen at two hops is two rows, never a sum. */
  observations: SourceObservation[]
  /** Some observation on this route is shared or unattributed: unknown for this compute. */
  sharedActivity: boolean
  /** The producer served its own DATA_ACCESS_SUMMARY_ABSENT record for this route's data hop. */
  dataSummaryAbsent: boolean
}

export interface CurrentAccessSource {
  key: string
  kind: string
  name: string
  arn: string | null
  nativeId: string | null
  /** Activity section: observed if any route was observed (wholly or on a plane); not_observed only when every route
   *  is NOT_OBSERVED; otherwise unknown. */
  section: SourceSection
  /** How many routes carry each activity / access word -- a mixed source is said as mixed. */
  activityCounts: Partial<Record<RouteActivity, number>>
  accessCounts: Partial<Record<RouteAccess, number>>
  /** Routes ordered by the server's activity grade, then path id (no client risk ranking). */
  routes: SourceRoute[]
  /** The route a selection opens: the first route carrying the source's best served activity word. */
  primaryPathId: string
  identities: string[]
  sharedActivity: boolean
  /** Earliest / latest measured timestamp across this source's routes (resolved observations and observed planes);
   *  `seenRouteCount` says how many routes contributed, so a cross-route summary is always labelled. */
  firstSeen: string | null
  lastSeen: string | null
  seenRouteCount: number
  /** Distinct protocol/port and API operations from resolved observations (relayed, deduplicated, not counted). */
  operations: string[]
  observedActions: string[]
  allowedUnobservedActions: string[]
  coverageGaps: string[]
  damage: string[]
  impactHeadline: string | null
  approval: SourceApproval
}

export interface OriginRow {
  pathId: string
  label: string
  originClass: string | null
  /** Set when the row is an UNKNOWN origin because its metadata disagrees: both served values, verbatim. */
  conflict: { originClass: string | null; computeKind: string | null; computeUid: string | null; why: string } | null
}

export interface CurrentAccessSources {
  observed: CurrentAccessSource[]
  notObserved: CurrentAccessSource[]
  unknown: CurrentAccessSource[]
  /** Rows whose point A is a non-compute origin the server named (standing access, identity, external, unknown). */
  nonCompute: OriginRow[]
  /** Rows whose origin metadata disagrees (origin_class vs source_compute): "Unknown origin (conflicting metadata)". */
  conflictingOrigin: OriginRow[]
  sourceCount: number
  routeCount: number
  excludedInactive: number
  partial: string | null
  cardinality: CrownJewelConvergence["cardinality"] | null
  /** Observation window across resolved observations, when the server sent one; never invented. */
  window: { start: string | null; end: string | null } | null
  asOf: string | null
  generation: string | null
  /** The jewel's served resource type and whether the data-plane line applies (Rev 6 §3.11). */
  jewelType: string | null
  dataPlane: DataPlaneNote | null
}

export interface DataPlaneNote {
  /** True when no listed route carries an observed data plane. */
  noDataObservation: boolean
  /** The served data-plane states / coverage words across listed routes, verbatim and deduplicated. */
  servedStates: string[]
  /** The producer's own code for an absent data-access summary was served. */
  summaryAbsent: boolean
}

export interface CurrentAccessOptions {
  activePathIds?: ReadonlySet<string> | null
  /** The selected target's served resource type (catalog `kind`); falls back to the answer's `cj_type`. */
  jewelType?: string | null
}

/** Data-plane services: their crown jewels need data-plane observations to show use (AP3-101). */
export const DATA_PLANE_JEWEL_TYPES: ReadonlySet<string> = new Set([
  "S3Bucket", "DynamoDBTable", "KMSKey", "Secret", "SecretsManagerSecret",
])
const DATA_ACCESS_SUMMARY_ABSENT = "DATA_ACCESS_SUMMARY_ABSENT"

/** Activity grade, only to order a source's routes and to group sources: the server's own words, strongest first. */
const ACTIVITY_GRADE: Record<RouteActivity, number> = { OBSERVED: 0, PARTIALLY_OBSERVED: 1, NOT_OBSERVED: 2, UNKNOWN: 3 }
const RESOLVED_ATTRIBUTIONS = new Set(["exact", "sole_consumer"])
const ACTIVITY_WORDS: ReadonlySet<string> = new Set(["OBSERVED", "PARTIALLY_OBSERVED", "NOT_OBSERVED", "UNKNOWN"])
const ACCESS_WORDS: ReadonlySet<string> = new Set(["REACHABLE", "UNVERIFIED", "BLOCKED", "OUT_OF_SCOPE"])

const up = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : null)
const low = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().toLowerCase() : null)
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null)
const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [])

function contractOf(path: ConvergencePath): PathEvidenceContract | null {
  const c = path.evidence_contract
  return c && typeof c === "object" ? c : null
}

function classificationOf(path: ConvergencePath): PathClassification {
  return pathClassification({ evidence_contract: contractOf(path), evidence_type: path.evidence ?? path.confidence })
}

function planesOf(contract: PathEvidenceContract | null): RoutePlane[] | null {
  const runtime = contract?.runtime_evidence
  if (!runtime || typeof runtime !== "object") return null
  return PLANES.map((plane) => {
    const raw = (runtime as Record<string, unknown>)[plane]
    const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
    return {
      plane,
      state: low(r.state) ?? NOT_REPORTED,
      kinds: strings(r.kinds),
      firstSeen: str(r.first_seen),
      lastSeen: str(r.last_seen),
      hitCount: int(r.hit_count),
      coverageStates: strings(r.coverage_states),
    }
  })
}

const words = (s: string) => s.replace(/_/g, " ")

/** ACTIVITY of one route, from the server's words only. */
export function routeActivity(path: ConvergencePath): { activity: RouteActivity; basis: SourceRoute["activityBasis"]; detail: string } {
  const served = up(path.feasibility?.activity_state)
  if (served && ACTIVITY_WORDS.has(served)) {
    return {
      activity: served as RouteActivity,
      basis: "feasibility",
      detail: str(path.feasibility?.activity_detail) ?? `${words(served.toLowerCase())} (server feasibility)`,
    }
  }
  const contract = contractOf(path)
  if (contract) {
    if (contract.classification === "observed") {
      return { activity: "OBSERVED", basis: "contract", detail: "the evidence contract classifies the route observed" }
    }
    const planes = planesOf(contract)
    if (planes) {
      const observed = planes.filter((p) => p.state === "observed").map((p) => p.plane)
      if (observed.length > 0) {
        return {
          activity: "PARTIALLY_OBSERVED",
          basis: "contract",
          detail: `observed on ${observed.join(", ")}; not every plane of this route was observed`,
        }
      }
      if (planes.every((p) => p.state === "not_observed")) {
        return { activity: "NOT_OBSERVED", basis: "contract", detail: "every plane reports not observed" }
      }
      const unseen = planes.filter((p) => p.state !== "not_observed").map((p) => `${p.plane} ${words(p.state)}`)
      return { activity: "UNKNOWN", basis: "contract", detail: `activity not established: ${unseen.join(", ")}` }
    }
    return { activity: "UNKNOWN", basis: "contract", detail: "the evidence contract carries no runtime evidence" }
  }
  if (low(path.evidence) === "observed") {
    return { activity: "OBSERVED", basis: "legacy", detail: "the server's legacy whole-path evidence word is observed" }
  }
  return { activity: "UNKNOWN", basis: "none", detail: "the server sent no activity for this route" }
}

/** ACCESS NOW of one route, from the server's words only; observation never upgrades it. */
export function routeAccess(path: ConvergencePath): { access: RouteAccess; basis: SourceRoute["accessBasis"]; reason: string | null } {
  const served = up(path.feasibility?.path_state)
  if (served && ACCESS_WORDS.has(served)) {
    return { access: served as RouteAccess, basis: "feasibility", reason: str(path.feasibility?.reason) }
  }
  if (classificationOf(path) === "blocked") {
    return { access: "BLOCKED", basis: "classification", reason: "the server classifies the route blocked" }
  }
  return { access: "UNKNOWN", basis: "none", reason: "access now not composed by the server for this route" }
}

/** The list section of one route (its activity). Exported for the honesty-rule tests. */
export function routeSection(path: ConvergencePath): SourceSection {
  return sectionOf(routeActivity(path).activity)
}

function sectionOf(activity: RouteActivity): SourceSection {
  if (activity === "OBSERVED" || activity === "PARTIALLY_OBSERVED") return "observed"
  if (activity === "NOT_OBSERVED") return "not_observed"
  return "unknown"
}

function observationsOf(path: ConvergencePath): { resolved: SourceObservation[]; shared: boolean; dataAbsent: boolean } {
  const resolved: SourceObservation[] = []
  let shared = false
  let dataAbsent = false
  for (const raw of path.path_bound_observations ?? []) {
    if (!raw || typeof raw !== "object") continue
    if (strings(raw.reason_codes).some((c) => c.toUpperCase() === DATA_ACCESS_SUMMARY_ABSENT)) dataAbsent = true
    if (low(raw.evidence_quality) !== "observed") continue
    const attribution = low(raw.attribution)
    if (!attribution || !RESOLVED_ATTRIBUTIONS.has(attribution)) { shared = true; continue }
    resolved.push({
      pathId: path.path_id,
      hopOrdinal: int(raw.hop_ordinal),
      plane: low(raw.plane) ?? NOT_REPORTED,
      kind: low(raw.kind) ?? NOT_REPORTED,
      attribution,
      coverageState: up(raw.coverage_state),
      firstSeen: str(raw.first_seen),
      lastSeen: str(raw.last_seen),
      hitCount: int(raw.hit_count),
      bytes: int(raw.bytes),
      protocol: int(raw.protocol),
      dstPort: int(raw.dst_port),
      apiOperation: str(raw.api_operation),
      windowStart: str(raw.window_start),
      windowEnd: str(raw.window_end),
      summaryKey: str(raw.summary_key),
    })
  }
  return { resolved, shared, dataAbsent }
}

function gatesOf(contract: PathEvidenceContract | null): Record<Plane, string | null> | null {
  const gates = contract?.gates
  if (!gates || typeof gates !== "object") return null
  const g = gates as Record<string, unknown>
  return { identity: up(g.identity), network: up(g.network), data: up(g.data) }
}

/** Permission x runtime per action, relayed; a missing runtime is `not_reported`, never `not_observed`. */
function actionsOf(contract: PathEvidenceContract | null): RouteAction[] {
  const actions = contract?.permission_coverage?.actions
  if (!actions || typeof actions !== "object") return []
  return Object.entries(actions as Record<string, unknown>)
    .map(([action, raw]) => {
      const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
      return {
        action,
        permission: up(r.permission) ?? NOT_REPORTED.toUpperCase(),
        runtime: low(r.runtime) ?? NOT_REPORTED,
        techniqueId: str(r.technique_id),
      }
    })
    .sort((a, b) => a.action.localeCompare(b.action))
}

function routeOf(path: ConvergencePath): SourceRoute {
  const contract = contractOf(path)
  const activity = routeActivity(path)
  const access = routeAccess(path)
  const { resolved, shared, dataAbsent } = observationsOf(path)
  return {
    pathId: path.path_id,
    attackPathId: path.attack_path_id ?? null,
    activity: activity.activity,
    activityBasis: activity.basis,
    activityDetail: activity.detail,
    access: access.access,
    accessBasis: access.basis,
    accessReason: access.reason,
    classification: classificationOf(path),
    wholePathObserved: contract && typeof contract.whole_path_observed === "boolean" ? contract.whole_path_observed : null,
    identity: str(path.identity_name) ?? str(path.identity),
    damage: strings(path.damage),
    impactHeadline: str(path.impact_headline),
    planes: planesOf(contract),
    gates: gatesOf(contract),
    actions: actionsOf(contract),
    permissionCoverage: permissionCoverageLine(contract),
    observations: resolved,
    sharedActivity: shared,
    dataSummaryAbsent: dataAbsent,
  }
}

const PROTOCOL_NAMES: Record<number, string> = { 6: "TCP", 17: "UDP", 1: "ICMP" }

export function operationOf(o: SourceObservation): string | null {
  if (o.apiOperation) return o.apiOperation
  if (o.dstPort == null && o.protocol == null) return null
  const proto = o.protocol == null ? "protocol not reported" : (PROTOCOL_NAMES[o.protocol] ?? `protocol ${o.protocol}`)
  return o.dstPort == null ? proto : `${proto}/${o.dstPort}`
}

function minIso(values: Array<string | null>): string | null {
  return values.filter((v): v is string => Boolean(v)).sort()[0] ?? null
}
function maxIso(values: Array<string | null>): string | null {
  const present = values.filter((v): v is string => Boolean(v)).sort()
  return present[present.length - 1] ?? null
}
function pushUnique(list: string[], value: string | null | undefined): void {
  if (value && !list.includes(value)) list.push(value)
}

function originLabel(path: ConvergencePath): string {
  return str(path.source) ?? str(path.identity_name) ?? str(path.identity) ?? path.path_id
}

/** Point A of one row: a compute ref only when origin_class says compute AND source_compute is canonical. */
function originOf(path: ConvergencePath):
  | { kind: "compute"; uid: string; computeKind: string }
  | { kind: "other"; row: OriginRow }
  | { kind: "conflict"; row: OriginRow } {
  const originClass = low(path.origin_class)
  const compute = path.source_compute && typeof path.source_compute === "object" ? path.source_compute : null
  const uid = str(compute?.uid)
  const computeKind = str(compute?.kind)
  const ref = uid && computeKind ? { uid, computeKind } : null
  const base = { pathId: path.path_id, label: originLabel(path), originClass }
  if (originClass === "compute" && ref) return { kind: "compute", ...ref }
  if (originClass === "compute" && !ref) {
    return { kind: "conflict", row: { ...base, conflict: { originClass, computeKind, computeUid: uid,
      why: "origin class says compute but no canonical compute reference was served" } } }
  }
  if (ref) {
    return { kind: "conflict", row: { ...base, conflict: { originClass, computeKind: ref.computeKind, computeUid: ref.uid,
      why: originClass ? `origin class says ${words(originClass)} but a compute reference was served` : "origin class not reported beside a compute reference" } } }
  }
  return { kind: "other", row: { ...base, conflict: null } }
}

/** Group a by-crown-jewel answer into the Current Access source list. Null when there is no answer. */
export function currentAccessSources(
  data: CrownJewelConvergence | null | undefined,
  options: CurrentAccessOptions = {},
): CurrentAccessSources | null {
  if (!data) return null
  const reading = readConvergencePaths(data)
  const paths = reading.kind === "paths" ? reading.paths : []
  const active = options.activePathIds ?? null
  const bySource = new Map<string, CurrentAccessSource>()
  const nonCompute: OriginRow[] = []
  const conflictingOrigin: OriginRow[] = []
  const listedRoutes: SourceRoute[] = []
  let excludedInactive = 0

  for (const path of paths) {
    if (active && !active.has(path.path_id)) { excludedInactive += 1; continue }
    const origin = originOf(path)
    if (origin.kind === "other") { nonCompute.push(origin.row); continue }
    if (origin.kind === "conflict") { conflictingOrigin.push(origin.row); continue }
    const compute = path.source_compute!
    const route = routeOf(path)
    listedRoutes.push(route)
    let source = bySource.get(origin.uid)
    if (!source) {
      source = {
        key: origin.uid,
        kind: origin.computeKind,
        name: str(compute.name) ?? str(compute.native_id) ?? str(compute.arn) ?? origin.uid,
        arn: str(compute.arn),
        nativeId: str(compute.native_id),
        section: "unknown",
        activityCounts: {},
        accessCounts: {},
        routes: [],
        primaryPathId: path.path_id,
        identities: [],
        sharedActivity: false,
        firstSeen: null,
        lastSeen: null,
        seenRouteCount: 0,
        operations: [],
        observedActions: [],
        allowedUnobservedActions: [],
        coverageGaps: [],
        damage: [],
        impactHeadline: null,
        approval: "not_recorded",
      }
      bySource.set(origin.uid, source)
    }
    source.routes.push(route)
    source.activityCounts[route.activity] = (source.activityCounts[route.activity] ?? 0) + 1
    source.accessCounts[route.access] = (source.accessCounts[route.access] ?? 0) + 1
    source.sharedActivity = source.sharedActivity || route.sharedActivity
    pushUnique(source.identities, route.identity)
    for (const d of route.damage) pushUnique(source.damage, d)
    for (const o of route.observations) pushUnique(source.operations, operationOf(o))
    for (const a of route.actions) if (a.runtime === "observed") pushUnique(source.observedActions, a.action)
    for (const p of route.planes ?? []) {
      if (p.state === "observed") continue
      const coverage = p.coverageStates.length ? ` (${p.coverageStates.join(", ")})` : ""
      pushUnique(source.coverageGaps, `${p.plane} ${words(p.state)}${coverage}`)
    }
  }

  for (const source of bySource.values()) {
    source.routes.sort((a, b) => ACTIVITY_GRADE[a.activity] - ACTIVITY_GRADE[b.activity] || a.pathId.localeCompare(b.pathId))
    source.section = sectionOf(source.routes[0].activity)
    source.primaryPathId = source.routes[0].pathId
    source.impactHeadline = source.routes.find((r) => r.impactHeadline)?.impactHeadline ?? null
    const seen = source.routes.map((r) => {
      const observedPlanes = (r.planes ?? []).filter((p) => p.state === "observed")
      const firsts = [...r.observations.map((o) => o.firstSeen), ...observedPlanes.map((p) => p.firstSeen)]
      const lasts = [...r.observations.map((o) => o.lastSeen), ...observedPlanes.map((p) => p.lastSeen)]
      return { first: minIso(firsts), last: maxIso(lasts) }
    })
    source.firstSeen = minIso(seen.map((s) => s.first))
    source.lastSeen = maxIso(seen.map((s) => s.last))
    source.seenRouteCount = seen.filter((s) => s.first || s.last).length
    for (const r of source.routes) {
      for (const a of r.actions) {
        if (a.permission === "ALLOWED" && a.runtime === "not_observed" && !source.observedActions.includes(a.action)) {
          pushUnique(source.allowedUnobservedActions, a.action)
        }
      }
    }
  }

  // Presentation order is by NAME within a section (Rev 6 §3.6): no client ranking by risk, count or score.
  const ordered = [...bySource.values()].sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key))
  const pick = (s: SourceSection) => ordered.filter((x) => x.section === s)
  const allObservations = listedRoutes.flatMap((r) => r.observations)
  const starts = allObservations.map((o) => o.windowStart)
  const ends = allObservations.map((o) => o.windowEnd)
  const window = starts.some(Boolean) || ends.some(Boolean) ? { start: minIso(starts), end: maxIso(ends) } : null
  const jewelType = str(options.jewelType) ?? str(data.cj_type)

  return {
    observed: pick("observed"),
    notObserved: pick("not_observed"),
    unknown: pick("unknown"),
    nonCompute,
    conflictingOrigin,
    sourceCount: ordered.length,
    routeCount: listedRoutes.length,
    excludedInactive,
    partial: reading.kind === "paths" ? reading.partial : null,
    cardinality: data.cardinality ?? null,
    window,
    asOf: str(data.as_of),
    generation: str(data.generation),
    jewelType,
    dataPlane: jewelType && DATA_PLANE_JEWEL_TYPES.has(jewelType) ? dataPlaneNote(listedRoutes) : null,
  }
}

function dataPlaneNote(routes: SourceRoute[]): DataPlaneNote {
  const dataPlanes = routes.map((r) => (r.planes ?? []).find((p) => p.plane === "data") ?? null)
  const servedStates: string[] = []
  let summaryAbsent = false
  for (const p of dataPlanes) {
    if (!p) { pushUnique(servedStates, "no evidence contract"); continue }
    pushUnique(servedStates, words(p.state))
    for (const c of p.coverageStates) {
      pushUnique(servedStates, c)
      if (c.toUpperCase() === DATA_ACCESS_SUMMARY_ABSENT) summaryAbsent = true
    }
  }
  if (routes.some((r) => r.dataSummaryAbsent)) summaryAbsent = true
  return { noDataObservation: !dataPlanes.some((p) => p?.state === "observed"), servedStates, summaryAbsent }
}
