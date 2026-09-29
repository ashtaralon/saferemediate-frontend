/**
 * BRSS held state — one reading of the backend's "no score, and here is why".
 *
 * A held BRSS is the ABSENCE of a score, never a low one and never a stale
 * one. Four backend payloads can carry it, each in its own shape (the shapes
 * below are the ones the backend builds; nothing here adds a field):
 *
 *   GET /api/global-org-score
 *     api/global_org_score.py — any held system holds the whole org score:
 *     { global_score: null, error: "system_evaluations_held", error_codes,
 *       message, held_systems: [{ system_name, held: true, error_code,
 *       unmeasured_iam_roles? }], partial: { succeeded, failed, held,
 *       discovered } }
 *
 *   GET /api/business-systems/ranked
 *     api/business_systems_ranked.py — held systems sit BESIDE the ranking:
 *     { systems: [...scored], held_systems: [{ name, kind, brss_score: null,
 *       held: true, error_code, held_reason, unmeasured_iam_roles, href }],
 *       held_count, error_codes, error }
 *
 *   GET /api/business-system/{name}/detail-enhancements
 *     api/business_system.py — { brss: { score: null, held: true, error,
 *       error_code, held_reason, unmeasured_iam_roles?, ... } }
 *
 *   GET /api/issues/summary
 *     api/issues_summary.py — { blast_radius_score: { score: null,
 *       error_code?, held_reason, ... }, integrityReason?,
 *       failed_analyzer_codes? }
 *
 * The rule every consumer follows: when the score is not a finite number,
 * render the typed code(s) and the backend's own reason. Never a previous
 * score, a legacy score, a cached number, 0, or a computed stand-in.
 */

import { iamUsageWithheldCopy } from "@/lib/lp-readiness-copy"

/** The org-score route's error when any system is held (api/global_org_score.py). */
export const ORG_SCORE_HELD = "system_evaluations_held"

export interface BrssHold {
  /** Typed codes, verbatim from the backend. Empty when the backend sent none. */
  codes: string[]
  /** The backend's human reason, verbatim. Null when it sent none. */
  reason: string | null
}

export function isFiniteScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function uniqueStrings(values: unknown[]): string[] {
  const out: string[] = []
  for (const v of values) {
    if (typeof v === "string" && v && !out.includes(v)) out.push(v)
  }
  return out
}

// ── /api/global-org-score ──────────────────────────────────────────────

export interface OrgHeldSystem {
  system_name: string
  held: true
  error_code: string
  unmeasured_iam_roles?: number
}

export interface OrgScoreHeldFields {
  global_score?: number | null
  error?: string
  error_codes?: string[]
  message?: string
  held_systems?: OrgHeldSystem[]
}

/** The org hold, or null when the payload is not a held answer. */
export function orgScoreHold(payload: OrgScoreHeldFields | null | undefined): BrssHold | null {
  if (!payload) return null
  const held = Array.isArray(payload.held_systems) ? payload.held_systems : []
  if (payload.error !== ORG_SCORE_HELD && held.length === 0) return null
  return {
    codes: uniqueStrings([
      payload.error,
      ...(payload.error_codes ?? []),
      ...held.map((h) => h.error_code),
    ]),
    reason: typeof payload.message === "string" && payload.message ? payload.message : null,
  }
}

/**
 * Per-system reason for an org-held system. The org route sends a code and,
 * for IAM_USAGE_NOT_MEASURED, a role count — no prose. Render exactly that.
 */
export function orgHeldSystemDetail(h: OrgHeldSystem): string {
  const roles = h.unmeasured_iam_roles
  return typeof roles === "number"
    ? `${h.error_code} · usage of ${roles} IAM role${roles === 1 ? "" : "s"} not measured`
    : h.error_code
}

// ── /api/business-system/{name}/detail-enhancements ────────────────────

export interface DetailBrssFields {
  score?: number | null
  held?: boolean
  error?: string
  error_code?: string
  held_reason?: string
}

/** Held OR failed: any detail BRSS without a finite score. Null when scored. */
export function detailBrssHold(brss: DetailBrssFields | null | undefined): BrssHold | null {
  if (!brss) return null
  if (isFiniteScore(brss.score) && !brss.held && !brss.error) return null
  return {
    codes: uniqueStrings([brss.error_code, brss.error]),
    reason: typeof brss.held_reason === "string" && brss.held_reason ? brss.held_reason : null,
  }
}

// ── /api/issues/summary ────────────────────────────────────────────────

