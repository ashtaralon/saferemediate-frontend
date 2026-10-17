/**
 * (AP201 / CP-B) The jewel-wide Current Access source list: every compute source the by-crown-jewel answer names,
 * grouped by canonical compute identity, read from the fields the backend already serves. This is the temporary
 * authoritative reader of the approved plan (P5.1): it groups and relays server words; it classifies nothing itself.
 *
 * Server words used, and nothing else:
 * - `source_compute` (AP3-001, a CanonicalComputeRef) and `origin_class`: who point A is. A row without a compute
 *   origin is never shown as a compute source.
 * - `feasibility.path_state` (REACHABLE | BLOCKED | UNVERIFIED | OUT_OF_SCOPE) and `feasibility.activity_state`
 *   (OBSERVED | NOT_OBSERVED | UNKNOWN) when the server composed them -- a BLOCKED / OUT_OF_SCOPE route is never
 *   "current access" whatever its activity; else the server's `evidence_contract.classification`
 *   (observed | inferred | blocked | unknown), else the legacy whole-path word -- all through the one existing
 *   reader, path-evidence-view's `pathClassification` (no second classifier).
 * - `evidence_contract.runtime_evidence` per plane (state, kinds, first/last seen, hit count, coverage states),
 *   `whole_path_observed`, `gates`, and `permission_coverage.actions` (permission x runtime per action): relayed per
 *   route, never merged into a verdict here. A value the server did not send is "not reported", never a default.
 * - `path_bound_observations` (AP3-101, contract v2): the per-hop observations bound to THIS path, each referencing the
 *   behavioral summary it was read from. Only `evidence_quality: observed` with `attribution: exact | sole_consumer`
 *   is an observation of this source; `unresolved` -- and an observation that names NO attribution -- is shared
 *   activity on a role, never this source's. Nothing is summed across hops or paths (design §4).
 * - `identity_name`, `damage`, `impact_headline`, `business_sentence`: relayed as the server's assessed capability.
 *
 * Approval: no approved-need producer exists (APD-09 is unregistered), so every source carries
 * `approval: "not_recorded"`. Nothing here may ever call a source legitimate.
 */
import type { ConvergencePath, CrownJewelConvergence } from "./convergence-types"
import { readConvergencePaths } from "./convergence-readiness"
import {
  pathClassification,
  permissionCoverageLine,
  type PathClassification,
  type PathEvidenceContract,
} from "./path-evidence-view"

export type SourceSection =
  /** The server bound observed activity to a route from this compute (feasibility activity OBSERVED, or class observed). */
  | "observed"
  /** Configured or reachable with no observed activity (not observed, or unknown -- the route says which). */
  | "allowed_not_observed"
  /** A server-backed control stops every route of this source. */
  | "blocked"
  /** Routes the server could not verify, and routes with no feasibility and no evidence word. */
  | "unverified"
  /** Explicitly outside the assessed scope (platform / service-linked). */
  | "out_of_scope"

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

/** One plane of one route's `evidence_contract.runtime_evidence`, relayed. `state` is the server's word, lowercased,
 *  or `not_reported` when the server sent none. */
export interface RoutePlane {
  plane: Plane
  state: string
  kinds: string[]
  firstSeen: string | null
  lastSeen: string | null
  hitCount: number | null
  coverageStates: string[]
}

/** One action of one route's `permission_coverage.actions`, relayed; `NOT_REPORTED` / `not_reported` when absent. */
export interface RouteAction {
  action: string
  permission: string
  runtime: string
  techniqueId: string | null
}

export interface SourceRoute {
  pathId: string
  attackPathId: string | null
  section: SourceSection
  /** The server's classification (contract first, legacy word second), as path-evidence-view reads it. */
  classification: PathClassification
  fromContract: boolean
  /** The contract's `whole_path_observed`; null without a contract. */
  wholePathObserved: boolean | null
  evidence: string | null
  activityState: string | null
  pathState: string | null
  identity: string | null
  damage: string[]
  impactHeadline: string | null
  score: number | null
  severityLabel: string | null
  /** Per-plane runtime evidence; null when the route carries no contract. */
  planes: RoutePlane[] | null
  /** The server's gate words (identity / network / data), null per plane when not sent; null without a contract. */
  gates: Record<Plane, string | null> | null
  actions: RouteAction[]
  /** path-evidence-view's permission-coverage sentence, or null without a contract. */
  permissionCoverage: string | null
}

