import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const maxDuration = 300 // 5 minutes for CloudTrail ingestion

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const days = url.searchParams.get("days") || "7"

    const backendUrl = `${BACKEND_URL}/api/collectors/cloudtrail/ingest?days=${days}`

    console.log(`[proxy] cloudtrail/ingest -> ${backendUrl}`)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 290000) // 290 second timeout

    const res = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[proxy] cloudtrail/ingest backend returned ${res.status}: ${errorText}`)

      let errorData: any = { detail: `Backend returned ${res.status}` }
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { detail: errorText || `Backend returned ${res.status}` }
      }

      return NextResponse.json(
        { error: errorData.detail || errorData.message || `CloudTrail ingest failed: ${res.status}` },
        { status: res.status }
      )
    }

    const data = await res.json()

    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  } catch (error: any) {
    console.error("[proxy] cloudtrail/ingest error:", error)

    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Request timeout. CloudTrail ingestion is taking longer than expected." },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
