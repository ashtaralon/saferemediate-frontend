import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

// Pass through all known query params so the client can use the full
// filter surface (min_principals, system_name, cross_system_only,
// include_stale, include_inactive).
const ALLOWED_PARAMS = [
  "min_principals",
  "system_name",
  "cross_system_only",
  "include_stale",
  "include_inactive",
] as const

export async function GET(req: NextRequest) {
  const inUrl = new URL(req.url)
  const qs = new URLSearchParams()
  for (const k of ALLOWED_PARAMS) {
    const v = inUrl.searchParams.get(k)
    if (v !== null) qs.set(k, v)
  }

  const backendUrl = `${BACKEND_URL}/api/iam/shared-roles${qs.toString() ? `?${qs}` : ""}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    const res = await fetch(backendUrl, {
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[proxy] iam/shared-roles backend ${res.status}: ${errorText}`)
      return NextResponse.json(
        { error: `Backend error: ${res.status}`, detail: errorText },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    clearTimeout(timeoutId)
    console.error("[proxy] iam/shared-roles error:", error.message)

    if (error.name === "AbortError") {
      return NextResponse.json(
        {
          shared_roles: [],
          as_of: new Date().toISOString(),
          filters: {},
          count: 0,
          timeout: true,
          message: "Shared-roles discovery is taking longer than expected",
        },
        { status: 200 }
      )
    }

    return NextResponse.json(
      { error: "Backend unavailable", detail: error.message },
      { status: 503 }
    )
  }
}
