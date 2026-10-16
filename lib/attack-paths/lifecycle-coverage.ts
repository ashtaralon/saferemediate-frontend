/**
 * Lifecycle coverage (AP182), read exactly as the attack-path backend serves it.
 *
 * A path is lifecycle-HELD when the current state of its source (the workload or principal it starts from) could not be
 * established from the inventory snapshot the analysis was built on. Such a path is not listed and is in no total, so
 * the paths shown are the eligible ones only. Where it appears:
 *
 * - `/api/identity-attack-paths/all`: `lifecycle_held_systems` (one entry per system, its `held_path_count`) and
 *   `lifecycle_unverified_systems` (`"<name> (<key>): <reason>"`, a published system row whose lifecycle coverage
 *   could not be verified). Either one makes the answer PARTIAL with null totals.
 * - `/api/attack-paths/{system}/targets`: per target, `coverage_withheld_reason` (`lifecycle_held`, or a stage-receipt
 *   code) and, on an install only, `held_path_count`.
 *
 * Rules: a held count is shown only where the backend supplies one, as a whole number of at least 1. Absent or
 * malformed means "count not reported", never zero. A lifecycle field present in a shape this contract does not
 * describe is unreadable, never "none held". The wording says what the analysis could not establish; it claims no
 * live check.
 */

/** The target-catalog reason for a target some of whose paths are lifecycle-held. */
export const LIFECYCLE_HELD_REASON = "lifecycle_held"

/** A held count as supplied: a whole number of at least 1. Anything else (absent, 0, negative, fractional, a string, a
 *  boolean) is null: the count is not reported. */
export function heldCountOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null
}

/** "3 paths held" / "1 path held" / "paths held (count not reported)". */
export function heldPathsPhrase(count: number | null): string {
  if (count === null) return "paths held (count not reported)"
  return `${count} path${count === 1 ? "" : "s"} held`
}

/** Why held paths are missing from a list and its totals. */
export const LIFECYCLE_HELD_EXPLANATION =
  "Held paths start from a source whose current state could not be established from the inventory snapshot this " +
  "analysis used, so they are not listed and not counted in any total."

// ── per target (the target catalog) ─────────────────────────────────────────────────────────────────────────────

export type TargetCoverageCause =
  /** Some (or all) of this target's paths are lifecycle-held. */
  | { kind: "lifecycle"; heldCount: number | null }
  /** The active generation withheld this target's coverage for another recorded reason (a stage-receipt code). */
  | { kind: "withheld"; code: string; heldCount: number | null }
  /** Nothing recorded: the target reads exactly as before. */
  | { kind: "none" }

/** The recorded cause of a target's incomplete coverage, from its own `coverage_withheld_reason` and
 *  `held_path_count`. A receipt code takes precedence (the backend sets `lifecycle_held` only when there is none); a
 *  held count the backend reported without a reason is still held. */
export function targetCoverageCause(reason: unknown, heldPathCount: unknown): TargetCoverageCause {
  const heldCount = heldCountOrNull(heldPathCount)
  if (reason === LIFECYCLE_HELD_REASON) return { kind: "lifecycle", heldCount }
  if (typeof reason === "string" && reason.trim()) return { kind: "withheld", code: reason.trim(), heldCount }
  if (heldCount !== null) return { kind: "lifecycle", heldCount }
  return { kind: "none" }
}

/** The one-line note a target row carries beside its own path count, or null when nothing is recorded. */
export function targetCoverageNote(cause: TargetCoverageCause): string | null {
  if (cause.kind === "none") return null
  const held = cause.heldCount !== null ? `+${cause.heldCount} held, not counted` : null
  if (cause.kind === "lifecycle") return held ?? "more paths held, not counted"
  return held ? `coverage withheld · ${held}` : "coverage withheld"
}

/** The row / chip explanation for a target with a recorded cause, or null (the state's own description applies). */
export function targetCoverageDescription(cause: TargetCoverageCause): string | null {
  if (cause.kind === "none") return null
  if (cause.kind === "lifecycle") {
    const count = cause.heldCount !== null ? ` (${heldPathsPhrase(cause.heldCount)})` : ""
    return `Lifecycle coverage incomplete${count}. ${LIFECYCLE_HELD_EXPLANATION}`
  }
  const count = cause.heldCount !== null ? ` ${heldPathsPhrase(cause.heldCount)}: ${LIFECYCLE_HELD_EXPLANATION}` : ""
  return `The active generation withheld coverage of this target (${cause.code}), so its paths are not the whole picture.${count}`
}

