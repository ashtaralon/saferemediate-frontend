# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: topology-estate-c1-qa-live.spec.ts >> C1 live QA — Step 5 acceptance matrix >> the scope bar states the account id in full, and counts in the singular
- Location: tests/integration/topology-estate-c1-qa-live.spec.ts:1724:7

# Error details

```
Error: Set CYNTRO_LIVE_SITE_PASSWORD to sign live specs in to the site gate
```

# Test source

```ts
  1  | import type { APIRequestContext, BrowserContext, PlaywrightWorkerArgs } from "@playwright/test"
  2  | 
  3  | type Playwright = PlaywrightWorkerArgs["playwright"]
  4  | 
  5  | /** Base URL for live integration specs (local dev or cyntro.io). */
  6  | export function liveBaseUrl(): string {
  7  |   const raw = process.env.FRONTEND_URL || "http://localhost:3000"
  8  |   try {
  9  |     const u = new URL(raw)
  10 |     // Apex redirects to www on Vercel; auth cookie on cyntro.io is lost on
  11 |     // 307 → www, so /api/proxy/* returns HTML login instead of JSON.
  12 |     if (u.hostname === "cyntro.io") {
  13 |       u.hostname = "www.cyntro.io"
  14 |       return u.origin
  15 |     }
  16 |     return u.origin
  17 |   } catch {
  18 |     return raw
  19 |   }
  20 | }
  21 | 
  22 | const AUTH_COOKIE_NAME = "cyntro_auth"
  23 | let sessionValue: Promise<string> | null = null
  24 | 
  25 | /**
  26 |  * The site gate's sealed session, obtained by signing in once per worker.
  27 |  *
  28 |  * The site cookie is no longer a constant anyone can set; live specs sign in
  29 |  * with the site password from CYNTRO_LIVE_SITE_PASSWORD (or SITE_PASSWORD) and
  30 |  * reuse the cookie the login route issues.
  31 |  */
  32 | export async function siteSessionCookieValue(): Promise<string> {
  33 |   if (!sessionValue) {
  34 |     sessionValue = (async () => {
  35 |       const password = process.env.CYNTRO_LIVE_SITE_PASSWORD || process.env.SITE_PASSWORD
> 36 |       if (!password) throw new Error("Set CYNTRO_LIVE_SITE_PASSWORD to sign live specs in to the site gate")
     |                            ^ Error: Set CYNTRO_LIVE_SITE_PASSWORD to sign live specs in to the site gate
  37 |       const response = await fetch(`${liveBaseUrl()}/api/auth/login`, {
  38 |         method: "POST",
  39 |         headers: { "Content-Type": "application/json" },
  40 |         body: JSON.stringify({ password }),
  41 |         redirect: "manual",
  42 |       })
  43 |       const match = (response.headers.get("set-cookie") || "").match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`))
  44 |       if (!response.ok || !match) throw new Error(`Site sign-in failed for live specs (HTTP ${response.status})`)
  45 |       return match[1]
  46 |     })()
  47 |   }
  48 |   return sessionValue
  49 | }
  50 | 
  51 | /** Seed the site-password session cookie on a browser context (page navigation). */
  52 | export async function seedAuthCookie(context: BrowserContext): Promise<void> {
  53 |   const base = liveBaseUrl()
  54 |   await context.addCookies([
  55 |     {
  56 |       name: AUTH_COOKIE_NAME,
  57 |       value: await siteSessionCookieValue(),
  58 |       path: "/",
  59 |       domain: new URL(base).hostname,
  60 |       httpOnly: true,
  61 |       secure: base.startsWith("https"),
  62 |       sameSite: "Strict",
  63 |     },
  64 |   ])
  65 | }
  66 | 
  67 | /**
  68 |  * APIRequestContext with the same auth cookie as the browser.
  69 |  * Playwright's bare `request` fixture does NOT inherit context cookies —
  70 |  * this is why /api/proxy/* returned 307 on cyntro.io in live specs.
  71 |  */
  72 | export async function authedApi(playwright: Playwright): Promise<APIRequestContext> {
  73 |   const base = liveBaseUrl()
  74 |   return playwright.request.newContext({
  75 |     baseURL: base,
  76 |     extraHTTPHeaders: {
  77 |       Cookie: `${AUTH_COOKIE_NAME}=${await siteSessionCookieValue()}`,
  78 |     },
  79 |   })
  80 | }
  81 | 
  82 | const RETRYABLE_STATUSES = new Set([502, 503, 504])
  83 | 
  84 | /** Retry GET on Render cold-start / Neo4j saturation blips (502–504). */
  85 | export async function liveGetWithRetry(
  86 |   request: APIRequestContext,
  87 |   path: string,
  88 |   attempts = 5,
  89 |   pauseMs = 10_000,
  90 | ) {
  91 |   let last = await request.get(path)
  92 |   for (let i = 1; i < attempts && RETRYABLE_STATUSES.has(last.status()); i++) {
  93 |     await new Promise((r) => setTimeout(r, pauseMs))
  94 |     last = await request.get(path)
  95 |   }
  96 |   return last
  97 | }
  98 | 
```