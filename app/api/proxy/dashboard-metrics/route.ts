import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET() {
  const backendUrl =
    process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"

  try {
    // Add timeout to prevent hanging
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

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
