import { NextRequest, NextResponse } from "next/server"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

// Vercel proxy for GET /api/dns/systems/{name}/top-domains — top domains
// queried across all workloads in the system, with reader workloads and
// volume per domain. Drives the system-level DNS panel.

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  "https://saferemediate-backend-f.onrender.com"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const { searchParams } = new URL(req.url)
  const limit = searchParams.get("limit") || "50"
  const cacheKey = `dns-top-domains|${systemName}|${limit}`

  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }

  try {
    const url = `${BACKEND_URL}/api/dns/systems/${encodeURIComponent(systemName)}/top-domains?limit=${limit}`
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
      { error: err.message || "Failed to fetch top domains" },
      { status: 502 },
    )
  }
}
