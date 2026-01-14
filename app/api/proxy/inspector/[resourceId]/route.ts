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
  const window = searchParams.get("window") || "30d"
  const systemName = searchParams.get("system_name") || ""

  const backendUrl = `${BACKEND_URL}/api/inspector/${encodeURIComponent(resourceId)}?window=${window}${systemName ? `&system_name=${systemName}` : ''}`

  console.log(`[Resource Inspector Proxy] Fetching: ${backendUrl}`)

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
      console.error(`[Resource Inspector Proxy] Backend error ${response.status}: ${errorText}`)

      // Try to parse the error detail from backend JSON response
      let errorMessage = `Backend returned ${response.status}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.detail) {
          errorMessage = errorJson.detail
        }
      } catch {
        // If not JSON, use the raw text
        if (errorText) {
          errorMessage = errorText
        }
      }

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
          detail: errorText,
        },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log(`[Resource Inspector Proxy] Success for ${resourceId} (type: ${data.resource_type})`)
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error(`[Resource Inspector Proxy] Request timed out for ${resourceId}`)
      return NextResponse.json(
        {
          success: false,
          error: "Request timed out",
        },
        { status: 504 }
      )
    }

    console.error(`[Resource Inspector Proxy] Error for ${resourceId}:`, error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch inspector data",
      },
      { status: 500 }
    )
  }
}
