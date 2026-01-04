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

    console.log(`[ROLLBACK] Rolling back execution: ${body.execution_id}`)
    console.log(`[ROLLBACK] Snapshot ID: ${body.snapshot_id}`)
    console.log(`[ROLLBACK] Finding ID: ${body.finding_id}`)

    // Try the backend first
    try {
      const response = await fetch(`${BACKEND_URL}/api/safe-remediate/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (response.ok) {
        const data = await response.json()
        console.log(`[ROLLBACK] Backend success:`, data)
        return NextResponse.json({
          success: true,
          message: data.message || 'Rollback completed successfully',
          ...data
        })
      }

      // If backend returns error, return error (no mock data)
      const errorData = await response.json().catch(() => ({ error: `Backend returned ${response.status}` }))
      return NextResponse.json({
        success: false,
        error: errorData.error || errorData.message || `Backend returned ${response.status}`,
      }, { status: response.status })
    } catch (backendError) {
      console.error(`[ROLLBACK] Backend unavailable:`, backendError)
      // Return error (no mock data)
      return NextResponse.json({
        success: false,
        error: "Backend unavailable",
        message: backendError instanceof Error ? backendError.message : "Unknown error"
      }, { status: 503 })
    }
  } catch (error) {
    console.error("[ROLLBACK] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Rollback failed",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    )
  }
}
