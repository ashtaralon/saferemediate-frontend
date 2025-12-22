import { NextRequest, NextResponse } from "next/server"

export const runtime = 'nodejs'
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0
export const maxDuration = 30 // Maximum execution time in seconds (Vercel Pro tier)

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

// Timeout for backend requests (28 seconds, safe under Vercel 30s limit)
const BACKEND_TIMEOUT = 28000

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName")

  // Create abort controller for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), BACKEND_TIMEOUT)

  try {
    const backendUrl = systemName
      ? `${BACKEND_URL}/api/issues/summary?systemName=${encodeURIComponent(systemName)}`
      : `${BACKEND_URL}/api/issues/summary`

    const res = await fetch(backendUrl, {
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error")
      console.error(`[issues-summary] Backend returned ${res.status}: ${errorText}`)
      return NextResponse.json(
        {
          success: false,
          error: `Backend error: ${res.status}`,
          detail: errorText,
        },
        { status: res.status }
      )
    }

    const data = await res.json()
    console.log(`[issues-summary] Fetched - total: ${data.total}, cached: ${data.cached}`)
    return NextResponse.json({ success: true, ...data })

  } catch (error: any) {
    clearTimeout(timeoutId)

    if (error.name === 'AbortError') {
      console.error("[issues-summary] Request timed out")
      return NextResponse.json(
        { success: false, error: "Request timed out", detail: "Backend did not respond within 28 seconds" },
        { status: 504 }
      )
    }

    console.error("[issues-summary] Error:", error.message)
    return NextResponse.json(
      { success: false, error: "Backend unavailable", detail: error.message },
      { status: 503 }
    )
  }
}
