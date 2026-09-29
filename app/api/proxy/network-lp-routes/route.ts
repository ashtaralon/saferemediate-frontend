import { NextRequest, NextResponse } from "next/server"
import {
  ERROR_ORIGIN_HEADER,
  allowlistedBackendDetail,
  fromCaughtError,
  reviewProxyStatus,
} from "@/lib/server/proxy-error"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

// Route: /api/proxy/network-lp-routes
// Network-LP route verdicts for a subnet (candidate-grade, observed).
// Backend: GET /api/network-lp/routes?subnet_id=...
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 2 * 60 * 1000

// A backend failure used to answer the last cached body with status 200
// (X-Cache: STALE): old route verdicts presented as current. A failure is now the
// house error shape (lib/server/proxy-error, as the LP proxies answer it):
// non-2xx, allowlisted typed detail only, no routes. The failed key is also
// evicted, so a later request inside the TTL cannot serve the pre-failure body.
// Successes are no-store: the old `s-maxage=120, stale-while-revalidate=300`
// let a shared cache hand out a body up to 7 minutes old as a fresh 200.

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const subnetId = searchParams.get("subnet_id")
  if (!subnetId) {
    return NextResponse.json({ error: "subnet_id query parameter is required" }, { status: 400 })
  }
  const forceRefresh = searchParams.get("refresh") === "true"
  const cacheKey = `network-lp:${subnetId}`
  const now = Date.now()

  if (!forceRefresh) {
    const cached = cache.get(cacheKey)
    if (cached && now - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data, {
        status: 200,
        headers: { "X-Cache": "HIT", "Cache-Control": "no-store" },
      })
    }
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 55000)
    const params = new URLSearchParams({ subnet_id: subnetId })
    const res = await fetch(`${BACKEND_URL}/api/network-lp/routes?${params}`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      cache.delete(cacheKey)
      const raw = await res.text().catch(() => "")
      const detail = allowlistedBackendDetail(raw)
      console.error(`[proxy] network-lp-routes backend ${res.status}: code=${detail?.code ?? "none"}`)
      return NextResponse.json(
        {
          error: `Network-LP routes backend returned ${res.status}`,
          ...(detail ? { detail } : {}),
          backendStatus: res.status,
          origin: "backend",
        },
        {
          status: reviewProxyStatus(res.status),
          headers: { "Cache-Control": "no-store", [ERROR_ORIGIN_HEADER]: "backend" },
        },
      )
    }

    const data = await res.json()
    cache.set(cacheKey, { data, timestamp: now })
    if (cache.size > 50) {
      for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CACHE_TTL * 2) cache.delete(key)
      }
    }
    return NextResponse.json(data, {
      status: 200,
      headers: { "X-Cache": "MISS", "Cache-Control": "no-store" },
    })
  } catch (error: unknown) {
    cache.delete(cacheKey)
    console.error("[proxy] network-lp-routes error:", error instanceof Error ? error.message : error)
    // AbortError -> 504, anything else -> 503; no routes either way.
    const failed = fromCaughtError(error)
    failed.headers.set(ERROR_ORIGIN_HEADER, "proxy")
    return failed
  }
}
