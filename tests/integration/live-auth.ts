import type { APIRequestContext, BrowserContext, PlaywrightWorkerArgs } from "@playwright/test"

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

const AUTH_COOKIE_NAME = "cyntro_auth"
let sessionValue: Promise<string> | null = null

/**
 * The site gate's sealed session, obtained by signing in once per worker.
 *
 * The site cookie is no longer a constant anyone can set; live specs sign in
 * with the site password from CYNTRO_LIVE_SITE_PASSWORD (or SITE_PASSWORD) and
 * reuse the cookie the login route issues.
 */
export async function siteSessionCookieValue(): Promise<string> {
  if (!sessionValue) {
    sessionValue = (async () => {
      const password = process.env.CYNTRO_LIVE_SITE_PASSWORD || process.env.SITE_PASSWORD
      if (!password) throw new Error("Set CYNTRO_LIVE_SITE_PASSWORD to sign live specs in to the site gate")
      const response = await fetch(`${liveBaseUrl()}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        redirect: "manual",
      })
      const match = (response.headers.get("set-cookie") || "").match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`))
      if (!response.ok || !match) throw new Error(`Site sign-in failed for live specs (HTTP ${response.status})`)
      return match[1]
    })()
  }
  return sessionValue
}

/** Seed the site-password session cookie on a browser context (page navigation). */
export async function seedAuthCookie(context: BrowserContext): Promise<void> {
  const base = liveBaseUrl()
  await context.addCookies([
    {
      name: AUTH_COOKIE_NAME,
      value: await siteSessionCookieValue(),
      path: "/",
      domain: new URL(base).hostname,
      httpOnly: true,
      secure: base.startsWith("https"),
      sameSite: "Strict",
    },
  ])
}

/**
 * APIRequestContext with the same auth cookie as the browser.
 * Playwright's bare `request` fixture does NOT inherit context cookies —
 * this is why /api/proxy/* returned 307 on cyntro.io in live specs.
 */
export async function authedApi(playwright: Playwright): Promise<APIRequestContext> {
  const base = liveBaseUrl()
  return playwright.request.newContext({
    baseURL: base,
    extraHTTPHeaders: {
      Cookie: `${AUTH_COOKIE_NAME}=${await siteSessionCookieValue()}`,
    },
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
