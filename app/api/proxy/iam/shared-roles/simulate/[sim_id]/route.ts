// Layer D Phase 3 (2026-05-27) — proxy for the simulate polling read.
//
// GET /api/proxy/iam/shared-roles/simulate/{sim_id}
//   → backend GET /api/iam/shared-roles/simulate/{sim_id}
// Returns status + progress + per-jewel results + aggregate. The
// frontend polls this every ~1.5s until status flips to COMPLETED
// or FAILED (terminal states).
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ sim_id: string }> }
) {
  const { sim_id } = await ctx.params
  const backendUrl = `${BACKEND_URL}/api/iam/shared-roles/simulate/${encodeURIComponent(sim_id)}`

  const controller = new AbortController()
  // Polling reads are fast (single Cypher) — 10s is plenty.
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    const res = await fetch(backendUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
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
