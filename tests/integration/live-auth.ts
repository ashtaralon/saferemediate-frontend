import type { APIRequestContext, APIResponse, BrowserContext, PlaywrightWorkerArgs } from "@playwright/test"

type Playwright = PlaywrightWorkerArgs["playwright"]

/** Base URL for live integration specs (local dev or cyntro.io). */
export function liveBaseUrl(): string {
  const raw = process.env.FRONTEND_URL || "http://localhost:3000"
  try {
    const u = new URL(raw)
    // Apex redirects to www on Vercel; auth cookie on cyntro.io is lost on
    // 307 → www, so /api/proxy/* returns HTML login instead of JSON.
    if (u.hostname === "cyntro.io") {
      u.hostname = "www.cyntro.io"
      return u.origin
    }
    return u.origin
  } catch {
    return raw
  }
}

/** The site gate's cookie (lib/server/site-session.ts SITE_SESSION_COOKIE). */
export const SITE_SESSION_COOKIE = "cyntro_auth"

function sitePassword(): string {
  const password = process.env.SITE_PASSWORD
  if (!password) {
    throw new Error(
      "SITE_PASSWORD is not set for the test process. Specs sign in through /api/auth/login and " +
        "there is no forged-cookie fallback; fixture-e2e.yml generates a per-run value.",
    )
  }
  return password
}

async function signIn(request: APIRequestContext, base: string): Promise<APIResponse> {
  const response = await request.post(new URL("/api/auth/login", base).toString(), {
    data: { password: sitePassword() },
    failOnStatusCode: false,
  })
  if (response.status() !== 200) {
    // Status only: the body is not ours to print, and the password never is.
    throw new Error(`site sign-in failed: HTTP ${response.status()}`)
  }
  return response
}

/** The session value the server just issued, read from its own Set-Cookie. */
function issuedSession(response: APIResponse): string {
  const prefix = `${SITE_SESSION_COOKIE}=`
  const header = response
    .headersArray()
    .find((h) => h.name.toLowerCase() === "set-cookie" && h.value.startsWith(prefix))
  const value = header?.value.slice(prefix.length).split(";")[0] ?? ""
  if (!value || value === "authenticated") {
    throw new Error("site sign-in returned no sealed session cookie")
  }
  return value
}

async function holdSession(context: BrowserContext, base: string, issued: string): Promise<void> {
  const host = new URL(base).hostname
  const held = (await context.cookies()).find(
    (c) => c.name === SITE_SESSION_COOKIE && c.domain.replace(/^\./, "") === host,
  )
  if (held?.value === issued) return
  await context.addCookies([
    {
      name: SITE_SESSION_COOKIE,
      value: issued,
      domain: host,
      path: "/",
      httpOnly: true,
      secure: base.startsWith("https"),
      sameSite: "Strict",
    },
  ])
}

/**
 * Sign the browser context in through the real /api/auth/login (the request body carries the
 * password, so only an UNTRACED caller should use this directly).
 *
 * The local fixture app runs `next start`, so NODE_ENV=production marks the cookie Secure, and a
 * request jar may decline a Secure cookie received over plain http. When the context did not keep
 * it, the value the server issued is stored -- one is never constructed.
 */
export async function signInThroughLogin(context: BrowserContext): Promise<string> {
  const base = liveBaseUrl()
  const issued = issuedSession(await signIn(context.request, base))
  await holdSession(context, base, issued)
  return issued
}

/**
 * Give the browser context a sealed session the server issued. The former constant value
 * "authenticated" is refused by middleware and is never written here.
 *
 * In fixture-e2e the session was issued ONCE by tests/integration/site-session-bootstrap.mjs, an
 * untraced step, and stored at PW_SITE_SESSION_STATE; loading it keeps every sign-in request (and
 * so the password) out of the application specs' traces. Elsewhere this signs in directly.
 */
export async function seedAuthCookie(context: BrowserContext): Promise<void> {
  const statePath = process.env.PW_SITE_SESSION_STATE
  if (!statePath) {
    await signInThroughLogin(context)
    return
  }
  const { readFileSync } = await import("node:fs")
  const state = JSON.parse(readFileSync(statePath, "utf8")) as { cookies?: { name: string; value: string }[] }
  const issued = state.cookies?.find((c) => c.name === SITE_SESSION_COOKIE)?.value
  if (!issued || issued === "authenticated") {
    throw new Error(`PW_SITE_SESSION_STATE holds no sealed ${SITE_SESSION_COOKIE} session`)
  }
  await holdSession(context, liveBaseUrl(), issued)
}

/**
 * APIRequestContext carrying a session the server issued to it at sign-in.
 * Playwright's bare `request` fixture does NOT inherit context cookies —
 * this is why /api/proxy/* returned 307 on cyntro.io in live specs.
 */
export async function authedApi(playwright: Playwright): Promise<APIRequestContext> {
  const base = liveBaseUrl()
  const signer = await playwright.request.newContext({ baseURL: base })
  let issued: string
  try {
    issued = issuedSession(await signIn(signer, base))
  } finally {
    await signer.dispose()
  }
  return playwright.request.newContext({
    baseURL: base,
    extraHTTPHeaders: { Cookie: `${SITE_SESSION_COOKIE}=${issued}` },
  })
}

const RETRYABLE_STATUSES = new Set([502, 503, 504])

/** Retry GET on Render cold-start / Neo4j saturation blips (502–504). */
export async function liveGetWithRetry(
  request: APIRequestContext,
  path: string,
  attempts = 5,
  pauseMs = 10_000,
) {
  let last = await request.get(path)
  for (let i = 1; i < attempts && RETRYABLE_STATUSES.has(last.status()); i++) {
    await new Promise((r) => setTimeout(r, pauseMs))
    last = await request.get(path)
  }
  return last
}
