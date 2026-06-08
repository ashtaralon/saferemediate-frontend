/**
 * Exfil archetype taxonomy.
 *
 * The Exfil View answers "if bytes are read from this Crown Jewel,
 * where can they go?" — a data-flow question, not a permission-
 * reachability one (that's the Attacker View).
 *
 * Each ExfilArchetype is a CHAIN TEMPLATE — a fixed shape of
 * (READER → HANDLER → EGRESS GATE → DESTINATION). Backend will
 * classify each ExfilPath instance into exactly one archetype.
 *
 * Frontend uses the static catalog (ARCHETYPE_CATALOG) to render:
 *   - the right-panel trust story per archetype
 *   - the closure action per archetype (Cyntro's "what we will close")
 *   - the default gate strength when the backend hasn't scored one
 *   - the "not collected yet" empty state for archetypes whose graph
 *     edges aren't in the current collector roadmap
 *
 * Design memo: 2026-05-25 exfil-map planning session with Alon.
 * Backend split: backend classifies instances (which archetypes exist
 * right now in this payload); frontend owns the static catalog of
 * which archetypes COULD exist + their per-archetype copy.
 */

// ─── Archetype enum (8 canonical templates) ──────────────────────

export type ExfilArchetype =
  | "serverless_direct"
  | "serverless_vpce"
  | "ec2_via_nat"
  | "ec2_public_subnet"
  | "replication_crr"
  | "share_snapshot"
  | "notification_pubsub"
  | "logging_subscription"

// ─── Gate strength (categorical for UI, numeric for sort) ────────

export type GateStrength = "strong" | "weak_observable" | "weak_unobservable"

// ─── Bytes source per archetype ──────────────────────────────────
// "Bytes-out" on an arc means a different thing per archetype.
// Surfaced in the detail card so the analyst knows where the volume
// number came from (or why it's missing).
export type BytesSource =
  | "vpc_flow_logs"
  | "lambda_insights"
  | "s3_replication_metrics"
  | "snapshot_describe"
  | "sns_ses_metrics"
  | "cw_logs_metrics"

export const BYTES_SOURCE_LABEL: Record<BytesSource, string> = {
  vpc_flow_logs: "VPC Flow Logs (ENI bytes-out)",
  lambda_insights: "Lambda Insights (HTTPS call bytes — not natively available)",
  s3_replication_metrics: "S3 Replication metrics (bytes per rule per period)",
  snapshot_describe: "EBS/RDS snapshot describe (size at last share event)",
  sns_ses_metrics: "SNS/SES (sum of message body sizes)",
  cw_logs_metrics: "CloudWatch Logs (subscribed log volume)",
}

// ─── Per-archetype catalog entry ─────────────────────────────────

export interface ExfilArchetypeSpec {
  id: ExfilArchetype
  /** Compact card label — appears in selector + grid + canvas chip. */
  label: string
  /** One-liner that describes the chain shape in operator language. */
  chainShape: string
  /** Right-panel trust story. "Why this path matters." */
  trustStory: string
  /** Right-panel closure action. "How Cyntro will narrow this path." */
  closureAction: string
  /** Default gate strength when backend hasn't scored an instance. */
  defaultGateStrength: GateStrength
  /** Whether the chain has a workload between reader + gate. CRR,
   *  snapshot share, log subscription paths render the HANDLER lane
   *  as a dashed-through "no compute touches the data" cell — that
   *  visual is the differentiator that says "this path bypasses
   *  every workload-level control". */
  hasHandler: boolean
  /** Where the volume number on the arc comes from. */
  bytesSource: BytesSource
  /** Whether the underlying graph edges exist today. */
  collectorStatus: "active" | "not_collected_yet"
  /** Sprint/owner hint when collectorStatus === "not_collected_yet". */
  collectorBacklog?: string
}

// ─── The canonical catalog ───────────────────────────────────────

