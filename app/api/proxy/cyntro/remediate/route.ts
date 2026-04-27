import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const maxDuration = 300

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export async function POST(req: NextRequest) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 300000)

  try {
    const body = await req.json()
    const {
      role_name,
      identity_type,
      resource_id,
      resource_type,
      dry_run = false,  // Changed default to false for direct modify
      create_snapshot = true,
      detach_managed_policies = true,  // Enable by default for managed policies
      detach_all_managed_policies = false,  // Detach ALL policies regardless of overlap
      permissions_to_remove,  // Optional: specific permissions to remove
      ...rest
    } = body

    if (!role_name) {
      return NextResponse.json({ error: "role_name is required" }, { status: 400 })
    }

    if (permissions_to_remove !== undefined && !Array.isArray(permissions_to_remove)) {
      return NextResponse.json({ error: "permissions_to_remove must be an array when provided" }, { status: 400 })
    }

    console.log(`[CYNTRO-REMEDIATE] Starting remediation for: ${role_name}`)
    console.log(`[CYNTRO-REMEDIATE] Options: dry_run=${dry_run}, create_snapshot=${create_snapshot}, detach_managed_policies=${detach_managed_policies}, detach_all=${detach_all_managed_policies}`)

    // First get gap analysis for permission info
    const gapPrefix = identity_type === 'user' ? '/api/iam-users' : '/api/iam-roles'
    const gapRes = await fetch(`${BACKEND_URL}${gapPrefix}/${encodeURIComponent(role_name)}/gap-analysis?days=90`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })

    if (!gapRes.ok) {
      return NextResponse.json({ error: "Failed to get role analysis" }, { status: 500 })
    }

    const gapData = await gapRes.json()
    const usedPermissions = gapData.used_permissions || []
    const unusedPermissions = gapData.unused_permissions || []

    const explicitPermissions = Array.isArray(permissions_to_remove)
      ? Array.from(new Set(
          permissions_to_remove
            .map((perm: unknown) => String(perm || "").trim())
            .filter(Boolean)
        ))
      : null

    if (!dry_run && (!explicitPermissions || explicitPermissions.length === 0)) {
      return NextResponse.json(
        {
          error: "permissions_to_remove is required for live IAM remediation",
          detail: "Refusing to default to the full unused-permission set during execution. Pass the exact permission list chosen by the user.",
        },
        { status: 400 }
      )
    }

    // Dry runs may still preview the backend's current unused set, but live execution must be explicit.
    const permsToRemove = explicitPermissions ?? unusedPermissions

    console.log(`[CYNTRO-REMEDIATE] Permissions to remove: ${permsToRemove.length}`)

    // Use the DIRECT IAM remediation endpoint that modifies AWS IAM policies
    // This endpoint:
    // 1. Creates a snapshot before changes
    // 2. Modifies inline policies directly
    // 3. Detaches managed policies if detach_managed_policies=true
    // 4. Updates Neo4j after changes
    const remediatePrefix = identity_type === 'user' ? '/api/iam-users' : '/api/iam-roles'
    const res = await fetch(`${BACKEND_URL}${remediatePrefix}/remediate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role_name,
        identity_type: identity_type || 'role',
        permissions_to_remove: permsToRemove,
        dry_run,
        create_snapshot,
        detach_managed_policies,  // CRITICAL: Enables removal of AWS managed policies
        detach_all_managed_policies,  // Detach ALL regardless of permission overlap
        ...rest
      }),
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    console.log(`[CYNTRO-REMEDIATE] Response status: ${res.status}`)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[CYNTRO-REMEDIATE] Error: ${res.status} - ${errorText}`)
      return NextResponse.json({ error: `Remediation failed: ${res.status}`, detail: errorText }, { status: res.status })
    }

    const remediateData = await res.json()
    console.log(`[CYNTRO-REMEDIATE] Success response:`, JSON.stringify(remediateData, null, 2))

    // Handle safety gate blocks — pass through the blocked reason clearly
    if (remediateData.blocked) {
      return NextResponse.json({
        success: false,
        blocked: true,
        block_reason: remediateData.block_reason || remediateData.message || "Remediation blocked by safety gate",
        message: remediateData.message || "Remediation blocked",
        action_required: remediateData.action_required,
        confidence: remediateData.confidence,
        warnings: remediateData.warnings || [],
      })
    }

    // Transform response for UI
    const beforeTotal = gapData.summary?.total_permissions || gapData.allowed_count || (usedPermissions.length + unusedPermissions.length)
    const removedPermissions = typeof remediateData.permissions_removed === 'number'
      ? remediateData.permissions_removed
      : (remediateData.total_permissions_removed || permsToRemove.length)
    const afterTotal = typeof remediateData.after_total === 'number'
      ? remediateData.after_total
      : Math.max(0, beforeTotal - removedPermissions)

    const response = {
      dry_run,
      success: remediateData.success !== false,
      message: remediateData.message || `Removed ${removedPermissions} permissions`,
      snapshot_id: remediateData.snapshot_id,
      event_id: remediateData.event_id || remediateData.execution_id || null,
      rollback_available: !!(remediateData.snapshot_id || remediateData.event_id || remediateData.execution_id),

      // Direct remediation info (modified in place, no new role)
      permissions_removed: removedPermissions,
      managed_policies_detached: remediateData.managed_policies_detached || [],
      inline_policies_modified: remediateData.inline_policies_modified || [],

      // Steps with status
      steps: remediateData.steps || [],

      // Summary
      summary: {
        before_total: beforeTotal,
        after_total: afterTotal,
        reduction: removedPermissions,
        unused_removed: removedPermissions,
        reduction_percentage: (removedPermissions / Math.max(1, beforeTotal)) * 100
      },

      // Raw data for debugging
      raw_response: remediateData
    }

    return NextResponse.json(response)
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === "AbortError") {
      return NextResponse.json({ error: "Timeout" }, { status: 504 })
    }
    return NextResponse.json({ error: error.message }, { status: 503 })
  }
}
