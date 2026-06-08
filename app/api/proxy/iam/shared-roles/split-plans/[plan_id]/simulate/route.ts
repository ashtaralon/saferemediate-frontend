// Layer D Phase 3 (2026-05-27) — proxy for the simulate kickoff.
//
// POST /api/proxy/iam/shared-roles/split-plans/{plan_id}/simulate
//   → backend POST /api/iam/shared-roles/split-plans/{plan_id}/simulate
// Backend returns 202 + sim_id manifest; we pass it through verbatim
// so the client can immediately start polling /simulate/{sim_id}.
//
// Backend's 400 (no foothold / no jewels / empty counterfactual) and
// 404 (plan not found) are passed through as-is — the UI surfaces
// the message verbatim.
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
  const backendUrl = `${BACKEND_URL}/api/iam/shared-roles/split-plans/${encodeURIComponent(plan_id)}/simulate`

  let body: unknown = {}
  try {
    body = await req.json()
  } catch {
    // Empty body is OK — SimulateRequest fields are all optional.
    body = {}
  }

  const controller = new AbortController()
  // 15s timeout — kickoff is just write-the-anchor + queue-the-task;
  // any longer means the backend is in trouble.
  const timeoutId = setTimeout(() => controller.abort(), 15000)

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
    // Pass status + body through unchanged so UI sees 202/400/404
    // distinctly.
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    const errName = error instanceof Error ? error.name : ""
    const errMsg = error instanceof Error ? error.message : String(error)
    if (errName === "AbortError") {
      return NextResponse.json({ error: "Backend timeout" }, { status: 504 })
    }
    return NextResponse.json(
      { error: "Backend unavailable", detail: errMsg },
      { status: 503 }
    )
  }
}
