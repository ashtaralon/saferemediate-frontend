import { NextRequest, NextResponse } from "next/server"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

// Vercel proxy for /api/egress/posture/{system} — the Trust Boundary
// Map data endpoint. Wraps the backend's egress posture endpoint with
// the standard TTL_SLOW (5 min) in-memory cache + 55s upstream timeout.
//
// The backend endpoint internally calls get_system_egress() which has
// its own 5-min cache, so warm-cache responses are 1-2 sec. Cold calls
// against alon-prod take ~30-40s (see /api/egress/system for the same
// backend cost profile). Cache here on Vercel side keeps repeat visits
// instant + survives backend restart cycles.
//
// BACKEND_URL_OVERRIDE env hook lets dev point at localhost:8000
// without editing this file.

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
  const days = searchParams.get("days") || "30"
  const topN = searchParams.get("top_n") || "50"
  const cacheKey = `egress-posture|${systemName}|${days}|${topN}`

  // Vercel-side cache hit — instant.
  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }

  try {
    const url = `${BACKEND_URL}/api/egress/posture/${encodeURIComponent(
      systemName,
    )}?days=${days}&top_n=${topN}`
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
      { error: err.message || "Failed to fetch egress posture" },
      { status: 502 },
    )
  }
}
