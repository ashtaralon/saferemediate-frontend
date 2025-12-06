import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET() {
  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || "https://saferemediate-backend.onrender.com"

  try {
    const response = await fetch(`${backendUrl}/api/dashboard/metrics`, {
      headers: { "Content-Type": "application/json" },
    })

    if (!response.ok) {
      console.error("[v0] Dashboard metrics fetch failed:", response.status)
      return NextResponse.json({
        success: false,
        error: `Backend returned ${response.status}`,
        metrics: null,
      })
    }

    const data = await response.json()
    console.log("[v0] Dashboard metrics fetched:", JSON.stringify(data).substring(0, 200))

    return NextResponse.json({
      success: true,
      metrics: data.metrics || data,
    })
  } catch (error) {
    console.error("[v0] Dashboard metrics fetch error:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch dashboard metrics",
      metrics: null,
    })
  }
}
