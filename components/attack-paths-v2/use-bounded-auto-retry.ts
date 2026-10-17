import { useEffect, useRef } from "react"

/**
 * AP201: a soft, BOUNDED auto-retry for a background read that failed on transport (a cold backend).
 *
 * Unbounded, the Attack Paths page re-read a failed backend every `delayMs` for as long as the tab stayed open
 * (measured in the harness: 4 IAP reads in 25 s, 25 in a session) — V3-PERF-06 forbids that. After `limit`
 * retries only the manual Retry remains; a successful read resets the budget. The caller decides what counts as
 * transport (502 / 504), so a final answer (4xx, a typed hold) is never retried here.
 */
export function useBoundedAutoRetry(args: {
  error: unknown
  data: unknown
  loading: boolean
  retry: () => void
  limit: number
  delayMs: number
  isTransient: (error: unknown) => boolean
  /** A different read (e.g. the URL) gets its own budget; the exhausted budget of the last one must not carry over. */
  resetKey?: unknown
}): void {
  const { error, data, loading, retry, limit, delayMs, isTransient, resetKey } = args
  const retriesRef = useRef(0)
  useEffect(() => {
    if (data != null) retriesRef.current = 0
  }, [data])
  useEffect(() => {
    retriesRef.current = 0
  }, [resetKey])
  useEffect(() => {
    if (!error || data != null || loading) return
    if (!isTransient(error)) return
    if (retriesRef.current >= limit) return
    const t = setTimeout(() => {
      retriesRef.current += 1
      retry()
    }, delayMs)
    return () => clearTimeout(t)
  }, [error, data, loading, retry, limit, delayMs, isTransient])
}
