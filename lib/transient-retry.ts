/**
 * Canonical transient-failure retry for proxy reads.
 *
 * A Render cold-start answers the first request with 502/503/504 and the next
 * one with real data. Surfaces that read through `/api/proxy/*` without
 * retrying paint whatever their state was initialised to — which, for a counter
 * initialised to `0`, reads to an operator as "nothing to fix".
 *
 * This module owns the ONE definition of what counts as retryable. Both hooks
 * (`useCachedFetch`, `useRetryFetch`) previously carried their own byte-identical
 * copy; they now import from here, so the three consumers cannot drift apart.
 * Callers that cannot use a hook — imperative loaders, anything inside a
 * `Promise.all` — use `fetchWithTransientRetry` and get the same semantics.
 *
 * BUDGET. The default is ONE extra attempt, deliberately. The Overview's proxy
 * routes abort at 55s, so two attempts is already a ~110s worst case before the
 * operator sees anything. A third attempt would push a cold-start toward three
 * minutes of spinner — at which point the retry is worse than the honest
 * "unavailable" state it exists to avoid. Callers that genuinely want more must
 * ask for it explicitly and own the wait.
 */

/** Statuses worth one more attempt: proxy/upstream hiccups, not real answers. */
export const TRANSIENT_STATUSES: ReadonlySet<number> = new Set([
  408, 425, 429, 502, 503, 504, 522, 524,
])

export function isTransientStatus(status: number): boolean {
  return TRANSIENT_STATUSES.has(status)
}

export interface TransientRetryOptions {
  /**
   * Extra attempts after the first. Default 1 (so at most 2 requests).
   * See BUDGET above before raising it.
   */
  retries?: number
  /** Linear backoff; attempt N waits `backoffMs * (N + 1)`. */
  backoffMs?: number
  init?: RequestInit
}

/**
 * Fetch, retrying only on transient statuses.
 *
 * Returns the final `Response` — including a failing one, so the caller still
 * decides what failure means. It deliberately does NOT swallow the failure into
 * a null or empty result: that is precisely the shape that lets a failed read
 * render as a confident zero.
 *
 * A thrown fetch (network/abort) propagates to the caller's catch, unchanged.
 */
export async function fetchWithTransientRetry(
  url: string,
  { retries = 1, backoffMs = 400, init }: TransientRetryOptions = {},
): Promise<Response> {
  const maxAttempts = 1 + Math.max(0, retries)
  let res: Response | undefined

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    res = await fetch(url, init)
    if (res.ok || !isTransientStatus(res.status) || attempt === maxAttempts - 1) {
      return res
    }
    await new Promise((resolve) => setTimeout(resolve, backoffMs * (attempt + 1)))
  }

  // Unreachable: the loop always returns on its final attempt.
  return res as Response
}
