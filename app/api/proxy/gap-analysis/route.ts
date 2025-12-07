import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || "https://saferemediate-backend.onrender.com"

export async function GET(request: Request) {
  try {
    // Get systemName from query params
    const { searchParams } = new URL(request.url)
    const systemName = searchParams.get("systemName")

    if (!systemName) {
      return NextResponse.json({
        success: false,
        allowed: [],
        used: [],
        unused: [],
        confidence: 0,
        message: "systemName parameter is required",
      })
    }

    // Call the new backend endpoint with systemName
    const backendUrl = `${BACKEND_URL}/api/gap-analysis?systemName=${encodeURIComponent(systemName)}`
    console.log("[proxy] Calling gap-analysis:", backendUrl)

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    })

    // If endpoint doesn't exist, return empty data
    if (response.status === 404) {
      console.log("[proxy] Gap analysis endpoint not found, returning empty data")
      return NextResponse.json({
        success: false,
        allowed: [],
        used: [],
        unused: [],
        confidence: 0,
        message: "Gap analysis endpoint not available",
      })
    }

    if (!response.ok) {
      console.log("[proxy] Gap analysis backend error:", response.status)
      return NextResponse.json({
        success: false,
        allowed: [],
        used: [],
        unused: [],
        confidence: 0,
        message: `Backend returned ${response.status}`,
      })
    }

    const data = await response.json()
    console.log("[proxy] Gap analysis data received:", JSON.stringify(data).slice(0, 200))

    return NextResponse.json({
      success: true,
      ...data,
    })
  } catch (error: any) {
    console.error("[proxy] Gap analysis fetch error:", error)
    return NextResponse.json({
      success: false,
      allowed: [],
      used: [],
      unused: [],
      confidence: 0,
      message: error.message || "Connection failed",
    })
  }
}
