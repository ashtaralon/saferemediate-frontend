import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

// POST /api/proxy/iam/shared-roles/split-plans/{plan_id}/execute
//
// Forwards body: { mode, group_id?, force, requested_by } to backend
// POST /api/iam/shared-roles/split-plans/{plan_id}/execute.
//
// No caching — every execute is a mutation. 60s timeout because
// CREATE_ONLY can create N IAM roles per call (boto3 round trips).
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ plan_id: string }> },
) {
  const { plan_id } = await ctx.params
  const backendUrl = `${BACKEND_URL}/api/iam/shared-roles/split-plans/${encodeURIComponent(plan_id)}/execute`

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: "request body must be JSON" },
      { status: 400 },
    )
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 60000)

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
  } catch (e: any) {
    clearTimeout(timeoutId)
    if (e?.name === "AbortError") {
      return NextResponse.json(
        { error: "Backend timeout (60s) on /execute" },
        { status: 504 },
      )
    }
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 },
    )
  }
}
