import type {
  CrownJewelSummary,
  IdentityAttackPath,
  PathNodeDetail,
} from "@/components/identity-attack-paths/types"
import type {
  ConvergenceHop,
  ConvergencePath,
  CrownJewelConvergence,
} from "./convergence-types"
import { pathClassification, type PathClassification } from "./path-evidence-view"

/**
 * IAP whole-path classification → the convergence `confidence` word.
 * `inferred` keeps the legacy "configured" word the convergence consumers
 * already read; unverified (unknown) and blocked keep their own words instead
 * of collapsing into "configured". `ConvergencePath.confidence` is a string.
 */
const CONFIDENCE_BY_CLASS: Readonly<Record<PathClassification, string>> = {
  observed: "observed",
  inferred: "configured",
  unknown: "unknown",
  blocked: "blocked",
}

function pickWorkload(nodes: PathNodeDetail[]): PathNodeDetail | undefined {
  return (
    nodes.find((n) => n.lane === "compute") ??
    nodes.find((n) => /ec2|lambda|ecs|fargate/i.test(n.type) && n.tier !== "crown_jewel") ??
    nodes.find((n) => n.tier === "entry" && !/iam/i.test(n.type))
  )
}

function pickRole(nodes: PathNodeDetail[]): PathNodeDetail | undefined {
  return nodes.find((n) => n.tier === "identity" || /iamrole|instanceprofile/i.test(n.type))
}

/** Build a convergence payload from IAP paths already on the page. */
export function iapPathsToConvergence(
  system: string,
  jewel: CrownJewelSummary,
  paths: IdentityAttackPath[],
): CrownJewelConvergence {
  const choke: Record<string, number> = {}
  let observed = 0
  const out: ConvergencePath[] = []

  for (const p of paths) {
    const classification = pathClassification(p)
    if (classification === "observed") observed += 1
    const nodes = p.nodes ?? []
    const workload = pickWorkload(nodes)
    const role = pickRole(nodes)
    const identity = role?.canonical_id ?? role?.id
    if (identity) choke[identity] = (choke[identity] ?? 0) + 1

    const hops: ConvergenceHop[] = []
    if (workload) {
      hops.push({
        node_id: workload.canonical_id ?? workload.id,
        name: workload.name,
        node_type: workload.type,
        plane: "network",
        subnet_public: workload.subnet_is_public,
        az: workload.load_balancer_targets?.[0]?.az ?? null,
        security_groups: [],
        is_crown_jewel: false,
      })
    }
    if (role) {
      hops.push({
        node_id: identity ?? role.id,
        name: role.name,
        node_type: "IAMRole",
        plane: "identity",
        security_groups: [],
        is_crown_jewel: false,
      })
    }
    hops.push({
      node_id: jewel.canonical_id ?? jewel.id,
      name: jewel.name,
      node_type: jewel.type,
      plane: "data",
      security_groups: [],
      is_crown_jewel: true,
    })

    out.push({
      path_id: p.attack_path_id ?? p.id,
      source: workload?.name ?? null,
      source_kind: workload?.type ?? null,
      identity: identity ?? null,
      identity_name: role?.name ?? null,
      // The server's damage words for this path: direct actions when it sent
      // them, else its damage_types — never an empty list the server did not say.
      damage:
        (p.damage_capability?.direct_actions?.length ? p.damage_capability.direct_actions : null) ??
        p.damage_types ??
        [],
      // Server gates, verbatim from the materialized :AttackPath summary.
      identity_gate: p.materialized_path?.identity_gate ?? null,
      route_gate: p.materialized_path?.route_gate ?? null,
      data_plane_gate: p.materialized_path?.data_plane_gate ?? null,
      path_status: p.materialized_path?.path_status ?? null,
      evidence: p.evidence_contract?.evidence ?? p.evidence_type ?? undefined,
      score: Math.round(p.severity?.overall_score ?? 0),
      severity: p.severity?.severity ?? null,
      confidence: CONFIDENCE_BY_CLASS[classification],
      hop_count: p.hop_count,
      routes_via: [],
      role_assumption_observed: classification === "observed",
      cj_target_id: jewel.canonical_id ?? jewel.id,
      hops,
      // Synthetic IAP spine — never authoritative for path-authority TFM.
      hops_load_state: "fallback",
    })
  }

  return {
    system,
    cj_arn: jewel.canonical_id ?? (jewel.id.startsWith("arn:") ? jewel.id : null),
    cj_name: jewel.name,
    cj_type: jewel.type,
    paths_total: out.length,
    observed_paths: observed,
    choke_points: Object.fromEntries(
      Object.entries(choke).sort((a, b) => b[1] - a[1]),
    ),
    paths: out,
  }
}

/** Map IAP ?path= URL ids to materialized convergence path ids. */
export function matchConvergencePathId(
  // Structural, not ConvergencePath[] — only .path_id is ever read, and
  // the lightweight /summary response (ConvergencePathSummary[], no
  // hops) needs to resolve ids too, before its detail fetch even runs.
  convergencePaths: { path_id: string }[],
  selectedPathId: string | null,
  iapPaths: IdentityAttackPath[],
): string | null {
  if (!selectedPathId) return null
  const ids = new Set(convergencePaths.map((p) => p.path_id))
  if (ids.has(selectedPathId)) return selectedPathId

  const iap = iapPaths.find(
    (p) => p.id === selectedPathId || p.attack_path_id === selectedPathId,
  )
  if (!iap) return null
  for (const candidate of [iap.attack_path_id, iap.id]) {
    if (candidate && ids.has(candidate)) return candidate
  }
  return null
}
