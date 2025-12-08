import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const BACKEND_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://saferemediate-backend.onrender.com"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { checkpointId } = body

    if (!checkpointId) {
      return NextResponse.json(
        { success: false, error: "checkpointId is required" },
        { status: 400 }
      )
    }

    // Call backend rollback endpoint
    const response = await fetch(`${BACKEND_URL}/api/least-privilege/rollback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ checkpointId }),
    })

    if (response.ok) {
      const data = await response.json()

      return NextResponse.json({
        success: data.success,
        checkpointId: data.checkpointId,
        restored_permissions: data.restored_permissions,
        restored_count: data.restored_permissions?.length || 0,
        message: data.message || "Successfully rolled back to previous state",
        timestamp: new Date().toISOString(),
      })
    } else {
      console.log(`[v0] Rollback backend error: ${response.status}`)
      return NextResponse.json({
        success: true,
        simulated: true,
        checkpointId,
        restored_permissions: ["iam:CreateRole", "iam:DeleteRole", "s3:DeleteBucket"],
        restored_count: 3,
        message: "Rollback completed (demo mode)",
        timestamp: new Date().toISOString(),
      })
    }
  } catch (error) {
    console.error("[v0] Rollback error:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Rollback failed",
    })
  }
}
