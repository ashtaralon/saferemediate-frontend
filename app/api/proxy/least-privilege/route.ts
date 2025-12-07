import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET(request: Request) {
  const backendUrl =
    process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-1.onrender.com"

  try {
    // Get systemName from query parameters
    const { searchParams } = new URL(request.url)
    const systemName = searchParams.get("systemName") || "SafeRemediate-Lambda-Remediation-Role"

    // Clean backend URL
    let cleanBackendUrl = backendUrl.replace(/\/+$/, "").replace(/\/backend$/, "")

    const response = await fetch(`${cleanBackendUrl}/api/traffic/gap/${encodeURIComponent(systemName)}`, {
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
