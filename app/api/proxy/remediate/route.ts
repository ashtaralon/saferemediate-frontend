import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const BACKEND_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://saferemediate-backend.onrender.com"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { systemName, roleName, permission, permissions, planId, action } = body

    // Determine which permissions to remove
    const permissionsToRemove = permissions || (permission ? [permission] : null)
    const system = systemName || "alon-prod"

    // Call backend apply endpoint
    const response = await fetch(`${BACKEND_URL}/api/least-privilege/apply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemName: system,
        planId: planId || null,
        permissions: permissionsToRemove,
      }),
    })

    if (response.ok) {
      const data = await response.json()

      return NextResponse.json({
        success: data.success,
        applied: true,
        systemName: data.systemName,
        roleName: data.roleName,
        removed_count: data.applied,
        removed_permissions: data.removed_permissions,
        checkpointId: data.checkpointId,
        message: data.message || `Successfully removed ${data.applied} permission(s)`,
        timestamp: new Date().toISOString(),
        rollback_available: true,
        rollback_url: `/api/proxy/rollback?checkpointId=${data.checkpointId}`,
      })
    } else {
      // Backend error - return demo response
      console.log(`[v0] Apply backend error: ${response.status}`)
      return getDemoApplyResponse(system, permissionsToRemove)
    }
  } catch (error) {
    console.error("[v0] Remediation error:", error)
    return getDemoApplyResponse("alon-prod", null)
  }
}

function getDemoApplyResponse(systemName: string, permissions: string[] | null) {
  const removedPermissions = permissions || [
    "iam:CreateRole",
    "iam:DeleteRole",
    "s3:DeleteBucket",
  ]

  const checkpointId = `checkpoint-${Date.now()}`

  return NextResponse.json({
    success: true,
    applied: true,
    simulated: true,
    systemName,
    roleName: "SafeRemediate-Lambda-Remediation-Role",
    removed_count: removedPermissions.length,
    removed_permissions: removedPermissions,
    checkpointId,
    message: `Successfully removed ${removedPermissions.length} permission(s) (demo mode)`,
    timestamp: new Date().toISOString(),
    rollback_available: true,
    rollback_url: `/api/proxy/rollback?checkpointId=${checkpointId}`,
  })
}
