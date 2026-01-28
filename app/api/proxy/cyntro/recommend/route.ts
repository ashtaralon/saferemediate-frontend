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
    const { role_name, days = 90 } = body

    if (!role_name) {
      return NextResponse.json({ error: "role_name is required" }, { status: 400 })
    }

    // Get gap analysis to build recommendations
    const gapRes = await fetch(`${BACKEND_URL}/api/iam-roles/${encodeURIComponent(role_name)}/gap-analysis?days=${days}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!gapRes.ok) {
      const errorText = await gapRes.text()
      return NextResponse.json({ error: `Engine error: ${gapRes.status}`, detail: errorText }, { status: gapRes.status })
    }

    const gapData = await gapRes.json()

    // Build recommendations based on used permissions
    const usedPermissions = gapData.permissions_analysis?.filter((p: any) => p.status === "USED") || []
    const unusedPermissions = gapData.permissions_analysis?.filter((p: any) => p.status === "UNUSED") || []
    const totalPermissions = gapData.summary?.total_permissions || 0
    const usedCount = usedPermissions.length

    // Generate least-privilege policy
    const leastPrivilegePolicy = {
      Version: "2012-10-17",
      Statement: [{
        Sid: "LeastPrivilegePolicy",
        Effect: "Allow",
        Action: usedPermissions.map((p: any) => p.permission),
        Resource: "*"  // In production, this should be scoped to specific resources
      }]
    }

    // Calculate risk reduction
    const riskReduction = totalPermissions > 0
      ? Math.round(((totalPermissions - usedCount) / totalPermissions) * 100)
      : 0

    const response = {
      original_role: role_name,
      original_permissions: totalPermissions,
      resources_attached: 1,  // From gap analysis - could be enhanced
      aggregated_used: usedCount,
      aggregated_risk_reduction: riskReduction,
      cyntro_risk_reduction: riskReduction,
      total_new_permissions: usedCount,
      proposed_roles: [{
        role_name: `${role_name}-least-privilege`,
        resource_id: gapData.role_arn,
        resource_name: role_name,
        permissions: usedPermissions.map((p: any) => p.permission),
        resource_conditions: {}
      }],
      policies: {
        [`${role_name}-least-privilege`]: leastPrivilegePolicy
      },
      unused_permissions: unusedPermissions.map((p: any) => ({
        permission: p.permission,
        risk_level: p.risk_level,
        recommendation: p.recommendation
      })),
      summary: {
        current_permissions: totalPermissions,
        recommended_permissions: usedCount,
        permissions_to_remove: totalPermissions - usedCount,
        risk_reduction_percentage: riskReduction,
        high_risk_removed: unusedPermissions.filter((p: any) => p.risk_level === "HIGH").length
      }
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
