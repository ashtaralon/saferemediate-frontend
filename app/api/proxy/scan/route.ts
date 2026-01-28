import { NextRequest, NextResponse } from "next/server"

export const runtime = 'nodejs'
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0
export const maxDuration = 60

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 55000) // 55 second timeout

    const res = await fetch(`${BACKEND_URL}/api/scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[proxy] /api/scan backend returned ${res.status}: ${errorText}`)

      let errorData: any = { detail: `Backend returned ${res.status}` }
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { detail: errorText || `Backend returned ${res.status}` }
      }

      return NextResponse.json(
        { success: false, error: errorData.detail || errorData.message || `Scan failed: ${res.status}` },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json({ success: true, ...data })
  } catch (error: any) {
    console.error("[proxy] /api/scan error:", error)

    if (error.name === "AbortError") {
      return NextResponse.json(
        { success: false, error: "Request timeout. The backend may be starting up - please try again." },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { success: false, error: error.message || "Failed to connect to backend" },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 28000)

    const res = await fetch(`${BACKEND_URL}/api/scan/status?_t=${Date.now()}`, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      console.error(`[proxy] /api/scan/status backend returned ${res.status}`)
      return NextResponse.json(
        { status: "unknown", error: `Backend returned ${res.status}` },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[proxy] /api/scan/status error:", error)
    return NextResponse.json(
      { status: "unknown", error: error.message || "Failed to get scan status" },
      { status: 500 }
    )
  }
}
