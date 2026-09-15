// @vitest-environment node
import { NextRequest } from "next/server"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import {
  OIDC_TRANSACTION_COOKIE,
  OPERATOR_SESSION_COOKIE,
  base64UrlEncode,
  readOperatorSession,
  resetOperatorOidcCaches,
  safeReturnTo,
  sealJson,
  unsealJson,
  verifyIdToken,
} from "@/lib/server/operator-session"

const ISSUER = "https://idp.example.test"
const CLIENT = "cyntro-console"
const ORIGIN = "https://c1.example.test"
const encoder = new TextEncoder()

let rsa: CryptoKeyPair
let rsaJwk: JsonWebKey
let ec: CryptoKeyPair
let ecJwk: JsonWebKey
let attacker: CryptoKeyPair

beforeAll(async () => {
  rsa = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])
  rsaJwk = { ...(await crypto.subtle.exportKey("jwk", rsa.publicKey)), kid: "rsa-1", use: "sig" } as JsonWebKey
  ec = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
  ecJwk = { ...(await crypto.subtle.exportKey("jwk", ec.publicKey)), kid: "ec-1", use: "sig" } as JsonWebKey
  attacker = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])
})

async function idToken(claims: Record<string, unknown>, opts: { alg?: "RS256" | "ES256"; key?: CryptoKey; kid?: string } = {}) {
  const alg = opts.alg ?? "RS256"
  const header = { alg, kid: opts.kid ?? (alg === "RS256" ? "rsa-1" : "ec-1"), typ: "JWT" }
  const input = `${base64UrlEncode(encoder.encode(JSON.stringify(header)))}.${base64UrlEncode(encoder.encode(JSON.stringify(claims)))}`
  const key = opts.key ?? (alg === "RS256" ? rsa.privateKey : ec.privateKey)
  const signature = alg === "RS256"
    ? await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(input))
    : await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(input))
  return `${input}.${base64UrlEncode(new Uint8Array(signature))}`
}

function claims(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000)
  return { iss: ISSUER, aud: CLIENT, sub: "operator-42", exp: now + 900, iat: now, nonce: "n", name: "Operator Forty-Two", email: "op@example.test", groups: ["cyntro-operators"], ...overrides }
}

let tokenToIssue: () => Promise<string>
const upstreamCalls: Array<{ url: string; init?: RequestInit }> = []

