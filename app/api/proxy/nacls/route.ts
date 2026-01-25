import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName") ?? "alon-prod"

  console.log(`[NACLs Proxy] Fetching NACLs for ${systemName}`)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    // Try the backend NACL endpoint
    const backendUrl = `${BACKEND_URL}/api/nacls?system_name=${encodeURIComponent(systemName)}`

    const res = await fetch(backendUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })

    clearTimeout(timeoutId)

    if (res.ok) {
      const data = await res.json()
      console.log(`[NACLs Proxy] Success: ${data.nacls?.length || 0} NACLs`)
      return NextResponse.json(data)
    }

    // If backend doesn't have the endpoint, return empty NACLs
    console.log(`[NACLs Proxy] Backend returned ${res.status}, returning empty NACLs`)
    return NextResponse.json({
      nacls: [],
      message: "NACL data not available from backend"
    })

  } catch (error: any) {
    console.error(`[NACLs Proxy] Error:`, error.message)

    // Return empty NACLs on error (non-critical data)
    return NextResponse.json({
      nacls: [],
      error: error.message
    })
  }
}
