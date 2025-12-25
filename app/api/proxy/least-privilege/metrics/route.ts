import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    const res = await fetch(`${BACKEND_URL}/api/least-privilege/metrics`, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
      },
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[LP Proxy Metrics] Backend returned ${res.status}: ${errorText}`)
      // Return default metrics on error
      return NextResponse.json(
        {
          totalRoles: 0,
          analyzedRoles: 0,
          rolesWithBloat: 0,
          averageBloatPercentage: 0,
          totalUnusedPermissions: 0,
          totalRecommendedReductions: 0,
          lastAnalysisDate: null,
        },
        { status: res.status }
      )
    }

    const data = await res.json()
    console.log(`[LP Proxy Metrics] Fetched metrics:`, data)
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[LP Proxy Metrics] Error:", error.message)

    if (error.name === "AbortError") {
      return NextResponse.json(
        {
          totalRoles: 0,
          analyzedRoles: 0,
          rolesWithBloat: 0,
          averageBloatPercentage: 0,
          totalUnusedPermissions: 0,
          totalRecommendedReductions: 0,
          lastAnalysisDate: null,
        },
        { status: 504 }
      )
    }

    return NextResponse.json(
      {
        totalRoles: 0,
        analyzedRoles: 0,
        rolesWithBloat: 0,
        averageBloatPercentage: 0,
        totalUnusedPermissions: 0,
        totalRecommendedReductions: 0,
        lastAnalysisDate: null,
      },
      { status: 503 }
    )
  }
}