export const ARCHETYPE_CATALOG: Record<ExfilArchetype, ExfilArchetypeSpec> = {
  serverless_direct: {
    id: "serverless_direct",
    label: "Serverless · Direct",
    chainShape: "Lambda role → Lambda → AWS service plane → public AWS API",
    trustStory:
      "IAM is the only gate. Compromising the Lambda role grants full read of the crown jewel via the AWS service plane. No VPC, subnet, security group or NACL applies because the workload is not VPC-attached.",
    closureAction:
      "Scope the Lambda role's resource ARN to the specific crown jewel and remove unused actions. Add a VPC Endpoint with a scoped policy if the service supports it.",
    defaultGateStrength: "weak_unobservable",
    hasHandler: true,
    bytesSource: "lambda_insights",
    collectorStatus: "active",
  },
  serverless_vpce: {
    id: "serverless_vpce",
    label: "Serverless · VPC Endpoint",
    chainShape: "Lambda role → VPC-attached Lambda → Interface VPCE → AWS API",
    trustStory:
      "IAM plus the VPC Endpoint policy are the two gates. Tight when both are scoped to the crown jewel; commonly weak when the VPCE policy is left as default `*`.",
    closureAction:
      "Audit the VPC Endpoint policy and constrain `Resource` to the crown jewel ARN. Verify the Lambda role's policy mirrors the VPCE policy.",
    defaultGateStrength: "weak_observable",
    hasHandler: true,
    bytesSource: "vpc_flow_logs",
    collectorStatus: "active",
  },
  ec2_via_nat: {
    id: "ec2_via_nat",
    label: "EC2 · Via NAT",
    chainShape:
      "Instance role → EC2 in private subnet → NAT GW → IGW → Internet",
    trustStory:
      "Egress traverses the NAT Gateway, so the destination sees the NAT's elastic IP as the data's network fingerprint. Security Group egress and NACL outbound are the final gates.",
    closureAction:
      "Tighten SG egress to declared destinations. Add a VPC Endpoint for the relevant AWS service so traffic stays on the AWS partition instead of crossing the NAT.",
    defaultGateStrength: "weak_observable",
    hasHandler: true,
    bytesSource: "vpc_flow_logs",
    collectorStatus: "active",
  },
  ec2_public_subnet: {
    id: "ec2_public_subnet",
    label: "EC2 · Public Subnet",
    chainShape: "Instance role → EC2 with public IP → IGW → Internet",
    trustStory:
      "Direct egress through the Internet Gateway. The Security Group's egress rules are the only network gate. Common in lift-and-shift workloads placed in default public subnets.",
    closureAction:
      "Move the workload into a private subnet, route through NAT, and scope SG egress. Re-evaluate whether the public IP is needed at all.",
    defaultGateStrength: "weak_observable",
    hasHandler: true,
    bytesSource: "vpc_flow_logs",
    collectorStatus: "active",
  },
  replication_crr: {
    id: "replication_crr",
    label: "Replication · CRR",
    chainShape:
      "Replication role → ∅ → S3 CRR rule → destination bucket (cross-region or cross-account)",
    trustStory:
      "The replication rule reads and writes bytes directly — no compute, no Security Group, no NACL. The bucket policy and replication configuration are the only gates. Invisible to runtime monitoring that focuses on workloads.",
    closureAction:
      "Disable the replication rule, or constrain `destination_account_id` to a declared trusted account. Audit the destination bucket's policy and KMS grants.",
    defaultGateStrength: "weak_unobservable",
    hasHandler: false,
    bytesSource: "s3_replication_metrics",
    collectorStatus: "not_collected_yet",
    collectorBacklog: "Sprint X — S3 CRR rules + bucket-policy cross-account refs (~0.3 wk)",
  },
  share_snapshot: {
    id: "share_snapshot",
    label: "Share · Snapshot",
    chainShape:
      "(cross-account principal) → ∅ → Snapshot share + KMS grant → external account",
    trustStory:
      "RDS, EBS, or AMI snapshot shared with another account. KMS grant is required when encrypted. These shares outlive the project that created them, don't expire, and rarely surface on inventory dashboards.",
    closureAction:
      "Remove the principal from the snapshot's shared-accounts list. Revoke the KMS grant unless explicitly in scope. Add a periodic audit job.",
    defaultGateStrength: "weak_unobservable",
    hasHandler: false,
    bytesSource: "snapshot_describe",
    collectorStatus: "not_collected_yet",
    collectorBacklog: "Sprint X — EBS/RDS/AMI snapshot share lists + KMS grants (~0.5 wk)",
  },
  notification_pubsub: {
    id: "notification_pubsub",
    label: "Notification · Pub-Sub",
    chainShape: "Reader role → workload → SNS/SES topic subscription → external endpoint",
    trustStory:
      "Bytes leave inside message bodies — emails, push notifications, queue payloads. CloudTrail data events don't carry SNS or SES message contents, so this is a subtle channel that auditors routinely miss.",
    closureAction:
      "Constrain topic subscriptions to in-account endpoints. Use SNS access policies to require organization-account scope. Audit SES verified identities.",
    defaultGateStrength: "weak_observable",
    hasHandler: true,
    bytesSource: "sns_ses_metrics",
    collectorStatus: "not_collected_yet",
    collectorBacklog: "Sprint X+1 — SNS/SES subscription targets + cross-account refs",
  },
  logging_subscription: {
    id: "logging_subscription",
    label: "Logging · Subscription",
    chainShape:
      "(delivery role) → ∅ → CloudWatch Logs subscription filter → external Lambda/Firehose",
    trustStory:
      "Logs containing crown jewel data piped to an external Lambda or Firehose. The subscription destination can sit in another account, sending logs (and any embedded data) out of the customer's boundary.",
    closureAction:
      "Audit subscription filter destinations on every log group that touches the crown jewel. Restrict to in-account targets, or add data classification to log content.",
    defaultGateStrength: "weak_unobservable",
    hasHandler: false,
    bytesSource: "cw_logs_metrics",
    collectorStatus: "not_collected_yet",
    collectorBacklog: "Sprint X+1 — CW Logs subscription filters + destination accounts",
  },
}

