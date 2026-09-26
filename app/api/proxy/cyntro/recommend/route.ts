import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const maxDuration = 300

const BACKEND_URL = getBackendBaseUrl()

export async function POST(req: NextRequest) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 295_000)

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
      // The backend's own refusal is the answer: its status and typed body pass through unchanged.
      const errorText = await gapRes.text().catch(() => "")
      let parsed: unknown = null
      try {
        parsed = errorText ? JSON.parse(errorText) : null
      } catch {
        parsed = null
      }
      const refusal = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : { error: `Review returned ${gapRes.status}`, detail: errorText.slice(0, 500) }
      return NextResponse.json(refusal, { status: gapRes.status, headers: { "Cache-Control": "no-store" } })
    }

    const gapData = await gapRes.json()

    // Every number below is the Review's own, or null. The Review carries null counts when usage was not measured
    // (tests/test_lp_unmeasured_rows_visible.py); a `|| 0` here turned "not measured" into "measured zero", and a
    // resource count of max(1, <field the Review does not carry>) was always 1. Nothing is synthesized: the resource
    // count and the per-resource reduction are not in the Review, so they are null (the page derives them from the
    // per-resource analysis it already holds).
    const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null)
    const totalPermissions = num(gapData.summary?.total_permissions)
    const usedCount = num(gapData.summary?.used_count)
    const rows: any[] = Array.isArray(gapData.permissions_analysis) ? gapData.permissions_analysis : []
    const usageMeasured = usedCount !== null
    const usedPermissions = usageMeasured ? rows.filter((p) => p.status === "USED") : []
    const unusedPermissions = usageMeasured ? rows.filter((p) => p.status === "UNUSED") : []
    const aggregatedRiskReduction = totalPermissions !== null && usedCount !== null && totalPermissions > 0
      ? Math.round(((totalPermissions - usedCount) / totalPermissions) * 100)
      : null
    const proposedName = `${role_name}-least-privilege`

    const response = {
      original_role: role_name,
      original_permissions: totalPermissions,
      resources_attached: null,
      aggregated_used: usedCount,
      aggregated_risk_reduction: aggregatedRiskReduction,
      cyntro_risk_reduction: null,
      total_new_permissions: usedCount,
      // A least-privilege policy is proposed only from measured usage; otherwise it is held by name.
      hold_reason: usageMeasured ? null : "USAGE_NOT_MEASURED",
      proposed_roles: usageMeasured ? [{
        role_name: proposedName,
        resource_id: gapData.role_arn,
        resource_name: role_name,
        permissions: usedPermissions.map((p) => p.permission),
        resource_conditions: {},
      }] : [],
      policies: usageMeasured ? {
        [proposedName]: {
          Version: "2012-10-17",
          Statement: [{
            Sid: "LeastPrivilegePolicy",
            Effect: "Allow",
            Action: usedPermissions.map((p) => p.permission),
            Resource: "*",  // In production, this should be scoped to specific resources
          }],
        },
      } : {},
      unused_permissions: unusedPermissions.map((p) => ({
        permission: p.permission,
        risk_level: p.risk_level,
        recommendation: p.recommendation,
      })),
      summary: {
        current_permissions: totalPermissions,
        recommended_permissions: usedCount,
        permissions_to_remove: totalPermissions !== null && usedCount !== null ? totalPermissions - usedCount : null,
        risk_reduction_percentage: aggregatedRiskReduction,
        high_risk_removed: usageMeasured ? unusedPermissions.filter((p) => p.risk_level === "HIGH").length : null,
      },
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
