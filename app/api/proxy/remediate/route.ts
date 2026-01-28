import { type NextRequest, NextResponse } from "next/server"

const BACKEND_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { roleName, permission, action, finding_id, resource_id, resource_type, dry_run, ...rest } = body

    // Determine if this is an IAM role based on resource_id or finding_id
    const isIAMRole = resource_id?.includes(':role/') ||
                      finding_id?.includes(':role/') ||
                      resource_type === 'IAM_ROLE'

    // Extract role name from ARN if needed
    let role_name = roleName
    if (!role_name && resource_id?.includes(':role/')) {
      role_name = resource_id.split('/').pop()
    } else if (!role_name && finding_id?.includes(':role/')) {
      role_name = finding_id.split('/').pop()
    }

    if (isIAMRole && role_name) {
      // Get gap analysis to find unused permissions
      const gapRes = await fetch(`${BACKEND_URL}/api/iam-roles/${encodeURIComponent(role_name)}/gap-analysis?days=90`)

      let permissions_to_remove: string[] = []
      if (gapRes.ok) {
        const gapData = await gapRes.json()
        permissions_to_remove = gapData.permissions_analysis
          ?.filter((p: any) => p.status === "UNUSED")
          ?.map((p: any) => p.permission) || []
      }

      // Call IAM roles remediate endpoint
      const response = await fetch(`${BACKEND_URL}/api/iam-roles/remediate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role_name,
          permissions_to_remove: permission ? [permission] : permissions_to_remove,
          dry_run: dry_run || false,
          ...rest
        }),
      })

      if (response.ok) {
        const data = await response.json()
        return NextResponse.json({
          success: true,
          message: data.message || `Remediated ${data.permissions_removed || 0} permissions`,
          snapshot_id: data.snapshot_id,
          ...data,
        })
      } else {
        const errorData = await response.json().catch(() => ({ error: `Backend returned ${response.status}` }))
        return NextResponse.json({
          success: false,
          error: errorData.detail || errorData.error || `Backend returned ${response.status}`,
        }, { status: response.status })
      }
    }

    // For security groups or other resource types, try safe-remediate
    const response = await fetch(`${BACKEND_URL}/api/safe-remediate/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        finding_id,
        resource_id,
        ...rest
      }),
    })

    if (response.ok) {
      const data = await response.json()
      return NextResponse.json({
        success: true,
        message: "Remediation completed",
        ...data,
      })
    } else {
      const errorData = await response.json().catch(() => ({ error: `Backend returned ${response.status}` }))
      return NextResponse.json({
        success: false,
        error: errorData.detail || errorData.error || `Backend returned ${response.status}`,
      }, { status: response.status })
    }
  } catch (error) {
    console.error("[proxy] Remediation error:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Remediation failed",
    }, { status: 500 })
  }
}
