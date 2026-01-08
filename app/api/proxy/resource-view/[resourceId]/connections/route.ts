import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://saferemediate-backend-f.onrender.com"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> }
) {
  try {
    const { resourceId } = await params
    const encodedResourceId = encodeURIComponent(resourceId)

    console.log(`[ResourceView Proxy] Fetching connections for: ${resourceId}`)

    const response = await fetch(
      `${BACKEND_URL}/api/resource-view/${encodedResourceId}/connections`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(25000), // 25 second timeout
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error(
        `[ResourceView Proxy] Backend error: ${response.status}`,
        errorText
      )
      return NextResponse.json(
        {
          success: false,
          error: `Backend returned ${response.status}`,
          detail: errorText,
          connections: { inbound: [], outbound: [] },
        },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log(
      `[ResourceView Proxy] Success: ${data.inbound_count || 0} inbound, ${data.outbound_count || 0} outbound`
    )

    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[ResourceView Proxy] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch resource connections",
        timeout: error.name === "AbortError",
        connections: { inbound: [], outbound: [] },
      },
      { status: 500 }
    )
  }
}

