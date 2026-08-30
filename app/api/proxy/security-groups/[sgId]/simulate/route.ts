import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  getBackendBaseUrl()

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sgId: string }> }
) {
  try {
    const { sgId } = await params
    const body = await req.json()

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    const scopeParams = new URLSearchParams()
    const accountId = req.nextUrl.searchParams.get("account_id")
    const region = req.nextUrl.searchParams.get("region")
    if (accountId) scopeParams.set("account_id", accountId)
    if (region) scopeParams.set("region", region)
    const query = scopeParams.toString()
    const backendUrl = `${BACKEND_URL}/api/security-groups/${encodeURIComponent(sgId)}/simulate${
      query ? `?${query}` : ""
    }`

    console.log(`[proxy] security-groups/${sgId}/simulate -> ${backendUrl}`)

    const res = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[proxy] security-groups/${sgId}/simulate backend returned ${res.status}: ${errorText}`)

      let errorData: any = { detail: `Backend returned ${res.status}` }
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { detail: errorText || `Backend returned ${res.status}` }
      }

      return NextResponse.json(
        { error: errorData.detail || errorData.message || `Simulation failed: ${res.status}` },
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
    console.error("[proxy] security-groups/[sgId]/simulate error:", error)
    
    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Request timeout. Simulation is taking longer than expected." },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
