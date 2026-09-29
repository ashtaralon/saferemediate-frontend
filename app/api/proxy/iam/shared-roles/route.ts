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

// Pass through all known query params so the client can use the full
// filter surface (min_principals, system_name, cross_system_only,
// include_stale, include_inactive).
const ALLOWED_PARAMS = [
  "min_principals",
  "system_name",
  "cross_system_only",
  "include_stale",
  "include_inactive",
] as const

// A timeout used to be a 200 with shared_roles = [] and count = 0: "no shared
// roles" presented as a successful discovery. Every failure is now the house
// error shape (lib/server/proxy-error, as the LP issues and metrics proxies
// answer it): a non-2xx status, allowlisted typed detail only, no rows.
export async function GET(req: NextRequest) {
  const inUrl = new URL(req.url)
  const qs = new URLSearchParams()
  for (const k of ALLOWED_PARAMS) {
    const v = inUrl.searchParams.get(k)
    if (v !== null) qs.set(k, v)
  }

  const backendUrl = `${BACKEND_URL}/api/iam/shared-roles${qs.toString() ? `?${qs}` : ""}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    const res = await fetch(backendUrl, {
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      const raw = await res.text().catch(() => "")
      const detail = allowlistedBackendDetail(raw)
      console.error(`[proxy] iam/shared-roles backend ${res.status}: code=${detail?.code ?? "none"}`)
      return NextResponse.json(
        {
          error: `Shared-roles backend returned ${res.status}`,
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
    console.error("[proxy] iam/shared-roles error:", error instanceof Error ? error.message : error)
    // AbortError -> 504, anything else -> 503; no rows and no count either way.
    const failed = fromCaughtError(error)
    failed.headers.set(ERROR_ORIGIN_HEADER, "proxy")
    return failed
  }
}
