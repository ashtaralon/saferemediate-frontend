import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName")

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const params = systemName ? `?systemName=${encodeURIComponent(systemName)}` : ""
    const res = await fetch(`${BACKEND_URL}/api/identities/overview${params}`, {
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[proxy] identities/overview backend returned ${res.status}: ${errorText}`)
      return NextResponse.json({ error: `Backend error: ${res.status}`, detail: errorText }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[proxy] identities/overview error:", error.message)
    if (error.name === "AbortError") {
      return NextResponse.json({ total_identities: 0, timeout: true, message: "Request timed out" }, { status: 200 })
    }
    return NextResponse.json({ error: "Backend unavailable", detail: error.message }, { status: 503 })
  }
}
