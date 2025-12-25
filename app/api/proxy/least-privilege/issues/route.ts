import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName") ?? "alon-prod"
  const observationDays = url.searchParams.get("observationDays") ?? "365"

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    // Build backend URL with parameters - use the new /api/least-privilege/issues endpoint
    let backendUrl = `${BACKEND_URL}/api/least-privilege/issues?observationDays=${observationDays}`
    if (systemName) {
      backendUrl += `&systemName=${encodeURIComponent(systemName)}`
    }

    const res = await fetch(backendUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
      },
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[proxy] least-privilege/issues backend returned ${res.status}: ${errorText}`)
      
      // Return empty structure instead of error to avoid breaking UI
      return NextResponse.json({
        summary: {
          totalResources: 0,
          totalExcessPermissions: 0,
          avgLPScore: 100,
          iamIssuesCount: 0,
          networkIssuesCount: 0,
          s3IssuesCount: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          confidenceLevel: 0,
          observationDays: parseInt(observationDays),
          attackSurfaceReduction: 0
        },
        resources: [],
        timestamp: new Date().toISOString()
      }, { status: 200 }) // Return 200 to prevent UI errors
    }

    const data = await res.json()
    console.log(`[LP Proxy Issues] Fetched ${data.resources?.length || 0} resources`)
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[LP Proxy Issues] Error:", error.message)

    if (error.name === "AbortError") {
      // Return empty structure on timeout
      return NextResponse.json({
        summary: {
          totalResources: 0,
          totalExcessPermissions: 0,
          avgLPScore: 100,
          iamIssuesCount: 0,
          networkIssuesCount: 0,
          s3IssuesCount: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          confidenceLevel: 0,
          observationDays: parseInt(observationDays),
          attackSurfaceReduction: 0
        },
        resources: [],
        timestamp: new Date().toISOString()
      }, { status: 200 }) // Return 200 to prevent UI errors
    }

    // Return empty structure on any error
    return NextResponse.json({
      summary: {
        totalResources: 0,
        totalExcessPermissions: 0,
        avgLPScore: 100,
        iamIssuesCount: 0,
        networkIssuesCount: 0,
        s3IssuesCount: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        confidenceLevel: 0,
        observationDays: parseInt(observationDays),
        attackSurfaceReduction: 0
      },
      resources: [],
      timestamp: new Date().toISOString()
    }, { status: 200 }) // Return 200 to prevent UI errors
  }
}
