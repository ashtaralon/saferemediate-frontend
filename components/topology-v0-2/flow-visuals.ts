import type { IdentityLineKind, TrafficEdge, TrafficEdgeClass } from "./types"

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
  // An observed edge from the legacy behavioral graph — read, but not
  // generation-backed. The Network view draws these too (its
  // `legacy_unverified` traffic); same words, same dash, never moving.
  legacy_unverified: "#0E8B7A",
} as const

/**
 * Colour by KIND of access — the identity lens's answer to the Network view's
 * colour-by-class. Alon (2026-09-23): "if we present different
 * authentications, secrets and so on we should paint each one in a different
 * colour". Hue = what kind of access; dash + motion = which plane.
 */
export const IDENTITY_KIND_COLOR: Record<IdentityLineKind, string> = {
  // The Lambda lane's own indigo: a workload running as a role.
  runs_as: "#4338CA",
  // Violet: a trust statement — who may assume the role.
  may_assume: "#7C3AED",
  // Amber: a human identity (IAM user credential, SAML / OIDC).
  human: "#B45309",
  // IAM / KMS carmine: secrets and keys.
  secret_key: "#DD344C",
  // S3 green: data access.
  data: "#1E8E3E",
  // Slate: any other service reach.
  service: "#475569",
}

export const IDENTITY_KIND_LABEL: Record<IdentityLineKind, string> = {
  runs_as: "Runs as",
  may_assume: "May assume",
  human: "Human identity",
  secret_key: "Secrets & keys",
  data: "Data access",
  service: "Service reach",
}

export const IDENTITY_KIND_DETAIL: Record<IdentityLineKind, string> = {
  runs_as: "a workload running as a role — instance profile or execution role",
  may_assume: "a trust statement: an account, role or * that may assume the role",
  human: "a human identity — an IAM user credential or SAML / OIDC federation",
  secret_key: "Secrets Manager and KMS reach",
  data: "S3, DynamoDB and RDS reach",
  service: "reach into any other AWS service",
}

/** Every colour a marker may need on the identity lens, keyed for `flow-arrow-identity-<key>`. */
export const IDENTITY_MARKER_COLORS: Record<string, string> = {
  ...IDENTITY_PLANE_COLOR,
  ...IDENTITY_KIND_COLOR,
}

/**
 * The line's colour: the producer's verdict wins (a Deny is crimson, a
 * withheld decision grey, a name-only endpoint amber), else the KIND of
 * access, else — for a producer that carries no kind — the plane.
 */
export function identityLineColor(annotation: {
  plane: "configured" | "observed"
  certainty: "resolved" | "unresolved_endpoint"
  verdict?: "configured" | "observed" | "denied" | "unknown"
  kind?: IdentityLineKind
}): string {
  if (annotation.verdict === "denied") return IDENTITY_PLANE_COLOR.denied
  if (annotation.verdict === "unknown") return IDENTITY_PLANE_COLOR.unknown
  if (annotation.certainty === "unresolved_endpoint") return IDENTITY_PLANE_COLOR.unresolved_endpoint
  if (annotation.kind) return IDENTITY_KIND_COLOR[annotation.kind]
  return IDENTITY_PLANE_COLOR[annotation.plane]
}

/** The marker (arrowhead) key matching identityLineColor. */
export function identityMarkerKey(annotation: {
  plane: "configured" | "observed"
  certainty: "resolved" | "unresolved_endpoint"
  verdict?: "configured" | "observed" | "denied" | "unknown"
  kind?: IdentityLineKind
}): string {
  if (annotation.verdict === "denied") return "denied"
  if (annotation.verdict === "unknown") return "unknown"
  if (annotation.certainty === "unresolved_endpoint") return "unresolved_endpoint"
  if (annotation.kind) return annotation.kind
  return annotation.plane
}

export type IdentityStrokeKey = keyof typeof IDENTITY_PLANE_COLOR

/** Dash pattern per stroke key. Text + dash, never colour alone. */
export const IDENTITY_STROKE_DASH: Record<IdentityStrokeKey, string | undefined> = {
  configured: "5 4",
  observed: undefined,
  unresolved_endpoint: "1.5 4",
  denied: "8 3 2 3",
  unknown: "1 3",
  // The Network view's own dash for inferred / unverified traffic (7 5).
  legacy_unverified: "7 5",
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
  /** The edge's authority_state; `legacy_unverified` takes the legacy dash. */
  authority?: string | null
}): IdentityStrokeKey {
  if (annotation.verdict === "denied") return "denied"
  if (annotation.verdict === "unknown") return "unknown"
  if (annotation.certainty === "unresolved_endpoint") return "unresolved_endpoint"
  if (annotation.plane === "observed" && annotation.authority === "legacy_unverified") return "legacy_unverified"
  return annotation.plane
}

/** One swatch per kind of access — the colour row of the identity legend. */
export const IDENTITY_KIND_LEGEND_ITEMS: Array<{ kind: IdentityLineKind; label: string; detail: string; color: string }> =
  (Object.keys(IDENTITY_KIND_COLOR) as IdentityLineKind[]).map(kind => ({
    kind,
    label: IDENTITY_KIND_LABEL[kind],
    detail: IDENTITY_KIND_DETAIL[kind],
    color: IDENTITY_KIND_COLOR[kind],
  }))

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
  {
    key: "legacy_unverified",
    label: "Legacy · unverified",
    detail: "an observed access edge from the legacy behavioral graph — read, not generation-backed; the Network view draws it the same way; never moves",
    color: IDENTITY_PLANE_COLOR.legacy_unverified,
    dash: IDENTITY_STROKE_DASH.legacy_unverified,
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