beforeEach(() => {
  resetOperatorOidcCaches()
  upstreamCalls.length = 0
  Object.assign(process.env, {
    CYNTRO_OPERATOR_OIDC_ISSUER: ISSUER,
    CYNTRO_OPERATOR_OIDC_CLIENT_ID: CLIENT,
    CYNTRO_OPERATOR_OIDC_CLIENT_SECRET: "client-secret-value",
    CYNTRO_OPERATOR_OIDC_REDIRECT_URI: `${ORIGIN}/api/auth/operator/callback`,
    CYNTRO_OPERATOR_SESSION_SECRET: "a-session-secret-that-is-long-enough-000000",
    BACKEND_URL_OVERRIDE: "http://backend.internal:8000",
  })
  delete process.env.CYNTRO_DEPLOYMENT_MODE
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    upstreamCalls.push({ url, init })
    if (url === `${ISSUER}/.well-known/openid-configuration`) {
      return Response.json({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/authorize`, token_endpoint: `${ISSUER}/token`, jwks_uri: `${ISSUER}/keys` })
    }
    if (url === `${ISSUER}/keys`) return Response.json({ keys: [rsaJwk, ecJwk] })
    if (url === `${ISSUER}/token`) return Response.json({ id_token: await tokenToIssue(), token_type: "Bearer" })
    return Response.json({ accounts: [] })
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  for (const name of ["CYNTRO_OPERATOR_OIDC_ISSUER", "CYNTRO_OPERATOR_OIDC_CLIENT_ID", "CYNTRO_OPERATOR_OIDC_CLIENT_SECRET", "CYNTRO_OPERATOR_OIDC_REDIRECT_URI", "CYNTRO_OPERATOR_SESSION_SECRET", "BACKEND_URL_OVERRIDE", "CYNTRO_DEPLOYMENT_MODE"]) delete process.env[name]
})

async function startSignIn(returnTo = "/settings/accounts") {
  const { GET } = await import("@/app/api/auth/operator/start/route")
  const response = await GET(new NextRequest(`${ORIGIN}/api/auth/operator/start?returnTo=${encodeURIComponent(returnTo)}`))
  const location = new URL(response.headers.get("location") || "")
  const txCookie = response.cookies.get(OIDC_TRANSACTION_COOKIE)
  return { response, location, txCookie }
}

async function callback(params: Record<string, string>, txValue?: string) {
  const { GET } = await import("@/app/api/auth/operator/callback/route")
  const url = new URL(`${ORIGIN}/api/auth/operator/callback`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  const headers = txValue ? { cookie: `${OIDC_TRANSACTION_COOKIE}=${txValue}` } : undefined
  return GET(new NextRequest(url, { headers }))
}

describe("hosted operator sign-in", () => {
  it("starts an authorization-code flow with PKCE S256 and a sealed, path-scoped transaction", async () => {
    const { response, location, txCookie } = await startSignIn("//evil.example/steal")
    expect(response.status).toBe(302)
    expect(location.origin + location.pathname).toBe(`${ISSUER}/authorize`)
    expect(location.searchParams.get("response_type")).toBe("code")
    expect(location.searchParams.get("code_challenge_method")).toBe("S256")
    expect(location.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(location.searchParams.get("client_id")).toBe(CLIENT)
    expect(txCookie?.httpOnly).toBe(true)
    expect(txCookie?.path).toBe("/api/auth/operator")
    const tx = await unsealJson<{ state: string; verifier: string; returnTo: string }>(txCookie?.value, process.env.CYNTRO_OPERATOR_SESSION_SECRET!, OIDC_TRANSACTION_COOKIE)
    expect(tx?.state).toBe(location.searchParams.get("state"))
    expect(tx?.returnTo).toBe("/settings/accounts")
    expect(txCookie?.value).not.toContain(tx!.verifier)
  })

  it("creates a sealed session only after the ID token verifies, and redirects in-app", async () => {
    const { location, txCookie } = await startSignIn("/settings/accounts?tab=onboarding")
    const tx = await unsealJson<{ nonce: string }>(txCookie?.value, process.env.CYNTRO_OPERATOR_SESSION_SECRET!, OIDC_TRANSACTION_COOKIE)
    const token = await idToken(claims({ nonce: tx!.nonce }))
    tokenToIssue = async () => token
    const response = await callback({ code: "auth-code", state: location.searchParams.get("state")! }, txCookie!.value)
    expect(response.status).toBe(200)
    expect(response.headers.get("location")).toBeNull()
    const landing = await response.text()
    expect(landing).toContain('content="0;url=/settings/accounts?tab=onboarding"')
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
    const session = response.cookies.get(OPERATOR_SESSION_COOKIE)
    expect(session?.httpOnly).toBe(true)
    expect(session?.sameSite).toBe("lax")
    expect(session?.value).not.toContain(token.split(".")[1])
    const tokenCall = upstreamCalls.find((call) => call.url === `${ISSUER}/token`)
    expect(String(tokenCall?.init?.body)).toContain("code_verifier=")
    const read = await readOperatorSession(new NextRequest(ORIGIN, { headers: { cookie: `${OPERATOR_SESSION_COOKIE}=${session!.value}` } }))
    expect(read?.subject).toBe("operator-42")
    expect(read?.idToken).toBe(token)
  })

  it.each([
    ["forged signature", async (nonce: string) => idToken(claims({ nonce }), { key: attacker.privateKey }), "ID_TOKEN_SIGNATURE"],
    ["wrong nonce", async () => idToken(claims({ nonce: "replayed" })), "ID_TOKEN_NONCE"],
    ["wrong audience", async (nonce: string) => idToken(claims({ nonce, aud: "another-app" })), "ID_TOKEN_AUDIENCE"],
    ["wrong issuer", async (nonce: string) => idToken(claims({ nonce, iss: "https://other.example.test" })), "ID_TOKEN_ISSUER"],
    ["expired", async (nonce: string) => idToken(claims({ nonce, exp: Math.floor(Date.now() / 1000) - 3600 })), "ID_TOKEN_EXPIRED"],
    ["unsupported algorithm", async (nonce: string) => {
      const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: "HS256", kid: "rsa-1" })))
      const body = base64UrlEncode(encoder.encode(JSON.stringify(claims({ nonce }))))
      return `${header}.${body}.c2ln`
    }, "ID_TOKEN_ALGORITHM"],
  ])("refuses a session for %s", async (_name, makeToken, code) => {
    const { location, txCookie } = await startSignIn()
    const tx = await unsealJson<{ nonce: string }>(txCookie?.value, process.env.CYNTRO_OPERATOR_SESSION_SECRET!, OIDC_TRANSACTION_COOKIE)
    tokenToIssue = () => makeToken(tx!.nonce)
    const response = await callback({ code: "auth-code", state: location.searchParams.get("state")! }, txCookie!.value)
    expect(response.status).toBe(401)
    expect((await response.json()).error).toBe(code)
    expect(response.cookies.get(OPERATOR_SESSION_COOKIE)).toBeUndefined()
  })

  it("refuses a mismatched state or a missing transaction without calling the token endpoint", async () => {
    const { txCookie } = await startSignIn()
    const mismatched = await callback({ code: "auth-code", state: "not-the-state" }, txCookie!.value)
    const missing = await callback({ code: "auth-code", state: "anything" })
    expect(mismatched.status).toBe(400)
    expect(missing.status).toBe(400)
    expect(upstreamCalls.some((call) => call.url === `${ISSUER}/token`)).toBe(false)
  })

  it("verifies ES256 tokens and rejects a tampered or expired session", async () => {
    const token = await idToken(claims({ nonce: "n" }), { alg: "ES256" })
    await expect(verifyIdToken(token, { issuer: ISSUER, clientId: CLIENT, nonce: "n", jwksUri: `${ISSUER}/keys` })).resolves.toMatchObject({ sub: "operator-42" })
    const secret = process.env.CYNTRO_OPERATOR_SESSION_SECRET!
    const expired = await sealJson({ v: 1, idToken: token, subject: "s", issuer: ISSUER, name: "", email: "", expiresAt: 10 }, secret, OPERATOR_SESSION_COOKIE)
    const valid = await sealJson({ v: 1, idToken: token, subject: "s", issuer: ISSUER, name: "", email: "", expiresAt: Math.floor(Date.now() / 1000) + 600 }, secret, OPERATOR_SESSION_COOKIE)
    const tampered = `${valid.slice(0, -4)}AAAA`
    const wrongPurpose = await sealJson({ v: 1, idToken: token, subject: "s", issuer: ISSUER, name: "", email: "", expiresAt: Math.floor(Date.now() / 1000) + 600 }, secret, OIDC_TRANSACTION_COOKIE)
    for (const value of [expired, tampered, wrongPurpose]) {
      expect(await readOperatorSession(new NextRequest(ORIGIN, { headers: { cookie: `${OPERATOR_SESSION_COOKIE}=${value}` } }))).toBeNull()
    }
  })

  it("normalizes return targets to same-origin paths", () => {
    for (const value of ["https://evil.example", "//evil.example", "/\\evil", "javascript:alert(1)", "", "/x\r\nSet-Cookie: a=b"]) {
      expect(safeReturnTo(value)).toBe("/settings/accounts")
    }
    expect(safeReturnTo("/settings/accounts?tab=org")).toBe("/settings/accounts?tab=org")
  })

  it("is refused as not configured rather than guessed", async () => {
    delete process.env.CYNTRO_OPERATOR_SESSION_SECRET
    const { GET } = await import("@/app/api/auth/operator/start/route")
    const response = await GET(new NextRequest(`${ORIGIN}/api/auth/operator/start`))
    expect(response.status).toBe(503)
    expect((await response.json()).error).toBe("OPERATOR_SIGN_IN_NOT_CONFIGURED")
  })
})

describe("server-derived identity on the account admin proxy", () => {
  async function proxied(headers: Record<string, string>) {
    const { proxyAccountAdmin } = await import("@/lib/server/account-admin-proxy")
    await proxyAccountAdmin(new NextRequest(`${ORIGIN}/api/proxy/admin/accounts/onboarding/operations?customer_id=acme`, { headers }), ["onboarding", "operations"])
    const call = upstreamCalls.find((entry) => entry.url.startsWith("http://backend.internal:8000"))
    return new Headers(call?.init?.headers)
  }

  it("attaches the verified session bearer and never a browser-supplied credential", async () => {
    const token = await idToken(claims())
    const secret = process.env.CYNTRO_OPERATOR_SESSION_SECRET!
    const session = await sealJson({ v: 1, idToken: token, subject: "operator-42", issuer: ISSUER, name: "", email: "", expiresAt: Math.floor(Date.now() / 1000) + 600 }, secret, OPERATOR_SESSION_COOKIE)
    const signedIn = await proxied({ cookie: `${OPERATOR_SESSION_COOKIE}=${session}`, authorization: "Bearer attacker-token", "x-amzn-oidc-data": "forged" })
    expect(signedIn.get("authorization")).toBe(`Bearer ${token}`)
    expect(signedIn.has("x-amzn-oidc-data")).toBe(false)
    upstreamCalls.length = 0
    const anonymous = await proxied({ authorization: "Bearer attacker-token", cookie: "cyntro_auth=authenticated" })
    expect(anonymous.has("authorization")).toBe(false)
  })

  it("refuses state-changing calls that do not come from this origin", async () => {
    const { proxyAccountAdmin } = await import("@/lib/server/account-admin-proxy")
    const url = `${ORIGIN}/api/proxy/admin/accounts/onboarding/operations`
    const crossSite = await proxyAccountAdmin(new NextRequest(url, { method: "POST", body: "{}", headers: { origin: "https://evil.example" } }), ["onboarding", "operations"])
    const sameSiteSubdomain = await proxyAccountAdmin(new NextRequest(url, { method: "POST", body: "{}", headers: { "sec-fetch-site": "same-site" } }), ["onboarding", "operations"])
    expect(crossSite.status).toBe(403)
    expect(sameSiteSubdomain.status).toBe(403)
    expect(upstreamCalls.some((call) => call.url.startsWith("http://backend.internal:8000"))).toBe(false)
    const sameOrigin = await proxyAccountAdmin(new NextRequest(url, { method: "POST", body: "{}", headers: { origin: ORIGIN } }), ["onboarding", "operations"])
    expect(sameOrigin.status).toBe(200)
    const read = await proxyAccountAdmin(new NextRequest(`${url}?customer_id=acme`), ["onboarding", "operations"])
    expect(read.status).toBe(200)
  })

  it("forwards only the ALB-signed header in customer-resident installs", async () => {
    process.env.CYNTRO_DEPLOYMENT_MODE = "CUSTOMER_RESIDENT"
    const headers = await proxied({ "x-amzn-oidc-data": "alb.signed.jws", authorization: "Bearer attacker-token" })
    expect(headers.get("x-amzn-oidc-data")).toBe("alb.signed.jws")
    expect(headers.has("authorization")).toBe(false)
  })

  it("never returns the token from the session endpoint", async () => {
    const token = await idToken(claims())
    const session = await sealJson({ v: 1, idToken: token, subject: "operator-42", issuer: ISSUER, name: "Operator", email: "op@example.test", expiresAt: Math.floor(Date.now() / 1000) + 600 }, process.env.CYNTRO_OPERATOR_SESSION_SECRET!, OPERATOR_SESSION_COOKIE)
    const { GET } = await import("@/app/api/auth/operator/session/route")
    const response = await GET(new NextRequest(`${ORIGIN}/api/auth/operator/session`, { headers: { cookie: `${OPERATOR_SESSION_COOKIE}=${session}` } }))
    const text = await response.text()
    expect(JSON.parse(text)).toMatchObject({ mode: "HOSTED_OIDC", configured: true, signed_in: true, operator: { name: "Operator" } })
    expect(text).not.toContain(token.split(".")[1])
  })
})

describe("sign-out and response hygiene", () => {
  it("refuses a cross-site sign-out and clears the session for a same-origin one without exposing the token", async () => {
    const { POST } = await import("@/app/api/auth/operator/logout/route")
    const crossSite = await POST(new NextRequest(`${ORIGIN}/api/auth/operator/logout`, { method: "POST", headers: { origin: "https://evil.example" } }))
    expect(crossSite.status).toBe(403)
    expect(crossSite.cookies.get(OPERATOR_SESSION_COOKIE)).toBeUndefined()

    const response = await POST(new NextRequest(`${ORIGIN}/api/auth/operator/logout`, { method: "POST", headers: { origin: ORIGIN } }))
    expect(response.status).toBe(200)
    const cleared = response.cookies.get(OPERATOR_SESSION_COOKIE)
    expect(cleared?.value).toBe("")
    expect(cleared?.maxAge).toBe(0)
    expect((await response.json()).end_session_url).toBeNull()
  })

  it("hands the UI the identity provider's end-session endpoint without an id_token_hint", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url === `${ISSUER}/.well-known/openid-configuration`) {
        return Response.json({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/authorize`, token_endpoint: `${ISSUER}/token`, jwks_uri: `${ISSUER}/keys`, end_session_endpoint: `${ISSUER}/logout` })
      }
      return Response.json({})
    }))
    const { POST } = await import("@/app/api/auth/operator/logout/route")
    const response = await POST(new NextRequest(`${ORIGIN}/api/auth/operator/logout`, { method: "POST", headers: { "sec-fetch-site": "same-origin" } }))
    const target = new URL((await response.json()).end_session_url)
    expect(target.origin + target.pathname).toBe(`${ISSUER}/logout`)
    expect(target.searchParams.get("client_id")).toBe(CLIENT)
    expect(target.searchParams.get("post_logout_redirect_uri")).toBe(`${ORIGIN}/settings/accounts`)
    expect(target.searchParams.has("id_token_hint")).toBe(false)
  })

  it("marks every account administration response no-store", async () => {
    const { proxyAccountAdmin } = await import("@/lib/server/account-admin-proxy")
    const response = await proxyAccountAdmin(new NextRequest(`${ORIGIN}/api/proxy/admin/accounts/onboarding/access-bindings`, { method: "POST", body: "{}", headers: { origin: ORIGIN } }), ["onboarding", "access-bindings"])
    expect(response.headers.get("cache-control")).toBe("no-store")
  })

  it("accepts a loopback http redirect only outside production unless explicitly allowed", async () => {
    const { operatorOidcConfig } = await import("@/lib/server/operator-session")
    const base = { CYNTRO_OPERATOR_OIDC_ISSUER: ISSUER, CYNTRO_OPERATOR_OIDC_CLIENT_ID: CLIENT, CYNTRO_OPERATOR_SESSION_SECRET: "a-session-secret-that-is-long-enough-000000" }
    const loopback = { ...base, CYNTRO_OPERATOR_OIDC_REDIRECT_URI: "http://127.0.0.1:3100/api/auth/operator/callback" }
    expect(operatorOidcConfig({ ...loopback, NODE_ENV: "development" })).not.toBeNull()
    expect(operatorOidcConfig({ ...loopback, NODE_ENV: "production" })).toBeNull()
    expect(operatorOidcConfig({ ...loopback, NODE_ENV: "production", CYNTRO_OPERATOR_OIDC_ALLOW_LOOPBACK_REDIRECT: "true" })).not.toBeNull()
    expect(operatorOidcConfig({ ...base, NODE_ENV: "development", CYNTRO_OPERATOR_OIDC_REDIRECT_URI: "http://console.example.test/api/auth/operator/callback" })).toBeNull()
  })
})
