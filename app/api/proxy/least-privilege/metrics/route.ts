import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import {
  ERROR_ORIGIN_HEADER,
  allowlistedBackendDetail,
  fromCaughtError,
  reviewProxyStatus,
} from "@/lib/server/proxy-error"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  getBackendBaseUrl()

// Errors carry NO metric values. This route used to answer every failure with
// zeroed metrics (0 roles, 0% bloat, 0 unused permissions): a fabricated
// reading in an error body. A failure is now the house error shape — the same
// one the LP issues proxy answers (lib/server/proxy-error) — and the Wildcard
// Bloat card renders it through its existing error path.
export async function GET(_req: NextRequest) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout
  try {
    const res = await fetch(`${BACKEND_URL}/api/least-privilege/metrics`, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
      },
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const raw = await res.text().catch(() => "")
      const detail = allowlistedBackendDetail(raw)
      console.error(`[LP Proxy Metrics] Backend ${res.status}: code=${detail?.code ?? "none"}`)
      return NextResponse.json(
        {
          error: `Least-privilege metrics backend returned ${res.status}`,
          ...(detail ? { detail } : {}),
          backendStatus: res.status,
          origin: "backend",
        },
        {
          status: reviewProxyStatus(res.status),
          headers: { "Cache-Control": "no-store", [ERROR_ORIGIN_HEADER]: "backend" },
        },
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    console.error("[LP Proxy Metrics] Error:", error instanceof Error ? error.message : error)
    // AbortError -> 504, anything else -> 503; no metric values either way.
    const failed = fromCaughtError(error)
    failed.headers.set(ERROR_ORIGIN_HEADER, "proxy")
    return failed
  }
}
