import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_STD } from "@/lib/server/proxy-cache"

const BACKEND_URL = getBackendBaseUrl()
export const maxDuration = 30

/**
 * GET /api/proxy/findings/severity-summary?systemName=X&status=open
 *
 * Per-(system, status) finding count + severity histogram from the
 * canonical SecurityFinding store. Replaces /api/proxy/issues-summary
 * as the source for the Findings Pressure widget — issues-summary
 * recomputes counts from raw resource properties (gap_count > 0 OR
 * exposed_count > 0), which can disagree with the SecurityFinding
 * store on the same system. Both Findings Pressure and Decision
 * Routing now read from SecurityFinding so the numbers reconcile.
 *
 * 60s proxy cache keyed on (systemName, status).
 */
export async function GET(req: NextRequest) {
  const systemName = req.nextUrl.searchParams.get("systemName") || ""
  const status = req.nextUrl.searchParams.get("status") || "open"
  const cacheKey = `findings-severity-${systemName || "_org_"}-${status}`
  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }
  const qs = new URLSearchParams()
  if (systemName) qs.set("systemName", systemName)
  qs.set("status", status)
  try {
    const r = await fetch(
      `${BACKEND_URL}/api/findings/severity-summary?${qs.toString()}`,
      {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      },
    )
    if (!r.ok) {
      return NextResponse.json(
        {
          error: "severity_summary_unavailable",
          backend_status: r.status,
          total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0, unknown: 0,
          system_name: systemName || null,
          status_filter: status,
        },
        { status: 502 },
      )
    }
    const data = await r.json()
    setCached(cacheKey, data, TTL_STD)
    return NextResponse.json(data, { headers: { "X-Cache": "MISS" } })
  } catch (e) {
    return NextResponse.json(
      {
        error: "severity_summary_proxy_error",
        message: e instanceof Error ? e.message : String(e),
        total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0, unknown: 0,
        system_name: systemName || null,
        status_filter: status,
      },
      { status: 502 },
    )
  }
}
