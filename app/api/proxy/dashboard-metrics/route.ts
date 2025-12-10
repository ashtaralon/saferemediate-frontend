import { NextResponse } from "next/server"

// Use Edge Runtime - runs globally, closer to backend
export const runtime = 'edge'
export const dynamic = "force-dynamic"

export async function GET() {
  // Use NEXT_PUBLIC_ prefix for Edge Runtime compatibility
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"

  try {
    // Add timeout to prevent hanging - 15 seconds for slow backend
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(`${backendUrl}/api/dashboard/metrics`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      console.error("[proxy] Dashboard metrics fetch failed:", response.status)
      return NextResponse.json({
        success: false,
        error: `Backend returned ${response.status}`,
        metrics: null,
      })
    }

    const data = await response.json()
    console.log("[proxy] Dashboard metrics fetched successfully")

    return NextResponse.json({
      success: true,
      metrics: data.metrics || data,
    })
  } catch (error: any) {
    console.error("[proxy] Dashboard metrics fetch error:", error.name === 'AbortError' ? 'Request timed out' : error)
    return NextResponse.json({
      success: false,
      error: error.name === 'AbortError' ? 'Request timed out' : (error.message || "Failed to fetch dashboard metrics"),
      metrics: null,
    })
  }
}
