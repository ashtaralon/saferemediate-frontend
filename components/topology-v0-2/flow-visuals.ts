import type { TrafficEdge, TrafficEdgeClass } from "./types"

export const FLOW_COLOR_BY_CLASS: Record<TrafficEdgeClass, string> = {
  internal: "#0E8B7A",
  edge_service: "#7E57C2",
  vpce: "#3B82F6",
  egress: "#F59E0B",
  database: "#2E73B8",
}

export const FLOW_ALERT_COLOR = "#DC2626"

/**
 * Relationship names that are structural/configuration facts rather than
 * packet or runtime observations. These must never be animated merely because
 * an older backend happened to attach a `last_seen` timestamp to the edge.
 */
const CONFIGURED_FLOW_PROTOCOLS = new Set([
  "ACCESSES_RESOURCE",
  "ENCRYPTED_BY",
  "HAS_TARGET_GROUP",
  "LAUNCHES",
  "QUERIES_DB",
  "ROUTES_TO",
  "TARGETS",
  "TRIGGERS",
])

/** Runtime/telemetry relationships used by legacy topology-risk payloads. */
const OBSERVED_FLOW_PROTOCOLS = new Set([
  "ACTUAL_API_CALL",
  "ACTUAL_S3_ACCESS",
  "ACTUAL_TRAFFIC",
  "API_CALL",
  "CALLS",
  "OBSERVED_TRAFFIC",
  "READS_FROM",
  "RUNTIME_CALLS",
  "S3_OPERATION",
  "WRITES_TO",
])

type FlowAnimationEvidence = Pick<
  TrafficEdge,
  | "authority_state"
  | "edge_class"
  | "evidence_type"
  | "last_seen"
  | "path_basis"
  | "protocol"
>

/**
 * Decide whether an estate-map line represents traffic that should visibly
 * travel from source to target.
 *
 * New payloads use the full evidence contract. The compatibility branch is
 * intentionally used only when *all* evidence fields are absent: the C1
 * topology backend already returns real, provenance-gated ACTUAL_TRAFFIC but
 * predates those fields. Explicit inferred/legacy-unverified/configured rows
 * remain stationary.
 */
export function shouldAnimateTrafficFlow(edge: FlowAnimationEvidence): boolean {
  const hasEvidenceContract =
    edge.evidence_type != null ||
    edge.authority_state != null ||
    edge.path_basis != null

  if (hasEvidenceContract) {
    return (
      edge.evidence_type === "observed" &&
      edge.authority_state === "authoritative" &&
      (edge.path_basis === "observed_segment" || edge.path_basis === "correlated_trace")
    )
  }

  const protocol = String(edge.protocol ?? "").toUpperCase()
  if (CONFIGURED_FLOW_PROTOCOLS.has(protocol)) return false
  if (OBSERVED_FLOW_PROTOCOLS.has(protocol)) return true

  // ACTUAL_TRAFFIC commonly carries TCP/UDP in `protocol` on older payloads.
  // A timestamped network-class row is observed telemetry after the backend's
  // simulated-traffic provenance gate; structural protocols were denied above.
  return (
    edge.last_seen != null &&
    ["internal", "vpce", "egress", "database"].includes(edge.edge_class ?? "internal")
  )
}

export const FLOW_LEGEND_ITEMS: Array<{
  key: TrafficEdgeClass | "alert"
  label: string
  color: string
}> = [
  { key: "internal", label: "Service call", color: FLOW_COLOR_BY_CLASS.internal },
  { key: "edge_service", label: "AWS data service", color: FLOW_COLOR_BY_CLASS.edge_service },
  { key: "vpce", label: "VPC endpoint", color: FLOW_COLOR_BY_CLASS.vpce },
  { key: "egress", label: "Internet egress", color: FLOW_COLOR_BY_CLASS.egress },
  { key: "database", label: "Database", color: FLOW_COLOR_BY_CLASS.database },
  { key: "alert", label: "Exposure / attack", color: FLOW_ALERT_COLOR },
]

export function flowStroke(edge: Pick<TrafficEdge, "edge_class" | "flow_highlight" | "is_exposed">): string {
  if (edge.flow_highlight === "attack_path" || edge.is_exposed) return FLOW_ALERT_COLOR
  return FLOW_COLOR_BY_CLASS[edge.edge_class ?? "internal"]
}
