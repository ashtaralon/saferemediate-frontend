/**
 * Analysis integrity for Least-Privilege / Resource Risk surfaces.
 *
 * The backend (`unified/lp/endpoint.py`) tells us whether the analyzer sweep
 * that produced a payload actually completed. It deliberately does NOT tell us
 * whether anything may be mutated:
 *
 *   > Analyzer integrity can veto mutation, but it cannot authorize mutation.
 *
 * A complete sweep proves only that every analyzer returned. It proves nothing
 * about CloudTrail coverage, observation-window continuity, data-event
 * selectors, or a signed plan. So `analysis_complete === true` means "this
 * analysis may be PRESENTED as complete" and never "this may be APPLIED".
 * There is no `mutations_allowed` field and there must not be one — a field
 * that can say yes eventually gets set to yes.
 *
 * `mutationBlocked` below is a VETO derived from analysis state. It is not
 * permission. Apply authority comes from the mutation/coverage gate at the
 * apply endpoint, which enforces independently — the UI is a courtesy to an
 * honest operator, not a security boundary.
 */

export type LPServeState = "READY" | "INTEGRITY_HELD" | "NOT_READY"

/** The integrity fields any LP payload may carry. All optional: older
 *  responses (and cached ones written before the backend change) have none. */
export interface LPIntegrityFields {
  serve_state?: string
  analysis_complete?: boolean
  failedAnalyzers?: string[]
  failed_analyzers?: string[]
  integrityReason?: string
  counts_are_partial?: boolean
}

export interface LPIntegrity {
  state: LPServeState
  /** True only when the backend positively said the sweep completed. */
  analysisComplete: boolean
  /** Veto on destructive controls. Never a grant. */
  mutationBlocked: boolean
  /** Counts and totals in this payload are a subset of unknown size. */
  countsArePartial: boolean
  failedAnalyzers: string[]
  reason: string | null
}

/**
 * Derive integrity from a payload.
 *
 * Absent fields resolve to NOT_READY, not READY. A payload with no integrity
 * information is one we cannot vouch for — treating silence as health is the
 * exact defect this whole change set exists to remove, and it would also mean
 * a backend rollback silently re-enabled Apply everywhere.
 */
export function deriveLPIntegrity(
  payload: LPIntegrityFields | null | undefined,
): LPIntegrity {
  const failed = payload?.failedAnalyzers ?? payload?.failed_analyzers ?? []

  // Explicit boolean check. `undefined` must not pass as complete, and a
  // truthy-ish value is not the same as `true`.
  const analysisComplete = payload?.analysis_complete === true

  let state: LPServeState
  if (payload?.serve_state === "READY" && analysisComplete) {
    state = "READY"
  } else if (payload?.serve_state === "NOT_READY") {
    state = "NOT_READY"
  } else if (payload?.serve_state === "INTEGRITY_HELD") {
    state = "INTEGRITY_HELD"
  } else {
    // Unknown or missing serve_state — including a stale cached payload from
    // before the backend emitted these fields.
    state = "NOT_READY"
  }

  return {
    state,
    analysisComplete,
    mutationBlocked: state !== "READY",
    countsArePartial: payload?.counts_are_partial === true || state !== "READY",
    failedAnalyzers: failed,
    reason: payload?.integrityReason ?? null,
  }
}

/** True when NOT_READY is a stale/timeout fallback, not "never analyzed". */
export function isStaleAnalysisReason(reason: string | null | undefined): boolean {
  if (!reason) return false
  return /timed out|stale|last complete analysis|warming/i.test(reason)
}

/** Copy for the banner. Kept here so every surface says the same thing. */
export function lpIntegrityCopy(integrity: LPIntegrity): {
  title: string
  body: string
} {
  if (integrity.state === "NOT_READY") {
    // Stale-cache / timeout paths still show rows; "did not run" is a lie when
    // the proxy forced NOT_READY over a previous complete payload.
    if (isStaleAnalysisReason(integrity.reason)) {
      return {
        title: "Live analysis unavailable",
        body:
          integrity.reason ??
          "Showing the last complete analysis. Remediation stays blocked until a fresh sweep succeeds.",
      }
    }
    return {
      title: "Analysis did not run",
      body:
        integrity.reason ??
        "No analysis is available for this view. An empty list here does not mean there is nothing to fix.",
    }
  }
  const names = integrity.failedAnalyzers.filter((n) => n !== "graph_unavailable")
  return {
    title: "Incomplete analysis",
    body:
      integrity.reason ??
      `${names.length || "Some"} analyzer${names.length === 1 ? "" : "s"} did not finish${
        names.length ? ` (${names.join(", ")})` : ""
      }. Anything they would have flagged is missing from this list — absent, not cleared.`,
  }
}
