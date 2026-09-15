import { NextResponse } from "next/server"
import { OPERATOR_SESSION_COOKIE, sessionCookieOptions } from "@/lib/server/operator-session"

export const dynamic = "force-dynamic"

export async function POST() {
  const response = NextResponse.json({ signed_in: false }, { headers: { "Cache-Control": "no-store" } })
  response.cookies.set(OPERATOR_SESSION_COOKIE, "", sessionCookieOptions(0))
  return response
}
