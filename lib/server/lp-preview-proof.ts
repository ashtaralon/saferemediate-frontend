import { NextResponse } from "next/server"

const SERVICE_TOKEN_HEADER = "X-Cyntro-Service-Token"
const OIDC_DATA_HEADER = "X-Amzn-Oidc-Data"
const NOT_CONFIGURED = "DEPLOYMENT_SERVICE_TOKEN_NOT_CONFIGURED"
const NOT_CONFIGURED_MESSAGE =
  "This request carries no verified identity and this deployment has no " +
  "service token configured (CYNTRO_SERVICE_TOKEN), so the read cannot be " +
  "authorized. Installing the token is a release prerequisite."

export type PreviewProof =
  | { kind: "ready"; headers: Record<string, string> }
  | { kind: "not_configured" }

/**
 * Server-owned proof for every LP Preview read (gap-analysis and simulate-fix).
 *
 * Hosted SaaS (C1): only the deployment service token. The browser site-session
 * cookie admits the page but identifies no backend principal; operator Bearer is
 * for lifecycle mutations, not account-scoped Review. Browser-supplied
 * `x-amzn-oidc-data` must not outrank a valid service token — the backend treats
 * OIDC as authoritative when present, so a forged claim would 401 an otherwise
 * authorized deployment read.
 *
 * Customer-resident: ALB-signed OIDC for Analyst scope, plus the service token
 * so an enforce-mode auth boundary can admit the hop.
 */
export function previewProofFor(request: Request): PreviewProof {
  const token = process.env.CYNTRO_SERVICE_TOKEN?.trim()
  if (process.env.CYNTRO_DEPLOYMENT_MODE === "CUSTOMER_RESIDENT") {
    const oidc = request.headers.get("x-amzn-oidc-data")?.trim()
    if (oidc && token) {
      return {
        kind: "ready",
        headers: { [OIDC_DATA_HEADER]: oidc, [SERVICE_TOKEN_HEADER]: token },
      }
    }
    if (token) return { kind: "ready", headers: { [SERVICE_TOKEN_HEADER]: token } }
    return { kind: "not_configured" }
  }
  if (token) return { kind: "ready", headers: { [SERVICE_TOKEN_HEADER]: token } }
  return { kind: "not_configured" }
}

/** The proxy's own refusal when no proof exists; the backend is never called. */
export function previewProofNotConfigured(): NextResponse {
  return NextResponse.json(
    {
      error_code: NOT_CONFIGURED,
      code: NOT_CONFIGURED,
      error: NOT_CONFIGURED_MESSAGE,
      detail: NOT_CONFIGURED_MESSAGE,
      origin: "proxy",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  )
}