export interface CurrentAccessSource {
  /** Canonical compute identity (CanonicalComputeRef.uid). */
  key: string
  kind: string
  name: string
  arn: string | null
  nativeId: string | null
  /** The section of the source's strongest route (the list's grouping); `sectionCounts` says what the others are. */
  section: SourceSection
  /** How many of this source's routes fall in each section -- a mixed source is said as mixed. */
  sectionCounts: Partial<Record<SourceSection, number>>
  routes: SourceRoute[]
  /** The route the list opens on selection: the strongest-evidence route, then the highest server score. */
  primaryPathId: string
  identities: string[]
  /** Resolved observations of THIS source (observed quality, exact / sole-consumer attribution). */
  observations: SourceObservation[]
  /** Some observation on this source's routes is shared or unattributed activity on a role: UNKNOWN for this source. */
  sharedActivity: boolean
  /** Earliest / latest measured timestamp the server attributed to this source's routes: resolved bound observations
   *  and observed-plane runtime evidence, across all its routes. Null when nothing was measured. */
  firstSeen: string | null
  lastSeen: string | null
  /** Actions some route's permission coverage marks `runtime: observed`. */
  observedActions: string[]
  /** Actions with an ALLOWED permission whose runtime is `not_observed` on every route (never when runtime is unreported). */
  allowedUnobservedActions: string[]
  /** Planes whose runtime evidence is not "observed" on some route, with the server's coverage word: what the answer
   *  could not see. Empty when every plane of every route is observed, or when no route carries a contract. */
  coverageGaps: string[]
  /** The server's damage labels across this source's routes (assessed capability, not activity). */
  damage: string[]
  impactHeadline: string | null
  approval: SourceApproval
}

export interface NonComputeRow {
  pathId: string
  originClass: string | null
  label: string
}

export interface CurrentAccessSources {
  observed: CurrentAccessSource[]
  allowedNotObserved: CurrentAccessSource[]
  blocked: CurrentAccessSource[]
  unverified: CurrentAccessSource[]
  outOfScope: CurrentAccessSource[]
  /** Rows whose point A is not a registered compute: standing access / identity / external / unknown origins. */
  nonCompute: NonComputeRow[]
  /** Distinct compute sources across every section. */
  sourceCount: number
  /** Listed compute routes across every source (non-compute rows excluded). */
  routeCount: number
  /** Routes the caller's active set excluded (e.g. a resource reconciled inactive); said, never silently dropped. */
  excludedInactive: number
  /** Why the listed routes are not every route to the jewel (readConvergencePaths), or null. */
  partial: string | null
  cardinality: CrownJewelConvergence["cardinality"] | null
}

export interface CurrentAccessOptions {
  /** Path ids the page lists (its active filter applied). When given, routes outside it are counted, not shown, so a
   *  source never pins a route the path list does not have. */
  activePathIds?: ReadonlySet<string> | null
}

const SECTION_RANK: Record<SourceSection, number> = {
  observed: 0, allowed_not_observed: 1, unverified: 2, out_of_scope: 3, blocked: 4,
}
const CLASS_SECTION: Record<PathClassification, SourceSection> = {
  observed: "observed", inferred: "allowed_not_observed", blocked: "blocked", unknown: "unverified",
}
const RESOLVED_ATTRIBUTIONS = new Set(["exact", "sole_consumer"])

const up = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : null)
const low = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().toLowerCase() : null)
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null)
const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [])

function contractOf(path: ConvergencePath): PathEvidenceContract | null {
  const c = path.evidence_contract
  return c && typeof c === "object" ? c : null
}

/** The section one route belongs to, from the server's words only. The server-composed `feasibility` is the authority
 *  when present: a BLOCKED or OUT_OF_SCOPE route is not current access whatever its activity; then observed activity;
 *  then an unverified route; then a reachable one with no observed activity. Without feasibility, the server's
 *  classification as path-evidence-view reads it (contract first, then the legacy `evidence` word, then `confidence`). */
export function routeSection(path: ConvergencePath): SourceSection {
  const activity = up(path.feasibility?.activity_state)
  const state = up(path.feasibility?.path_state)
  if (state === "OUT_OF_SCOPE") return "out_of_scope"
  if (state === "BLOCKED") return "blocked"
  if (activity === "OBSERVED") return "observed"
  if (state === "UNVERIFIED") return "unverified"
  if (state === "REACHABLE") return "allowed_not_observed"
  return CLASS_SECTION[classificationOf(path)]
}

function classificationOf(path: ConvergencePath): PathClassification {
  return pathClassification({ evidence_contract: contractOf(path), evidence_type: path.evidence ?? path.confidence })
}

