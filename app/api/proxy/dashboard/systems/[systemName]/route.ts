import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"
import { isCacheableSystemExecutiveSnapshot } from "@/lib/system-executive-snapshot"

export const maxDuration = 60

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const cacheKey = `dashboard-system-executive-v1:${systemName}`
  const cached = getCached(cacheKey)
  if (cached) return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })

  try {
    const response = await fetch(
      `${getBackendBaseUrl()}/api/dashboard/systems/${encodeURIComponent(systemName)}`,
      {
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(55_000),
      },
    )
    if (!response.ok) {
      return NextResponse.json(
        { error: "system_executive_snapshot_unavailable", backend_status: response.status },
        { status: 502 },
      )
    }
    const data: unknown = await response.json()
    if (isCacheableSystemExecutiveSnapshot(data)) setCached(cacheKey, data, TTL_SLOW)
    return NextResponse.json(data, { headers: { "X-Cache": "MISS" } })
  } catch (error) {
    return NextResponse.json(
      {
        error: "system_executive_snapshot_proxy_error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    )
  }
}
