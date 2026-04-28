import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const systemName = searchParams.get("systemName")
  if (!systemName) {
    return NextResponse.json({ error: "systemName query parameter is required" }, { status: 400 })
  }
  const window = searchParams.get("window") || "30d"

  try {
    // Try to fetch real X-Ray service map from backend
    const res = await fetch(`${BACKEND_URL}/api/xray/service-map?systemName=${systemName}&window=${window}`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })

    if (res.ok) {
      const data = await res.json()
      return NextResponse.json(data)
    }

    // Honesty contract: do NOT fabricate an X-Ray service map on backend
    // non-200. Previously this returned a five-service topology with
    // realistic ARNs (api-gateway → frontend-lambda → rds/dynamodb/s3) that
    // looked indistinguishable from real X-Ray output. Now: surface the
    // failure so the client can render "service map unavailable".
    return NextResponse.json(
      {
        error: "x_ray_service_map_backend_unavailable",
        message: `Backend X-Ray service-map endpoint returned ${res.status}`,
        backend_status: res.status,
      },
      { status: 502 }
    )
  } catch (error) {
    console.error("[X-Ray Service Map] Error:", error)
    return NextResponse.json({ error: "Failed to fetch X-Ray service map" }, { status: 500 })
  }
}
