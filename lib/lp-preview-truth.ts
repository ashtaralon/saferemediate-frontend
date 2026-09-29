/**
 * What an IAM Preview (POST /api/least-privilege/simulate-fix) actually proved, read once for every surface
 * that renders it (iam-permission-analysis-modal.tsx, IAMSimulateFixModal.tsx).
 *
 * Two facts, each defaulting to NOT proven:
 *  - attribution: which removal candidates had every CloudTrail event attributed. The backend lists the rest in
 *    `attribution_unverified_permissions` and keeps them. An absent field is an older backend that did not run the
 *    check, so no candidate list may be called attribution-verified.
 *  - rollback-ready: `safety.rollback_ready_status` (backend 42f7b16b, unified/lp/rollback_ready_status.py).
 *    Absent is "unknown". `safety.rollback_available` alone is never read as proof: before 42f7b16b it was an
 *    echoed default of true.
 */
import type {
  SimulateFixAttributionUnverifiedPermission,
  SimulateFixRollbackReadyStatus,
} from "@/lib/types"

export type AttributionCheck =
  | { reported: true; unverified: SimulateFixAttributionUnverifiedPermission[] }
  | { reported: false; unverified: [] }

const ATTRIBUTION_REASON_COPY: Record<string, string> = {
  EVENT_ATTRIBUTION_INCOMPLETE: "some CloudTrail events could not be attributed to an action",
  EVENT_ATTRIBUTION_UNKNOWN: "whether CloudTrail events map to this action is unknown",
}

export function attributionReasonCopy(reasonCode: string): string {
  return ATTRIBUTION_REASON_COPY[reasonCode] ?? reasonCode
}

function parseItem(raw: unknown): SimulateFixAttributionUnverifiedPermission | null {
  if (!raw || typeof raw !== "object") return null
  const item = raw as Record<string, unknown>
  const action = typeof item.action === "string" ? item.action.trim() : ""
  if (!action) return null
  return {
    action,
    reason_code: String(item.reason_code ?? "") as SimulateFixAttributionUnverifiedPermission["reason_code"],
    unmapped_events: Array.isArray(item.unmapped_events)
      ? item.unmapped_events.filter((event): event is string => typeof event === "string")
      : [],
  }
}

/**
 * Read the top-level `attribution_unverified_permissions` of a simulate-fix response (SimulateFixResponse,
 * backend 616c67744). Missing is `reported: false` — never an empty verified list.
 */
export function readAttributionCheck(response: unknown): AttributionCheck {
  const root = response && typeof response === "object" ? (response as Record<string, unknown>) : {}
  const field = root.attribution_unverified_permissions
  if (!Array.isArray(field)) return { reported: false, unverified: [] }
  const unverified = field
    .map(parseItem)
    .filter((item): item is SimulateFixAttributionUnverifiedPermission => item !== null)
  return { reported: true, unverified }
}

/** The attribution-unverified entries among `permissions` (case-insensitive), in the backend's order. */
export function attributionUnverifiedAmong(
  permissions: ReadonlyArray<string>,
  check: AttributionCheck | null | undefined,
): SimulateFixAttributionUnverifiedPermission[] {
  if (!check || check.unverified.length === 0) return []
  const present = new Set(permissions.map((permission) => String(permission ?? "").toLowerCase()))
  return check.unverified.filter((item) => present.has(item.action.toLowerCase()))
}

/** Removal candidates minus every attribution-unverified action (case-insensitive). Never counts them. */
export function withoutAttributionUnverified<T>(
  candidates: ReadonlyArray<T>,
  check: AttributionCheck,
  actionOf: (candidate: T) => string,
): T[] {
  if (check.unverified.length === 0) return [...candidates]
  const held = new Set(check.unverified.map((item) => item.action.toLowerCase()))
  return candidates.filter((candidate) => !held.has(String(actionOf(candidate) ?? "").toLowerCase()))
}

/** Heading for the candidate list: preview only while Apply is held, and never "verified" without the check. */
export function removalCandidatesHeading(check: AttributionCheck, executionHeld = true): string {
  const base = executionHeld ? "Removal candidates (preview only; execution held)" : "Removal candidates (preview)"
  return check.reported ? base : `${base} — unverified: attribution check not reported`
}

export type RollbackReadyView = {
  status: SimulateFixRollbackReadyStatus
  reasonCode: string | null
  label: string
  sentence: string
}

const ROLLBACK_STATUSES: ReadonlySet<string> = new Set(["proven", "unverified", "unknown"])

