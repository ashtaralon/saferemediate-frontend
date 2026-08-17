import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// Abort fires at 120s, 5s under this, so the catch
// block still runs and can degrade honestly instead of the platform
// returning a raw 504. Above the 60s project default in vercel.json,
// which this export overrides.
export const maxDuration = 125

const BACKEND_URL =
  getBackendBaseUrl()

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    
    console.log("[proxy] remediation/execute request:", body.sg_id)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120000) // 2 minute timeout for execution

    const backendUrl = `${BACKEND_URL}/api/remediation/execute`
    console.log("[proxy] remediation/execute -> " + backendUrl)

    const response = await fetch(backendUrl, {
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

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[proxy] remediation/execute backend error " + response.status + ": " + errorText)
      
      let errorData: any = { detail: "Backend returned " + response.status }
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { detail: errorText || "Execution failed" }
      }

      return NextResponse.json(
        { error: errorData.detail || errorData.message || "Execution failed", success: false },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log("[proxy] remediation/execute success:", data.success, "results:", data.results?.length)

    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  } catch (error: any) {
    console.error("[proxy] remediation/execute error:", error)

    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Request timeout. Execution is taking longer than expected.", success: false },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Internal server error", success: false },
      { status: 500 }
    )
  }
}




