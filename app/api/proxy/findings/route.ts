import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET() {
  let backendUrl =
    process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"

  // Remove trailing slashes and /backend if present
  backendUrl = backendUrl.replace(/\/+$/, "").replace(/\/backend$/, "")

  try {
    // Add timeout to prevent hanging
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    const response = await fetch(`${backendUrl}/api/findings`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      console.error("[proxy] Findings fetch failed:", response.status)
      return NextResponse.json({
        success: false,
        error: `Backend returned ${response.status}`,
        findings: [],
      })
    }

    const data = await response.json()
    console.log("[proxy] Findings fetched:", data?.findings?.length || data?.length || 0)

    return NextResponse.json({
      success: true,
      findings: data.findings || data || [],
    })
  } catch (error: any) {
    console.error("[proxy] Findings fetch error:", error.name === 'AbortError' ? 'Request timed out' : error)
    return NextResponse.json({
      success: false,
      error: error.name === 'AbortError' ? 'Request timed out' : (error.message || "Failed to fetch findings"),
      findings: [],
    })
  }
}
