import { requireBackendUrl } from "@/lib/backend-url";
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

// Abort fires at 120s, 5s under this, so the catch
// block still runs and can degrade honestly instead of the platform
// returning a raw 504. Above the 60s project default in vercel.json,
// which this export overrides.
export const maxDuration = 125

const BACKEND_URL =
  requireBackendUrl()

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ collector: string }> }
) {
  try {
    const { collector } = await params

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120000) // 120 second timeout for collectors

    const backendUrl = `${BACKEND_URL}/api/collectors/run/${collector}`

    console.log(`[proxy] collectors/run/${collector} -> ${backendUrl}`)

    const res = await fetch(backendUrl, {
      method: "POST",
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
      console.error(`[proxy] collectors/run/${collector} backend returned ${res.status}: ${errorText}`)

      let errorData: any = { detail: `Backend returned ${res.status}` }
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { detail: errorText || `Backend returned ${res.status}` }
      }

      return NextResponse.json(
        { error: errorData.detail || errorData.message || `Collector failed: ${res.status}` },
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
    console.error("[proxy] collectors/run/[collector] error:", error)
    
    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Request timeout. Collector is taking longer than expected." },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