/** The current-access empty state of a selected target that has no listed path and a recorded cause. */
export function targetZeroCoverageSubtitle(cause: TargetCoverageCause): string | null {
  if (cause.kind === "none") return null
  if (cause.kind === "lifecycle") {
    const count = cause.heldCount !== null ? ` (${heldPathsPhrase(cause.heldCount)})` : ""
    return (
      `Every path the active generation found to this crown jewel is held${count}: the current state of its source ` +
      "could not be established from the inventory snapshot this analysis used. Cyntro does not claim that no route exists."
    )
  }
  return (
    `The active generation withheld coverage of this crown jewel (${cause.code}), so Cyntro does not claim that no ` +
    "route exists."
  )
}

// ── per system (/all) ───────────────────────────────────────────────────────────────────────────────────────────

export interface LifecycleHeldSystem {
  system: string
  systemKey: string | null
  /** null: the entry carried no well-formed count. */
  heldPathCount: number | null
}

export interface LifecycleUnverifiedSystem {
  /** The system as the backend named it ("<name> (<key>)" or "<name>"). */
  label: string
  /** The backend's reason code, or null when the entry carried none. */
  reason: string | null
}

export interface AllLifecycleCoverage {
  held: LifecycleHeldSystem[]
  unverified: LifecycleUnverifiedSystem[]
  /** A lifecycle field was present in a shape this contract does not describe: it could not be read. */
  unreadable: boolean
  /** Total held paths when every held system reports a count; null otherwise (or when none is held). */
  heldTotal: number | null
  /** Any held, unverified or unreadable lifecycle evidence: the answer's lists and counts are not complete. */
  incomplete: boolean
}

const UNVERIFIED_REASON_TEXT: Record<string, string> = {
  jewel_coverage_record_missing: "no lifecycle coverage record was published for it",
  jewel_coverage_contract_not_v2: "its coverage record predates lifecycle checks",
  jewel_coverage_lifecycle_invalid: "its coverage record could not be read",
  jewel_coverage_applicability_unknown: "whether lifecycle checks apply to it could not be established",
}

/** Customer wording for an unverified system's reason code; an unknown or absent code is the generic wording. */
export function unverifiedReasonText(reason: string | null): string {
  return (reason && UNVERIFIED_REASON_TEXT[reason]) || "its lifecycle coverage could not be verified"
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/** The lifecycle evidence of one `/all` answer. Absent fields are no evidence (the legacy and resolved shapes). */
export function deriveAllLifecycleCoverage(raw: unknown): AllLifecycleCoverage {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const held: LifecycleHeldSystem[] = []
  const unverified: LifecycleUnverifiedSystem[] = []
  let unreadable = false

  if (p.lifecycle_held_systems !== undefined && p.lifecycle_held_systems !== null) {
    if (!Array.isArray(p.lifecycle_held_systems)) {
      unreadable = true
    } else {
      for (const item of p.lifecycle_held_systems) {
        const entry = item && typeof item === "object" ? (item as Record<string, unknown>) : null
        const system = entry ? nonEmptyString(entry.system) : null
        if (!entry || system === null) {
          unreadable = true
          continue
        }
        held.push({ system, systemKey: nonEmptyString(entry.system_key), heldPathCount: heldCountOrNull(entry.held_path_count) })
      }
    }
  }

  if (p.lifecycle_unverified_systems !== undefined && p.lifecycle_unverified_systems !== null) {
    if (!Array.isArray(p.lifecycle_unverified_systems)) {
      unreadable = true
    } else {
      for (const item of p.lifecycle_unverified_systems) {
        const text = nonEmptyString(item)
        if (text === null) {
          unreadable = true
          continue
        }
        const cut = text.lastIndexOf(": ")
        unverified.push(cut > 0 ? { label: text.slice(0, cut), reason: nonEmptyString(text.slice(cut + 2)) } : { label: text, reason: null })
      }
    }
  }

  const heldTotal =
    held.length > 0 && held.every((h) => h.heldPathCount !== null)
      ? held.reduce((sum, h) => sum + (h.heldPathCount as number), 0)
      : null
  return { held, unverified, unreadable, heldTotal, incomplete: held.length > 0 || unverified.length > 0 || unreadable }
}
