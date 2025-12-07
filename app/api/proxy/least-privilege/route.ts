import { NextResponse } from "next/server"

export async function GET() {
  const backendUrl =
    process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-1.onrender.com"

  try {
    const response = await fetch(`${backendUrl}/api/traffic/gap/SafeRemediate-Lambda-Remediation-Role`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })

    if (!response.ok) {
      console.log("[v0] Gap analysis fetch failed:", response.status)
      return NextResponse.json({
        success: false,
        error: `Backend returned ${response.status}`,
        allowed_actions: 0,
        used_actions: 0,
        unused_actions: 0,
        allowed_actions_list: [],
        unused_actions_list: [],
      })
    }

    const data = await response.json()
    console.log("[v0] Gap analysis API response:", JSON.stringify(data).substring(0, 500))

    return NextResponse.json({
      success: true,
      ...data,
    })
  } catch (error) {
    console.error("[v0] Gap analysis API error:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      allowed_actions: 0,
      used_actions: 0,
      unused_actions: 0,
      allowed_actions_list: [],
      unused_actions_list: [],
    })
  }
}