// ─── Render order (used by the catalog grid) ─────────────────────

export const ARCHETYPE_ORDER: ExfilArchetype[] = [
  "serverless_direct",
  "serverless_vpce",
  "ec2_via_nat",
  "ec2_public_subnet",
  "replication_crr",
  "share_snapshot",
  "notification_pubsub",
  "logging_subscription",
]

// ─── Gate-strength UI tokens ─────────────────────────────────────

export interface GateStrengthSpec {
  id: GateStrength
  label: string
  /** Hex used in border + accent. Wraps with bg-[#hex]20 text-[#hex]
   *  border-[#hex]30 idiom — same triplet as LP phase chips. */
  accent: string
  /** Single-line description for tooltips / legend. */
  description: string
}

export const GATE_STRENGTH_CONFIG: Record<GateStrength, GateStrengthSpec> = {
  strong: {
    id: "strong",
    label: "Strong gate",
    accent: "#10b981", // emerald-500
    description:
      "Gate is scoped — VPC Endpoint with resource-specific policy, KMS grant with constraints, SG egress to declared destinations.",
  },
  weak_observable: {
    id: "weak_observable",
    label: "Weak — observable",
    accent: "#3b82f6", // blue-500
    description:
      "Gate is permissive but the egress is visible — NAT IP + VPC Flow Logs, SG egress wide but logged, VPCE policy default-allow.",
  },
  weak_unobservable: {
    id: "weak_unobservable",
    label: "Weak — unobservable",
    accent: "#f59e0b", // amber-500
    description:
      "Gate bypasses runtime controls — AWS service plane direct, S3 CRR rule, cross-account snapshot share. Closure-by-configuration is the only mechanism.",
  },
}

// ─── Closure-action payload (per-path on the response) ───────────

/** Carried by the backend on each ExfilPath instance once Phase B
 *  classification ships. Frontend uses this in preference to the
 *  static catalog's `closureAction` when present — the per-path
 *  copy can name the specific role / bucket / share id. */
