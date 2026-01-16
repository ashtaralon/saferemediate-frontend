import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const searchParams = url.searchParams.toString()

  const backendUrl = `${BACKEND_URL}/api/security-hub/findings${searchParams ? `?${searchParams}` : ''}`
  console.log(`[Security Hub Proxy] Fetching: ${backendUrl}`)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 55000)

    const res = await fetch(backendUrl, {
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[Security Hub Proxy] Backend error ${res.status}: ${errorText}`)
      return NextResponse.json(
        { error: `Backend returned ${res.status}`, detail: errorText.substring(0, 200) },
        { status: res.status }
      )
    }

    const data = await res.json()
    console.log(`[Security Hub Proxy] Success: ${data.total_count || 0} findings`)

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    })
  } catch (error: any) {
    console.error(`[Security Hub Proxy] Error:`, error.message)

    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Request timeout", findings: [], summary: {} },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: "Backend unavailable", detail: error.message },
      { status: 503 }
    )
  }
}
