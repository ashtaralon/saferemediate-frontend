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

/** (AP187) Why an answer's aggregate totals are not shown while its lifecycle evidence is incomplete or unreadable. */
export const LIFECYCLE_TOTALS_WITHHELD =
  "Not shown: this answer's lifecycle coverage is incomplete or could not be read, so no complete total is known."

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
 *  and the path list also show. Any other state, or no recorded cause, is shown as served. The raw state is unchanged.
 *  (AP196) Neither is one whose catalog path count could not be read (`countReadable` false: the adapter's
 *  `catalog_path_count` is null): only a validated zero supports "no route". Default: readable, the call as before. */
export function displayedTargetState<S extends string>(
  state: S,
  cause: TargetCoverageCause,
  countReadable = true,
): S | "coverage_incomplete" {
  return state === "no_modeled_route" && (cause.kind !== "none" || !countReadable) ? "coverage_incomplete" : state
}

/** (AP196) The row / chip explanation for a `no_modeled_route` target with nothing recorded whose catalog path count
 *  could not be read (it is shown as coverage incomplete, displayedTargetState). */
export const TARGET_COUNT_UNREADABLE_DESCRIPTION =
  "The target catalog served this target's path count in a shape that could not be read, so its paths are unknown and " +
  "no route conclusion is drawn."

/** A served per-state target count: a finite, non-negative whole number. */
function isTargetCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
}

/** (AP187) The per-state target counts as the rail SHOWS them: the served counts, with every listed target whose shown
 *  state (displayedTargetState) differs from its served state moved to the shown one, so a summary agrees with the
 *  rows. The served counts are not modified.
 *
 *  (AP188) The served counts arrive unvalidated from the catalog response. A state ABSENT from them has no target (the
 *  catalog's documented shape). A state PRESENT with anything but a count -- `null`, `"7"`, `-2`, `1.5` -- makes the
 *  whole answer unknown, untouched states included: null. So does a body that is not an object, and counts that cannot
 *  account for a moved target (its served state has none to move). No value is ever coerced.
 *
 *  (AP196) A row's `countReadable` (absent: readable) moves it as its row is shown (displayedTargetState). */
export function displayedTargetStateCounts(
  served: unknown,
  rows: ReadonlyArray<{ state: string | undefined; cause: TargetCoverageCause; countReadable?: boolean }>,
): Partial<Record<string, number>> | null {
  if (served === null || typeof served !== "object" || Array.isArray(served)) return null
  // A Map, never an object index: a served key such as "__proto__" stays a plain key (AP183-R3).
  const shown = new Map<string, number>()
  for (const [state, count] of Object.entries(served)) {
    if (!isTargetCount(count)) return null
    shown.set(state, count)
  }
  for (const { state, cause, countReadable } of rows) {
    if (state === undefined) continue
    const to = displayedTargetState(state, cause, countReadable ?? true)
    if (to === state) continue
    const from = shown.get(state) ?? 0
    if (from < 1) return null
    shown.set(state, from - 1)
    shown.set(to, (shown.get(to) ?? 0) + 1)
  }
  return Object.fromEntries(shown)
}

/** (AP187) What a selected target's path count needs beside it when that count is not the whole count: the row's own
 *  note when a cause is recorded (held, withheld, unreadable), else "coverage incomplete" for a target served as
 *  coverage incomplete. Null otherwise: nothing served says the count is partial. */
export function targetIncompleteCoverageNote(state: string | undefined, cause: TargetCoverageCause): string | null {
  return targetCoverageNote(cause) ?? (state === "coverage_incomplete" ? "coverage incomplete" : null)
}

/** (AP194) The short label a target row shows in place of a count or score when it has no path: NO PATH, PENDING
 *  (coverage incomplete) or WAIT (projection not ready), from the state the row is SHOWN in; null for any other
 *  state. One mapping for both rails (the Attack Paths rail and the Topology view's rail). */
export function targetZeroLabel(shownState: string | undefined): "NO PATH" | "PENDING" | "WAIT" | null {
  return shownState === "no_modeled_route" ? "NO PATH"
    : shownState === "coverage_incomplete" ? "PENDING"
      : shownState === "projection_not_ready" ? "WAIT" : null
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

export interface TargetZeroConclusion {
  title: string
  subtitle: string
}

/** (AP195) The current-access conclusion of a selected target that lists no path, from the target catalog alone, or
 *  null when the catalog does not settle it (any state but no_modeled_route / coverage_incomplete /
 *  projection_not_ready). A recorded cause is coverage incomplete, never "no route" (AP182/AP183). (AP196) Neither is a
 *  catalog count that could not be read (`countReadable` false: the adapter's `catalog_path_count` is null): only a
 *  validated zero supports "no route" (AP190). One mapping for the Attack Paths page's empty state, its path list and
 *  the Topology view's center and right rail (the copy the page had inline). */
export function targetZeroConclusion(
  state: string | undefined,
  cause: TargetCoverageCause,
  countReadable: boolean,
): TargetZeroConclusion | null {
  if (state !== "no_modeled_route" && state !== "coverage_incomplete" && state !== "projection_not_ready") return null
  const causeSubtitle = state === "projection_not_ready" ? null : targetZeroCoverageSubtitle(cause)
  if (causeSubtitle !== null) return { title: "Current-access coverage incomplete", subtitle: causeSubtitle }
  if (state === "no_modeled_route" && !countReadable) {
    return {
      title: "Path count unreadable",
      subtitle:
        "The target catalog served this crown jewel's path count in a shape that could not be read, so Cyntro does " +
        "not claim that no route exists.",
    }
  }
  if (state === "no_modeled_route") {
    return {
      title: "No modeled current-access route",
      subtitle:
        "The active generation evaluated this crown jewel and found no compute-to-jewel route. Lateral and " +
        "Exfiltration remain separate attacker-lens analyses.",
    }
  }
  if (state === "coverage_incomplete") {
    return {
      title: "Current-access coverage incomplete",
      subtitle:
        "The active generation has no evaluation manifest for this crown jewel, so Cyntro does not claim that no " +
        "route exists.",
    }
  }
  return {
    title: "Attack-path projection not ready",
    subtitle: "No active Attack Paths generation can author a current-access conclusion yet.",
  }
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
