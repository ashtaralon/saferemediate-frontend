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
import type { ConvergenceHop, ConvergencePath } from "./convergence-types"
import { findServerOriginMatch, serverOriginOf } from "./server-origin"

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

/** Server-anchored tier facts for one hop chain (AP3-001-FE). */
interface TierAnchors {
  /** Index of the hop tied to the server workload identity
   *  (workload_arn / workload_name — see server-origin.ts), or null. */
  entryIndex: number | null
  /** true when the chain carries the server's is_crown_jewel flag
   *  (build_full_hops stamps it on every hop); false only on legacy
   *  payloads that omit the field entirely. */
  cjAuthoritative: boolean
}

/** Entry anchor by IDENTITY, never position: exact node_id, ARN tail, EC2
 *  instance id, then the server workload name. Crown-jewel hops are masked
 *  so a same-named jewel can never be tagged as the entry. */
function serverEntryHopIndex(
  p: ConvergencePath,
  hops: ConvergenceHop[],
): number | null {
  const idx = findServerOriginMatch(
    hops,
    (h) =>
      h.is_crown_jewel === true
        ? { ids: [] }
        : { ids: [h.node_id], name: h.name },
    serverOriginOf(p),
  )
  return idx >= 0 ? idx : null
}

/**
 * Tier tagging prefers what the server said: `is_crown_jewel` for the jewel,
 * the workload-identity anchor for the entry. Position (last hop / hop 0) is
 * used ONLY when that server field is absent, and the fallback is reported
 * so the path can carry `origin_inferred: true` — a reconstruction is never
 * presented as a server fact.
 */
function hopToNode(
  hop: ConvergenceHop,
  index: number,
  total: number,
  anchors: TierAnchors,
): { node: PathNodeDetail; inferred: boolean } {
  let inferred = false
  let isCj: boolean
  if (anchors.cjAuthoritative) {
    isCj = hop.is_crown_jewel === true
  } else {
    isCj = index === total - 1
    inferred = true
  }
  let isEntry = false
  if (!isCj) {
    if (anchors.entryIndex != null) {
      isEntry = index === anchors.entryIndex
    } else if (index === 0) {
      isEntry = true
      inferred = true
    }
  }
  // Only set lane when plane maps into PathNodeDetail's union — omit otherwise.
  // Never invent "resource" / "identity" (those are not valid lane values).
  let lane: PathNodeDetail["lane"] | undefined
  if (isCj || hop.plane === "data") lane = "crown_jewel"
  else if (hop.plane === "identity") lane = "iam"
  else if (hop.plane === "network" || hop.plane === "compute") lane = "compute"
  return {
    node: {
      id: hop.node_id,
      canonical_id: hop.node_id,
      name: hop.name || hop.node_id,
      // Absent type stays empty — never invent "Unknown" as a typed fact.
      type: hop.node_type || "",
      tier: isCj ? "crown_jewel" : isEntry ? "entry" : "identity",
      ...(lane ? { lane } : {}),
      // Omit is_internet_exposed / gap_count when unknown — never invent false/0.
      lp_score: null,
      subnet_is_public: hop.subnet_public ?? undefined,
    },
    inferred,
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

    const anchors: TierAnchors = {
      entryIndex: serverEntryHopIndex(p, hops),
      cjAuthoritative: hops.some((h) => typeof h.is_crown_jewel === "boolean"),
    }
    let originInferred = false
    const nodes = hops.map((h, i) => {
      const { node, inferred } = hopToNode(h, i, hops.length, anchors)
      if (inferred) originInferred = true
      return node
    })
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
      // ---- Server-authored origin + verdicts: PASSTHROUGH, never derived ----
      // This literal is a whitelist (see convergence-to-iap-acquisition.test):
      // a field not named here is silently dropped, and every consumer then
      // reconstructs meaning from hop order. Absent stays null / omitted —
      // never a client default.
      source_kind: p.source_kind ?? null,
      workload_arn: p.workload_arn ?? null,
      cj_target_id: p.cj_target_id ?? null,
      route_verdict: p.route_verdict ?? null,
      workload_network: p.workload_network ?? null,
      authz_decision: p.authz_decision ?? null,
      authz_technique_id: p.authz_technique_id ?? null,
      authz_verdict: p.authz_verdict ?? null,
      ...(Array.isArray(p.path_bound_observations)
        ? { path_bound_observations: p.path_bound_observations }
        : {}),
      live_traffic_promoted:
        typeof p.live_traffic_promoted === "boolean"
          ? p.live_traffic_promoted
          : null,
      feasibility: p.feasibility ?? null,
      // Set ONLY when tier tagging had to fall back to hop position above.
      ...(originInferred ? { origin_inferred: true } : {}),
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
