import { NextRequest, NextResponse } from "next/server"
import { coerceProxyErrorMessage } from "@/lib/proxy-error-message"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

const BACKEND_URL =
  getBackendBaseUrl()

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const days = url.searchParams.get("days") || "7"
    const skipFlowLogs = url.searchParams.get("skip_flow_logs") === "true"

    const backendParams = new URLSearchParams({ days })
    if (skipFlowLogs) {
      backendParams.set("skip_flow_logs", "true")
    }

    console.log(`[Collectors Proxy] Starting async sync-all (${days} days, skip_flow_logs=${skipFlowLogs})...`)

    const response = await fetch(`${BACKEND_URL}/api/collectors/sync-all/start?${backendParams.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(30000), // 30 second timeout for starting the job
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Collectors Proxy] Backend error: ${response.status}`, errorText)
      // The backend's own sentence beats "Backend returned 503". Parse when
      // it is JSON; keep the raw text as `detail` either way so nothing is
      // lost for debugging.
      let errorBody: unknown = null
      try {
        errorBody = JSON.parse(errorText)
      } catch {
        errorBody = null
      }
      return NextResponse.json(
        {
          success: false,
          error: coerceProxyErrorMessage(
            errorBody,
            errorText || `Backend returned ${response.status}`,
          ),
          detail: errorText,
        },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log("[Collectors Proxy] Sync job started:", data)

    return NextResponse.json(data)
  } catch (error: any) {
    console.error("[Collectors Proxy] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to start sync job",
      },
      { status: 500 }
    )
  }
}
