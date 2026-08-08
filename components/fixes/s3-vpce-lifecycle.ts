import type {
  S3OperationKind,
  S3PrivatePathState,
  S3VpceOperationSummary,
} from "@/components/topology-v0-2/estate-operations"

// Which staged change a ledger operation drives. Documents predating the
// enforcement work carry no kind and are the transport migration.
export const S3_PRIVATE_PATH_KIND: S3OperationKind = "S3_PRIVATE_PATH"
export const S3_ENFORCEMENT_KIND: S3OperationKind = "S3_BUCKET_POLICY_ENFORCEMENT"

export function operationKind(
  entry: { kind?: S3OperationKind | null } | null | undefined,
): S3OperationKind {
  return entry?.kind === S3_ENFORCEMENT_KIND ? S3_ENFORCEMENT_KIND : S3_PRIVATE_PATH_KIND
}

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
// Local token stash + offline fallback. The operations LIST now comes from
// the ledger (GET .../s3-vpce/operations — server truth, token-free), so
// localStorage is no longer the system of record. It remains for exactly two
// jobs: (1) holding the one-time bearer tokens reads never return, so the
// browser that executed (or re-armed) a change keeps its rollback path, and
// (2) a degraded resume list when the ledger is unreachable.
// ---------------------------------------------------------------------------

export interface RememberedOperation {
  operationId: string
  kind?: S3OperationKind
  systemName: string
  bucketId: string
  bucketName: string
  vpcId?: string | null
  state?: S3PrivatePathState
  snapshotId?: string | null
  endpointId?: string | null
  lifecycleToken?: string | null
  requestedBy?: string | null
  approvedBy?: string | null
  rollbackExpiresAt?: string | null
  updatedAt: string
}

// Build the view row the Fixes tab and wizard consume: server summary is
// the truth for state/scope, the browser stash contributes only what the
// server deliberately withholds (the lifecycle token) plus fallback fields.
export function operationFromSummary(
  systemName: string,
  summary: S3VpceOperationSummary,
  stashed: RememberedOperation | undefined,
): RememberedOperation {
  return {
    operationId: summary.operation_id,
    kind: summary.kind ?? stashed?.kind ?? S3_PRIVATE_PATH_KIND,
    systemName: summary.system_name ?? systemName,
    bucketId: summary.resource_id ?? stashed?.bucketId ?? "",
    bucketName: summary.bucket_name ?? stashed?.bucketName ?? summary.resource_id ?? "Unknown bucket",
    vpcId: summary.vpc_id ?? stashed?.vpcId ?? null,
    state: summary.state,
    snapshotId: summary.snapshot_id ?? stashed?.snapshotId ?? null,
    endpointId: summary.endpoint_id ?? stashed?.endpointId ?? null,
    lifecycleToken: stashed?.lifecycleToken ?? null,
    requestedBy: summary.requested_by ?? stashed?.requestedBy ?? null,
    approvedBy: summary.approved_by ?? stashed?.approvedBy ?? null,
    rollbackExpiresAt: summary.rollback_expires_at ?? stashed?.rollbackExpiresAt ?? null,
    updatedAt: summary.updated_at ?? stashed?.updatedAt ?? new Date().toISOString(),
  }
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
