/**
 * Business System Blast Radius — payload types.
 *
 * These mirror 1:1 the backend contract served by
 *   GET /api/business-system/{systemName}/blast-radius
 * (saferemediate-backend · api/business_system.py). The endpoint is a
 * read-composer over materialized graph state — it returns EVERY hero number
 * already computed; the FE renders the verdict and computes none of it
 * (CLAUDE.md rule #1: real data only, no synthesis).
 *
 * Where the backend genuinely has not computed something yet it sends `null`
 * (e.g. reachable_after → requires_simulation; flowlogs_window_days) — the UI
 * shows an honest "not computed" state, never a fabricated value.
 */

// ── system scope / membership ──────────────────────────────────────────
export interface BlastVpcRef {
  id: string
  cidr: string | null
  workload_count: number
  /** True when this system's workloads occupy a VPC tagged for ANOTHER
   *  system (co-tenant). Surfaced as a membership note, never reattributed. */
  is_foreign: boolean
  membership_note: string | null
}

export interface BlastSystemScope {
  name: string
  confidence: number | null
  confidence_basis: string
  accounts: string[]
  regions: string[]
  vpcs: BlastVpcRef[]
}

// ── verdict (the hero numbers) ─────────────────────────────────────────
export interface BlastJewelAccess {
  s3: number
  dynamodb: number
  kms: number
}

export interface BlastDataFreshness {
  attack_paths_generated_at: string | null
  cloudtrail_window_days: number | null
  flowlogs_window_days: number | null
}

export interface BlastVerdict {
  attack_paths: number
  reachable_crown_jewels: number
  source_workloads: number
  observed_jewel_access: BlastJewelAccess
  data_freshness: BlastDataFreshness
}

// ── trust zones (the canvas) ───────────────────────────────────────────
export type BlastZoneKey = "external" | "public_exposure" | "private_app" | "data"

export interface BlastZoneNode {
  id: string
  name: string
  kind: string | null
  vpc_id: string | null
  subnet_tier: string | null
  exposure_state: string | null
  risk: number | null
  role: string | null
}

export interface BlastZone {
  key: BlastZoneKey | string
  label: string
  nodes: BlastZoneNode[]
}

// ── shared dependency plane ────────────────────────────────────────────
export interface BlastDependencyItem {
  jewel_type: string // "S3Bucket" | "DynamoDBTable" | "KMSKey"
  reachable_observed: number
  reachable_via_path: number
  observed_sources: number
  observed_edges: number
  delete_capable_paths: number
  write_capable_paths: number
  protects_crown_jewels: number | null // KMS only
}

// ── top attack paths ───────────────────────────────────────────────────
/** Gates are CATEGORICAL STRINGS in the graph (OPEN_OBSERVED / OPEN_CONFIG /
 *  CLOSED / UNKNOWN), never booleans — the analyzer's real plane state. */
export type BlastGate = string | null
export type BlastConfidenceTier = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO" | string

export interface BlastTopPath {
  id: string
  workload_name: string | null
  workload_kind: string | null
  cj_name: string | null
  cj_type: string | null
  cj_arn: string | null
  hop_count: number
  damage_types: string[]
  identity_gate: BlastGate
  route_gate: BlastGate
  data_plane_gate: BlastGate
  impact_confidence: BlastConfidenceTier | null
  business_sentence: string | null
}

// ── recommended cuts ───────────────────────────────────────────────────
export type BlastCutConfidence = "high" | "needs_resync" | "unknown" | string

export interface BlastRecommendedCut {
  rank: number
  workload_name: string | null
  role_name: string | null
  remove_actions: string[]
  closes_paths: number
  reachable_after: number | null // requires_simulation → null in v1
  reachable_after_status: string
  data_source: string | null // ATHENA_CLOUDTRAIL | POLICY_COLLECTOR | …
  confidence: BlastCutConfidence
  is_aws_managed: boolean
  observed_safe_note: string
}

// ── warnings / envelope ────────────────────────────────────────────────
export interface BlastWarning {
  code: string
  message: string
  severity: "info" | "warning" | "critical" | string
}

export interface BlastRadiusResponse {
  system: BlastSystemScope
  verdict: BlastVerdict
  zones: BlastZone[]
  dependency_plane: BlastDependencyItem[]
  top_paths: BlastTopPath[]
  recommended_cuts: BlastRecommendedCut[]
  warnings: BlastWarning[]
  from_snapshot: boolean
  snapshot_age_seconds: number | null
  /** proxy-injected honest-error/stale markers (never from the backend) */
  error?: string
  fromStaleCache?: boolean
}

// ── UI config maps (labels/tones only — no derived data) ───────────────
export const ZONE_ORDER: BlastZoneKey[] = ["external", "public_exposure", "private_app", "data"]

export const ZONE_META: Record<
  BlastZoneKey,
  { label: string; blurb: string; accent: string; tint: string; border: string }
> = {
  external: {
    label: "External Entry",
    blurb: "Internet-facing entry (IGW / ALB)",
    accent: "#b45309",
    tint: "rgba(245, 158, 11, 0.08)",
    border: "rgba(245, 158, 11, 0.35)",
  },
  public_exposure: {
    label: "Public Exposure",
    blurb: "Web tier / internet-reachable compute",
    accent: "#c2410c",
    tint: "rgba(249, 115, 22, 0.08)",
    border: "rgba(249, 115, 22, 0.30)",
  },
  private_app: {
    label: "Private App",
    blurb: "App tier / serverless (no direct ingress)",
    accent: "#1d4ed8",
    tint: "rgba(37, 99, 235, 0.06)",
    border: "rgba(37, 99, 235, 0.25)",
  },
  data: {
    label: "Data / Crown Jewels",
    blurb: "Databases + the sensitive stores paths reach",
    accent: "#6d28d9",
    tint: "rgba(109, 40, 217, 0.07)",
    border: "rgba(109, 40, 217, 0.30)",
  },
}

/** confidence tier (impact_confidence) → StatusChip tone + swatch */
export const CONFIDENCE_TONE: Record<string, { tone: "red" | "amber" | "green" | "neutral"; swatch: string }> = {
  CRITICAL: { tone: "red", swatch: "#ef4444" },
  HIGH: { tone: "red", swatch: "#f97316" },
  MEDIUM: { tone: "amber", swatch: "#eab308" },
  LOW: { tone: "green", swatch: "#22c55e" },
  INFO: { tone: "neutral", swatch: "#94a3b8" },
}

/** cut confidence → StatusChip tone + human label. `needs_resync` is the
 *  honest "policy-only, CloudTrail not correlated" signal, not a failure. */
export const CUT_CONFIDENCE_META: Record<string, { tone: "green" | "amber" | "neutral"; label: string }> = {
  high: { tone: "green", label: "high · observed" },
  needs_resync: { tone: "amber", label: "needs re-sync" },
  unknown: { tone: "neutral", label: "unknown" },
}

/** gate state → tone. OPEN = the plane does NOT stop the attacker (bad). */
export function gateTone(gate: BlastGate): "red" | "amber" | "green" | "neutral" {
  if (!gate) return "neutral"
  const g = gate.toUpperCase()
  if (g.startsWith("OPEN")) return g.includes("OBSERVED") ? "red" : "amber"
  if (g.startsWith("CLOSED") || g === "BLOCKED") return "green"
  return "neutral"
}

export const JEWEL_LABEL: Record<string, string> = {
  S3Bucket: "S3",
  DynamoDBTable: "DynamoDB",
  KMSKey: "KMS",
}
