import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const systemName = searchParams.get("systemName")
  if (!systemName) {
    return NextResponse.json({ error: "systemName query parameter is required" }, { status: 400 })
  }
  const window = searchParams.get("window") || "30d"
  const serviceId = searchParams.get("serviceId") || ""

  try {
    // Try to fetch real X-Ray traces from backend
    const res = await fetch(
      `${BACKEND_URL}/api/xray/traces?systemName=${systemName}&window=${window}&serviceId=${serviceId}`,
      {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      }
    )

    if (res.ok) {
      const data = await res.json()
      return NextResponse.json(data)
    }

    // Honesty contract: do NOT fabricate X-Ray traces on backend non-200.
    // Previously this returned 3 invented insights, p95Latency=234, four
    // hardcoded top operations — UI couldn't tell them from real X-Ray data.
    // Now: surface the failure so the client can render "X-Ray unavailable".
    return NextResponse.json(
      {
        error: "x_ray_backend_unavailable",
        message: `Backend X-Ray endpoint returned ${res.status}`,
        backend_status: res.status,
      },
      { status: 502 }
    )
  } catch (error) {
    console.error("[X-Ray Traces] Error:", error)
    return NextResponse.json({ error: "Failed to fetch X-Ray traces" }, { status: 500 })
  }
}
