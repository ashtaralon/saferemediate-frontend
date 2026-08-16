import { requireBackendUrl } from "@/lib/backend-url";
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

// Abort fires at 120s, 5s under this, so the catch
// block still runs and can degrade honestly instead of the platform
// returning a raw 504. Above the 60s project default in vercel.json,
// which this export overrides.
export const maxDuration = 125

const BACKEND_URL = requireBackendUrl()

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ plan_id: string }> }
) {
  const { plan_id } = await ctx.params
  const body = await req.json().catch(() => null)
  if (body === null) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })

  const backendUrl = `${BACKEND_URL}/api/sg/shared-sgs/split-plans/${encodeURIComponent(plan_id)}/rollback`

  const controller = new AbortController()
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
