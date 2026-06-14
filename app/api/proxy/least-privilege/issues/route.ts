import { NextRequest, NextResponse } from "next/server"
import {
  backendError,
  fromCaughtError,
} from "@/lib/server/proxy-error"

const BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com"

export const maxDuration = 60

// In-memory cache. Only stores SUCCESSFUL responses. Backend errors are
// no longer surfaced as "200 with empty data" — the proxy now returns
// 502/504 and the UI renders an honest error state instead of the
// green-checkmark "No LP issues" success view that masked outages.
let cachedData: any = null
let cacheTimestamp: number = 0
const CACHE_DURATION = 2 * 60 * 1000 // 2 minutes in ms

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName") || ""
  const observationDays = url.searchParams.get("observationDays") ?? "365"
  const forceRefresh = url.searchParams.get("refresh") === "true" || url.searchParams.get("force_refresh") === "true"

  const cacheKey = `${systemName}-${observationDays}`
  const now = Date.now()

  // Return cached data if valid and not forcing refresh.
  if (!forceRefresh && cachedData && cachedData.cacheKey === cacheKey && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log("[LP Proxy] Returning cached data")
    const cacheAge = Math.round((now - cacheTimestamp) / 1000)
    return NextResponse.json({
      ...cachedData.data,
      fromCache: true,
      cacheAge,
    }, {
      headers: {
        "X-Cache": "HIT",
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60",
      },
    })
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 55000)

  try {
    const params = new URLSearchParams()
    if (systemName) params.set("systemName", systemName)
    params.set("observationDays", observationDays)
    if (forceRefresh) params.set("force_refresh", "true")

    const res = await fetch(`${BACKEND_URL}/api/least-privilege/issues?${params.toString()}`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      console.error(`[LP Proxy] Backend ${res.status}: ${detail.slice(0, 200)}`)
      // Fail loud. The frontend has an error card at LeastPrivilegeTab.tsx:1234
      // that fires when fetch.ok is false; it renders "Error loading data"
      // instead of the dangerous "No LP issues" success state.
      return backendError({
        status: res.status,
        message: `Least-privilege backend returned ${res.status}`,
        detail: detail.slice(0, 500),
      })
    }

    const data = await res.json()

    const sgCount = (data.resources || []).filter((r: any) => r.resourceType === "SecurityGroup").length
    console.log(`[LP Proxy] Backend OK — ${data.resources?.length || 0} resources (${sgCount} SG)`)

    // Cache the successful response only.
    cachedData = { cacheKey, data }
    cacheTimestamp = now

    return NextResponse.json({
      ...data,
      fromCache: false,
    }, {
      headers: {
        "X-Cache": "MISS",
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60",
      },
    })
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    console.error("[LP Proxy] Fetch error:", error instanceof Error ? error.message : error)
    // Cold Render + 365d observation can exceed the upstream budget. Serve
    // stale success data when available so Resource Risk doesn't hard-fail
    // the whole tab on a transient slow backend.
    if (
      error instanceof Error &&
      error.name === "AbortError" &&
      cachedData &&
      cachedData.cacheKey === cacheKey
    ) {
      const cacheAge = Math.round((now - cacheTimestamp) / 1000)
      console.warn("[LP Proxy] Timeout — returning stale cache", { cacheAge })
      return NextResponse.json(
        {
          ...cachedData.data,
          fromCache: true,
          fromStaleCache: true,
          staleReason: "timeout",
          cacheAge,
        },
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
