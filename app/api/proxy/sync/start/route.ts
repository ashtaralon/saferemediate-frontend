import { type NextRequest, NextResponse } from "next/server"
import { coerceProxyErrorMessage } from "@/lib/proxy-error-message"
import { getNeptuneRefreshBackendBaseUrl } from "@/lib/server/neptune-refresh-backend-url"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Neptune-safe managed refresh.
 *
 * This must never point back at /api/collectors/sync-all/start: that legacy
 * endpoint writes the graph inside the serving process, whose Neptune role is
 * intentionally read-only. V2 only enqueues work for a dedicated projector.
 */
export async function POST(request: NextRequest) {
  try {
    // Forward the lane selection. The backend defaults to the Inspector lane
    // when `sources` is absent, so dropping it here would silently turn every
    // screen's refresh into an Inspector round — the exact failure the
    // per-surface contract exists to prevent.
    const sources = request.nextUrl.searchParams.get("sources")
    const target = new URL(`${getNeptuneRefreshBackendBaseUrl()}/api/v2/sync/start`)
    if (sources) {
      target.searchParams.set("sources", sources)
    }

    const response = await fetch(target.toString(), {
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
