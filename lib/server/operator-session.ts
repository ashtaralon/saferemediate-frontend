import type { NextRequest } from "next/server"

/**
 * Operator sign-in for the hosted console (C1 / SaaS).
 *
 * The hosted console has one shared password cookie. It admits a browser but
 * identifies no individual, so the backend refuses onboarding writes from it
 * (401 OPERATOR_IDENTITY_REQUIRED). This module adds the supported path: OIDC
 * authorization code with PKCE against the customer's identity provider,
 * performed entirely on this server.
 *
 * - The ID token is verified here (signature against the issuer's JWKS, issuer,
 *   audience, expiry, nonce) before a session exists, and verified again by the
 *   backend on every call (`unified/identity/operator_identity.py`).
 * - The session is an AES-GCM sealed, httpOnly cookie. Browser code can neither
 *   read nor forge it, and no service credential is ever sent to the browser.
 * - The BFF attaches `Authorization: Bearer <id_token>` server-side only.
 *
 * Customer-resident installs authenticate at the private ALB instead and the
 * BFF forwards the ALB-signed `x-amzn-oidc-data` header.
 */

export const OPERATOR_SESSION_COOKIE = "cyntro_operator_session"
export const OIDC_TRANSACTION_COOKIE = "cyntro_operator_oidc_tx"
export const OIDC_TRANSACTION_TTL_SECONDS = 600
export const MAX_SESSION_SECONDS = 3600
const MAX_COOKIE_BYTES = 3800
const CLOCK_SKEW_SECONDS = 60
const DISCOVERY_TTL_MS = 10 * 60 * 1000

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export interface OperatorOidcConfig {
  issuer: string
  clientId: string
  clientSecret: string | null
  redirectUri: string
  scopes: string
  sessionSecret: string
}

export interface OidcDiscovery {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  end_session_endpoint?: string
}

export interface OperatorSession {
  idToken: string
  subject: string
  issuer: string
  name: string
  email: string
  expiresAt: number
}

export class OperatorSessionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = "OperatorSessionError"
  }
}

type Env = Record<string, string | undefined>

export function operatorOidcConfig(env: Env = process.env): OperatorOidcConfig | null {
  const issuer = env.CYNTRO_OPERATOR_OIDC_ISSUER?.trim().replace(/\/$/, "")
  const clientId = env.CYNTRO_OPERATOR_OIDC_CLIENT_ID?.trim()
  const redirectUri = env.CYNTRO_OPERATOR_OIDC_REDIRECT_URI?.trim()
  const sessionSecret = env.CYNTRO_OPERATOR_SESSION_SECRET?.trim()
  if (!issuer || !clientId || !redirectUri || !sessionSecret) return null
  if (!issuer.startsWith("https://")) return null
  if (!redirectUri.startsWith("https://") && !isLoopbackDevRedirect(redirectUri, env)) return null
  if (sessionSecret.length < 32) return null
  return {
    issuer,
    clientId,
    clientSecret: env.CYNTRO_OPERATOR_OIDC_CLIENT_SECRET?.trim() || null,
    redirectUri,
    scopes: env.CYNTRO_OPERATOR_OIDC_SCOPES?.trim() || "openid email profile",
    sessionSecret,
  }
}

/** Local verification only: a non-production build may redirect to loopback http. */
function isLoopbackDevRedirect(redirectUri: string, env: Env): boolean {
  if (env.NODE_ENV === "production" && env.CYNTRO_OPERATOR_OIDC_ALLOW_LOOPBACK_REDIRECT !== "true") return false
  try {
    const url = new URL(redirectUri)
    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost")
  } catch {
    return false
  }
}

/**
 * Cross-site request refusal for state-changing proxy calls.
 *
 * The operator session cookie is SameSite=Lax, which already withholds it from
 * cross-site POSTs, but same-site subdomains are not cross-site. A state-changing
 * request must therefore prove it came from this origin.
 *
 * A browser's Sec-Fetch-Site is authoritative when present and must be
 * same-origin. Otherwise the Origin header's host must equal the host the
 * browser addressed (Host, or X-Forwarded-Host set by the load balancer). The
 * server's own URL is not the reference: behind an ALB, Vercel or `next start`
 * it is an internal address the browser never used. Neither header can be set
 * by a page on another site, and a request carrying neither is refused.
 */