function observationsOf(path: ConvergencePath): { resolved: SourceObservation[]; shared: boolean } {
  const resolved: SourceObservation[] = []
  let shared = false
  for (const raw of path.path_bound_observations ?? []) {
    if (!raw || typeof raw !== "object") continue
    const quality = low(raw.evidence_quality)
    if (quality !== "observed") continue
    // No attribution is not "exact": an observation the server did not attribute is shared activity.
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
  return { resolved, shared }
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

function gatesOf(contract: PathEvidenceContract | null): Record<Plane, string | null> | null {
  const gates = contract?.gates
  if (!gates || typeof gates !== "object") return null
  const g = gates as Record<string, unknown>
  return { identity: up(g.identity), network: up(g.network), data: up(g.data) }
}

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
  const classification = classificationOf(path)
  return {
    pathId: path.path_id,
    attackPathId: path.attack_path_id ?? null,
    section: routeSection(path),
    classification,
    fromContract: contract != null && contract.classification === classification,
    wholePathObserved: contract && typeof contract.whole_path_observed === "boolean" ? contract.whole_path_observed : null,
    evidence: low(path.evidence) ?? low(path.confidence),
    activityState: up(path.feasibility?.activity_state),
    pathState: up(path.feasibility?.path_state),
    identity: str(path.identity_name) ?? str(path.identity),
    damage: strings(path.damage),
    impactHeadline: str(path.impact_headline),
    score: int(path.score),
    severityLabel: str(path.severity_label),
    planes: planesOf(contract),
    gates: gatesOf(contract),
    actions: actionsOf(contract),
    permissionCoverage: permissionCoverageLine(contract),
  }
}

function minIso(values: Array<string | null>): string | null {
  const present = values.filter((v): v is string => Boolean(v)).sort()
  return present[0] ?? null
}
function maxIso(values: Array<string | null>): string | null {
  const present = values.filter((v): v is string => Boolean(v)).sort()
  return present[present.length - 1] ?? null
}
function pushUnique(list: string[], value: string | null | undefined): void {
  if (value && !list.includes(value)) list.push(value)
}

function nonComputeLabel(path: ConvergencePath): string {
  return str(path.source) ?? str(path.identity_name) ?? str(path.identity) ?? path.path_id
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
  const nonCompute: NonComputeRow[] = []
  let routeCount = 0
  let excludedInactive = 0

  for (const path of paths) {
    if (active && !active.has(path.path_id)) { excludedInactive += 1; continue }
    const compute = path.source_compute
    if (!compute || typeof compute !== "object" || !str(compute.uid) || !str(compute.kind)) {
      nonCompute.push({ pathId: path.path_id, originClass: str(path.origin_class), label: nonComputeLabel(path) })
      continue
    }
    const route = routeOf(path)
    const { resolved, shared } = observationsOf(path)
    const key = compute.uid
    let source = bySource.get(key)
    if (!source) {
      source = {
        key,
        kind: compute.kind,
        name: str(compute.name) ?? str(compute.native_id) ?? str(compute.arn) ?? compute.uid,
        arn: str(compute.arn),
        nativeId: str(compute.native_id),
        section: route.section,
        sectionCounts: {},
        routes: [],
        primaryPathId: path.path_id,
        identities: [],
        observations: [],
        sharedActivity: false,
        firstSeen: null,
        lastSeen: null,
        observedActions: [],
        allowedUnobservedActions: [],
        coverageGaps: [],
        damage: [],
        impactHeadline: null,
        approval: "not_recorded",
      }
      bySource.set(key, source)
    }
    routeCount += 1
    source.routes.push(route)
    source.sectionCounts[route.section] = (source.sectionCounts[route.section] ?? 0) + 1
    source.observations.push(...resolved)
    source.sharedActivity = source.sharedActivity || shared
    pushUnique(source.identities, route.identity)
    for (const d of route.damage) pushUnique(source.damage, d)
    for (const a of route.actions) {
      if (a.runtime === "observed") pushUnique(source.observedActions, a.action)
    }
    for (const p of route.planes ?? []) {
      if (p.state === "observed") continue
      const coverage = p.coverageStates.length ? ` (${p.coverageStates.join(", ")})` : ""
      pushUnique(source.coverageGaps, `${p.plane} ${p.state.replace(/_/g, " ")}${coverage}`)
    }
  }

  for (const source of bySource.values()) {
    source.routes.sort((a, b) =>
      SECTION_RANK[a.section] - SECTION_RANK[b.section] || (b.score ?? -1) - (a.score ?? -1) || a.pathId.localeCompare(b.pathId))
    source.section = source.routes[0].section
    source.primaryPathId = source.routes[0].pathId
    source.impactHeadline = source.routes.find((r) => r.impactHeadline)?.impactHeadline ?? null
    const observedPlanes = source.routes.flatMap((r) => (r.planes ?? []).filter((p) => p.state === "observed"))
    source.firstSeen = minIso([...source.observations.map((o) => o.firstSeen), ...observedPlanes.map((p) => p.firstSeen)])
    source.lastSeen = maxIso([...source.observations.map((o) => o.lastSeen), ...observedPlanes.map((p) => p.lastSeen)])
    for (const r of source.routes) {
      for (const a of r.actions) {
        if (a.permission === "ALLOWED" && a.runtime === "not_observed" && !source.observedActions.includes(a.action)) {
          pushUnique(source.allowedUnobservedActions, a.action)
        }
      }
    }
  }

  const ordered = [...bySource.values()].sort((a, b) =>
    SECTION_RANK[a.section] - SECTION_RANK[b.section]
    || (b.lastSeen ?? "").localeCompare(a.lastSeen ?? "")
    || (b.routes[0].score ?? -1) - (a.routes[0].score ?? -1)
    || a.name.localeCompare(b.name))
  const pick = (s: SourceSection) => ordered.filter((x) => x.section === s)
  return {
    observed: pick("observed"),
    allowedNotObserved: pick("allowed_not_observed"),
    blocked: pick("blocked"),
    unverified: pick("unverified"),
    outOfScope: pick("out_of_scope"),
    nonCompute,
    sourceCount: ordered.length,
    routeCount,
    excludedInactive,
    partial: reading.kind === "paths" ? reading.partial : null,
    cardinality: data.cardinality ?? null,
  }
}
