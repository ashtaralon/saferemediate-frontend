"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * useCachedFetch — fetch with localStorage stale-while-revalidate (SWR).
 *
 * Use case: home-dashboard cards that hit slow fan-out proxies. The
 * FamilyStrip card was the first one users complained about — it
 * aggregates N+1 backend Cypher queries on every cache miss, and the
 * Render cold-start makes the first request take 30s+. Without SWR,
 * users see a long blank skeleton even on their second visit.
 *
 * Behavior:
 *   1. On mount, synchronously read cached value from localStorage.
 *      If found AND not older than `maxStaleMs`, render it immediately
 *      with `isStale: true` so the UI can optionally show a "fresh
 *      data loading" indicator.
 *   2. In parallel, kick off a background fetch.
 *   3. When the fetch returns, update both the rendered data and the
 *      localStorage entry with the new value.
 *   4. If the fetch fails, keep the stale data shown (no error flash).
 *      Only surface an error when there's no cached data at all.
 *
 * Cache key derivation: caller provides a stable string. Cache value
 * is stored as { ts: number, data: T } so we know when it was written.
 *
 * Storage budget: localStorage has a ~5 MB quota in most browsers.
 * Each cached entry's `JSON.stringify(data)` should fit comfortably.
 * If it doesn't, the setItem call throws QuotaExceededError; we catch
 * and silently skip the cache write (the live data still renders).
 */

interface CacheEntry<T> {
  ts: number
  data: T
}

export interface UseCachedFetchOptions {
  /** Stable key for localStorage. Required. */
  cacheKey: string
  /** Maximum age (ms) of a cache entry to display. Older entries are
   *  ignored on mount as if absent. Default 24h. */
  maxStaleMs?: number
  /** Pass-through to fetch. */
  fetchInit?: RequestInit
}

export interface UseCachedFetchResult<T> {
  data: T | null
  /** True when `data` is from localStorage and a background refresh is running. */
  isStale: boolean
  /** Timestamp (Date.now() ms) the rendered `data` was fetched. Null when
   *  data came from this session's network (i.e. fresh). Used by the UI
   *  to show "as of X min ago, refreshing" indicators when isStale=true.
   *  Critical for honest staleness signaling per
   *  feedback_no_mock_numbers_in_ui.md — the user must see when they're
   *  looking at cached data. */
  cachedAt: number | null
  /** True only on the first ever load with no cache available. */
  loading: boolean
  /** Surfaced ONLY when there's no cached fallback to show. */
  error: string | null
  /** Manual re-fetch. */
  retry: () => void
}

const CACHE_PREFIX = "cyntro:swr:"
const DEFAULT_MAX_STALE_MS = 24 * 60 * 60 * 1000 // 24h

function readCache<T>(key: string, maxAge: number): { data: T; ts: number } | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    if (typeof entry?.ts !== "number") return null
    if (Date.now() - entry.ts > maxAge) return null
    return { data: entry.data, ts: entry.ts }
  } catch {
    return null
  }
}

function writeCache<T>(key: string, data: T): void {
  if (typeof window === "undefined") return
  try {
    const entry: CacheEntry<T> = { ts: Date.now(), data }
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry))
  } catch {
    // QuotaExceededError or serialize failure — silently skip.
    // The live data still renders; we just don't cache for next time.
  }
}

export function useCachedFetch<T = unknown>(
  url: string | null,
  options: UseCachedFetchOptions,
): UseCachedFetchResult<T> {
  const { cacheKey, maxStaleMs = DEFAULT_MAX_STALE_MS, fetchInit } = options

  // Synchronous initial read so the first paint renders cached data
  // without a flash of the loading state.
  const initial = readCache<T>(cacheKey, maxStaleMs)
  const [data, setData] = useState<T | null>(initial?.data ?? null)
  const [isStale, setIsStale] = useState<boolean>(initial !== null)
  const [cachedAt, setCachedAt] = useState<number | null>(initial?.ts ?? null)
  // loading is true ONLY on first ever load with no cache. If we have
  // cached data to show, the user sees it instantly and any background
  // refresh is invisible (just isStale flips false when it lands).
  const [loading, setLoading] = useState<boolean>(initial === null && !!url)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const epochRef = useRef<number>(0)

  const fetchFresh = useCallback(async () => {
    if (!url) return
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    epochRef.current += 1
    const myEpoch = epochRef.current

    try {
      const res = await fetch(url, { ...fetchInit, signal: controller.signal })
      if (myEpoch !== epochRef.current) return
      if (!res.ok) {
        // Only surface error when we have no cached fallback to show.
        // Otherwise let the user keep seeing stale data — better than
        // an error flash over data they were just looking at.
        if (data === null) setError(`HTTP ${res.status}`)
        if (data === null) setLoading(false)
        return
      }
      const json = (await res.json()) as T
      if (myEpoch !== epochRef.current) return
      setData(json)
      setIsStale(false)
      // cachedAt = null means "this data is fresh from the network in
      // this session." The UI suppresses the stale indicator in that
      // case. Set to null explicitly so a previous cached-then-refreshed
      // render flips correctly.
      setCachedAt(null)
      setError(null)
      setLoading(false)
      writeCache(cacheKey, json)
    } catch (err) {
      if (myEpoch !== epochRef.current) return
      if (err instanceof Error && err.name === "AbortError") return
      if (data === null) {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      }
      // If we have cached data, swallow the error — keep showing stale.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, cacheKey, fetchInit])

  useEffect(() => {
    if (!url) return
    fetchFresh()
    return () => {
      abortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  const retry = useCallback(() => {
    setError(null)
    fetchFresh()
  }, [fetchFresh])

  return { data, isStale, cachedAt, loading, error, retry }
}
