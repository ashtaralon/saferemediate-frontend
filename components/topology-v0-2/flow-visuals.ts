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
 * withheld decision grey), else the KIND of access, else — for a producer
 * that carries no kind — the plane, with a name-only endpoint amber.
 *
 * A name-only endpoint does NOT take the colour away from a kind: every
 * trust principal in another account is a name in a policy document and
 * never a projected resource, so on a real estate the entrance lines are
 * exactly the unresolved ones. Their certainty stays on the dash (1.5 4,
 * the legend's "Name only"); their hue stays "may assume" / "human".
 */
export function identityLineColor(annotation: {
  plane: "configured" | "observed"
  certainty: "resolved" | "unresolved_endpoint"
  verdict?: "configured" | "observed" | "denied" | "unknown"
  kind?: IdentityLineKind
}): string {
  if (annotation.verdict === "denied") return IDENTITY_PLANE_COLOR.denied
  if (annotation.verdict === "unknown") return IDENTITY_PLANE_COLOR.unknown
  if (annotation.kind) return IDENTITY_KIND_COLOR[annotation.kind]
  if (annotation.certainty === "unresolved_endpoint") return IDENTITY_PLANE_COLOR.unresolved_endpoint
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
  if (annotation.kind) return annotation.kind
  if (annotation.certainty === "unresolved_endpoint") return "unresolved_endpoint"
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
    detail: "dotted: the far end is a name in a policy document, not a projected resource (every outside principal is); the colour still says what kind of access it is",
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


// ───────────────────────────────────────────────────────────────────────────
// Data kind — what the traffic IS, for the Network view's lines and packets.
//
// Three channels, one fact each (Alon, 2026-09-28: "each color and shape of
// the line based on the data type"):
//   colour + line pattern + packet glyph  = the DATA KIND (redundant on
//                                           purpose: readable without colour)
//   packet fill and motion                = the EVIDENCE — filled packets for
//                                           generation-backed observations,
//                                           hollow slower packets for
//                                           historical observations, no
//                                           packets and a faint line for
//                                           configured / inferred paths.
// Motion therefore still never claims live traffic the evidence does not
// carry; only the dash stopped meaning "unverified" on the Network view.
// Identity lens is untouched: it keeps IDENTITY_STROKE_DASH.
// ───────────────────────────────────────────────────────────────────────────

export type FlowDataKind =
  | "request"
  | "database"
  | "object"
  | "secrets"
  | "event"
  | "aws_api"
  | "egress"

export interface FlowDataKindStyle {
  label: string
  detail: string
  color: string
  /** SVG stroke-dasharray at width 1; undefined = solid. */
  dash?: string
  width: number
  /** A white core drawn over the stroke — the "pipe" look for databases. */
  core?: boolean
  /** Packet glyph, drawn centred on 0,0, pointing +x, ~10px across. */
  glyph: string
}

export const FLOW_DATA_KIND_STYLE: Record<FlowDataKind, FlowDataKindStyle> = {
  request: {
    label: "Service request",
    detail: "HTTP / app calls between workloads and load balancers",
    color: "#0E8B7A",
    width: 1.6,
    glyph: "M 0 -4.5 A 4.5 4.5 0 1 1 0 4.5 A 4.5 4.5 0 1 1 0 -4.5 Z",
  },
  database: {
    label: "Database query",
    detail: "RDS, Aurora, Neptune, DocumentDB, ElastiCache, DynamoDB",
    color: "#2E73B8",
    width: 3,
    core: true,
    glyph: "M -4 -4 H 4 V 4 H -4 Z",
  },
  object: {
    label: "Object storage",
    detail: "S3 reads and writes",
    color: "#3F8624",
    dash: "10 4",
    width: 2,
    glyph: "M -4 -5 H 2 L 4.5 -2.5 V 5 H -4 Z",
  },
  secrets: {
    label: "Keys & secrets",
    detail: "KMS and Secrets Manager calls",
    color: "#C026D3",
    dash: "7 3 1.5 3",
    width: 1.8,
    glyph: "M 0 -5 L 5 0 L 0 5 L -5 0 Z",
  },
  event: {
    label: "Event / trigger",
    detail: "EventBridge, SQS, SNS, Step Functions invoking compute",
    color: "#E7157B",
    dash: "1.5 4",
    width: 2.2,
    glyph: "M -4 -5 L 5 0 L -4 5 L -1.5 0 Z",
  },
  aws_api: {
    label: "AWS API",
    detail: "Other AWS service APIs, directly or through a VPC endpoint",
    color: "#7E57C2",
    dash: "5 3",
    width: 1.6,
    glyph: "M -2.5 -4.3 H 2.5 L 5 0 L 2.5 4.3 H -2.5 L -5 0 Z",
  },
  egress: {
    label: "Internet egress",
    detail: "Leaves the VPC through NAT / IGW",
    color: "#F59E0B",
    dash: "12 3 2 3",
    width: 1.8,
    glyph: "M -5 -4.5 L 1 0 L -5 4.5 M -1 -4.5 L 5 0 L -1 4.5",
  },
}

export const FLOW_DATA_KIND_ORDER: readonly FlowDataKind[] = [
  "request",
  "database",
  "object",
  "secrets",
  "event",
  "aws_api",
  "egress",
]

const DB_PORTS = new Set([3306, 5432, 1433, 1521, 27017, 6379, 11211, 8182, 5439, 9042])
const S3_TYPE = /^s3|s3bucket|s3prefix/i
const SECRETS_TYPE = /kms|secret/i
const EVENT_TYPE = /eventbridge|eventrule|eventsource|eventbus|sqs|sns|stepfunction|statemachine|scheduledtask/i
const DB_TYPE = /rds|aurora|neptune|documentdb|docdb|dbinstance|dbcluster|redshift|elasticache|dynamo/i

/**
 * Classify one drawn line. Reads only the edge's own class / protocol / port
 * and the TYPES of its two endpoints as the payload names them; an endpoint
 * the payload gives no type falls back to the edge class, never a guess.
 */
export function flowDataKind(args: {
  cls: TrafficEdgeClass | string
  protocol?: string | null
  port?: number | null
  sourceType?: string | null
  targetType?: string | null
  targetId?: string | null
}): FlowDataKind {
  const { cls, protocol, port, sourceType, targetType, targetId } = args
  const tgt = targetType ?? ""
  const src = sourceType ?? ""
  const proto = (protocol ?? "").toUpperCase()
  if (cls === "egress" || targetId?.startsWith("extdst:") || targetId === "__igw__") return "egress"
  if (SECRETS_TYPE.test(tgt)) return "secrets"
  if (S3_TYPE.test(tgt) || targetId === "__aws_s3__" || proto.includes("S3")) return "object"
  if (EVENT_TYPE.test(src) || EVENT_TYPE.test(tgt) || proto === "TRIGGERS" || proto === "INVOKES") return "event"
  if (cls === "database" || DB_TYPE.test(tgt) || (port != null && DB_PORTS.has(port))) return "database"
  if (cls === "edge_service" || cls === "vpce" || targetId === "__aws_api__") return "aws_api"
  return "request"
}
