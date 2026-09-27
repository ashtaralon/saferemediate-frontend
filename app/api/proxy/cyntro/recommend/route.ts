import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { decisionAuthorityView } from "@/lib/lp-decision-authority"
import { measuredIamPlan } from "@/lib/lp-held-mutation"

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
    //
    // A count is not a removal authority. A numeric used_count beside an UNKNOWN plan and an unavailable decision
    // authority used to propose a frontend-authored `Resource: "*"` policy. Now a reduction is proposed only when BOTH
    //  - the Review's own server_plan is MEASURED, read by the parser LP Apply uses (measuredIamPlan) -- itself derived
    //    from observed counts on the backend, so it is necessary but not sufficient; and
    //  - the receipted decision authority (decisionAuthorityView) is DECISION_GRADE and lists every planned removal
    //    as CLEARED.
    // Otherwise the answer is a typed hold carrying the backend's own plan state and decision-authority state/reason.
    const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null)
    const record = (value: unknown): Record<string, unknown> | null =>
      value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
    const totalPermissions = num(gapData.summary?.total_permissions)
    const usedCount = num(gapData.summary?.used_count)
    const rows: any[] = Array.isArray(gapData.permissions_analysis) ? gapData.permissions_analysis : []
    const serverPlan = record(gapData.server_plan)
    const planIssueState = typeof serverPlan?.issue_state === "string" ? serverPlan.issue_state : null
    const plan = planIssueState === "MEASURED" ? measuredIamPlan(serverPlan) : undefined
    const authority = record(gapData.decision_authority)
    const authorityView = decisionAuthorityView(gapData.decision_authority)
    const decisionAuthority = authority
      ? {
          state: typeof authority.state === "string" ? authority.state : null,
          reason: typeof authority.reason === "string" ? authority.reason : null,
          authority: typeof authority.authority === "string" ? authority.authority : null,
        }
      : null
    const keep = plan ? plan.actions.filter((a) => a.effect === "keep").map((a) => a.permission) : []
    const remove = plan ? plan.actions.filter((a) => a.effect === "remove").map((a) => a.permission) : []
    const cleared = new Set(authorityView.cleared)
    const authorized = authorityView.kind === "populated" && authorityView.receipt !== null
      && authorityView.coverageComplete && remove.every((permission) => cleared.has(permission))
    const holdReason = usedCount === null ? "USAGE_NOT_MEASURED"
      : plan === undefined ? "SERVER_PLAN_NOT_MEASURED"
      : authorized ? null : "DECISION_AUTHORITY_NOT_CLEARED"
    const planned = holdReason === null
    const riskOf = new Map(rows.map((p) => [p.permission, p]))
    const reduction = planned && keep.length + remove.length > 0
      ? Math.round((remove.length / (keep.length + remove.length)) * 100)
      : null
    const proposedName = `${role_name}-least-privilege`

    const response = {
      original_role: role_name,
      original_permissions: totalPermissions,
      resources_attached: null,
      // The Review's measurement, kept apart from any proposal.
      measured_used_count: usedCount,
      aggregated_used: planned ? keep.length : null,
      aggregated_risk_reduction: reduction,
      cyntro_risk_reduction: null,
      total_new_permissions: planned ? keep.length : null,
      hold_reason: holdReason,
      plan_issue_state: planIssueState,
      decision_authority: decisionAuthority,
      proposed_roles: planned && plan ? [{
        role_name: proposedName,
        resource_id: plan.roleArn,
        resource_name: role_name,
        permissions: keep,
        resource_conditions: {},
      }] : [],
      // No frontend-authored policy document: the server plan names actions, not a policy.
      policies: {},
      unused_permissions: (planned ? remove : []).map((permission) => ({
        permission,
        risk_level: riskOf.get(permission)?.risk_level ?? null,
        recommendation: riskOf.get(permission)?.recommendation ?? null,
      })),
      summary: {
        current_permissions: totalPermissions,
        recommended_permissions: planned ? keep.length : null,
        permissions_to_remove: planned ? remove.length : null,
        risk_reduction_percentage: reduction,
        high_risk_removed: planned ? remove.filter((p) => riskOf.get(p)?.risk_level === "HIGH").length : null,
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
