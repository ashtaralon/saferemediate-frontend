import { NextRequest, NextResponse } from "next/server"
import {
  OIDC_TRANSACTION_COOKIE,
  OIDC_TRANSACTION_TTL_SECONDS,
  OperatorSessionError,
  discoverOidc,
  operatorOidcConfig,
  pkceChallenge,
  randomToken,
  safeReturnTo,
  sealJson,
  sessionCookieOptions,
} from "@/lib/server/operator-session"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const config = operatorOidcConfig()
  if (!config) {
    return NextResponse.json(
      { error: "OPERATOR_SIGN_IN_NOT_CONFIGURED", message: "Operator sign-in is not configured for this deployment." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
  try {
    const discovery = await discoverOidc(config.issuer)
    const transaction = {
      state: randomToken(),
      nonce: randomToken(),
      verifier: randomToken(48),
      returnTo: safeReturnTo(request.nextUrl.searchParams.get("returnTo")),
      createdAt: Math.floor(Date.now() / 1000),
    }
    const target = new URL(discovery.authorization_endpoint)
    target.searchParams.set("response_type", "code")
    target.searchParams.set("client_id", config.clientId)
    target.searchParams.set("redirect_uri", config.redirectUri)
    target.searchParams.set("scope", config.scopes)
    target.searchParams.set("state", transaction.state)
    target.searchParams.set("nonce", transaction.nonce)
    target.searchParams.set("code_challenge", await pkceChallenge(transaction.verifier))
    target.searchParams.set("code_challenge_method", "S256")
    const response = NextResponse.redirect(target, { status: 302 })
    response.headers.set("Cache-Control", "no-store")
    response.cookies.set(
      OIDC_TRANSACTION_COOKIE,
      await sealJson(transaction, config.sessionSecret, OIDC_TRANSACTION_COOKIE),
      sessionCookieOptions(OIDC_TRANSACTION_TTL_SECONDS, "/api/auth/operator"),
    )
    return response
  } catch (reason) {
    const code = reason instanceof OperatorSessionError ? reason.code : "OPERATOR_SIGN_IN_UNAVAILABLE"
    return NextResponse.json({ error: code, message: "Operator sign-in is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
