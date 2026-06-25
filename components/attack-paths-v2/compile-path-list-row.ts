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
  buildEffectiveDamageMatrix,
  matrixToSummary,
} from "./effective-damage-matrix"
import type {
  InitialAccessCategoryLite,
  PathListRow,
  PathObservedE2EClass,
} from "./attack-path-report-types"

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
// Source / identity / target resolution — the BE-10 rules from
// path-damage-summary.ts, hoisted into the compiler so renderers stop
// re-running them per row.
// =============================================================================

/** BE-10 (sibling to BE-9): when the path opens with an assume hop, the
 *  entry is the role doing the assuming (assume-edge source) — NOT
 *  whichever role sits at nodes[0]. Otherwise pick the first non-principal
 *  node (the operator-meaningful workload). */
function compileSourceLabel(path: IdentityAttackPath): string {
  const entry = nodeById(path, assumeEdgeOf(path)?.source)
  if (entry) return entry.name
  const workload = (path.nodes ?? []).find((n) => !isPrincipalNodeType(n.type))
  return workload?.name ?? path.nodes?.[0]?.name ?? "—"
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
  if (reacher && /IAMRole/i.test(reacher.type)) return reacher.name
  const role = (path.nodes ?? []).find((n) => n.type === "IAMRole")
  return role?.name ?? path.damage_capability?.role_name ?? "—"
}

/** Operator-meaningful "start" — first non-principal node (widened via
 *  isPrincipalNodeType so STS sessions / AWSPrincipal entries are
 *  skipped). Falls back to nodes[0]. Used for the "start → target" line. */
function compileStartNode(path: IdentityAttackPath): PathNodeDetail | null {
  const start = (path.nodes ?? []).find((n) => !isPrincipalNodeType(n.type))
  return start ?? path.nodes?.[0] ?? null
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
// Public compile — one path → one row.
// =============================================================================

export function compilePathListRow(
  path: IdentityAttackPath,
  jewel: CrownJewelSummary | null,
  /** Optional fallback when the backend hasn't classified initial-access
   *  yet (`path.initial_access` absent). The list component computes its
   *  legacy inline category and passes it in; we narrow + use. */
  fallbackInitialAccessCategory?: InitialAccessCategory,
): PathListRow {
  const start = compileStartNode(path)
  const target = compileTargetNode(path, jewel)
  const fromBackend = narrowCategory(path.initial_access?.category)
  const fromFallback = narrowCategory(fallbackInitialAccessCategory)
  return {
    id: path.id,
    source_label: compileSourceLabel(path),
    identity_label: compileIdentityLabel(path),
    start_label: start?.name ?? start?.id ?? null,
    target_label: target?.name ?? null,
    crown_jewel_id: path.crown_jewel_id,
    severity_label: path.severity?.severity?.toUpperCase() ?? null,
    severity_score: path.severity?.overall_score ?? null,
    observed_hits: compileObservedHits(path),
    hop_count: path.hop_count ?? path.nodes?.length ?? 0,
    has_observed_edge: compileHasObservedEdge(path),
    evidence_type: path.evidence_type ?? "configured",
    initial_access_category: fromBackend ?? fromFallback ?? "UNKNOWN",
    observed_e2e_class: compileObservedE2EClass(path),
    is_materialized_stale: path.materialized_stale === true,
    stale_reason: path.stale_reason ?? null,
    damage_summary: compileDamageSummary(path),
    top_fix_label: compileTopFixLabel(path),
  }
}
