import { NextResponse } from "next/server"
import {
  SITE_SESSION_COOKIE,
  SITE_SESSION_MAX_AGE_SECONDS,
  issueSiteSession,
  siteCookieOptions,
  sitePasswordMatches,
} from "@/lib/server/site-session"

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null)
  const password = payload && typeof payload === "object" ? (payload as { password?: unknown }).password : undefined

  if (!process.env.SITE_PASSWORD) {
    return NextResponse.json({ error: "Password not configured" }, { status: 500 })
  }

  if (!(await sitePasswordMatches(password))) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 })
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set(SITE_SESSION_COOKIE, await issueSiteSession(), siteCookieOptions(SITE_SESSION_MAX_AGE_SECONDS))
  return response
}
