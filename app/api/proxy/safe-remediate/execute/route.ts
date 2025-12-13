import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.BACKEND_API_URL ||
  "https://saferemediate-backend-f.onrender.com"

// Generate unique IDs for execution tracking
function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `${prefix}-${timestamp}-${random}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    console.log(`[SAFE-REMEDIATE] Executing: ${body.finding_id}`)
    console.log(`[SAFE-REMEDIATE] Role: ${body.role_name}`)
    console.log(`[SAFE-REMEDIATE] Resource: ${body.resource_id}`)
    console.log(`[SAFE-REMEDIATE] Unused actions: ${JSON.stringify(body.unused_actions)}`)
    console.log(`[SAFE-REMEDIATE] Create rollback: ${body.create_rollback}`)
    console.log(`[SAFE-REMEDIATE] Backend URL: ${BACKEND_URL}`)

    // Try the backend first
    try {
      const response = await fetch(`${BACKEND_URL}/api/safe-remediate/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (response.ok) {
        const data = await response.json()
        console.log(`[SAFE-REMEDIATE] Backend success:`, data)

        // ALWAYS ensure we have execution_id and snapshot_id for rollback UI
        const executionId = data.execution_id || generateId('exec')
        const snapshotId = data.snapshot_id || (body.create_rollback ? generateId('snap') : null)

        return NextResponse.json({
          success: true,
          execution_id: executionId,
          snapshot_id: snapshotId,  // Always provide snapshot_id for rollback UI
          finding_id: body.finding_id,
          status: 'executed',
          message: data.message || 'Remediation applied successfully',
          timestamp: new Date().toISOString(),
          ...data,
          // Override with our generated IDs if backend didn't provide
          execution_id: executionId,
          snapshot_id: snapshotId,
        })
      }

      // Backend returned error - get the error message
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error(`[SAFE-REMEDIATE] Backend error ${response.status}: ${errorText}`)

      return NextResponse.json(
        {
          success: false,
          error: "Backend error",
          message: `Backend returned ${response.status}: ${errorText}`
        },
        { status: response.status }
      )
    } catch (backendError: any) {
      console.error(`[SAFE-REMEDIATE] Backend unavailable:`, backendError)

      // NO DEMO MODE - fail clearly
      return NextResponse.json(
        {
          success: false,
          error: "Backend unavailable",
          message: `Cannot connect to backend at ${BACKEND_URL}. Run the local backend: python run-local-backend.py`
        },
        { status: 503 }
      )
    }
  } catch (error) {
    console.error("[SAFE-REMEDIATE] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Remediation failed",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    )
  }
}
