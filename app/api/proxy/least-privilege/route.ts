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

// A timeout used to be a 200 with roles = [] and total = 0: an empty result
// presented as a successful one. Every failure is now the house error shape
// (lib/server/proxy-error, as the LP issues and metrics proxies answer it):
// a non-2xx status, allowlisted typed detail only, no roles and no count.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName")
  if (!systemName) {
    return NextResponse.json({ error: "systemName query parameter is required" }, { status: 400 })
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    const res = await fetch(
      `${BACKEND_URL}/api/least-privilege/roles?systemName=${encodeURIComponent(systemName)}`,
      {
        cache: "no-store",
        signal: controller.signal,
      }
    )

    clearTimeout(timeoutId)

    if (!res.ok) {
      const raw = await res.text().catch(() => "")
      const detail = allowlistedBackendDetail(raw)
      console.error(`[proxy] least-privilege backend ${res.status}: code=${detail?.code ?? "none"}`)
      return NextResponse.json(
        {
          error: `Least-privilege roles backend returned ${res.status}`,
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
    console.error("[proxy] least-privilege error:", error instanceof Error ? error.message : error)
    // AbortError -> 504, anything else -> 503; no roles and no count either way.
    const failed = fromCaughtError(error)
    failed.headers.set(ERROR_ORIGIN_HEADER, "proxy")
    return failed
  }
}
