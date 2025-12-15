import { NextRequest, NextResponse } from "next/server"

export const runtime = 'nodejs'
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0
export const maxDuration = 30

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const statusType = url.searchParams.get("type") || "traffic" // default to traffic status

    let backendEndpoint = ""
    switch (statusType) {
      case "traffic":
        backendEndpoint = "/api/traffic/status"
        break
      case "scan":
        backendEndpoint = "/api/scan/status"
        break
      default:
        backendEndpoint = "/api/traffic/status"
    }

    const res = await fetch(`${BACKEND_URL}${backendEndpoint}`, {
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(28000), // 28 seconds
    })

    if (!res.ok) {
      console.error(`[proxy] Status endpoint error: ${res.status} ${res.statusText}`)
      return NextResponse.json(
        {
          error: "Backend error",
          backendStatus: res.status,
          status: "unknown",
          success: false,
        },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[proxy] Status fetch error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        status: "unknown",
        success: false,
      },
      { status: 500 }
    )
  }
}
