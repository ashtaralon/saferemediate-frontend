import { NextRequest, NextResponse } from "next/server"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

// Vercel proxy for the legacy attack-paths endpoint. Was running with
// `cache: "no-store"` and zero Vercel-side cache — every visit paid the
// full backend cost (cold-call observed at 30s+ on alon-prod; Vercel's
// 60s function budget catches the worst), surfacing as 502 to operators
// on any backend cold-cache cycle. Render restarts on every backend
// deploy clear the in-memory cache, so the "deploy → first visit → 502"
// cycle was hitting users in production.
//
// Mirrors the identity-attack-paths proxy pattern: nodejs runtime,
// per-instance in-memory cache, 5-min TTL_SLOW matched to the backend's
// own cache TTL. Cache key includes every query param so toggling
// max_paths / include_configured forces a fresh fetch.
//
// BACKEND_URL_OVERRIDE env hook lets dev point at localhost:8000
// without editing this file. Render/Vercel never set it, so prod stays
// on the Render URL.

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  "https://saferemediate-backend-f.onrender.com"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const { searchParams } = new URL(request.url)
  const maxPaths = searchParams.get("max_paths") || "100"
  const includeConfigured = searchParams.get("include_configured") !== "false"

  const cacheKey = `attack-paths|${systemName}|${maxPaths}|${includeConfigured}`

  // Vercel-side cache hit — instant response, never touches Render.
  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }

  try {
    const queryParams = `?max_paths=${maxPaths}&include_configured=${includeConfigured}`
    const url = `${BACKEND_URL}/api/attack-paths/${encodeURIComponent(systemName)}${queryParams}`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(55000),
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend returned ${res.status}`, status: res.status },
        { status: res.status },
      )
    }

    const data = await res.json()
    setCached(cacheKey, data, TTL_SLOW)
    return NextResponse.json(data, { headers: { "X-Cache": "MISS" } })
  } catch (err: any) {
    console.error("[attack-paths] fetch error:", err)
    return NextResponse.json(
      { error: err.message || "Failed to fetch attack paths" },
      { status: 502 },
    )
  }
}
