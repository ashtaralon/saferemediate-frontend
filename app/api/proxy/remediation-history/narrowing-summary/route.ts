import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_STD } from "@/lib/server/proxy-cache"

const BACKEND_URL = getBackendBaseUrl()

export const maxDuration = 30

/**
 * GET /api/proxy/remediation-history/narrowing-summary?days=7
 *
 * Window-summed narrowing total — proxies the backend
 * /api/remediation-history/narrowing-summary endpoint.
 *
 * Used by the home dashboard's "This week's narrowing" card. Was a
 * NotWiredCard until 2026-05-01; the backend always had the data
 * (RemediationEvent.metadata.permissions_removed) but no exposed
 * endpoint. Now it does.
 *
 * 60s proxy cache keyed on `days` so different windows don't collide
 * (matches backend's TTL).
 */
export async function GET(req: NextRequest) {
  const days = req.nextUrl.searchParams.get("days") || "7"
  const cacheKey = `narrowing-summary-${days}d`
  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }
  try {
    const r = await fetch(
      `${BACKEND_URL}/api/remediation-history/narrowing-summary?days=${encodeURIComponent(days)}`,
      {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      },
    )
    if (!r.ok) {
      return NextResponse.json(
        {
          error: "narrowing_summary_unavailable",
          backend_status: r.status,
          window_days: Number(days),
          permissions_removed: 0,
          events_count: 0,
          rollbacks_count: 0,
          by_day: [],
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
        error: "narrowing_summary_proxy_error",
        message: e instanceof Error ? e.message : String(e),
        window_days: Number(days),
        permissions_removed: 0,
        events_count: 0,
        rollbacks_count: 0,
        by_day: [],
      },
      { status: 502 },
    )
  }
}
