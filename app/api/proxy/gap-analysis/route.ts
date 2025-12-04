import { NextResponse } from "next/server"

const BACKEND_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"

export async function GET(request: Request) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/traffic/gap/SafeRemediate-Lambda-Remediation-Role`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    })

    // If endpoint doesn't exist, return empty data (not hardcoded 28)
    if (response.status === 404) {
      console.log("[v0] Gap analysis endpoint not found, returning empty data")
      return NextResponse.json({
        success: false,
        allowed_actions: 0,
        used_actions: 0,
        unused_actions: 0,
        message: "Gap analysis endpoint not available",
      })
    }

    if (!response.ok) {
      console.log("[v0] Gap analysis backend error")
      return NextResponse.json({
        success: false,
        allowed_actions: 0,
        used_actions: 0,
        unused_actions: 0,
        message: `Backend returned ${response.status}`,
      })
    }

    const data = await response.json()
    console.log("[v0] Gap analysis data:", data)
    return NextResponse.json({
      success: true,
      ...data,
    })
  } catch (error: any) {
    console.error("[v0] Gap analysis fetch error:", error)
    return NextResponse.json({
      success: false,
      allowed_actions: 0,
      used_actions: 0,
      unused_actions: 0,
      message: error.message || "Connection failed",
    })
  }
}
