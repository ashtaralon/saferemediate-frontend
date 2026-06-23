// =============================================================================
// Path-shape classifier — the keystone for the per-path card narrative.
// Spec: cyntro_per-path-card_binding-spec.md §1 / §1.1.
// =============================================================================
//
// The narrative CANNOT be one template: the graph produces three structurally
// different paths, and a sentence true for one is false for another. Classify
// off the path's OWN STRUCTURE — never off a single `workload_kind` (an
// OrphanRole can be A, B, or C; an EC2 path can itself chain-assume).
//
//   Shape A — Compute-excess: "take over the workload → become its role →
//             over-broad access to the jewel."
//   Shape B — Assume-chain (identity-only): an identity with standing access
//             pivots via sts:AssumeRole to reach the jewel.
//   Shape C — Zero-excess reach: nothing to strip — the exposure IS the
//             standing reach itself.
//
// These are INDEPENDENT FLAGS, not a mutually-exclusive enum:
//   compute(y/n) × assume(y/n) × excess(empty/not).
// `kind` is the primary template to pick; the flags let the narrative compose
// honestly (a compute foothold that ALSO assumes renders both clauses).

import type {
  IdentityAttackPath,
  PathNodeDetail,
  PathEdgeDetail,
} from "@/components/identity-attack-paths/types"
import { isPrincipalNodeType } from "@/components/identity-attack-paths/types"

export type PathShapeKind = "A" | "B" | "C"

/** Excess-to-strip signal. UNKNOWN when no closure/excess data is available —
 * we never assume "empty" (that would falsely promote a path to Shape C). */
export type ExcessState = "present" | "empty" | "unknown"

export interface AssumeHopFacts {
  /** Friendly name of the role doing the assuming (assume edge SOURCE / entry). */
  entryRole: string
  /** Friendly name of the role being assumed (assume edge TARGET). */
  assumedRole: string
  /** Observed in CloudTrail (red) vs config-only permitted (amber). */
  observed: boolean
  /** Observed call count, when the edge carries it. */
  hitCount?: number
  /** Does the assumed role itself reach the crown jewel? On-spine vs lateral. */
  reachesJewel: boolean
}

export interface PathShape {
  /** Primary template to render. */
  kind: PathShapeKind
  /** A compute foothold (EC2 / Lambda / ECS …) is on the path. */
  hasCompute: boolean
  /** An sts:AssumeRole hop is on the path. */
  hasAssume: boolean
  /** Whether there is unused permission to strip. */
  excess: ExcessState
  /** Assume-hop detail when `hasAssume`; null otherwise. */
  assume: AssumeHopFacts | null
}

// Compute foothold node types. Deliberately broad: the discriminator is "is
// there a workload an attacker takes over," not an exhaustive service list.
const COMPUTE_TYPE_RE = /EC2Instance|Instance|Lambda|ECS|Fargate|Container|Workload/i

// Assume hop. TRUSTS is EXCLUDED — that's a resource-policy / cross-account
// hop, not an sts:AssumeRole (same exclusion the hero map applies, BE-9/BE-10).
const ASSUME_EDGE_RE = /ASSUME|STS/i
const ROLE_TYPE_RE = /IAMRole|STSSession|Role|User/i

function nodeById(
  path: IdentityAttackPath,
  id: string | null | undefined,
): PathNodeDetail | undefined {
  if (!id) return undefined
  return (path.nodes ?? []).find((n) => n.id === id || n.canonical_id === id)
}

function assumeEdge(path: IdentityAttackPath): PathEdgeDetail | undefined {
  return (path.edges ?? []).find((e) => ASSUME_EDGE_RE.test(e.type))
}

// Roles are often ingested with name = principal id ("AROA…"), the friendly
// name only in the ARN — prefer the `role/<name>` segment (BE-8). Never echo
// the AROA form.
export function friendlyRoleName(
  node: PathNodeDetail | undefined,
  fallback?: string | null,
): string {
  const m = node?.canonical_id
    ? /[:/]role\/([^/]+)$/.exec(String(node.canonical_id))
    : null
  if (m) return m[1]
  return node?.name ?? fallback ?? "—"
}

