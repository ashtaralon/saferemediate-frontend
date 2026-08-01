/**
 * Convert by-crown-jewel convergence paths → IdentityAttackPath stubs.
 *
 * List/triage SSOT when the full identity-attack-paths fan-out is slow.
 * Backend hop DTOs and severity labels are authority — this transform
 * must not invent hops, score→severity bands, or edge types (e.g. REACHES).
 */

import type {
  CrownJewelSummary,
  IdentityAttackPath,
  MaterializedPathSummary,
  PathNodeDetail,
  SeverityBreakdown,
} from "@/components/identity-attack-paths/types"
import type { ConvergencePath } from "./convergence-types"

/**
 * Passthrough only. Never derive severity from score thresholds.
 * Missing/invalid label → UNKNOWN (unavailable), not MEDIUM/LOW from score.
 */
export function severityPassthrough(
  score: number | null | undefined,
  label: string | null | undefined,
): SeverityBreakdown {
  const sev = (label || "").toUpperCase()
  const severity =
    sev === "CRITICAL" || sev === "HIGH" || sev === "MEDIUM" || sev === "LOW"
      ? sev
      : "UNKNOWN"
  return {
    overall_score: typeof score === "number" && Number.isFinite(score) ? score : Number.NaN,
    severity,
    impact: Number.NaN,
    internet_exposure: Number.NaN,
    permission_breadth: Number.NaN,
    data_sensitivity: Number.NaN,
    identity_chain: Number.NaN,
    network_controls: Number.NaN,
    weights: {
      impact: Number.NaN,
      internet_exposure: Number.NaN,
      permission_breadth: Number.NaN,
      data_sensitivity: Number.NaN,
      identity_chain: Number.NaN,
      network_controls: Number.NaN,
    },
  }
}

function hopToNode(
  hop: NonNullable<ConvergencePath["hops"]>[number],
  index: number,
  total: number,
): PathNodeDetail {
  const isCj = hop.is_crown_jewel === true || index === total - 1
  // Only set lane when plane maps into PathNodeDetail's union — omit otherwise.
  // Never invent "resource" / "identity" (those are not valid lane values).
  let lane: PathNodeDetail["lane"] | undefined
  if (isCj || hop.plane === "data") lane = "crown_jewel"
  else if (hop.plane === "identity") lane = "iam"
  else if (hop.plane === "network" || hop.plane === "compute") lane = "compute"
  return {
    id: hop.node_id,
    canonical_id: hop.node_id,
    name: hop.name || hop.node_id,
    // Absent type stays empty — never invent "Unknown" as a typed fact.
    type: hop.node_type || "",
    tier: isCj ? "crown_jewel" : index === 0 ? "entry" : "identity",
    ...(lane ? { lane } : {}),
    // Omit is_internet_exposed / gap_count when unknown — never invent false/0.
    lp_score: null,
    subnet_is_public: hop.subnet_public ?? undefined,
  }
}

/**
 * Edge type when hop carries one. Missing type stays "" — never invent
 * "REACHES". Downstream containment maps REACHES → "inbound · public IP";
 * a fabricated REACHES would paint false public ingress.
 */
export function edgeTypeFromHop(
  hop: NonNullable<ConvergencePath["hops"]>[number] | undefined,
): string {
  const raw = hop?.edge_type_from_prev
  if (typeof raw !== "string" || !raw.trim()) return ""
  return raw.replace(/^~/, "").trim()
}

/** Build list-ready IAP paths from convergence summary (or detail). */
export function convergencePathsToIdentityAttackPaths(
  jewel: CrownJewelSummary,
  paths: ConvergencePath[],
): IdentityAttackPath[] {
  const cjId = jewel.canonical_id ?? jewel.id
  return paths.map((p) => {
    // Empty hops → empty nodes/edges. Never synthesize entry/role/CJ spine.
    const hops = Array.isArray(p.hops) && p.hops.length > 0 ? p.hops : []

    const nodes = hops.map((h, i) => hopToNode(h, i, hops.length))
    const edges: IdentityAttackPath["edges"] = []
    for (let i = 0; i < hops.length - 1; i++) {
      const type = edgeTypeFromHop(hops[i + 1])
      // label mirrors type when BE sent one; empty string when absent —
      // never invent REACHES (or any other type) into label.
      const evidence = String(hops[i + 1]?.edge_evidence || "").toLowerCase()
      edges.push({
        source: hops[i].node_id,
        target: hops[i + 1].node_id,
        type,
        label: type,
        port: null,
        protocol: null,
        // Set only when BE evidence is explicit — omit otherwise.
        ...(evidence === "observed"
          ? { is_observed: true as const }
          : evidence === "configured" || evidence === "config"
            ? { is_observed: false as const }
            : {}),
      })
    }

    const confidenceRaw = (p.confidence || "").toLowerCase()
    const observed = confidenceRaw === "observed"
    const score = typeof p.score === "number" && Number.isFinite(p.score) ? p.score : null
    const damageTypes = p.damage ?? []
    // Gates + damage MUST survive this whitelist (Zoom0 standing-access honesty).
    const pathStatus = normalizePathStatus(p.path_status)

    // evidence_type only when backend confidence is explicit.
    const evidence_type =
      confidenceRaw === "observed"
        ? ("observed" as const)
        : confidenceRaw === "configured"
          ? ("configured" as const)
          : undefined

    return {
      id: p.path_id,
      attack_path_id: p.path_id,
      crown_jewel_id: cjId,
      nodes,
      edges,
      severity: severityPassthrough(score, p.severity ?? p.severity_label ?? null),
      path_kind: "materialized",
      ...(evidence_type ? { evidence_type } : {}),
      hop_count:
        typeof p.hop_count === "number" && Number.isFinite(p.hop_count)
          ? p.hop_count
          : Math.max(0, hops.length > 0 ? hops.length - 1 : 0),
      damage_types: damageTypes,
      impact_headline: p.impact_headline ?? undefined,
      damage_capability: {
        direct_actions: damageTypes,
        materialized_damage_types: damageTypes,
        role_name: p.identity_name ?? undefined,
      },
      materialized_path: {
        id: p.path_id,
        path_status: pathStatus,
        damage_types: damageTypes,
        identity_gate: p.identity_gate ?? "UNKNOWN",
        route_gate: p.route_gate ?? "UNKNOWN",
        data_plane_gate: p.data_plane_gate ?? "UNKNOWN",
        role_name: p.identity_name ?? null,
        workload_name: p.source ?? null,
      },
      initial_access: p.initial_access?.[0]?.category
        ? { category: p.initial_access[0].category as never }
        : undefined,
      // ACQUISITION must be carried across the shape change (whitelist).
      acquisition: p.acquisition ?? null,
    } as IdentityAttackPath
  })
}

/**
 * Unknown/missing path_status → UNVERIFIED.
 * Never invent OBSERVED / POTENTIAL_EXCESS from a confidence boolean.
 */
export function normalizePathStatus(
  raw: string | null | undefined,
): MaterializedPathSummary["path_status"] {
  const s = (raw || "").toUpperCase()
  if (
    s === "OBSERVED" ||
    s === "POTENTIAL_EXCESS" ||
    s === "UNVERIFIED" ||
    s === "BLOCKED"
  ) {
    return s
  }
  return "UNVERIFIED"
}
