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

import {
  semanticStatusHold,
  typedReaderUnavailable,
  typedServingRefusal,
  type SemanticHold,
  type SemanticHoldKind,
} from "@/lib/semantic-hold"

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

// ─── One selected path's evidence, for the Current Access dossier ────────────

/** What the server said about one path's evidence — never derived here. */
export interface PathEvidenceSummary {
  classification: PathClassification
  /** True when the class came from the server's evidence_contract (not the legacy word). */
  fromContract: boolean
  /** Per-plane runtime evidence; null when the server sent no contract for this path. */
  runtimePlanes: Array<[string, PlaneState]> | null
  /** Per-action permission coverage line; null when the server sent no contract. */
  permissionCoverage: string | null
  /** The server's effective_damage ("unknown" when it sent a capability without one);
   *  null when the path carries no damage capability at all. */
  effectiveDamage: string | null
  /** Why damage is unknown; null when the server's answer is known. */
  damageUnknownReason: string | null
}

export function pathEvidenceSummary(
  path:
    | {
        evidence_contract?: PathEvidenceContract | null
        evidence_type?: string | null
        damage_capability?: {
          effective_damage?: string | null
          gates?: { network_reachable?: boolean | null; data_plane_reachable?: boolean | null } | null
        } | null
      }
    | null
    | undefined,
): PathEvidenceSummary | null {
  if (!path) return null
  const contract = path.evidence_contract ?? null
  const dc = path.damage_capability ?? null
  return {
    classification: pathClassification(path),
    fromContract: Boolean(contract && CLASSIFICATIONS.has(String(contract.classification))),
    runtimePlanes: contract ? planeStates(contract) : null,
    permissionCoverage: permissionCoverageLine(contract),
    effectiveDamage: dc ? effectiveDamage(dc) : null,
    damageUnknownReason: dc ? damageUnknownReason(dc) : null,
  }
}

const EFFECTIVE_DAMAGE_LABEL: Readonly<Record<string, string>> = {
  live: "live — reachable end to end",
  network_blocked: "blocked by network controls",
  data_plane_blocked: "blocked at the data plane",
  identity_blocked: "blocked at the identity gate",
  no_jewel_perms: "no permissions on the crown jewel",
}

/** The server's effective damage in words; anything the UI does not know is "unknown". */
export function effectiveDamageLabel(summary: PathEvidenceSummary): string | null {
  if (summary.effectiveDamage == null) return null
  const known = EFFECTIVE_DAMAGE_LABEL[summary.effectiveDamage]
  if (known && Object.prototype.hasOwnProperty.call(EFFECTIVE_DAMAGE_LABEL, summary.effectiveDamage)) {
    return known
  }
  return summary.damageUnknownReason ? `unknown — ${summary.damageUnknownReason}` : "unknown"
}

// ─── Held / unavailable IAP answers ─────────────────────────────────────────
//
// The IAP route answers "I cannot tell you" in these shapes (lib/semantic-hold),
// none of which is a map and none of which may be read as "no crown jewels":
//   - 200 `{semantic_status: "not_recorded", hold_reason}`  (install reader not ready)
//   - 200 `{error, semantic_status: "unavailable"}`         (C1, guard off)
//   - 503 `{detail: {code: SERVING_READ_REFUSED | SERVING_ROUTE_HELD | SEMANTIC_READ_UNAVAILABLE}}`
//   - (legacy) a 200 `error` with no rows, from a backend that predates semantic_status.

export type IapHoldKind = SemanticHoldKind
export type IapHold = SemanticHold

/** Statuses in which the server says the body IS an answer (possibly empty). */
const ANSWER_SEMANTIC_STATUS: ReadonlySet<string> = new Set(["populated", "empty"])

function hasRows(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

function legacyErrorHold(body: Record<string, unknown>): IapHold | null {
  // The backend's rule (estate_read.finish_estate_read): data alongside an
  // error is still an answer ("populated"). Only an error with no rows is a
  // failed read — including from a backend that predates semantic_status.
  const status = typeof body.semantic_status === "string" ? body.semantic_status : null
  if (status && ANSWER_SEMANTIC_STATUS.has(status)) return null
  const error = typeof body.error === "string" && body.error.length > 0 ? body.error : null
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
  const typed =
    semanticStatusHold(body) ?? typedServingRefusal(body) ?? typedReaderUnavailable(body)
  if (typed) return typed
  const outer = body as Record<string, unknown>
  const inner = outer.result
  return (
    legacyErrorHold(outer) ??
    (inner && typeof inner === "object" ? legacyErrorHold(inner as Record<string, unknown>) : null)
  )
}

export function iapHoldTitle(hold: IapHold): string {
  switch (hold.kind) {
    case "not_recorded":
      return "Attack-path evidence not recorded yet"
    case "refused":
      return "Attack-path read refused"
    case "route_held":
      return "Attack-path route held"
    case "unavailable":
      return "Attack-path evidence unavailable"
    default:
      return "Attack-path read failed"
  }
}
