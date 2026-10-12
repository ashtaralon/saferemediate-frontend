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

const BACKEND_URL = getBackendBaseUrl()

const ALLOWED_PARAMS = ["min_consumers", "include_inactive", "system_name"] as const

// A timeout used to be a 200 with shared_sgs = []: "no shared security groups"
// presented as a successful discovery. Every failure is now the house error
// shape (lib/server/proxy-error, as the LP issues and metrics proxies answer
// it): a non-2xx status, allowlisted typed detail only, no rows.
export async function GET(req: NextRequest) {
  const inUrl = new URL(req.url)
  const qs = new URLSearchParams()
  for (const k of ALLOWED_PARAMS) {
    const v = inUrl.searchParams.get(k)
    if (v !== null) qs.set(k, v)
  }

  const backendUrl = `${BACKEND_URL}/api/sg/shared-sgs${qs.toString() ? `?${qs}` : ""}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    const res = await fetch(backendUrl, { cache: "no-store", signal: controller.signal })
    clearTimeout(timeoutId)

    if (!res.ok) {
      const raw = await res.text().catch(() => "")
      const detail = allowlistedBackendDetail(raw)
      console.error(`[proxy] sg/shared-sgs backend ${res.status}: code=${detail?.code ?? "none"}`)
      return NextResponse.json(
        {
          error: `Shared-SGs backend returned ${res.status}`,
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
    return NextResponse.json(await res.json())
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    console.error("[proxy] sg/shared-sgs error:", error instanceof Error ? error.message : error)
    // AbortError -> 504, anything else -> 503; no rows either way.
    const failed = fromCaughtError(error)
    failed.headers.set(ERROR_ORIGIN_HEADER, "proxy")
    return failed
  }
}
