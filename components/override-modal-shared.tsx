"use client"

/**
 * OverrideModalShared — Decision Contract §7 override UX, single source.
 *
 * Previously: identical inline forms in sg-remediation-card.tsx and
 * s3-remediation-card.tsx (~150 lines each). Cleanup target from the
 * production-readiness audit. The IAM modal has its own override flow
 * tangled into a 3700-line component; we leave it alone in this round.
 *
 * Contract:
 *   - The PARENT owns the apply HTTP call (force=false first, then
 *     force=true with lineage if blocked). This component only handles
 *     the FORM: rationale + acknowledgment + identity capture.
 *   - On submit, parent receives the assembled lineage object via
 *     onSubmit(lineage). Parent calls the API; on response, parent
 *     calls setPhase("success") or setPhase("error").
 *
 * Phases (state machine):
 *   closed     → modal not visible
 *   form       → operator fills rationale + ack
 *   applying   → in-flight; spinner
 *   success    → green checkmark + Done button
 *   error      → red X + Try again / Close buttons
 */

import React from "react"
import {
  composeOverriddenBy,
  resolveOperatorIdentity,
  writeOperatorIdentity,
} from "@/lib/operator-identity"

export type OverridePhase =
  | "closed"
  | "form"
  | "applying"
  | "success"
  | "error"

export interface OverrideLineagePayload {
  rationale: string
  acknowledged: string[]
  rollback_plan_acknowledged: boolean
  overridden_by: string
  overridden_at: string
  identity_source: "self_attested" | "auth_verified" | "anonymous"
}

export interface SharedOverrideState {
  phase: OverridePhase
  rationale: string
  ackRollback: boolean
  blockReasons: string[]
  resultMessage: string
  operatorName: string
  operatorEmail: string
}

export const INITIAL_SHARED_OVERRIDE_STATE: SharedOverrideState = {
  phase: "closed",
  rationale: "",
  ackRollback: true,
  blockReasons: [],
  resultMessage: "",
  operatorName: "",
  operatorEmail: "",
}

export interface OverrideModalSharedProps {
  state: SharedOverrideState
  setState: (s: SharedOverrideState) => void
  /**
   * Acknowledgements written to the lineage payload's acknowledged
   * field. Both cards use ["score_based_block", "operator_override"]
   * today; S3 also includes "hard_evidence_override" when the gate
   * was an evidence_required block. Parent passes the right list.
   */
  acknowledgedTags: string[]
  /** Called when operator submits the form with valid input. */
  onSubmit: (lineage: OverrideLineagePayload) => Promise<void>
  /** Optional sentence shown above the form-fields. */
  contextBlurb?: string
  /** Placeholder for the rationale textarea — resource-specific copy. */
  rationalePlaceholder?: string
}

/**
 * Hook helper: build a SharedOverrideState pre-populated with identity
 * from localStorage. Use this when opening the modal so the form is
 * ready-to-submit if the operator has previously captured their name.
 */
export function buildOverrideStateForOpen(
  blockReasons: string[],
): SharedOverrideState {
  const id = resolveOperatorIdentity()
  return {
    phase: "form",
    rationale: "",
    ackRollback: true,
    blockReasons,
    resultMessage: "",
    operatorName: id.name,
    operatorEmail: id.email || "",
  }
}

