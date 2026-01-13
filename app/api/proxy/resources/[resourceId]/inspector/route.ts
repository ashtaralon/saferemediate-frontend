import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_API_URL || "https://saferemediate-backend-f.onrender.com"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> }
) {
  const { resourceId } = await params
  const { searchParams } = new URL(request.url)

  // Get query parameters
  const type = searchParams.get("type") || "security_group"
  const window = searchParams.get("window") || "30d"

  const backendUrl = `${BACKEND_URL}/api/resources/${encodeURIComponent(resourceId)}/inspector?type=${type}&window=${window}`

  console.log(`[Inspector Proxy] Fetching: ${backendUrl}`)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 90000) // 90 second timeout

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
      console.error(`[Inspector Proxy] Backend error ${response.status}: ${errorText}`)
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
    console.log(`[Inspector Proxy] Success for ${resourceId}`)
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error(`[Inspector Proxy] Request timed out for ${resourceId}`)
      return NextResponse.json(
        {
          success: false,
          error: "Request timed out",
        },
        { status: 504 }
      )
    }

    console.error(`[Inspector Proxy] Error for ${resourceId}:`, error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch inspector data",
      },
      { status: 500 }
    )
  }
}
