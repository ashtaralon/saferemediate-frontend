import { NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"
import { isCacheableExecutiveSnapshot } from "@/lib/executive-snapshot"

const CACHE_KEY = "dashboard-executive-snapshot-v1"

export const maxDuration = 60

export async function GET() {
  const cached = getCached(CACHE_KEY)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }

  try {
    const response = await fetch(
      `${getBackendBaseUrl()}/api/dashboard/executive-snapshot`,
      {
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(55_000),
      },
    )
    if (!response.ok) {
      return NextResponse.json(
        {
          error: "executive_snapshot_unavailable",
          backend_status: response.status,
          message: `Backend returned ${response.status}`,
        },
        { status: 502 },
      )
    }
    const data: unknown = await response.json()
    if (isCacheableExecutiveSnapshot(data)) {
      setCached(CACHE_KEY, data, TTL_SLOW)
    }
    return NextResponse.json(data, { headers: { "X-Cache": "MISS" } })
  } catch (error) {
    return NextResponse.json(
      {
        error: "executive_snapshot_proxy_error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    )
  }
}
