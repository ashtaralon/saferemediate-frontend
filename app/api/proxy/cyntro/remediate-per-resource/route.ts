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
    const { role_name, dry_run = true } = body

    if (!role_name) {
      return NextResponse.json({ error: "role_name is required" }, { status: 400 })
    }

    console.log(`[PER-RESOURCE-REMEDIATE] Starting per-resource remediation for ${role_name}, dry_run=${dry_run}`)

    // Call the per-resource remediation endpoint
    const res = await fetch(`${BACKEND_URL}/api/remediation/execute-per-resource`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role_name,
        dry_run,
        create_snapshot: true
      }),
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[PER-RESOURCE-REMEDIATE] Backend error ${res.status}: ${errorText}`)
      return NextResponse.json({ error: `Remediation failed: ${res.status}`, detail: errorText }, { status: res.status })
    }

    const data = await res.json()
    console.log(`[PER-RESOURCE-REMEDIATE] Success: ${data.total_resources} resources, dry_run=${data.dry_run}`)

    // Transform response for UI
    const response = {
      success: data.success,
      dry_run: data.dry_run,
      original_role: data.original_role,
      total_resources: data.total_resources,

      // Per-resource results
      resources: data.resources_remediated?.map((r: any) => ({
        resource_id: r.resource_id,
        resource_name: r.resource_name,
        resource_type: r.resource_type,
        permissions_count: r.permissions_count,
        permissions: r.permissions,
        new_role_name: r.new_role_name,
        new_role_arn: r.new_role_arn,
        snapshot_id: r.snapshot_id,
        steps: r.steps
      })) || [],

      // Summary
      summary: {
        before_total_exposure: data.summary?.before_total_exposure || 0,
        after_total_exposure: data.summary?.after_total_exposure || 0,
        reduction_percentage: data.summary?.reduction_percentage || 0
      },

      // Snapshots for rollback
      snapshots: data.snapshots || [],

      // Message
      message: data.dry_run
        ? `[DRY RUN] Would create ${data.total_resources} separate least-privilege roles`
        : `Created ${data.total_resources} separate least-privilege roles`
    }

    return NextResponse.json(response)
  } catch (error: any) {
    clearTimeout(timeoutId)
    console.error("[PER-RESOURCE-REMEDIATE] Error:", error)
    if (error.name === "AbortError") {
      return NextResponse.json({ error: "Timeout" }, { status: 504 })
    }
    return NextResponse.json({ error: error.message }, { status: 503 })
  }
}