export interface IssuesSummaryBrssFields {
  integrityReason?: string
  failed_analyzer_codes?: Record<string, string>
  blast_radius_score?: {
    score?: number | null
    /** IAM_USAGE_NOT_MEASURED / IAM_USAGE_GENERATION_UNVERIFIED on a held score. */
    error_code?: string
    held_reason?: string
    error?: string
  } | null
}

/** Typed analyzer codes from an issues-summary payload, verbatim. */
export function summaryAnalyzerCodes(payload: IssuesSummaryBrssFields | null | undefined): string[] {
  const codes = payload?.failed_analyzer_codes
  return codes && typeof codes === "object" ? uniqueStrings(Object.values(codes)) : []
}

/**
 * The BRSS hold carried by an issues-summary payload that is otherwise
 * servable: a `blast_radius_score` object whose `score` is not a number.
 * Null when the score is real, or when there is no BRSS object at all.
 *
 * The typed code is the score's own `error_code` (IAM_USAGE_NOT_MEASURED,
 * IAM_USAGE_GENERATION_UNVERIFIED), then the failed analyzers' codes. A
 * payload that sends a reason but no code gets empty `codes` — never a code
 * guessed from prose.
 */
export function issuesSummaryBrssHold(
  payload: IssuesSummaryBrssFields | null | undefined,
): BrssHold | null {
  const brss = payload?.blast_radius_score
  if (!brss || typeof brss !== "object") return null
  if (isFiniteScore(brss.score)) return null
  return {
    codes: uniqueStrings([brss.error_code, ...summaryAnalyzerCodes(payload)]),
    reason:
      (typeof brss.held_reason === "string" && brss.held_reason) ||
      (typeof payload?.integrityReason === "string" && payload.integrityReason) ||
      null,
  }
}

// ── System Overview wiring (components/system-detail-dashboard.tsx) ────

export type OverviewBrssEmptyReason = "awaiting_scan" | "incomplete" | "held"

export interface OverviewBrssState<B> {
  /** Set as the hero's BRSS ONLY when the score is a finite number. */
  brss: B | null
  emptyReason: OverviewBrssEmptyReason
  hold: BrssHold | null
}

/**
 * The hero state for an issues-summary payload that integrity already allows
 * to carry scores (READY). Pure, so the dashboard's wiring is testable
 * without mounting it — the dashboard only applies these three values.
 *
 * READY does not mean scored: with V2 usage unknown the backend sends
 * `blast_radius_score.score: null` + held_reason next to an overlay computed
 * over the measured subset. That is held, and must never become the BRSS.
 */
export function readyOverviewBrss<B = unknown>(
  payload: (IssuesSummaryBrssFields & {
    blast_radius_score?: (IssuesSummaryBrssFields["blast_radius_score"] & {
      analysis_complete?: boolean
    }) | null
  }) | null | undefined,
): OverviewBrssState<B> {
  const brss = payload?.blast_radius_score
  if (brss && !brss.error) {
    const hold = issuesSummaryBrssHold(payload)
    if (hold) return { brss: null, emptyReason: "held", hold }
    if (brss.analysis_complete !== false) {
      return { brss: brss as unknown as B, emptyReason: "awaiting_scan", hold: null }
    }
  }
  // READY overall, yet the score itself was withheld: an error or an
  // incomplete BRSS is a held/partial computation, not a never-scanned system.
  return {
    brss: null,
    emptyReason: brss && (brss.error || brss.analysis_complete === false) ? "incomplete" : "awaiting_scan",
    hold: null,
  }
}

/** `byCategory.permissions` of an issues-summary payload (api/issues_summary.py). */
export interface PermissionTotalsFields {
  allowed?: number | null
  used?: number | null
  unused?: number | null
  gap_percentage?: number | null
  /** Sent when the four totals are withheld (IAM_USAGE_GENERATION_UNVERIFIED). */
  withheld_reason?: string | null
}

export interface UnusedPermissionsFields {
  resources?: {
    unused_permission_gaps?: number | null
    unused_permission_gaps_withheld_reason?: string | null
  } | null
  byCategory?: { permissions?: PermissionTotalsFields | null } | null
}

const PERMISSION_TOTAL_KEYS = ["allowed", "used", "unused", "gap_percentage"] as const

/** The permission totals are withheld: any of the four explicitly null, or a withheld reason sent. */
export function permissionTotalsWithheld(perm: PermissionTotalsFields | null | undefined): boolean {
  if (!perm || typeof perm !== "object") return false
  if (typeof perm.withheld_reason === "string" && perm.withheld_reason) return true
  return PERMISSION_TOTAL_KEYS.some((key) => perm[key] === null)
}

