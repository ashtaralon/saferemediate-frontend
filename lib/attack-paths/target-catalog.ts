/**
 * Inventory-first target catalog (AP3-104) —
 * GET /api/proxy/attack-paths/{system}/targets.
 *
 * The Attack Paths rail used to read /identity-attack-paths/{system}/jewels
 * and then drop every jewel with path_count 0, so a target the materializer
 * never considered was indistinguishable from one it proved unreachable —
 * and both were simply absent. The catalog lists every in-scope S3 /
 * DynamoDB / RDS / Aurora / KMS target with an explicit state
 * (lib/types.ts TARGET_STATE_CONFIG). This adapter maps it onto the rail's
 * CrownJewelSummary WITHOUT inventing anything: no severity for a zero-path
 * target, no exposure flag the collector did not record, no client-side
 * threshold — the label comes from the backend scorer.
 */

import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import { TARGET_STATE_CONFIG, type TargetState } from "@/lib/types"

export type TargetSeverityLabel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"

/** One row of the catalog — mirrors api/attack_paths.py TargetCatalogEntry. */
export interface TargetCatalogEntry {
  target_id: string
  kind: string
  name: string | null
  arn: string | null
  native_id: string | null
  region: string | null
  account_id: string | null
  is_internet_exposed: boolean | null
  data_classification: string | null
  data_classification_source: "tag" | "unknown"
  inventory_present: boolean
  path_count: number
  observed_path_count: number
  standing_access_count: number
  /** Max path severity SCORE in the active generation (0 when no path). */
  max_severity: number
  /** Label from the backend scorer; null when the target has no path. */
  max_severity_label: TargetSeverityLabel | null
  manifest_path_count: number | null
  state: TargetState
  crown_jewel_source: string | null
}

/** GET /api/attack-paths/{system}/targets — mirrors TargetCatalog. */
export interface TargetCatalog {
  system_name: string
  serve_state: "READY" | "NOT_READY"
  coverage_state: "READY" | "NOT_READY"
  not_ready_reason: string | null
  generation: number | null
  staging_run_id: string | null
  customer_id: string | null
  account_id: string | null
  computed_at: string
  total_targets: number
  counts: Partial<Record<TargetState, number>>
  targets: TargetCatalogEntry[]
  endpoint: "target-catalog"
  /** Stamped by the proxy route on stale fallback / failure envelopes. */
  fromStaleCache?: boolean
  staleReason?: string
  unavailable?: boolean
}

const SEVERITY_LABELS: ReadonlySet<string> = new Set(["CRITICAL", "HIGH", "MEDIUM", "LOW"])

export function isTargetState(value: unknown): value is TargetState {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(TARGET_STATE_CONFIG, value)
}

export function isTargetCatalogPayload(payload: unknown): payload is TargetCatalog {
  if (!payload || typeof payload !== "object") return false
  const p = payload as Partial<TargetCatalog>
  return (
    Array.isArray(p.targets) &&
    (p.serve_state === "READY" || p.serve_state === "NOT_READY")
  )
}

/**
 * Cache only a READY catalog with at least one target. A NOT_READY or empty
 * answer must never be SWR-painted over a later recovery — the /jewels rail
 * stuck on "No crown jewels · showing cached" exactly that way.
 */
export function isTargetCatalogCacheable(payload: unknown): boolean {
  if (!isTargetCatalogPayload(payload)) return false
  return (
    payload.serve_state === "READY" &&
    payload.targets.length > 0 &&
    payload.unavailable !== true
  )
}

function severityOf(entry: TargetCatalogEntry): CrownJewelSummary["severity"] {
  const label = entry.max_severity_label
  if (entry.path_count > 0 && typeof label === "string" && SEVERITY_LABELS.has(label)) {
    return label as TargetSeverityLabel
  }
  // Zero paths → no severity exists. Never LOW by default.
  return null
}

/** One catalog row → the rail's summary shape. Pure; no defaults invented. */
export function targetEntryToJewelSummary(entry: TargetCatalogEntry): CrownJewelSummary {
  const state = isTargetState(entry.state) ? entry.state : undefined
  const hasPaths = Number(entry.path_count ?? 0) > 0
  return {
    id: entry.target_id,
    canonical_id: entry.arn ?? entry.target_id,
    name: entry.name ?? entry.native_id ?? entry.target_id,
    type: entry.kind,
    severity: severityOf(entry),
    path_count: Number(entry.path_count ?? 0),
    // Max path severity score in the active generation; 0 only when no path.
    highest_risk_score: hasPaths ? Number(entry.max_severity ?? 0) : 0,
    is_internet_exposed:
      typeof entry.is_internet_exposed === "boolean" ? entry.is_internet_exposed : null,
    data_classification: entry.data_classification ?? null,
    // The backend already orders the catalog (paths desc, severity desc,
    // name). Mirror its ranking key so any client sort agrees with it.
    priority_score: hasPaths ? Number(entry.max_severity ?? 0) : 0,
    crown_jewel_source: entry.crown_jewel_source === "reachable_only" ? "reachable_only" : null,
    // Pinned-generation :AttackPath count for this target.
    materialized_path_count: Number(entry.path_count ?? 0),
    paths_not_computed: state === "projection_not_ready",
    ...(state ? { target_state: state } : {}),
    observed_path_count: Number(entry.observed_path_count ?? 0),
    standing_access_count: Number(entry.standing_access_count ?? 0),
    inventory_present: entry.inventory_present !== false,
    data_classification_source:
      entry.data_classification_source === "tag" ? "tag" : "unknown",
  }
}

/** Whole catalog → rail list, in the backend's order. Empty when absent. */
export function targetCatalogToJewelSummaries(
  catalog: TargetCatalog | null | undefined,
): CrownJewelSummary[] {
  if (!catalog || !Array.isArray(catalog.targets)) return []
  return catalog.targets.map(targetEntryToJewelSummary)
}
