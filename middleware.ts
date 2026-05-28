import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

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

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Allow the login page and login API
  if (pathname === "/login" || pathname === "/api/auth/login") {
    return NextResponse.next()
  }

  // Allow the backend-url diagnostic endpoint so it can be curl'd from
  // CI or local terminal to verify which backend a deploy is pointing at.
  // Returns no secrets — just the resolved URL + VERCEL_ENV/NODE_ENV.
  // The fail-loud guard in lib/server/backend-url.ts is the real safety net;
  // this endpoint is the human-readable second opinion.
  if (pathname === "/api/proxy/_meta") {
    return NextResponse.next()
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/apple-icon") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico")
  ) {
    return NextResponse.next()
  }

  // Check for auth cookie
  const authCookie = request.cookies.get("cyntro_auth")
  if (authCookie?.value !== "authenticated") {
    const loginUrl = new URL("/login", request.url)
    return NextResponse.redirect(loginUrl)
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
