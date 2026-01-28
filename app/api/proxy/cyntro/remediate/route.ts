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
    const { role_name, resource_id, resource_type, dry_run = true, ...rest } = body

    if (!role_name) {
      return NextResponse.json({ error: "role_name is required" }, { status: 400 })
    }

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

    // Use real AWS remediation endpoint
    const res = await fetch(`${BACKEND_URL}/api/remediation/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role_name,
        resource_id,
        resource_type,
        permissions: usedPermissions,
        dry_run,
        create_snapshot: true,
        ...rest
      }),
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      return NextResponse.json({ error: `Remediation failed: ${res.status}`, detail: errorText }, { status: res.status })
    }

    const remediateData = await res.json()

    // Transform response for UI
    const response = {
      dry_run,
      success: remediateData.success,
      message: remediateData.message,
      snapshot_id: remediateData.snapshot_id,
      rollback_available: remediateData.rollback_available,

      // New role info
      new_role: {
        name: remediateData.new_role_name,
        arn: remediateData.new_role_arn,
        policy_name: remediateData.new_policy_name,
        policy_arn: remediateData.new_policy_arn,
        permissions: remediateData.permissions,
        permissions_count: remediateData.permissions_count
      },

      // Policy document for preview
      policy_document: remediateData.policy_document,

      // Steps with status
      steps: remediateData.steps || [],

      // Summary
      summary: {
        before_total: gapData.summary?.total_permissions || 0,
        after_total: remediateData.permissions_count || usedPermissions.length,
        reduction: (gapData.summary?.total_permissions || 0) - (remediateData.permissions_count || usedPermissions.length),
        unused_removed: unusedPermissions.length
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
