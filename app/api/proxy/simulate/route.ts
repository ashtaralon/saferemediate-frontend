import { type NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://saferemediate-backend-f.onrender.com"

// No mock data - only return real data from backend

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { finding_id, resource_id, resource_type } = body

    if (!finding_id) {
      return NextResponse.json(
        { success: false, error: "finding_id is required" },
        { status: 400 }
      )
    }

    let data: any

    try {
      // Try to call the backend
      const response = await fetch(`${BACKEND_URL}/api/simulate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ finding_id, resource_id, resource_type }),
      })

      if (response.ok) {
        data = await response.json()
      } else {
        // Backend error - return error response (no mock data)
        console.error(`Backend returned ${response.status}`)
        return NextResponse.json(
          { success: false, error: `Backend returned ${response.status}` },
          { status: response.status, headers: { "X-Proxy": "simulate-error" } }
        )
      }
    } catch (backendError) {
      // Backend unreachable - return error (no mock data)
      console.error("Backend unreachable:", backendError)
      return NextResponse.json(
        { success: false, error: "Backend unreachable" },
        { status: 503, headers: { "X-Proxy": "simulate-error" } }
      )
    }

    // Only return real data from backend - no mock data
    if (!data || !data.success) {
      return NextResponse.json(
        { success: false, error: "Backend returned invalid data" },
        { status: 500, headers: { "X-Proxy": "simulate-error" } }
      )
    }

    // Add X-Proxy header to prove this route was used
    return NextResponse.json(data, {
      headers: {
        "X-Proxy": "simulate",
        "X-Proxy-Timestamp": new Date().toISOString(),
      }
    })

  } catch (error) {
    console.error("Simulation error:", error)
    return NextResponse.json(
      { success: false, error: "Simulation failed" },
      { status: 500, headers: { "X-Proxy": "simulate-error" } }
    )
  }
}
