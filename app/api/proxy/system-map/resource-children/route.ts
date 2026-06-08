import { NextRequest, NextResponse } from "next/server"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

// Vercel proxy for the System Map drill-down children endpoint.
//
// Backend returns immediate children of a resource node, used by
// StackSidebar's nested expansion (S3 buckets → prefixes, RDS instances
// → databases → tables). Each response is a flat list with metric_label
// chips and an `is_leaf` boolean so the UI knows whether to render a
// chevron. Backend has its own in-memory cache; we add a Vercel-side
// 5-min cache to avoid the cold-Render round trip on common nodes.
//
// Mirrors the attack-paths proxy pattern: nodejs runtime, structured
// 502 envelope on backend error, BACKEND_URL_OVERRIDE env hook so local
// dev hits localhost:8000.

export const runtime = "nodejs"
export const maxDuration = 30

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

  const cacheKey = `system-map-children|${resourceId}|${systemName ?? ""}`

  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        "X-Cache": "HIT",
        "Cache-Control":
          "public, s-maxage=300, stale-while-revalidate=300",
      },
    })
  }

  try {
    const qs = new URLSearchParams({ resource_id: resourceId })
    if (systemName) qs.set("system_name", systemName)

    const url = `${BACKEND_URL}/api/system-map/resource-children?${qs.toString()}`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(25000),
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
    setCached(cacheKey, data, TTL_SLOW)
    return NextResponse.json(data, {
      headers: {
        "X-Cache": "MISS",
        "Cache-Control":
          "public, s-maxage=300, stale-while-revalidate=300",
      },
    })
  } catch (err: any) {
    console.error("[system-map/resource-children] fetch error:", err)
    return NextResponse.json(
      {
        error: err.message || "Failed to fetch resource children",
        resource_id: resourceId,
      },
      { status: 502 },
    )
  }
}
