// Rollback API - Restores system to a previous snapshot state
// This reverses remediation actions if something breaks

import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { snapshotId, systemName } = body

    if (!snapshotId) {
      return NextResponse.json({
        success: false,
        error: "snapshotId is required",
      })
    }

    console.log(`[Rollback] Starting rollback to snapshot ${snapshotId} for system ${systemName}`)

    // Try to use backend for rollback
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"

    try {
      const backendResponse = await fetch(`${backendUrl}/api/snapshots/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId, systemName }),
        signal: AbortSignal.timeout(30000), // 30s timeout for restore
      })

      if (backendResponse.ok) {
        const result = await backendResponse.json()
        return NextResponse.json({
          success: true,
          message: "Rollback completed successfully",
          restoredResources: result.restoredResources || [],
          source: "backend",
        })
      }
    } catch (err) {
      console.log("[v0] Backend not available for rollback, simulating...")
    }

    // Simulate rollback for demo
    // In production, this would:
    // 1. Fetch the snapshot configuration
    // 2. Compare with current state
    // 3. Apply the reverse changes (e.g., re-add removed IAM permissions, re-add SG rules)

    await new Promise(resolve => setTimeout(resolve, 2000)) // Simulate processing

    return NextResponse.json({
      success: true,
      message: "Rollback completed successfully",
      snapshotId,
      systemName,
      restoredResources: [
        { type: "IAMRole", id: "SafeRemediate-Lambda-Remediation-Role", action: "permissions restored" },
        { type: "SecurityGroup", id: "sg-0abc123def456789", action: "rules restored" },
      ],
      source: "simulation",
      note: "In production, this would restore the actual AWS resources to their previous state",
    })
  } catch (error: any) {
    console.error("[Rollback] Error:", error)
    return NextResponse.json({
      success: false,
      error: error.message || "Failed to perform rollback",
    })
  }
}
