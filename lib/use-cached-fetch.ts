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
  /**
   * Wave D / snapshot contract: backend returned HTTP 200
   * `{ status: "computing" }` with a null payload. When we already have
   * usable cached data, we KEEP showing it (isStale=true) and set this
   * so callers can poll — never blank the UI for a peer lock.
   */
  isComputing: boolean
  /** Surfaced ONLY when there's no cached fallback to show. */
  error: string | null
  /** Manual re-fetch. */
  retry: () => void
}

const CACHE_PREFIX = "cyntro:swr:"
const DEFAULT_MAX_STALE_MS = 24 * 60 * 60 * 1000 // 24h

// Defensive render-time filter against the specific phantom-edge class
// surfaced by the backend verify-gate (2026-05-29 dep_map_full step-10
// COALESCE bug): an edge whose source or target is a raw Neo4j elementId
// like "4:e1c412d2-04c0-4554-a49b-ce0cd85dbb91:71" — not a real AWS id
// or ARN, and not joinable against any other consumer. The backend now
// rejects these via the gate, but a cached payload written BEFORE the
// fix could still serve one to the renderer on this user's next visit
// (per feedback_frontend_cache_can_serve_stale_phantoms: "backend
// filter only protects fresh responses; localStorage SWR can resurface
// cached pre-fix payloads"). Mirror the filter here so render-time
// drops these regardless of cache age.
//
// Pattern: <int>:<uuid>:<int> — Neo4j 5+ elementId format. Same regex
// as the gate's identity check. Adding a new bad-id pattern is one
// regex edit here.
const NEO4J_ELEMENT_ID_RE = /^\d+:[a-z0-9-]+:\d+$/i

function looksLikePhantomId(value: unknown): boolean {
  return typeof value === "string" && NEO4J_ELEMENT_ID_RE.test(value)
}

/**
 * Walk an arbitrary API response and drop edges whose source/target
 * looks like a phantom (raw Neo4j elementId). Recognizes both the
 * MapEdge/PathEdge shape (`source`/`target` keys) and the CanvasEdge
 * shape (`source_aws_id`/`target_aws_id`). Logs once per cache key
 * when something is filtered so the console flags lingering cached
 * pre-fix payloads — silent filtering would hide them.
 *
 * Returns the cleaned value and a count of edges dropped.
 */
function sanitizePhantomEdges(value: unknown): { cleaned: unknown; dropped: number } {
  let dropped = 0
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      const out: unknown[] = []
      for (const item of v) {
        // Edge-shaped object check before recursing — drop the whole edge
        // if either endpoint is a phantom id. Don't try to recurse INTO a
        // dropped edge.
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const obj = item as Record<string, unknown>
          const flatPhantom =
            "source" in obj && "target" in obj &&
            (looksLikePhantomId(obj.source) || looksLikePhantomId(obj.target))
          const canvasPhantom =
            "source_aws_id" in obj && "target_aws_id" in obj &&
            (looksLikePhantomId(obj.source_aws_id) || looksLikePhantomId(obj.target_aws_id))
          if (flatPhantom || canvasPhantom) {
            dropped += 1
            continue
          }
        }
        out.push(walk(item))
      }
      return out
    }
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {}
      for (const [k, vv] of Object.entries(v as Record<string, unknown>)) {
        out[k] = walk(vv)
      }
      return out
    }
    return v
  }
  const cleaned = walk(value)
  return { cleaned, dropped }
}

function readCache<T>(key: string, maxAge: number): { data: T; ts: number } | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    if (typeof entry?.ts !== "number") return null
    if (Date.now() - entry.ts > maxAge) return null
    // Apply the phantom-edge filter on every read. A payload written
    // before the backend fix may still be in localStorage, and the user
    // would see the orphan elementId target on the canvas without this.
    const { cleaned, dropped } = sanitizePhantomEdges(entry.data)
    if (dropped > 0) {
      // Loud log: lingering cached pre-fix payload caught at render time.
      // Stays visible in DevTools so the dev knows the cache filter
      // earned its keep.
      // eslint-disable-next-line no-console
      console.warn(
        `[useCachedFetch] dropped ${dropped} phantom edge(s) from cached ` +
          `payload key=${key}. Likely a pre-2026-05-29 backend response ` +
          `where dep_map step-10 emitted Neo4j elementId targets.`,
      )
    }
    return { data: cleaned as T, ts: entry.ts }
  } catch {
    return null
  }
}

