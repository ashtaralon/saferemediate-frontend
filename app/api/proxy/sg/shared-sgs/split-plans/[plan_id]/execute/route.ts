import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

// Abort fires at 120s, 5s under this, so the catch
// block still runs and can degrade honestly instead of the platform
// returning a raw 504. Above the 60s project default in vercel.json,
// which this export overrides.
export const maxDuration = 125

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ plan_id: string }> }
) {
  const { plan_id } = await ctx.params
  const body = await req.json().catch(() => null)
  if (body === null) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })

  const backendUrl = `${BACKEND_URL}/api/sg/shared-sgs/split-plans/${encodeURIComponent(plan_id)}/execute`

  const controller = new AbortController()
  // execute can be slow — pipeline does snapshot + canary + apply per group.
  // Match IAM's 120s timeout for shared-roles execute.
  const timeoutId = setTimeout(() => controller.abort(), 120000)
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
