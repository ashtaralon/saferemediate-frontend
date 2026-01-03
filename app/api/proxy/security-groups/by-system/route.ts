import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0
export const maxDuration = 30 // Increase timeout for Render cold starts

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const systemName = searchParams.get("system_name")

    if (!systemName) {
      return NextResponse.json(
        { error: "system_name is required" },
        { status: 400 }
      )
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    const backendUrl = `${BACKEND_URL}/api/security-groups/by-system?system_name=${encodeURIComponent(systemName)}`

    console.log(`[proxy] security-groups/by-system -> ${backendUrl}`)

    const res = await fetch(backendUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[proxy] security-groups/by-system backend returned ${res.status}: ${errorText}`)
      return NextResponse.json(
        { error: `Backend returned ${res.status}`, security_groups: [] },
        { status: res.status }
      )
    }

    const data = await res.json()

    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  } catch (error: any) {
    console.error("[proxy] security-groups/by-system error:", error)
    
    return NextResponse.json({
      security_groups: [],
      error: true,
      message: error.name === "AbortError" ? "Request timed out" : error.message
    }, { status: 200 })
  }
}

