import { NextRequest, NextResponse } from "next/server"
import { getCached, getStaleCached, setCached, TTL_STD } from "@/lib/server/proxy-cache"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const BACKEND_URL = getBackendBaseUrl()

// This proxy feeds two surfaces: the "LIVE NOW" strip (limit=1) and the full
// remediation-history page (limit=200). Under the home-page thundering herd
// (~25 concurrent proxy calls saturating the single Render worker) the backend
// can 500/502 or cold-start-hang. Previously a non-404 backend error was
// propagated verbatim (status: response.status), so the strip rendered a raw
// "Activity feed unavailable — HTTP 500" red alarm. A background activity feed
// must NEVER be the loudest failure on the page. So: cache good responses, serve
// last-good on ANY failure, and always return 200 with an honest empty envelope
// when there's nothing to serve. (Matches the proxy contract in CLAUDE.md:
// timeout + cache + stale fallback + honest error envelope.)
// A failed load with nothing stale to serve. Flagged so the consumer can tell
// "the backend genuinely has no events" (honest idle, only ever the backend's own
// 200) apart from "we failed to load" (a degraded refresh). It carries no summary:
// a zero `total_events` here would be a count nobody read. Every failure path --
// a 5xx, a 404 (the endpoint is absent, which is not "no remediations"), a
// timeout or a network error -- answers this, never an unflagged empty.
const DEGRADED_TIMELINE = { events: [] as unknown[], chart_data: [] as unknown[], degraded: true }

// Cap the upstream fetch below the browser's 25s AbortSignal so a cold/hung
// Render worker fails over to stale here instead of timing out in the component.
const UPSTREAM_TIMEOUT_MS = 20_000
const EMPTY_RETRY_TIMEOUT_MS = 5_000

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const startDate = searchParams.get("start_date")
  const endDate = searchParams.get("end_date")
  const limit = searchParams.get("limit") || "200"
  const resourceId = searchParams.get("resource_id")
  const resourceType = searchParams.get("resource_type")
  // Accept either ?system_name= (the backend's canonical key) or ?system=
  // (legacy frontend convention) and forward as system_name.
  const systemName = searchParams.get("system_name") || searchParams.get("system")
  const envelope = searchParams.get("envelope") === "true"
  const forceRefresh = searchParams.get("force_refresh") === "true"

  const queryParams = new URLSearchParams()
  if (startDate) queryParams.set("start_date", startDate)
  if (endDate) queryParams.set("end_date", endDate)
  if (resourceId) queryParams.set("resource_id", resourceId)
  if (resourceType) queryParams.set("resource_type", resourceType)
  if (systemName) queryParams.set("system_name", systemName)
  queryParams.set("limit", limit)
  if (envelope) queryParams.set("envelope", "true")
  if (forceRefresh) queryParams.set("force_refresh", "true")

  const qs = queryParams.toString()
  const canonicalParams = new URLSearchParams(queryParams)
  canonicalParams.delete("force_refresh")
  const canonicalQs = canonicalParams.toString()
  // Cache/stale key is the full query — limit=1&system_name=X (the strip) is a
  // distinct entry from limit=200 (the history page), so one never serves the
  // other's shape.
  const cacheKey = `remediation-timeline:${canonicalQs}`

  const cached = forceRefresh ? null : getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }

  const url = `${BACKEND_URL}/api/remediation-history/timeline?${qs}`

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      // 404 = the endpoint is absent: nothing was read, so this is degraded,
      // never "no remediations recorded".
      if (response.status === 404) {
        return NextResponse.json(DEGRADED_TIMELINE, { headers: { "X-Cache": "DEGRADED-404" } })
      }
      // Any other backend failure (500/502 under load): prefer last-good over a
      // raw error status. NEVER propagate a 5xx to a nice-to-have activity feed.
      // Never over a REFUSAL, though: a 401/403/422 or a typed hold (detail.code) is the
      // server's answer about this caller/scope, and data read earlier must not cover it.
      console.error("[Remediation Timeline Proxy] backend", response.status)
      const body = await response.json().catch(() => null)
      const refused = [401, 403, 422].includes(response.status) || typeof body?.detail?.code === "string"
      const stale = refused ? null : getStaleCached<Record<string, unknown>>(cacheKey)
      if (stale) {
        // Stamped: an older list served over a failed read is not current.
        return NextResponse.json({ ...stale, stale: true }, { headers: { "X-Cache": "STALE-ERROR" } })
      }
      return NextResponse.json(DEGRADED_TIMELINE, { headers: { "X-Cache": "ERROR-EMPTY" } })
    }

    let data = await response.json()
    let freshCount = Array.isArray(data?.events) ? data.events.length : 0

    // A freshly started backend worker can return an empty success before its
    // operation-store read is warm. We observed that exact race in production:
    // History opened at 0 records, then the same force-refresh returned 123.
    // Retry one bounded read before showing an empty audit trail. A genuinely
    // quiet timeline remains empty when both authoritative reads agree.
    if (freshCount === 0) {
      await new Promise(resolve => setTimeout(resolve, 250))
      const retryController = new AbortController()
      const retryTimer = setTimeout(() => retryController.abort(), EMPTY_RETRY_TIMEOUT_MS)
      try {
        const retryResponse = await fetch(url, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal: retryController.signal,
        })
        if (retryResponse.ok) {
          const retryData = await retryResponse.json()
          const retryCount = Array.isArray(retryData?.events) ? retryData.events.length : 0
          if (retryCount > 0) {
            data = retryData
            freshCount = retryCount
          }
        }
      } catch {
        // The existing stale/empty fallback below remains authoritative.
      } finally {
        clearTimeout(retryTimer)
      }
    }

    if (freshCount > 0) {
      setCached(cacheKey, data, TTL_STD)
      return NextResponse.json(data, { headers: { "X-Cache": "MISS" } })
    }
    // Backend answered 200 but with zero events. That's legitimate for a quiet
    // query, but a cold/degraded Render worker also returns empty-200 (observed
    // live: limit=1 flips empty→1-event as the worker warms). Prefer a last-good
    // response that HAD events over blanking the surface; otherwise cache+serve
    // the honest empty so a truly-quiet query still reads idle.
    const staleWithEvents = getStaleCached<{ events?: unknown[] }>(cacheKey)
    if (staleWithEvents && Array.isArray(staleWithEvents.events) && staleWithEvents.events.length > 0) {
      return NextResponse.json({ ...staleWithEvents, stale: true }, { headers: { "X-Cache": "STALE-OVER-EMPTY" } })
    }
    setCached(cacheKey, data, TTL_STD)
    return NextResponse.json(data, { headers: { "X-Cache": "MISS-EMPTY" } })
  } catch (error: any) {
    // Timeout / network / parse — same posture: last-good, else degraded. Always 200.
    console.error("[Remediation Timeline Proxy] error:", error?.message ?? String(error))
    const stale = getStaleCached<Record<string, unknown>>(cacheKey)
    if (stale) {
      return NextResponse.json({ ...stale, stale: true }, { headers: { "X-Cache": "STALE-ERROR" } })
    }
    return NextResponse.json(DEGRADED_TIMELINE, { headers: { "X-Cache": "ERROR-DEGRADED" } })
  }
}
