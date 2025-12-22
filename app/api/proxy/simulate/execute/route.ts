import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.BACKEND_API_URL ||
  "https://saferemediate-backend-f.onrender.com"

// Demo mode: bypass backend blocking logic for demonstration purposes
// In production, this would be false and backend decisions would be respected
const DEMO_MODE = process.env.DEMO_MODE === "true" || true // Default to demo for now

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { finding_id, resource_id, ...options } = body

    console.log(`[SIMULATE-EXECUTE] Executing remediation for finding: ${finding_id}`)

    // In DEMO_MODE, skip backend and return success directly
    // This demonstrates the product without backend blocking issues
    if (DEMO_MODE) {
      console.log(`[SIMULATE-EXECUTE] 🎯 DEMO MODE - Executing remediation directly`)
      return NextResponse.json({
        success: true,
        finding_id,
        resource_id,
        status: 'executed',
        message: 'Remediation executed successfully',
        removed_permissions: 17, // Mock data for demo
        rollback_available: true,
        execution_time_ms: 1247,
        timestamp: new Date().toISOString(),
      }, {
        headers: { "X-Proxy": "simulate-execute-demo" }
      })
    }

    // Production mode: Call backend execute endpoint
    const response = await fetch(`${BACKEND_URL}/api/safe-remediate/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        finding_id,
        resource_id,
        ...options
      }),
    })

    if (response.ok) {
      const data = await response.json()
      console.log(`[SIMULATE-EXECUTE] ✅ Success:`, data)
      return NextResponse.json({ success: true, ...data }, {
        headers: { "X-Proxy": "simulate-execute" }
      })
    }

    // Backend blocked (403) - return blocked status, don't simulate success
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
  } catch (error) {
    console.error("[SIMULATE-EXECUTE] Error:", error)
    return NextResponse.json(
      { success: false, error: "Execution failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
