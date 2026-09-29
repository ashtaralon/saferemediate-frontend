/**
 * Usage-derived values the backend withholds, read one way.
 *
 * While the IAM usage generation is unverified the backend serves null for
 * grades, scores, counts and deltas read off that usage, with a typed code
 * beside them (saferemediate-backend #2281, #2291 and the stacked readers
 * follow-up):
 *
 *   /api/identities/{overview,nhi,human,third-party,privileged,detail/{name}}
 *     risk_level, risk_score, used/unused_permissions_count, gap_percentage;
 *     overview critical/high/medium/low_risk_count, total_unused_permissions,
 *     avg_gap_percentage; detail permission_analysis.{used,unused}_count,
 *     gap_percentage, confidence and damage_classification.damage_score —
 *     each with `usage_withheld_reason`.
 *   /api/systems  health_score/healthScore, critical/high/medium/low counts,
 *     totalFindings, status — with `findings_withheld_reason`.
 *   /api/posture-score/{system}  least_privilege dimension score, overall_score.
 *   /api/remediation-candidates  unused/used counts.
 *
 * The rule every consumer follows: a value that is not a finite number (or a
 * grade that is not a non-empty string) renders as held — "Unknown", muted —
 * never 0, 0%, 100, "Minimal", "Low" or a fixed percentage. An aggregate over
 * any held value is itself held: a sum over the rows that happen to be
 * measured is not the total. A real value renders exactly as it did before.
 */

import { isFiniteScore, type BrssHold } from "@/lib/brss-held"
import { IAM_USAGE_UNKNOWN_FALLBACK } from "@/lib/lp-readiness-copy"
import { lpSeverityColor, lpSeverityLabel } from "@/lib/lp-severity"

/** The label a held value renders as — lp-severity's "Unknown". */
export const HELD_LABEL = lpSeverityLabel(null)
/** lp-severity's Unknown color: never a severity or health color. */
export const HELD_COLOR = lpSeverityColor(null)
/** Tooltip / sentence for a held usage value. */
export const HELD_TITLE = IAM_USAGE_UNKNOWN_FALLBACK

/** A finite number, or null (held). */
export function heldNumber(value: unknown): number | null {
  return isFiniteScore(value) ? value : null
}

/** A non-empty grade string, or null (held). */
export function heldGrade(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

/** Sum of finite values; null when any value is held. An empty list sums to 0. */
export function sumOrHeld(values: readonly unknown[]): number | null {
  let total = 0
  for (const v of values) {
    if (!isFiniteScore(v)) return null
    total += v
  }
  return total
}

/** Mean of finite values; null when any value is held. `empty` for no values. */
export function meanOrHeld(values: readonly unknown[], empty: number): number | null {
  if (values.length === 0) return empty
  const total = sumOrHeld(values)
  return total === null ? null : total / values.length
}

/**
 * Count of grades equal to `grade`; null when any grade is held — a count of
 * the graded rows only would read as the whole set's count.
 */
export function gradeCountOrHeld(grades: readonly unknown[], grade: string): number | null {
  let count = 0
  for (const g of grades) {
    const known = heldGrade(g)
    if (known === null) return null
    if (known === grade) count += 1
  }
  return count
}

/**
 * The `a || b || 0` fallback chain some surfaces use, with the trailing 0
 * made honest: the first truthy value as before, a real 0 when some value is
 * a finite 0, and null (held) when no value is a number at all.
 */
export function firstOrHeld(values: readonly unknown[]): number | null {
  for (const v of values) {
    if (v) return isFiniteScore(v) ? v : null
  }
  return values.some((v) => isFiniteScore(v)) ? 0 : null
}

function uniqueCodes(values: readonly unknown[]): string[] {
  const out: string[] = []
  for (const v of values) {
    if (typeof v === "string" && v && !out.includes(v)) out.push(v)
  }
  return out
}

/**
 * The hold for a set of payloads: null when every listed field is present
 * (finite number / non-empty grade) and none carries a withheld reason.
 * `codes` are the backend's reasons verbatim; `reason` is the shared copy.
 */
export function usageHold(
  rows: ReadonlyArray<Record<string, unknown> | null | undefined>,
  opts: { numbers?: readonly string[]; grades?: readonly string[]; reasonKeys: readonly string[] },
): BrssHold | null {
  let held = false
  const codes: unknown[] = []
  for (const row of rows) {
    if (!row) continue
    const reasons = opts.reasonKeys.map((k) => row[k]).filter((v) => typeof v === "string" && v)
    const missing =
      (opts.numbers ?? []).some((k) => k in row && !isFiniteScore(row[k])) ||
      (opts.grades ?? []).some((k) => k in row && heldGrade(row[k]) === null)
    if (reasons.length > 0 || missing) {
      held = true
      codes.push(...reasons)
    }
  }
  return held ? { codes: uniqueCodes(codes), reason: HELD_TITLE } : null
}

// ── /api/identities ────────────────────────────────────────────────────

export const IDENTITY_USAGE_NUMBERS = [
  "used_permissions_count",
  "unused_permissions_count",
  "gap_percentage",
] as const
export const IDENTITY_USAGE_REASON_KEYS = ["usage_withheld_reason"] as const

/** Hold across identity rows (the list endpoints). */
export function identityRowsHold(rows: ReadonlyArray<Record<string, unknown>>): BrssHold | null {
  return usageHold(rows, {
    numbers: IDENTITY_USAGE_NUMBERS,
    grades: ["risk_level"],
    reasonKeys: IDENTITY_USAGE_REASON_KEYS,
  })
}

// ── /api/systems ───────────────────────────────────────────────────────

/**
 * A per-system value read through the same `a ?? b` spelling chain the
 * surfaces used, minus the trailing `?? 0`: null (held) when no spelling
 * carries a number.
 */
export function systemValue(system: unknown, keys: readonly string[]): number | null {
  if (!system || typeof system !== "object") return null
  const row = system as Record<string, unknown>
  for (const k of keys) {
    const v = row[k]
    if (v !== null && v !== undefined) return heldNumber(v)
  }
  return null
}

export const SYSTEM_HEALTH_KEYS = ["health_score", "healthScore"] as const
export const SYSTEM_CRITICAL_KEYS = ["critical_count", "criticalIssues"] as const
export const SYSTEM_HIGH_KEYS = ["high_count", "highIssues"] as const

/**
 * True when the backend withheld this system's usage-graded values: it named
 * a `findings_withheld_reason`, or a value's spellings are present and null
 * with no number among them. A payload that simply omits the keys (an older
 * backend) is not a hold.
 */
export function systemFindingsWithheld(system: unknown): boolean {
  if (!system || typeof system !== "object") return false
  const row = system as Record<string, unknown>
  const reason = row.findings_withheld_reason
  if (typeof reason === "string" && reason) return true
  return [SYSTEM_HEALTH_KEYS, SYSTEM_CRITICAL_KEYS, SYSTEM_HIGH_KEYS].some(
    (keys) => keys.some((k) => row[k] === null) && !keys.some((k) => isFiniteScore(row[k])),
  )
}
