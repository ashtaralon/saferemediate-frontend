"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  Map as MapIcon,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react"
import {
  operationalRequest,
  type OperationalDossier,
  type S3PrivatePathOperation,
  type S3VpceExecution,
  type S3VpcePlan,
  type S3VpceRollbackTokenReissue,
  type S3VpceSimulation,
  type S3VpceVerification,
} from "@/components/topology-v0-2/estate-operations"
import {
  WIZARD_STEPS,
  isTerminal,
  lifecycleView,
  rememberOperation,
  updateRememberedOperation,
  type RememberedOperation,
  type WizardStepIndex,
} from "./s3-vpce-lifecycle"

interface WizardBucket {
  id: string
  name: string
  region?: string | null
}

interface Props {
  systemName: string
  bucket: WizardBucket
  resume?: RememberedOperation | null
  accountId?: string | null
  region?: string | null
  onClose: () => void
}

const IDENTITY_KEY = "cyntro:operator-identity"

// Plain-language guidance per blocker code — same intent as the estate
// panel's map, phrased for an IT engineer who has not read the backend.
const BLOCKER_GUIDANCE: Record<string, { title: string; next: string }> = {
  VPC_SELECTION_REQUIRED: {
    title: "Pick which VPC to set up",
    next: "Consumers of this bucket run in more than one VPC (or in none). Choose one VPC below and analyze again — each VPC is its own staged setup.",
  },
  NO_OBSERVED_CONSUMERS: {
    title: "Nothing to change in this VPC",
    next: "No workload in this VPC was observed using the bucket. No AWS change is needed here.",
  },
  NO_PUBLIC_S3_PATH: {
    title: "Traffic is already on the private path",
    next: "The observed consumers already reach S3 through a Gateway endpoint. Nothing to do — keep monitoring.",
  },
  UNKNOWN_NETWORK_PATH: {
    title: "The current S3 route is not proven yet",
    next: "Refresh AWS network inventory and behavioral data so every consumer can be tied to its subnet, route table, and current S3 path.",
  },
  EXISTING_ENDPOINT_NOT_OPTED_IN: {
    title: "The existing endpoint is not authorized for managed changes",
    next: "Tag the endpoint with cyntro:allow-managed-route-associations=true once your team confirms Cyntro may manage its route-table associations.",
  },
  S3_DATA_EVENT_COVERAGE_MISSING: {
    title: "Verification logging is not enabled for this bucket",
    next: "Enable CloudTrail S3 data events for this bucket. The rollout proves success from real traffic — without the log there is no proof, so the setup will not start.",
  },
  S3_DATA_EVENT_COVERAGE_UNKNOWN: {
    title: "Verification logging status is unknown",
    next: "Run a collectors sync so Cyntro can confirm CloudTrail S3 data events cover this bucket, then analyze again.",
  },
  BUCKET_NETWORK_POLICY_INCOMPATIBLE: {
    title: "The bucket policy would break when the route changes",
    next: "This bucket's policy has an IP/network condition (for example aws:SourceIp) that stops matching once traffic moves to the private path. Update the policy condition first.",
  },
  MULTIPLE_S3_ENDPOINTS: {
    title: "More than one S3 endpoint exists in this VPC",
    next: "Cyntro needs exact endpoint ownership. Remove the duplicate or specify which endpoint to adopt.",
  },
  OPERATION_LEDGER_UNAVAILABLE: {
    title: "The change record store is temporarily unavailable",
    next: "No AWS change was authorized. Retry once the operation ledger recovers.",
  },
}

function blockerGuidance(code: string) {
  return (
    BLOCKER_GUIDANCE[code] ?? {
      title: code.replaceAll("_", " ").toLowerCase(),
      next: "Resolve this check, then analyze again.",
    }
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "#DDE3E8", background: "#F8FAFC" }}>
      <div className="text-xl font-bold" style={{ color: "#1A2330" }}>{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#5A6B7A" }}>{label}</div>
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <strong className="text-slate-800">{label}</strong>
      <span>{children}</span>
    </>
  )
}

