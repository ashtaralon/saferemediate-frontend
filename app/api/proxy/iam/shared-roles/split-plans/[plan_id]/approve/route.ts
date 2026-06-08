import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ plan_id: string }> }
) {
  const { plan_id } = await ctx.params
  const backendUrl = `${BACKEND_URL}/api/iam/shared-roles/split-plans/${encodeURIComponent(plan_id)}/approve`

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    const res = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    const text = await res.text()
    if (!res.ok) {
      // Pass through backend's 4xx (409 wrong_state / expired /
      // plan_tampered / 404 not found) — these are honest, actionable
      // errors the UI should surface verbatim.
      return new NextResponse(text, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      })
    }
    return new NextResponse(text, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === "AbortError") {
      return NextResponse.json({ error: "Backend timeout" }, { status: 504 })
    }
    return NextResponse.json(
      { error: "Backend unavailable", detail: error.message },
      { status: 503 }
    )
  }
}
