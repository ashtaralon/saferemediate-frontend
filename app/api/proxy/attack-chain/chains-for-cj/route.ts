import { NextRequest, NextResponse } from "next/server"

// GET proxy for /api/attack-chain/chains-for-cj?cj_id=...
//
// Returns AttackChain[] for a crown jewel — the v0.2 §3 hop-reified
// data the new Attacker View renderer iterates to draw the chain.
// Pass-through: backend serves from materialized AttackPath nodes,
// so no edge cache here (graph stays the source of truth).

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const cj_id = url.searchParams.get("cj_id")
  if (!cj_id) {
    return NextResponse.json(
      { error: "missing_cj_id", detail: "cj_id query param required" },
      { status: 400 },
    )
  }
  const include_blocked = url.searchParams.get("include_blocked") ?? "false"
  const rank_by = url.searchParams.get("rank_by") ?? "severity"

  const qs = new URLSearchParams({ cj_id, include_blocked, rank_by })
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 55_000)
    const upstreamRes = await fetch(
      `${BACKEND_URL}/api/attack-chain/chains-for-cj?${qs.toString()}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    )
    clearTimeout(timeout)
    if (!upstreamRes.ok) {
      const text = await upstreamRes.text()
      return NextResponse.json(
        { error: `backend ${upstreamRes.status}`, detail: text.slice(0, 500) },
        { status: upstreamRes.status },
      )
    }
    const data = await upstreamRes.json()
    return NextResponse.json(data)
  } catch (err: any) {
    const msg = err?.name === "AbortError" ? "upstream timeout" : String(err?.message ?? err)
    return NextResponse.json({ error: "proxy_error", detail: msg }, { status: 502 })
  }
}

// POST proxy to trigger Phase 3 materialization on demand. Useful
// while sync-all is failing on flow_logs (Phase 3 doesn't depend on
// flow_logs — it reads existing graph state).
export async function POST(req: NextRequest) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 55_000)
    const upstreamRes = await fetch(
      `${BACKEND_URL}/api/attack-chain/chains-for-cj/materialize`,
      {
        method: "POST",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    )
    clearTimeout(timeout)
    if (!upstreamRes.ok) {
      const text = await upstreamRes.text()
      return NextResponse.json(
        { error: `backend ${upstreamRes.status}`, detail: text.slice(0, 500) },
        { status: upstreamRes.status },
      )
    }
    const data = await upstreamRes.json()
    return NextResponse.json(data)
  } catch (err: any) {
    const msg = err?.name === "AbortError" ? "upstream timeout" : String(err?.message ?? err)
    return NextResponse.json({ error: "proxy_error", detail: msg }, { status: 502 })
  }
}
