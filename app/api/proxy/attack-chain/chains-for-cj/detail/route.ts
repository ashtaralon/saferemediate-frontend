import { NextRequest, NextResponse } from "next/server"

// GET proxy for /api/attack-chain/chains-for-cj/detail?chain_id=...
//
// DETAIL endpoint — full chain object + node_meta enrichment for ONE
// chain. Pair with /chains-for-cj/summary: list lands fast, drill-in
// pays the enrichment cost on a single chain (~10-20 hop ids, not 220+).
//
// The chain knows its own CJ via the REACHES_CJ relationship, so the
// proxy doesn't need a cj_id param. The chain-selection invariant
// (is_active workload + non-stale) is enforced server-side; a stale
// chain id returns 404 rather than a stale row.
//
// Pass-through: same 55s abort budget as the other chains-for-cj
// proxies, same BACKEND_URL resolution, same error envelope shape.

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const chain_id = url.searchParams.get("chain_id")
  if (!chain_id) {
    return NextResponse.json(
      { error: "missing_chain_id", detail: "chain_id query param required" },
      { status: 400 },
    )
  }

  const qs = new URLSearchParams({ chain_id })
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 55_000)
    const upstreamRes = await fetch(
      `${BACKEND_URL}/api/attack-chain/chains-for-cj/detail?${qs.toString()}`,
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
