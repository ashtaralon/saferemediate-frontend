/**
 * The attack-path evidence contract, as the UI reads it (server-owned; never recomputed here).
 *
 * The backend's `evidence_contract` (cyntro_data/semantic/path_evidence.py) is the ONE
 * whole-path definition: observed only when identity, route AND data were observed;
 * any closed gate -> blocked; any unknown gate -> unknown; else inferred. Runtime use
 * is per plane and kept apart from per-action permission coverage.
 *
 * Collapses this file exists to prevent:
 *  - an unverified or blocked path shown as "CONFIGURED" (anything not observed used
 *    to fall into that one label);
 *  - a path with no `effective_damage` shown as "live" (missing is unknown, never live);
 *  - a held / unavailable IAP answer read as "no crown jewels".
 */

export type PathClassification = "observed" | "inferred" | "blocked" | "unknown"
export type PlaneState = "observed" | "not_observed" | "unattributed" | "unavailable"
export type PermissionState = "ALLOWED" | "EXPLICIT_DENY" | "NOT_EVALUATED"
/** The legacy whole-path word the backend still emits as `evidence_type`. */
export type LegacyPathEvidence = "observed" | "configured" | "unverified" | "blocked"

export interface PlaneEvidence {
  state: PlaneState
  kinds?: string[]
  hit_count?: number
  first_seen?: string
  last_seen?: string
  window_start?: string
  window_end?: string
}

export interface ActionCoverage {
  permission: PermissionState
  runtime: "observed" | "not_observed"
  technique_id?: string | null
  reason_codes?: string[]
}

export interface PathEvidenceContract {
  classification: PathClassification
  evidence: LegacyPathEvidence
  whole_path_observed: boolean
  gates: { identity: string; network: string; data: string }
  runtime_evidence: { identity: PlaneEvidence; network: PlaneEvidence; data: PlaneEvidence }
  permission_coverage: {
    actions: Record<string, ActionCoverage>
    evaluated_actions: string[]
    complete: boolean
    reason?: string
    certified_action_outside_path_scope?: string
  }
}

export type EvidenceTag = "OBSERVED" | "INFERRED" | "BLOCKED" | "UNKNOWN"

const CLASSIFICATIONS: ReadonlySet<string> = new Set(["observed", "inferred", "blocked", "unknown"])

const LEGACY_TO_CLASS: Readonly<Record<string, PathClassification>> = {
  observed: "observed",
  configured: "inferred",
  unverified: "unknown",
  blocked: "blocked",
}

/** The server's classification; a missing or unrecognised value is unknown, never "configured". */
export function pathClassification(path: {
  evidence_contract?: PathEvidenceContract | null
  evidence_type?: string | null
}): PathClassification {
  const fromContract = path.evidence_contract?.classification
  if (typeof fromContract === "string" && CLASSIFICATIONS.has(fromContract)) {
    return fromContract as PathClassification
  }
  const legacy = String(path.evidence_type ?? "").toLowerCase()
  return Object.prototype.hasOwnProperty.call(LEGACY_TO_CLASS, legacy)
    ? LEGACY_TO_CLASS[legacy]
    : "unknown"
}

export function evidenceTag(path: Parameters<typeof pathClassification>[0]): EvidenceTag {
  return pathClassification(path).toUpperCase() as EvidenceTag
}

/** The server's effective damage; missing is "unknown", never "live". */
export function effectiveDamage(damage: { effective_damage?: string | null } | null | undefined): string {
  return damage?.effective_damage ?? "unknown"
}

/** effective_damage values whose meaning the UI knows. Anything else is unknown. */
export const KNOWN_EFFECTIVE_DAMAGE: ReadonlySet<string> = new Set([
  "live",
  "network_blocked",
  "data_plane_blocked",
  "identity_blocked",
  "no_jewel_perms",
])

/**
 * Why the damage on this path is unknown, or null when the server gave a known answer.
 * A null reachability gate means "not evaluated": never reachable, never blocked.
 */
export function damageUnknownReason(
  damage:
    | {
        effective_damage?: string | null
        gates?: { network_reachable?: boolean | null; data_plane_reachable?: boolean | null } | null
      }
    | null
    | undefined,
): string | null {
  const effective = effectiveDamage(damage)
  if (KNOWN_EFFECTIVE_DAMAGE.has(effective)) return null
  const gates = damage?.gates
  const unknownGates: string[] = []
  if (gates && gates.network_reachable === null) unknownGates.push("network")
  if (gates && gates.data_plane_reachable === null) unknownGates.push("data-plane")
  if (unknownGates.length > 0) return `${unknownGates.join(" and ")} reachability not evaluated`
  if (effective === "data_plane_unknown") return "data-plane reachability not evaluated"
  if (damage?.effective_damage == null) return "effective damage not computed"
  return `effective damage "${effective}" is not a known answer`
}

