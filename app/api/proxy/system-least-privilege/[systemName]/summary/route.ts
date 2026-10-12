import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import {
  ERROR_ORIGIN_HEADER,
  allowlistedBackendDetail,
  fromCaughtError,
  reviewProxyStatus,
} from "@/lib/server/proxy-error"

const BACKEND_URL = getBackendBaseUrl()

export const maxDuration = 30

// Errors carry NO summary values. A failure used to be a 200 with
// total_roles = 0 and total_unused_permissions = 0 (avg_lp_score was already
// null): a zero reading in an error body. A failure is now the house error
// shape (lib/server/proxy-error, as the LP issues and metrics proxies answer
// it): a non-2xx status and no values.
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ systemName: string }> }
) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 25_000)

  try {
    const { systemName } = await context.params

    const response = await fetch(
      `${BACKEND_URL}/api/system-least-privilege/${systemName}/summary`,
      {
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        signal: controller.signal,
        cache: "no-store",
      }
    )

    clearTimeout(timeoutId)

    if (!response.ok) {
      const raw = await response.text().catch(() => "")
      const detail = allowlistedBackendDetail(raw)
      console.error(`LP Summary proxy: backend ${response.status}: code=${detail?.code ?? "none"}`)
      return NextResponse.json(
        {
          error: `Least-privilege summary backend returned ${response.status}`,
          ...(detail ? { detail } : {}),
          backendStatus: response.status,
          origin: "backend",
        },
        {
          status: reviewProxyStatus(response.status),
          headers: { "Cache-Control": "no-store", [ERROR_ORIGIN_HEADER]: "backend" },
        },
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    console.error("LP Summary proxy error:", error instanceof Error ? error.message : error)
    // AbortError -> 504, anything else -> 503; no summary values either way.
    const failed = fromCaughtError(error)
    failed.headers.set(ERROR_ORIGIN_HEADER, "proxy")
    return failed
  }
}
