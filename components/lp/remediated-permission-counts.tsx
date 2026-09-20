"use client"

import {
  allowedActionsAfterChange,
  checkpointStateReason,
  type CheckpointStatesResult,
} from "@/lib/checkpoint-states"
import { mutationFailureText } from "@/lib/iam-mutation-outcome"
import { operatorAttributionQualifier } from "@/lib/lp-normalize"
import { inspectableCheckpoint, useSavedCheckpointStates } from "@/components/lp/use-saved-checkpoint-states"

/**
 * A Remediated row used to present graph metrics as the role's current state:
 * "4 active", "33% permissions in active use", "8 still need review" -- counts
 * from the graph's evidence window, which predate the change that removed 5
 * actions (Codex, 3431 QA). What the change left allowed is only known from a
 * saved checkpoint whose derived after state verifies; the graph counts are
 * historical observations and are labelled so.
 */

interface ChangeFacts {
  allowed: string
  allowedCount: number | null
  removed: string
  derivedAndVerified: boolean
}

function changeFacts(inspectable: string | null, answer: CheckpointStatesResult | null): ChangeFacts {
  if (!inspectable) {
    return { allowed: "unknown — no recorded after state", allowedCount: null, removed: "not recorded", derivedAndVerified: false }
  }
  if (!answer) {
    return { allowed: "reading the saved checkpoint…", allowedCount: null, removed: "reading the saved checkpoint…", derivedAndVerified: false }
  }
  if (!answer.ok) {
    const why = mutationFailureText(answer.failure)
    return { allowed: `unknown — ${why}`, allowedCount: null, removed: `unknown — ${why}`, derivedAndVerified: false }
  }
  const removedActions = answer.states.operation.removed_actions
  const removed = removedActions.length ? `${removedActions.length}: ${removedActions.join(", ")}` : "not recorded"
  const actions = allowedActionsAfterChange(answer.states)
  if (actions === null) {
    return {
      allowed: `unknown — ${checkpointStateReason(answer.states.after.reason)}`,
      allowedCount: null,
      removed,
      derivedAndVerified: false,
    }
  }
  return {
    allowed: `${actions.length} configured Allow actions (derived, hash-verified)`,
    allowedCount: actions.length,
    removed,
    derivedAndVerified: true,
  }
}

/**
 * Who made the change, exactly as it was recorded, and how that identity was
 * established. The Remediated row once said "system" while History named the
 * recorded self-attested operator (Codex 3433 QA). A self-attested name keeps
 * History's own qualifier; nothing recorded reads "not recorded".
 */
export function remediationActorText(actor: {
  remediatedBy?: string | null
  remediatedByVerified?: boolean | null
  remediatedByAttribution?: string | null
}): string {
  const identity = typeof actor.remediatedBy === "string" ? actor.remediatedBy.trim() : ""
  if (!identity) return "not recorded"
  const qualifier = operatorAttributionQualifier(actor.remediatedByAttribution, actor.remediatedByVerified)
  return qualifier ? `${identity} (${qualifier})` : identity
}

/** The table cell: what the change left allowed, or unknown. Never an observed-use count. */
export function RemediatedAllowedAfterCell({ snapshotId, remediationSource }: { snapshotId?: string | null; remediationSource?: string | null }) {
  const inspectable = inspectableCheckpoint(remediationSource, snapshotId)
  const facts = changeFacts(inspectable, useSavedCheckpointStates(inspectable))
  return (
    <span
      data-testid="lp-row-allowed-after"
      title="Configured Allow actions after this change, derived from the saved checkpoint and verified against the recorded post-image. Not effective authorization and not observed use."
    >
      {facts.allowedCount === null ? "unknown" : `${facts.allowedCount} allowed (derived)`}
    </span>
  )
}

interface ReceiptProps {
  snapshotId?: string | null
  remediationSource?: string | null
  /** Graph evidence-window counts. Historical: they may predate the change. */
  observedInUse: number | null
  observedTotal: number | null
}

/** The receipt: what this change did, then the graph's historical observations, each labelled for what it is. */
export function RemediationReceipt({ snapshotId, remediationSource, observedInUse, observedTotal }: ReceiptProps) {
  const inspectable = inspectableCheckpoint(remediationSource, snapshotId)
  const facts = changeFacts(inspectable, useSavedCheckpointStates(inspectable))

  return (
    <div className="space-y-3">
      <div data-testid="lp-receipt-change" className="space-y-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          This change
        </div>
        <div className="flex justify-between text-xs gap-3" style={{ color: "var(--text-secondary)" }}>
          <span>Removed actions</span>
          <span data-testid="lp-receipt-removed" className="font-medium text-right" style={{ color: "var(--text-primary)" }}>
            {facts.removed}
          </span>
        </div>
        <div className="flex justify-between text-xs gap-3" style={{ color: "var(--text-secondary)" }}>
          <span>Allowed after this change</span>
          <span data-testid="lp-allowed-after-change" className="font-medium text-right" style={{ color: "#10b981" }}>
            {facts.allowed}
          </span>
        </div>
        {facts.derivedAndVerified && (
          <p data-testid="lp-after-derived-note" className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Derived from the saved before state and the recorded removal; its hash equals the post-image verified at
            apply. These after-state policy bytes are not stored, and the count is configured Allow actions, not
            effective authorization.
          </p>
        )}
      </div>
      <div data-testid="lp-receipt-historical" className="space-y-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Historical graph evidence (may predate this change)
        </div>
        <div className="flex justify-between text-xs gap-3" style={{ color: "var(--text-secondary)" }}>
          <span>Observed in use</span>
          <span data-testid="lp-observed-in-use" className="font-medium text-right" style={{ color: "var(--text-primary)" }}>
            {observedInUse === null
              ? "not measured"
              : `${observedInUse}${observedTotal === null ? "" : ` of ${observedTotal}`} in the evidence window at the last graph sync — not a current policy count`}
          </span>
        </div>
      </div>
    </div>
  )
}
