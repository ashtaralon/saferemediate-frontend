import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_STD } from "@/lib/server/proxy-cache"

const BACKEND_URL = getBackendBaseUrl()

export const maxDuration = 30

/**
 * GET /api/proxy/posture-score/trend?days=30
 *
 * Org-wide BRSS trend. Passthrough to backend
 * /api/posture-score/trend which reads BlastRadiusSnapshot history
 * and computes a daily resource-weighted aggregate.
 *
 * Was a "Trend, sparkline and top-driver attribution require backend
 * history endpoints that aren't wired yet" disclosure on the hero
 * card (gap #2 from the dashboard audit) — the snapshot store
 * always existed, just wasn't exposed.
 *
 * 60s proxy cache keyed on `days` so different windows don't collide.
 */
export async function GET(req: NextRequest) {
  const days = req.nextUrl.searchParams.get("days") || "30"
  const cacheKey = `posture-trend-${days}d`
  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }
  try {
    const r = await fetch(
      `${BACKEND_URL}/api/posture-score/trend?days=${encodeURIComponent(days)}`,
      {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      },
    )
    if (!r.ok) {
      return NextResponse.json(
        {
          error: "trend_endpoint_unavailable",
          backend_status: r.status,
          window_days: Number(days),
          current: null,
          previous: null,
          delta: null,
          series: [],
          snapshot_count: 0,
        },
        { status: 502 },
      )
    }
    const data = await r.json()
    setCached(cacheKey, data, TTL_STD)
    return NextResponse.json(data, { headers: { "X-Cache": "MISS" } })
  } catch (e) {
    return NextResponse.json(
      {
        error: "trend_proxy_error",
        message: e instanceof Error ? e.message : String(e),
        window_days: Number(days),
        current: null,
        previous: null,
        delta: null,
        series: [],
        snapshot_count: 0,
      },
      { status: 502 },
    )
  }
}
