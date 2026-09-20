import type { NextRequest } from "next/server"
import { customerBackendAuthInstalled } from "@/lib/server/customer-backend-auth"
import { SITE_SESSION_COOKIE, siteSessionValid } from "@/lib/server/site-session"

/**
 * Which proof a server-side proxy presents to the backend for a product read. Choosing grants nothing: the backend
 * verifies the proof and decides identity, tenant and scope.
 *
 * `headers` are the identity headers to send, and nothing else; the caller adds its own (Accept, request id).
 * `untypedUnauthorizedCode` names an untyped backend 401 when the only proof sent was the service token.
 */
export type BackendProof =
  | { ok: true; headers: Record<string, string>; untypedUnauthorizedCode?: string }
  | { ok: false; status: 401 | 403 | 503; code: string }

/**
 * One proof selection for every product proxy (the Decision product list, and the Review proxy that imports it).
 *
 *   CUSTOMER_RESIDENT  both ALB OIDC headers are required, and only the signed `x-amzn-oidc-data` is forwarded
 *                      (the operator path). Signed OIDC outranks the service token the process-wide writer attaches.
 *   hosted             the sealed site session is re-verified here, not only in the middleware, and NO identity
 *                      header is forwarded, whatever the client sent. The backend judges the request as the
 *                      deployment_service principal from the service token that the writer installed at startup
 *                      (`installCustomerBackendAuthFetch`) attaches. Without that writer the request is refused here,
 *                      by name, so it is never sent unauthenticated and read as an identity failure.
 *
 * No network call, no token handling, no grant: this only reads the request, the session seal and the writer marker.
 */
export async function selectBackendProof(req: NextRequest): Promise<BackendProof> {
  if (process.env.CYNTRO_DEPLOYMENT_MODE === "CUSTOMER_RESIDENT") {
    const principal = req.headers.get("x-amzn-oidc-identity")?.trim()
    const oidcData = req.headers.get("x-amzn-oidc-data")?.trim()
    if (!principal || !oidcData) return { ok: false, status: 403, code: "ANALYST_AUTHENTICATED_PRINCIPAL_UNAVAILABLE" }
    return { ok: true, headers: { "X-Amzn-Oidc-Data": oidcData } }
  }

  if (!(await siteSessionValid(req.cookies.get(SITE_SESSION_COOKIE)?.value))) {
    return { ok: false, status: 401, code: "SITE_SESSION_INVALID" }
  }
  if (!customerBackendAuthInstalled()) {
    return { ok: false, status: 503, code: "DECISION_DEPLOYMENT_PRINCIPAL_UNAVAILABLE" }
  }
  // The only proof this path presents is the service token, so an untyped 401 (the enforced auth boundary refusing
  // the token) is the deployment principal being unavailable, named as the backend names it.
  return { ok: true, headers: {}, untypedUnauthorizedCode: "DECISION_DEPLOYMENT_PRINCIPAL_UNAVAILABLE" }
}
