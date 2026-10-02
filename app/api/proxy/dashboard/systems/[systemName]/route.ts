import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { fromCaughtError, relayBackendError } from "@/lib/server/proxy-error"
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
    // A typed refusal (held route, no data accounts, scope) is relayed typed, never a bare 502.
    if (!response.ok) return relayBackendError(response)
    const data: unknown = await response.json()
    if (isCacheableSystemExecutiveSnapshot(data)) setCached(cacheKey, data, TTL_SLOW)
    return NextResponse.json(data, { headers: { "X-Cache": "MISS" } })
  } catch (error) {
    return fromCaughtError(error)
  }
}
