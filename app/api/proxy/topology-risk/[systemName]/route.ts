import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, getStaleCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"
import { isPoisonousProxyPayload } from "@/lib/server/proxy-cache-hygiene"
import { buildTopologyRiskServerCacheKey } from "@/components/topology-v0-2/topology-scope-url"
import { TOPOLOGY_RISK_PROXY_TIMEOUT_MS } from "@/lib/server/snapshot-proxy"

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

/**
 * Split the Vercel 60s budget across a wake attempt + one retry.
 *
 * Render cold workers often hang with zero bytes for >55s on the first
 * hit (operator sees HTTP 504). The hung request still wakes the worker;
 * a second attempt typically serves the DynamoDB snapshot in ~2–8s
 * (observed 2026-07-15: first 90s/0 bytes, second 6s/60 nodes).
 *
 * Keep sum ≤ TOPOLOGY_RISK_PROXY_TIMEOUT_MS so we stay under maxDuration.
 */
const TOPOLOGY_WAKE_TIMEOUT_MS = Math.min(
  20_000,
  Math.floor(TOPOLOGY_RISK_PROXY_TIMEOUT_MS * 0.4),
)
const TOPOLOGY_RETRY_TIMEOUT_MS = Math.max(
  15_000,
  TOPOLOGY_RISK_PROXY_TIMEOUT_MS - TOPOLOGY_WAKE_TIMEOUT_MS - 2_000,
)

function scopeFromRequest(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get("customer_id")
  const accountId = req.nextUrl.searchParams.get("account_id")
  const region = req.nextUrl.searchParams.get("region")
  const vpcId = req.nextUrl.searchParams.get("vpc_id")
  return {
    customerId: customerId && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(customerId) ? customerId : null,
    accountId: accountId && /^\d{12}$/.test(accountId) ? accountId : null,
    region: region && /^[a-z]{2}(-gov)?-[a-z]+-\d+$/.test(region) ? region : null,
    vpcId: vpcId && vpcId.startsWith("vpc-") ? vpcId : null,
  }
}

function backendQueryString(scope: ReturnType<typeof scopeFromRequest>): string {
  const params = new URLSearchParams()
  if (scope.customerId) params.set("customer_id", scope.customerId)
  if (scope.accountId) params.set("account_id", scope.accountId)
  if (scope.region) params.set("region", scope.region)
  if (scope.vpcId) params.set("vpc_id", scope.vpcId)
  const qs = params.toString()
  return qs ? `?${qs}` : ""
}

function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return (
    err.name === "TimeoutError" ||
    err.name === "AbortError" ||
    err.message.includes("timeout")
  )
}

function serveStale(cacheKey: string, reason: string): NextResponse | null {
  const stale = getStaleCached(cacheKey)
  if (!stale || isPoisonousProxyPayload(stale)) return null
  console.warn(`[topology-risk] ${reason} — serving stale cache`)
  return NextResponse.json(
    { ...stale, fromStaleCache: true, staleReason: reason },
    { headers: { "X-Cache": "STALE", "Cache-Control": "no-store" } },
  )
}

function stampSelectedScope(
  data: unknown,
  scope: ReturnType<typeof scopeFromRequest>,
): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data
  const out = { ...(data as Record<string, unknown>) }
  // Snapshot HIT paths often omit echo fields even when the request was
  // scoped — stamp from the request so UI/tests see the active filter.
  if (scope.accountId && out.selected_account_id == null) {
    out.selected_account_id = scope.accountId
  }
  if (scope.region && out.selected_region_id == null) {
    out.selected_region_id = scope.region
  }
  if (scope.vpcId) {
    if (out.selected_vpc_id == null) out.selected_vpc_id = scope.vpcId
    if (out.vpc_id == null) out.vpc_id = scope.vpcId
  }
  return out
}

