import { NextRequest, NextResponse } from "next/server"
import { backendError, fromCaughtError } from "@/lib/server/proxy-error"
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
      return NextResponse.json(cached.data, { status: 200, headers: { "X-Cache": "HIT" } })
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
      const errorText = await res.text().catch(() => "")
      const cached = cache.get(cacheKey)
      if (cached) {
        return NextResponse.json(cached.data, { status: 200, headers: { "X-Cache": "STALE" } })
      }
      return backendError({
        status: res.status,
        message: `network-lp-findings backend returned ${res.status}`,
        detail: errorText.slice(0, 500),
      })
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
      headers: { "X-Cache": "MISS", "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" },
    })
  } catch (error: unknown) {
    console.error("[proxy] network-lp-findings error:", error)
    return fromCaughtError(error)
  }
}
