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
 * Resilience strategy (CLAUDE.md rule #1 honesty + amber-self-heal pattern):
 *
 *   1. Hot cache (60s)            → return cached data immediately.
 *   2. Backend reachable + 2xx    → cache + return fresh data.
 *   3. Backend 5xx OR timeout     → if stale cache exists, serve it with
 *                                    `fromStaleCache=true` so the FE renders
 *                                    an amber "serving stale" pill. Render
 *                                    is on a free/starter tier and bounces
 *                                    a few times per hour mid-deploy; serving
 *                                    the last-known-good rollup keeps the
 *                                    canvas useful instead of a hard error.
 *   4. No stale cache to fall    → emit an honest empty envelope so the FE
 *      back to                      can render "topology risk unavailable"
 *                                    rather than NPE on missing fields.
 *
 * Per CLAUDE.md feedback_amber_must_self_heal: the amber "serving stale"
 * state auto-resolves on the next successful fetch — no operator action.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const vpcId = req.nextUrl.searchParams.get("vpc_id")
  const cacheKey = vpcId
    ? `topology-risk:${systemName}:vpc:${vpcId}`
    : `topology-risk:${systemName}`

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
    const qs = vpcId ? `?vpc_id=${encodeURIComponent(vpcId)}` : ""
    const url = `${BACKEND_URL}/api/topology-risk/${encodeURIComponent(systemName)}${qs}`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.error(`[topology-risk] backend ${res.status}: ${body.slice(0, 200)}`)
      // 503 compute-in-progress — peer single-flight; retry shortly.
      if (res.status === 503) {
        await new Promise(r => setTimeout(r, 1500))
        const retry = await fetch(url, {
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(55_000),
        })
        if (retry.ok) {
          const data = await retry.json()
          setCached(cacheKey, data, TTL_SLOW)
          return NextResponse.json(data, {
            headers: { "X-Cache": "MISS", "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
          })
        }
      }
      // On 5xx, try the stale cache first — Render free-tier bounces are
      // typically transient (10-60s). Serving last-good data with an
      // amber pill is far better UX than "topology risk unavailable" until
      // the next BE deploy stabilizes.
      if (res.status >= 500) {
        const stale = getStaleCached(cacheKey)
        if (stale) {
          console.warn(`[topology-risk] backend ${res.status} — serving stale cache systemName=${systemName}`)
          return NextResponse.json(
            { ...stale, fromStaleCache: true, staleReason: `backend_${res.status}` },
            {
              headers: { "X-Cache": "STALE", "Cache-Control": "no-store" },
            },
          )
        }
      }
      // No stale cache → honest empty envelope.
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
    // Serve stale on ANY transient failure when we have a cache. Timeout,
    // fetch-rejection, and TLS/connection blips all count — the operator
    // gets their last-good rollup either way, with the amber pill telling
    // the truth about freshness.
    if (stale) {
      console.warn(`[topology-risk] ${isTimeout ? "timeout" : "fetch failed"} — serving stale cache systemName=${systemName}`)
      return NextResponse.json(
        { ...stale, fromStaleCache: true, staleReason: isTimeout ? "timeout" : "fetch_failed" },
        {
          headers: { "X-Cache": "STALE", "Cache-Control": "no-store" },
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
