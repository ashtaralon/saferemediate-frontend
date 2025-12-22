import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.BACKEND_API_URL ||
  "https://saferemediate-backend-f.onrender.com"

// Timeout for backend requests (25 seconds, safe under Vercel 30s limit)
const BACKEND_TIMEOUT = 25000

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { finding_id, resource_id, ...options } = body

    if (!finding_id) {
      return NextResponse.json(
        { success: false, error: "finding_id is required" },
        { status: 400 }
      )
    }

    console.log(`[SIMULATE-EXECUTE] Executing remediation for finding: ${finding_id}`)

    // Create abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), BACKEND_TIMEOUT)

    try {
      // Call backend execute endpoint
      const response = await fetch(`${BACKEND_URL}/api/safe-remediate/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finding_id,
          resource_id,
          ...options
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        const data = await response.json()
        console.log(`[SIMULATE-EXECUTE] ✅ Success:`, data)
        return NextResponse.json({ success: true, ...data }, {
          headers: { "X-Proxy": "simulate-execute" }
        })
      }

      // Backend blocked (403) - return blocked status
      if (response.status === 403) {
        const errorData = await response.json().catch(() => ({ detail: "Remediation blocked by policy" }))
        console.log(`[SIMULATE-EXECUTE] ❌ Blocked (403):`, errorData)
        return NextResponse.json({
          success: false,
          blocked: true,
          reason: "protected_role",
          details: errorData.detail || errorData.message || "Remediation blocked by protection policy",
          finding_id,
          timestamp: new Date().toISOString(),
        }, {
          status: 403,
          headers: { "X-Proxy": "simulate-execute-blocked" }
        })
      }

      // Other errors (500, etc.) - return error
      const errorData = await response.json().catch(() => ({ detail: `Backend error: ${response.status}` }))
      console.log(`[SIMULATE-EXECUTE] ❌ Error (${response.status}):`, errorData)
      return NextResponse.json({
        success: false,
        error: errorData.detail || errorData.message || `Backend error: ${response.status}`,
        finding_id,
        timestamp: new Date().toISOString(),
      }, {
        status: response.status,
        headers: { "X-Proxy": "simulate-execute-error" }
      })

    } catch (fetchError: any) {
      clearTimeout(timeoutId)

      if (fetchError.name === 'AbortError') {
        return NextResponse.json(
          { success: false, error: "Request timed out", detail: "Backend did not respond within 25 seconds" },
          { status: 504 }
        )
      }

      console.error("[SIMULATE-EXECUTE] Backend connection failed:", fetchError.message)
      return NextResponse.json(
        { success: false, error: "Backend unavailable", detail: fetchError.message },
        { status: 503 }
      )
    }

  } catch (error) {
    console.error("[SIMULATE-EXECUTE] Error:", error)
    return NextResponse.json(
      { success: false, error: "Execution failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
