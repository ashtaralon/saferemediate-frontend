import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

// GET /api/proxy/iam/shared-roles/split-plans/{plan_id}/history
//
// Feeds the execution-history surface in iam-shared-roles-detail-view.tsx
// (PG-7). Returns { plan_id, plan_state, executions: [...], rollbacks: [...] }
// with both arrays newest-first. Empty arrays when nothing has happened.
//
// Thin pass-through — no caching beyond Next.js's default fetch behavior.
// History is small (typically <10 entries per plan) and operators expect
// fresh state immediately after /execute or /rollback completes.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ plan_id: string }> },
) {
  const { plan_id } = await ctx.params
  const backendUrl = `${BACKEND_URL}/api/iam/shared-roles/split-plans/${encodeURIComponent(plan_id)}/history`

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
        { error: "Backend timeout (30s) reading plan history" },
        { status: 504 },
      )
    }
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 },
    )
  }
}
