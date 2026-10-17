/**
 * (AP188) What one by-crown-jewel answer (the convergence summary) establishes about a crown jewel's paths, and what
 * the Attack Paths header may therefore say about the selected target's path count.
 *
 * Read only with the vocabulary the app already has:
 * - `iapHold`: a 200 hold (`semantic_status` not_recorded / unavailable), a typed refusal or reader failure, a legacy
 *   error with no rows;
 * - the serve / coverage states the Zoom0 canvas reads (`zoom0ServeCoverage`, moved here unchanged);
 * - the AP179/AP180 `coverage_withheld_reason`;
 * - the served N-of-M `cardinality`.
 *
 * A count is shown only where an answer supports it. A failed, held or not-ready read is never a zero, and a catalog
 * count is never presented as loaded detail.
 */
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import { semanticHoldMessage } from "@/lib/semantic-hold"
import { TARGET_STATE_CONFIG } from "@/lib/types"
import type { ConvergencePath, CrownJewelConvergence } from "./convergence-types"
import { iapHold } from "./path-evidence-view"
import type { JewelRailSource } from "./resolve-jewel-rail"

/** Authoritative coverage/serve from response root or risk_summary. */
export function zoom0ServeCoverage(data: CrownJewelConvergence | null): {
  serve_state: string | null
  coverage_state: string | null
} {
  if (!data) return { serve_state: null, coverage_state: null }
  return {
    serve_state: data.serve_state ?? data.risk_summary?.serve_state ?? null,
    coverage_state:
      data.coverage_state ?? data.risk_summary?.coverage_state ?? null,
  }
}

export type ConvergencePathsReading =
  /** The answer lists paths. `partial`: why they are not every path to the jewel; null when nothing says so. */
  | { kind: "paths"; paths: ConvergencePath[]; partial: string | null }
  /** The projection behind the answer is not ready: its paths are unknown, not absent. */
  | { kind: "not_ready" }
  /** No path answer: a hold, a refusal, a failure, a serve error, or a body with no path list. */
  | { kind: "unavailable"; reason: string | null }

/** The Zoom0 canvas's wording for a not-ready answer: the path list says the same, never "no paths today". */
export const CONVERGENCE_NOT_READY_MESSAGE =
  "Attack-path materialization is not ready for this system. Paths are unknown — not absent."

/** Coverage states under which a path list is the whole list (absent too: a backend that predates the states). */
const COMPLETE_COVERAGE: ReadonlySet<string> = new Set(["READY", "READY_ZERO"])
/** The serve states the backend writes (cyntro_data contracts / api/attack_paths.py); NOT_READY is read first. Any
 *  other present value is vocabulary this reader does not know: never a whole count, never mapped onto ERROR. */
const ANSWERING_SERVE: ReadonlySet<string> = new Set(["ACTIVE"])
/** Coverage states under which there is no usable path answer at all. */
const NO_ANSWER_COVERAGE: ReadonlySet<string> = new Set(["ERROR", "INTEGRITY_HELD"])

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/** (AP189) The served N-of-M `cardinality` against its contract (cyntro_data/contracts/workspace.py PathCardinality:
 *  three whole counts, `drawn_count` a count or null, `excluded_count_by_reason` counts, `truncated` a boolean). Absent
 *  or null is a backend that sends none: nothing said. Present but off-contract is "unreadable": never a whole count. */
function cardinalityPartial(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== "object" || Array.isArray(value)) return "path cardinality unreadable"
  const c = value as Record<string, unknown>
  const excluded = c.excluded_count_by_reason
  const wellFormed =
    isCount(c.generation_total) && isCount(c.eligible_total) && isCount(c.returned_count) &&
    (c.drawn_count === undefined || c.drawn_count === null || isCount(c.drawn_count)) &&
    (c.truncated === undefined || typeof c.truncated === "boolean") &&
    (excluded === undefined ||
      (excluded !== null && typeof excluded === "object" && !Array.isArray(excluded) &&
        Object.values(excluded).every(isCount)))
  if (!wellFormed) return "path cardinality unreadable"
  if (c.truncated === true || (c.returned_count as number) < (c.eligible_total as number)) return "more paths than returned"
  return null
}

/** Why a listed answer is not every path to the jewel, or null. */
function partialReason(data: CrownJewelConvergence, serveState: unknown, coverageState: unknown): string | null {
  const withheld = nonEmptyText((data as { coverage_withheld_reason?: unknown }).coverage_withheld_reason)
  if (withheld) return `coverage withheld (${withheld})`
  if (serveState !== null && !(typeof serveState === "string" && ANSWERING_SERVE.has(serveState))) {
    return `serve state ${String(serveState)} not recognised`
  }
  if (coverageState !== null && !(typeof coverageState === "string" && COMPLETE_COVERAGE.has(coverageState))) {
    return coverageState === "PARTIAL" ? "coverage partial" : `coverage ${String(coverageState)}`
  }
  return cardinalityPartial((data as { cardinality?: unknown }).cardinality)
}

