import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com"

export async function POST(req: NextRequest) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30_000)

  try {
    const body = await req.text()
    const backendUrl = `${BACKEND_URL}/api/iam-roles/gap-analysis/batch`
    console.log("[IAM Bulk Proxy] POST gap-analysis/batch")

    const res = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[IAM Bulk Proxy] Backend error ${res.status}: ${errorText}`)
      return NextResponse.json(
        { results: {}, errors: {}, detail: errorText.substring(0, 500) },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    const message = error instanceof Error ? error.message : "Backend unavailable"
    console.error("[IAM Bulk Proxy] Error:", message)
    return NextResponse.json(
      { results: {}, errors: {}, error: message },
      { status: error instanceof Error && error.name === "AbortError" ? 504 : 503 }
    )
  }
}
