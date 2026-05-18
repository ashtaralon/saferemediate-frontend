import { NextRequest, NextResponse } from "next/server"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

// Vercel proxy for GET /api/dns/workloads/{id}/domains — top domains a
// workload queried in the lookback window, with query counts and types.
// Consumed by the compute detail panel.

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  "https://saferemediate-backend-f.onrender.com"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workloadId: string }> },
) {
  const { workloadId } = await params
  const { searchParams } = new URL(req.url)
  const limit = searchParams.get("limit") || "50"
  const cacheKey = `dns-workload-domains|${workloadId}|${limit}`

  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }

  try {
    const url = `${BACKEND_URL}/api/dns/workloads/${encodeURIComponent(workloadId)}/domains?limit=${limit}`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(55000),
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend returned ${res.status}` },
        { status: res.status },
      )
    }
    const data = await res.json()
    setCached(cacheKey, data, TTL_SLOW)
    return NextResponse.json(data, { headers: { "X-Cache": "MISS" } })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch workload domains" },
      { status: 502 },
    )
  }
}