function respondOk(
  cacheKey: string,
  data: unknown,
  cacheLabel: string,
  scope: ReturnType<typeof scopeFromRequest>,
): NextResponse {
  const stamped = stampSelectedScope(data, scope)
  if (isPoisonousProxyPayload(stamped)) {
    const stale = serveStale(cacheKey, "peer_computing")
    if (stale) return stale
    return NextResponse.json(stamped, {
      headers: { "X-Cache": "BYPASS", "Cache-Control": "no-store" },
    })
  }
  setCached(cacheKey, stamped, TTL_SLOW)
  return NextResponse.json(stamped, {
    headers: {
      "X-Cache": cacheLabel,
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  })
}

async function fetchTopology(
  url: string,
  timeoutMs: number,
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; body: string } | { ok: false; timeout: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      return { ok: false, status: res.status, body }
    }
    return { ok: true, data: await res.json() }
  } catch (err: unknown) {
    if (isTimeoutError(err)) return { ok: false, timeout: true }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Topology Risk proxy — pairs with BE /api/topology-risk/{systemName}
 *
 * Resilience:
 *   1. Hot cache → HIT
 *   2. Wake attempt (short) + one retry (remaining budget) — handles Render
 *      cold hangs that otherwise become operator-visible HTTP 504
 *   3. Stale cache on 5xx / timeout
 *   4. Honest 504/502 only when nothing durable is available
 *   Never invent status:"computing" on timeout (endless Computing… bug).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const scope = scopeFromRequest(req)
  const cacheKey = buildTopologyRiskServerCacheKey(systemName, scope)

  const cached = getCached(cacheKey)
  if (cached && !isPoisonousProxyPayload(cached)) {
    return NextResponse.json(stampSelectedScope(cached, scope), {
      headers: {
        "X-Cache": "HIT",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    })
  }

  const qs = backendQueryString(scope)
  const url = `${BACKEND_URL}/api/topology-risk/${encodeURIComponent(systemName)}${qs}`

  // Attempt 1 — short wake. Cold Render often hangs past 55s with 0 bytes;
  // abort early so we still have budget for a snapshot retry.
  let result = await fetchTopology(url, TOPOLOGY_WAKE_TIMEOUT_MS)
  if (result.ok === true) {
    return respondOk(cacheKey, result.data, "MISS", scope)
  }

  if ("status" in result && result.status === 503) {
    await new Promise((r) => setTimeout(r, 800))
    result = await fetchTopology(url, TOPOLOGY_RETRY_TIMEOUT_MS)
    if (result.ok === true) return respondOk(cacheKey, result.data, "MISS", scope)
  }

  // Attempt 2 — after wake / timeout / 5xx, DynamoDB snapshot is usually ready.
  if ("timeout" in result || ("status" in result && result.status >= 500)) {
    console.warn(
      `[topology-risk] wake miss systemName=${systemName} — retrying snapshot path ` +
        `(timeout=${"timeout" in result} status=${"status" in result ? result.status : "n/a"})`,
    )
    await new Promise((r) => setTimeout(r, 400))
    const retry = await fetchTopology(url, TOPOLOGY_RETRY_TIMEOUT_MS)
    if (retry.ok === true) return respondOk(cacheKey, retry.data, "MISS-RETRY", scope)
    result = retry
  }

  if ("status" in result) {
    console.error(
      `[topology-risk] backend ${result.status}: ${result.body.slice(0, 200)}`,
    )
    const stale = serveStale(cacheKey, `backend_${result.status}`)
    if (stale) return stale
    return NextResponse.json(
      {
        error: `backend_${result.status}`,
        system: systemName,
        scored_at: null,
        system_kpis: null,
        nodes: [],
      },
      { status: result.status },
    )
  }

  const timedOut = "timeout" in result
  const stale = serveStale(cacheKey, timedOut ? "timeout" : "fetch_failed")
  if (stale) return stale

  const msg = "error" in result ? result.error : "Backend topology-risk timed out"
  console.error(
    `[topology-risk] systemName=${systemName} ${timedOut ? "timeout" : "error"}=${msg}`,
  )
  return NextResponse.json(
    {
      error: timedOut ? "topology_risk_proxy_timeout" : "topology_risk_proxy_error",
      message: timedOut
        ? "Backend topology-risk timed out — try again shortly"
        : msg,
      system: systemName,
      scored_at: null,
      system_kpis: null,
      nodes: [],
    },
    { status: timedOut ? 504 : 502 },
  )
}
