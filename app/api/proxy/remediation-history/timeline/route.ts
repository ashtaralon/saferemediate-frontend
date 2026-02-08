import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get("start_date")
    const endDate = searchParams.get("end_date")
    const limit = searchParams.get("limit") || "200"

    const queryParams = new URLSearchParams()
    if (startDate) queryParams.set("start_date", startDate)
    if (endDate) queryParams.set("end_date", endDate)
    queryParams.set("limit", limit)

    const url = `${BACKEND_URL}/api/remediation-history/timeline?${queryParams.toString()}`
    console.log("[Remediation Timeline Proxy] Fetching:", url)

    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })

    if (!response.ok) {
      // If backend returns 404, return empty timeline data
      if (response.status === 404) {
        console.log("[Remediation Timeline Proxy] Endpoint not found, returning empty data")
        return NextResponse.json({
          events: [],
          chart_data: [],
          summary: {
            total_events: 0,
            permissions_removed: 0,
            rollbacks: 0,
            avg_confidence: 0
          }
        })
      }
      const errorText = await response.text()
      console.error("[Remediation Timeline Proxy] Error:", response.status, errorText)
      return NextResponse.json({ error: errorText }, { status: response.status })
    }

    const data = await response.json()
    console.log("[Remediation Timeline Proxy] Success:", data.events?.length || 0, "events")
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[Remediation Timeline Proxy] Error:", error.message)
    // Return empty data on error to prevent UI breaking
    return NextResponse.json({
      events: [],
      chart_data: [],
      summary: {
        total_events: 0,
        permissions_removed: 0,
        rollbacks: 0,
        avg_confidence: 0
      }
    })
  }
}
