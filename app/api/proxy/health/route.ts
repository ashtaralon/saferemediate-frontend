import { requireBackendUrl } from "@/lib/backend-url";
import { NextResponse } from "next/server"

export async function GET() {
  const backendUrl =
  requireBackendUrl()

  try {
    // Public callers receive liveness + build identity only. Detailed backend
    // diagnostics live behind the server-side operator-token boundary.
    const response = await fetch(`${backendUrl}/healthz`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })

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

