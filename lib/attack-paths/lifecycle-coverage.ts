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
 * Rules: a held count is shown only where the backend supplies one, as a whole number of at least 1, never zero. ABSENT
 * evidence is no evidence: the row or answer reads as before. PRESENT evidence in a shape this contract does not
 * describe (a `null` list, a `0` or `"2"` count, a non-string reason) is unreadable: incomplete, count not reported,
 * never "none held", never "all held". The one documented exception is the non-install route's `null` reason, which
 * means nothing recorded. The wording says what the analysis could not establish; it claims no live check.
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

/** A target's held paths as served: a well-formed count, or held with the count not reported. */
export type HeldPaths = number | "unreported"

export type TargetCoverageCause =
  /** Some (or all) of this target's paths are lifecycle-held. */
  | { kind: "lifecycle"; held: HeldPaths }
  /** The active generation withheld this target's coverage for another recorded reason (a stage-receipt code).
   *  `held`: a well-formed count served beside it (paths are also held), "none" (no count served), or "unreadable"
   *  (AP184: a count was served but is malformed, so it establishes no held path). */
  | { kind: "withheld"; code: string; held: number | "none" | "unreadable" }
  /** (AP183) Coverage evidence was served for this target in a shape the contract does not describe: unknown. The
   *  target is not complete, no held count is reported, and nothing says its paths are all held. */
  | { kind: "unreadable" }
  /** Nothing recorded: the target reads exactly as before. */
  | { kind: "none" }

/** The "nothing recorded" cause, for rows that carry none (legacy /jewels rows, resolved targets). */
export const NO_TARGET_COVERAGE_CAUSE: TargetCoverageCause = { kind: "none" }

/** The recorded cause of a target's incomplete coverage, from its own `coverage_withheld_reason` and
 *  `held_path_count` as served.
 *
 *  `undefined` means not served (a JSON body cannot carry it). A `null` reason is the documented "nothing recorded" of
 *  the non-install route, whose model serialises an absent reason as null. Any other value that is not the documented
 *  shape is present but unreadable: a reason that is not a non-empty string, or a count that is not a whole number of
 *  at least 1 (`0`, `null`, `"2"`, `1.5`). A receipt code takes precedence (the backend sets `lifecycle_held` only when
 *  there is none).
 *
 *  Held paths are established only by `lifecycle_held` (its count, or "unreported" when the count is absent or
 *  malformed) or by a well-formed count. A receipt code establishes withholding, not held paths: beside it a malformed
 *  count is "unreadable" held evidence, never held (AP184). */
export function targetCoverageCause(reason: unknown, heldPathCount: unknown): TargetCoverageCause {
  const count = heldCountOrNull(heldPathCount)
  const countUnreadable = heldPathCount !== undefined && count === null
  const code = typeof reason === "string" && reason.trim() ? reason.trim() : null
  if (reason !== undefined && reason !== null && code === null) return { kind: "unreadable" }
  if (code === LIFECYCLE_HELD_REASON) return { kind: "lifecycle", held: count ?? "unreported" }
  if (code !== null) return { kind: "withheld", code, held: count ?? (countUnreadable ? "unreadable" : "none") }
  if (count !== null) return { kind: "lifecycle", held: count }
  if (countUnreadable) return { kind: "unreadable" }
  return NO_TARGET_COVERAGE_CAUSE
}

/** True when some of the target's paths are held: lifecycle-held, or a well-formed count beside a receipt code. */
export function targetHasHeldPaths(cause: TargetCoverageCause): boolean {
  return cause.kind === "lifecycle" || (cause.kind === "withheld" && typeof cause.held === "number")
}

/** True when part of the target's coverage evidence could not be read: wholly, or a held count served beside a
 *  receipt code (AP184). */
export function targetEvidenceUnreadable(cause: TargetCoverageCause): boolean {
  return cause.kind === "unreadable" || (cause.kind === "withheld" && cause.held === "unreadable")
}

/** (AP184) The state a target is SHOWN in. A `no_modeled_route` target that carries a recorded cause (lifecycle-held,
 *  withheld, unreadable) is not shown as "no route": its coverage is incomplete, the conclusion the page's empty state
 *  and the path list also show. Any other state, or no recorded cause, is shown as served. The raw state is unchanged. */
