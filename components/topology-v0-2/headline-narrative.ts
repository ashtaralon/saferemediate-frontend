/**
 * Estate Map headline + ranked-rail copy — pure helpers over TopologyRiskResponse.
 * No fabricated numbers; reads only fields the risk contract already returns.
 */
import type {
  IamRoleRollup,
  SystemKpis,
  TopologyNode,
  TopologyRiskResponse,
} from "./types"

export interface HeadlineNarrative {
  title: string
  provenance: string
  spotlightNodeId: string | null
  spotlightRoleName: string | null
}

export type RankedEntry =
  | {
      kind: "workload"
      id: string
      name: string
      layer: "Network" | "Stale"
      reason: string
      meta: string
      rank: number
    }
  | {
      kind: "iam_role"
      id: string
      name: string
      layer: "IAM"
      reason: string
      meta: string
      rank: number
    }

const TIER_ORDER: Record<string, number> = {
  WORST: 0,
  HIGH: 1,
  ELEVATED: 2,
  QUIET: 3,
}

function exposureEvidence(node: TopologyNode): Record<string, unknown> {
  const c = node.score?.contributors?.find(x => x.signal === "network_exposure")
  return (c?.evidence as Record<string, unknown>) ?? {}
}

function internetEvidence(node: TopologyNode): Record<string, unknown> {
  const c = node.score?.contributors?.find(x => x.signal === "internet_dependency")
  return (c?.evidence as Record<string, unknown>) ?? {}
}

function workloadHeadline(node: TopologyNode): { title: string; reason: string; meta: string } {
  const net = exposureEvidence(node)
  const inet = internetEvidence(node)
  const exposure = String(net.exposure_state ?? net.posture_verdict ?? "elevated risk")
  const inbound = net.observed_inbound_from_public_365d
  const inboundSummary =
    inbound === false
      ? "zero public inbound in 365 days"
      : inbound === true
        ? "observed public inbound in 365 days"
        : "inbound exposure unverified"
  const egressDest = inet.distinct_destinations ?? inet.egress_destinations
  const egressPart =
    typeof egressDest === "number" && egressDest > 0
      ? ` while egressing to ${egressDest.toLocaleString()} destinations`
      : ""
  return {
    title: `${node.name} is ${exposure}${egressPart} — ${inboundSummary}`,
    reason: `${exposure} · ${inboundSummary}`,
    meta: node.score
      ? `score ${node.score.value} · ${node.score.tier}`
      : "unscored workload",
  }
}

function iamHeadline(role: IamRoleRollup, workloads: TopologyNode[]): { title: string; reason: string; meta: string } {
  const consumers = workloads
    .filter(w => role.workload_ids.includes(w.id))
    .map(w => w.name)
    .slice(0, 2)
  const consumerText = consumers.length > 0 ? consumers.join(", ") : "VPC-scoped attachment"
  if (role.correlation_state === "stale_rollup") {
    return {
      title: `${role.name} — behavioral rollup recomputing (usage edges present)`,
      reason: "scalar stale · edges prove usage",
      meta: `attached to ${consumerText}`,
    }
  }
  if (role.correlation_state === "not_correlated") {
    return {
      title: `${role.name} — not yet correlated`,
      reason: "behavioral join pending",
      meta: consumerText,
    }
  }
  const gap = role.gap_percentage ?? 0
  return {
    title: `${role.name} has ${role.unused_actions}/${role.allowed_actions} unused permissions (${Math.round(gap)}% gap) — attached to ${consumerText}`,
    reason: `${role.unused_actions}/${role.allowed_actions} unused · ${Math.round(gap)}% gap`,
    meta: role.last_remediated_at ? `remediated ${role.last_remediated_at.slice(0, 10)}` : "never remediated",
  }
}

