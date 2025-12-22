import { NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || "https://saferemediate-backend-f.onrender.com"

// Timeout for backend requests (25 seconds, safe under Vercel 30s limit)
const BACKEND_TIMEOUT = 25000

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const systemName = searchParams.get("systemName") || ""

  // Create abort controller for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), BACKEND_TIMEOUT)

  try {
    const response = await fetch(`${BACKEND_URL}/api/auto-tag/status?systemName=${encodeURIComponent(systemName)}`, {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error")
      console.error(`[auto-tag-status] Backend returned ${response.status}: ${errorText}`)
      return NextResponse.json(
        {
          success: false,
          error: `Backend error: ${response.status}`,
          detail: errorText,
        },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json({ success: true, ...data })

  } catch (error: any) {
    clearTimeout(timeoutId)

    if (error.name === 'AbortError') {
      return NextResponse.json(
        { success: false, error: "Request timed out", detail: "Backend did not respond within 25 seconds" },
        { status: 504 }
      )
    }

    console.error("[auto-tag-status] Error:", error.message)
    return NextResponse.json(
      { success: false, error: "Backend unavailable", detail: error.message },
      { status: 503 }
    )
  }
}