/** "1 of 3 actions have an evaluated permission" -- or null when the server sent no coverage. */
export function permissionCoverageLine(contract: PathEvidenceContract | null | undefined): string | null {
  const coverage = contract?.permission_coverage
  if (!coverage) return null
  const total = Object.keys(coverage.actions ?? {}).length
  if (total === 0) return "No allowed or observed action recorded"
  const evaluated = (coverage.evaluated_actions ?? []).length
  return coverage.complete
    ? `All ${total} action${total === 1 ? "" : "s"} have an evaluated permission`
    : `${evaluated} of ${total} action${total === 1 ? "" : "s"} have an evaluated permission`
}

/** Per-plane runtime states in a fixed order, for a compact "identity · network · data" strip. */
export function planeStates(contract: PathEvidenceContract | null | undefined): Array<[string, PlaneState]> {
  const planes = contract?.runtime_evidence
  return (["identity", "network", "data"] as const).map((plane) => [plane, planes?.[plane]?.state ?? "unavailable"])
}

export function planeStateLabel(state: PlaneState): string {
  return state.replace(/_/g, " ")
}

// ─── Held / unavailable IAP answers ─────────────────────────────────────────
//
// The IAP route answers "I cannot tell you" in three shapes, none of which is a
// map and none of which may be read as "no crown jewels":
//   - 200 `{semantic_status: "not_recorded", hold_reason}`  (install reader not ready)
//   - 200 `{error, semantic_status: "unavailable"}`         (C1, guard off)
//   - 503 `{detail: {code: "SEMANTIC_READ_UNAVAILABLE" | "SERVING_READ_REFUSED"}}` (install)

export type IapHoldKind = "not_recorded" | "unavailable" | "refused" | "error"

export interface IapHold {
  kind: IapHoldKind
  /** The server's own words (hold_reason / error / detail.code), verbatim. */
  reason: string | null
}

const HOLD_SEMANTIC_STATUS: ReadonlySet<string> = new Set(["not_recorded", "unavailable"])

/** Statuses in which the server says the body IS an answer (possibly empty). */
const ANSWER_SEMANTIC_STATUS: ReadonlySet<string> = new Set(["populated", "empty"])

function hasRows(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

function holdOf(body: Record<string, unknown>): IapHold | null {
  const status = typeof body.semantic_status === "string" ? body.semantic_status : null
  const error = typeof body.error === "string" && body.error.length > 0 ? body.error : null
  const holdReason =
    typeof body.hold_reason === "string" && body.hold_reason.length > 0 ? body.hold_reason : null
  if (status && HOLD_SEMANTIC_STATUS.has(status)) {
    return { kind: status as IapHoldKind, reason: holdReason ?? error }
  }
  const detail = body.detail
  if (detail && typeof detail === "object") {
    const d = detail as Record<string, unknown>
    const why = typeof d.reason === "string" && d.reason ? `: ${d.reason}` : ""
    if (d.code === "SERVING_READ_REFUSED") return { kind: "refused", reason: `SERVING_READ_REFUSED${why}` }
    if (d.code === "SEMANTIC_READ_UNAVAILABLE") {
      return { kind: "unavailable", reason: `SEMANTIC_READ_UNAVAILABLE${why}` }
    }
  }
  // The backend's rule (estate_read.finish_estate_read): data alongside an
  // error is still an answer ("populated"). Only an error with no rows is a
  // failed read — including from a backend that predates semantic_status.
  if (status && ANSWER_SEMANTIC_STATUS.has(status)) return null
  if (error && !hasRows(body.paths) && !hasRows(body.crown_jewels)) {
    return { kind: "error", reason: error }
  }
  return null
}

/**
 * A held / unavailable IAP answer, or null when the body is a map.
 * Reads the bare result and a trust envelope's `result`.
 */
export function iapHold(body: unknown): IapHold | null {
  if (body == null || typeof body !== "object") return null
  const outer = holdOf(body as Record<string, unknown>)
  if (outer) return outer
  const inner = (body as Record<string, unknown>).result
  if (inner && typeof inner === "object") return holdOf(inner as Record<string, unknown>)
  return null
}

export function iapHoldTitle(hold: IapHold): string {
  switch (hold.kind) {
    case "not_recorded":
      return "Attack-path evidence not recorded yet"
    case "refused":
      return "Attack-path read refused"
    case "unavailable":
      return "Attack-path evidence unavailable"
    default:
      return "Attack-path read failed"
  }
}
