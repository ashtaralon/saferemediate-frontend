import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const maxDuration = 300

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com"

export async function POST(req: NextRequest) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 300000)

  try {
    const body = await req.json()
    const {
      role_name,
      resource_id,
      resource_type,
      dry_run = false,  // Changed default to false for direct modify
      create_snapshot = true,
      detach_managed_policies = true,  // Enable by default for managed policies
      permissions_to_remove,  // Optional: specific permissions to remove
      ...rest
    } = body

    if (!role_name) {
      return NextResponse.json({ error: "role_name is required" }, { status: 400 })
    }

    console.log(`[CYNTRO-REMEDIATE] Starting remediation for: ${role_name}`)
    console.log(`[CYNTRO-REMEDIATE] Options: dry_run=${dry_run}, create_snapshot=${create_snapshot}, detach_managed_policies=${detach_managed_policies}`)

    // First get gap analysis for permission info
    const gapRes = await fetch(`${BACKEND_URL}/api/iam-roles/${encodeURIComponent(role_name)}/gap-analysis?days=90`, {
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

    // Use the permissions_to_remove if provided, otherwise use all unused permissions
    const permsToRemove = permissions_to_remove || unusedPermissions

    console.log(`[CYNTRO-REMEDIATE] Permissions to remove: ${permsToRemove.length}`)

    // Use the DIRECT IAM remediation endpoint that modifies AWS IAM policies
    // This endpoint:
    // 1. Creates a snapshot before changes
    // 2. Modifies inline policies directly
    // 3. Detaches managed policies if detach_managed_policies=true
    // 4. Updates Neo4j after changes
    const res = await fetch(`${BACKEND_URL}/api/iam-roles/remediate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role_name,
        permissions_to_remove: permsToRemove,
        dry_run,
        create_snapshot,
        detach_managed_policies,  // CRITICAL: Enables removal of AWS managed policies
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

    // Transform response for UI
    // The /api/iam-roles/remediate endpoint returns:
    // - success: boolean
    // - snapshot_id: string (SNAP-xxx format)
    // - permissions_removed: number
    // - managed_policies_detached: string[]
    // - inline_policies_modified: string[]
    // - message: string
    const response = {
      dry_run,
      success: remediateData.success !== false,  // Default to true if not explicitly false
      message: remediateData.message || `Removed ${remediateData.permissions_removed || permsToRemove.length} permissions`,
      snapshot_id: remediateData.snapshot_id,
      rollback_available: !!remediateData.snapshot_id,

      // Direct remediation info (modified in place, no new role)
      permissions_removed: remediateData.permissions_removed || permsToRemove.length,
      managed_policies_detached: remediateData.managed_policies_detached || [],
      inline_policies_modified: remediateData.inline_policies_modified || [],

      // Steps with status
      steps: remediateData.steps || [],

      // Summary
      summary: {
        before_total: gapData.summary?.total_permissions || gapData.allowed_count || (usedPermissions.length + unusedPermissions.length),
        after_total: usedPermissions.length,
        reduction: permsToRemove.length,
        unused_removed: permsToRemove.length,
        reduction_percentage: ((permsToRemove.length) / Math.max(1, gapData.summary?.total_permissions || gapData.allowed_count || 1)) * 100
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
