import type { APIRequestContext, BrowserContext, Playwright } from "@playwright/test"

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

const AUTH_COOKIE = {
  name: "cyntro_auth",
  value: "authenticated",
  path: "/",
} as const

/** Seed the site-password auth cookie on a browser context (page navigation). */
export async function seedAuthCookie(context: BrowserContext): Promise<void> {
  const base = liveBaseUrl()
  await context.addCookies([
    {
      ...AUTH_COOKIE,
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
      Cookie: `${AUTH_COOKIE.name}=${AUTH_COOKIE.value}`,
    },
  })
}

const RETRYABLE_STATUSES = new Set([502, 503, 504])

/** Retry GET on Render cold-start / Neo4j saturation blips (502–504). */
export async function liveGetWithRetry(
  request: APIRequestContext,
  path: string,
  attempts = 3,
  pauseMs = 8000,
) {
  let last = await request.get(path)
  for (let i = 1; i < attempts && RETRYABLE_STATUSES.has(last.status()); i++) {
    await new Promise((r) => setTimeout(r, pauseMs))
    last = await request.get(path)
  }
  return last
}
