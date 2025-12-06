import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET() {
  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || "https://saferemediate-backend.onrender.com"

  try {
    const response = await fetch(`${backendUrl}/api/findings`, {
      headers: { "Content-Type": "application/json" },
    })

    if (!response.ok) {
      console.error("[v0] Findings fetch failed:", response.status)
      return NextResponse.json({
        success: false,
        error: `Backend returned ${response.status}`,
        findings: [],
      })
    }

    const data = await response.json()
    console.log("[v0] Findings fetched:", data?.findings?.length || data?.length || 0)

    return NextResponse.json({
      success: true,
      findings: data.findings || data || [],
    })
  } catch (error) {
    console.error("[v0] Findings fetch error:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch findings",
      findings: [],
    })
  }
}
