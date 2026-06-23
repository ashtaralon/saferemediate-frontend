import { NextRequest, NextResponse } from "next/server"

// GET proxy for /api/attack-chain/chains-for-cj/summary?cj_id=...
//
// LIST endpoint — light payload (severity, name, hop_count, observed,
// damage_types, etc.) with NO per-request enrichment. Lands well under
// 2s warm on the heaviest alon-prod CJ (legacy /chains-for-cj is
// ~9.5s warm + frequent 55s timeouts on cold).
//
// Pair with /chains-for-cj/detail — operator clicks a row → FE fires
// the detail proxy for that one chain_id only, paying the enrichment
// cost once instead of N times.
//
// Pass-through: same 55s abort budget as the legacy proxy, same
// BACKEND_URL resolution, same error envelope shape.

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
  const system_name = url.searchParams.get("system_name") ?? ""
  const include_out_of_scope =
    url.searchParams.get("include_out_of_scope") ?? "false"

  const qs = new URLSearchParams({ cj_id, include_blocked, rank_by })
  if (system_name) qs.set("system_name", system_name)
  if (include_out_of_scope === "true") qs.set("include_out_of_scope", "true")

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 55_000)
    const upstreamRes = await fetch(
      `${BACKEND_URL}/api/attack-chain/chains-for-cj/summary?${qs.toString()}`,
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
        {
          error: `backend ${upstreamRes.status}`,
          detail: text.slice(0, 500),
        },
        { status: upstreamRes.status },
      )
    }
    const data = await upstreamRes.json()
    return NextResponse.json(data)
  } catch (err: any) {
    const msg =
      err?.name === "AbortError" ? "upstream timeout" : String(err?.message ?? err)
    return NextResponse.json({ error: "proxy_error", detail: msg }, { status: 502 })
  }
}
