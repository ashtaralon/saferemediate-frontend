import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { system_name, region } = body

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 second timeout for analysis

    const backendUrl = `${BACKEND_URL}/api/security-groups/scan-v2`

    const res = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        system_name: system_name || "alon-prod",
        region: region || "eu-west-1",
      }),
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[proxy] security-groups/scan-v2 backend returned ${res.status}: ${errorText}`)
      
      let errorData: any = { detail: `Backend returned ${res.status}` }
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { detail: errorText || `Backend returned ${res.status}` }
      }

      return NextResponse.json(
        { error: errorData.detail || errorData.message || `Analysis failed: ${res.status}` },
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
    console.error("[proxy] security-groups/scan-v2 error:", error)
    
    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Request timeout. Analysis is taking longer than expected." },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

