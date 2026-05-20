import { NextRequest, NextResponse } from "next/server"

// Proxy for GET /api/system-map/resource-paths — returns filter metadata
// for paths terminating at a leaf resource. Returns parent_jewel_id +
// accessor_ids + source_ips; frontend intersects against its already-
// cached attack-paths response.

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
    const url = `${BACKEND_URL}/api/system-map/resource-paths?${params.toString()}`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      return NextResponse.json(
        {
          error: "resource_paths_unavailable",
          backend_status: res.status,
          resource_id: resourceId,
          parent_jewel_id: resourceId,
          accessor_ids: [],
          source_ips: [],
        },
        { status: res.status === 404 ? 404 : 502 },
      )
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError"
    return NextResponse.json(
      {
        error: isTimeout ? "resource_paths_timeout" : "resource_paths_proxy_error",
        message: err?.message || "Failed to fetch resource paths",
        resource_id: resourceId,
        parent_jewel_id: resourceId,
        accessor_ids: [],
        source_ips: [],
      },
      { status: 502 },
    )
  }
}
