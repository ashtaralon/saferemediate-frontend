import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import {
  OPERATOR_SESSION_COOKIE,
  callBackendOperatorRoute,
  discoverOidc,
  isSameOriginMutation,
  operatorOidcConfig,
  readOperatorSession,
  sessionCookieOptions,
} from "@/lib/server/operator-session"

export const dynamic = "force-dynamic"

/**
 * Ends the console session everywhere it can be used.
 *
 * The backend first records the session's ID token as revoked in the shared
 * onboarding store, so a copy of the sealed cookie, or the token inside it,
 * is refused by every console and API instance until it would have expired.
 * The browser cookie is cleared either way. If the revocation could not be
 * recorded, the response says so (503, revocation NOT_RECORDED) instead of
 * implying the session is dead elsewhere.
 *
 * When the identity provider publishes an end-session endpoint, the UI is
 * handed it so the IdP session ends too. The ID token is never put in that URL.
 * ALB-authenticated installs sign out at the load balancer and identity provider.
 */
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" }
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: "CROSS_SITE_REQUEST_REFUSED", message: "Sign-out must come from this console." },
      { status: 403, headers },
    )
  }
  if (process.env.CYNTRO_DEPLOYMENT_MODE === "CUSTOMER_RESIDENT") {
    return NextResponse.json({ signed_in: false, revocation: "LOAD_BALANCER_MANAGED", end_session_url: null }, { headers })
  }
  const config = operatorOidcConfig()
  const session = await readOperatorSession(request, config)
  let revocation = "NO_SESSION"
  if (session) {
    const result = await callBackendOperatorRoute(request, getBackendBaseUrl(), "/operator/sign-out", { method: "POST" })
    // A 401 means the backend already refuses this credential (revoked or expired).
    revocation = result.kind === "OK" || (result.kind === "REFUSED" && result.status === 401) ? "RECORDED" : "NOT_RECORDED"
  }
  let endSessionUrl: string | null = null
  if (config) {
    try {
      const discovery = await discoverOidc(config.issuer)
      if (discovery.end_session_endpoint?.startsWith("https://")) {
        const target = new URL(discovery.end_session_endpoint)
        target.searchParams.set("client_id", config.clientId)
        target.searchParams.set("post_logout_redirect_uri", new URL("/settings/accounts", request.nextUrl.origin).toString())
        endSessionUrl = target.toString()
      }
    } catch {
      // The local session is still cleared when the IdP cannot be reached.
    }
  }
  const response = NextResponse.json(
    { signed_in: false, revocation, end_session_url: endSessionUrl },
    { status: revocation === "NOT_RECORDED" ? 503 : 200, headers },
  )
  response.cookies.set(OPERATOR_SESSION_COOKIE, "", sessionCookieOptions(0))
  return response
}