export function S3VpceWizard({ systemName, bucket, resume, accountId, region, onClose }: Props) {
  const [dossier, setDossier] = useState<OperationalDossier | null>(null)
  const [dossierError, setDossierError] = useState<string | null>(null)
  const [dossierRetryNonce, setDossierRetryNonce] = useState(0)
  const [plan, setPlan] = useState<S3VpcePlan | null>(null)
  const [simulation, setSimulation] = useState<S3VpceSimulation | null>(null)
  const [operation, setOperation] = useState<S3PrivatePathOperation | null>(null)
  const [execution, setExecution] = useState<S3VpceExecution | null>(null)
  const [verification, setVerification] = useState<S3VpceVerification | null>(null)
  const [selectedVpc, setSelectedVpc] = useState<string>(resume?.vpcId ?? "")
  const [requester, setRequester] = useState("")
  const [approver, setApprover] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [rollbackConfirmation, setRollbackConfirmation] = useState("")
  // A lifecycle token re-minted in THIS session via the rollback-token
  // endpoint (cross-browser rollback for resumed operations).
  const [rearm, setRearm] = useState<S3VpceRollbackTokenReissue | null>(null)
  const [action, setAction] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // null = follow the operation's real step; a number = the operator
  // navigated back to re-read an earlier screen.
  const [pinnedStep, setPinnedStep] = useState<WizardStepIndex | null>(null)
  const resumedRef = useRef(false)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(IDENTITY_KEY)
      if (saved) setRequester(saved)
    } catch { /* best effort */ }
  }, [])

  // The operation id we are attached to — from a fresh analyze or a resume.
  const operationId = plan?.operation_id ?? operation?.operation_id ?? resume?.operationId ?? null
  const operationState = operation?.state
    ?? verification?.operation_state
    ?? execution?.operation_state
    ?? simulation?.operation_state
    ?? plan?.operation_state
    ?? resume?.state
  const view = lifecycleView(operationState ?? null)
  const currentStep: WizardStepIndex = plan || operation ? view.step : 0
  const shownStep: WizardStepIndex = pinnedStep ?? currentStep

  const post = useCallback(
    async <T,>(path: string, body: Record<string, unknown>): Promise<T> =>
      operationalRequest<T>(systemName, path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    [systemName],
  )

  const runAction = useCallback(async (name: string, fn: () => Promise<void>) => {
    setAction(name)
    setActionError(null)
    try {
      await fn()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Operation failed")
    } finally {
      setAction(null)
    }
  }, [])

  // Load the behavioral dossier once — it powers the Review step and the
  // VPC cohort picker.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setDossierError(null)
      const query = new URLSearchParams({ resource_id: bucket.id, window_days: "90" })
      if (accountId) query.set("account_id", accountId)
      if (region) query.set("region", region)
      try {
        const body = await operationalRequest<OperationalDossier>(systemName, `resource?${query}`)
        if (!cancelled) setDossier(body)
      } catch (err) {
        if (!cancelled) setDossierError(err instanceof Error ? err.message : "Unable to load bucket context")
      }
    }
    void load()
    return () => { cancelled = true }
  }, [systemName, bucket.id, accountId, region, dossierRetryNonce])

  const refreshOperation = useCallback(async () => {
    if (!operationId) return
    const current = await operationalRequest<S3PrivatePathOperation>(
      systemName,
      `s3-vpce/operations/${encodeURIComponent(operationId)}?include_history=false`,
    )
    // The ledger read strips all bearer material (by design) — never let a
    // refresh wipe the execution_plan_token the approve response handed us.
    setOperation((previous) => ({
      ...current,
      execution_plan_token: current.execution_plan_token ?? previous?.execution_plan_token,
    }))
    if (current.execution) {
      setExecution((previous) => ({
        ...current.execution,
        // Reads never return bearer tokens — keep the one from execute time.
        lifecycle_token: previous?.lifecycle_token ?? resume?.lifecycleToken ?? undefined,
      } as S3VpceExecution))
    }
    // The stored document keeps the dry-run result (tokens stripped) —
    // rehydrate it so a resumed session can still show and gate on it.
    const storedSimulation = (current as unknown as { simulation?: S3VpceSimulation }).simulation
    if (storedSimulation) {
      setSimulation((previous) => previous ?? storedSimulation)
    }
    const latest = current.verification?.full
      ?? current.verification?.last_stage
      ?? current.verification?.canary
    if (latest) setVerification(latest)
    updateRememberedOperation(systemName, current.operation_id, {
      state: current.state,
      snapshotId: current.execution?.snapshot_id ?? undefined,
      endpointId: current.execution?.endpoint_id ?? undefined,
    })
  }, [operationId, systemName, resume?.lifecycleToken])

  // Resume: attach to a remembered operation on mount.
  useEffect(() => {
    if (!resume?.operationId || resumedRef.current) return
    resumedRef.current = true
    void runAction("resume", refreshOperation)
  }, [resume?.operationId, refreshOperation, runAction])

  // Live polling while the operation is in flight.
  useEffect(() => {
    if (!operationId || !operationState || isTerminal(operationState)) return
    // Poll only once the rollout is actually moving; pre-execute states
    // change through this operator's own actions. APPROVED is deliberately
    // NOT polled: nothing changes server-side until we execute, and the
    // ledger read would wipe the one-time execution_plan_token.
    const polling = new Set([
      "SNAPSHOT_VERIFIED", "CANARY_APPLYING", "CANARY_MONITORING",
      "CANARY_VERIFIED", "EXPANDING", "TRANSPORT_VERIFIED", "ROLLING_BACK",
    ])
    if (!polling.has(operationState)) return
    let cancelled = false
    const timer = setInterval(() => {
      if (!cancelled) void refreshOperation().catch(() => undefined)
    }, 5_000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [operationId, operationState, refreshOperation])

  const candidateVpcs = useMemo(() => {
    const observed = dossier?.dependencies.upstream.filter((c) => c.evidence_type === "observed") ?? []
    return Array.from(new Set(observed.map((c) => c.vpc_id).filter((v): v is string => Boolean(v)))).sort()
  }, [dossier])

  const analyze = () => runAction("analyze", async () => {
    setPlan(null)
    setSimulation(null)
    setOperation(null)
    setExecution(null)
    setVerification(null)
    // A token re-minted for a previous operation must never survive into a
    // fresh analysis — the new operation gets its own material at execute.
    setRearm(null)
    const body = await post<S3VpcePlan>("s3-vpce/plan", {
      resource_id: bucket.id,
      vpc_id: selectedVpc || undefined,
      account_id: accountId || undefined,
      region: region || bucket.region || undefined,
      window_days: 90,
    })
    setPlan(body)
    // Always land on the Plan step so the operator reviews the scope before
    // the safety check — a READY analysis must not skip its own review.
    setPinnedStep(1)
    if (body.operation_id) {
      rememberOperation({
        operationId: body.operation_id,
        systemName,
        bucketId: bucket.id,
        bucketName: body.bucket_name ?? bucket.name,
        vpcId: body.vpc_id ?? (selectedVpc || null),
        state: body.operation_state,
        updatedAt: new Date().toISOString(),
      })
    }
  })

  const simulate = () => runAction("simulate", async () => {
    // The signed plan token exists only in the analyze response — it cannot
    // be recovered on resume. The resume banner explains; this guard is the
    // honest error if the button is reached anyway.
    if (!plan?.plan_token || !plan.operation_id) {
      throw new Error("This setup was analyzed in another session — run the analysis again to continue from here.")
    }
    const result = await post<S3VpceSimulation>("s3-vpce/simulate", {
      operation_id: plan.operation_id,
      plan_token: plan.plan_token,
    })
    setSimulation(result)
    updateRememberedOperation(systemName, plan.operation_id, { state: result.operation_state })
  })

  const requestApproval = () => runAction("request-approval", async () => {
    if (!operationId) throw new Error("No operation to request approval for — analyze first.")
    try { window.localStorage.setItem(IDENTITY_KEY, requester) } catch { /* best effort */ }
    const result = await post<S3PrivatePathOperation>("s3-vpce/request-approval", {
      operation_id: operationId,
      requested_by: requester,
      note: "Move the reviewed S3 route-table cohort through a Gateway endpoint.",
    })
    setOperation(result)
    updateRememberedOperation(systemName, operationId, { state: result.state })
  })

  const approve = () => runAction("approve", async () => {
    if (!operationId) throw new Error("No operation to approve — analyze first.")
    const result = await post<S3PrivatePathOperation>("s3-vpce/approve", {
      operation_id: operationId,
      approved_by: approver,
      note: "Reviewed cohort, canary, verification gates, and rollback scope.",
    })
    // The approve response is the ONLY carrier of execution_plan_token.
    setOperation(result)
    updateRememberedOperation(systemName, operationId, { state: result.state })
  })

  const execute = () => runAction("execute", async () => {
    const executionPlanToken = operation?.execution_plan_token
    if (!operationId) throw new Error("No operation to execute — analyze first.")
    if (!executionPlanToken) {
      throw new Error("The execution authorization from approval is not in this session — it is handed out once, at approval time. Re-run the flow from analysis.")
    }
    const result = await post<S3VpceExecution>("s3-vpce/execute", {
      operation_id: operationId,
      plan_token: executionPlanToken,
      confirmation,
      requested_by: requester,
    })
    setExecution(result)
    setOperation((previous) => previous ? {
      ...previous,
      state: result.operation_state ?? previous.state,
      version: result.operation_version ?? previous.version,
      execution: result,
    } : previous)
    updateRememberedOperation(systemName, operationId, {
      state: result.operation_state,
      snapshotId: result.snapshot_id ?? undefined,
      endpointId: result.endpoint_id ?? undefined,
      lifecycleToken: result.lifecycle_token ?? undefined,
    })
  })

  const reconcile = () => runAction("reconcile", async () => {
    if (!operationId) return
    await post<Record<string, unknown>>("s3-vpce/reconcile", { operation_id: operationId })
    await refreshOperation()
  })

  const lifecycleToken = execution?.lifecycle_token ?? rearm?.lifecycle_token ?? resume?.lifecycleToken ?? null
  const snapshotId = execution?.snapshot_id ?? operation?.execution?.snapshot_id ?? rearm?.snapshot_id ?? resume?.snapshotId ?? null

  const rollback = () => runAction("rollback", async () => {
    if (!lifecycleToken || !snapshotId || !operationId) return
    const result = await post<Record<string, unknown>>("s3-vpce/rollback", {
      operation_id: operationId,
      plan_token: lifecycleToken,
      snapshot_id: snapshotId,
      confirmation: rollbackConfirmation,
      requested_by: requester,
    })
    setVerification({ ...result, state: "ROLLED_BACK" } as S3VpceVerification)
    await refreshOperation().catch(() => undefined)
  })

  // Cross-browser rollback: re-mint the one-time lifecycle token. The server
  // gates this to the operation's own requester/approver, requires an applied
  // snapshot, and re-issues under the ORIGINAL 72h expiry — never a fresh
  // window — so re-arming is not a read-to-mutation escalation.
  const rearmRollback = () => runAction("rearm-rollback", async () => {
    if (!operationId) return
    try { window.localStorage.setItem(IDENTITY_KEY, requester) } catch { /* best effort */ }
    const result = await post<S3VpceRollbackTokenReissue>(
      `s3-vpce/operations/${encodeURIComponent(operationId)}/rollback-token`,
      { operation_id: operationId, requested_by: requester.trim() },
    )
    setRearm(result)
    // Stash the re-armed material so a reload of this browser keeps it.
    rememberOperation({
      operationId,
      systemName,
      bucketId: bucket.id,
      bucketName: plan?.bucket_name ?? resume?.bucketName ?? bucket.name,
      vpcId: plan?.vpc_id ?? resume?.vpcId ?? null,
      state: operationState,
      snapshotId: result.snapshot_id,
      endpointId: result.endpoint_id,
      lifecycleToken: result.lifecycle_token,
      requestedBy: operation?.approval?.requested_by ?? resume?.requestedBy ?? null,
      approvedBy: operation?.approval?.approved_by ?? resume?.approvedBy ?? null,
      rollbackExpiresAt: result.rollback_expires_at,
      updatedAt: new Date().toISOString(),
    })
  })

  const blockerCodes = new Set(plan?.blockers.map((b) => b.code) ?? [])
  const noMigrationRequired = blockerCodes.has("NO_OBSERVED_CONSUMERS")
    || blockerCodes.has("NO_PUBLIC_S3_PATH")
    || plan?.endpoint_mode === "NO_CHANGE"
  const needsVpcChoice = blockerCodes.has("VPC_SELECTION_REQUIRED")
  const migratableConsumers = plan?.impact.migrating_consumers ?? plan?.impact.observed_consumers ?? 0
  const applyBucketName = plan?.bucket_name ?? resume?.bucketName ?? bucket.name
  const applyVpcId = plan?.vpc_id ?? resume?.vpcId ?? null
  const expectedApply = applyBucketName && applyVpcId ? `APPLY ${applyBucketName} ${applyVpcId}` : ""
  const expectedRollback = snapshotId ? `ROLLBACK ${snapshotId}` : ""

  const stepDone = (index: number) => index < currentStep
  const rolloutActive = ["APPROVED", "SNAPSHOT_VERIFIED", "CANARY_APPLYING", "CANARY_MONITORING", "CANARY_VERIFIED", "EXPANDING", "TRANSPORT_VERIFIED"].includes(operationState ?? "")
  // A rolled-back / failed-rollback operation must not offer rollback again.
  const rollbackAvailable = Boolean(snapshotId)
    && operationState !== "ROLLED_BACK"
    && operationState !== "ROLLBACK_FAILED"
    && operationState !== "ROLLING_BACK"
  const rollbackExpiresAt = rearm?.rollback_expires_at
    ?? execution?.lifecycle_expires_at
    ?? operation?.execution?.lifecycle_expires_at
    ?? resume?.rollbackExpiresAt
    ?? null
  // Mirrors the server's refusal threshold (<60s remaining counts as closed).
  const rollbackWindowClosed = rollbackExpiresAt
    ? Date.parse(rollbackExpiresAt) - Date.now() < 60_000
    : false
  const rollbackRequestedBy = operation?.approval?.requested_by ?? resume?.requestedBy ?? null
  const rollbackApprovedBy = operation?.approval?.approved_by ?? resume?.approvedBy ?? null
  // Resumed from another session with no recoverable bearer token:
  // READY_FOR_SIMULATION needs the analyze-time plan_token, APPROVED needs
  // the approve-time execution_plan_token — both are handed out exactly
  // once and never readable again. request-approval and approve only need
  // the operation id, so SIMULATED / APPROVAL_PENDING resumes still work.
  const resumedWithoutPlan = !plan && !!operationState && (
    operationState === "READY_FOR_SIMULATION"
    || (operationState === "APPROVED" && !operation?.execution_plan_token)
  )
  // A FAILED operation that never applied anything (dry-run failure) is a
  // closed attempt — the only way forward is a fresh analysis.
  const failedBeforeApply = operationState === "FAILED" && !snapshotId && !execution && !operation?.execution

  return (
    <div className="fixed inset-0 z-[240] flex items-stretch justify-center bg-slate-900/40 p-0 md:items-center md:p-6" role="dialog" aria-label={`S3 private path setup for ${bucket.name}`}>
      <div className="flex w-full max-w-4xl flex-col overflow-hidden bg-white shadow-2xl md:max-h-[92vh] md:rounded-2xl" style={{ color: "#1A2330" }}>
        {/* Header */}
        <header className="border-b px-6 py-4" style={{ borderColor: "#DDE3E8", background: "#FFFFFF" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "#0E8B7A" }}>
                Configuration fix · S3 private path
              </div>
              <h2 className="mt-1 truncate text-lg font-bold">{bucket.name}</h2>
              <p className="mt-0.5 text-xs" style={{ color: "#5A6B7A" }}>
                Route this bucket&apos;s traffic through an S3 Gateway endpoint instead of the internet gateway. Staged, verified from real traffic, instant rollback.
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Close setup">
              <X className="h-5 w-5" style={{ color: "#5A6B7A" }} />
            </button>
          </div>
          {/* Stepper */}
          <div className="mt-4 grid grid-cols-6 gap-1" aria-label="Setup progress">
            {WIZARD_STEPS.map((step, index) => {
              const isCurrent = index === currentStep
              const isShown = index === shownStep
              const done = stepDone(index)
              const errorHere = isCurrent && (view.tone === "error" || view.tone === "rolled_back")
              return (
                <button
                  key={step}
                  type="button"
                  disabled={index > currentStep}
                  onClick={() => setPinnedStep(index === currentStep ? null : (index as WizardStepIndex))}
                  className="min-w-0 text-center disabled:cursor-not-allowed"
                  data-testid={`vpce-wizard-step-${index}`}
                >
                  <div
                    className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold"
                    style={errorHere
                      ? { borderColor: "#FCA5A5", background: "#FEF2F2", color: "#B91C1C" }
                      : done
                        ? { borderColor: "#00C2A8", background: "#0E8B7A", color: "#FFFFFF" }
                        : isCurrent
                          ? { borderColor: "#00C2A8", background: "#E6FBF7", color: "#0E8B7A" }
                          : { borderColor: "#DDE3E8", background: "#F8FAFC", color: "#7A8996" }}
                  >
                    {done ? "✓" : errorHere ? "!" : index + 1}
                  </div>
                  <span
                    className="block truncate text-[9px] font-semibold uppercase tracking-wide"
                    style={{ color: isShown ? "#0E8B7A" : "#7A8996" }}
                  >
                    {step}
                  </span>
                </button>
              )
            })}
          </div>
          {pinnedStep !== null && pinnedStep !== currentStep ? (
            <button
              type="button"
              onClick={() => setPinnedStep(null)}
              className="mt-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold"
              style={{ borderColor: "#9FE8DC", background: "#E6FBF7", color: "#0E8B7A" }}
            >
              <ArrowRight className="h-3 w-3" /> Return to the current step · {WIZARD_STEPS[currentStep]}
            </button>
          ) : null}
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5" style={{ background: "#F4F6F8" }}>
          {resumedWithoutPlan && shownStep >= 2 ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" data-testid="vpce-wizard-resume-banner">
              <strong>Resumed from another session.</strong> The signed plan and its safety-check authorization were
              issued to the session that created them and cannot be recovered here. To continue this setup from this
              browser, run <strong>Analyze this fix</strong> again — it starts a fresh, fully re-checked plan (the
              old draft is abandoned safely; nothing was changed in AWS).
            </div>
          ) : null}
          {failedBeforeApply ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700" data-testid="vpce-wizard-failed-preapply">
              <strong>The safety check failed and this attempt is closed.</strong> Nothing was changed in AWS.
              Review the dry-run errors, fix the cause, and start a fresh analysis.
            </div>
          ) : null}
          {/* Step 0 — Review */}
          {shownStep === 0 ? (
            <div className="space-y-4" data-testid="vpce-wizard-review">
              <div className="rounded-xl border p-4" style={{ borderColor: "#C9D4DE", background: "#FFFFFF" }}>
                <div className="text-sm font-bold">What this setup does</div>
                <p className="mt-1 text-xs leading-5" style={{ color: "#5A6B7A" }}>
                  Workloads in this system reach <strong>{bucket.name}</strong> over the internet path today.
                  This setup adds an <strong>S3 Gateway endpoint</strong> (free, AWS-managed) and attaches it to the exact
                  route tables those workloads use, so S3 traffic stays on the AWS network. Applications keep working
                  unchanged — the route is the only thing that moves, one route table at a time, verified from real traffic.
                </p>
              </div>
              {dossierError ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <span>{dossierError}</span>
                  <button
                    type="button"
                    onClick={() => setDossierRetryNonce((n) => n + 1)}
                    className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700"
                    data-testid="vpce-wizard-dossier-retry"
                  >
                    Retry
                  </button>
                </div>
              ) : null}
              {dossier ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <Metric label="Consumers" value={dossier.dependencies.summary.consumer_count} />
                    <Metric label="Observed links" value={dossier.dependencies.summary.observed} />
                    <Metric label="Evidence" value={dossier.evidence.coverage_state} />
                  </div>
                  {candidateVpcs.length > 1 || (candidateVpcs.length > 0 && needsVpcChoice) ? (
                    <div className="rounded-xl border p-4" style={{ borderColor: "#DDE3E8", background: "#FFFFFF" }}>
                      <div className="text-xs font-bold text-slate-800">Consumers run in {candidateVpcs.length} VPCs — each VPC is set up separately</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {candidateVpcs.map((vpc) => (
                          <button
                            key={vpc}
                            type="button"
                            onClick={() => setSelectedVpc(vpc)}
                            className="rounded-lg border px-3 py-1.5 font-mono text-xs"
                            style={selectedVpc === vpc
                              ? { borderColor: "#00C2A8", background: "#E6FBF7", color: "#0E8B7A" }
                              : { borderColor: "#DDE3E8", background: "#FFFFFF", color: "#5A6B7A" }}
                          >
                            {vpc}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : !dossierError ? (
                <div className="flex items-center gap-2 text-sm" style={{ color: "#5A6B7A" }}>
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading who uses this bucket…
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Step 1 — Plan */}
          {shownStep === 1 && plan ? (
            <div className="space-y-4" data-testid="vpce-wizard-plan">
              {noMigrationRequired ? (
                <div className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs font-semibold text-teal-800">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {blockerCodes.has("NO_OBSERVED_CONSUMERS")
                    ? "Analysis complete · nothing to change in the selected VPC"
                    : "Analysis complete · traffic is already on a private S3 path"}
                </div>
              ) : (
                <div
                  className="rounded-xl border p-4"
                  style={plan.readiness === "READY"
                    ? { borderColor: "#9FE8DC", background: "#F0FDFA" }
                    : { borderColor: "#FED7AA", background: "#FFF7ED" }}
                >
                  <div className="flex items-start gap-2">
                    {plan.readiness === "READY"
                      ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
                      : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />}
                    <div>
                      <div className="text-sm font-bold">
                        {plan.readiness === "READY"
                          ? "The change is scoped and ready for its safety check"
                          : "The change is blocked until these checks pass"}
                      </div>
                      <p className="mt-1 text-[11px]" style={{ color: "#5A6B7A" }}>
                        Scope: <strong>{plan.vpc_id ?? "VPC not selected"}</strong> · Bucket: <strong>{plan.bucket_name}</strong>
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {!noMigrationRequired ? (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Metric label="Consumers moving" value={migratableConsumers} />
                    <Metric label="Workloads in scope" value={plan.impact.route_table_workloads} />
                    <Metric label="Route tables" value={plan.impact.route_tables} />
                    <Metric label="S3 destinations" value={plan.impact.s3_destinations ?? 0} />
                  </div>
                  <div className="rounded-xl border bg-white p-3 text-xs text-slate-600" style={{ borderColor: "#DDE3E8" }}>
                    <div className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-2">
                      <InfoRow label="Endpoint">
                        {plan.endpoint_mode === "ADOPT_EXISTING"
                          ? `Use existing endpoint ${plan.existing_endpoint_id}`
                          : "Create a new managed S3 Gateway endpoint"}
                      </InfoRow>
                      <InfoRow label="First route table">
                        <span className="font-mono">{plan.canary_route_table_id ?? "—"}</span>
                        {" "}(the one serving the fewest workloads)
                      </InfoRow>
                      <InfoRow label="Not touched">IAM, bucket policies, security groups — no permission changes in this operation</InfoRow>
                      <InfoRow label="Rollback">Remove only what this operation adds · seconds, one click</InfoRow>
                    </div>
                  </div>
                </>
              ) : null}
              {(plan.excluded_consumers?.length ?? 0) > 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="text-xs font-bold text-slate-800">Not part of this change ({plan.excluded_consumers?.length})</div>
                  <div className="mt-2 space-y-1.5">
                    {plan.excluded_consumers?.map((consumer, index) => (
                      <div key={`${consumer.resource_id}-${index}`} className="text-xs text-slate-600">
                        <strong>{consumer.resource_name || consumer.resource_id}</strong> · {consumer.reason}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {plan.blockers.length ? (
                <div className="space-y-2">
                  {plan.blockers.map((blocker) => {
                    const guidance = blockerGuidance(blocker.code)
                    const benign = blocker.code === "NO_OBSERVED_CONSUMERS" || blocker.code === "NO_PUBLIC_S3_PATH"
                    return (
                      <div key={blocker.code} className={`rounded-xl border bg-white p-3 text-xs ${benign ? "border-teal-200" : "border-orange-200"}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className={benign ? "text-teal-800" : "text-orange-800"}>{guidance.title}</strong>
                          <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] ${benign ? "bg-teal-50 text-teal-700" : "bg-orange-50 text-orange-700"}`}>{blocker.code}</span>
                        </div>
                        <p className="mt-1 leading-5 text-slate-600">{blocker.message}</p>
                        <p className="mt-1.5 leading-5 text-slate-700"><strong>Next:</strong> {guidance.next}</p>
                      </div>
                    )
                  })}
                </div>
              ) : null}
              {needsVpcChoice && candidateVpcs.length > 0 ? (
                <div className="rounded-xl border bg-white p-3" style={{ borderColor: "#DDE3E8" }}>
                  <div className="text-xs font-bold text-slate-800">Choose the VPC for this setup</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {candidateVpcs.map((vpc) => (
                      <button
                        key={vpc}
                        type="button"
                        onClick={() => setSelectedVpc(vpc)}
                        className="rounded-lg border px-3 py-1.5 font-mono text-xs"
                        style={selectedVpc === vpc
                          ? { borderColor: "#00C2A8", background: "#E6FBF7", color: "#0E8B7A" }
                          : { borderColor: "#DDE3E8", background: "#FFFFFF", color: "#5A6B7A" }}
                      >
                        {vpc}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {shownStep === 1 && !plan ? (
            <div className="text-sm" style={{ color: "#5A6B7A" }}>Run the analysis from the Review step first.</div>
          ) : null}

          {/* Step 2 — Safety check */}
          {shownStep === 2 ? (
            <div className="space-y-4" data-testid="vpce-wizard-safety">
              <div className="rounded-xl border p-4" style={{ borderColor: "#C9D4DE", background: "#FFFFFF" }}>
                <div className="text-sm font-bold">Prove it before touching AWS</div>
                <p className="mt-1 text-xs leading-5" style={{ color: "#5A6B7A" }}>
                  The dry-run asks AWS to validate the exact change — same API call, no mutation. The plan is frozen:
                  if anything in the environment changes between now and apply, execution refuses and asks for a fresh analysis.
                </p>
              </div>
              {simulation ? (
                <div
                  className={`rounded-xl border bg-white p-3 text-xs ${simulation.safe_to_apply ? "border-teal-200 text-teal-800" : "border-red-200 text-red-700"}`}
                  data-testid="vpce-wizard-simulation"
                >
                  <strong>{simulation.safe_to_apply ? "AWS dry-run passed" : "Dry-run blocked"}</strong>
                  {" "}· plan frozen under hash <span className="font-mono">{simulation.plan_hash.slice(0, 10)}…</span>
                  {simulation.errors?.length ? (
                    <ul className="mt-1 list-disc pl-4">{simulation.errors.map((e) => <li key={e}>{e}</li>)}</ul>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                  No dry-run yet. Use the button below — it takes a few seconds.
                </div>
              )}
            </div>
          ) : null}

          {/* Step 3 — Approval */}
          {shownStep === 3 ? (
            <div className="space-y-4" data-testid="vpce-wizard-approval">
              <div className="rounded-xl border p-4" style={{ borderColor: "#C9D4DE", background: "#FFFFFF" }}>
                <div className="text-sm font-bold">Four-eyes approval</div>
                <p className="mt-1 text-xs leading-5" style={{ color: "#5A6B7A" }}>
                  One person requests, a different person approves. The approval freezes the exact plan — approver and
                  requester are recorded on the change ledger.
                </p>
              </div>
              {operationState === "SIMULATED" || !operationState || operationState === "READY_FOR_SIMULATION" ? (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                  <label className="block text-xs font-semibold text-slate-700">
                    Your identity (requester)
                    <input
                      aria-label="Requester identity"
                      value={requester}
                      onChange={(e) => setRequester(e.target.value)}
                      placeholder="name@company.com"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    />
                  </label>
                </div>
              ) : null}
              {operationState === "APPROVAL_PENDING" ? (
                <div className="space-y-2 rounded-xl border border-amber-200 bg-white p-3">
                  <p className="text-xs text-slate-600">
                    Requested by <strong>{operation?.approval?.requested_by}</strong>. A different operator must approve.
                  </p>
                  <label className="block text-xs font-semibold text-slate-700">
                    Approver identity
                    <input
                      aria-label="Approver identity"
                      value={approver}
                      onChange={(e) => setApprover(e.target.value)}
                      placeholder="approver@company.com"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    />
                  </label>
                </div>
              ) : null}
              {operationState === "APPROVED" ? (
                <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs font-semibold text-teal-800">
                  Approved by {operation?.approval?.approved_by}. Continue to the rollout step.
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Step 4 — Rollout */}
          {shownStep === 4 ? (
            <div className="space-y-4" data-testid="vpce-wizard-rollout">
              {operationState === "APPROVED" ? (
                <div className="space-y-2 rounded-xl border border-teal-200 bg-white p-3">
                  <p className="text-xs text-slate-600">
                    Applying takes a snapshot first, then attaches the endpoint to the <strong>first route table only</strong>.
                    Cyntro watches real traffic move, then expands one route table at a time. Everything is undone
                    automatically if proof does not arrive in time.
                  </p>
                  <label className="block text-xs font-semibold text-slate-700">
                    Type <span className="font-mono">{expectedApply}</span> to start
                    <input
                      aria-label="Apply confirmation"
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs"
                    />
                  </label>
                </div>
              ) : null}
              {view.tone === "error" || view.tone === "rolled_back" ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700" data-testid="vpce-wizard-error-state">
                  <strong>{view.label}.</strong>{" "}
                  {operationState === "ROLLED_BACK"
                    ? "The previous routing was restored from the snapshot. Review the verification details, fix the cause, and analyze again when ready."
                    : operationState === "ROLLBACK_FAILED"
                      ? "Automatic restore did not complete — the snapshot is retained. Escalate to the platform owner before any further change."
                      : "No further AWS changes are being made. Review the details below."}
                </div>
              ) : null}
              {execution || operation?.execution ? (
                <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-blue-900">
                    <ShieldCheck className="h-5 w-5" /> {view.label}
                  </div>
                  <p className="text-xs text-blue-800">
                    Endpoint <span className="font-mono">{execution?.endpoint_id ?? operation?.execution?.endpoint_id ?? "—"}</span>
                    {" "}· snapshot <span className="font-mono">{snapshotId ?? "—"}</span>
                  </p>
                  {rolloutActive ? (
                    <div className="space-y-2 rounded-lg border border-blue-200 bg-white p-3 text-xs text-blue-900">
                      <div className="flex items-center gap-2 font-semibold"><RefreshCw className="h-3.5 w-3.5" /> Automatic rollout is active</div>
                      <p className="leading-5 text-blue-800">
                        Cyntro verifies the exact AWS route and fresh observed S3 traffic, expands one route table at a
                        time, and automatically restores the snapshot if proof does not arrive before the safety timeout.
                      </p>
                    </div>
                  ) : null}
                  {verification ? (
                    <div className="space-y-1 rounded-lg bg-white p-3 text-xs text-blue-900" data-testid="vpce-wizard-verification">
                      <div>
                        Verification: <strong>{verification.state}</strong>
                        {verification.expected_s3_flows != null ? (
                          <> · {verification.fresh_private_s3_flows ?? 0}/{verification.expected_s3_flows} fresh private flows</>
                        ) : null}
                        {verification.route_scope_verified != null ? (
                          <> · route scope {verification.route_scope_verified ? "verified" : "pending"}</>
                        ) : null}
                      </div>
                      {verification.expected_s3_actions != null || verification.endpoint_denial_rows != null ? (
                        <div>
                          {verification.expected_s3_actions != null ? (
                            <>Actions observed privately: {verification.fresh_private_s3_actions ?? 0}/{verification.expected_s3_actions}</>
                          ) : null}
                          {verification.endpoint_denial_rows != null ? (
                            <> · endpoint denials: {verification.endpoint_denial_rows}</>
                          ) : null}
                        </div>
                      ) : null}
                      {verification.remaining_route_table_ids?.length ? (
                        <div>Remaining route tables: {verification.remaining_route_table_ids.length}</div>
                      ) : null}
                      {verification.message ? <div>{verification.message}</div> : null}
                      {verification.evidence_refresh?.success === false ? (
                        <div className="font-semibold text-amber-700">
                          Evidence refresh pending: {verification.evidence_refresh.error ?? "collector unavailable"}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {rollbackAvailable ? (
                    <div className="space-y-2 border-t border-blue-200 pt-3">
                      {rollbackExpiresAt ? (
                        <p className="text-[11px] font-semibold text-blue-900" data-testid="vpce-wizard-rollback-window">
                          {rollbackWindowClosed
                            ? "The rollback window has closed — the snapshot is retained for audit."
                            : `Rollback window open until ${new Date(rollbackExpiresAt).toLocaleString()}.`}
                        </p>
                      ) : null}
                      {lifecycleToken ? (
                        <>
                          {rearm ? (
                            <p className="text-[11px] font-semibold text-teal-700" data-testid="vpce-wizard-rearmed">
                              Rollback re-armed for this session.
                            </p>
                          ) : null}
                          <label className="block text-xs font-semibold text-blue-900">
                            Manual rollback — type <span className="font-mono">{expectedRollback}</span>
                            <input
                              aria-label="Rollback confirmation"
                              value={rollbackConfirmation}
                              onChange={(e) => setRollbackConfirmation(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-blue-300 bg-white px-3 py-2 font-mono text-xs"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={rollback}
                            disabled={!!action || rollbackConfirmation !== expectedRollback || rollbackWindowClosed}
                            className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-40"
                            data-testid="vpce-wizard-rollback"
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Roll back from snapshot
                          </button>
                        </>
                      ) : rollbackWindowClosed ? (
                        <p className="text-[11px] leading-5 text-blue-800">
                          Manual rollback is no longer available from any session. Restoring the retained snapshot now
                          is a platform-owner action.
                        </p>
                      ) : (
                        <div className="space-y-2" data-testid="vpce-wizard-rearm">
                          <p className="text-[11px] leading-5 text-blue-800">
                            The rollback authorization was issued once, to the session that applied this change.
                            Re-arm it from here — only this operation&apos;s requester
                            {rollbackRequestedBy ? <> (<strong>{rollbackRequestedBy}</strong>)</> : null} or approver
                            {rollbackApprovedBy ? <> (<strong>{rollbackApprovedBy}</strong>)</> : null} can, and the
                            original rollback window is never extended. The automatic safety timeout protects this
                            rollout either way.
                          </p>
                          <label className="block text-xs font-semibold text-blue-900">
                            Your identity
                            <input
                              aria-label="Re-arm identity"
                              value={requester}
                              onChange={(e) => setRequester(e.target.value)}
                              placeholder="name@company.com"
                              className="mt-1 w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={rearmRollback}
                            disabled={!!action || requester.trim().length < 3}
                            className="inline-flex items-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-blue-900 disabled:opacity-40"
                            data-testid="vpce-wizard-rearm-rollback"
                          >
                            {action === "rearm-rollback"
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <KeyRound className="h-3.5 w-3.5" />}
                            Re-arm rollback
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Step 5 — Done */}
          {shownStep === 5 ? (
            <div className="space-y-4" data-testid="vpce-wizard-done">
              <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-teal-800">
                  <CheckCircle2 className="h-5 w-5" /> Private path verified
                </div>
                <p className="mt-1 text-xs leading-5 text-teal-800">
                  Every expected workload→bucket flow was re-observed through endpoint{" "}
                  <span className="font-mono">{execution?.endpoint_id ?? operation?.execution?.endpoint_id ?? ""}</span> with zero denials.
                  The snapshot is retained — rollback stays available while the change window is open.
                </p>
              </div>
              {verification ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Metric label="Private flows" value={`${verification.fresh_private_s3_flows ?? 0}/${verification.expected_s3_flows ?? 0}`} />
                  <Metric label="Actions verified" value={`${verification.fresh_private_s3_actions ?? 0}/${verification.expected_s3_actions ?? 0}`} />
                  <Metric label="Endpoint denials" value={verification.endpoint_denial_rows ?? 0} />
                </div>
              ) : null}
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                <strong className="text-slate-800">What this did not change:</strong> bucket policies, IAM, security groups.
                Enforcing “private path only” at the bucket policy is a separate reviewed change — it will appear here
                when it is ready to run.
              </div>
            </div>
          ) : null}

          {actionError ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" data-testid="vpce-wizard-action-error">
              {actionError}
            </div>
          ) : null}
        </div>

        {/* Footer — the single "what happens next" bar */}
        <footer className="flex items-center justify-between gap-3 border-t px-6 py-4" style={{ borderColor: "#DDE3E8", background: "#FFFFFF" }}>
          <div className="flex items-center gap-2">
            {shownStep > 0 ? (
              <button
                type="button"
                onClick={() => setPinnedStep(Math.max(0, shownStep - 1) as WizardStepIndex)}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold"
                style={{ borderColor: "#DDE3E8", background: "#FFFFFF", color: "#5A6B7A" }}
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
            ) : null}
            <a
              href={`/topology/v0.2-estate?systemName=${encodeURIComponent(systemName)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold"
              style={{ borderColor: "#DDE3E8", background: "#FFFFFF", color: "#5A6B7A" }}
            >
              <MapIcon className="h-3.5 w-3.5" /> View on estate map
            </a>
          </div>
          <div className="flex items-center gap-2">
            {shownStep === 0 ? (
              <button
                type="button"
                onClick={analyze}
                disabled={!!action || (candidateVpcs.length > 1 && !selectedVpc)}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "#0E8B7A" }}
                data-testid="vpce-wizard-analyze"
              >
                {action === "analyze" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {candidateVpcs.length > 1 && !selectedVpc ? "Select a VPC to analyze" : "Analyze this fix"}
              </button>
            ) : null}
            {shownStep === 1 ? (
              noMigrationRequired ? (
                <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white" style={{ background: "#0E8B7A" }}>
                  Done — nothing to change
                </button>
              ) : plan?.readiness === "READY" ? (
                <button
                  type="button"
                  onClick={() => setPinnedStep(null)}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
                  style={{ background: "#0E8B7A" }}
                  data-testid="vpce-wizard-next-safety"
                >
                  Continue to safety check <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={analyze}
                  disabled={!!action || (needsVpcChoice && !selectedVpc)}
                  className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                  style={{ borderColor: "#0E8B7A", background: "#FFFFFF", color: "#0E8B7A" }}
                >
                  {action === "analyze" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Analyze again
                </button>
              )
            ) : null}
            {shownStep === 2 ? (
              resumedWithoutPlan ? (
                <button
                  type="button"
                  onClick={analyze}
                  disabled={!!action}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: "#0E8B7A" }}
                  data-testid="vpce-wizard-reanalyze"
                >
                  {action === "analyze" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Start fresh analysis
                </button>
              ) : simulation?.safe_to_apply ? (
                <button
                  type="button"
                  onClick={() => setPinnedStep(null)}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
                  style={{ background: "#0E8B7A" }}
                >
                  Continue to approval <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={simulate}
                  disabled={!!action || !plan?.plan_token}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: "#0E8B7A" }}
                  data-testid="vpce-wizard-simulate"
                >
                  {action === "simulate" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Run AWS dry-run
                </button>
              )
            ) : null}
            {shownStep === 3 ? (
              operationState === "APPROVED" ? (
                operation?.execution_plan_token ? (
                  <button
                    type="button"
                    onClick={() => setPinnedStep(null)}
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
                    style={{ background: "#0E8B7A" }}
                  >
                    Continue to rollout <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={analyze}
                    disabled={!!action}
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "#0E8B7A" }}
                    data-testid="vpce-wizard-reanalyze-approved"
                  >
                    {action === "analyze" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Start fresh analysis
                  </button>
                )
              ) : operationState === "APPROVAL_PENDING" ? (
                <button
                  type="button"
                  onClick={approve}
                  disabled={!!action || approver.trim().length < 3 || approver.trim().toLowerCase() === (operation?.approval?.requested_by ?? requester).trim().toLowerCase()}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 disabled:opacity-40"
                  data-testid="vpce-wizard-approve"
                >
                  Approve staged rollout
                </button>
              ) : (
                <button
                  type="button"
                  onClick={requestApproval}
                  disabled={!!action || requester.trim().length < 3}
                  className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                  style={{ background: "#0D1B2A" }}
                  data-testid="vpce-wizard-request-approval"
                >
                  Request approval
                </button>
              )
            ) : null}
            {shownStep === 4 ? (
              failedBeforeApply || (operationState === "APPROVED" && !operation?.execution_plan_token) ? (
                <button
                  type="button"
                  onClick={analyze}
                  disabled={!!action}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: "#0E8B7A" }}
                  data-testid="vpce-wizard-reanalyze-rollout"
                >
                  {action === "analyze" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Start fresh analysis
                </button>
              ) : operationState === "APPROVED" ? (
                <button
                  type="button"
                  onClick={execute}
                  disabled={!!action || !simulation?.safe_to_apply || !operation?.execution_plan_token || confirmation !== expectedApply}
                  className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                  style={{ background: "#0D1B2A" }}
                  data-testid="vpce-wizard-execute"
                >
                  Snapshot and apply first route table
                </button>
              ) : rolloutActive ? (
                <button
                  type="button"
                  onClick={reconcile}
                  disabled={!!action}
                  className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                  style={{ borderColor: "#0E8B7A", background: "#FFFFFF", color: "#0E8B7A" }}
                  data-testid="vpce-wizard-reconcile"
                >
                  {action === "reconcile" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Check evidence now
                </button>
              ) : (
                <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2.5 text-sm font-semibold" style={{ borderColor: "#DDE3E8", color: "#5A6B7A" }}>
                  Close
                </button>
              )
            ) : null}
            {shownStep === 5 ? (
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white" style={{ background: "#0E8B7A" }}>
                Finish
              </button>
            ) : null}
          </div>
        </footer>
      </div>
    </div>
  )
}