export function buildHeadlineNarrative(data: TopologyRiskResponse): HeadlineNarrative {
  const nodes = (data.nodes ?? []).filter(n => !n.stale)
  const roles = data.vpc_topology?.iam_roles ?? []

  const scored = [...nodes]
    .filter(n => n.score?.rank != null)
    .sort((a, b) => (a.score!.rank! - b.score!.rank!))

  const worstWorkload = scored.find(n => n.score && TIER_ORDER[n.score.tier] <= 1)
  const correlatedRoles = roles
    .filter(r => r.correlation_state === "correlated" && r.gap_percentage != null)
    .sort((a, b) => (b.gap_percentage ?? 0) - (a.gap_percentage ?? 0))
  const worstRole = correlatedRoles[0]

  const useIam =
    !worstWorkload &&
    worstRole &&
    (worstRole.gap_percentage ?? 0) >= 50

  if (useIam && worstRole) {
    const h = iamHeadline(worstRole, nodes)
    return {
      title: h.title,
      provenance: buildProvenance(data.system_kpis, data.scored_at),
      spotlightNodeId: null,
      spotlightRoleName: worstRole.name,
    }
  }

  if (worstWorkload) {
    const h = workloadHeadline(worstWorkload)
    return {
      title: h.title,
      provenance: buildProvenance(data.system_kpis, data.scored_at),
      spotlightNodeId: worstWorkload.id,
      spotlightRoleName: null,
    }
  }

  if (worstRole) {
    const h = iamHeadline(worstRole, nodes)
    return {
      title: h.title,
      provenance: buildProvenance(data.system_kpis, data.scored_at),
      spotlightNodeId: null,
      spotlightRoleName: worstRole.name,
    }
  }

  return {
    title: `${data.system} · ${nodes.length} workloads in scope`,
    provenance: buildProvenance(data.system_kpis, data.scored_at),
    spotlightNodeId: null,
    spotlightRoleName: null,
  }
}

function buildProvenance(kpis: SystemKpis | null, scoredAt: string): string {
  const scoredIso = scoredAt ? new Date(scoredAt).toISOString().replace(/\.\d+Z$/, "Z") : "—"
  const flagged = kpis?.flagged_count ?? 0
  const fresh = kpis?.posture_freshness
  const freshPart = fresh?.is_fresh
    ? `posture fresh · threshold ${fresh.threshold_days}d`
    : fresh?.auto_resolves_when ?? "posture freshness degraded"
  return `scored ${scoredIso} · ${flagged} flagged · ${freshPart}`
}

export function buildRankedEntries(
  nodes: TopologyNode[],
  roles: IamRoleRollup[],
): RankedEntry[] {
  const active = nodes.filter(n => !n.stale)
  const workloadEntries: RankedEntry[] = active
    .filter(n => n.score?.rank != null)
    .sort((a, b) => (a.score!.rank! - b.score!.rank!))
    .slice(0, 6)
    .map(n => {
      const h = workloadHeadline(n)
      return {
        kind: "workload" as const,
        id: n.id,
        name: n.name,
        layer: "Network" as const,
        reason: h.reason,
        meta: h.meta,
        rank: n.score!.rank!,
      }
    })

  const staleEntries: RankedEntry[] = nodes
    .filter(n => n.stale)
    .slice(0, 2)
    .map(n => ({
      kind: "workload" as const,
      id: n.id,
      name: n.name,
      layer: "Stale" as const,
      reason: n.stale?.reason ?? "aws_exists = false",
      meta: "excluded from rank",
      rank: 900 + workloadEntries.length,
    }))

  const iamEntries: RankedEntry[] = roles
    .filter(r => r.correlation_state === "correlated" || r.correlation_state === "stale_rollup")
    .sort((a, b) => {
      if (a.correlation_state === "stale_rollup" && b.correlation_state !== "stale_rollup") return -1
      if (b.correlation_state === "stale_rollup" && a.correlation_state !== "stale_rollup") return 1
      return (b.gap_percentage ?? 0) - (a.gap_percentage ?? 0)
    })
    .slice(0, 4)
    .map((r, i) => {
      const h = iamHeadline(r, active)
      return {
        kind: "iam_role" as const,
        id: `iam:${r.name}`,
        name: r.name,
        layer: "IAM" as const,
        reason: h.reason,
        meta: h.meta,
        rank: 100 + i,
      }
    })

  const merged = [...workloadEntries, ...iamEntries, ...staleEntries]
  merged.sort((a, b) => {
    const tierA = a.kind === "workload" && a.layer === "Network" ? a.rank : a.rank + 50
    const tierB = b.kind === "workload" && b.layer === "Network" ? b.rank : b.rank + 50
    return tierA - tierB
  })
  return merged.slice(0, 8)
}
