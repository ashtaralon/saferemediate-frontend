import { NextRequest, NextResponse } from "next/server"
import {
  backendError,
  fromCaughtError,
} from "@/lib/server/proxy-error"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

// Proxy → real backend /api/security-groups/{sgId}/gap-analysis endpoint
// that returns per-rule recommendation + confidence + traffic.

const BACKEND_URL = getBackendBaseUrl()

export const maxDuration = 60
export const dynamic = "force-dynamic"

const CACHE_TTL_MS = 2 * 60 * 1000
const cache: Record<string, { data: Record<string, unknown>; timestamp: number }> = {}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ sgId: string }> },
) {
  let sgId = ""
  try {
    const resolved = await context.params
    sgId = resolved.sgId

    if (!sgId) {
      return NextResponse.json(
        { error: true, message: "Missing sgId parameter" },
        { status: 400 },
      )
    }

    const accountId = req.nextUrl.searchParams.get("account_id") || ""
    const region = req.nextUrl.searchParams.get("region") || ""
    const scopeParams = new URLSearchParams()
    if (accountId) scopeParams.set("account_id", accountId)
    if (region) scopeParams.set("region", region)
    const cacheKey = `${accountId}:${region}:${sgId}`

    const cached = cache[cacheKey]
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cached.data, {
        headers: { "X-Cache": "HIT", "Cache-Control": "no-store" },
      })
    }

    const query = scopeParams.toString()
    const backendUrl = `${BACKEND_URL}/api/security-groups/${encodeURIComponent(sgId)}/gap-analysis${
      query ? `?${query}` : ""
    }`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 55000)

    const res = await fetch(backendUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const rawDetail = await res.text().catch(() => "")
      let detail = rawDetail
      try {
        const parsed = JSON.parse(rawDetail) as { detail?: unknown; error?: unknown }
        detail = String(parsed.detail || parsed.error || rawDetail)
      } catch {
        // Preserve non-JSON backend errors as text.
      }
      console.error(`[SG Rule Analysis] Backend ${res.status}: ${detail.slice(0, 200)}`)
      return backendError({
        status: res.status,
        message: `Security group gap-analysis returned ${res.status}`,
        detail: detail.slice(0, 500),
      })
    }

    const data = (await res.json()) as Record<string, unknown>
    cache[cacheKey] = { data, timestamp: Date.now() }
    return NextResponse.json(data, {
      headers: { "X-Cache": "MISS", "Cache-Control": "no-store" },
    })
  } catch (error: unknown) {
    console.error(
      "[SG Rule Analysis] Error:",
      error instanceof Error ? error.message : error,
    )
    const accountId = req.nextUrl.searchParams.get("account_id") || ""
    const region = req.nextUrl.searchParams.get("region") || ""
    const cached = sgId ? cache[`${accountId}:${region}:${sgId}`] : undefined
    if (
      error instanceof Error &&
      error.name === "AbortError" &&
      cached
    ) {
      return NextResponse.json(
        { ...cached.data, fromStaleCache: true, staleReason: "timeout" },
        {
          headers: {
            "X-Cache": "STALE",
            "Cache-Control": "no-store",
          },
        },
      )
    }
    return fromCaughtError(error)
  }
}
