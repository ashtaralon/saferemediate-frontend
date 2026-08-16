import { requireBackendUrl } from "@/lib/backend-url";
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const BACKEND_URL =
  requireBackendUrl()

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/remediate/supported-types`, {
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
    console.error("[Supported Types Proxy] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal server error",
      },
      { status: 500 }
    )
  }
}
