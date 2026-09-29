import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import {
  ERROR_ORIGIN_HEADER,
  allowlistedBackendDetail,
  fromCaughtError,
  reviewProxyStatus,
} from "@/lib/server/proxy-error"

const BACKEND_URL = getBackendBaseUrl()

export const maxDuration = 60

// Errors carry NO gap values. A failure used to be a 200 with gaps = [],
// total_roles = 0 and overall_usage_percent = 0: an empty result and a zero
// reading in an error body. A failure is now the house error shape
// (lib/server/proxy-error, as the LP issues and metrics proxies answer it):
// a non-2xx status and no values.
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ systemName: string }> }
) {
  const { systemName } = await context.params

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/iam-analysis/gaps/${systemName}`,
      {
        headers: {
          Accept: "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        cache: "no-store",
      }
    )

    if (!res.ok) {
      const raw = await res.text().catch(() => "")
      const detail = allowlistedBackendDetail(raw)
      console.error(`IAM gaps backend ${res.status}: code=${detail?.code ?? "none"}`)
      return NextResponse.json(
        {
          error: `IAM gap-analysis backend returned ${res.status}`,
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
    console.error("IAM gaps proxy error:", error instanceof Error ? error.message : error)
    // An unreachable backend is a 503 proxy error; no gap values.
    const failed = fromCaughtError(error)
    failed.headers.set(ERROR_ORIGIN_HEADER, "proxy")
    return failed
  }
}
