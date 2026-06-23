import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { getCached, getStaleCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()

/** Lightweight Crown Jewel list — pairs with BE /identity-attack-paths/{system}/jewels */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const cacheKey = `iap-jewels:${systemName}`
  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        "X-Cache": "HIT",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    })
  }

  try {
    const url = `${BACKEND_URL}/api/identity-attack-paths/${encodeURIComponent(systemName)}/jewels?max_jewels=12`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.error(`[iap-jewels] backend ${res.status}: ${body.slice(0, 200)}`)
      return NextResponse.json(
        { error: `backend_${res.status}`, crown_jewels: [] },
        { status: res.status },
      )
    }
    const data = await res.json()
    setCached(cacheKey, data, TTL_SLOW)
    return NextResponse.json(data, {
      headers: {
        "X-Cache": "MISS",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError" || msg.includes("timeout"))
    const stale = getStaleCached(cacheKey)
    if (isTimeout && stale) {
      console.warn(`[iap-jewels] timeout — serving stale cache systemName=${systemName}`)
      return NextResponse.json(
        { ...stale, fromStaleCache: true, staleReason: "timeout" },
        {
          headers: {
            "X-Cache": "STALE",
            "Cache-Control": "no-store",
          },
        },
      )
    }
    console.error(`[iap-jewels] systemName=${systemName} error=${msg}`)
    return NextResponse.json(
      { error: "iap_jewels_proxy_error", message: msg, crown_jewels: [] },
      { status: 502 },
    )
  }
}
