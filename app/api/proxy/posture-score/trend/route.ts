import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_STD } from "@/lib/server/proxy-cache"

const BACKEND_URL = getBackendBaseUrl()

export const maxDuration = 30

/**
 * GET /api/proxy/posture-score/trend?days=30&systemName=alon-prod
 *
 * Org-wide BRSS trend. Serves stale cache on backend timeout/5xx (P0-3
 * pattern — Defect 1 in live QA post-deploy #337/#296).
 */
export async function GET(req: NextRequest) {
  const days = req.nextUrl.searchParams.get("days") || "30"
  const systemName = req.nextUrl.searchParams.get("systemName") || ""
  const cacheKey = `posture-trend-${days}d-${systemName || "org"}`
  const cached = getCached<Record<string, unknown>>(cacheKey)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }

  const stalePayload = {
    error: "trend_stale_unavailable",
    window_days: Number(days),
    current: null,
    previous: null,
    delta: null,
    series: [],
    snapshot_count: 0,
    fromStaleCache: true,
  }

  try {
    const qs = new URLSearchParams({ days })
    if (systemName) qs.set("system_name", systemName)
    const r = await fetch(`${BACKEND_URL}/api/posture-score/trend?${qs.toString()}`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    })
    if (!r.ok) {
      return NextResponse.json(
        { ...stalePayload, backend_status: r.status },
        { status: 200, headers: { "X-Cache": "MISS-FALLBACK" } },
      )
    }
    const data = await r.json()
    setCached(cacheKey, data, TTL_STD)
    return NextResponse.json(data, { headers: { "X-Cache": "MISS" } })
  } catch (e) {
    return NextResponse.json(
      {
        ...stalePayload,
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 200, headers: { "X-Cache": "MISS-FALLBACK" } },
    )
  }
}