/** Read cache without applying a maxAge filter — used as the "last
 *  resort" fallback when a fresh fetch fails. Better to show 6-hour
 *  old data with a clear stale indicator than to show a blank error
 *  to an operator trying to work. The hard cap is 7 days — beyond
 *  that the data is too dated to be useful even as fallback. */
const FALLBACK_HARD_CAP_MS = 7 * 24 * 60 * 60 * 1000
function readCacheAny<T>(key: string): { data: T; ts: number } | null {
  return readCache<T>(key, FALLBACK_HARD_CAP_MS)
}

export function clearCachedFetch(key: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(CACHE_PREFIX + key)
  } catch {
    // ignore
  }
}

export function writeCache<T>(key: string, data: T): void {
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
  //
  // Two-tier read:
  //   1. Fresh-within-maxStaleMs cache → render as authoritative, no
  //      stale indicator. Background refresh confirms it.
  //   2. Older cache (up to FALLBACK_HARD_CAP_MS=7d) → render with
  //      isStale=true so the UI shows "as of N ago, refreshing" pill.
  //      Beats showing a loading skeleton when N=15 parallel proxy
  //      calls on the home dashboard exceed Vercel's Lambda concurrency
  //      limit and individual cards 504. Stale data is honest signal
  //      with a clear indicator; a stuck skeleton is the dishonest
  //      mode — it reads as "loading forever" not "Vercel overloaded".
  const fresh = readCache<T>(cacheKey, maxStaleMs)
  const initial = fresh ?? readCacheAny<T>(cacheKey)
  const [data, setData] = useState<T | null>(initial?.data ?? null)
  const [isStale, setIsStale] = useState<boolean>(initial !== null && fresh === null)
  const [cachedAt, setCachedAt] = useState<number | null>(initial?.ts ?? null)
  // loading is true ONLY when there is NO cache at all (first ever
  // visit to this card). If we have any cached data (even 6h old), we
  // show it instantly and background-refresh — no skeleton flash.
  const [loading, setLoading] = useState<boolean>(initial === null && !!url)
  const [isComputing, setIsComputing] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Re-sync rendered state when `cacheKey` changes mid-mount — e.g. the
  // estate map's VPC scope picker swaps to a different scoped key, or a
  // search box re-keys per query. The synchronous cache read above only
  // runs on the FIRST render (useState initializers run once), so without
  // this the hook keeps showing the PREVIOUS key's `data` until the new
  // fetch resolves. Two real failure modes that caused:
  //   1. Transient: the old scope's numbers linger under the new scope's
  //      label during the (cold-backend, multi-second) refetch.
  //   2. Sticky: if the new scoped fetch FAILS, the catch below only
  //      surfaces the error when `data === null` — but `data` still holds
  //      the old scope's payload, so the error is swallowed and the
  //      operator sees the WRONG scope's data indefinitely, with no stale
  //      indicator. (Estate map: switch VPC → EC2 chip stuck on the old
  //      VPC's count.)
  // Fix: on key change, re-read the NEW key's cache synchronously (React's
  // documented "adjust state while rendering" pattern — guarded by
  // prevKeyRef so it runs once per change, no loop) and reset the derived
  // state to match, exactly as the mount-time init above does. Consumers
  // with a static cacheKey (most dashboard cards) never enter this branch,
  // so their behavior is unchanged.
  const prevKeyRef = useRef<string>(cacheKey)
  if (prevKeyRef.current !== cacheKey) {
    prevKeyRef.current = cacheKey
    const nextFresh = readCache<T>(cacheKey, maxStaleMs)
    const nextInitial = nextFresh ?? readCacheAny<T>(cacheKey)
    setData(nextInitial?.data ?? null)
    setIsStale(nextInitial !== null && nextFresh === null)
    setCachedAt(nextInitial?.ts ?? null)
    setLoading(nextInitial === null && !!url)
    setIsComputing(false)
    setError(null)
  }

  // Why no AbortController on cleanup: 15+ dashboard cards each call this
  // hook in parallel on initial mount. If any of them re-runs the effect
  // (URL change, parent re-render with new dep) the previous in-flight
  // fetch was being aborted, surfacing as a wall of red "(canceled)"
  // rows in DevTools Network tab and confusing operators into thinking
  // the proxies were broken. The epochRef counter below already discards
  // stale results — letting the fetch complete naturally costs a small
  // amount of wasted bandwidth but eliminates the visible noise.
  // Operator's network tab is now clean.
  const epochRef = useRef<number>(0)

  const fetchFresh = useCallback(async () => {
    if (!url) return
    epochRef.current += 1
    const myEpoch = epochRef.current

    try {
      const res = await fetch(url, { ...fetchInit })
      if (myEpoch !== epochRef.current) return
      if (!res.ok) {
        // Only surface error when we have no cached fallback to show
        // — including older-than-maxStaleMs cache, which we can use as
        // last-resort fallback. Better to show 6h-old data with a
        // clear "as of 6h ago, refreshing" pill than to block the
        // operator with a 504 error message.
        if (data === null) {
          const fallback = readCacheAny<T>(cacheKey)
          if (fallback) {
            setData(fallback.data)
            setIsStale(true)
            setCachedAt(fallback.ts)
            setLoading(false)
            return
          }
          setError(`HTTP ${res.status}`)
          setLoading(false)
        }
        return
      }
      const json = (await res.json()) as T & { fromStaleCache?: boolean }
      if (myEpoch !== epochRef.current) return
      const proxyStale = json.fromStaleCache === true
      // Defensive double-check on FRESH responses too. The backend gate
      // makes phantom edges impossible to ship in new deploys, but if
      // a CI gap or a hot-fix bypass ever lets one through, this
      // catches it at the render boundary so the operator never sees
      // an orphan elementId on the canvas.
      const { cleaned, dropped } = sanitizePhantomEdges(json)
      if (dropped > 0) {
        // eslint-disable-next-line no-console
        console.error(
          `[useCachedFetch] FRESH response key=${cacheKey} contained ` +
            `${dropped} phantom edge(s) — backend gate failed to catch ` +
            `this. Filtered at render. Investigate the contract coverage.`,
        )
      }
      const sanitized = cleaned as T
      // Wave D computing envelopes are HTTP 200 with null payloads — never
      // write them into client cache or Estate Map sticks on "No system_kpis".
      const envelope = sanitized as { status?: string; system_kpis?: unknown }
      const isComputingEnvelope =
        envelope.status === "computing" &&
        (envelope.system_kpis == null || envelope.system_kpis === undefined)
      if (isComputingEnvelope) {
        // Keep last-good map on screen; only show the empty computing
        // envelope when we have nothing else to render.
        const fallback =
          (data != null ? { data, ts: cachedAt ?? Date.now() } : null) ??
          readCacheAny<T>(cacheKey)
        if (fallback?.data) {
          setData(fallback.data)
          setIsStale(true)
          setCachedAt(fallback.ts)
          setIsComputing(true)
          setError(null)
          setLoading(false)
          return
        }
        setData(sanitized)
        setIsStale(false)
        setCachedAt(null)
        setIsComputing(true)
        setError(null)
        setLoading(false)
        return
      }
      setData(sanitized)
      setIsComputing(false)
      if (proxyStale) {
        setIsStale(true)
        setCachedAt(cachedAt ?? Date.now())
      } else {
        setIsStale(false)
        setCachedAt(null)
        writeCache(cacheKey, sanitized)
      }
      setError(null)
      setLoading(false)
    } catch (err) {
      if (myEpoch !== epochRef.current) return
      if (data === null) {
        // Same fallback as the !res.ok path — try last-resort cache
        // first before erroring. Keeps the operator's screen populated
        // with usable data rather than a 504 message.
        const fallback = readCacheAny<T>(cacheKey)
        if (fallback) {
          setData(fallback.data)
          setIsStale(true)
          setCachedAt(fallback.ts)
          setLoading(false)
          return
        }
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
    // No cleanup: see comment above on the AbortController removal.
    // Stale results are discarded by the epochRef check inside
    // fetchFresh — there is nothing to clean up here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  const retry = useCallback(() => {
    setError(null)
    fetchFresh()
  }, [fetchFresh])

  return { data, isStale, cachedAt, loading, isComputing, error, retry }
}
