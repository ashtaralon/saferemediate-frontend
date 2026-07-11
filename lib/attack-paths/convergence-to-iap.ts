/**
 * Convert by-crown-jewel convergence paths → IdentityAttackPath stubs.
 *
 * When the full identity-attack-paths fan-out 502s / times out, the path
 * list still has to work. Materialized AttackPath rows from
 * /by-crown-jewel/summary are the fast SSOT — enough for triage + Zoom 0
 * + selecting a path id for the facade drill-in.
 */

import type {
  CrownJewelSummary,
  IdentityAttackPath,
  PathNodeDetail,
  SeverityBreakdown,
} from "@/components/identity-attack-paths/types"
import type { ConvergencePath } from "./convergence-types"

function severityStub(score: number, label: string | null | undefined): SeverityBreakdown {
  const sev = (label || "MEDIUM").toUpperCase()
  const severity =
    sev === "CRITICAL" || sev === "HIGH" || sev === "MEDIUM" || sev === "LOW"
      ? sev
      : score >= 80
        ? "CRITICAL"
        : score >= 60
          ? "HIGH"
          : score >= 40
            ? "MEDIUM"
            : "LOW"
  return {
    overall_score: score,
    severity,
    impact: 0,
    internet_exposure: 0,
    permission_breadth: 0,
    data_sensitivity: 0,
    identity_chain: 0,
    network_controls: 0,
    weights: {
      impact: 0,
      internet_exposure: 0,
      permission_breadth: 0,
      data_sensitivity: 0,
      identity_chain: 0,
      network_controls: 0,
    },
  }
}

function hopToNode(
  hop: NonNullable<ConvergencePath["hops"]>[number],
  index: number,
  total: number,
): PathNodeDetail {
  const isCj = hop.is_crown_jewel || index === total - 1
  return {
    id: hop.node_id,
    canonical_id: hop.node_id,
    name: hop.name || hop.node_id,
    type: hop.node_type || "Unknown",
    tier: isCj ? "crown_jewel" : index === 0 ? "entry" : "identity",
    lane: hop.plane === "data" ? "resource" : hop.plane === "identity" ? "identity" : "compute",
    is_internet_exposed: false,
    lp_score: null,
    gap_count: 0,
    subnet_is_public: hop.subnet_public ?? undefined,
  }
}

/** Build list-ready IAP paths from convergence summary (or detail). */
export function convergencePathsToIdentityAttackPaths(
  jewel: CrownJewelSummary,
  paths: ConvergencePath[],
): IdentityAttackPath[] {
  const cjId = jewel.canonical_id ?? jewel.id
  return paths.map((p) => {
    const hops = p.hops?.length
      ? p.hops
      : [
          {
            node_id: p.workload_arn || p.source || `entry-${p.path_id}`,
            name: p.source ?? "entry",
            node_type: p.source_kind || "Unknown",
            plane: "network",
            security_groups: [] as string[],
            is_crown_jewel: false,
          },
          ...(p.identity
            ? [
                {
                  node_id: p.identity,
                  name: p.identity_name ?? p.identity,
                  node_type: "IAMRole",
                  plane: "identity",
                  security_groups: [] as string[],
                  is_crown_jewel: false,
                },
              ]
            : []),
          {
            node_id: p.cj_target_id || cjId,
            name: jewel.name,
            node_type: jewel.type || "S3Bucket",
            plane: "data",
            security_groups: [] as string[],
            is_crown_jewel: true,
          },
        ]

    const nodes = hops.map((h, i) => hopToNode(h, i, hops.length))
    const edges = []
    for (let i = 0; i < hops.length - 1; i++) {
      edges.push({
        source: hops[i].node_id,
        target: hops[i + 1].node_id,
        type: hops[i + 1].edge_type_from_prev?.replace(/^~/, "") || "REACHES",
        label: hops[i + 1].edge_type_from_prev || undefined,
      })
    }

    const observed = (p.confidence || "").toLowerCase() === "observed"
    const score = typeof p.score === "number" ? p.score : 0

    return {
      id: p.path_id,
      attack_path_id: p.path_id,
      crown_jewel_id: cjId,
      nodes,
      edges,
      severity: severityStub(score, p.severity ?? null),
      path_kind: "materialized",
      evidence_type: observed ? "observed" : "configured",
      hop_count: p.hop_count || Math.max(0, hops.length - 1),
      damage_capability: {
        direct_actions: p.damage ?? [],
      },
      initial_access: p.initial_access?.[0]?.category
        ? { category: p.initial_access[0].category as never }
        : undefined,
    } as IdentityAttackPath
  })
}
