"use client"

import { useEffect, useRef, useState } from "react"

import { LpRestoreControl } from "@/components/iam-lp/LpRestoreControl"
import { decisionBindingOf } from "@/lib/lp-decision-authority"
import {
  LP_MUTATION_APPLY_ENABLED,
  LP_RESTORE_ENABLED,
  lookupLpReceipt,
  lpApplyBody,
  measuredIamPlan,
  receiptFromApply,
  submitHeldLpApply,
  type LpApplyBody,
  type LpApplyReceipt,
} from "@/lib/lp-held-mutation"

type Scope = { customerId?: string | null; accountId?: string | null }
type SubmitResult = { ok: boolean; status: number; code?: string; body?: unknown; cloud_writes?: number }

/** Refusals the backend (route, broker, proxy) names, and what the operator should do. Each writes nothing. */
const REFUSAL_COPY: Record<string, string> = {
  APPLY_HELD: "Apply is held until the customer-resident writer, its admission and installed recovery are proven.",
  DECISION_BINDING_REQUIRED: "The Apply carried no decision binding. Reload the Review.",
  DECISION_GENERATION_MOVED: "A newer decision generation was activated after this Review. Reload the Review before applying.",
  DECISION_ROLE_MISMATCH: "The decision authority names another role incarnation. Reload the Review.",
  DECISION_AUTHORITY_UNAVAILABLE: "No receipted decision authority is available for this role.",
  REMOVAL_NOT_DECISION_CLEARED: "At least one removal is not cleared by the decision authority.",
  SESSION_COVERAGE_NOT_DECISION_GRADE: "Session coverage for this publication is not decision grade.",
  SESSION_COVERAGE_OTHER_PUBLICATION: "Session coverage belongs to another publication. Reload the Review.",
  PLAN_EVIDENCE_MISMATCH: "The server's plan no longer matches this Review. Reload the Review.",
  PLAN_REPLAY_REFUSED: "This plan was already submitted.",
  ROLE_OPERATION_OUTSTANDING: "Another operation on this role is outstanding. Resolve it first.",
  OPERATOR_PROOF_MISSING: "Your sign-in could not be proven to the backend. Sign in again.",
  OPERATOR_IDENTITY_REQUIRED: "Your operator identity was not presented. Sign in again.",
  OPERATOR_IDENTITY_INVALID: "Your operator identity could not be verified.",
  OPERATOR_SCOPE_MISMATCH: "Your operator identity is not scoped to this customer and account.",
  OPERATOR_ACTION_FORBIDDEN: "Your role may review but not apply changes.",
  FORGED_ACTOR_REFUSED: "The request named a different operator than the one signed in.",
  LIFECYCLE_DESTINATION_UNAVAILABLE: "This deployment has no remediation writer.",
  LP_LIFECYCLE_REQUIRED: "This deployment has no remediation writer.",
}

/** Codes a Review reload is the answer to: the plan or its binding is stale. */
const STALE_CODES = new Set([
  "DECISION_BINDING_REQUIRED",
  "DECISION_GENERATION_MOVED",
  "DECISION_ROLE_MISMATCH",
  "SESSION_COVERAGE_OTHER_PUBLICATION",
  "PLAN_EVIDENCE_MISMATCH",
])

function refusalCode(result: SubmitResult): string | undefined {
  if (result.code) return result.code
  const body = result.body && typeof result.body === "object" ? (result.body as Record<string, unknown>) : null
  const detail = body?.detail && typeof body.detail === "object" ? (body.detail as Record<string, unknown>) : null
  const code = detail?.code ?? body?.code
  return typeof code === "string" ? code : undefined
}

function zeroWrites(result: SubmitResult): boolean {
  if (result.cloud_writes === 0) return true
  const body = result.body && typeof result.body === "object" ? (result.body as Record<string, unknown>) : null
  const detail = body?.detail && typeof body.detail === "object" ? (body.detail as Record<string, unknown>) : body
  return detail?.cloud_writes === 0
}

/** Why no Apply body can be formed from this Review, named from what it carried. */
function unavailableReason(review: unknown): string {
  const data = review && typeof review === "object" ? (review as Record<string, any>) : null
  const plan = data?.server_plan
  const state = typeof plan?.issue_state === "string" ? plan.issue_state : null
  if (!plan) return "The Review carried no server plan."
  if (!measuredIamPlan(plan)) {
    if (state === "MEASURED_EMPTY") return "Nothing to remove: every configured action was observed in use."
    return `No measured removal plan (${state ?? "unknown"}).`
  }
  const binding = decisionBindingOf(data?.decision_authority, { roleArn: plan.role_arn, roleId: plan.role_id })
  if (!binding) {
    const reason = data?.decision_authority?.reason
    return `No receipted decision authority for this role${typeof reason === "string" && reason ? ` (${reason})` : ""}.`
  }
  return "No Apply can be formed from this Review."
}

