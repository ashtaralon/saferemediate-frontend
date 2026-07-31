import { NextRequest, NextResponse } from "next/server"
import { backendError, fromCaughtError } from "@/lib/server/proxy-error"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0
export const maxDuration = 60

const BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com"

// In-memory cache with 5-minute TTL — only stores SUCCESSFUL responses.
// Backend errors no longer return 200-with-empty (which masked the
// 5-minute outage on 2026-05-04 by making every dashboard render the
// "system is clean" green-checkmark even though the backend was down).
// Stale-cache-on-error is also removed for the same reason.
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000

function getCacheKey(systemName: string | null): string {
  return `issues-summary:${systemName || "all"}`
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName")
  const cacheKey = getCacheKey(systemName)
  const now = Date.now()

  const cached = cache.get(cacheKey)
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    const cacheAge = Math.round((now - cached.timestamp) / 1000)
    return NextResponse.json(cached.data, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        "X-Cache": "HIT",
        "X-Cache-Age": String(cacheAge),
      },
    })
  }

  const controller = new AbortController()
  // 55s, the house cold-build budget for a maxDuration=60 route.
  //
  // Was 20s, defended on the grounds that BRSS enrichment "must not pin the
  // Resource Risk tab for a minute". That reasoning does not survive contact
  // with the caller: LeastPrivilegeTab fetches this in its own detached async
  // IIFE, explicitly independent of the LP list ("Fetch BRSS in parallel —
  // independent from LP data, so failures don't block the main list view").
  // It cannot pin the tab at ANY budget. Until the score arrives the card
  // simply reads "—".
  //
  // So the short budget bought nothing and cost the feature: measured against
  // production 2026-08-01 this endpoint takes ~0.7-1.8s warm but ~21.8s cold,
  // i.e. just over the old cap. Every cold load 504'd and "Blast Radius · IAM"
  // silently rendered "—" — observed live during E2E QA.
  //
  // Contrast resource-risk/by-system, which stays at 12s: that one backs the
  // Trust Exposure panel, which renders its own spinner while waiting, so a
  // long budget there really does look hung. The distinction is whether a
  // visible element waits on the response, not whether the fetch is "optional".
  const timeoutId = setTimeout(() => controller.abort(), 55_000)

  try {
    const backendUrl = systemName
      ? `${BACKEND_URL}/api/issues/summary?systemName=${encodeURIComponent(systemName)}`
      : `${BACKEND_URL}/api/issues/summary`

    const res = await fetch(backendUrl, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      if (cached) {
        return NextResponse.json(
          { ...cached.data, fromStaleCache: true, staleReason: `backend_${res.status}` },
          { headers: { "X-Cache": "STALE", "Cache-Control": "no-store" } },
        )
      }
      const detail = await res.text().catch(() => "")
      console.error(`[issues-summary proxy] backend ${res.status}: ${detail.slice(0, 200)}`)
      return backendError({
        status: res.status,
        message: `Issues-summary backend returned ${res.status}`,
        detail: detail.slice(0, 500),
      })
    }

    const data = await res.json()
    cache.set(cacheKey, { data, timestamp: now })

    if (cache.size > 100) {
      const cutoff = now - CACHE_TTL * 2
      for (const [key, value] of cache.entries()) {
        if (value.timestamp < cutoff) cache.delete(key)
      }
    }

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        "X-Cache": "MISS",
      },
    })
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    console.error(
      "[issues-summary proxy] fetch error:",
      error instanceof Error ? error.message : error,
    )
    if (
      error instanceof Error &&
      error.name === "AbortError" &&
      cached
    ) {
      return NextResponse.json(
        { ...cached.data, fromStaleCache: true, staleReason: "timeout" },
        { headers: { "X-Cache": "STALE", "Cache-Control": "no-store" } },
      )
    }
    return fromCaughtError(error)
  }
}
