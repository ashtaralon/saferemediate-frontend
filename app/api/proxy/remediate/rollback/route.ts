import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.BACKEND_API_URL ||
  "https://saferemediate-backend-f.onrender.com"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const response = await fetch(`${BACKEND_URL}/api/remediate/rollback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000), // 60 second timeout
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Rollback Proxy] Backend error: ${response.status}`, errorText)

      let errorData: any = { detail: `Backend returned ${response.status}` }
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { detail: errorText || `Backend returned ${response.status}` }
      }

      return NextResponse.json(
        {
          success: false,
          error: errorData.detail || errorData.message || `Rollback failed: ${response.status}`,
        },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[Rollback Proxy] Error:", error)

    if (error.name === "AbortError") {
      return NextResponse.json(
        {
          success: false,
          error: "Request timeout. Rollback is taking longer than expected.",
        },
        { status: 504 }
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal server error",
      },
      { status: 500 }
    )
  }
}