export function isSameOriginMutation(request: Pick<NextRequest, "method" | "headers" | "nextUrl">): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return true
  const fetchSite = request.headers.get("sec-fetch-site")
  if (fetchSite) return fetchSite === "same-origin"
  const origin = request.headers.get("origin")
  if (!origin || origin === "null") return false
  let originHost: string
  try {
    originHost = new URL(origin).host.toLowerCase()
  } catch {
    return false
  }
  const addressed = [request.headers.get("x-forwarded-host"), request.headers.get("host"), request.nextUrl.host]
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  return addressed.includes(originHost)
}

// ── encoding ─────────────────────────────────────────────────────────────

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export function randomToken(byteLength = 32): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)))
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier))
  return base64UrlEncode(new Uint8Array(digest))
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left)
  const b = encoder.encode(right)
  let diff = a.length ^ b.length
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0)
  }
  return diff === 0
}

// ── sealing ──────────────────────────────────────────────────────────────

async function sealingKey(secret: string, purpose: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`cyntro-operator-session:${purpose}:${secret}`))
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
}

export async function sealJson(value: unknown, secret: string, purpose: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(purpose) },
      await sealingKey(secret, purpose),
      encoder.encode(JSON.stringify(value)),
    ),
  )
  const sealed = new Uint8Array(iv.length + ciphertext.length)
  sealed.set(iv)
  sealed.set(ciphertext, iv.length)
  return `v1.${base64UrlEncode(sealed)}`
}

export async function unsealJson<T>(token: string | undefined, secret: string, purpose: string): Promise<T | null> {
  if (!token || !token.startsWith("v1.")) return null
  try {
    const raw = base64UrlDecode(token.slice(3))
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: raw.slice(0, 12), additionalData: encoder.encode(purpose) },
      await sealingKey(secret, purpose),
      raw.slice(12),
    )
    return JSON.parse(decoder.decode(plaintext)) as T
  } catch {
    return null
  }
}

// ── discovery and ID token verification ─────────────────────────────────

const discoveryCache = new Map<string, { at: number; value: OidcDiscovery }>()
const jwksCache = new Map<string, { at: number; keys: JsonWebKey[] }>()

export function resetOperatorOidcCaches(): void {
  discoveryCache.clear()
  jwksCache.clear()
}

export async function discoverOidc(issuer: string, fetchImpl: typeof fetch = fetch): Promise<OidcDiscovery> {
  const cached = discoveryCache.get(issuer)
  if (cached && Date.now() - cached.at < DISCOVERY_TTL_MS) return cached.value
  const response = await fetchImpl(`${issuer}/.well-known/openid-configuration`, { cache: "no-store" })
  if (!response.ok) throw new OperatorSessionError("OIDC_DISCOVERY_UNAVAILABLE", "The identity provider could not be reached.")
  const document = (await response.json()) as Partial<OidcDiscovery>
  const endpoints = [document.authorization_endpoint, document.token_endpoint, document.jwks_uri]
  if (String(document.issuer || "").replace(/\/$/, "") !== issuer || endpoints.some((value) => !String(value || "").startsWith("https://"))) {
    throw new OperatorSessionError("OIDC_DISCOVERY_INVALID", "The identity provider configuration does not match this deployment.")
  }
  const value = document as OidcDiscovery
  discoveryCache.set(issuer, { at: Date.now(), value })
  return value
}

async function signingKeys(jwksUri: string, fetchImpl: typeof fetch, force = false): Promise<JsonWebKey[]> {
  const cached = jwksCache.get(jwksUri)
  if (!force && cached && Date.now() - cached.at < DISCOVERY_TTL_MS) return cached.keys
  const response = await fetchImpl(jwksUri, { cache: "no-store" })
  if (!response.ok) throw new OperatorSessionError("OIDC_KEYS_UNAVAILABLE", "The identity provider signing keys could not be loaded.")
  const document = (await response.json()) as { keys?: JsonWebKey[] }
  const keys = Array.isArray(document.keys) ? document.keys : []
  jwksCache.set(jwksUri, { at: Date.now(), keys })
  return keys
}

