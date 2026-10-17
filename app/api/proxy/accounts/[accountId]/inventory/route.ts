import { NextRequest, NextResponse } from "next/server"
import { accountAdminIdentityHeaders } from "@/lib/server/account-admin-proxy"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

/**
 * GET /api/proxy/accounts/{accountId}/inventory -> backend GET /api/accounts/{accountId}/inventory (T11b).
 *
 * Read only. The backend verifies the person and their read of THIS tenant's account; this proxy only relays the
 * identity the existing account-administration transport relays (accountAdminIdentityHeaders, reused unchanged,
 * on a customer-resident install; otherwise the browser's own Authorization). It never follows a redirect with
 * those credentials. Every answer is Cache-Control: no-store; the proxy's own answers are a closed {"error": code}
 * and never echo a URL, an exception or an upstream message.
 */

export const dynamic = "force-dynamic"

const ACCOUNT_ID = /^[0-9]{12}$/
const FORWARDED_QUERY = new Set(["resource_type", "limit", "cursor"])
const NO_STORE = { "Cache-Control": "no-store" }

type Context = { params: Promise<{ accountId: string }> }

function refuse(status: number, code: string): NextResponse {
  return NextResponse.json({ error: code }, { status, headers: NO_STORE })
}

/**
 * The backend URL for this account, or null for a configured base this proxy will not use. The base is parsed and
 * validated FIRST (http / https only; no credentials, query or fragment -- even an empty "?" or "#"), and the endpoint
 * is appended through its pathname, so a base with a path prefix keeps it and nothing can move the endpoint into a
 * query or fragment.
 */
function backendTarget(accountId: string, query: URLSearchParams): URL | null {
  try {
    const configured = getBackendBaseUrl()
    const base = new URL(configured)
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash
      || configured.includes("?") || configured.includes("#")) {
      return null
    }
    const target = new URL(base.origin)
    target.pathname = `${base.pathname.replace(/\/+$/, "")}/api/accounts/${encodeURIComponent(accountId)}/inventory`
    query.forEach((value, key) => target.searchParams.set(key, value))
    return target
  } catch {
    return null
  }
}

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  const { accountId } = await context.params
  if (typeof accountId !== "string" || !ACCOUNT_ID.test(accountId)) return refuse(400, "PROXY_ACCOUNT_ID_INVALID")

  const query = new URLSearchParams()
  for (const key of Array.from(new Set(Array.from(request.nextUrl.searchParams.keys())))) {
    const values = request.nextUrl.searchParams.getAll(key)
    if (!FORWARDED_QUERY.has(key) || values.length !== 1) return refuse(400, "PROXY_QUERY_INVALID")
    query.set(key, values[0])
  }

  const target = backendTarget(accountId, query)
  if (target === null) return refuse(503, "PROXY_BACKEND_UNCONFIGURED")

  const headers: Record<string, string> = { Accept: "application/json" }
  if (process.env.CYNTRO_DEPLOYMENT_MODE === "CUSTOMER_RESIDENT") {
    Object.assign(headers, await accountAdminIdentityHeaders(request))
  } else {
    const authorization = request.headers.get("authorization")
    if (authorization) headers.Authorization = authorization
  }

  let response: Response
  try {
    response = await fetch(target, { method: "GET", headers, cache: "no-store", redirect: "manual" })
  } catch {
    return refuse(502, "PROXY_BACKEND_UNREACHABLE")
  }
  if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
    return refuse(502, "PROXY_BACKEND_REDIRECT")
  }
  let body: unknown
  try {
    body = JSON.parse(await response.text())
  } catch {
    return refuse(502, "PROXY_RESPONSE_NOT_JSON")
  }
  return NextResponse.json(body, { status: response.status, headers: NO_STORE })
}
