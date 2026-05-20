import { NextRequest, NextResponse } from "next/server"

// Proxy for GET /api/system-map/resource-children — returns the child
// resources of a System Map leaf (S3 bucket → prefixes, RDS instance →
// databases, RDS database → tables, DynamoDB table → no children).
//
// BACKEND_URL_OVERRIDE env hook lets dev point at localhost:8000.

export const runtime = "nodejs"
export const maxDuration = 30

const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const resourceId = searchParams.get("resource_id")
  const systemName = searchParams.get("system_name") || ""
  if (!resourceId) {
    return NextResponse.json(
      { error: "missing resource_id" },
      { status: 400 },
    )
  }
  try {
    const params = new URLSearchParams({ resource_id: resourceId })
    if (systemName) params.set("system_name", systemName)
    const url = `${BACKEND_URL}/api/system-map/resource-children?${params.toString()}`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    })
    if (!res.ok) {
      return NextResponse.json(
        {
          error: "resource_children_unavailable",
          backend_status: res.status,
          resource_id: resourceId,
          children: [],
        },
        { status: res.status === 404 ? 404 : 502 },
      )
    }
    const data = await res.json()
    return NextResponse.json(data, {
      headers: {
        // Children change rarely; let the edge CDN serve repeats for ~60s.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    })
  } catch (err: any) {
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError"
    return NextResponse.json(
      {
        error: isTimeout ? "resource_children_timeout" : "resource_children_proxy_error",
        message: err?.message || "Failed to fetch resource children",
        resource_id: resourceId,
        children: [],
      },
      { status: 502 },
    )
  }
}
