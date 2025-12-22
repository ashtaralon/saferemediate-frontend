import { type NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://saferemediate-backend-f.onrender.com"

// Timeout for backend requests (25 seconds, safe under Vercel 30s limit)
const BACKEND_TIMEOUT = 25000

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { finding_id, resource_id, resource_type } = body

    if (!finding_id) {
      return NextResponse.json(
        { success: false, error: "finding_id is required" },
        { status: 400 }
      )
    }

    // Create abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), BACKEND_TIMEOUT)

    try {
      const response = await fetch(`${BACKEND_URL}/api/simulate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ finding_id, resource_id, resource_type }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error")
        console.error(`[simulate] Backend returned ${response.status}: ${errorText}`)
        return NextResponse.json(
          {
            success: false,
            error: `Backend error: ${response.status}`,
            detail: errorText
          },
          { status: response.status }
        )
      }

      const data = await response.json()

      // Return backend response directly - no mock fallback
      return NextResponse.json(data, {
        headers: {
          "X-Proxy": "simulate",
          "X-Proxy-Timestamp": new Date().toISOString(),
        }
      })

    } catch (fetchError: any) {
      clearTimeout(timeoutId)

      if (fetchError.name === 'AbortError') {
        return NextResponse.json(
          { success: false, error: "Request timed out", detail: "Backend did not respond within 25 seconds" },
          { status: 504 }
        )
      }

      console.error("[simulate] Backend connection failed:", fetchError.message)
      return NextResponse.json(
        { success: false, error: "Backend unavailable", detail: fetchError.message },
        { status: 503 }
      )
    }

  } catch (error: any) {
    console.error("Simulation error:", error)
    return NextResponse.json(
      { success: false, error: "Simulation failed", detail: error.message },
      { status: 500 }
    )
  }
}
