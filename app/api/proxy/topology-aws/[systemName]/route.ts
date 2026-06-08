import { NextRequest, NextResponse } from "next/server"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> }
) {
  const { systemName } = await params
  const BACKEND_URL = getBackendBaseUrl()

  const cacheKey = `topology-aws:${systemName}`
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
    const url = `${BACKEND_URL}/api/topology-aws/${encodeURIComponent(systemName)}`
    const t0 = Date.now()
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    })
    const latencyMs = Date.now() - t0
    console.log(
      `[topology-aws] systemName=${systemName} status=${res.status} latency_ms=${latencyMs}`
    )
    if (!res.ok) {
      return NextResponse.json(
        {
          error: "topology_unavailable",
          backend_status: res.status,
          system_name: systemName,
          vpcs: [],
        },
        { status: res.status }
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
  } catch (err: any) {
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError"
    console.error(
      `[topology-aws] systemName=${systemName} error=${err?.name || "unknown"} message=${err?.message || ""}`
    )
    return NextResponse.json(
      {
        error: isTimeout ? "topology_timeout" : "topology_proxy_error",
        message: err?.message || "Failed to fetch topology",
        system_name: systemName,
        vpcs: [],
      },
      { status: 502 }
    )
  }
}
