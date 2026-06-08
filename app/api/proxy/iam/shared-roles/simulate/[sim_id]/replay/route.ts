// Shared Roles PR-A (2026-05-31) — proxy for the replay-verify POST.
//
// POST /api/proxy/iam/shared-roles/simulate/{sim_id}/replay
//   → backend POST /api/iam/shared-roles/simulate/{sim_id}/replay
//
// Verifies that a stored (:SimulationRun) reproduces byte-equivalent
// against today's engine + graph snapshot. Returns the verdict +
// per-jewel drift detail; the backend atomically updates
// (:SimulationRun).{replay_count, last_replayed_at, last_verdict,
// last_replay_id} as part of the request (PR-A.0).
//
// Transparent passthrough — body is forwarded as-is so the frontend
// can pass a descriptive `triggered_by` label (operator identity in
// v1 is self-attested; not used as a security trust boundary).
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ sim_id: string }> }
) {
  const { sim_id } = await ctx.params
  const backendUrl = `${BACKEND_URL}/api/iam/shared-roles/simulate/${encodeURIComponent(sim_id)}/replay`

  // Forward the request body verbatim — typically a small JSON object
  // like {"triggered_by": "operator-ui:..."} but we don't shape-check
  // here; backend validates via Pydantic.
  const body = await req.text()

  const controller = new AbortController()
  // Replay re-runs ATLAS in-process for each jewel pair. A 2-jewel
  // canonical run completed in ~600ms locally; budgeting 15s for
  // larger sims while staying under Vercel's default fn timeout.
  const timeoutId = setTimeout(() => controller.abort(), 15000)

  try {
    const res = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body || JSON.stringify({ triggered_by: "operator-ui" }),
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    const text = await res.text()
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
