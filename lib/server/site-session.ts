import { sealJson, unsealJson } from "@/lib/server/sealed-json"

/**
 * The hosted console's site gate, as a sealed session instead of a constant.
 *
 * The cookie keeps its name (`cyntro_auth`) and attributes, but its value is an
 * AES-GCM sealed `{ v, kind, iat, exp }` that only this server can produce, so a
 * hand-set cookie no longer passes the gate. It is still a shared-password gate:
 * it identifies no operator and grants nothing operator identity controls.
 *
 * Key: `CYNTRO_SITE_SESSION_SECRET` (32+ characters) when set. Otherwise a key is
 * derived from `SITE_PASSWORD` with PBKDF2, so a deployment keeps working without
 * a new variable. The derivation is deliberately slow so a captured cookie is a
 * poor oracle for guessing the password.
 *
 * Ending every site session:
 * - derived-key mode (no CYNTRO_SITE_SESSION_SECRET): rotate SITE_PASSWORD;
 * - explicit-key mode: rotate CYNTRO_SITE_SESSION_SECRET. Rotating SITE_PASSWORD
 *   alone then only stops new sign-ins; cookies already issued stay valid until
 *   their 30-day expiry.
 */
export const SITE_SESSION_COOKIE = "cyntro_auth"
export const SITE_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const PURPOSE = "cyntro_site_session"
const PBKDF2_ITERATIONS = 310_000
const encoder = new TextEncoder()

type Env = Record<string, string | undefined>

interface SiteSession {
  v: 1
  kind: "site"
  iat: number
  exp: number
}

const derived = new Map<string, Promise<string>>()

async function passwordSecret(password: string): Promise<string> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode("cyntro-site-session-v1"), iterations: PBKDF2_ITERATIONS },
    material,
    256,
  )
  return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** The sealing secret, or null when the site gate is not configured (nothing can pass). */
export async function siteSessionSecret(env: Env = process.env): Promise<string | null> {
  const explicit = env.CYNTRO_SITE_SESSION_SECRET?.trim()
  if (explicit && explicit.length >= 32) return explicit
  const password = env.SITE_PASSWORD
  if (!password) return null
  if (!derived.has(password)) derived.set(password, passwordSecret(password))
  return derived.get(password)!
}

export async function issueSiteSession(env: Env = process.env, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const secret = await siteSessionSecret(env)
  if (!secret) throw new Error("site gate is not configured")
  const session: SiteSession = { v: 1, kind: "site", iat: now, exp: now + SITE_SESSION_MAX_AGE_SECONDS }
  return sealJson(session, secret, PURPOSE)
}

export async function siteSessionValid(value: string | undefined, env: Env = process.env, now = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!value) return false
  const secret = await siteSessionSecret(env)
  if (!secret) return false
  const session = await unsealJson<SiteSession>(value, secret, PURPOSE)
  return Boolean(session && session.v === 1 && session.kind === "site" && typeof session.exp === "number" && session.exp > now && session.iat <= now + 60)
}

/** Constant-time password comparison over digests, so length and prefix do not leak through timing. */
export async function sitePasswordMatches(candidate: unknown, env: Env = process.env): Promise<boolean> {
  const expected = env.SITE_PASSWORD
  if (!expected || typeof candidate !== "string") return false
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(candidate)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ])
  const left = new Uint8Array(a)
  const right = new Uint8Array(b)
  let diff = 0
  for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index]
  return diff === 0
}

export function siteCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge,
  }
}
