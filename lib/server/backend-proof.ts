import type { NextRequest } from "next/server"
import {
  customerBackendAuthInstalled,
} from "@/lib/server/customer-backend-auth"

/**
 * Which proof a server-side proxy presents to the backend for a product read.
 *
 * Choosing grants nothing. The backend verifies the proof and decides identity,
 * tenant and scope; this only reads what the request already carries and what
 * this process installed at startup. No network call, no token handling.
 *
 * `headers` are identity headers and nothing else — the caller adds its own.
 * `untypedUnauthorizedCode` names an untyped backend 401 for the shape where
 * the only proof sent was the service token, so "the deployment's credential
 * was refused" is not reported as "the operator is not authenticated".
 */
export type BackendProof =
  | { ok: true; headers: Record<string, string>; untypedUnauthorizedCode?: string }
  | { ok: false; status: 403 | 503; code: string }

/** Refusals this module can return, named as the backend names the same states. */
export const PROOF_REFUSAL_MESSAGES: Record<string, string> = {
  ANALYST_AUTHENTICATED_PRINCIPAL_UNAVAILABLE:
    "The load balancer attached no verified operator identity.",
  DECISION_DEPLOYMENT_PRINCIPAL_UNAVAILABLE:
    "This deployment's server-to-server credential is not installed.",
}

/**
 * Select the proof for one product read.
 *
 *   CUSTOMER_RESIDENT  both ALB OIDC headers are required, and only the signed
 *                      `x-amzn-oidc-data` is forwarded. Signed OIDC outranks
 *                      the service token the process-wide writer attaches.
 *   hosted             no identity header is forwarded, whatever the client
 *                      sent. The backend judges the request as the deployment
 *                      principal from the service token installed at startup.
 *                      Without that writer the request is refused here, by
 *                      name, so it is never sent unauthenticated.
 */
export function selectBackendProof(req: NextRequest): BackendProof {
  if (process.env.CYNTRO_DEPLOYMENT_MODE === "CUSTOMER_RESIDENT") {
    const principal = req.headers.get("x-amzn-oidc-identity")?.trim()
    const oidcData = req.headers.get("x-amzn-oidc-data")?.trim()
    if (!principal || !oidcData) {
      return { ok: false, status: 403, code: "ANALYST_AUTHENTICATED_PRINCIPAL_UNAVAILABLE" }
    }
    return { ok: true, headers: { "X-Amzn-Oidc-Data": oidcData } }
  }

  if (!customerBackendAuthInstalled()) {
    return { ok: false, status: 503, code: "DECISION_DEPLOYMENT_PRINCIPAL_UNAVAILABLE" }
  }
  return {
    ok: true,
    headers: {},
    untypedUnauthorizedCode: "DECISION_DEPLOYMENT_PRINCIPAL_UNAVAILABLE",
  }
}
