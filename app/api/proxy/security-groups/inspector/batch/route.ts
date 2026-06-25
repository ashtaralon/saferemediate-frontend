import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com"

export async function POST(req: NextRequest) {
  const controller = new AbortController()
  // 2026-06-25: bumped 30s → 50s. Same reasoning as the sister IAM
  // gap-analysis batch proxy — first-batch cold-Render requests
  // measure 40s on /health probe; 30s guarantees AbortError before
  // the backend even finishes warming. 50s stays under Vercel's 60s
  // ceiling. When backend is truly cold (~104s), the chip still
  // fires honestly per pattern_honest_chip_over_silent_seed.
  const timeoutId = setTimeout(() => controller.abort(), 50_000)

  try {
    const body = await req.text()
    const backendUrl = `${BACKEND_URL}/api/security-groups/inspector/batch`
    console.log("[SG Bulk Proxy] POST inspector/batch")

    const res = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[SG Bulk Proxy] Backend error ${res.status}: ${errorText}`)
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
    console.error("[SG Bulk Proxy] Error:", message)
    return NextResponse.json(
      { results: {}, errors: {}, error: message },
      { status: error instanceof Error && error.name === "AbortError" ? 504 : 503 }
    )
  }
}
