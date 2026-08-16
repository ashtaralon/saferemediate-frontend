import { requireBackendUrl } from "@/lib/backend-url";
import { NextResponse } from "next/server"

// Use Edge Runtime - runs globally, closer to backend
// Use Node.js runtime for longer timeout
export const runtime = 'nodejs'
export const dynamic = "force-dynamic"
export const maxDuration = 30 // Maximum execution time in seconds (Vercel Pro tier)

export async function GET() {
  // Use NEXT_PUBLIC_ prefix for Edge Runtime compatibility
  const backendUrl = requireBackendUrl()

  try {
    // 25s, 5s under the 30s maxDuration below. Was 28s, which left only 2s
    // for the catch block to serialise its fallback response.
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25_000)

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

    // Backend returns data directly, wrap it for frontend compatibility
    return NextResponse.json({
      success: true,
      metrics: data, // Backend already returns the metrics object
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
