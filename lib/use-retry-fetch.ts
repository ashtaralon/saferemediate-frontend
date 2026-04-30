"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * useRetryFetch — fetch a JSON endpoint with exponential backoff on
 * transient failures. Designed for the V3 home dashboard cards, which
 * the design review caught permanently stuck on "HTTP 504" after a
 * cold-start request hit a Vercel proxy timeout — even though the
 * underlying endpoint started responding in <1s seconds later.
 *
 * What counts as transient:
 *   - HTTP 502, 503, 504 (proxy / upstream timeouts)
 *   - HTTP 408 (request timeout)
 *   - HTTP 425 (early data, retryable)
 *   - HTTP 429 (rate limit; honor server timing where possible)
 *   - HTTP 522 / 524 (Cloudflare-style timeouts)
 *   - Network errors (TypeError thrown by fetch)
 *   - AbortError when triggered by the timeout, not the unmount
 *
 * What is NOT transient (no retry, surface error to user):
 *   - 4xx other than the ones above (400, 401, 403, 404, 422, ...)
 *   - 5xx with a body that explicitly opts out (we don't currently
 *     parse this, but the door is left open via parseError)
 *
 * Backoff schedule: 250ms, 500ms, 1000ms, 2000ms, capped at maxDelayMs.
 * Default maxRetries = 3 (so a card cold-starting hits the endpoint up
 * to 4 times within ~3.75 seconds before giving up). The first attempt
 * fires immediately on mount; subsequent attempts wait the backoff.
 *
 * Cleans up on unmount: aborts any in-flight fetch + cancels any
 * pending retry timer. Safe inside StrictMode (double-mount won't
 * leak fetches).
 */

const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 502, 503, 504, 522, 524])

export interface UseRetryFetchOptions {
  /** Maximum number of retries AFTER the initial attempt. Default 0.
   *
   * Originally this defaulted to 3 to auto-recover from cold-start 504s.
   * That caused multiple cascading bugs (commits 862ab4c → 13f2ba1 →
   * 4b99de2 → THIS commit) where retries either took too long or got
   * stuck in abort loops. Default-off until the cards that actually
   * benefit from retry opt in via this prop. */
  maxRetries?: number
  /** Initial backoff delay (ms). Doubles each retry. Default 250. */
  initialDelayMs?: number
  /** Cap for backoff delay (ms). Default 4000. */
  maxDelayMs?: number
  /** Per-attempt fetch timeout (ms). Default 0 = no timeout.
   *
   * Originally defaulted to 30s, then 15s, then 45s. None worked: the
   * timer aborts in-flight requests that would have eventually
   * succeeded, which caused users to see permanently-stuck cards while
   * Render was cold-starting. Default off so the browser's natural
   * timeout (~5 min) handles the worst case. Cards with known-fast
   * endpoints can still set timeoutMs explicitly. */
  timeoutMs?: number
  /** RequestInit for fetch (cache, headers, etc.). */
  fetchInit?: RequestInit
  /** When changed, triggers a re-fetch. */
  refetchKey?: string | number
  /** Override transient-status detection (e.g. include 500). */
  isTransientStatus?: (status: number) => boolean
}

export interface UseRetryFetchResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  /** 0-indexed attempt number that's currently in flight or just finished. */
  attempt: number
  /** True between attempts while the backoff timer is running. */
  retrying: boolean
  /** Manual retry — resets attempt counter and tries again. */
  retry: () => void
}

