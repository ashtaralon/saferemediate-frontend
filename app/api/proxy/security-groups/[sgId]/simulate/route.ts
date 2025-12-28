import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export async function POST(
  req: NextRequest,
  { params }: { params: { sgId: string } }
) {
  try {
    const { sgId } = params
    const body = await req.json()

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    const backendUrl = `${BACKEND_URL}/api/security-groups/${sgId}/simulate`

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

