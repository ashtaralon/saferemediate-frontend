import { NextRequest, NextResponse } from "next/server"
import { getCached, setCached, TTL_FAST } from "@/lib/server/proxy-cache"

// Vercel proxy for the System Map resource-paths endpoint.
//
// Returns filter metadata for a System Map leaf — the parent jewel id
// (so the TrafficFlowMap can scroll/highlight it) plus optional
// intersection filters (accessor IDs, source IPs, db/table filter).
// Cheap call (~260ms), used on every click of the Filter icon in
// StackSidebar. No edge cache — response depends on selection state
// and a stale value would give the wrong filter — but we keep a tiny
// per-instance memory cache (TTL_FAST 30s) to absorb rapid re-clicks.
//
// BACKEND_URL_OVERRIDE env hook for local dev. 15s abort budget;
// structured 502 envelope on backend error.

export const runtime = "nodejs"
export const maxDuration = 20

const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  "https://saferemediate-backend-f.onrender.com"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const resourceId = searchParams.get("resource_id")
  const systemName = searchParams.get("system_name")

  if (!resourceId) {
    return NextResponse.json(
      { error: "resource_id query parameter required" },
      { status: 400 },
    )
  }

  const cacheKey = `system-map-paths|${resourceId}|${systemName ?? ""}`

  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        "X-Cache": "HIT",
        "Cache-Control": "no-store",
      },
    })
  }

  try {
    const qs = new URLSearchParams({ resource_id: resourceId })
    if (systemName) qs.set("system_name", systemName)

    const url = `${BACKEND_URL}/api/system-map/resource-paths?${qs.toString()}`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      return NextResponse.json(
        {
          error: `Backend returned ${res.status}`,
          status: res.status,
          resource_id: resourceId,
        },
        { status: 502 },
      )
    }

    const data = await res.json()
    setCached(cacheKey, data, TTL_FAST)
    return NextResponse.json(data, {
      headers: {
        "X-Cache": "MISS",
        "Cache-Control": "no-store",
      },
    })
  } catch (err: any) {
    console.error("[system-map/resource-paths] fetch error:", err)
    return NextResponse.json(
      {
        error: err.message || "Failed to fetch resource paths",
        resource_id: resourceId,
      },
      { status: 502 },
    )
  }
}
