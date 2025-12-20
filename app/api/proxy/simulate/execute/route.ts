import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.BACKEND_API_URL ||
  "https://saferemediate-backend-f.onrender.com"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { finding_id, ...options } = body
    
    console.log(`[SIMULATE-EXECUTE] Executing remediation for finding: ${finding_id}`)

    // Call backend execute endpoint
    const response = await fetch(`${BACKEND_URL}/api/safe-remediate/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        finding_id,
        ...options
      }),
    })

    if (response.ok) {
      const data = await response.json()
      console.log(`[SIMULATE-EXECUTE] ✅ Success:`, data)
      return NextResponse.json({ success: true, ...data })
    }

    // Handle 403 Forbidden - Protected resource
    if (response.status === 403) {
      const errorData = await response.json().catch(() => ({ detail: 'Access Denied - Resource is protected' }))
      const errorMessage = errorData.detail || errorData.message || 'Access Denied - Role is protected'
      console.log(`[SIMULATE-EXECUTE] Backend returned 403 Forbidden: ${errorMessage}`)
      
      return NextResponse.json(
        {
          success: false,
          error: 'Access Denied',
          message: errorMessage,
          finding_id,
          status: 'forbidden'
        },
        { status: 403 }
      )
    }

    // Handle other error status codes
    if (response.status >= 400) {
      const errorData = await response.json().catch(() => ({ detail: `Request failed with status ${response.status}` }))
      const errorMessage = errorData.detail || errorData.message || `Request failed with status ${response.status}`
      console.log(`[SIMULATE-EXECUTE] Backend returned ${response.status}: ${errorMessage}`)
      
      return NextResponse.json(
        {
          success: false,
          error: 'Remediation Failed',
          message: errorMessage,
          finding_id
        },
        { status: response.status }
      )
    }

    // Backend endpoint not available yet - return simulated success for UI
    console.log(`[SIMULATE-EXECUTE] Backend returned ${response.status}, simulating success`)
    return NextResponse.json({
      success: true,
      simulated: true,
      finding_id,
      status: 'executed',
      message: 'Remediation applied successfully',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[SIMULATE-EXECUTE] Error:", error)
    return NextResponse.json(
      { success: false, error: "Execution failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
