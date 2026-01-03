import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName")

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    // Build backend URL with optional systemName parameter
    let backendUrl = `${BACKEND_URL}/api/least-privilege/roles`
    if (systemName) {
      backendUrl += `?systemName=${encodeURIComponent(systemName)}`
    }

    const res = await fetch(backendUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
      },
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[LP Proxy Roles] Backend returned ${res.status}: ${errorText}`)
      return NextResponse.json(
        { error: `Backend error: ${res.status}`, detail: errorText },
        { status: res.status }
      )
    }

    const data = await res.json()
    console.log(`[LP Proxy Roles] Fetched ${Array.isArray(data) ? data.length : 0} roles`)
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[LP Proxy Roles] Error:", error.message)

    if (error.name === "AbortError") {
      // Return empty array instead of error
      return NextResponse.json([], { status: 200 })
    }

    return NextResponse.json(
      { error: "Backend unavailable", detail: error.message },
      { status: 503 }
    )
  }
}

