import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName") ?? "alon-prod"
  const days = url.searchParams.get("days") ?? "7"

  console.log(`[API Calls Proxy] Fetching API calls for ${systemName}, ${days} days`)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    // Try the backend CloudTrail API calls endpoint
    const backendUrl = `${BACKEND_URL}/api/cloudtrail/api-calls?system_name=${encodeURIComponent(systemName)}&days=${days}`

    const res = await fetch(backendUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })

    clearTimeout(timeoutId)

    if (res.ok) {
      const data = await res.json()
      console.log(`[API Calls Proxy] Success: ${data.summaries?.length || 0} service pairs, ${data.totalEvents || 0} total events`)
      return NextResponse.json(data)
    }

    // If backend doesn't have the endpoint, return empty API calls
    console.log(`[API Calls Proxy] Backend returned ${res.status}, returning empty API calls`)
    return NextResponse.json({
      summaries: [],
      totalEvents: 0,
      message: "CloudTrail API call data not available from backend"
    })

  } catch (error: any) {
    console.error(`[API Calls Proxy] Error:`, error.message)

    // Return empty API calls on error (non-critical data)
    return NextResponse.json({
      summaries: [],
      totalEvents: 0,
      error: error.message
    })
  }
}
