import { NextResponse } from "next/server"

export async function GET() {
  const backendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || "https://saferemediate-backend-f.onrender.com"

  try {
    // Try /api/health first, fallback to /health
    let response = await fetch(`${backendUrl}/api/health`, {
      headers: { "Content-Type": "application/json" },
    })

    // If /api/health doesn't exist, try /health (current backend endpoint)
    if (!response.ok && response.status === 404) {
      response = await fetch(`${backendUrl}/health`, {
        headers: { "Content-Type": "application/json" },
      })
    }

    if (!response.ok) {
      console.error("[v0] Health check failed:", response.status)
      return NextResponse.json(
        {
          success: false,
          error: `Backend returned ${response.status}`,
          status: "unhealthy",
        },
        { status: response.status },
      )
    }

    const data = await response.json()
    return NextResponse.json({
      success: true,
      status: data.status || "ok",
      ...data,
    })
  } catch (error) {
    console.error("[v0] Health check error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to check backend health",
        status: "unhealthy",
      },
      { status: 503 },
    )
  }
}


