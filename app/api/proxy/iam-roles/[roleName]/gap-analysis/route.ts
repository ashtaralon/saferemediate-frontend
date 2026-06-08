import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roleName: string }> }
) {
  const { roleName } = await params
  const url = new URL(req.url)
  const days = url.searchParams.get("days") ?? "90"
  const envelope = url.searchParams.get("envelope") === "true"

  console.log(`[IAM Proxy] Fetching ${roleName} from backend...`)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 55000) // 55s timeout

  try {
    const backendUrl = `${BACKEND_URL}/api/iam-roles/${encodeURIComponent(roleName)}/gap-analysis?days=${days}${envelope ? "&envelope=true" : ""}`
    console.log(`[IAM Proxy] Calling: ${backendUrl}`)

    const res = await fetch(backendUrl, {
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[IAM Proxy] Backend error ${res.status}: ${errorText}`)
      // Return 200 with empty data instead of error to prevent UI crashes
      return NextResponse.json({
        role_name: roleName,
        allowed_count: 0,
        used_count: 0,
        unused_count: 0,
        summary: { allowed_count: 0, used_count: 0, unused_count: 0, lp_score: 0 },
        error: `Backend returned ${res.status}`,
        detail: errorText.substring(0, 200)
      }, { status: 200 })
    }

    const data = await res.json()
    console.log(`[IAM Proxy] Success: LP score ${data.summary?.lp_score}, used=${data.summary?.used_count}, unused=${data.summary?.unused_count}`)

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error: any) {
    clearTimeout(timeoutId)

    console.error(`[IAM Proxy] Error for ${roleName}:`, error.message)

    if (error.name === "AbortError") {
      // Return empty data instead of error - UI will show 0s gracefully
      return NextResponse.json({
        role_name: roleName,
        allowed_count: 0,
        used_count: 0,
        unused_count: 0,
        summary: { allowed_count: 0, used_count: 0, unused_count: 0, lp_score: 0 },
        timeout: true,
        message: "Analysis is taking longer than expected - data will refresh shortly"
      }, { status: 200 })
    }

    return NextResponse.json(
      { error: "Backend unavailable", detail: error.message },
      { status: 503 }
    )
  }
}