/**
 * The one reason code the backend proves with (unified/lp/rollback_ready_status.py). "proven" with any other
 * reason, or with none, is not read as proven.
 */
export const ROLLBACK_PROVEN_REASON = "SAME_SCOPE_RESTORE_VERIFIED"

/**
 * The backend's `unverified` reason codes at 838f7c26 (history read; no restore proven). One of these under a
 * "proven" status reads as unverified; any other unrecognised code is shown verbatim as unknown.
 */
export const ROLLBACK_UNVERIFIED_REASONS: ReadonlySet<string> = new Set([
  "NO_SAME_SCOPE_RESTORE_POINT",
  "NO_PROVEN_RESTORE",
  "CURRENT_CHANGE_NOT_RESTORED",
  "RESTORE_POINT_NOT_RECORDED",
  "RESTORE_READBACK_UNPROVEN",
  "RESOURCE_INCARNATION_UNPROVEN",
])

/**
 * Tri-state rollback readiness from `safety`. Absent / unrecognised status is "unknown", never proven.
 *
 * "proven" is a PAST restore on this exact role (tenant, account, ARN, incarnation) verified with a readback. It is
 * not the restore point a future Apply will create, and it does not check drift since that restore. "unverified":
 * the history was read and proves no restore. "unknown": the evidence could not be read or did not settle — never
 * rendered as an absence.
 */
export function rollbackReadyView(safety: unknown): RollbackReadyView {
  const record = safety && typeof safety === "object" ? (safety as Record<string, unknown>) : {}
  const raw = typeof record.rollback_ready_status === "string" ? record.rollback_ready_status : null
  const evidence = record.rollback_ready && typeof record.rollback_ready === "object"
    ? (record.rollback_ready as Record<string, unknown>)
    : null
  const reasonCode = typeof evidence?.reason_code === "string" && evidence.reason_code
    ? evidence.reason_code
    : raw === null
      ? "ROLLBACK_READY_NOT_REPORTED"
      : null
  let status = (raw && ROLLBACK_STATUSES.has(raw) ? raw : "unknown") as SimulateFixRollbackReadyStatus
  // The evidence block must agree with the status it explains.
  if (evidence && typeof evidence.status === "string" && evidence.status !== status) status = "unknown"
  if (status === "proven" && reasonCode !== ROLLBACK_PROVEN_REASON) {
    status = reasonCode && ROLLBACK_UNVERIFIED_REASONS.has(reasonCode) ? "unverified" : "unknown"
  }
  const because = reasonCode ? ` (${reasonCode})` : ""
  if (status === "proven") {
    return {
      status,
      reasonCode,
      label: "Proven",
      sentence: `Rollback readiness proven: a past restore on this exact role was verified with a readback${because}. `
        + "It does not check drift since that restore, and it is not the restore point a future Apply would create.",
    }
  }
  if (status === "unverified") {
    return {
      status,
      reasonCode,
      label: "Unverified",
      sentence: `Rollback readiness unverified: the restore history was read and proves no restore on this role${because}.`,
    }
  }
  return {
    status,
    reasonCode,
    label: "Unknown",
    sentence: raw === null
      ? `Rollback readiness unknown: this backend did not report it${because}.`
      : `Rollback readiness unknown: the restore evidence could not be read or did not settle${because}.`,
  }
}

export type RemediationStateView = { state: string; label: string; sentence: string }

const REMEDIATION_STATE_COPY: Record<string, { label: string; sentence: string }> = {
  READY: {
    label: "Ready (preview only)",
    sentence: "Evidence-qualified removal candidates exist. This is a preview; execution is gated separately.",
  },
  NEEDS_EVIDENCE: {
    label: "Needs evidence",
    sentence: "No permission is evidence-qualified for removal yet; the not-observed permissions need more evidence first.",
  },
  NOT_READY: { label: "Not ready", sentence: "This change is not authorized to proceed." },
  NO_CANDIDATES: { label: "No candidates", sentence: "No permission was found to remove." },
  BLOCKED: { label: "Blocked", sentence: "This change is blocked." },
}

/**
 * `final_remediation_state` (backend unified/lp/permission_disposition.py RemediationState). Absent → null (not
 * rendered, never assumed READY). An unrecognised value is shown verbatim.
 */
export function remediationStateView(state: unknown): RemediationStateView | null {
  if (typeof state !== "string" || !state.trim()) return null
  const known = REMEDIATION_STATE_COPY[state]
  return known ? { state, ...known } : { state, label: state, sentence: `Remediation state reported as ${state}.` }
}
