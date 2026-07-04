import { NextRequest, NextResponse } from "next/server"
import { getCached, getStaleCached, setCached, TTL_STD } from "@/lib/server/proxy-cache"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

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
const EMPTY_TIMELINE = {
  events: [] as unknown[],
  chart_data: [] as unknown[],
  summary: {
    total_events: 0,
    permissions_removed: 0,
    rollbacks: 0,
    avg_confidence: 0,
  },
}

// Cap the upstream fetch below the browser's 25s AbortSignal so a cold/hung
// Render worker fails over to stale here instead of timing out in the component.
const UPSTREAM_TIMEOUT_MS = 20_000

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

  const queryParams = new URLSearchParams()
  if (startDate) queryParams.set("start_date", startDate)
  if (endDate) queryParams.set("end_date", endDate)
  if (resourceId) queryParams.set("resource_id", resourceId)
  if (resourceType) queryParams.set("resource_type", resourceType)
  if (systemName) queryParams.set("system_name", systemName)
  queryParams.set("limit", limit)
  if (envelope) queryParams.set("envelope", "true")

  const qs = queryParams.toString()
  // Cache/stale key is the full query — limit=1&system_name=X (the strip) is a
  // distinct entry from limit=200 (the history page), so one never serves the
  // other's shape.
  const cacheKey = `remediation-timeline:${qs}`

  const cached = getCached(cacheKey)
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
      // 404 = endpoint genuinely absent → honest empty (nothing to serve stale).
      if (response.status === 404) {
        return NextResponse.json(EMPTY_TIMELINE, { headers: { "X-Cache": "EMPTY-404" } })
      }
      // Any other backend failure (500/502 under load): prefer last-good over a
      // raw error status. NEVER propagate a 5xx to a nice-to-have activity feed.
      console.error("[Remediation Timeline Proxy] backend", response.status)
      const stale = getStaleCached(cacheKey)
      if (stale) {
        return NextResponse.json(stale, { headers: { "X-Cache": "STALE-ERROR" } })
      }
      return NextResponse.json(EMPTY_TIMELINE, { headers: { "X-Cache": "ERROR-EMPTY" } })
    }

    const data = await response.json()
    setCached(cacheKey, data, TTL_STD)
    return NextResponse.json(data, { headers: { "X-Cache": "MISS" } })
  } catch (error: any) {
    // Timeout / network / parse — same posture: last-good, else empty. Always 200.
    console.error("[Remediation Timeline Proxy] error:", error?.message ?? String(error))
    const stale = getStaleCached(cacheKey)
    if (stale) {
      return NextResponse.json(stale, { headers: { "X-Cache": "STALE-ERROR" } })
    }
    return NextResponse.json(EMPTY_TIMELINE, { headers: { "X-Cache": "ERROR-EMPTY" } })
  }
}
