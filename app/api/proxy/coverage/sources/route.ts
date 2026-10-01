import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { serverDerivedOperatorHeaders } from "@/lib/server/operator-session"

// GET proxy for /api/coverage/sources — the per-account, per-source verified
// coverage record (earliest verified, verified through, completed windows,
// gaps). Read-only and uncached: coverage moves forward with every collection,
// and a cached answer would claim a range the backend no longer vouches for.
//
// `status: NOT_RECORDED` is a normal 200 from the backend and is relayed as-is;
// the panel renders it as "Coverage not recorded yet". Backend errors are
// relayed with their status and body so the panel can show the backend's words.

export const runtime = "nodejs"
export const maxDuration = 30
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: NextRequest) {
  const target = new URL(`${getBackendBaseUrl()}/api/coverage/sources`)
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.append(key, value))

  const headers: Record<string, string> = { Accept: "application/json" }
  const authorization = request.headers.get("authorization")
  if (authorization) headers.Authorization = authorization
  // Customer-resident: the private ALB authenticated the operator and signed
  // x-amzn-oidc-data; the backend verifies it. Same rule as the account-admin
  // proxy: serverDerivedOperatorHeaders is the one definition of what is forwarded.
  if (process.env.CYNTRO_DEPLOYMENT_MODE === "CUSTOMER_RESIDENT") {
    Object.assign(headers, await serverDerivedOperatorHeaders(request))
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 25_000)
  try {
    const upstream = await fetch(target, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    const body = await upstream.text()
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    clearTimeout(timeoutId)
    const timedOut = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")
    return NextResponse.json(
      {
        error: timedOut ? "coverage_upstream_timeout" : "coverage_proxy_unavailable",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: timedOut ? 504 : 502, headers: { "Cache-Control": "no-store" } },
    )
  }
}
