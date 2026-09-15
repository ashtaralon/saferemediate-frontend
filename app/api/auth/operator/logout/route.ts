import { NextRequest, NextResponse } from "next/server"
import {
  OPERATOR_SESSION_COOKIE,
  discoverOidc,
  isSameOriginMutation,
  operatorOidcConfig,
  sessionCookieOptions,
} from "@/lib/server/operator-session"

export const dynamic = "force-dynamic"

/**
 * Ends the console session.
 *
 * The session is a sealed cookie, not a server-side record, so clearing it is
 * what this server can do: a copy of the cookie taken before sign-out stays
 * verifiable until its own expiry (at most MAX_SESSION_SECONDS and never past
 * the ID token's exp, which the backend re-checks). When the identity provider
 * publishes an end-session endpoint, the UI is handed it so the IdP session is
 * ended too and the next sign-in needs the operator's credentials. The ID token
 * is deliberately not put in that URL.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { error: "CROSS_SITE_REQUEST_REFUSED", message: "Sign-out must come from this console." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    )
  }
  let endSessionUrl: string | null = null
  const config = operatorOidcConfig()
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
    { signed_in: false, end_session_url: endSessionUrl },
    { headers: { "Cache-Control": "no-store" } },
  )
  response.cookies.set(OPERATOR_SESSION_COOKIE, "", sessionCookieOptions(0))
  return response
}
