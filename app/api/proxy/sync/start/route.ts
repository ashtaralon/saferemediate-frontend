import { NextResponse } from "next/server"
import { coerceProxyErrorMessage } from "@/lib/proxy-error-message"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Neptune-safe managed refresh.
 *
 * This must never point back at /api/collectors/sync-all/start: that legacy
 * endpoint writes the graph inside the serving process, whose Neptune role is
 * intentionally read-only. V2 only enqueues work for a dedicated projector.
 */
export async function POST() {
  try {
    const response = await fetch(`${getBackendBaseUrl()}/api/v2/sync/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    })
    const raw = await response.text()
    let body: unknown = null
    try {
      body = raw ? JSON.parse(raw) : null
    } catch {
      body = null
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: coerceProxyErrorMessage(body, raw || `Backend returned ${response.status}`),
        },
        { status: response.status },
      )
    }

    return NextResponse.json(body, { status: response.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Managed AWS refresh is unavailable"
    return NextResponse.json({ success: false, error: message }, { status: 503 })
  }
}
