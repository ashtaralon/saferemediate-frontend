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
import {
  targetCoverageCause,
  targetEvidenceUnreadable,
  targetHasHeldPaths,
  targetHeldCount,
} from "@/lib/attack-paths/lifecycle-coverage"
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
  /** AP105 / AP177: why this target's coverage is not complete — `lifecycle_held`, or a stage-receipt code. Absent,
   *  or null on the non-install route, when nothing is recorded. A value outside this type at runtime is judged
   *  unreadable, never dropped (lib/attack-paths/lifecycle-coverage.ts targetCoverageCause); so is a malformed
   *  `held_path_count`. */
  coverage_withheld_reason?: string | null
  /** AP177: lifecycle-held paths to this target, not in `path_count`. Served only on an install, and only when > 0. */
  held_path_count?: number
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
  // S13: the served count when it is a whole number, else null (not computed) -- never a coerced 0 / NaN.
  const pathCount = isServedCount(entry.path_count) ? entry.path_count : null
  const hasPaths = pathCount !== null && pathCount > 0
  const score = hasPaths && typeof entry.max_severity === "number" && Number.isFinite(entry.max_severity) ? entry.max_severity : null
  const cause = targetCoverageCause(entry.coverage_withheld_reason, entry.held_path_count)
  return {
    id: entry.target_id,
    canonical_id: entry.arn ?? entry.target_id,
    name: entry.name ?? entry.native_id ?? entry.target_id,
    type: entry.kind,
    severity: severityOf(entry),
    path_count: pathCount,
    // Max path severity score in the active generation. AP201 (I3): a served number, else null (not reported); it
    // used to be coerced to 0 and shown as a score of 0 beside a HIGH badge.
    highest_risk_score: score,
    is_internet_exposed:
      typeof entry.is_internet_exposed === "boolean" ? entry.is_internet_exposed : null,
    data_classification: entry.data_classification ?? null,
    // The backend already orders the catalog (paths desc, severity desc,
    // name). Mirror its ranking key so any client sort agrees with it. S13: no path or no served score is null.
    priority_score: score,
    crown_jewel_source: entry.crown_jewel_source === "reachable_only" ? "reachable_only" : null,
    // Pinned-generation :AttackPath count for this target. S13: these optional counts are carried only when the
    // catalog served a readable count; absent stays absent (not reported), never an invented 0.
    ...(isServedCount(entry.path_count) ? { materialized_path_count: entry.path_count } : {}),
    paths_not_computed: state === "projection_not_ready",
    ...(state ? { target_state: state } : {}),
    ...(isServedCount(entry.observed_path_count) ? { observed_path_count: entry.observed_path_count } : {}),
    ...(isServedCount(entry.standing_access_count) ? { standing_access_count: entry.standing_access_count } : {}),
    inventory_present: entry.inventory_present !== false,
    data_classification_source:
      entry.data_classification_source === "tag" ? "tag" : "unknown",
    // AP182/AP183: the recorded cause, judged HERE from the raw fields, where absence and malformed presence still
    // differ (lib/attack-paths/lifecycle-coverage.ts). A row with nothing recorded carries no key and reads as before.
    ...(cause.kind !== "none" ? { coverage_cause: cause } : {}),
    // AP190: what the catalog itself served for the count, validated, so a missing or malformed value never proves that
    // the target has no path.
    catalog_path_count: pathCount,
  }
}

function isServedCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
}

/** Whole catalog → rail list, in the backend's order. Empty when absent. */
export function targetCatalogToJewelSummaries(
  catalog: TargetCatalog | null | undefined,
): CrownJewelSummary[] {
  if (!catalog || !Array.isArray(catalog.targets)) return []
  return catalog.targets.map(targetEntryToJewelSummary)
}

/** Active-generation totals for the Attack Paths shell header.
 *
 * Do not mix these with the business-system blast-radius endpoint: that is a
 * different model with a different population. The header and rail must quote
 * the same target catalog the operator is looking at.
 */
export interface TargetCatalogTotals {
  /** Listed (eligible) paths only. */
  pathCount: number
  reachableTargetCount: number
  /** AP182: some target's paths are lifecycle-held, so the two counts above are not totals. */
  lifecycleHeld: boolean
  /** Held paths across those targets when every one of them reports its count; null otherwise (or none held). */
  heldPathCount: number | null
  /** Targets whose coverage the active generation withheld for a recorded non-lifecycle reason (a stage-receipt code):
   *  another reason the counts are not totals. */
  withheldTargetCount: number
  /** (AP183/AP184) Targets with coverage evidence served unreadable (wholly, or a held count beside a receipt code):
   *  their part of the counts is unknown. (AP193) Also a target whose served `path_count` is missing or not a whole
   *  number >= 0: its paths are in neither count above, and each target is counted once. */
  unreadableTargetCount: number
}

export function targetCatalogTotals(
  catalog: TargetCatalog | null | undefined,
): TargetCatalogTotals | null {
  if (!catalog || catalog.serve_state !== "READY" || !Array.isArray(catalog.targets)) {
    return null
  }
  const totals: TargetCatalogTotals = {
    pathCount: 0, reachableTargetCount: 0, lifecycleHeld: false, heldPathCount: null, withheldTargetCount: 0,
    unreadableTargetCount: 0,
  }
  let heldTargets = 0
  let heldCounted = 0
  let heldSum = 0
  for (const target of catalog.targets) {
    // AP193: only a served whole number >= 0 is a count. A missing / malformed one ("bad", -1, null, absent -- the
    // backend model always serialises it) is unknown: never NaN, never a silent 0, never part of a total.
    const countReadable = isServedCount(target.path_count)
    const paths = countReadable ? target.path_count : 0
    totals.pathCount += paths
    if (paths > 0) totals.reachableTargetCount += 1
    const cause = targetCoverageCause(target.coverage_withheld_reason, target.held_path_count)
    if (cause.kind === "withheld") totals.withheldTargetCount += 1
    if (targetEvidenceUnreadable(cause) || !countReadable) totals.unreadableTargetCount += 1
    // Held: lifecycle-held, or a well-formed count beside a receipt code (AP184: never a malformed one).
    if (targetHasHeldPaths(cause)) {
      heldTargets += 1
      const count = targetHeldCount(cause)
      if (count !== null) {
        heldCounted += 1
        heldSum += count
      }
    }
  }
  totals.lifecycleHeld = heldTargets > 0
  totals.heldPathCount = heldTargets > 0 && heldCounted === heldTargets ? heldSum : null
  return totals
}
