import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

// GET /api/proxy/iam/shared-roles/split-plans/{plan_id}/gate-readiness?mode=...&group_id=...
//
// Feeds the GateReadinessPanel in the detail view (PG-8). Returns
// the per-gate status WITHOUT mutating anything — operator sees what
// would pass/fail BEFORE clicking execute.
//
// Thin pass-through, no caching (env vars can flip between renders).
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ plan_id: string }> },
) {
  const { plan_id } = await ctx.params
  const url = new URL(req.url)
  const mode = url.searchParams.get("mode") ?? "CREATE_ONLY"
  const groupId = url.searchParams.get("group_id") ?? ""

  const params = new URLSearchParams({ mode })
  if (groupId) params.set("group_id", groupId)

  const backendUrl = `${BACKEND_URL}/api/iam/shared-roles/split-plans/${encodeURIComponent(plan_id)}/gate-readiness?${params.toString()}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    const res = await fetch(backendUrl, {
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
        { error: "Backend timeout (30s) reading gate readiness" },
        { status: 504 },
      )
    }
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 },
    )
  }
}
