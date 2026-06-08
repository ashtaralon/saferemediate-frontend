import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

const BACKEND_URL = getBackendBaseUrl()

/**
 * GET /api/proxy/accounts
 *
 * Returns the list of distinct (cloud, account_id) tuples that have at
 * least one SignalSource node in the backend graph. Used by the Evidence
 * Health widget on the home page to know which accounts to fan
 * /api/evidence/coverage out across.
 *
 * Honesty contract:
 *   - Pass through whatever the backend returns. Empty list = backend has
 *     no SignalSource data yet (collectors haven't populated). Don't
 *     synthesize.
 *   - On 5xx from backend, propagate as 502 with the upstream status.
 */
export async function GET(_req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/accounts`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })

    if (!res.ok) {
      return NextResponse.json(
        {
          error: "accounts_endpoint_unavailable",
          message: `Backend /api/accounts returned ${res.status}`,
          backend_status: res.status,
        },
        { status: 502 },
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json(
      {
        error: "accounts_proxy_error",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    )
  }
}
