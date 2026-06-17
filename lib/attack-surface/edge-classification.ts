/** Maps Neo4j / Canvas relationship types to Attack Surface edge animation styles. */

export type SurfaceFlowKind = "network" | "identity" | "exfil"

const NETWORK_RELS = new Set([
  "IN_SUBNET",
  "ROUTES_TO",
  "ROUTES_VIA",
  "TRAFFIC_ALLOWED_BY",
  "SECURED_BY",
  "ASSOCIATED_WITH",
  "ACTUAL_TRAFFIC",
  "HAS_NETWORK_INTERFACE",
  "IN_VPC",
  "RUNS_IN_VPC",
  "BELONGS_TO",
  "USES_SECURITY_GROUP",
  "PROTECTED_BY",
])

const IDENTITY_RELS = new Set([
  "ASSUMES_ROLE",
  "ASSUMES_ROLE_ACTUAL",
  "HAS_POLICY",
  "HAS_INSTANCE_PROFILE",
  "USES_ROLE",
  "HAS_PROFILE",
  "PRIVILEGE_ESCALATION_VIA",
  "ACCESSES_ENDPOINT",
])

const EXFIL_RELS = new Set([
  "EXFIL_VIA_SHARING",
  "UNAUTHORIZED_COPY",
  "DATA_LEAK",
])

const DATA_TO_JEWEL_RELS = new Set([
  "ACCESSES_RESOURCE",
  "ACTUAL_S3_ACCESS",
  "READS_FROM",
  "WRITES_TO",
  "ACCESSES",
])

export function classifySurfaceEdge(
  relationship: string,
  opts?: { targetIsJewel?: boolean; observed?: boolean | null },
): SurfaceFlowKind {
  const r = relationship.toUpperCase()

  if (
    EXFIL_RELS.has(r) ||
    r.includes("EXFIL") ||
    r.includes("DATA_LEAK") ||
    r.includes("UNAUTHORIZED_COPY")
  ) {
    return "exfil"
  }

  if (
    IDENTITY_RELS.has(r) ||
    r.includes("PRIVILEGE_ESCALATION") ||
    r.includes("ASSUME") ||
    r === "ACTUAL_API_CALL"
  ) {
    return "identity"
  }

  if (opts?.targetIsJewel && DATA_TO_JEWEL_RELS.has(r)) {
    return opts.observed === true ? "exfil" : "identity"
  }

  if (NETWORK_RELS.has(r)) return "network"

  return "network"
}

export const SURFACE_EDGE_COLORS: Record<SurfaceFlowKind, string> = {
  network: "#48CAE4",
  identity: "#FF9F1C",
  exfil: "#FF4D6D",
}