/**
 * The backend saying the unused-permission numbers are not computable:
 * `resources.unused_permission_gaps: null` (V2 usage unknown, or an unverified
 * IAM usage generation), or withheld `byCategory.permissions` totals. Only an
 * explicit null or a withheld reason withholds; a payload without the keys
 * (older backend) does not.
 */
export function unusedPermissionsWithheld(payload: UnusedPermissionsFields | null | undefined): boolean {
  return (
    (!!payload?.resources && payload.resources.unused_permission_gaps === null) ||
    permissionTotalsWithheld(payload?.byCategory?.permissions)
  )
}

/** The typed reason the unused-permission numbers are withheld, verbatim; null when none was sent. */
export function unusedPermissionsWithheldReason(payload: UnusedPermissionsFields | null | undefined): string | null {
  const reasons = uniqueStrings([
    payload?.resources?.unused_permission_gaps_withheld_reason,
    payload?.byCategory?.permissions?.withheld_reason,
  ])
  return reasons[0] ?? null
}

/** Copy for withheld unused-permission numbers. Surfaces use it verbatim beside "—" / Unknown. */
export const UNUSED_PERMISSIONS_UNAVAILABLE_COPY =
  "Unused-permission counts unavailable. This is not zero unused permissions."

/**
 * Operator sentence for withheld unused-permission numbers when the backend sent
 * a typed reason: the usage-withheld sentence, then that this is not zero. Null
 * when no reason was sent (callers keep their own sentence).
 */
export function unusedPermissionsWithheldReasonCopy(
  payload: UnusedPermissionsFields | null | undefined,
): string | null {
  const reason = unusedPermissionsWithheldReason(payload)
  return reason ? `${iamUsageWithheldCopy(reason)}. This is not zero unused permissions.` : null
}

// ── /api/least-privilege/metrics ───────────────────────────────────────

/**
 * The usage-derived fields of `MetricsResponse` (api/least_privilege.py). The
 * backend nulls them when the IAM usage they are read off is not verified, and
 * says why with the same `error_code` / `held_reason` pair a held BRSS uses.
 */
export interface LpMetricsHeldFields {
  averageBloatPercentage?: number | null
  rolesWithBloat?: number | null
  totalUnusedPermissions?: number | null
  error_code?: string | null
  held_reason?: string | null
}

/**
 * Held when any usage-derived value is not a finite number — the Wildcard
 * Bloat card then renders none of them (never 0 or 0%). Null when all three
 * are real numbers.
 */
export function lpMetricsHold(payload: LpMetricsHeldFields | null | undefined): BrssHold | null {
  if (!payload) return null
  if (
    isFiniteScore(payload.averageBloatPercentage) &&
    isFiniteScore(payload.rolesWithBloat) &&
    isFiniteScore(payload.totalUnusedPermissions)
  ) {
    return null
  }
  return {
    codes: uniqueStrings([payload.error_code]),
    reason: typeof payload.held_reason === "string" && payload.held_reason ? payload.held_reason : null,
  }
}

// ── Legacy home Gap Analysis card (app/page.tsx) ───────────────────────

/** The legacy home card's numbers. Null = withheld or not loaded: rendered Unknown, never 0. */
export interface HomeGapAnalysis {
  allowed: number | null
  used: number | null
  unused: number | null
  confidence: number | null
  roleName: string
  /** Why the numbers are withheld, when they are. */
  withheldCopy?: string | null
}

/**
 * The legacy home card from an issues-summary payload. Real totals are mapped
 * exactly as the page always mapped them. Withheld totals give nulls and the reason.
 */
export function homeGapAnalysisFromSummary(
  summary: (UnusedPermissionsFields & { resources?: { iam_roles?: number } | null }) | null | undefined,
): HomeGapAnalysis {
  const roleName = `${summary?.resources?.iam_roles || 0} IAM Roles Analyzed`
  if (unusedPermissionsWithheld(summary)) {
    return {
      allowed: null,
      used: null,
      unused: null,
      confidence: null,
      roleName,
      withheldCopy: unusedPermissionsWithheldReasonCopy(summary) ?? UNUSED_PERMISSIONS_UNAVAILABLE_COPY,
    }
  }
  const permissions = summary?.byCategory?.permissions || {}
  const allowed = permissions.allowed || 0
  const used = permissions.used || 0
  const unused = permissions.unused || (allowed - used)
  // Calculate confidence based on gap percentage
  const gapPct = permissions.gap_percentage || 0
  const confidence = allowed > 0 ? Math.min(99, Math.max(70, 100 - gapPct * 0.2)) : 0
  return { allowed, used, unused, confidence: Math.round(confidence), roleName }
}
