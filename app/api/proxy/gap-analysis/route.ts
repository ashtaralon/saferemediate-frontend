import { NextResponse } from "next/server"

const BACKEND_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"

export async function GET(request: Request) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/traffic/gap/SafeRemediate-Lambda-Remediation-Role`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    })

    // If endpoint doesn't exist, return fallback data
    if (response.status === 404) {
      console.log("[v0] Gap analysis endpoint not found, using fallback data")
      return NextResponse.json({
        success: true,
        allowed_actions: 28,
        used_actions: 0,
        unused_actions: 28,
        fallback: true,
      })
    }

    if (!response.ok) {
      console.log("[v0] Gap analysis backend error, using fallback data")
      return NextResponse.json({
        success: true,
        allowed_actions: 28,
        used_actions: 0,
        unused_actions: 28,
        fallback: true,
      })
    }

    const data = await response.json()
    return NextResponse.json({
      success: true,
      ...data,
    })
  } catch (error: any) {
    console.error("[v0] Gap analysis fetch error:", error)
    return NextResponse.json({
      success: true,
      allowed_actions: 28,
      used_actions: 0,
      unused_actions: 28,
      fallback: true,
    })
  }
}
