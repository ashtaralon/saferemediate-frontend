import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

const BACKEND_URL = getBackendBaseUrl()

// Render free tier cold-starts in ~30-50s. The previous 30s ceiling
// + 25s fetch timeouts produced spurious 502s on the first hit after
// the dyno slept — even though the underlying backend endpoint was
// healthy at warm. Bump to 60s so cold-starts complete; per-fetch
// timeouts below stay strictly less than maxDuration so we still
// produce a clean structured 502 if something genuinely hangs.
export const maxDuration = 60

/**
 * GET /api/proxy/evidence/coverage
 *
 * Two modes:
 *   1. ?account_id=X — direct passthrough for one account
 *   2. (no query)    — passthrough to backend /api/evidence/coverage/all
 *                      which does the org-wide aggregation server-side.
 *
 * Pre-2026-05-01 this proxy did the org-wide fan-out itself
 * (/api/accounts + per-account /coverage). That hit Render free-tier
 * concurrent-request limits and produced timeouts. The backend now
 * does the fan-out in-process via asyncio.gather; this proxy is a
 * thin passthrough.
 */
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("account_id")

  // Mode 1: per-account passthrough (unchanged).
  if (accountId) {
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/evidence/coverage?account_id=${encodeURIComponent(accountId)}`,
        {
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(55000),
        },
      )
      if (!res.ok) {
        return NextResponse.json(
          { error: "coverage_endpoint_unavailable", backend_status: res.status },
          { status: 502 },
        )
      }
      return NextResponse.json(await res.json())
    } catch (e) {
      return NextResponse.json(
        { error: "coverage_proxy_error", message: e instanceof Error ? e.message : String(e) },
        { status: 502 },
      )
    }
  }

  // Mode 2: org-wide aggregator.
  const cacheKey = "evidence-coverage-orgwide"
  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }
  try {
    const r = await fetch(`${BACKEND_URL}/api/evidence/coverage/all`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(55000),
    })
    if (!r.ok) {
      return NextResponse.json(
        {
          error: "coverage_all_endpoint_unavailable",
          backend_status: r.status,
          accounts: [],
          aggregate_confidence: 0,
          health: { healthy: 0, degraded: 0, missing: 0, total: 0 },
          errors: [`backend ${r.status}`],
        },
        { status: 502 },
      )
    }
    const data = await r.json()
    setCached(cacheKey, data, TTL_SLOW)
    return NextResponse.json(data, { headers: { "X-Cache": "MISS" } })
  } catch (e) {
    return NextResponse.json(
      {
        error: "coverage_proxy_error",
        message: e instanceof Error ? e.message : String(e),
        accounts: [],
        aggregate_confidence: 0,
        health: { healthy: 0, degraded: 0, missing: 0, total: 0 },
        errors: [e instanceof Error ? e.message : String(e)],
      },
      { status: 502 },
    )
  }
}