export interface ExfilClosureAction {
  archetype: ExfilArchetype
  /** Operator-readable one-liner. Falls back to ARCHETYPE_CATALOG
   *  when backend hasn't emitted yet. */
  copy: string
  /** Stable id of the suggested action (used by the closure pipeline
   *  in Phase C). Today's UI just renders the copy. */
  action_id?: string
}

// ─── Per-path archetype-aware fields backend will emit ───────────

/** Spread these into the existing ExfilPath shape once the backend
 *  classifier ships. Frontend reads them as optional today and falls
 *  back to channelToArchetypeFallback() until then. */
export interface ExfilPathArchetypeFields {
  archetype?: ExfilArchetype
  /** Categorical for UI; renderer colors the gate card with the
   *  accent from GATE_STRENGTH_CONFIG. */
  gate_strength?: GateStrength
  /** 0..100 for sort + analytics. Not surfaced on the card. */
  gate_score?: number
  /** Per-instance closure copy; falls back to ARCHETYPE_CATALOG. */
  closure_action?: ExfilClosureAction
}

// ─── Backend-channel → archetype fallback (transitional shim) ────

/** Backend currently emits a 4-value `channel` enum
 *  (network_via_igw / serverless_direct / ec2_no_egress / direct_api).
 *  The fallback below renames those into archetype ids so the renderer
 *  can read a single field.
 *
 *  REMOVE this function once backend ships ExfilPathArchetypeFields.
 *  Tracked: 2026-05-25 design memo, "backend classifies, archetype
 *  is a typed field" (Alon answer #2). */
export function channelToArchetypeFallback(
  channel: string | undefined,
): ExfilArchetype | undefined {
  switch (channel) {
    case "network_via_igw":
      return "ec2_via_nat"
    case "serverless_direct":
      return "serverless_direct"
    case "ec2_no_egress":
      // ec2_no_egress = EC2 in private subnet with no NAT/IGW route.
      // Bytes only reach service plane via VPC Endpoints (if any).
      // Closest archetype is serverless_direct (gate = service plane).
      return "serverless_direct"
    case "direct_api":
      // Root / service-linked role hitting AWS control plane directly,
      // no compute, no VPC. Closest is serverless_direct.
      return "serverless_direct"
    default:
      return undefined
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

export function defaultGateStrength(archetype: ExfilArchetype): GateStrength {
  return ARCHETYPE_CATALOG[archetype].defaultGateStrength
}

/** Per-archetype destination label + AWS-partition boundedness.
 *  Replaces the "AWS service plane · not tracked" catch-all that was
 *  hiding the gate column behind the destination. The new contract:
 *  the GATE is the named middle column; the DESTINATION is where the
 *  bytes ultimately land. */
export function destinationLabelFor(archetype: ExfilArchetype): {
  primaryLabel: string
  bounded: "aws_partition" | "internet" | "cross_account" | "cross_region" | "unbounded"
} {
  switch (archetype) {
    case "serverless_direct":
      return { primaryLabel: "Public AWS service plane", bounded: "aws_partition" }
    case "serverless_vpce":
      return { primaryLabel: "AWS service via VPC Endpoint", bounded: "aws_partition" }
    case "ec2_via_nat":
      return { primaryLabel: "Internet via NAT IP", bounded: "internet" }
    case "ec2_public_subnet":
      return { primaryLabel: "Internet via IGW", bounded: "internet" }
    case "replication_crr":
      return { primaryLabel: "Cross-region or cross-account S3", bounded: "cross_region" }
    case "share_snapshot":
      return { primaryLabel: "External AWS account", bounded: "cross_account" }
    case "notification_pubsub":
      return { primaryLabel: "External notification endpoint", bounded: "unbounded" }
    case "logging_subscription":
      return { primaryLabel: "External log destination", bounded: "cross_account" }
  }
}

// ─── Per-archetype rollup for the catalog grid ──────────────────

/** Computed by the frontend from data.paths[]. Each archetype the
 *  current payload contains gets a row here; absent archetypes (or
 *  not_collected_yet archetypes) render as empty / disabled cards
 *  via ARCHETYPE_CATALOG. */
export interface ArchetypePresence {
  instance_count: number
  any_observed: boolean
}
