// =============================================================================
// compile-path-list-row.ts — pure compiler: IdentityAttackPath → PathListRow
// =============================================================================
//
// Boundary between the raw IAP payload and the list/comparison renderers
// (PR 2 of the IR cutover chain, task #34). Every selector that previously
// lived inside the renderers (assume-edge resolution, crown-jewel terminus
// dual-typing, observed-hit aggregation, e2e classification, damage/fix
// summarization) collapses into this single function so the views read
// only the pre-resolved row.
//
// Pure + deterministic — no clock, no random, no side effects. Component
// useMemo runs this once per path per render.
//
// Why this lives next to attack-path-report-types.ts: same architectural
// layer as the per-path AttackPathReport compiler — the only diff is that
// PathListRow is FE-compiled today (backend has no
// /api/attack-paths/list-projection yet; #33 was marked done without an
// artifact). Swapping to a backend deserialize later is a one-line change.

import type {
  IdentityAttackPath,
  PathNodeDetail,
  CrownJewelSummary,
  InitialAccessCategory,
} from "@/components/identity-attack-paths/types"
import { isPrincipalNodeType } from "@/components/identity-attack-paths/types"
import {
  findServerOriginMatch,
  hasServerOrigin,
  isIdentityOriginKind,
  serverOriginOf,
  type ServerOrigin,
} from "@/lib/attack-paths/server-origin"
import { findComputeFoothold } from "./path-shape"
import {
  buildEffectiveDamageMatrix,
  matrixToSummary,
} from "./effective-damage-matrix"
import { friendlyResourceName } from "./friendly-names"
import type {
  HeadlineTag,
  ImpactBucket,
  ImpactConfidence,
  ImpactReason,
  InitialAccessCategoryLite,
  PathListRow,
  PathObservedE2EClass,
} from "./attack-path-report-types"
import { compileZoom0Projection } from "./reachable-damage-priority"

// =============================================================================
// Edge-type taxonomies — drive observed_e2e_class derivation.
// =============================================================================

const DATA_PLANE_EDGE_TYPES = new Set([
  "ACTUAL_S3_ACCESS",
  "READS_FROM",
  "WRITES_TO",
  "ACCESSES_RESOURCE",
])

const CONTROL_PLANE_EDGE_TYPES = new Set([
  "ACTUAL_API_CALL",
  "CALLS",
  "ASSUMES_ROLE_ACTUAL",
  "INVOKES",
])

// =============================================================================
// Node helpers — small, focused, used by source/identity/target resolution.
// =============================================================================

function nodeById(
  path: IdentityAttackPath,
  id: string | null | undefined,
): PathNodeDetail | undefined {
  if (!id) return undefined
  return (path.nodes ?? []).find((n) => n.id === id || n.canonical_id === id)
}

function assumeEdgeOf(path: IdentityAttackPath) {
  return (path.edges ?? []).find((e) => /ASSUME|STS/i.test(e.type))
}

// =============================================================================
// Origin resolution (AP3-001-FE) — server-authored FIRST, hop order only as a
// FLAGGED fallback. SERVE rows reach this compiler through convergence-to-iap
// carrying `source_kind` / `workload_arn` ((:AttackPath).workload_kind /
// workload_arn); legacy IAP rows carry neither, so they keep the BE-10 hop-
// order rules below and are badged `origin_inferred`. Matching lives in
// lib/attack-paths/server-origin.ts, shared with the adapter and the dossier.
// =============================================================================

export interface PathOrigin {
  /** Path node tied to the origin — by identity (server) or order (fallback). */
  node: PathNodeDetail | null
  /** Server workload kind, else the fallback node's type. null = unknown. */
  kind: string | null
  arn: string | null
  name: string | null
  /** The server fields as read off the row (null = backend did not send). */
  server: ServerOrigin
  /** true when no server origin existed and hop order decided. */
  inferred: boolean
  /** true when the origin is an identity kind (role / user / principal /
   *  OrphanRole) and the path has no compute foothold anywhere: an
   *  identity-only exposure the compute-led list must not render as a route.
   *  Counted by compilePathListRows — never silently dropped. */
  identity_only: boolean
}

function isJewelNode(path: IdentityAttackPath, n: PathNodeDetail): boolean {
  if (n.tier === "crown_jewel") return true
  const cj = path.crown_jewel_id
  return !!cj && (n.id === cj || n.canonical_id === cj)
}

