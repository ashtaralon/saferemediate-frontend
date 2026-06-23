/**
 * Tiny in-memory cache for proxy routes.
 *
 * Used to avoid hammering Render's slow Neo4j-backed endpoints on
 * every dashboard render. Each fan-out proxy keys its result and
 * serves the cached value within TTL.
 *
 * Lives in the Next.js Lambda's process memory — survives across
 * requests on the same instance, gets dropped on cold start. For our
 * scale this is fine; Redis is overkill.
 */

type Entry<T = unknown> = {
  data: T
  expiresAt: number
}

const cache = new Map<string, Entry>()

export function getCached<T = unknown>(key: string): T | null {
  const entry = cache.get(key) as Entry<T> | undefined
  if (!entry) return null
  if (Date.now() > entry.expiresAt) return null
  return entry.data
}

/** Return cached data even past TTL — for timeout degradation only. */
export function getStaleCached<T = unknown>(key: string): T | null {
  const entry = cache.get(key) as Entry<T> | undefined
  return entry?.data ?? null
}

export function setCached<T = unknown>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs })
}

export function clearCached(key: string): void {
  cache.delete(key)
}

/**
 * Standard cache TTLs. Pick by data volatility.
 */
export const TTL_FAST = 30_000 // 30s — cards that move quickly
export const TTL_STD = 60_000 // 1m — most fan-out proxies
export const TTL_SLOW = 300_000 // 5m — heavy aggregations that rarely change
