import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

/**
 * POST proxy for /api/attack-chain/exfil-paths.
 *
 * EXFIL view backend — answers "where does the data leave from this
 * crown jewel?" (BFS-forward from jewel to exit points). Complement
 * of the IAP endpoint that powers the Attacker / Per-Path views.
 *
 * Same pattern as the canvas + graph-view proxies in this directory:
 * 55s AbortController, no edge cache, structured error envelope on
 * upstream failure so the frontend's NotWiredCard can render an
 * honest empty state.
 */

export const runtime = "nodejs"
export const maxDuration = 60
export const dynamic = "force-dynamic"
export const revalidate = 0

const BACKEND_URL = getBackendBaseUrl()

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 })
  }
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 55_000)
    const upstream = await fetch(`${BACKEND_URL}/api/attack-chain/exfil-paths`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!upstream.ok) {
      const text = await upstream.text()
      return NextResponse.json(
        {
          ok: false,
          error: `backend ${upstream.status}`,
          detail: text.slice(0, 500),
        },
        { status: upstream.status },
      )
    }
    const data = await upstream.json()
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    })
  } catch (e: any) {
    const isTimeout = e?.name === "AbortError" || e?.name === "TimeoutError"
    return NextResponse.json(
      {
        ok: false,
        error: isTimeout ? "upstream_timeout" : "proxy_error",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    )
  }
}