/** Hop-order fallback for the start — first non-principal, non-jewel node,
 *  then nodes[0]. Skipping the jewel matters on orphan-role chains
 *  ([Principal, S3Bucket]): "first non-principal" used to return the crown
 *  jewel itself as the FROM tile. */
function inferStartNode(path: IdentityAttackPath): PathNodeDetail | null {
  const nodes = path.nodes ?? []
  return (
    nodes.find((n) => !isPrincipalNodeType(n.type) && !isJewelNode(path, n)) ??
    nodes[0] ??
    null
  )
}

export function resolvePathOrigin(path: IdentityAttackPath): PathOrigin {
  const server = serverOriginOf(path)
  const nodes = path.nodes ?? []
  const anchorIdx = findServerOriginMatch(
    nodes,
    (n) =>
      isJewelNode(path, n)
        ? { ids: [] }
        : { ids: [n.id, n.canonical_id, n.arn], name: n.name },
    server,
  )
  const anchor = anchorIdx >= 0 ? nodes[anchorIdx] : null
  if (anchor || hasServerOrigin(server)) {
    const kind = server.kind ?? anchor?.type ?? null
    return {
      node: anchor,
      kind,
      arn: server.arn ?? anchor?.canonical_id ?? anchor?.arn ?? null,
      name: anchor?.name ?? server.name,
      server,
      inferred: false,
      identity_only: isIdentityOriginKind(kind) && !findComputeFoothold(path),
    }
  }
  const node = inferStartNode(path)
  const kind = node?.type ?? null
  return {
    node,
    kind,
    arn: node?.canonical_id ?? node?.arn ?? null,
    name: node?.name ?? null,
    server,
    inferred: node != null,
    identity_only:
      node != null && isIdentityOriginKind(kind) && !findComputeFoothold(path),
  }
}

// =============================================================================
// Source / identity / target resolution — the BE-10 rules from
// path-damage-summary.ts, hoisted into the compiler so renderers stop
// re-running them per row.
// =============================================================================

/** Server-authored origin wins outright. Otherwise BE-10 (sibling to BE-9):
 *  when the path opens with an assume hop, the entry is the role doing the
 *  assuming (assume-edge source) — NOT whichever role sits at nodes[0];
 *  else the first non-principal node (the operator-meaningful workload). */
function compileSourceLabel(path: IdentityAttackPath, origin: PathOrigin): string {
  if (!origin.inferred) {
    if (origin.name || origin.arn) {
      return friendlyResourceName(origin.name, origin.kind, origin.arn)
    }
    // Server sent a kind but no name / arn: unavailable, not a type-as-name.
    if (origin.kind) return "—"
  }
  const entry = nodeById(path, assumeEdgeOf(path)?.source)
  if (entry) return friendlyResourceName(entry.name, entry.type)
  const workload = (path.nodes ?? []).find((n) => !isPrincipalNodeType(n.type))
  const raw = workload?.name ?? path.nodes?.[0]?.name ?? "—"
  // friendlyResourceName strips the legacy "(orphan role: X)" marker
  // (pre-2026-06-25 materialized paths still in the graph until the
  // next phase3 run). New paths arrive as bare role names already.
  return friendlyResourceName(raw, workload?.type ?? path.nodes?.[0]?.type)
}

/** BE-10: the role whose edge actually targets the crown jewel (not the
 *  first IAMRole — assume chains have two and naïve indexing duplicates
 *  the source). Falls back to the first IAMRole, then to the role on the
 *  damage capability. */
function compileIdentityLabel(path: IdentityAttackPath): string {
  const cj = path.crown_jewel_id
  const reachEdge = (path.edges ?? []).find(
    (e) =>
      (e.target === cj || e.target === nodeById(path, cj)?.id) &&
      /ACCESS|QUERIES_DB|ENCRYPTED_BY|CALLS/i.test(e.type),
  )
  const reacher = nodeById(path, reachEdge?.source)
  if (reacher && /IAMRole/i.test(reacher.type)) {
    return friendlyResourceName(reacher.name, reacher.type)
  }
  const role = (path.nodes ?? []).find((n) => n.type === "IAMRole")
  const raw = role?.name ?? path.damage_capability?.role_name ?? "—"
  return friendlyResourceName(raw, role?.type ?? "IAMRole")
}

/** Crown-jewel resolution (Bug #209): the path's nodes[] may end at the
 *  KMSKey that ENCRYPTS the jewel (compiler §5.4 dual-typing — canvas
 *  shows both S3 and KMS at the tail). Naïve nodes[last] yields
 *  "alon-demo-app2 → cyntro-demo-cmk" under a header that says
 *  "saferemediate-logs". Prefer the crown_jewel_id node, then the parent
 *  jewel context, then the chain tail. */
