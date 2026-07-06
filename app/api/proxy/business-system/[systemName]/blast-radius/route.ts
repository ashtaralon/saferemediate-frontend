import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, getStaleCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

/**
 * Proxy for the Business System Blast Radius read-composer:
 *   GET /api/business-system/{systemName}/blast-radius
 *
 * The backend endpoint is a heavy aggregation over topology-risk + :AttackPath
 * + observed edges. We follow the house proxy contract (CLAUDE.md rule #3):
 *   hot cache (5m) → fresh backend fetch → stale-cache fallback on 5xx/timeout
 *   (fromStaleCache: true) → honest error envelope when nothing is cached.
 * No fabrication: a failure returns { error } + empty arrays, never a made-up
 * verdict.
 */
export const runtime = "nodejs"
export const maxDuration = 60

const EMPTY_ENVELOPE = {
  system: null,
  verdict: null,
  zones: [],
  dependency_plane: [],
  top_paths: [],
  recommended_cuts: [],
  warnings: [],
  from_snapshot: false,
  snapshot_age_seconds: null,
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  if (!systemName) {
    return NextResponse.json(
      { ...EMPTY_ENVELOPE, error: "systemName path parameter is required" },
      { status: 400 },
    )
  }

  const cacheKey = `business-system-blast-radius|${systemName}`
  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }

  const url = `${getBackendBaseUrl()}/api/business-system/${encodeURIComponent(systemName)}/blast-radius`
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      // The composer reads a topology snapshot + several Cypher passes; on a
      // cold Render worker the first hit is slow. 55s < the 60s Lambda cap.
      signal: AbortSignal.timeout(55_000),
      cache: "no-store",
    })

    if (!res.ok) {
      // Serve last-known-good rather than a blank scorecard, if we have it.
      const stale = getStaleCached(cacheKey)
      if (stale) {
        return NextResponse.json(
          { ...(stale as object), fromStaleCache: true },
          { headers: { "X-Cache": "STALE" } },
        )
      }
      return NextResponse.json(
        { ...EMPTY_ENVELOPE, error: `Backend returned ${res.status}` },
        { status: res.status },
      )
    }

    const data = await res.json()
    setCached(cacheKey, data, TTL_SLOW)
    return NextResponse.json(data, { headers: { "X-Cache": "MISS" } })
  } catch (err: unknown) {
    const stale = getStaleCached(cacheKey)
    if (stale) {
      return NextResponse.json(
        { ...(stale as object), fromStaleCache: true },
        { headers: { "X-Cache": "STALE" } },
      )
    }
    const message = err instanceof Error ? err.message : "Failed to reach backend"
    return NextResponse.json({ ...EMPTY_ENVELOPE, error: message }, { status: 502 })
  }
}
