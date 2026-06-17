import type { APIRequestContext, BrowserContext, Playwright } from "@playwright/test"

/** Base URL for live integration specs (local dev or cyntro.io). */
export function liveBaseUrl(): string {
  return process.env.FRONTEND_URL || "http://localhost:3000"
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
