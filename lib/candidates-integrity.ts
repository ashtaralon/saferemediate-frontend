/**
 * Fail-closed integrity for `/api/proxy/remediation-candidates`.
 *
 * Third sibling of lib/summary-integrity.ts and lib/paths-integrity.ts.
 *
 * This one exists because the proxy answers an upstream failure with
 * HTTP 200 and a fully-formed but EMPTY body:
 *
 *     { candidates: [], summary: { auto_applicable: 0, blocked: 0 }, error: "…" }
 *
 * Every consumer that keys on the transport sees success. The queue card's
 * guard was `if ((error || bodyError) && !data)` — and `data` is that
 * object, so `!data` is false and the guard could never fire. The card
 * rendered "0 ready" and the cockpit counted the feed READY, which is the
 * precise false-zero this dashboard was rebuilt to stop.
 *
 * A payload carrying `error` is NOT a reading. It is a failure wearing a
 * success envelope.
 */

export type CandidatesServeState = "READY" | "UNAVAILABLE"

export interface CandidatesIntegrityFields {
  candidates?: unknown[]
  summary?: { auto_applicable?: number | null; blocked?: number | null } | null
  error?: string
}

export interface CandidatesIntegrity {
  state: CandidatesServeState
  /** The ONLY condition under which counts may be rendered as measurements. */
  canRenderCounts: boolean
  reason: string | null
}

export function deriveCandidatesIntegrity(raw: unknown): CandidatesIntegrity {
  const p = (raw ?? null) as CandidatesIntegrityFields | null
  if (!p || typeof p !== "object") {
    return { state: "UNAVAILABLE", canRenderCounts: false, reason: "no payload" }
  }
  // The whole point: a 200 that carries `error` is a failed read.
  if (p.error) {
    return { state: "UNAVAILABLE", canRenderCounts: false, reason: p.error }
  }
  if (!Array.isArray(p.candidates)) {
    return {
      state: "UNAVAILABLE",
      canRenderCounts: false,
      reason: "no candidates array — cannot vouch for an empty queue",
    }
  }
  return { state: "READY", canRenderCounts: true, reason: null }
}

/** localStorage gate — a failure body must never be cached as a reading. */
export function isCacheableCandidates(raw: unknown): boolean {
  return deriveCandidatesIntegrity(raw).state === "READY"
}