function compileTargetNode(
  path: IdentityAttackPath,
  jewel: CrownJewelSummary | null,
): PathNodeDetail | null {
  const jewelNode =
    (path.crown_jewel_id &&
      (path.nodes ?? []).find((n) => n.id === path.crown_jewel_id)) ||
    null
  if (jewelNode) return jewelNode
  if (jewel && path.crown_jewel_id === jewel.id) {
    return {
      id: jewel.id,
      name: jewel.name,
      type: jewel.type,
    } as PathNodeDetail
  }
  return path.nodes?.[path.nodes.length - 1] ?? null
}

// =============================================================================
// Observed-edge aggregation — the "this path actually saw traffic" signal.
// =============================================================================

function compileObservedHits(path: IdentityAttackPath): number {
  let total = 0
  for (const e of path.edges ?? []) {
    if (e.is_observed) total += e.hit_count ?? 0
  }
  return total
}

function compileHasObservedEdge(path: IdentityAttackPath): boolean {
  return (path.edges ?? []).some((e) => e.is_observed === true)
}

function compileObservedE2EClass(
  path: IdentityAttackPath,
): PathObservedE2EClass {
  let observedDataPlane = false
  let observedControlPlane = false
  for (const e of path.edges ?? []) {
    if (!e.is_observed) continue
    if (DATA_PLANE_EDGE_TYPES.has(e.type)) observedDataPlane = true
    else if (CONTROL_PLANE_EDGE_TYPES.has(e.type)) observedControlPlane = true
  }
  if (observedDataPlane) return "live_exfil"
  if (observedControlPlane) return "recon"
  return "capability"
}

// =============================================================================
// Damage + fix summaries — these were exported from path-damage-summary.ts
// and called per-row inside the renderers. Inlined here so PR 3 can delete
// path-damage-summary.ts without churning every caller again.
// =============================================================================

function compileDamageSummary(path: IdentityAttackPath): string {
  const dc = path.damage_capability
  const matrix = buildEffectiveDamageMatrix(dc, null, false)
  const fromMatrix = matrixToSummary(matrix)
  if (fromMatrix !== "Unknown") return fromMatrix
  const summary = dc?.summary?.toLowerCase() ?? ""
  if (summary.includes("network blocked")) return "Blocked"
  if (summary.includes("data-plane blocked")) return "Blocked"
  return fromMatrix
}

function compileTopFixLabel(path: IdentityAttackPath): string {
  const top = path.risk_reduction?.top_actions?.[0]
  if (top?.action) return top.action
  const summary = path.risk_reduction?.reduction_summary
  if (summary) return summary.length > 72 ? summary.slice(0, 69) + "…" : summary
  return "—"
}

// =============================================================================
// Initial-access category — delegate to the path's own classification when
// the backend has written it (single source of truth). The legacy FE
// fallback that derives from per-node signals stays in path-list-grouped
// during this PR — moving it here would balloon the diff. PR 3 hoists it
// once the backend writes INITIAL_ACCESS_VIA for every system.
// =============================================================================

const VALID_CATEGORIES: ReadonlySet<InitialAccessCategoryLite> = new Set([
  "LEAKED_ACCESS_KEY",
  "IMDS_CREDENTIAL_THEFT",
  "EXPOSED_S3_BUCKET",
  "EXPOSED_RDS_SNAPSHOT",
  "EXPOSED_K8S_WORKLOAD",
  "EXPOSED_ECR_IMAGE",
  "EXPOSED_WORKLOAD_RCE",
  "COGNITO_OR_FEDERATED_IDP",
  "CONSOLE_OR_CLOUDSHELL",
  "CROSS_ACCOUNT_TRUST",
  "UNKNOWN",
])

function narrowCategory(
  c: InitialAccessCategory | undefined,
): InitialAccessCategoryLite | null {
  if (!c) return null
  return VALID_CATEGORIES.has(c as InitialAccessCategoryLite)
    ? (c as InitialAccessCategoryLite)
    : null
}

// =============================================================================
// Sprint 0 impact-taxonomy compilation — read backend-written fields,
// fall back conservatively to legacy damage_types-derived buckets.
// =============================================================================

