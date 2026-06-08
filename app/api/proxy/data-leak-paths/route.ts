import { NextRequest, NextResponse } from "next/server"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

// Vercel proxy for /api/data-leak-paths — backs the new Data Leak Paths
// page + the Trust Boundary card's "N exposed of M accessible" count.
// The backend endpoint internally reuses get_system_posture()'s 5-min
// cache, so warm-cache responses are 1-2s; cold calls against alon-prod
// take 90-150s (matches the egress posture cost profile). Vercel-side
// cache keeps repeat visits instant and survives backend restarts.
//
// BACKEND_URL_OVERRIDE env hook lets dev point at localhost:8000 / 8765
// without editing this file.

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const systemName = searchParams.get("systemName")
  const days = searchParams.get("days") || "30"

  if (!systemName) {
    return NextResponse.json(
      { error: "systemName query param is required" },
      { status: 400 },
    )
  }

  const cacheKey = `data-leak-paths|${systemName}|${days}`
  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }

  try {
    const url = `${BACKEND_URL}/api/data-leak-paths?systemName=${encodeURIComponent(
      systemName,
    )}&days=${days}`
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch data leak paths"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
