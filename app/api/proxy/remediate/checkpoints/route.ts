import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.BACKEND_API_URL ||
  "https://saferemediate-backend-f.onrender.com"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const resourceType = searchParams.get("resource_type") || undefined
    const limit = searchParams.get("limit") || "50"

    const url = new URL(`${BACKEND_URL}/api/remediate/checkpoints`)
    if (resourceType) url.searchParams.set("resource_type", resourceType)
    url.searchParams.set("limit", limit)

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Backend returned ${response.status}`,
        },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[Checkpoints Proxy] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal server error",
      },
      { status: 500 }
    )
  }
}
