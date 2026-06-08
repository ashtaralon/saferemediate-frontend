import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName")
  const risk = url.searchParams.get("risk")

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const params = new URLSearchParams()
    if (systemName) params.set("systemName", systemName)
    if (risk) params.set("risk", risk)
    const qs = params.toString() ? `?${params.toString()}` : ""

    const res = await fetch(`${BACKEND_URL}/api/identities/human${qs}`, {
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[proxy] identities/human backend returned ${res.status}: ${errorText}`)
      return NextResponse.json({ error: `Backend error: ${res.status}`, detail: errorText }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[proxy] identities/human error:", error.message)
    if (error.name === "AbortError") {
      return NextResponse.json([], { status: 200 })
    }
    return NextResponse.json({ error: "Backend unavailable", detail: error.message }, { status: 503 })
  }
}
