import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://saferemediate-backend-f.onrender.com"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 120 // 2 minutes for complete sync

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const days = url.searchParams.get("days") || "7"

    console.log(`[Collectors Proxy] Starting sync-all (${days} days)...`)

    const response = await fetch(`${BACKEND_URL}/api/collectors/sync-all?days=${days}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(120000), // 2 minute timeout
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Collectors Proxy] Backend error: ${response.status}`, errorText)
      return NextResponse.json(
        {
          success: false,
          error: `Backend returned ${response.status}`,
          detail: errorText,
        },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log("[Collectors Proxy] Sync complete:", data)

    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[Collectors Proxy] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to sync from AWS",
        timeout: error.name === "AbortError",
      },
      { status: 500 }
    )
  }
}

