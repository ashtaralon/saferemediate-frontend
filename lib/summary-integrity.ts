/**
 * Fail-closed integrity for `/api/proxy/issues-summary` and `/issues/summary`.
 *
 * The backend (api/issues_summary.py) now emits `serve_state`,
 * `analysis_complete` and `counts_are_partial` at the TOP LEVEL of the response,
 * on all three paths — success, held, and exception — and returns NULL counts
 * rather than zeros when it cannot vouch for them.
 *
 * That only helps if consumers stop coercing. The defect this module exists to
 * remove, from components/dashboard/v3/severity-donut-card.tsx:
 *
 *     const total = data.total ?? 0        // null -> 0 -> "all clear"
 *
 * An analyzer crash, a Neo4j outage, or a proxy timeout all arrive as `null`,
 * and `?? 0` turns every one of them into a clean bill of health on the card a
 * customer reads first.
 *
 * ONE RULE, everywhere: only an explicit READY + analysis_complete + a real
 * numeric total may render "all clear". Everything else — held, not-ready,
 * missing fields, success:false, stale cache — renders unavailable.
 */

export type SummaryServeState = "READY" | "INTEGRITY_HELD" | "NOT_READY"

export interface SummaryIntegrityFields {
  success?: boolean
  serve_state?: string
  analysis_complete?: boolean
  counts_are_partial?: boolean
  failed_analyzers?: string[]
  integrityReason?: string
  total?: number | null
  fromStaleCache?: boolean
  cacheAge?: number
  staleReason?: string
}

export interface SummaryIntegrity {
  state: SummaryServeState
  /** Counts may be shown, but only labelled as partial. */
  countsArePartial: boolean
  /** The ONLY condition under which "all clear" may be rendered. */
  canRenderAllClear: boolean
  /** Health / BRSS numbers must be suppressed unless this is true. */
  canRenderScores: boolean
  /** Destructive controls. A veto, never a grant — apply enforces its own. */
  mutationBlocked: boolean
  failedAnalyzers: string[]
  reason: string | null
}

/**
 * Derive integrity from a summary payload.
 *
 * Absence is NOT_READY. A payload with no integrity fields is one we cannot
 * vouch for — and treating silence as health is the exact defect being removed.
 * It also means a backend rollback cannot silently re-enable the false-safe
 * path, and that the FE can deploy BEFORE the backend without lying in the gap.
 */
export function deriveSummaryIntegrity(
  payload: SummaryIntegrityFields | null | undefined,
): SummaryIntegrity {
  const failed = payload?.failed_analyzers ?? []

  // Any ONE of these is disqualifying.
  const explicitFailure = payload?.success === false
  const stale = payload?.fromStaleCache === true
  const complete = payload?.analysis_complete === true
  const declaredReady = payload?.serve_state === "READY"

  let state: SummaryServeState
  if (!payload || explicitFailure || stale) {
    state = "NOT_READY"
  } else if (payload.serve_state === "INTEGRITY_HELD") {
    state = "INTEGRITY_HELD"
  } else if (payload.serve_state === "NOT_READY") {
    state = "NOT_READY"
  } else if (declaredReady && complete) {
    state = "READY"
  } else {
    // Missing / unrecognised serve_state, or READY without analysis_complete.
    state = "NOT_READY"
  }

  const ready = state === "READY"
  // `typeof === "number"` and not NaN. `total > 0` would read null as false and
  // land straight back in the all-clear branch.
  const totalIsReal = typeof payload?.total === "number" && !Number.isNaN(payload.total)

  return {
    state,
    countsArePartial: !ready || payload?.counts_are_partial === true,
    canRenderAllClear: ready && totalIsReal && payload!.total === 0,
    canRenderScores: ready,
    mutationBlocked: !ready,
    failedAnalyzers: failed,
    reason: payload?.integrityReason ?? null,
  }
}

/**
 * True when a payload may be written to a cache as authoritative.
 *
 * Caching a held or failed response is how one transient blip becomes minutes
 * of confidently wrong answers — and a cached `serve_state: READY` replayed
 * later carries authority it no longer has.
 */
export function isCacheableSummary(payload: SummaryIntegrityFields | null | undefined): boolean {
  if (!payload) return false
  if (payload.success === false) return false
  if (payload.serve_state !== "READY") return false
  if (payload.analysis_complete !== true) return false
  return true
}

/** Copy shown wherever counts are withheld. Kept here so it reads the same everywhere. */
export function summaryIntegrityCopy(integrity: SummaryIntegrity): { title: string; body: string } {
  if (integrity.state === "INTEGRITY_HELD") {
    const names = integrity.failedAnalyzers.filter((n) => n !== "graph_unavailable")
    return {
      title: "Incomplete analysis",
      body:
        integrity.reason ??
        `${names.length || "Some"} analyzer${names.length === 1 ? "" : "s"} did not finish${
          names.length ? ` (${names.join(", ")})` : ""
        }. Counts below are a floor, not a total.`,
    }
  }
  return {
    title: "Analysis unavailable",
    body:
      integrity.reason ??
      "These counts could not be computed. This is not an empty result set — it is an absence of one.",
  }
}
