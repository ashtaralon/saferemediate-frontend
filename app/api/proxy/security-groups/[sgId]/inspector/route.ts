import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || "https://saferemediate-backend-f.onrender.com"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sgId: string }> }
) {
  const { sgId } = await params
  const { searchParams } = new URL(request.url)

  // Get query parameters
  const window = searchParams.get("window") || "30d"

  const backendUrl = `${BACKEND_URL}/api/security-groups/${encodeURIComponent(sgId)}/inspector?window=${window}`

  console.log(`[SG Inspector v2 Proxy] Fetching: ${backendUrl}`)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 second timeout

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[SG Inspector v2 Proxy] Backend error ${response.status}: ${errorText}`)
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
    console.log(`[SG Inspector v2 Proxy] Success for ${sgId}`)
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error(`[SG Inspector v2 Proxy] Request timed out for ${sgId}`)
      return NextResponse.json(
        {
          success: false,
          error: "Request timed out",
        },
        { status: 504 }
      )
    }

    console.error(`[SG Inspector v2 Proxy] Error for ${sgId}:`, error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch inspector data",
      },
      { status: 500 }
    )
  }
}
