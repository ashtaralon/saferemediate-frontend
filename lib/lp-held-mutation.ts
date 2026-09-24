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
  const parsed: Array<{
    permission: string
    configured: true
    coverage: "OBSERVED"
    observed_use_count: number
    effect: "remove" | "keep"
  }> = []
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

export type RestoreBinding = { operationId: string; roleArn: string; roleId: string }

/**
 * A Restore names the Apply operation it undoes and the role that operation
 * changed; the backend refuses a Restore whose role differs from the restored
 * operation's (RESTORE_ROLE_MISMATCH). Without the whole binding, no body.
 */
export function restoreRequestBody(binding: RestoreBinding) {
  const { operationId, roleArn, roleId } = binding
  if (!operationId || !roleArn || !roleId) return null
  return { operation_id: operationId, role_arn: roleArn, role_id: roleId, resource_family: "iam-role" }
}

export async function submitHeldLpRestore(binding: RestoreBinding) {
  if (!LP_RESTORE_ENABLED) {
    return { ok: false, status: 503, code: "RESTORE_HELD", cloud_writes: 0 }
  }
  const body = restoreRequestBody(binding)
  if (!body) {
    return { ok: false, status: 422, code: "RESTORE_BINDING_MISSING", cloud_writes: 0 }
  }
  const response = await fetch("/api/proxy/least-privilege/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) }
}

/** The binding a verified Apply recorded (backend `receipt`, #2137). */
export type LpApplyReceipt = {
  operationId: string
  roleArn: string
  roleId: string
  planHead: string
  tenantId: string
  accountId: string
}

type SentPlan = { roleArn: string; roleId: string; planHead: string } | undefined

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

/**
 * Accept an Apply response as a Restore-able receipt only when the backend
 * verified it and recorded exactly the plan this client sent: same operation,
 * role ARN, role incarnation and plan head. Anything else (a refusal, an older
 * backend without `receipt`, a different role) is not a receipt.
 */
export function receiptFromApply(sent: SentPlan, response: unknown): LpApplyReceipt | null {
  if (!sent || !response || typeof response !== "object") return null
  const body = response as Record<string, unknown>
  const receipt = body.receipt as Record<string, unknown> | undefined
  if (body.code !== "VERIFIED" || !receipt || typeof receipt !== "object") return null
  if (receipt.kind !== "apply" || receipt.restores_operation_id != null) return null
  if (!nonEmpty(receipt.operation_id) || receipt.operation_id !== body.operation_id) return null
  if (receipt.role_arn !== sent.roleArn || receipt.role_id !== sent.roleId || receipt.plan_head !== sent.planHead) return null
  if (!nonEmpty(receipt.tenant_id) || !nonEmpty(receipt.account_id)) return null
  return {
    operationId: receipt.operation_id,
    roleArn: sent.roleArn,
    roleId: sent.roleId,
    planHead: sent.planHead,
    tenantId: receipt.tenant_id,
    accountId: receipt.account_id,
  }
}

type ReceiptScope = { customerId?: string | null; accountId?: string | null }

/**
 * Whether a receipt held in memory may be offered as a Restore hint for the
 * role now selected. It is never proof: Restore submits the exact binding and
 * the backend re-checks it against its ledger (RESTORE_ROLE_MISMATCH,
 * RESTORE_TRANSACTION_MISMATCH). There is no scoped backend receipt lookup, so
 * nothing is persisted: after a reload or logout no Restore is offered.
 */
export function receiptOffersRestore(receipt: LpApplyReceipt | null, plan: SentPlan, scope: ReceiptScope): boolean {
  if (!receipt || !plan) return false
  if (receipt.roleArn !== plan.roleArn || receipt.roleId !== plan.roleId) return false
  const account = scope.accountId
  if (account && account !== "all" && account !== receipt.accountId) return false
  if (scope.customerId && scope.customerId !== receipt.tenantId) return false
  return true
}
