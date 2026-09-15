import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { SITE_SESSION_COOKIE, siteSessionValid } from "@/lib/server/site-session"

// Sidebar sections the SPA renders via ?section=<id>. When a user types
// /issues directly (or shares a deep link), we transparently rewrite to
// /?section=issues so the sidebar-equipped root renders. Without this,
// Next.js returns a bare 404 with no nav fallback — the design-review's
// top IA complaint.
//
// Sections that already have a dedicated app/ route (least-privilege,
// systems, pending-tags) are NOT in this set — those routes own their
// path. If we add a sidebar-only section that conflicts with an existing
// route, prefer the dedicated route and update the sidebar href to point
// at it rather than overriding here.
const SIDEBAR_ONLY_SECTIONS = new Set([
  "issues",
  "attack-paths",
  "vulnerabilities",
  "compliance",
  "identities",
  "per-resource",
  "automation",
  "integrations",
  "copilot",
])

const PUBLIC_FILE = /^\/[^/]+\.(png|svg|ico|jpg)$/

export function isPublicStaticRead(method: string, pathname: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false
  if (pathname === "/api" || pathname.startsWith("/api/")) return false
  return pathname.startsWith("/_next/") || PUBLIC_FILE.test(pathname)
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Allow the login page and login API
  if (
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    // The identity provider returns the operator here with a cross-site
    // navigation, on which the SameSite=Strict site cookie is never sent. The
    // callback is bound to a sign-in this browser started through the gated
    // /api/auth/operator/start by its sealed transaction cookie.
    pathname === "/api/auth/operator/callback" ||
    pathname === "/api/build-version" ||
    pathname === "/api/healthz"
  ) {
    return NextResponse.next()
  }

  // Allow the backend-url diagnostic endpoint so it can be curl'd from
  // CI or local terminal to verify which backend a deploy is pointing at.
  // Returns no secrets — just the resolved URL + VERCEL_ENV/NODE_ENV.
  // The fail-loud guard in lib/server/backend-url.ts is the real safety net;
  // this endpoint is the human-readable second opinion.
  //
  // Path is /meta not /_meta: Next.js treats underscore-prefixed folders as
  // private and excludes them from routing — the first attempt 404'd.
  if (pathname === "/api/proxy/meta") {
    return NextResponse.next()
  }

  // Allow Vercel cron endpoints. Vercel's cron scheduler makes
  // unauthenticated GETs to these paths and the auth middleware was
  // 307'ing them to /login — confirmed in production logs after PR #186
  // shipped: every cron tick at :50/:00/:10 logged 307, the backend
  // never got pinged, the Render worker kept cold-cycling, and the IAP
  // calls kept 502'ing as if the cron had never deployed.
  //
  // Safety: these handlers expose no data and only call out to the
  // backend with the project's own credentials. They're read-only
  // warmers — even if hit externally, the only effect is keeping the
  // backend awake, which is exactly their intended job.
  if (pathname.startsWith("/api/cron/")) {
    return NextResponse.next()
  }

  // Allow public static files and Next.js internals, and nothing that merely
  // looks like one. A suffix alone is not an asset: `/api/proxy/s3-buckets/x.png`
  // is a dynamic proxy route and `/inspector/x.png` a dynamic page, and both
  // used to skip the gate. Only reads of top-level files (everything in public/
  // is top-level) and Next internals pass; never anything under /api/.
  if (isPublicStaticRead(request.method, pathname)) {
    return NextResponse.next()
  }

  // Customer-resident builds are authenticated by the private ALB's OIDC
  // action. The task security group accepts UI traffic only from that ALB.
  if (process.env.CYNTRO_DEPLOYMENT_MODE !== "CUSTOMER_RESIDENT") {
    // The site cookie must be a sealed session this server issued at
    // /api/auth/login. The former constant value "authenticated", or any
    // hand-set or tampered value, is refused and cleared.
    const authCookie = request.cookies.get(SITE_SESSION_COOKIE)
    if (!(await siteSessionValid(authCookie?.value))) {
      const response = NextResponse.redirect(new URL("/login", request.url))
      if (authCookie) response.cookies.delete(SITE_SESSION_COOKIE)
      return response
    }
  }

  // Sidebar-only deep links: redirect /<section> → /?section=<section>.
  // We REDIRECT (not rewrite) so useSearchParams in app/page.tsx sees
  // ?section=<id> and routes the SPA to the right view. The URL the
  // user shared (/issues) lands them correctly the first time, and
  // becomes /?section=issues afterwards (which is also re-shareable).
  const trimmed = pathname.replace(/^\//, "").replace(/\/$/, "")
  if (SIDEBAR_ONLY_SECTIONS.has(trimmed)) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    url.searchParams.set("section", trimmed)
    // Preserve any existing query (e.g. ?system=alon-prod) when redirecting.
    searchParams.forEach((v, k) => {
      if (k !== "section") url.searchParams.set(k, v)
    })
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
}