/**
 * The IAM-role LP Apply caller, mounted in IAMPermissionAnalysisModal (the only surface IAM roles reach).
 *
 * The body is built ONLY by lpApplyBody from the one Review response passed in: its MEASURED server_plan plus the
 * exact decision_binding for that role. The modal keys this component by role, incarnation, generation, publication
 * attempt and plan head, so any change remounts it and drops every result, receipt and in-flight state from the old
 * Review. Operator identity and scope are never sent from here: the held proxy seals the session and derives
 * tenant/account/actor server-side, and the backend re-verifies them.
 *
 * Held by default: `applyEnabled` is LP_MUTATION_APPLY_ENABLED (false). While held the button is disabled and nothing
 * is fetched (no ledger lookup either). `submitApply` and `lookupReceipt` are seams for tests; production uses the
 * held submitter, which itself returns APPLY_HELD without a request while the flag is off.
 */
export function LpIamApplyPanel({
  review,
  scope,
  onReviewStale,
  applyEnabled = LP_MUTATION_APPLY_ENABLED,
  restoreEnabled = LP_RESTORE_ENABLED,
  submitApply = submitHeldLpApply,
  lookupReceipt = lookupLpReceipt,
}: {
  review: unknown
  scope: Scope
  onReviewStale?: () => void
  applyEnabled?: boolean
  restoreEnabled?: boolean
  submitApply?: (body: LpApplyBody) => Promise<SubmitResult>
  lookupReceipt?: typeof lookupLpReceipt
}) {
  const body = lpApplyBody(review)
  const plan = body ? { roleArn: body.role_arn, roleId: body.role_id, planHead: body.plan_head } : undefined
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<LpApplyReceipt | null>(null)
  const sent = useRef(false)

  useEffect(() => {
    if (!plan || !(applyEnabled || restoreEnabled)) return
    let live = true
    void lookupReceipt(plan).then((found) => {
      if (live && found) setReceipt(found)
    })
    return () => {
      live = false
    }
    // plan fields are the identity; the component is remounted when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyEnabled, restoreEnabled])

  if (!body || !plan) {
    return (
      <div data-testid="lp-iam-apply-panel" className="rounded-lg border border-slate-200 p-3 text-sm">
        <div className="font-medium">Apply</div>
        <div role="status" className="text-slate-600">{unavailableReason(review)}</div>
      </div>
    )
  }
  const removals = body.actions.filter((action) => action.effect === "remove").map((action) => action.permission)

  async function apply() {
    if (!applyEnabled || busy || sent.current || !body) return
    sent.current = true
    setBusy(true)
    try {
      const result = await submitApply(body)
      const verified = result.ok ? receiptFromApply(plan, result.body) : null
      if (verified) {
        setReceipt(verified)
        setOutcome(`Applied and verified: operation ${verified.operationId}.`)
        return
      }
      const code = refusalCode(result)
      if (result.ok) {
        setOutcome("The backend answered without a verified receipt for this plan. The outcome is unconfirmed; check the role's outstanding operation.")
        return
      }
      const copy = (code && REFUSAL_COPY[code]) ?? `Apply was refused (${code ?? `HTTP ${result.status}`}).`
      const writes = zeroWrites(result) ? " Nothing was written." : result.status >= 500 ? " The outcome is unconfirmed; check the role's outstanding operation." : ""
      setOutcome(`${copy}${writes}`)
      if (code && STALE_CODES.has(code)) onReviewStale?.()
      if (code === "APPLY_HELD" || (code && STALE_CODES.has(code))) sent.current = false
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-testid="lp-iam-apply-panel" className="rounded-lg border border-slate-200 p-3 text-sm">
      <div className="font-medium">Apply</div>
      <div className="text-slate-600">
        Remove {removals.length} unused permission{removals.length === 1 ? "" : "s"} from {body.role_arn}, bound to decision
        generation {body.decision_binding.projection_generation}.
      </div>
      <button
        type="button"
        className="mt-2 rounded border px-3 py-1 disabled:opacity-50"
        onClick={apply}
        disabled={!applyEnabled || busy || sent.current}
        aria-busy={busy}
      >
        Apply this plan
      </button>
      {!applyEnabled && (
        <div role="note" className="mt-2 text-slate-600">
          {REFUSAL_COPY.APPLY_HELD}
        </div>
      )}
      {outcome && (
        <div role="status" className="mt-2">
          {outcome}
        </div>
      )}
      <LpRestoreControl receipt={receipt} plan={plan} scope={scope} onReceiptCleared={() => setReceipt(null)} />
    </div>
  )
}

/** The remount key: any change of role, incarnation, generation, publication attempt or plan head is a new panel. */
export function lpIamApplyPanelKey(review: unknown): string {
  const data = review && typeof review === "object" ? (review as Record<string, any>) : null
  const plan = data?.server_plan
  const authority = data?.decision_authority
  return [
    plan?.role_arn,
    plan?.role_id,
    plan?.plan_head,
    authority?.receipt?.projection_generation,
    authority?.receipt?.projection_receipt_hash,
    authority?.publication?.attempt,
  ].map((part) => String(part ?? "")).join("|")
}