const VALID_BUCKETS: ReadonlySet<ImpactBucket> = new Set<ImpactBucket>([
  "READ", "WRITE", "EXFIL",
  "DESTRUCTIVE", "PRIV_ESC", "PERSISTENCE",
  "EVASION", "SECRET_EXPOSURE", "EXECUTION", "UNKNOWN",
])

const VALID_HEADLINES: ReadonlySet<HeadlineTag> = new Set<HeadlineTag>([
  "CATASTROPHIC", "TAKEOVER", "SECRET LEAK", "DATA BREACH",
  "DESTRUCTIVE ACCESS", "EVASION ENABLED", "EXPOSURE", "CONFIGURED RISK",
])

// Conservative legacy→new mapping for paths the backfill hasn't reached yet.
// Honors feedback_no_frontend_synthesis — we don't guess PRIV_ESC vs PERSISTENCE
// from "admin"; we mark it UNKNOWN so the chip reads honestly.
const LEGACY_BUCKET_MAP: Record<string, ImpactBucket> = {
  read: "READ",
  write: "WRITE",
  delete: "DESTRUCTIVE",
  admin: "UNKNOWN",
  encrypt: "WRITE",
  corrupt: "DESTRUCTIVE",
  exfiltrate: "EXFIL",
  unauthorized_grant: "UNKNOWN",
}

function compileImpactBuckets(path: IdentityAttackPath): ImpactBucket[] {
  // Prefer backend-written field when present.
  const fromBackend = path.impact_buckets
  if (fromBackend && fromBackend.length > 0) {
    const valid = fromBackend.filter((b): b is ImpactBucket =>
      VALID_BUCKETS.has(b as ImpactBucket),
    )
    if (valid.length > 0) return valid
  }
  // Legacy fallback — conservative mapping; "admin" → UNKNOWN.
  const legacy = path.damage_types ?? []
  const mapped = new Set<ImpactBucket>()
  for (const d of legacy) {
    const bucket = LEGACY_BUCKET_MAP[d.toLowerCase()]
    if (bucket) mapped.add(bucket)
  }
  if (mapped.size === 0) return ["UNKNOWN"]
  return Array.from(mapped).sort()
}

function compileImpactHeadline(path: IdentityAttackPath): HeadlineTag | null {
  const fromBackend = path.impact_headline
  if (fromBackend && VALID_HEADLINES.has(fromBackend as HeadlineTag)) {
    return fromBackend as HeadlineTag
  }
  // Missing → unavailable. Never invent "CONFIGURED RISK".
  return null
}

function compileImpactConfidence(path: IdentityAttackPath): ImpactConfidence | null {
  const fromBackend = path.impact_confidence
  if (fromBackend === "HIGH" || fromBackend === "MEDIUM" || fromBackend === "LOW") {
    return fromBackend
  }
  // Missing → unavailable. Never invent "LOW".
  return null
}

function compileImpactReasons(path: IdentityAttackPath): ImpactReason[] {
  const raw = path.impact_reasons_json
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (r): r is ImpactReason =>
        r && typeof r === "object" &&
        typeof r.action === "string" &&
        VALID_BUCKETS.has(r.bucket) &&
        (r.confidence === "HIGH" || r.confidence === "MEDIUM" || r.confidence === "LOW"),
    )
  } catch {
    return []
  }
}

// =============================================================================
// Public compile — one path → one row.
// =============================================================================

export function compilePathListRow(
  path: IdentityAttackPath,
  jewel: CrownJewelSummary | null,
  /**
   * Backend category only (or UNKNOWN). Callers must not pass a
   * locally derived ATT&CK class — delete-not-fallback (#480 shape).
   */
  backendInitialAccessCategory?: InitialAccessCategory,
): PathListRow {
  return compileRow(path, jewel, backendInitialAccessCategory, resolvePathOrigin(path))
}

export type PathListExclusionReason = "identity_only"

export interface CompiledPathList {
  rows: PathListRow[]
  /** Paths withheld from the list, by reason — never silently dropped. The
   *  caller renders the count ("N identity-only exposures live in Exposure").
   *  Same vocabulary as fan-in-path-model.ts `identity_only`. */
  excludedByReason: Partial<Record<PathListExclusionReason, number>>
  excludedPathIds: string[]
}

/**
 * List-level compile. A path whose origin is an identity kind with no compute
 * foothold (server `OrphanRole`, or a legacy chain that opens on a role /
 * principal) is not a compute-led route: it is counted out here so the list
 * can say so, instead of rendering "S3Bucket → S3Bucket" from hop order.
 */