function decodeSegment(segment: string): Record<string, unknown> {
  try {
    const value = JSON.parse(decoder.decode(base64UrlDecode(segment)))
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>
  } catch {
    // fall through
  }
  throw new OperatorSessionError("ID_TOKEN_MALFORMED", "The identity token is malformed.")
}

export interface IdTokenExpectation {
  issuer: string
  clientId: string
  nonce: string
  jwksUri: string
  now?: number
  fetchImpl?: typeof fetch
}

export async function verifyIdToken(idToken: string, expected: IdTokenExpectation): Promise<Record<string, unknown>> {
  const parts = idToken.split(".")
  if (parts.length !== 3) throw new OperatorSessionError("ID_TOKEN_MALFORMED", "The identity token is malformed.")
  const [headerSegment, payloadSegment, signatureSegment] = parts
  const header = decodeSegment(headerSegment)
  const algorithm = String(header.alg || "")
  if (algorithm !== "RS256" && algorithm !== "ES256") {
    throw new OperatorSessionError("ID_TOKEN_ALGORITHM", "The identity token uses an unsupported signature algorithm.")
  }
  const kid = String(header.kid || "")
  const fetchImpl = expected.fetchImpl ?? fetch
  const data = encoder.encode(`${headerSegment}.${payloadSegment}`)
  const signature = base64UrlDecode(signatureSegment)
  const verifyWith = async (keys: JsonWebKey[]) => {
    for (const jwk of keys) {
      const candidate = jwk as JsonWebKey & { kid?: string; use?: string }
      if (kid && candidate.kid !== kid) continue
      if (candidate.use && candidate.use !== "sig") continue
      try {
        if (algorithm === "RS256" && candidate.kty === "RSA") {
          const key = await crypto.subtle.importKey("jwk", candidate, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"])
          if (await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, data)) return true
        }
        if (algorithm === "ES256" && candidate.kty === "EC" && candidate.crv === "P-256") {
          const key = await crypto.subtle.importKey("jwk", candidate, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"])
          if (await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, signature, data)) return true
        }
      } catch {
        continue
      }
    }
    return false
  }
  let verified = await verifyWith(await signingKeys(expected.jwksUri, fetchImpl))
  if (!verified) verified = await verifyWith(await signingKeys(expected.jwksUri, fetchImpl, true))
  if (!verified) throw new OperatorSessionError("ID_TOKEN_SIGNATURE", "The identity token signature did not verify.")

  const claims = decodeSegment(payloadSegment)
  const now = expected.now ?? Math.floor(Date.now() / 1000)
  const audience = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud || "")]
  if (String(claims.iss || "").replace(/\/$/, "") !== expected.issuer) {
    throw new OperatorSessionError("ID_TOKEN_ISSUER", "The identity token was issued by a different provider.")
  }
  if (!audience.includes(expected.clientId)) {
    throw new OperatorSessionError("ID_TOKEN_AUDIENCE", "The identity token was issued for a different application.")
  }
  if (typeof claims.exp !== "number" || now > claims.exp + CLOCK_SKEW_SECONDS) {
    throw new OperatorSessionError("ID_TOKEN_EXPIRED", "The identity token has expired. Sign in again.")
  }
  if (typeof claims.nbf === "number" && now + CLOCK_SKEW_SECONDS < claims.nbf) {
    throw new OperatorSessionError("ID_TOKEN_NOT_YET_VALID", "The identity token is not yet valid.")
  }
  if (!expected.nonce || !constantTimeEqual(String(claims.nonce || ""), expected.nonce)) {
    throw new OperatorSessionError("ID_TOKEN_NONCE", "The sign-in response does not match this sign-in attempt.")
  }
  if (!String(claims.sub || "").trim()) {
    throw new OperatorSessionError("ID_TOKEN_SUBJECT", "The identity token has no subject.")
  }
  return claims
}

// ── transaction and session ─────────────────────────────────────────────

export interface OidcTransaction {
  state: string
  nonce: string
  verifier: string
  returnTo: string
  createdAt: number
}

export function safeReturnTo(value: string | null | undefined): string {
  const candidate = String(value || "").trim()
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\") || /[\r\n]/.test(candidate)) {
    return "/settings/accounts"
  }
  return candidate
}

export function statesMatch(left: string, right: string): boolean {
  return constantTimeEqual(left, right)
}