export function OverrideModalShared({
  state,
  setState,
  acknowledgedTags,
  onSubmit,
  contextBlurb,
  rationalePlaceholder,
}: OverrideModalSharedProps) {
  if (state.phase === "closed") return null

  const close = () =>
    setState({ ...INITIAL_SHARED_OVERRIDE_STATE, phase: "closed" })

  const handleSubmit = async () => {
    const rationale = state.rationale.trim()
    const name = state.operatorName.trim()
    if (!rationale || !name) return

    // Persist identity for the next override across any card type.
    writeOperatorIdentity(
      name,
      state.operatorEmail.trim() || undefined,
    )

    const lineage: OverrideLineagePayload = {
      rationale,
      acknowledged: [...acknowledgedTags],
      rollback_plan_acknowledged: state.ackRollback,
      overridden_by: composeOverriddenBy(
        name,
        state.operatorEmail.trim() || undefined,
      ),
      overridden_at: new Date().toISOString(),
      identity_source: "self_attested",
    }

    setState({ ...state, phase: "applying", resultMessage: "" })
    try {
      await onSubmit(lineage)
    } catch (e: any) {
      // Parent normally manages success/error transitions, but if it
      // throws synchronously we surface the message here.
      setState({
        ...state,
        phase: "error",
        resultMessage: (e?.message || "Network error").slice(0, 600),
      })
    }
  }

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl">
        {state.phase === "form" && (
          <>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">⚠</span>
              <h3 className="text-lg font-bold text-[#b45309]">
                Override required
              </h3>
            </div>
            <p className="text-sm text-[var(--foreground,#111827)] mb-3">
              {contextBlurb ||
                "Cyntro paused this remediation. You can override and proceed — the change runs immediately with a rollback snapshot. The override is recorded in the audit log."}
            </p>
            <div className="mb-3 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900">
              <div className="font-semibold mb-1">Reasons:</div>
              <ul className="list-disc ml-4 space-y-0.5">
                {state.blockReasons.slice(0, 6).map((r, i) => (
                  <li key={i} className="break-words">
                    {r}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="block text-xs font-semibold text-[#92400e] mb-1">
                  Your name <span className="text-rose-600">*</span>
                </label>
                <input
                  value={state.operatorName}
                  onChange={(e) =>
                    setState({ ...state, operatorName: e.target.value })
                  }
                  placeholder="e.g. Alice Operator"
                  className="w-full border border-[var(--border,#d1d5db)] rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f59e0b]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#92400e] mb-1">
                  Email <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="email"
                  value={state.operatorEmail}
                  onChange={(e) =>
                    setState({ ...state, operatorEmail: e.target.value })
                  }
                  placeholder="alice@company.com"
                  className="w-full border border-[var(--border,#d1d5db)] rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f59e0b]"
                />
              </div>
            </div>
            <label className="block text-xs font-semibold text-[#92400e] mb-1">
              Why are you overriding? (Slack thread, ticket #, customer
              confirmation — recorded in the audit trail)
            </label>
            <textarea
              value={state.rationale}
              onChange={(e) =>
                setState({ ...state, rationale: e.target.value })
              }
              placeholder={
                rationalePlaceholder ||
                "e.g. Confirmed with platform team in #incidents that this change is intentional; ticket #NET-1842"
              }
              rows={3}
              className="w-full border border-[var(--border,#d1d5db)] rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f59e0b] mb-3"
            />
            <label className="flex items-start gap-2 mb-4 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={state.ackRollback}
                onChange={(e) =>
                  setState({ ...state, ackRollback: e.target.checked })
                }
                className="mt-0.5 w-4 h-4 text-[#f59e0b] rounded border-[var(--border,#d1d5db)] focus:ring-[#f59e0b]"
              />
              <span className="text-[var(--foreground,#374151)]">
                I understand a rollback snapshot will be created and I am
                responsible for verifying the change does not break
                dependent systems.
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <button
                onClick={close}
                className="px-4 py-2 border-2 border-[var(--border,#e5e7eb)] rounded-lg font-semibold text-[var(--foreground,#111827)] hover:bg-[var(--muted,#f3f4f6)]"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={
                  !state.rationale.trim() ||
                  !state.ackRollback ||
                  !state.operatorName.trim()
                }
                className="px-5 py-2 bg-[#f59e0b] text-white rounded-lg font-bold hover:bg-[#d97706] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                title={
                  !state.operatorName.trim()
                    ? "Your name is required for the audit log"
                    : !state.rationale.trim()
                      ? "Rationale required for the audit log"
                      : !state.ackRollback
                        ? "Acknowledge the rollback responsibility to proceed"
                        : "Apply the change with override"
                }
              >
                Apply Anyway
              </button>
            </div>
          </>
        )}
        {state.phase === "applying" && (
          <div className="text-center py-6">
            <div className="text-3xl mb-3">⏳</div>
            <h3 className="text-lg font-bold text-[#b45309]">
              Applying remediation…
            </h3>
            <p className="mt-2 text-sm text-[var(--muted-foreground,#6b7280)]">
              Snapshot, AWS mutate, and verify. Usually completes in a few
              seconds.
            </p>
          </div>
        )}
        {state.phase === "success" && (
          <div className="text-center py-2">
            <div className="text-3xl mb-3 text-emerald-500">✓</div>
            <h3 className="text-lg font-bold text-[#15803d]">
              Remediation applied
            </h3>
            <p className="mt-2 text-sm text-[var(--foreground,#374151)] whitespace-pre-line break-words">
              {state.resultMessage}
            </p>
            <button
              onClick={close}
              className="mt-4 px-5 py-2 bg-[#22c55e] text-white rounded-lg font-bold hover:bg-[#16a34a]"
            >
              Done
            </button>
          </div>
        )}
        {state.phase === "error" && (
          <div className="text-center py-2">
            <div className="text-3xl mb-3 text-rose-500">✕</div>
            <h3 className="text-lg font-bold text-[#991b1b]">
              Remediation failed
            </h3>
            <p className="mt-2 text-sm text-[var(--foreground,#374151)] whitespace-pre-line break-words">
              {state.resultMessage}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={() =>
                  setState({ ...state, phase: "form", resultMessage: "" })
                }
                className="px-4 py-2 border-2 border-[var(--border,#e5e7eb)] rounded-lg font-semibold text-[var(--foreground,#111827)] hover:bg-[var(--muted,#f3f4f6)]"
              >
                Try again
              </button>
              <button
                onClick={close}
                className="px-4 py-2 bg-[var(--foreground,#374151)] text-white rounded-lg font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
