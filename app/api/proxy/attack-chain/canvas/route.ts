import { NextRequest, NextResponse } from "next/server"

/**
 * POST proxy for the V2 Attack Canvas backend endpoint.
 *
 * Forwards the request body verbatim. Backend pattern mirrors the
 * existing graph-view proxy (siblings in this directory).
 *
 * Selection-driven endpoint — no edge cache. The V2 backend producer
 * already reads from the IAP's in-memory cache, so the latency
 * here is dominated by Neo4j read time for the per-path neighborhood
 * (~2-3s warm, more on cold cache).
 */

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  "https://saferemediate-backend-f.onrender.com"

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 55_000)
    const upstreamRes = await fetch(`${BACKEND_URL}/api/attack-chain/canvas`, {
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
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string }
    const msg =
      e?.name === "AbortError"
        ? "upstream timeout"
        : String(e?.message ?? err)
    return NextResponse.json({ error: "proxy_error", detail: msg }, { status: 502 })
  }
}