export async function sealSession(claims: Record<string, unknown>, idToken: string, config: OperatorOidcConfig, now = Math.floor(Date.now() / 1000)): Promise<{ value: string; maxAge: number }> {
  const expiresAt = Math.min(Number(claims.exp), now + MAX_SESSION_SECONDS)
  const value = await sealJson(
    {
      v: 1,
      idToken,
      subject: String(claims.sub),
      issuer: String(claims.iss),
      name: String(claims.name || ""),
      email: String(claims.email || ""),
      expiresAt,
    },
    config.sessionSecret,
    OPERATOR_SESSION_COOKIE,
  )
  if (value.length > MAX_COOKIE_BYTES) {
    throw new OperatorSessionError(
      "SESSION_TOO_LARGE",
      "The identity token is too large for a browser session. Reduce the claims the identity provider includes.",
    )
  }
  return { value, maxAge: Math.max(0, expiresAt - now) }
}

export async function readOperatorSession(
  request: Pick<NextRequest, "cookies">,
  config: OperatorOidcConfig | null = operatorOidcConfig(),
  now = Math.floor(Date.now() / 1000),
): Promise<OperatorSession | null> {
  if (!config) return null
  const sealed = request.cookies.get(OPERATOR_SESSION_COOKIE)?.value
  const session = await unsealJson<OperatorSession & { v: number }>(sealed, config.sessionSecret, OPERATOR_SESSION_COOKIE)
  if (!session || session.v !== 1 || typeof session.expiresAt !== "number" || session.expiresAt <= now + 30) return null
  if (session.issuer.replace(/\/$/, "") !== config.issuer) return null
  return session
}

export function sessionCookieOptions(maxAge: number, path = "/") {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path,
    maxAge,
  }
}

/** Identity headers the BFF may attach to a backend call. Server-derived only. */
export async function serverDerivedOperatorHeaders(request: Pick<NextRequest, "cookies" | "headers">): Promise<Record<string, string>> {
  if (process.env.CYNTRO_DEPLOYMENT_MODE === "CUSTOMER_RESIDENT") {
    // The private ALB authenticates the user and signs this header; the backend
    // verifies the signature. Nothing else is forwarded.
    const signed = request.headers.get("x-amzn-oidc-data")?.trim()
    return signed ? { "X-Amzn-Oidc-Data": signed } : {}
  }
  const session = await readOperatorSession(request)
  return session ? { Authorization: `Bearer ${session.idToken}` } : {}
}

// ── verified operator state from the backend ────────────────────────────

export type BackendOperatorCall =
  | { kind: "OK"; status: number; body: Record<string, unknown> }
  | { kind: "REFUSED"; status: number; code: string }
  | { kind: "UNAVAILABLE"; status: number | null; code: string }

/**
 * Call a backend onboarding operator route with the server-derived identity.
 * The backend verifies the credential, maps role and tenant from its own trust
 * configuration and checks shared revocation; this server only relays.
 */
export async function callBackendOperatorRoute(
  request: Pick<NextRequest, "cookies" | "headers">,
  backendBaseUrl: string,
  path: "/operator" | "/operator/sign-out",
  { method = "GET", customerId }: { method?: "GET" | "POST"; customerId?: string | null } = {},
): Promise<BackendOperatorCall> {
  const target = new URL(`${backendBaseUrl}/api/admin/accounts/onboarding${path}`)
  if (customerId) target.searchParams.set("customer_id", customerId)
  try {
    const response = await fetch(target, {
      method,
      headers: { Accept: "application/json", ...(await serverDerivedOperatorHeaders(request)) },
      cache: "no-store",
    })
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null
    const detail = payload && typeof payload.detail === "object" && payload.detail ? payload.detail as Record<string, unknown> : {}
    const code = typeof detail.error === "string" ? detail.error : `HTTP_${response.status}`
    if (response.ok && payload) return { kind: "OK", status: response.status, body: payload }
    if (response.status === 401 || response.status === 403 || response.status === 409) return { kind: "REFUSED", status: response.status, code }
    return { kind: "UNAVAILABLE", status: response.status, code }
  } catch {
    return { kind: "UNAVAILABLE", status: null, code: "BACKEND_UNREACHABLE" }
  }
}
