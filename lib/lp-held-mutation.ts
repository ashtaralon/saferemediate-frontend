import { decisionBindingOf, type LpDecisionBinding } from "@/lib/lp-decision-authority"

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

/** The one Apply request: POST the admitted body to the held proxy. Callers go through submitHeldLpApply. */
export async function postLpApply(body: Record<string, unknown>) {
  const response = await fetch("/api/proxy/least-privilege/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) }
}

export async function submitHeldLpApply(body: Record<string, unknown>) {
  if (!LP_MUTATION_APPLY_ENABLED) {
    return { ok: false, status: 503, code: "APPLY_HELD", cloud_writes: 0 }
  }
  return postLpApply(body)
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
 * RESTORE_TRANSACTION_MISMATCH). Nothing is persisted in the browser: after a
 * reload the hint comes only from the ledger (`lookupLpReceipt`).
 */
export function receiptOffersRestore(receipt: LpApplyReceipt | null, plan: SentPlan, scope: ReceiptScope): boolean {
  if (!receipt || !plan) return false
  if (receipt.roleArn !== plan.roleArn || receipt.roleId !== plan.roleId) return false
  const account = scope.accountId
  if (account && account !== "all" && account !== receipt.accountId) return false
  if (scope.customerId && scope.customerId !== receipt.tenantId) return false
  return true
}

/**
 * After a reload, ask the backend ledger which verified Apply on exactly this
 * role incarnation may be restored. The ledger is the authority; the answer is
 * accepted only for this role ARN and role id. Anything else (404 no receipt,
 * 409 already restored or outstanding, an unavailable lookup, a signed-out
 * operator) means no Restore is offered.
 */
export async function lookupLpReceipt(plan: SentPlan): Promise<LpApplyReceipt | null> {
  if (!plan) return null
  let response: Response
  try {
    const query = new URLSearchParams({ role_arn: plan.roleArn, role_id: plan.roleId })
    response = await fetch(`/api/proxy/least-privilege/receipt?${query}`, { cache: "no-store" })
  } catch {
    return null
  }
  if (!response.ok) return null
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
  const receipt = body?.receipt as Record<string, unknown> | undefined
  if (!receipt || receipt.kind !== "apply" || receipt.restores_operation_id != null) return null
  if (receipt.role_arn !== plan.roleArn || receipt.role_id !== plan.roleId) return null
  if (!nonEmpty(receipt.operation_id) || !nonEmpty(receipt.plan_head) || !nonEmpty(receipt.tenant_id) || !nonEmpty(receipt.account_id)) return null
  return {
    operationId: receipt.operation_id,
    roleArn: plan.roleArn,
    roleId: plan.roleId,
    planHead: receipt.plan_head,
    tenantId: receipt.tenant_id,
    accountId: receipt.account_id,
  }
}

/** Resolution records a proven outcome in the backend ledger (no IAM write). Held with Apply/Restore. */
export const LP_RESOLVE_ENABLED = false

export type LpLiveVerdict = "applied" | "not_applied" | "partial" | "diverged" | "unreadable"

export type LpOutstanding = {
  operationId: string
  state: string
  attempt: number | null
  resolvable: boolean
  verdict: LpLiveVerdict
  perPolicy: Record<string, "preimage" | "intended" | "diverged">
}

const VERDICTS = new Set(["applied", "not_applied", "partial", "diverged", "unreadable"])
const POLICY_STATES = new Set(["preimage", "intended", "diverged"])

/**
 * The operation holding exactly this role incarnation, and the backend's
 * read-only reconciliation of the live policies. Only the server's answer is
 * shown; null when nothing is outstanding, the operator is signed out or may
 * not see it, or the lookup is unavailable.
 */
export async function fetchLpOutstanding(plan: SentPlan): Promise<LpOutstanding | null> {
  if (!plan) return null
  let response: Response
  try {
    const query = new URLSearchParams({ role_arn: plan.roleArn, role_id: plan.roleId })
    response = await fetch(`/api/proxy/least-privilege/outstanding?${query}`, { cache: "no-store" })
  } catch {
    return null
  }
  if (!response.ok) return null
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
  const live = body?.live as Record<string, unknown> | undefined
  if (!body || !nonEmpty(body.operation_id) || !nonEmpty(body.state) || !live || !VERDICTS.has(String(live.verdict))) return null
  const perPolicy = (live.per_policy && typeof live.per_policy === "object" ? live.per_policy : {}) as Record<string, unknown>
  if (!Object.values(perPolicy).every((value) => POLICY_STATES.has(String(value)))) return null
  return {
    operationId: body.operation_id,
    state: body.state,
    attempt: typeof body.attempt === "number" ? body.attempt : null,
    resolvable: body.resolvable === true,
    verdict: live.verdict as LpLiveVerdict,
    perPolicy: perPolicy as LpOutstanding["perPolicy"],
  }
}

/** An operator's explicit resolution of the outstanding operation on this exact role. */
export async function submitLpResolve(binding: RestoreBinding) {
  if (!LP_RESOLVE_ENABLED) {
    return { ok: false, status: 503, code: "RESOLVE_HELD", cloud_writes: 0 }
  }
  const { operationId, roleArn, roleId } = binding
  if (!operationId || !roleArn || !roleId) {
    return { ok: false, status: 422, code: "RESOLUTION_BINDING_MISSING", cloud_writes: 0 }
  }
  const response = await fetch("/api/proxy/least-privilege/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation_id: operationId, role_arn: roleArn, role_id: roleId, resource_family: "iam-role" }),
  })
  return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) }
}

/** The LP Apply request body the backend admits (api/lp_remediation_route.py apply_lp). */
export type LpApplyBody = {
  role_arn: string
  role_id: string
  plan_head: string
  resource_family: "iam-role"
  actions: NonNullable<ReturnType<typeof measuredIamPlan>>["actions"]
  decision_binding: LpDecisionBinding
}

/**
 * The ONE builder for an LP Apply body, from a single Review response: its MEASURED `server_plan` and, for exactly that
 * role, its receipted `decision_authority` (lib/lp-decision-authority.ts::decisionBindingOf). Returns undefined -- no
 * Apply can be formed -- unless both are present: the backend refuses an Apply without a binding
 * (DECISION_BINDING_REQUIRED), so an unbound body is never built. Building a body grants nothing: sending it goes
 * through submitHeldLpApply, which stays held while LP_MUTATION_APPLY_ENABLED is false.
 *
 * Only a MEASURED plan with at least one removal forms a body (MEASURED_EMPTY, IDENTITY_UNAVAILABLE and UNKNOWN never
 * do). Its caller is components/iam-lp/LpIamApplyPanel.tsx, mounted in IAMPermissionAnalysisModal -- the surface IAM
 * roles route to (lib/lp-review-routing.ts).
 */
export function lpApplyBody(review: unknown): LpApplyBody | undefined {
  const data = review && typeof review === "object" ? (review as Record<string, unknown>) : null
  if (!data) return undefined
  const raw = data.server_plan && typeof data.server_plan === "object" ? (data.server_plan as Record<string, unknown>) : null
  if (raw?.issue_state !== "MEASURED") return undefined
  const plan = measuredIamPlan(raw)
  if (!plan || !plan.actions.some((action) => action.effect === "remove")) return undefined
  const binding = decisionBindingOf(data.decision_authority, { roleArn: plan.roleArn, roleId: plan.roleId })
  if (!binding) return undefined
  return {
    role_arn: plan.roleArn,
    role_id: plan.roleId,
    plan_head: plan.planHead,
    resource_family: "iam-role",
    actions: plan.actions,
    decision_binding: binding,
  }
}
