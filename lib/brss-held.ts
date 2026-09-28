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
 *       held_reason, ... }, integrityReason?, failed_analyzer_codes? }
 *
 * The rule every consumer follows: when the score is not a finite number,
 * render the typed code(s) and the backend's own reason. Never a previous
 * score, a legacy score, a cached number, 0, or a computed stand-in.
 */

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
 * The V2-usage-unknown branch of api/issues_summary.py sends a reason but no
 * typed code; `codes` is then empty rather than a code guessed from prose.
 */
export function issuesSummaryBrssHold(
  payload: IssuesSummaryBrssFields | null | undefined,
): BrssHold | null {
  const brss = payload?.blast_radius_score
  if (!brss || typeof brss !== "object") return null
  if (isFiniteScore(brss.score)) return null
  return {
    codes: summaryAnalyzerCodes(payload),
    reason:
      (typeof brss.held_reason === "string" && brss.held_reason) ||
      (typeof payload?.integrityReason === "string" && payload.integrityReason) ||
      null,
  }
}