export function useRetryFetch<T = unknown>(
  url: string | null,
  options: UseRetryFetchOptions = {}
): UseRetryFetchResult<T> {
  const {
    maxRetries = 0,
    initialDelayMs = 250,
    maxDelayMs = 4000,
    timeoutMs = 0,
    fetchInit,
    refetchKey,
    isTransientStatus,
  } = options

  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState<boolean>(!!url)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState<number>(0)
  const [retrying, setRetrying] = useState<boolean>(false)

  // Stable refs for cleanup. We track BOTH the AbortController for the
  // in-flight fetch AND the retry timer so unmount cancels everything.
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Versioned cancellation token: increments on retry/unmount so a
  // stale promise resolving after we've moved on can't write state.
  const epochRef = useRef<number>(0)

  const transientCheck = isTransientStatus ?? ((s: number) => TRANSIENT_HTTP_STATUSES.has(s))

  const cleanup = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const runAttempt = useCallback(
    async (attemptIndex: number, myEpoch: number) => {
      if (!url) return
      cleanup()
      const controller = new AbortController()
      abortRef.current = controller

      // Per-attempt timeout — only armed when timeoutMs > 0. The hook's
      // default is 0 (no timeout) because aborting in-flight requests
      // that would have eventually succeeded was the actual root cause
      // of the "page stuck loading" bug across commits 862ab4c →
      // 13f2ba1 → 4b99de2. Cards can still opt in to a timeout when
      // they have a known-fast endpoint.
      const timeoutId = timeoutMs > 0
        ? setTimeout(() => {
            controller.abort(new DOMException("Request timed out", "TimeoutError"))
          }, timeoutMs)
        : null

      setAttempt(attemptIndex)
      setLoading(true)
      setRetrying(false)

      try {
        const res = await fetch(url, {
          ...fetchInit,
          signal: controller.signal,
        })
        if (timeoutId !== null) clearTimeout(timeoutId)

        if (myEpoch !== epochRef.current) return // superseded

        if (!res.ok) {
          // Try to parse a JSON body for a useful error message; fall
          // back to a generic HTTP code label.
          let bodyMessage = `HTTP ${res.status}`
          try {
            const body = await res.json()
            if (typeof body?.message === "string") bodyMessage = body.message
            else if (typeof body?.error === "string") bodyMessage = body.error
          } catch {
            /* ignore — body wasn't JSON */
          }

          if (transientCheck(res.status) && attemptIndex < maxRetries) {
            const delay = Math.min(initialDelayMs * 2 ** attemptIndex, maxDelayMs)
            setRetrying(true)
            setError(null) // don't flash the error while retry is queued
            timerRef.current = setTimeout(() => {
              if (myEpoch === epochRef.current) {
                runAttempt(attemptIndex + 1, myEpoch)
              }
            }, delay)
            return
          }

          // Non-transient OR retries exhausted — surface to caller.
          setError(bodyMessage)
          setData(null)
          setLoading(false)
          setRetrying(false)
          return
        }

        const json = (await res.json()) as T
        if (myEpoch !== epochRef.current) return
        setData(json)
        setError(null)
        setLoading(false)
        setRetrying(false)
      } catch (err) {
        if (timeoutId !== null) clearTimeout(timeoutId)
        if (myEpoch !== epochRef.current) return // superseded by retry/unmount

        // Bug-fix (2026-04-30 — second user report): the original logic
        // treated our own TimeoutError as a transient failure worth
        // retrying. That meant a slow-but-eventually-successful backend
        // (Render cold-start, slow Cypher query) got its in-flight
        // request aborted, retried, aborted again, retried again — the
        // user saw a card permanently stuck in a "loading → retrying →
        // loading → retrying" loop instead of just waiting for the
        // backend to respond.
        //
        // New rule: only RETRY for genuine network-layer failures
        // (TypeError thrown by fetch when the connection itself fails).
        // Our own timeouts are FATAL — we set the timeout precisely
        // because we believe waiting longer won't help; retrying with
        // a fresh request that has the same timeout guarantees nothing.
        const name = err instanceof Error ? err.name : ""
        const isOurTimeout = name === "TimeoutError" || name === "AbortError"
        const isNetworkError = err instanceof TypeError

        if (isNetworkError && attemptIndex < maxRetries) {
          const delay = Math.min(initialDelayMs * 2 ** attemptIndex, maxDelayMs)
          setRetrying(true)
          setError(null)
          timerRef.current = setTimeout(() => {
            if (myEpoch === epochRef.current) {
              runAttempt(attemptIndex + 1, myEpoch)
            }
          }, delay)
          return
        }

        const message = err instanceof Error ? err.message : String(err)
        const finalMessage = isOurTimeout
          ? `Request timed out after ${Math.round(timeoutMs / 1000)}s — backend may be cold-starting; click Retry to try again`
          : message || "Network error"
        setError(finalMessage)
        setData(null)
        setLoading(false)
        setRetrying(false)
      }
    },
    [url, maxRetries, initialDelayMs, maxDelayMs, timeoutMs, fetchInit, transientCheck, cleanup]
  )

  const retry = useCallback(() => {
    epochRef.current += 1
    cleanup()
    runAttempt(0, epochRef.current)
  }, [cleanup, runAttempt])

  useEffect(() => {
    if (!url) {
      cleanup()
      setData(null)
      setLoading(false)
      setError(null)
      setAttempt(0)
      setRetrying(false)
      return
    }
    epochRef.current += 1
    runAttempt(0, epochRef.current)
    return () => {
      epochRef.current += 1
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, refetchKey])

  return { data, loading, error, attempt, retrying, retry }
}