export function compilePathListRows(
  paths: readonly IdentityAttackPath[],
  jewel: CrownJewelSummary | null,
  backendInitialAccessCategoryFor?: (
    path: IdentityAttackPath,
  ) => InitialAccessCategory | undefined,
): CompiledPathList {
  const rows: PathListRow[] = []
  const excludedByReason: CompiledPathList["excludedByReason"] = {}
  const excludedPathIds: string[] = []
  for (const path of paths) {
    const origin = resolvePathOrigin(path)
    if (origin.identity_only) {
      excludedByReason.identity_only = (excludedByReason.identity_only ?? 0) + 1
      excludedPathIds.push(path.id)
      continue
    }
    rows.push(
      compileRow(path, jewel, backendInitialAccessCategoryFor?.(path), origin),
    )
  }
  return { rows, excludedByReason, excludedPathIds }
}

function compileRow(
  path: IdentityAttackPath,
  jewel: CrownJewelSummary | null,
  backendInitialAccessCategory: InitialAccessCategory | undefined,
  origin: PathOrigin,
): PathListRow {
  const target = compileTargetNode(path, jewel)
  const fromBackend = narrowCategory(path.initial_access?.category)
  const fromArg = narrowCategory(backendInitialAccessCategory)
  const zoom0 = compileZoom0Projection(path, jewel)
  const severityLabel = path.severity?.severity?.toUpperCase() ?? null
  const severityScore =
    typeof path.severity?.overall_score === "number" &&
    Number.isFinite(path.severity.overall_score)
      ? path.severity.overall_score
      : null
  return {
    id: path.id,
    source_label: compileSourceLabel(path, origin),
    identity_label: compileIdentityLabel(path),
    start_label:
      origin.name ??
      (origin.arn ? friendlyResourceName(null, origin.kind, origin.arn) : null) ??
      origin.node?.id ??
      null,
    target_label: target?.name ?? null,
    start_type: origin.kind,
    target_type: target?.type ?? jewel?.type ?? null,
    // Provenance: server fields verbatim (null = not sent), and whether any
    // consumer upstream or here had to reconstruct from hop order.
    source_kind: origin.server.kind,
    workload_arn: origin.server.arn,
    origin_inferred: origin.inferred || path.origin_inferred === true,
    crown_jewel_id: path.crown_jewel_id,
    severity_label: severityLabel === "UNKNOWN" ? null : severityLabel,
    severity_score: severityScore,
    observed_hits: compileObservedHits(path),
    hop_count:
      typeof path.hop_count === "number" && Number.isFinite(path.hop_count)
        ? path.hop_count
        : Array.isArray(path.nodes) && path.nodes.length > 0
          ? path.nodes.length
          : 0,
    has_observed_edge: compileHasObservedEdge(path),
    // Absent evidence_type stays null — never invent "configured".
    evidence_type: path.evidence_type ?? null,
    // Backend category only; never a FE-derived fallback class.
    initial_access_category: fromBackend ?? fromArg ?? "UNKNOWN",
    acquisition: path.acquisition ?? null,
    observed_e2e_class: compileObservedE2EClass(path),
    is_materialized_stale: path.materialized_stale === true,
    stale_reason: path.stale_reason ?? null,
    damage_summary: compileDamageSummary(path),
    top_fix_label: compileTopFixLabel(path),
    impact_buckets: compileImpactBuckets(path),
    impact_headline: compileImpactHeadline(path),
    impact_confidence: compileImpactConfidence(path),
    impact_reasons: compileImpactReasons(path),
    // Literal passthrough — no derivation. See #480: SERVE owns the verdict.
    path_state:
      typeof path.feasibility?.path_state === "string"
        ? path.feasibility.path_state
        : null,
    activity_state:
      typeof path.feasibility?.activity_state === "string"
        ? path.feasibility.activity_state
        : null,
    attacker_headline: zoom0.attacker_headline,
    layer_permissions: zoom0.layers.permissions,
    layer_network: zoom0.layers.network,
    layer_data: zoom0.layers.data,
    damage_verbs: zoom0.damage_verbs,
    excess_service_reach: zoom0.excess_service_reach,
    reachable_damage_bucket: zoom0.reachable_damage_bucket,
    reachable_damage_rank: zoom0.reachable_damage_rank,
    impact_tier: zoom0.impact_tier,
    origin_confidence_rank: zoom0.origin_confidence_rank,
    fix_ready: zoom0.fix_ready,
  }
}
