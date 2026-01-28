import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 60000)

  try {
    const roleFilter = req.nextUrl.searchParams.get("role_filter") || ""
    const url = roleFilter
      ? `${BACKEND_URL}/api/scan?role_filter=${encodeURIComponent(roleFilter)}`
      : `${BACKEND_URL}/api/scan`

    const res = await fetch(url, { cache: "no-store", signal: controller.signal })
    clearTimeout(timeoutId)

    if (!res.ok) {
      return NextResponse.json({ error: `Engine error: ${res.status}` }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === "AbortError") {
      return NextResponse.json({ error: "Timeout" }, { status: 504 })
    }
    return NextResponse.json({ error: error.message }, { status: 503 })
  }
}
