import { NextRequest, NextResponse } from "next/server"

export const runtime = 'nodejs'
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0
export const maxDuration = 30 // Maximum execution time in seconds (Vercel Pro tier)

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
      // Increased timeout for aggregation (safe under Vercel 30s limit)
      signal: AbortSignal.timeout(28000), // 28 seconds
    })

    if (!res.ok) {
      console.error(`[proxy] Issues summary error: ${res.status} ${res.statusText}`)
      // Return 200 with fallback data to prevent client crash
      return NextResponse.json({
        error: "Backend error",
        backendStatus: res.status,
        total: 0,
        by_severity: { critical: 0, high: 0, medium: 0, low: 0 },
        by_source: { least_privilege: 0, gap_analysis: 0, findings: 0 },
        issues: [],
        cached: false,
        fallback: true,
      })
    }

    const data = await res.json()
    console.log(`[proxy] Issues summary fetched - total: ${data.total}, cached: ${data.cached}`)
    return NextResponse.json(data)
  } catch (error) {
    console.error("[proxy] Issues summary fetch error:", error)
    // Return 200 with fallback data to prevent client crash
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unknown error",
      total: 0,
      by_severity: { critical: 0, high: 0, medium: 0, low: 0 },
      by_source: { least_privilege: 0, gap_analysis: 0, findings: 0 },
      issues: [],
      cached: false,
      fallback: true,
    })
  }
}



