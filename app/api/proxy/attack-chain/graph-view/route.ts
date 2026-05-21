import { NextRequest, NextResponse } from "next/server"

// POST proxy for the attack-chain graph-view backend endpoint.
// Forwards the request body verbatim. No edge cache on this route —
// the attacker-view payload is selection-driven and small enough that
// re-fetching on every selection is fine.

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  "https://saferemediate-backend-f.onrender.com"

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 55_000)
    const upstreamRes = await fetch(`${BACKEND_URL}/api/attack-chain/graph-view`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
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
