import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ plan_id: string }> }
) {
  const { plan_id } = await ctx.params
  const backendUrl = `${BACKEND_URL}/api/sg/shared-sgs/split-plans/${encodeURIComponent(plan_id)}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(backendUrl, { cache: "no-store", signal: controller.signal })
    clearTimeout(timeoutId)
    const text = await res.text()
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === "AbortError")
      return NextResponse.json({ error: "Backend timeout" }, { status: 504 })
    return NextResponse.json({ error: "Backend unavailable", detail: error.message }, { status: 503 })
  }
}
