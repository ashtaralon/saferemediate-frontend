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

    // Validate required fields
    if (!body.execution_id && !body.snapshot_id && !body.finding_id) {
      return NextResponse.json(
        {
          success: false,
          error: "Rollback failed",
          detail: "No execution_id, snapshot_id, or finding_id provided"
        },
        { status: 400 }
      )
    }

    console.log(`[ROLLBACK] Rolling back execution: ${body.execution_id}`)
    console.log(`[ROLLBACK] Snapshot ID: ${body.snapshot_id}`)
    console.log(`[ROLLBACK] Finding ID: ${body.finding_id}`)

    // Create abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), BACKEND_TIMEOUT)

    try {
      const response = await fetch(`${BACKEND_URL}/api/safe-remediate/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        console.error(`[ROLLBACK] Backend returned ${response.status}: ${errorText}`)
        return NextResponse.json(
          {
            success: false,
            error: `Backend error: ${response.status}`,
            detail: errorText
          },
          { status: response.status }
        )
      }

      const data = await response.json()
      console.log(`[ROLLBACK] Backend success:`, data)
      return NextResponse.json({
        success: true,
        message: data.message || 'Rollback completed successfully',
        ...data
      })

    } catch (fetchError: any) {
      clearTimeout(timeoutId)

      if (fetchError.name === 'AbortError') {
        return NextResponse.json(
          {
            success: false,
            error: "Request timed out",
            detail: "Backend did not respond within 25 seconds"
          },
          { status: 504 }
        )
      }

      console.error(`[ROLLBACK] Backend connection failed:`, fetchError.message)
      return NextResponse.json(
        {
          success: false,
          error: "Backend unavailable",
          detail: fetchError.message
        },
        { status: 503 }
      )
    }

  } catch (error) {
    console.error("[ROLLBACK] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Rollback failed",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    )
  }
}
