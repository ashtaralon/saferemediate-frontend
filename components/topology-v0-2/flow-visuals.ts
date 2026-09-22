import type { TrafficEdge, TrafficEdgeClass } from "./types"

export const FLOW_COLOR_BY_CLASS: Record<TrafficEdgeClass, string> = {
  internal: "#0E8B7A",
  edge_service: "#7E57C2",
  vpce: "#3B82F6",
  egress: "#F59E0B",
  database: "#2E73B8",
  // Identity & access lens (CF01 · D1). The IAM control-plane carmine the
  // frame already uses for IAM; the lens recolours by PLANE below, this is
  // only the class default and the arrowhead.
  identity: "#B42318",
}

export const FLOW_ALERT_COLOR = "#DC2626"

/**
 * Identity lens strokes by evidence plane and endpoint certainty. Configured
 * is a fact about policy (slate, dashed, still); observed is evidence that was
 * read (teal, solid, may move only when generation-backed); an unresolved
 * endpoint is drawn to a name, not a resource (amber, dotted, still).
 */
export const IDENTITY_PLANE_COLOR = {
  configured: "#475569",
  observed: "#0E8B7A",
  unresolved_endpoint: "#B45309",
  // The producer's own Deny effect on a trust statement. Not an alert red:
  // a Deny is configured state, and the alert red is the attack-path colour.
  denied: "#9F1239",
  // A decision the producer withheld. Not zero, not allowed, not denied.
  unknown: "#94A3B8",
} as const

export type IdentityStrokeKey = keyof typeof IDENTITY_PLANE_COLOR

/** Dash pattern per stroke key. Text + dash, never colour alone. */
export const IDENTITY_STROKE_DASH: Record<IdentityStrokeKey, string | undefined> = {
  configured: "5 4",
  observed: undefined,
  unresolved_endpoint: "1.5 4",
  denied: "8 3 2 3",
  unknown: "1 3",
}

/**
 * Which stroke a line takes, from the producer's verdict and endpoint
 * certainty. A Deny wins over everything (an unresolved far end on a Deny is
 * still a Deny); a withheld decision is "unknown"; an unresolved endpoint on
 * a configured/observed line is the derived dotted stroke; else the plane.
 */
export function identityStrokeKey(annotation: {
  plane: "configured" | "observed"
  certainty: "resolved" | "unresolved_endpoint"
  verdict?: "configured" | "observed" | "denied" | "unknown"
}): IdentityStrokeKey {
  if (annotation.verdict === "denied") return "denied"
  if (annotation.verdict === "unknown") return "unknown"
  if (annotation.certainty === "unresolved_endpoint") return "unresolved_endpoint"
  return annotation.plane
}

export const IDENTITY_LEGEND_ITEMS: Array<{
  key: IdentityStrokeKey
  label: string
  detail: string
  color: string
  dash: string | undefined
}> = [
  {
    key: "configured",
    label: "Configured",
    detail: "a policy, binding or trust fact from the canonical generation — never observed, never moves",
    color: IDENTITY_PLANE_COLOR.configured,
    dash: IDENTITY_STROKE_DASH.configured,
  },
  {
    key: "observed",
    label: "Observed",
    detail: "evidence that was read (last used / decided); moves only when a named generation stands behind it",
    color: IDENTITY_PLANE_COLOR.observed,
    dash: IDENTITY_STROKE_DASH.observed,
  },
  {
    key: "denied",
    label: "Denied",
    detail: "the producer's own Deny effect on a trust statement — configured state that forbids, never an evaluated verdict",
    color: IDENTITY_PLANE_COLOR.denied,
    dash: IDENTITY_STROKE_DASH.denied,
  },
  {
    key: "unknown",
    label: "Unknown",
    detail: "the producer withheld this reading (a decision not read) — not zero, not allowed, not denied",
    color: IDENTITY_PLANE_COLOR.unknown,
    dash: IDENTITY_STROKE_DASH.unknown,
  },
  {
    key: "unresolved_endpoint",
    label: "Name only",
    detail: "the producer derived this edge from a principal attribute and the far end is a name, not a projected resource",
    color: IDENTITY_PLANE_COLOR.unresolved_endpoint,
    dash: IDENTITY_STROKE_DASH.unresolved_endpoint,
  },
]

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

