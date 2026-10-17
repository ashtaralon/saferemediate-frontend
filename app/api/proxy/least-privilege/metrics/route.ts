import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { fromCaughtError, relayBackendError } from "@/lib/server/proxy-error"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  getBackendBaseUrl()

/**
 * LP metrics passthrough. A failed read is a typed proxy error, never a body of
 * zeros: this proxy used to answer every backend failure (including the typed
 * install hold, SERVING_ROUTE_HELD) with `averageBloatPercentage: 0`, which the
 * Wildcard bloat card rendered as a green "0%".
 */
export async function GET(_req: NextRequest) {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    const res = await fetch(`${BACKEND_URL}/api/least-privilege/metrics`, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
      },
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      console.error(`[LP Proxy Metrics] Backend returned ${res.status}`)
      // The install holds this route (SERVING_ROUTE_HELD): relayed typed, never a bare 502.
      return relayBackendError(res)
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[LP Proxy Metrics] Error:", error?.message)
    return fromCaughtError(error)
  }
}
