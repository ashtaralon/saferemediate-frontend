import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

const ALLOWED_PARAMS = ["min_consumers", "include_inactive"] as const

export async function GET(req: NextRequest) {
  const inUrl = new URL(req.url)
  const qs = new URLSearchParams()
  for (const k of ALLOWED_PARAMS) {
    const v = inUrl.searchParams.get(k)
    if (v !== null) qs.set(k, v)
  }

  const backendUrl = `${BACKEND_URL}/api/sg/shared-sgs${qs.toString() ? `?${qs}` : ""}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    const res = await fetch(backendUrl, { cache: "no-store", signal: controller.signal })
    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[proxy] sg/shared-sgs backend ${res.status}: ${errorText}`)
      return NextResponse.json(
        { error: `Backend error: ${res.status}`, detail: errorText },
        { status: res.status }
      )
    }
    return NextResponse.json(await res.json())
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === "AbortError") {
      return NextResponse.json(
        {
          shared_sgs: [],
          evidence_completeness: "degraded",
          sg0_pending_items: [],
          discovered_at: new Date().toISOString(),
          timeout: true,
        },
        { status: 200 }
      )
    }
    return NextResponse.json(
      { error: "Backend unavailable", detail: error.message },
      { status: 503 }
    )
  }
}
