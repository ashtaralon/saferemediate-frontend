import type { S3PrivatePathState } from "@/components/topology-v0-2/estate-operations"

// One place that maps every backend lifecycle state to a wizard step.
// The estate detail panel's inline index math dropped states
// (CANARY_APPLYING / TRANSPORT_VERIFIED / FAILED / ROLLED_BACK all fell
// through to step 1) — every state MUST have an explicit row here so a
// new backend state fails loudly in review instead of silently lying.
export const WIZARD_STEPS = [
  "Review",
  "Plan",
  "Safety check",
  "Approval",
  "Rollout",
  "Done",
] as const

export type WizardStepIndex = 0 | 1 | 2 | 3 | 4 | 5

export type LifecycleTone = "idle" | "active" | "error" | "rolled_back" | "done"

interface LifecycleView {
  step: WizardStepIndex
  tone: LifecycleTone
  // Short operator-facing label for status chips (cards + resume list).
  label: string
}

const LIFECYCLE_VIEW: Record<S3PrivatePathState, LifecycleView> = {
  BLOCKED_EVIDENCE: { step: 1, tone: "idle", label: "Blocked by checks" },
  READY_FOR_SIMULATION: { step: 2, tone: "active", label: "Ready for safety check" },
  SIMULATED: { step: 3, tone: "active", label: "Awaiting approval request" },
  APPROVAL_PENDING: { step: 3, tone: "active", label: "Awaiting approval" },
  APPROVED: { step: 4, tone: "active", label: "Approved · ready to apply" },
  SNAPSHOT_VERIFIED: { step: 4, tone: "active", label: "Snapshot verified" },
  CANARY_APPLYING: { step: 4, tone: "active", label: "Applying canary" },
  CANARY_MONITORING: { step: 4, tone: "active", label: "Watching canary traffic" },
  CANARY_VERIFIED: { step: 4, tone: "active", label: "Canary verified" },
  EXPANDING: { step: 4, tone: "active", label: "Expanding route tables" },
  TRANSPORT_VERIFIED: { step: 4, tone: "active", label: "Transport verified" },
  COMPLETE: { step: 5, tone: "done", label: "Complete" },
  FAILED: { step: 4, tone: "error", label: "Failed" },
  ROLLING_BACK: { step: 4, tone: "error", label: "Rolling back" },
  ROLLED_BACK: { step: 4, tone: "rolled_back", label: "Rolled back" },
  ROLLBACK_FAILED: { step: 4, tone: "error", label: "Rollback failed" },
}

export function lifecycleView(state: S3PrivatePathState | null | undefined): LifecycleView {
  if (!state) return { step: 0, tone: "idle", label: "Not started" }
  return LIFECYCLE_VIEW[state] ?? { step: 1, tone: "idle", label: state }
}

export const TERMINAL_STATES: ReadonlySet<S3PrivatePathState> = new Set([
  "COMPLETE",
  "FAILED",
  "ROLLED_BACK",
  "ROLLBACK_FAILED",
])

export function isTerminal(state: S3PrivatePathState | null | undefined): boolean {
  return Boolean(state && TERMINAL_STATES.has(state))
}

// States that belong in the tab's "In progress" strip: an approval is
// waiting on a human or AWS is mid-rollout. Pre-approval drafts
// (BLOCKED_EVIDENCE / READY_FOR_SIMULATION / SIMULATED) are NOT in
// flight — analyze mints a new operation each time, so drafts are
// abandoned freely and would otherwise pile up here forever.
export const IN_FLIGHT_STATES: ReadonlySet<S3PrivatePathState> = new Set([
  "APPROVAL_PENDING",
  "APPROVED",
  "SNAPSHOT_VERIFIED",
  "CANARY_APPLYING",
  "CANARY_MONITORING",
  "CANARY_VERIFIED",
  "EXPANDING",
  "TRANSPORT_VERIFIED",
  "ROLLING_BACK",
])

export function isInFlight(state: S3PrivatePathState | null | undefined): boolean {
  return Boolean(state && IN_FLIGHT_STATES.has(state))
}

// ---------------------------------------------------------------------------
// Local operation memory. The backend deliberately never returns bearer
// tokens on reads, so an operator who closes the tab mid-rollout would lose
// the manual-rollback path entirely. Until the backend can re-mint scoped
// tokens, we remember each operation (and its rollback material) per
// browser so the Fixes tab can re-attach and still offer rollback.
// ---------------------------------------------------------------------------

export interface RememberedOperation {
  operationId: string
  systemName: string
  bucketId: string
  bucketName: string
  vpcId?: string | null
  state?: S3PrivatePathState
  snapshotId?: string | null
  endpointId?: string | null
  lifecycleToken?: string | null
  updatedAt: string
}

const storageKey = (systemName: string) => `cyntro:fixes:s3-vpce:${systemName}`

export function rememberedOperations(systemName: string): RememberedOperation[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(storageKey(systemName))
    const parsed = raw ? (JSON.parse(raw) as RememberedOperation[]) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function rememberOperation(entry: RememberedOperation): void {
  if (typeof window === "undefined") return
  try {
    const existing = rememberedOperations(entry.systemName)
    const index = existing.findIndex((item) => item.operationId === entry.operationId)
    // Update in place so background state refreshes don't reshuffle the
    // list ("latest per bucket" reads position, not timestamps); only a
    // genuinely new operation goes to the front.
    const next = index >= 0
      ? existing.map((item, i) => (i === index ? entry : item))
      : [entry, ...existing].slice(0, 20)
    window.localStorage.setItem(storageKey(entry.systemName), JSON.stringify(next))
  } catch {
    // Remembering is best-effort — never block the operation on storage.
  }
}

export function updateRememberedOperation(
  systemName: string,
  operationId: string,
  patch: Partial<RememberedOperation>,
): void {
  const existing = rememberedOperations(systemName).find(
    (item) => item.operationId === operationId,
  )
  if (!existing) return
  rememberOperation({ ...existing, ...patch, updatedAt: new Date().toISOString() })
}
