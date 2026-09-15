import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import {
  OPERATOR_SESSION_COOKIE,
  callBackendOperatorRoute,
  operatorOidcConfig,
  readOperatorSession,
  sessionCookieOptions,
} from "@/lib/server/operator-session"

export const dynamic = "force-dynamic"

const CUSTOMER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,63}$/

function pick(value: unknown, keys: string[]): Record<string, unknown> {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {}
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]))
}

/**
 * Sign-in state for the UI, verified by the backend. Never returns a token.
 *
 * A browser session or ALB header only says a credential is present. Roles,
 * tenant and permissions come from the backend's verification of that
 * credential, which also refuses a session signed out on another instance; a
 * refused hosted session is cleared here.
 */
export async function GET(request: NextRequest) {
  const residentAlb = process.env.CYNTRO_DEPLOYMENT_MODE === "CUSTOMER_RESIDENT"
  const config = operatorOidcConfig()
  const mode = residentAlb ? "CUSTOMER_IDP_ALB" : "HOSTED_OIDC"
  const configured = residentAlb || Boolean(config)
  const session = residentAlb ? null : await readOperatorSession(request, config)
  const hasCredential = residentAlb ? Boolean(request.headers.get("x-amzn-oidc-data")) : Boolean(session)
  const headers = { "Cache-Control": "no-store" }
  if (!hasCredential) {
    return NextResponse.json({ mode, configured, signed_in: false, verified: "NOT_SIGNED_IN", reason: null, operator: null }, { headers })
  }
  const requested = request.nextUrl.searchParams.get("customer_id")
  const customerId = requested && CUSTOMER_ID.test(requested) ? requested : null
  const result = await callBackendOperatorRoute(request, getBackendBaseUrl(), "/operator", { customerId })
  if (result.kind === "OK") {
    const operator = result.body.operator as Record<string, unknown> | undefined
    return NextResponse.json({
      mode,
      configured,
      signed_in: true,
      verified: "VERIFIED",
      reason: null,
      operator: operator ? {
        ...pick(operator, ["display_name", "email", "tenant_id", "roles", "tenant_wide", "account_scope"]),
        permissions: pick(operator.permissions, ["read", "submit", "cancel"]),
        session: pick(operator.session, ["revocable", "expires_at"]),
      } : null,
    }, { headers })
  }
  if (result.kind === "REFUSED") {
    const response = NextResponse.json({ mode, configured, signed_in: result.status !== 401, verified: "REFUSED", reason: result.code, operator: null }, { headers })
    if (result.status === 401 && !residentAlb) response.cookies.set(OPERATOR_SESSION_COOKIE, "", sessionCookieOptions(0))
    return response
  }
  return NextResponse.json({ mode, configured, signed_in: true, verified: "UNAVAILABLE", reason: result.code, operator: null }, { status: 200, headers })
}
