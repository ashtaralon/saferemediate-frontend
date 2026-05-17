import { NextRequest, NextResponse } from "next/server"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

// Proxy for the system-wide egress visibility endpoint. Mirrors the
// identity-attack-paths proxy pattern (nodejs runtime, no static
// caching, per-route timeout matched to the slowest backend run).
//
// Adds Vercel-side caching (5 min, TTL_SLOW) on top of the backend's
// own 5 min cache. Reason: the backend's cold-fan-out on alon-prod
// takes 30s+ (44 workloads × Cypher + ipinfo + SG attribution). When
// the user reloads the page after the backend cache TTL but before
// the Vercel function's process memory is recycled, the proxy
// serves from Vercel cache and never even talks to Render. Without
// this layer, every reload after 5min triggered the 30s cold path
// which sometimes exceeded the proxy's 55s abort window.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

// Allow local dev to point at a localhost backend without touching this
// constant. Render/Vercel never set BACKEND_URL_OVERRIDE so prod stays
// on Render. Set BACKEND_URL_OVERRIDE=http://localhost:8000 in your
// shell or .env.local to test backend changes before deploying.
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
  const topN = searchParams.get("top_n") || "20"
  const cacheKey = `egress|${systemName}|${days}|${topN}`

  // Vercel-side cache hit — instant response, never touches Render.
  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }

  try {
    const url = `${BACKEND_URL}/api/egress/system/${encodeURIComponent(
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
      { error: err.message || "Failed to fetch egress visibility" },
      { status: 502 },
    )
  }
}
