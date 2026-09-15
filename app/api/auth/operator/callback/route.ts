import { NextRequest, NextResponse } from "next/server"
import {
  OIDC_TRANSACTION_COOKIE,
  OIDC_TRANSACTION_TTL_SECONDS,
  OPERATOR_SESSION_COOKIE,
  OperatorSessionError,
  discoverOidc,
  operatorOidcConfig,
  sealSession,
  sessionCookieOptions,
  statesMatch,
  unsealJson,
  verifyIdToken,
  type OidcTransaction,
} from "@/lib/server/operator-session"

export const dynamic = "force-dynamic"

function refuse(code: string, message: string, status = 400) {
  const response = NextResponse.json({ error: code, message }, { status, headers: { "Cache-Control": "no-store" } })
  response.cookies.set(OIDC_TRANSACTION_COOKIE, "", sessionCookieOptions(0, "/api/auth/operator"))
  return response
}

export async function GET(request: NextRequest) {
  const config = operatorOidcConfig()
  if (!config) return refuse("OPERATOR_SIGN_IN_NOT_CONFIGURED", "Operator sign-in is not configured for this deployment.", 503)
  const transaction = await unsealJson<OidcTransaction>(
    request.cookies.get(OIDC_TRANSACTION_COOKIE)?.value,
    config.sessionSecret,
    OIDC_TRANSACTION_COOKIE,
  )
  const now = Math.floor(Date.now() / 1000)
  const params = request.nextUrl.searchParams
  if (params.get("error")) return refuse("OPERATOR_SIGN_IN_DENIED", "The identity provider did not complete sign-in.", 401)
  if (!transaction || now - transaction.createdAt > OIDC_TRANSACTION_TTL_SECONDS) {
    return refuse("OPERATOR_SIGN_IN_EXPIRED", "This sign-in attempt expired. Start again.")
  }
  const state = params.get("state") || ""
  const code = params.get("code") || ""
  if (!code || !statesMatch(state, transaction.state)) {
    return refuse("OPERATOR_SIGN_IN_STATE_MISMATCH", "The sign-in response does not match this sign-in attempt.")
  }
  try {
    const discovery = await discoverOidc(config.issuer)
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      code_verifier: transaction.verifier,
    })
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }
    if (config.clientSecret) {
      headers.Authorization = `Basic ${btoa(`${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`)}`
    } else {
      body.set("client_id", config.clientId)
    }
    const tokenResponse = await fetch(discovery.token_endpoint, { method: "POST", headers, body, cache: "no-store" })
    if (!tokenResponse.ok) return refuse("OPERATOR_SIGN_IN_TOKEN_EXCHANGE", "The identity provider refused the sign-in code.", 401)
    const tokens = (await tokenResponse.json()) as { id_token?: string }
    if (!tokens.id_token) return refuse("OPERATOR_SIGN_IN_NO_ID_TOKEN", "The identity provider returned no identity token.", 401)
    const claims = await verifyIdToken(tokens.id_token, {
      issuer: config.issuer,
      clientId: config.clientId,
      nonce: transaction.nonce,
      jwksUri: discovery.jwks_uri,
    })
    const session = await sealSession(claims, tokens.id_token, config)
    const response = NextResponse.redirect(new URL(transaction.returnTo, request.nextUrl.origin), { status: 302 })
    response.headers.set("Cache-Control", "no-store")
    response.cookies.set(OPERATOR_SESSION_COOKIE, session.value, sessionCookieOptions(session.maxAge))
    response.cookies.set(OIDC_TRANSACTION_COOKIE, "", sessionCookieOptions(0, "/api/auth/operator"))
    return response
  } catch (reason) {
    if (reason instanceof OperatorSessionError) return refuse(reason.code, reason.message, 401)
    return refuse("OPERATOR_SIGN_IN_UNAVAILABLE", "Operator sign-in is temporarily unavailable.", 503)
  }
}
