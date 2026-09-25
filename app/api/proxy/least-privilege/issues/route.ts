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

// NO proxy-side cache and NO stale fallback. The LP list is scoped by the
// backend to a server-verified principal, tenant and account; this proxy never
// sees that verified identity (it sees request claims only), so it cannot key a
// reusable answer by it. A shared in-memory cache keyed by systemName + days
// served one registered tenant's READY list to another tenant sharing the
// system name, without the backend being asked, and its stale-on-timeout path
// served the same list on an outage (__tests__/lp-issues-proxy-cache-scope.test.ts).
// Every request asks the backend; the backend keeps its own scope-checked cache.
// Responses are never cacheable by a browser-shared or CDN cache.
const SCOPED_NO_STORE = "private, no-store"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName") || ""
  const observationDays = url.searchParams.get("observationDays") ?? "365"
  const forceRefresh = url.searchParams.get("refresh") === "true" || url.searchParams.get("force_refresh") === "true"

  const controller = new AbortController()
  // 55s, matching TOPOLOGY_RISK_PROXY_TIMEOUT_MS — the house "full cold-build
  // budget" for a maxDuration=60 route (abort 5s under, so the catch below
  // still runs and answers a typed timeout rather than letting Vercel kill the
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

    return NextResponse.json({
      ...data,
      fromCache: false,
    }, {
      headers: {
        "Cache-Control": SCOPED_NO_STORE,
      },
    })
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    console.error("[LP Proxy] Fetch error:", error instanceof Error ? error.message : error)
    // A timeout or an unreachable backend is an honest error (AbortError -> 504,
    // else 503). No earlier answer is served in its place: it could belong to
    // another tenant, and it cannot vouch for the current analysis.
    return fromCaughtError(error)
  }
}