export function displayedTargetState<S extends string>(state: S, cause: TargetCoverageCause): S | "coverage_incomplete" {
  return state === "no_modeled_route" && cause.kind !== "none" ? "coverage_incomplete" : state
}

/** The well-formed held count of a cause, or null (none held, count not reported, or unreadable). */
export function targetHeldCount(cause: TargetCoverageCause): number | null {
  return (cause.kind === "lifecycle" || cause.kind === "withheld") && typeof cause.held === "number" ? cause.held : null
}

function heldNote(held: HeldPaths): string {
  return typeof held === "number" ? `+${held} held, not counted` : "more paths held, not counted"
}

const UNREADABLE_DESCRIPTION =
  "The coverage evidence served for this target could not be read, so its paths may not be the whole picture. No held " +
  "count is reported."

/** The one-line note a target row carries beside its own path count, or null when nothing is recorded. */
export function targetCoverageNote(cause: TargetCoverageCause): string | null {
  if (cause.kind === "none") return null
  if (cause.kind === "unreadable") return "coverage evidence unreadable"
  if (cause.kind === "lifecycle") return heldNote(cause.held)
  if (cause.held === "none") return "coverage withheld"
  if (cause.held === "unreadable") return "coverage withheld · held-path evidence unreadable"
  return `coverage withheld · ${heldNote(cause.held)}`
}

/** The row / chip explanation for a target with a recorded cause, or null (the state's own description applies). */
export function targetCoverageDescription(cause: TargetCoverageCause): string | null {
  if (cause.kind === "none") return null
  if (cause.kind === "unreadable") return UNREADABLE_DESCRIPTION
  if (cause.kind === "lifecycle") {
    const count = typeof cause.held === "number" ? ` (${heldPathsPhrase(cause.held)})` : ""
    return `Lifecycle coverage incomplete${count}. ${LIFECYCLE_HELD_EXPLANATION}`
  }
  const held =
    cause.held === "none" ? ""
      : cause.held === "unreadable" ? " A held-path count was served beside it but could not be read, so no held path is counted."
        : ` ${heldPathsPhrase(cause.held)}: ${LIFECYCLE_HELD_EXPLANATION}`
  return `The active generation withheld coverage of this target (${cause.code}), so its paths are not the whole picture.${held}`
}

/** The current-access empty state of a selected target that has no listed path and a recorded cause. */
export function targetZeroCoverageSubtitle(cause: TargetCoverageCause): string | null {
  if (cause.kind === "none") return null
  if (cause.kind === "unreadable") {
    return (
      "The coverage evidence served for this crown jewel could not be read, so Cyntro does not claim that no route " +
      "exists. No held count is reported."
    )
  }
  if (cause.kind === "lifecycle") {
    const count = typeof cause.held === "number" ? ` (${heldPathsPhrase(cause.held)})` : ""
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

// A Map, never an object index: a code like "constructor", "toString" or "__proto__" must miss, not hit a prototype
// member (AP183-R3).
const UNVERIFIED_REASON_TEXT: ReadonlyMap<string, string> = new Map([
  ["jewel_coverage_record_missing", "no lifecycle coverage record was published for it"],
  ["jewel_coverage_contract_not_v2", "its coverage record predates lifecycle checks"],
  ["jewel_coverage_lifecycle_invalid", "its coverage record could not be read"],
  ["jewel_coverage_applicability_unknown", "whether lifecycle checks apply to it could not be established"],
])

/** Customer wording for an unverified system's reason code; an unknown or absent code is the generic wording. */
export function unverifiedReasonText(reason: string | null): string {
  return (reason !== null && UNVERIFIED_REASON_TEXT.get(reason)) || "its lifecycle coverage could not be verified"
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/** The lifecycle evidence of one `/all` answer. An ABSENT field is no evidence (the legacy and resolved shapes); the
 *  backend writes either list only when it is non-empty, so a present field that is not an array -- `null` included --
 *  is unreadable (AP183-R1). */
export function deriveAllLifecycleCoverage(raw: unknown): AllLifecycleCoverage {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const held: LifecycleHeldSystem[] = []
  const unverified: LifecycleUnverifiedSystem[] = []
  let unreadable = false

  if (p.lifecycle_held_systems !== undefined) {
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

  if (p.lifecycle_unverified_systems !== undefined) {
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
