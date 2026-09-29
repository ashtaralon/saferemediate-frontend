import { NextRequest, NextResponse } from "next/server"
import {
  ERROR_ORIGIN_HEADER,
  allowlistedBackendDetail,
  fromCaughtError,
  reviewProxyStatus,
} from "@/lib/server/proxy-error"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

// Route: /api/proxy/network-lp-findings
// Scoped Network-LP findings for the dedicated panel.
// Backend: GET /api/network-lp/findings?system_id=...  (account-wide if omitted)
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 2 * 60 * 1000

// A backend failure used to answer the last cached body with status 200
// (X-Cache: STALE): old findings presented as current. A failure is now the
// house error shape (lib/server/proxy-error, as the LP proxies answer it):
// non-2xx, allowlisted typed detail only, no findings. The failed key is also
// evicted, so a later request inside the TTL cannot serve the pre-failure body.
// Successes are no-store: the old `s-maxage=120, stale-while-revalidate=300`
// let a shared cache hand out a body up to 7 minutes old as a fresh 200.

const TRANSIENT_STATUSES = new Set([408, 425, 429, 502, 503, 504, 522, 524])

async function fetchFindings(url: string): Promise<Response> {
  let response: Response | undefined
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 55000)
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }
    if (response.ok || !TRANSIENT_STATUSES.has(response.status) || attempt === 1) {
      return response
    }
    // A Render cold start can answer the first request at the gateway before
    // the service is ready. One bounded retry prevents a transient 502 from
    // becoming the page's terminal state without hiding real 4xx failures.
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  return response as Response
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const systemId = searchParams.get("system_id")
  const forceRefresh = searchParams.get("refresh") === "true"
  const cacheKey = `network-lp-findings:${systemId || "all"}`
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
    const params = new URLSearchParams()
    if (systemId) params.append("system_id", systemId)
    const qs = params.toString()
    const res = await fetchFindings(
      `${BACKEND_URL}/api/network-lp/findings${qs ? `?${qs}` : ""}`,
    )

    if (!res.ok) {
      cache.delete(cacheKey)
      const raw = await res.text().catch(() => "")
      const detail = allowlistedBackendDetail(raw)
      console.error(`[proxy] network-lp-findings backend ${res.status}: code=${detail?.code ?? "none"}`)
      return NextResponse.json(
        {
          error: `Network-LP findings backend returned ${res.status}`,
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
    console.error("[proxy] network-lp-findings error:", error instanceof Error ? error.message : error)
    // AbortError -> 504, anything else -> 503; no findings either way.
    const failed = fromCaughtError(error)
    failed.headers.set(ERROR_ORIGIN_HEADER, "proxy")
    return failed
  }
}
