import { NextRequest, NextResponse } from "next/server"
import { accountAdminIdentityHeaders, accountAdminWriteFromOwnOrigin } from "@/lib/server/account-admin-proxy"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

/**
 * The System Boundary authoring proxy (Phase 2 F1): a NAMED proxy for exactly seven backend routes, never a relay.
 *
 * The backend verifies the person on these routes by the console transport (api/system_boundary.py::_console_person,
 * backend a3c945b0): the IdP access token alone, against the keys installed on the issuer's trust block, else its
 * published set. On a customer-resident install this server forwards only the two headers the load balancer sent
 * (accountAdminIdentityHeaders: the signed x-amzn-oidc-data, which the backend does not read here, and the access
 * token the ALB obtained, as Authorization: Bearer); the browser's own Authorization and cookies never travel. A
 * write must come from this console's own origin (accountAdminWriteFromOwnOrigin). Both helpers are imported
 * unchanged; nothing of account administration's privilege is involved -- the backend decides read / classify.
 *
 * Everything else is refused here by name with nothing forwarded: another path or method, any query parameter but
 * the request list's cursor and limit, a body that is not JSON or exceeds the backend's own cap. Upstream calls are
 * never cached and never follow a redirect (the identity headers must not reach another destination), and nothing
 * is retried: the caller keeps the exact request to resend. Responses -- the backend's, relayed byte for byte, and
 * this proxy's own refusals -- are person-scoped and carry Cache-Control: no-store.
 */

export const AUTHORING_PROXY_PREFIX = "/api/proxy/system-boundary/"
/** The backend's MAX_BODY_BYTES (unified/system_boundary_save.py): exactly this many bytes pass, one more refuses. */
export const AUTHORING_MAX_BODY_BYTES = 1024 * 1024
export const AUTHORING_MAX_CURSOR = 1024

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

type Route = { method: "GET" | "POST"; matches: (suffix: string) => boolean; query: readonly string[] }

/** The seven routes, by exact method and path below /api/system-boundary/, with the query each may carry. */
const ROUTES: readonly Route[] = [
  { method: "GET", matches: (s) => s === "declarations/view", query: [] },
  { method: "GET", matches: (s) => s === "declarations/head", query: [] },
  { method: "POST", matches: (s) => s === "declarations", query: [] },
  { method: "POST", matches: (s) => s === "declarations/corrections", query: [] },
  { method: "GET", matches: (s) => s === "declarations/requests", query: ["cursor", "limit"] },
  {
    method: "GET",
    matches: (s) => s.startsWith("declarations/requests/") && UUID.test(s.slice("declarations/requests/".length)),
    query: [],
  },
  { method: "GET", matches: (s) => s === "authoring-grants/self", query: [] },
]

function refused(status: number, detail: Record<string, unknown>): NextResponse {
  return NextResponse.json({ detail }, { status, headers: { "Cache-Control": "no-store" } })
}

/** The allowed route for this request's method and (already normalized, still percent-encoded) path, or null. */
export function authoringRoute(method: string, pathname: string): Route | null {
  if (!pathname.startsWith(AUTHORING_PROXY_PREFIX)) return null
  const suffix = pathname.slice(AUTHORING_PROXY_PREFIX.length)
  return ROUTES.find((route) => route.method === method.toUpperCase() && route.matches(suffix)) ?? null
}

/** The query to forward, or null when it carries anything the route does not take, twice, or out of shape. */
function forwardedQuery(route: Route, params: URLSearchParams): URLSearchParams | null {
  const out = new URLSearchParams()
  const names = Array.from(params.keys())
  if (new Set(names).size !== names.length || names.some((name) => !route.query.includes(name))) return null
  const limit = params.get("limit")
  if (limit !== null) {
    if (!/^[0-9]{1,2}$/.test(limit)) return null
    out.set("limit", limit)
  }
  const cursor = params.get("cursor")
  if (cursor !== null) {
    if (!cursor || cursor.length > AUTHORING_MAX_CURSOR) return null
    out.set("cursor", cursor)
  }
  return out
}

