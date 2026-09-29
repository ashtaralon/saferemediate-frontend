import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import {
  ERROR_ORIGIN_HEADER,
  allowlistedBackendDetail,
  fromCaughtError,
  reviewProxyStatus,
} from "@/lib/server/proxy-error"

// Route: /api/proxy/security-groups/by-system
// Returns all security groups for a system from Neo4j
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0
export const maxDuration = 30

const BACKEND_URL =
  getBackendBaseUrl()

// A timeout or unreachable backend used to be a 200 with security_groups = []:
// "this system has no security groups" presented as a successful read. Every
// failure is now the house error shape (lib/server/proxy-error, as the LP
// issues and metrics proxies answer it): a non-2xx status and no rows.
export async function GET(req: NextRequest) {
  console.log("[by-system] Route handler invoked")
  
  try {
    const { searchParams } = new URL(req.url)
    const systemName = searchParams.get("system_name")

    if (!systemName) {
      return NextResponse.json(
        { error: "system_name is required" },
        { status: 400 }
      )
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25_000) // 30 second timeout

    const backendUrl = `${BACKEND_URL}/api/security-groups/by-system?system_name=${encodeURIComponent(systemName)}`

    console.log(`[proxy] security-groups/by-system -> ${backendUrl}`)

    const res = await fetch(backendUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const raw = await res.text().catch(() => "")
      const detail = allowlistedBackendDetail(raw)
      console.error(`[proxy] security-groups/by-system backend ${res.status}: code=${detail?.code ?? "none"}`)
      return NextResponse.json(
        {
          error: `Security-groups-by-system backend returned ${res.status}`,
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

    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  } catch (error: unknown) {
    console.error("[proxy] security-groups/by-system error:", error instanceof Error ? error.message : error)
    // AbortError -> 504, anything else -> 503; no rows either way.
    const failed = fromCaughtError(error)
    failed.headers.set(ERROR_ORIGIN_HEADER, "proxy")
    return failed
  }
}
