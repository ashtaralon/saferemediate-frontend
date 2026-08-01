import { NextRequest, NextResponse } from "next/server"
import {
  backendError,
  fromCaughtError,
} from "@/lib/server/proxy-error"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

// Canonical resolver (BACKEND_URL_OVERRIDE → Render prod), same as the sibling
// resource-risk/by-system proxy this tab also calls. The URL was hardcoded
// here, so a local backend could not serve the Resource Risk list at all —
// the one endpoint the tab cannot render without. Prod behaviour is unchanged:
// with no override set the resolver returns the same Render URL, and it
// fail-fasts if a Vercel deploy ever resolves to localhost.

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
  // 55s, matching TOPOLOGY_RISK_PROXY_TIMEOUT_MS — the house "full cold-build
  // budget" for a maxDuration=60 route (abort 5s under, so the catch below
  // still runs and can serve stale cache rather than letting Vercel kill the
  // function).
  //
  // Was 25s, which was SHORTER THAN THE WORK. Measured 2026-08-01 against
  // production: this endpoint answers in 0.23s warm and 32.1s on a cold
  // Render dyno. So the budget cut off every cold start, and because the
  // caller retries with the same budget each time, the retry could never
  // succeed either — three attempts, ~78s of spinner, then a hard error, on
  // a backend that was working fine and just needed 32 seconds.
  //
  // The sibling proxies this tab calls stay deliberately short and should not
  // be "made consistent" with this one: resource-risk/by-system is an indexed
  // read that is genuinely sub-second (a 55s abort there was tried and
  // reverted for making Trust Exposure feel hung), and issues-summary is
  // optional BRSS enrichment that must never pin the tab. The number belongs
  // to the work behind the endpoint, not to the file.
  const timeoutId = setTimeout(() => controller.abort(), 55_000)

  try {
    const params = new URLSearchParams()
    if (systemName) params.set("systemName", systemName)
    params.set("observationDays", observationDays)
    if (forceRefresh) params.set("force_refresh", "true")

    const res = await fetch(`${getBackendBaseUrl()}/api/least-privilege/issues?${params.toString()}`, {
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

    // Cache a COMPLETE analysis only. The backend already refuses to cache a
    // partial analyzer sweep (unified/lp/endpoint.py); caching one here would
    // reinstate the same defect a layer up — one transient failure becoming
    // minutes of confidently incomplete answers, with the integrity banner
    // shown but the underlying rows quietly frozen.
    if (data?.serve_state === "READY") {
      cachedData = { cacheKey, data }
      cacheTimestamp = now
    } else {
      console.warn(`[LP Proxy] Not caching — serve_state=${data?.serve_state ?? "absent"}`)
    }

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
          // A stale payload cannot vouch for the CURRENT analysis, however
          // complete it was when captured. Serving it with its original
          // serve_state=READY would clear the banner and re-enable Apply on
          // evidence of unknown age — laundering a live outage into a clean
          // sweep. The rows are still worth showing; the authority is not.
          serve_state: "NOT_READY",
          analysis_complete: false,
          integrityReason:
            `Showing the last complete analysis (${cacheAge}s old) — the live ` +
            `analysis timed out. Remediation is unavailable until it succeeds.`,
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
