/**
 * Estate Map headline + ranked-rail copy — pure helpers over TopologyRiskResponse.
 * No fabricated numbers; reads only fields the risk contract already returns.
 *
 * An identity claim in the headline comes only from the Identity & access
 * authority (`resolveIdentityClaimAuthority`), the same resolution the panel
 * renders. The legacy `vpc_topology.iam_roles` counters never produce one.
 */
import {
  formatObservationClaim,
  identityUnavailableNote,
  isMaterialObservation,
  notObservedRatio,
  type IdentityClaimAuthority,
  type IdentityRoleObservation,
} from "./identity-claim-authority"
import type {
  SystemKpis,
  TopologyNode,
  TopologyRiskResponse,
} from "./types"

export interface HeadlineNarrative {
  title: string
  provenance: string
  spotlightNodeId: string | null
  spotlightRoleName: string | null
  /** Why no identity claim can be made, when the identity authority is unavailable. */
  identityNote: string | null
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
  const hasEgress = typeof egressDest === "number" && egressDest > 0
  const unusedEgress = inet.unused_internet_egress === true
  const recommendVpce = Array.isArray(inet.recommend_vpce) ? inet.recommend_vpce : []
  const egressClause = unusedEgress
    ? "Has internet egress capability but no observed external traffic in the window — recommend remove/tighten to shrink exfil surface."
    : hasEgress
      ? `Observed egress to ${Number(egressDest).toLocaleString()} external destinations (365d).`
      : ""
  const vpceClause =
    recommendVpce.length > 0
      ? ` AWS via public path (${recommendVpce.slice(0, 4).join(", ")}${recommendVpce.length > 4 ? "…" : ""}) — prefer VPCE.`
      : ""
  const pathSuffix = `${egressClause}${vpceClause}`.trim()

  // LATENT_EXPOSURE = inbound path open but unused. Do not glue that to
  // egress counts with "while …" — they are orthogonal signals and the
  // combined sentence reads like a contradiction on the estate map.
  if (exposure === "LATENT_EXPOSURE") {
    const title = pathSuffix
      ? `${node.name} is LATENT_EXPOSURE — inbound path open, unused (${inboundSummary}). ${pathSuffix}`
      : `${node.name} is LATENT_EXPOSURE — inbound path open, unused (${inboundSummary})`
    return {
      title,
      reason: `LATENT_EXPOSURE · ${inboundSummary}`,
      meta: node.score
        ? `score ${node.score.value} · ${node.score.tier}`
        : "unscored workload",
    }
  }

  const egressPart = hasEgress
    ? ` while egressing to ${Number(egressDest).toLocaleString()} external destinations (365d)`
    : unusedEgress
      ? " with unused internet egress capability"
      : ""
  const vpcePart =
    recommendVpce.length > 0
      ? ` — AWS via public path (${recommendVpce.slice(0, 4).join(", ")}${recommendVpce.length > 4 ? "…" : ""}); prefer VPCE`
      : ""
  return {
    title: `${node.name} is ${exposure}${egressPart}${vpcePart} — ${inboundSummary}`,
    reason: `${exposure} · ${inboundSummary}`,
    meta: node.score
      ? `score ${node.score.value} · ${node.score.tier}`
      : "unscored workload",
  }
}

function identityHeadline(observation: IdentityRoleObservation, workloads: TopologyNode[]): string {
  const consumers = workloads
    .filter(w => observation.workloadIds.includes(w.id))
    .map(w => w.name)
    .slice(0, 2)
  const consumerText = consumers.length > 0 ? consumers.join(", ") : "no exact workload attachment returned"
  return `${observation.name} has ${formatObservationClaim(observation)} (complete coverage) — attached to ${consumerText}`
}

export function buildHeadlineNarrative(
  data: TopologyRiskResponse,
  identity: IdentityClaimAuthority,
): HeadlineNarrative {
  const nodes = (data.nodes ?? []).filter(n => !n.stale)
  const provenance = buildProvenance(data.system_kpis, data.scored_at)
  const identityNote = identityUnavailableNote(identity)

  const scored = [...nodes]
    .filter(n => n.score?.rank != null)
    .sort((a, b) => (a.score!.rank! - b.score!.rank!))

  const worstWorkload = scored.find(n => n.score && TIER_ORDER[n.score.tier] <= 1)
  const worstObservation = identity.state === "ready"
    ? [...identity.observations].sort((a, b) => notObservedRatio(b) - notObservedRatio(a))[0]
    : undefined

  if (!worstWorkload && worstObservation && isMaterialObservation(worstObservation)) {
    return {
      title: identityHeadline(worstObservation, nodes),
      provenance,
      spotlightNodeId: null,
      spotlightRoleName: worstObservation.name,
      identityNote,
    }
  }

  if (worstWorkload) {
    const h = workloadHeadline(worstWorkload)
    return {
      title: h.title,
      provenance,
      spotlightNodeId: worstWorkload.id,
      spotlightRoleName: null,
      identityNote,
    }
  }

  return {
    title: `${data.system} · ${nodes.length} workloads in scope`,
    provenance,
    spotlightNodeId: null,
    spotlightRoleName: null,
    identityNote,
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