function findComputeFoothold(path: IdentityAttackPath): PathNodeDetail | undefined {
  return (path.nodes ?? []).find(
    (n) =>
      !isPrincipalNodeType(n.type) &&
      n.tier !== "crown_jewel" &&
      COMPUTE_TYPE_RE.test(n.type),
  )
}

function jewelNode(path: IdentityAttackPath): PathNodeDetail | undefined {
  const nodes = path.nodes ?? []
  return (
    nodes.find((n) => n.tier === "crown_jewel") ??
    nodes.find(
      (n) => n.id === path.crown_jewel_id || n.canonical_id === path.crown_jewel_id,
    ) ??
    nodes[nodes.length - 1]
  )
}

function describeAssumeHop(path: IdentityAttackPath): AssumeHopFacts | null {
  const edge = assumeEdge(path)
  if (!edge) return null
  const entry = nodeById(path, edge.source)
  const assumed = nodeById(path, edge.target)
  // The assumed role is the edge TARGET (BE-9). Reaches the jewel iff it has an
  // access edge to the crown jewel → on-spine lateral movement; else a branch.
  const jewel = jewelNode(path)
  const reachesJewel = (path.edges ?? []).some(
    (e) =>
      (e.source === assumed?.id || e.source === assumed?.canonical_id) &&
      (e.target === jewel?.id ||
        e.target === jewel?.canonical_id ||
        e.target === path.crown_jewel_id),
  )
  return {
    entryRole: friendlyRoleName(entry),
    assumedRole: friendlyRoleName(assumed),
    observed: edge.is_observed ?? false,
    hitCount: edge.hit_count,
    reachesJewel,
  }
}

/**
 * Classify a path's shape from its structure.
 *
 * @param path           the attack path (nodes + edges)
 * @param excessActions  authoritative "unused actions to strip" signal — in the
 *                       frontend this is the closure diff's removed_actions.
 *                       Omit (or pass undefined) when unavailable → excess is
 *                       reported UNKNOWN and never used to promote to Shape C.
 */
export function classifyPathShape(
  path: IdentityAttackPath,
  excessActions?: string[] | null,
): PathShape {
  const hasCompute = !!findComputeFoothold(path)
  const assume = describeAssumeHop(path)
  const hasAssume = !!assume

  const excess: ExcessState =
    excessActions == null ? "unknown" : excessActions.length > 0 ? "present" : "empty"

  // Spec §1.1 classification order:
  //   1. Shape B ⟺ an assume hop is present (may co-occur with A).
  //   2. Shape C ⟺ excess is empty AND no assume chain.
  //   3. Shape A otherwise.
  let kind: PathShapeKind
  if (hasAssume) {
    kind = "B"
  } else if (excess === "empty") {
    kind = "C"
  } else {
    kind = "A"
  }

  return { kind, hasCompute, hasAssume, excess, assume }
}

// Damage-verb phrasing (spec §3.2). Build the phrase by joining only the verbs
// present in `damage_types` — NEVER hardcode "delete." Live proof this matters:
// Shape-A saferemediate-logs = [delete,read,write]; Shape-B treasury→prod-data
// = [read,write] (no delete); pivot→analytics = [read] only.
const DAMAGE_VERB: Record<string, string> = {
  read: "read",
  write: "change / write",
  delete: "delete / wipe",
  admin: "take full control of",
  unauthorized_grant: "grant itself more access",
}

const DAMAGE_VERB_ORDER = ["admin", "delete", "write", "read", "unauthorized_grant"]

/** Read damage types off whichever field carries them on this path object. */
export function pathDamageTypes(path: IdentityAttackPath): string[] {
  const raw =
    path.damage_types ??
    path.materialized_path?.damage_types ??
    path.damage_capability?.materialized_damage_types ??
    []
  return raw.map((d) => String(d).toLowerCase())
}

/** "delete / wipe, change / write and read" — verbs from `damage_types` only. */
export function damageVerbPhrase(damageTypes: string[]): string {
  const present = new Set(damageTypes.map((d) => d.toLowerCase()))
  const verbs = DAMAGE_VERB_ORDER.filter((d) => present.has(d)).map((d) => DAMAGE_VERB[d])
  if (verbs.length === 0) return "access"
  if (verbs.length === 1) return verbs[0]
  return `${verbs.slice(0, -1).join(", ")} and ${verbs[verbs.length - 1]}`
}
