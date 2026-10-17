import { NextRequest, NextResponse } from "next/server"
import { accountAdminIdentityHeaders } from "@/lib/server/account-admin-proxy"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

/**
 * One account's read-only backend answer, relayed: GET /api/proxy/accounts/{accountId}/{endpoint} -> backend
 * GET /api/accounts/{accountId}/{endpoint}. The rules are the account inventory proxy's (T11b,
 * app/api/proxy/accounts/[accountId]/inventory/route.ts), stated once here for the account census (A7 S1c) and any later
 * per-account read:
 *
 * - the backend verifies the person and their read of THIS tenant's account; this proxy only relays the identity the
 *   account-administration transport relays (accountAdminIdentityHeaders) on a customer-resident install, otherwise the
 *   browser's own Authorization;
 * - only the endpoint's named query keys, each at most once; never a redirect followed with those credentials;
 * - the configured base is parsed and validated FIRST (http / https only; no credentials, query or fragment) and the
 *   endpoint is appended through its pathname;
 * - every answer is Cache-Control: no-store; the proxy's own answers are a closed {"error": code} and never echo a URL, an
 *   exception or an upstream message.
 */

const ACCOUNT_ID = /^[0-9]{12}$/
const NO_STORE = { "Cache-Control": "no-store" }

function refuse(status: number, code: string): NextResponse {
  return NextResponse.json({ error: code }, { status, headers: NO_STORE })
}

function backendTarget(accountId: string, endpoint: string, query: URLSearchParams): URL | null {
  try {
    const configured = getBackendBaseUrl()
    const base = new URL(configured)
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash
      || configured.includes("?") || configured.includes("#")) {
      return null
    }
    const target = new URL(base.origin)
    target.pathname = `${base.pathname.replace(/\/+$/, "")}/api/accounts/${encodeURIComponent(accountId)}/${endpoint}`
    query.forEach((value, key) => target.searchParams.set(key, value))
    return target
  } catch {
    return null
  }
}

export async function proxyAccountRead(
  request: NextRequest,
  accountId: unknown,
  endpoint: string,
  forwardedQuery: ReadonlySet<string>,
): Promise<NextResponse> {
  if (typeof accountId !== "string" || !ACCOUNT_ID.test(accountId)) return refuse(400, "PROXY_ACCOUNT_ID_INVALID")

  const query = new URLSearchParams()
  for (const key of Array.from(new Set(Array.from(request.nextUrl.searchParams.keys())))) {
    const values = request.nextUrl.searchParams.getAll(key)
    if (!forwardedQuery.has(key) || values.length !== 1) return refuse(400, "PROXY_QUERY_INVALID")
    query.set(key, values[0])
  }

  const target = backendTarget(accountId, endpoint, query)
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
