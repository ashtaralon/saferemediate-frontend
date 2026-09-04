import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, getStaleCached, setCached, TTL_STD } from "@/lib/server/proxy-cache"

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

// AP3-104 target catalog. Per-attempt budget is 15s (plan §11 as amended):
// the backend reads are three labeled Cypher statements pinned to the active
// generation, and a cold Render never needs the full 55s that the older
// attack-path proxies tolerate. Stale fallback is honest — it carries
// fromStaleCache + staleReason and never re-labels a NOT_READY as READY.
const ATTEMPT_TIMEOUT_MS = 15_000

function cacheKey(systemName: string): string {
  return `ap-targets:${systemName}`
}

/** GET /api/attack-paths/{system}/targets — inventory-first crown-jewel catalog */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const key = cacheKey(systemName)
  const cached = getCached(key)
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT", "Cache-Control": "private, max-age=0, must-revalidate" },
    })
  }

  try {
    const url = `${BACKEND_URL}/api/attack-paths/${encodeURIComponent(systemName)}/targets`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.error(`[attack-paths/targets] backend ${res.status}: ${body.slice(0, 200)}`)
      if (res.status >= 500) {
        const stale = getStaleCached(key)
        if (stale) {
          return NextResponse.json(
            { ...stale, fromStaleCache: true, staleReason: `backend_${res.status}` },
            { headers: { "X-Cache": "STALE", "Cache-Control": "no-store" } },
          )
        }
      }
      return NextResponse.json(
        { error: "Failed to load target catalog", status: res.status },
        { status: res.status },
      )
    }
    const data = await res.json()
    // A NOT_READY catalog is real state, but it must not be the cached
    // "last good" that outlives a recovered projection.
    if (data && data.serve_state === "READY") setCached(key, data, TTL_STD)
    return NextResponse.json(data, {
      headers: { "X-Cache": "MISS", "Cache-Control": "private, max-age=0, must-revalidate" },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError" || msg.includes("timeout"))
    const stale = getStaleCached(key)
    if (stale) {
      return NextResponse.json(
        { ...stale, fromStaleCache: true, staleReason: isTimeout ? "timeout" : "fetch_failed" },
        { headers: { "X-Cache": "STALE", "Cache-Control": "no-store" } },
      )
    }
    console.error(`[attack-paths/targets] fetch error: ${msg}`)
    return NextResponse.json(
      { error: "Failed to fetch target catalog", detail: msg, unavailable: true },
      { status: 502 },
    )
  }
}
