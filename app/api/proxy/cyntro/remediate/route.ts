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
    const { role_name, proposed_permissions, dry_run = false, ...rest } = body

    if (!role_name) {
      return NextResponse.json({ error: "role_name is required" }, { status: 400 })
    }

    // First get gap analysis to find permissions to remove
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

    // Get unused permissions to remove
    const unusedPermissions = gapData.permissions_analysis
      ?.filter((p: any) => p.status === "UNUSED")
      ?.map((p: any) => p.permission) || []

    // Call IAM roles remediate endpoint
    const res = await fetch(`${BACKEND_URL}/api/iam-roles/remediate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role_name,
        permissions_to_remove: unusedPermissions,
        dry_run,
        ...rest
      }),
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      return NextResponse.json({ error: `Engine error: ${res.status}`, detail: errorText }, { status: res.status })
    }

    const remediateData = await res.json()

    // Transform response for per-resource analysis UI
    const response = {
      dry_run,
      steps: [
        {
          action: "analyze",
          target: role_name,
          status: "completed",
          details: `Analyzed ${gapData.summary?.total_permissions || 0} permissions`
        },
        {
          action: "identify_unused",
          target: role_name,
          status: "completed",
          details: `Found ${unusedPermissions.length} unused permissions`
        },
        {
          action: dry_run ? "dry_run_remove" : "remove_permissions",
          target: role_name,
          status: remediateData.success ? "completed" : "failed",
          details: remediateData.message || `Removed ${remediateData.permissions_removed || 0} permissions`
        }
      ],
      summary: {
        before_total: gapData.summary?.total_permissions || 0,
        after_total: (gapData.summary?.total_permissions || 0) - (remediateData.permissions_removed || 0),
        reduction: remediateData.permissions_removed || 0
      },
      snapshot_id: remediateData.snapshot_id,
      success: remediateData.success,
      message: remediateData.message,
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
