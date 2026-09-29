import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { relayLegacySimulate } from "@/lib/server/legacy-simulate-proxy"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const maxDuration = 300

const BACKEND_URL = getBackendBaseUrl()

/**
 * Per-resource "Simulate Split" -> backend POST /api/simulate, which runs no simulation (see
 * lib/server/legacy-simulate-proxy.ts). This proxy used to reshape that path's hard-coded answer into per-resource rows
 * with `|| 0` fallbacks (0 events, 0 denied, "passed"); it now relays only the typed refusal. The request is forwarded
 * as sent: no resource ARN is built from a hard-coded account.
 */
export async function POST(req: NextRequest) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 295_000)

  try {
    const body = await req.json()
    const res = await fetch(`${BACKEND_URL}/api/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return await relayLegacySimulate(res)
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === "AbortError") {
      return NextResponse.json({ error: "Timeout" }, { status: 504 })
    }
    return NextResponse.json({ error: error.message }, { status: 503 })
  }
}
