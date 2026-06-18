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
    if (p.evidence_type === "observed") observed += 1
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
      damage: p.damage_capability?.direct_actions ?? [],
      score: Math.round(p.severity?.overall_score ?? 0),
      severity: p.severity?.severity ?? null,
      confidence: p.evidence_type === "observed" ? "observed" : "configured",
      hop_count: p.hop_count,
      routes_via: [],
      role_assumption_observed: p.evidence_type === "observed",
      cj_target_id: jewel.canonical_id ?? jewel.id,
      hops,
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
  convergencePaths: ConvergencePath[],
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