/** One by-crown-jewel answer (summary or full convergence), read. */
export function readConvergencePaths(body: unknown): ConvergencePathsReading {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return { kind: "unavailable", reason: null }
  const hold = iapHold(body)
  if (hold) return { kind: "unavailable", reason: semanticHoldMessage(hold) }
  const data = body as CrownJewelConvergence
  const { serve_state, coverage_state } = zoom0ServeCoverage(data)
  if (serve_state === "NOT_READY" || coverage_state === "NOT_READY") return { kind: "not_ready" }
  if (typeof coverage_state === "string" && NO_ANSWER_COVERAGE.has(coverage_state)) {
    return { kind: "unavailable", reason: `coverage ${coverage_state}` }
  }
  if (!Array.isArray(data.paths)) return { kind: "unavailable", reason: "the answer carries no path list" }
  return { kind: "paths", paths: data.paths, partial: partialReason(data, serve_state, coverage_state) }
}

// ── the selected target's count in the Attack Paths header ──────────────────────────────────────────────────────

export type SelectedPathCount =
  /** Paths the page holds for the target: its loaded detail paths, or the catalog's zero when it lists none (nothing
   *  is then fetched). `partial`: why that is not every path, null when nothing says so. */
  | { kind: "count"; count: number; partial: string | null }
  /** The detail read is still running or retrying. */
  | { kind: "loading"; note: string | null }
  /** The detail read gave up or did not answer. `catalogCount`: what the target catalog lists, said as the catalog's,
   *  never as loaded detail; null for a rail that did not come from the catalog. */
  | { kind: "unavailable"; catalogCount: number | null; note: string | null; reason: string | null }
  /** The projection is not ready: no count exists. */
  | { kind: "not_ready" }

function joinNotes(...notes: Array<string | null>): string | null {
  const present = notes.filter((n): n is string => Boolean(n))
  return present.length ? present.join(" · ") : null
}

/** The selected target's count, from the page's existing read state (resolveJewelRailPaths and the convergence hook). */
export function selectedPathCount(args: {
  jewel: CrownJewelSummary
  /** The row's own note when its coverage is incomplete (targetIncompleteCoverageNote), else null. */
  coverageNote: string | null
  railSource: JewelRailSource
  /** The active paths the rail resolved (jewelPaths.length). */
  listedCount: number
  /** The by-crown-jewel answer behind a "serve" rail, or null. */
  serve: unknown
  /** The detail read is pending or retrying. */
  loading: boolean
  /** The detail read gave up. */
  failed: boolean
  error: string | null
}): SelectedPathCount {
  const { jewel, coverageNote: note } = args
  if (jewel.target_state === "projection_not_ready") return { kind: "not_ready" }
  // AP190: a catalog row's count is the catalog's own, validated by the adapter (null: missing or malformed); a
  // legacy /jewels row has no catalog count at all. `path_count` itself is coerced for display and proves nothing.
  const fromCatalog = jewel.target_state !== undefined
  const catalogCount = fromCatalog ? (isCount(jewel.catalog_path_count) ? jewel.catalog_path_count : null) : null
  const listedNone = fromCatalog ? catalogCount === 0 : isCount(jewel.path_count) && jewel.path_count === 0
  if (args.railSource === "serve") {
    const reading = readConvergencePaths(args.serve)
    if (reading.kind === "not_ready") return { kind: "not_ready" }
    if (reading.kind === "unavailable") return { kind: "unavailable", catalogCount, note, reason: reading.reason }
    return { kind: "count", count: args.listedCount, partial: joinNotes(note, reading.partial) }
  }
  if (args.railSource === "iap_fallback") {
    // The capped IAP preview stood in for an unreachable serve answer: its paths are real, never the whole list.
    return { kind: "count", count: args.listedCount, partial: joinNotes(note, "IAP preview") }
  }
  // Nothing resolved. Only a valid served zero means the catalog lists no path (nothing is fetched, and that zero is
  // the count). Otherwise the read is in flight or failed -- or, for a missing / malformed catalog count, never
  // started -- and there is no count.
  if (listedNone) return { kind: "count", count: 0, partial: note }
  if (args.failed) return { kind: "unavailable", catalogCount, note, reason: args.error }
  if (args.loading) return { kind: "loading", note }
  if (fromCatalog && catalogCount === null) {
    return { kind: "unavailable", catalogCount: null, note, reason: "the catalog's path count could not be read" }
  }
  return { kind: "loading", note }
}

export interface PathCountLines {
  primary: string
  /** A second line (a note), or null. */
  secondary: string | null
  /** The full explanation for a tooltip, or null. */
  title: string | null
}

/** The header's words for a selected target's count. A whole count keeps the established "<name> · N paths". */
export function selectedPathCountLines(name: string, count: SelectedPathCount): PathCountLines {
  const paths = (n: number, word: string) => `${n} ${word}path${n === 1 ? "" : "s"}`
  switch (count.kind) {
    case "count":
      return count.partial
        ? { primary: `${name} · ${paths(count.count, "listed ")}`, secondary: count.partial, title: count.partial }
        : { primary: `${name} · ${paths(count.count, "")}`, secondary: null, title: null }
    case "loading":
      return { primary: `${name} · paths loading…`, secondary: count.note, title: count.note }
    case "unavailable":
      return {
        primary: `${name} · detail paths unavailable`,
        secondary: joinNotes(count.catalogCount !== null ? `${count.catalogCount} listed in the catalog` : null, count.note),
        title: count.reason,
      }
    case "not_ready":
      return {
        primary: `${name} · ${TARGET_STATE_CONFIG.projection_not_ready.label}`,
        secondary: null,
        title: TARGET_STATE_CONFIG.projection_not_ready.description,
      }
  }
}
