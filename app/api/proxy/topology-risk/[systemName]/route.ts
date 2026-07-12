import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, getStaleCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"
import { buildTopologyRiskServerCacheKey } from "@/components/topology-v0-2/topology-scope-url"
import { TOPOLOGY_RISK_PROXY_TIMEOUT_MS } from "@/lib/server/snapshot-proxy"

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

function scopeFromRequest(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("account_id")
  const region = req.nextUrl.searchParams.get("region")
  const vpcId = req.nextUrl.searchParams.get("vpc_id")
  return {
    accountId: accountId && /^\d{12}$/.test(accountId) ? accountId : null,
    region: region && /^[a-z]{2}(-gov)?-[a-z]+-\d+$/.test(region) ? region : null,
    vpcId: vpcId && vpcId.startsWith("vpc-") ? vpcId : null,
  }
}

function backendQueryString(scope: ReturnType<typeof scopeFromRequest>): string {
  const params = new URLSearchParams()
  if (scope.accountId) params.set("account_id", scope.accountId)
  if (scope.region) params.set("region", scope.region)
  if (scope.vpcId) params.set("vpc_id", scope.vpcId)
  const qs = params.toString()
  return qs ? `?${qs}` : ""
}

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
  const scope = scopeFromRequest(req)
  const cacheKey = buildTopologyRiskServerCacheKey(systemName, scope)

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
    const qs = backendQueryString(scope)
    const url = `${BACKEND_URL}/api/topology-risk/${encodeURIComponent(systemName)}${qs}`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TOPOLOGY_RISK_PROXY_TIMEOUT_MS),
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
          signal: AbortSignal.timeout(TOPOLOGY_RISK_PROXY_TIMEOUT_MS),
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
    if (isTimeout) {
      const started = new Date()
      const deadline = new Date(started.getTime() + 180_000)
      return NextResponse.json(
        {
          status: "computing",
          system_name: systemName,
          computing_started_at: started.toISOString(),
          compute_deadline_at: deadline.toISOString(),
          staleReason: "peer_computing",
          scored_at: null,
          system_kpis: null,
          nodes: [],
        },
        { status: 200 },
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
