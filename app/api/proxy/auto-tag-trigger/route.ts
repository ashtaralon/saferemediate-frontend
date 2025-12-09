import { NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://saferemediate-backend.onrender.com"

const FETCH_TIMEOUT = 10000 // 10 second timeout

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { systemName } = body

    console.log("[auto-tag-trigger] Triggering auto-tag for system:", systemName)

    // Try backend first
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

      const response = await fetch(`${BACKEND_URL}/api/auto-tag/trigger`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ systemName }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        const data = await response.json()
        console.log("[auto-tag-trigger] Backend success:", data)
        return NextResponse.json({
          success: true,
          ...data,
        })
      }
    } catch (backendError: any) {
      console.log("[auto-tag-trigger] Backend unavailable:", backendError.message)
    }

    // Local fallback - simulate trigger success
    console.log("[auto-tag-trigger] Using local simulation for system:", systemName)

    return NextResponse.json({
      success: true,
      status: "running",
      message: `Auto-tagging started for system: ${systemName}`,
      simulated: true,
      estimatedDuration: "2-5 minutes",
    })
  } catch (error: any) {
    console.error("[auto-tag-trigger] Error:", error)
    return NextResponse.json({
      success: false,
      error: error.message || "Failed to trigger auto-tag",
    })
  }
}
