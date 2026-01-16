import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://saferemediate-backend-f.onrender.com"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params

    const response = await fetch(`${BACKEND_URL}/api/collectors/sync-all/status/${jobId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout for status check
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Collectors Proxy] Status check error: ${response.status}`, errorText)
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
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[Collectors Proxy] Status check error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to get sync status",
      },
      { status: 500 }
    )
  }
}
