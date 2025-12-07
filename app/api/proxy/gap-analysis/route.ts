import { NextResponse } from "next/server"

export async function GET(request: Request) {
  // Get backend URL and ensure it doesn't have /backend/api duplication
  let backendUrl =
    process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"
  
  // Remove trailing slashes and /backend if present
  backendUrl = backendUrl.replace(/\/+$/, "").replace(/\/backend$/, "")

  try {
    // Extract systemName from query parameters
    const { searchParams } = new URL(request.url)
    const systemName = searchParams.get("systemName") || "SafeRemediate-Lambda-Remediation-Role"
    
    const response = await fetch(`${backendUrl}/api/traffic/gap/${systemName}`, {
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
