import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || "https://saferemediate-backend.onrender.com"

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/dashboard/metrics`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })

    if (!response.ok) {
      console.error("[proxy] Dashboard metrics fetch failed:", response.status)
      return NextResponse.json({
        success: false,
        error: `Backend returned ${response.status}`,
        metrics: null,
      })
    }

    const data = await response.json()
    return NextResponse.json({
      success: true,
      metrics: data.metrics || data,
    })
  } catch (error) {
    console.error("[proxy] Dashboard metrics fetch error:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch dashboard metrics",
      metrics: null,
    })
  }
}