/** The body, counted in BYTES as it streams and dropped at cap + 1: never materialized beyond the cap. */
async function boundedBody(request: NextRequest): Promise<Uint8Array<ArrayBuffer> | NextResponse> {
  const declared = request.headers.get("content-length")
  if (declared !== null) {
    if (!/^[0-9]+$/.test(declared)) return refused(400, { code: "CONTENT_LENGTH_INVALID" })
    if (Number(declared) > AUTHORING_MAX_BODY_BYTES) {
      return refused(413, { code: "REQUEST_BODY_TOO_LARGE", limit: AUTHORING_MAX_BODY_BYTES })
    }
  }
  const chunks: Uint8Array[] = []
  let total = 0
  if (request.body) {
    const reader = request.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > AUTHORING_MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined)
        return refused(413, { code: "REQUEST_BODY_TOO_LARGE", limit: AUTHORING_MAX_BODY_BYTES })
      }
      chunks.push(value)
    }
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export async function proxyAuthoring(request: NextRequest): Promise<NextResponse> {
  const method = request.method.toUpperCase()
  const route = authoringRoute(method, request.nextUrl.pathname)
  if (!route) return refused(404, { code: "AUTHORING_ROUTE_UNKNOWN" })
  const query = forwardedQuery(route, request.nextUrl.searchParams)
  if (!query) return refused(400, { code: "AUTHORING_QUERY_INVALID" })
  const resident = process.env.CYNTRO_DEPLOYMENT_MODE === "CUSTOMER_RESIDENT"
  // The ALB session is a cookie, so a write must prove it came from this console's own origin first.
  if (resident && !accountAdminWriteFromOwnOrigin(request)) return refused(403, { code: "AUTHORING_ORIGIN_REFUSED" })

  let body: Uint8Array<ArrayBuffer> | undefined
  if (method === "POST") {
    const mediaType = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
    if (mediaType !== "application/json") return refused(415, { code: "AUTHORING_CONTENT_TYPE_INVALID" })
    const bounded = await boundedBody(request)
    if (bounded instanceof NextResponse) return bounded
    body = bounded
  }

  // The configured backend is ONE boundary: missing, refused or not a URL is the same named refusal. The helper
  // returns any non-empty override, so the URL is constructed inside that boundary, never after it.
  let target: URL
  try {
    target = new URL(`${getBackendBaseUrl()}/api/system-boundary/${request.nextUrl.pathname.slice(AUTHORING_PROXY_PREFIX.length)}`)
  } catch {
    return refused(503, { code: "AUTHORING_BACKEND_NOT_CONFIGURED" })
  }
  query.forEach((value, name) => target.searchParams.set(name, value))

  const headers: Record<string, string> = { Accept: "application/json" }
  if (body) headers["Content-Type"] = "application/json"
  if (resident) {
    Object.assign(headers, await accountAdminIdentityHeaders(request))   // the ALB's two headers, nothing else
  } else {
    const authorization = request.headers.get("authorization")
    if (authorization) headers.Authorization = authorization
  }

  let response: Response
  let answer: ArrayBuffer | null
  try {
    response = await fetch(target, { method, headers, body, cache: "no-store", redirect: "error" })
    answer = [204, 205, 304].includes(response.status) ? null : await response.arrayBuffer()
  } catch {
    // Unreachable, a redirect, or an answer cut off mid-body: nothing proves what the backend did. The caller
    // resends the same request.
    return refused(502, { code: "AUTHORING_BACKEND_UNAVAILABLE" })
  }
  const relayed: Record<string, string> = { "Cache-Control": "no-store" }
  const contentType = response.headers.get("content-type")
  if (contentType) relayed["Content-Type"] = contentType
  return new NextResponse(answer, { status: response.status, headers: relayed })
}
