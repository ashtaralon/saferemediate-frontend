import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName")

  try {
    const backendUrl = systemName
      ? `${BACKEND_URL}/api/issues/summary?systemName=${encodeURIComponent(systemName)}`
      : `${BACKEND_URL}/api/issues/summary`

    const res = await fetch(backendUrl, {
      headers: {
        "Content-Type": "application/json",
      },
      // Increased timeout for aggregation
      signal: AbortSignal.timeout(30000), // 30 seconds
    })

    if (!res.ok) {
      console.error(`[proxy] Issues summary error: ${res.status} ${res.statusText}`)
      return NextResponse.json(
        {
          error: "Backend error",
          status: res.status,
          total: 0,
          by_severity: { critical: 0, high: 0, medium: 0, low: 0 },
          by_source: { least_privilege: 0, gap_analysis: 0, findings: 0 },
          issues: [],
          cached: false,
        },
        { status: res.status }
      )
    }

    const data = await res.json()
    console.log(`[proxy] Issues summary fetched - total: ${data.total}, cached: ${data.cached}`)
    return NextResponse.json(data)
  } catch (error) {
    console.error("[proxy] Issues summary fetch error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        total: 0,
        by_severity: { critical: 0, high: 0, medium: 0, low: 0 },
        by_source: { least_privilege: 0, gap_analysis: 0, findings: 0 },
        issues: [],
        cached: false,
      },
      { status: 500 }
    )
  }
}
