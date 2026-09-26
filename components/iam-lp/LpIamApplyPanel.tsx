"use client"

import { useEffect, useRef, useState } from "react"

import { LpOutstandingPanel } from "@/components/iam-lp/LpOutstandingPanel"
import { LpRestoreControl } from "@/components/iam-lp/LpRestoreControl"
import { decisionBindingOf } from "@/lib/lp-decision-authority"
import {
  LP_MUTATION_APPLY_ENABLED,
  LP_RESOLVE_ENABLED,
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

/**
 * Refusals by name, from their producers: the held proxy (lib/server/lp-mutation-proxy.ts), the broker
 * (api/lp_lifecycle_broker.py), the lifecycle route (api/lp_remediation_route.py, incl. E4 operator identity) and the
 * decision admission (unified/lp/decision_authority.py). An unmapped code still renders as a named refusal, never success.
 */
const REFUSAL_COPY: Record<string, string> = {
  APPLY_HELD: "Apply is held until the customer-resident writer, its admission and installed recovery are proven.",
  // proxy
  OPERATOR_SESSION_REQUIRED: "Sign in to apply changes.",
  OPERATOR_PROOF_NOT_FORWARDABLE: "Your sign-in could not be proven to the backend. Sign in again.",
  OPERATOR_APPLY_FORBIDDEN: "Your role may review but not apply changes.",
  FORGED_SCOPE_REFUSED: "The request named another customer or account than your session.",
  SERVER_SCOPE_UNAVAILABLE: "This deployment has no customer and account scope to apply under.",
  DEPLOYMENT_SERVICE_TOKEN_NOT_CONFIGURED: "This deployment is not configured to forward changes.",
  LIFECYCLE_PROCESS_NOT_DEPLOYED: "This deployment has no remediation writer.",
  PLAN_EMPTY: "The plan was empty.",
  PLAN_REPLAY_REFUSED: "This plan was already submitted. Reload the Review for a new plan.",
  // broker
  IAM_APPLY_AUTHORITY_ABSENT: "This deployment holds no authority to forward IAM changes.",
  LIFECYCLE_DESTINATION_UNAVAILABLE: "This deployment has no remediation writer.",
  LIFECYCLE_UNREACHABLE: "The remediation writer could not be reached.",
  OPERATOR_SCOPE_MISMATCH: "Your operator identity is not scoped to this customer and account.",
  // lifecycle route (E4 operator identity included)
  OPERATOR_IDENTITY_REQUIRED: "Your operator identity was not presented. Sign in again.",
  OPERATOR_IDENTITY_INVALID: "Your operator identity could not be verified.",
  OPERATOR_ACTION_FORBIDDEN: "Your role may review but not apply changes.",
  FORGED_ACTOR_REFUSED: "The request named a different operator than the one signed in.",
  LP_APPLY_NOT_ADMITTED: "IAM Apply is not admitted on this deployment.",
  STALE_PLAN_HEAD: "The plan changed since this Review. Reload the Review.",
  CHANGE_NOT_APPLIED: "AWS rejected the change before it took effect; the role is unchanged.",
  PLAN_EVIDENCE_MISMATCH: "The server's plan no longer matches this Review. Reload the Review.",
  PLAN_EVIDENCE_NOT_MEASURED: "Usage for this role is not measured.",
  PLAN_EVIDENCE_UNAVAILABLE: "The Review could not be re-read to confirm this plan.",
  ROLE_OPERATION_OUTSTANDING: "Another operation on this role is outstanding. Resolve it first.",
  ROLE_SCOPE_MISMATCH: "This role is outside the verified customer and account.",
  REVIEW_SCOPE_MISMATCH: "The Review's scope does not match this request.",
  ACTOR_SCOPE_MISMATCH: "The operator is not scoped to this customer and account.",
  // decision admission
  DECISION_BINDING_REQUIRED: "The Apply carried no decision binding. Reload the Review.",
  DECISION_GENERATION_MOVED: "A newer decision generation was activated after this Review. Reload the Review before applying.",
  DECISION_ROLE_MISMATCH: "The decision authority names another role incarnation. Reload the Review.",
  DECISION_AUTHORITY_UNAVAILABLE: "No receipted decision authority is available for this role.",
  REMOVAL_NOT_DECISION_CLEARED: "At least one removal is not cleared by the decision authority.",
  SESSION_READER_ABSENT: "Session coverage cannot be read on this deployment.",
  SESSION_COVERAGE_UNAVAILABLE: "Session coverage is unavailable.",
  SESSION_COVERAGE_NOT_SERVED: "Session coverage is not published for this role.",
  SESSION_COVERAGE_NOT_DECISION_GRADE: "Session coverage for this publication is not decision grade.",
  SESSION_COVERAGE_OTHER_PUBLICATION: "Session coverage belongs to another publication. Reload the Review.",
}

/** Codes a Review reload is the answer to: the plan or its binding is stale. */
const STALE_CODES = new Set([
  "DECISION_BINDING_REQUIRED",
  "DECISION_GENERATION_MOVED",
  "DECISION_ROLE_MISMATCH",
  "SESSION_COVERAGE_OTHER_PUBLICATION",
  "PLAN_EVIDENCE_MISMATCH",
  "STALE_PLAN_HEAD",
])

/** Codes whose outcome is NOT known to be zero writes, whatever the body says. */
// VERIFY_RECEIPT_MISSING / OPERATION_RECORD_UNCONFIRMED: the route answers these with cloud_writes 0 while its ledger
// row can be PARTIALLY_APPLIED (tests/test_lp_replay_contract.py on the backend), so "nothing written" is not proven.
const UNCONFIRMED_CODES = new Set([
  "APPLY_OUTCOME_UNKNOWN", "RESTORE_ATTEMPT_OUTCOME_UNKNOWN", "READBACK_FAILED",
  "VERIFY_RECEIPT_MISSING", "OPERATION_RECORD_UNCONFIRMED",
  // Answered with aws_writes=0 even when an exception escaped AFTER a write (remediation_transaction.py).
  "EXECUTOR_UNAVAILABLE",
])
const UNCONFIRMED = "The outcome is unconfirmed; check the role's outstanding operation."

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
  if (state === "MEASURED_EMPTY") return "Nothing to remove: every configured action was observed in use."
  if (state !== "MEASURED" || !measuredIamPlan(plan)) return `No measured removal plan (${state ?? "unknown"}).`
  if (!measuredIamPlan(plan)!.actions.some((action) => action.effect === "remove")) return "Nothing to remove in this plan."
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
  holdReason = null,
  applyEnabled = LP_MUTATION_APPLY_ENABLED,
  restoreEnabled = LP_RESTORE_ENABLED,
  resolveEnabled = LP_RESOLVE_ENABLED,
  submitApply = submitHeldLpApply,
  lookupReceipt = lookupLpReceipt,
}: {
  review: unknown
  scope: Scope
  onReviewStale?: () => void
  holdReason?: string | null
  applyEnabled?: boolean
  restoreEnabled?: boolean
  resolveEnabled?: boolean
  submitApply?: (body: LpApplyBody) => Promise<SubmitResult>
  lookupReceipt?: typeof lookupLpReceipt
}) {
  const body = lpApplyBody(review)
  const plan = body ? { roleArn: body.role_arn, roleId: body.role_id, planHead: body.plan_head } : undefined
  // The role this Review is about, whether or not an Apply can be formed: an operation already holding it (an
  // unknown or partial outcome) is shown and resolved here, where IAM roles are reviewed.
  const reviewed = review && typeof review === "object" ? ((review as Record<string, any>).server_plan ?? null) : null
  const heldRole = typeof reviewed?.role_arn === "string" && reviewed.role_arn && typeof reviewed?.role_id === "string" && reviewed.role_id
    ? { roleArn: reviewed.role_arn as string, roleId: reviewed.role_id as string, planHead: String(reviewed.plan_head ?? "") }
    : undefined
  const lookups = applyEnabled || restoreEnabled || resolveEnabled
  const [outstandingRefresh, setOutstandingRefresh] = useState(0)
  const outstandingPanel = (
    <LpOutstandingPanel
      plan={heldRole}
      lookupEnabled={lookups}
      refresh={outstandingRefresh}
      onResolved={() => onReviewStale?.()}
    />
  )
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
        {outstandingPanel}
      </div>
    )
  }
  const removals = body.actions.filter((action) => action.effect === "remove").map((action) => action.permission)

  async function apply() {
    if (!applyEnabled || busy || sent.current || !body) return
    sent.current = true
    setBusy(true)
    try {
      let result: SubmitResult
      try {
        result = await submitApply(body)
      } catch {
        // The request may or may not have reached the writer: never "nothing written", never a silent failure.
        setOutcome(`Apply could not be confirmed. ${UNCONFIRMED}`)
        setOutstandingRefresh((value) => value + 1)
        return
      }
      const verified = result.ok ? receiptFromApply(plan, result.body) : null
      if (verified) {
        setReceipt(verified)
        setOutcome(`Applied and verified: operation ${verified.operationId}.`)
        return
      }
      const code = refusalCode(result)
      if (result.ok) {
        setOutcome(`The backend answered without a verified receipt for this plan. ${UNCONFIRMED}`)
        setOutstandingRefresh((value) => value + 1)
        return
      }
      const copy = (code && REFUSAL_COPY[code]) ?? `Apply was refused (${code ?? `HTTP ${result.status}`}).`
      const unconfirmed = (code && UNCONFIRMED_CODES.has(code)) || (!zeroWrites(result) && result.status >= 500)
      const writes = unconfirmed ? ` ${UNCONFIRMED}` : zeroWrites(result) ? " Nothing was written." : ""
      setOutcome(`${copy}${writes}`)
      if (unconfirmed) setOutstandingRefresh((value) => value + 1)   // show the operation now holding the role
      // A stale plan is answered by a fresh Review (which remounts this panel with a new key), never by re-sending
      // the same plan in place: the proxy's and broker's replay guards would refuse it.
      if (code && STALE_CODES.has(code)) onReviewStale?.()
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
          {holdReason || REFUSAL_COPY.APPLY_HELD}
        </div>
      )}
      {outcome && (
        <div role="status" className="mt-2">
          {outcome}
        </div>
      )}
      <LpRestoreControl receipt={receipt} plan={plan} scope={scope} onReceiptCleared={() => setReceipt(null)} />
      {outstandingPanel}
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

/**
 * Whether this Review belongs to the role the modal shows now: its server plan names the modal's role ARN (when the
 * modal has one), else its role name. A Review from the previous role is never rendered, even for one render.
 */
export function lpReviewIsForThisRole(review: unknown, roleName: string | null | undefined, roleArn?: string | null): boolean {
  const data = review && typeof review === "object" ? (review as Record<string, any>) : null
  if (!data) return false
  if (roleArn) return data.server_plan?.role_arn === roleArn
  return !!roleName && data.role_name === roleName
}
