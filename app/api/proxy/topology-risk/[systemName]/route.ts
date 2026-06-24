import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, getStaleCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

/**
 * Topology Risk proxy — pairs with BE /api/topology-risk/{systemName}
 * (contract: docs/topology-v0.2-risk-contract.md).
 *
 * 60s server-side cache per contract §4.3 ("Bulk endpoint: cache 60s
 * server-side"). Stale-fallback on timeout — operators always see the
 * last good rollup rather than a hard 502 when Render is mid-cold-cycle.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const cacheKey = `topology-risk:${systemName}`

  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        "X-Cache": "HIT",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    })
  }

  try {
    const url = `${BACKEND_URL}/api/topology-risk/${encodeURIComponent(systemName)}`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.error(`[topology-risk] backend ${res.status}: ${body.slice(0, 200)}`)
      // Honest 502 envelope so the FE can render an "unavailable" state
      // rather than NPE on missing fields. Mirrors the iap-jewels pattern.
      return NextResponse.json(
        {
          error: `backend_${res.status}`,
          system: systemName,
          scored_at: null,
          system_kpis: null,
          nodes: [],
        },
        { status: res.status },
      )
    }
    const data = await res.json()
    setCached(cacheKey, data, TTL_SLOW)
    return NextResponse.json(data, {
      headers: {
        "X-Cache": "MISS",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError" || msg.includes("timeout"))
    const stale = getStaleCached(cacheKey)
    if (isTimeout && stale) {
      console.warn(`[topology-risk] timeout — serving stale cache systemName=${systemName}`)
      return NextResponse.json(
        { ...stale, fromStaleCache: true, staleReason: "timeout" },
        {
          headers: {
            "X-Cache": "STALE",
            "Cache-Control": "no-store",
          },
        },
      )
    }
    console.error(`[topology-risk] systemName=${systemName} error=${msg}`)
    return NextResponse.json(
      {
        error: "topology_risk_proxy_error",
        message: msg,
        system: systemName,
        scored_at: null,
        system_kpis: null,
        nodes: [],
      },
      { status: 502 },
    )
  }
}
