export const LP_MUTATION_APPLY_ENABLED = false
export const LP_RESTORE_ENABLED = false

export type HeldMutationState = {
  applyEnabled: false
  restoreEnabled: false
  recoveryProven: false
}

export function measuredIamPlan(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined
  const row = payload as Record<string, unknown>
  const roleArn = row.role_arn
  const roleId = row.role_id
  const planHead = row.plan_head
  const actions = row.actions
  if (typeof roleArn !== "string" || !roleArn || typeof roleId !== "string" || !roleId || typeof planHead !== "string" || !planHead) {
    return undefined
  }
  if (!Array.isArray(actions) || actions.length === 0) return undefined
  const parsed = []
  for (const item of actions) {
    if (!item || typeof item !== "object") return undefined
    const action = item as Record<string, unknown>
    if (action.configured !== true || action.coverage !== "OBSERVED" || typeof action.observed_use_count !== "number") {
      return undefined
    }
    if (action.effect !== "remove" && action.effect !== "keep") return undefined
    parsed.push({
      permission: String(action.permission || ""),
      configured: true as const,
      coverage: "OBSERVED" as const,
      observed_use_count: action.observed_use_count,
      effect: action.effect,
    })
  }
  return { roleArn, roleId, planHead, actions: parsed }
}

export function heldMutationState(): HeldMutationState {
  return {
    applyEnabled: LP_MUTATION_APPLY_ENABLED,
    restoreEnabled: LP_RESTORE_ENABLED,
    recoveryProven: false,
  }
}

export async function submitHeldLpApply(body: Record<string, unknown>) {
  if (!LP_MUTATION_APPLY_ENABLED) {
    return { ok: false, status: 503, code: "APPLY_HELD", cloud_writes: 0 }
  }
  const response = await fetch("/api/proxy/least-privilege/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) }
}

export async function submitHeldLpRestore(operationId: string) {
  if (!LP_RESTORE_ENABLED) {
    return { ok: false, status: 503, code: "RESTORE_HELD", cloud_writes: 0 }
  }
  const response = await fetch("/api/proxy/least-privilege/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation_id: operationId }),
  })
  return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) }
}
