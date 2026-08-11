"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react"
import {
  operationalRequest,
  type ConfigurationFixExplanation,
  snapshotMirrorSummary,
  type S3EnforcementExecution,
  type S3EnforcementPlan,
  type S3EnforcementSimulation,
  type S3EnforcementVerification,
  type S3PrivatePathOperation,
  type S3VpceRollbackTokenReissue,
} from "@/components/topology-v0-2/estate-operations"
import { OperationsExplanation } from "./operations-explanation"
import { EnforcementJourneySummary } from "./configuration-fix-journey"
import {
  WIZARD_STEPS,
  isTerminal,
  lifecycleView,
  rememberOperation,
  updateRememberedOperation,
  S3_ENFORCEMENT_KIND,
  type RememberedOperation,
  type WizardStepIndex,
} from "./s3-vpce-lifecycle"
import { isMutationDisabledError } from "./enforcement-availability"

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
  // Whether enforcement EXECUTION is enabled on the backend (from the meta
  // diagnostic's feature state, fail-closed). False = Preview mode: analyze
  // and validate stay live; requesting approval / approving / applying are
  // disabled so an operator never walks into the mutation gate's 503
  // mid-approval.
  executionEnabled: boolean
  onClose: () => void
}

const IDENTITY_KEY = "cyntro:operator-identity"

// Plain-language guidance per blocker, for an IT engineer who has not read the
// backend. Every enforcement blocker the plan can raise has a row here so a new
// backend code surfaces its raw message rather than a blank panel.
const BLOCKER_GUIDANCE: Record<string, { title: string; next: string }> = {
  VPC_SELECTION_REQUIRED: {
    title: "Pick which VPC to enforce for",
    next: "Consumers of this bucket run in more than one VPC. Choose one VPC and analyze again — each VPC's private path is enforced separately.",
  },
  NO_OBSERVED_CONSUMERS: {
    title: "Nothing observed to protect in this VPC",
    next: "No workload in this VPC was observed using the bucket, so there is no proven private path to make mandatory here.",
  },
  CONSUMERS_ON_PUBLIC_PATH: {
    title: "Some consumers still use the public path",
    next: "Enforcing now would break them. Run the S3 private path setup for this bucket first, let it verify, then come back to enforce.",
  },
  NO_PRIVATE_PATH_PROOF: {
    title: "No private-path proof yet",
    next: "No observed consumer has fresh evidence of reaching S3 through the Gateway endpoint. There is nothing proven to enforce.",
  },
  UNKNOWN_NETWORK_PATH: {
    title: "The current S3 route is not proven for every consumer",
    next: "Refresh AWS network inventory and behavioral data so each consumer's S3 path is known before enforcement.",
  },
  VPCE_UNRESOLVED: {
    title: "The exact endpoint could not be resolved",
    next: "Private-path proof exists but no exact vpce-id was recovered from it. Refresh transport telemetry and analyze again.",
  },
  ENFORCEMENT_ENDPOINT_MISMATCH: {
    title: "The VPC endpoint does not match the proof",
    next: "The VPC's live S3 endpoint differs from the one in the behavioral evidence. Refresh transport telemetry so they agree before enforcing.",
  },
  ENDPOINT_NOT_AVAILABLE: {
    title: "The S3 endpoint is not available",
    next: "Wait for the Gateway endpoint to reach the available state, then analyze again.",
  },
  OUT_OF_VPC_ACCESS_UNREVIEWED: {
    title: "Out-of-VPC access is not covered by an exemption",
    next: "Access from outside any VPC would be denied by enforcement. Add a reviewed exemption pattern for each principal role below, or remove their access first.",
  },
  LAMBDA_PRIVATE_PATH_OUT_OF_SCOPE: {
    title: "Lambda private-path migration is not automated yet",
    next: "No exemption or AWS change will be generated for these functions. Move each Lambda to reviewed private subnets with the S3 Gateway endpoint, remove its bucket access, or wait for Lambda migration support; then sync and analyze again.",
  },
  PRINCIPAL_IDENTITY_UNRESOLVED: {
    title: "An out-of-VPC caller's IAM role could not be resolved",
    next: "Enforcement is refused rather than risk denying an unidentified caller. Run an IAM/behavioral sync so each caller's assumed-role ARN is known, then analyze again.",
  },
  ENFORCEMENT_ENDPOINT_MISSING: {
    title: "A proven endpoint no longer exists",
    next: "An endpoint in the behavioral proof was not found live. Refresh transport telemetry so the proof matches AWS, then analyze again.",
  },
  BUCKET_POLICY_CONDITION_CONFLICT: {
    title: "The bucket policy already conditions on the network path",
    next: "An existing statement (not Cyntro's) already pins aws:SourceIp / SourceVpce / SourceVpc. Review and migrate it before layering enforcement on top.",
  },
  ENFORCEMENT_ALREADY_PRESENT: {
    title: "This bucket already enforces the private path",
    next: "The reviewed private-path Deny is already in the bucket policy. Nothing to change.",
  },
  BUCKET_POLICY_READ_FAILED: {
    title: "The bucket policy could not be read",
    next: "s3:GetBucketPolicy is required to review the change. Grant it to the read role and analyze again.",
  },
  S3_DATA_EVENT_COVERAGE_MISSING: {
    title: "Verification logging is not enabled for this bucket",
    next: "Enable CloudTrail S3 data events for this bucket. Enforcement is verified from real traffic — without the log there is no proof, so it will not start.",
  },
  S3_DATA_EVENT_COVERAGE_UNKNOWN: {
    title: "Verification logging status is unknown",
    next: "Run a collectors sync so Cyntro can confirm CloudTrail S3 data-event coverage, then analyze again.",
  },
  POLICY_SIZE_EXCEEDED: {
    title: "The resulting bucket policy would be too large",
    next: "The enforced policy would exceed the 20 KB AWS limit. Trim existing statements or exemption patterns first.",
  },
  ENFORCEMENT_STATEMENT_INVALID: {
    title: "The enforcement statement could not be built",
    next: "An input to the Deny statement was rejected. Review the exemption and canary patterns and analyze again.",
  },
  OPERATION_LEDGER_UNAVAILABLE: {
    title: "The change record store is temporarily unavailable",
    next: "No AWS change was authorized. Retry once the operation ledger recovers.",
  },
  GRAPH_CAPACITY_EXHAUSTED: {
    title: "The behavioral graph is full",
    next: "No AWS change was authorized. Restore graph capacity or move this tenant to its production-sized dedicated graph, then analyze again.",
  },
  AFFECTED_PRINCIPAL_SCOPE_INCOMPLETE: {
    title: "Cyntro is still completing the caller inventory",
    next: "Refresh IAM policies, workload-to-role bindings, and the bucket policy. Technical detail names every missing or stale source; enforcement remains blocked until the caller set is complete.",
  },
  CONFIGURED_PRINCIPAL_UNOBSERVED: {
    title: "Configured callers have not used the private path yet",
    next: "Review the listed callers. Generate their normal S3 workload through the endpoint, remove bucket access they no longer need, or wait through their expected usage cycle before analyzing again.",
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

function parseArns(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\n,]/)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  )
}

export function S3EnforcementWizard({ systemName, bucket, resume, accountId, region, executionEnabled, onClose }: Props) {
  const [plan, setPlan] = useState<S3EnforcementPlan | null>(null)
  const [simulation, setSimulation] = useState<S3EnforcementSimulation | null>(null)
  const [operation, setOperation] = useState<S3PrivatePathOperation | null>(null)
  const [execution, setExecution] = useState<S3EnforcementExecution | null>(null)
  const [verification, setVerification] = useState<S3EnforcementVerification | null>(null)
  const [explanation, setExplanation] = useState<ConfigurationFixExplanation | null>(null)
  const [explanationLoading, setExplanationLoading] = useState(false)
  const [requester, setRequester] = useState("")
  const [approver, setApprover] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [rollbackConfirmation, setRollbackConfirmation] = useState("")
  const [exemptText, setExemptText] = useState("")
  const [canaryText, setCanaryText] = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [rearm, setRearm] = useState<S3VpceRollbackTokenReissue | null>(null)
  const [action, setAction] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pinnedStep, setPinnedStep] = useState<WizardStepIndex | null>(null)
  const resumedRef = useRef(false)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(IDENTITY_KEY)
      if (saved) setRequester(saved)
    } catch { /* best effort */ }
  }, [])

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

  useEffect(() => {
    if (!operationId) {
      setExplanation(null)
      return
    }
    let cancelled = false
    setExplanationLoading(true)
    void post<ConfigurationFixExplanation>(
      `s3-vpce/operations/${encodeURIComponent(operationId)}/explanation`,
      {},
    ).then((body) => {
      if (!cancelled) setExplanation(body)
    }).catch(() => {
      if (!cancelled) setExplanation(null)
    }).finally(() => {
      if (!cancelled) setExplanationLoading(false)
    })
    return () => { cancelled = true }
  }, [operationId, post])

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

  // The single-op GET is shared across kinds — it returns the full document
  // (tokens stripped) so a resumed enforcement can rehydrate state, the applied
  // policy stage, and verification without the bearer material reads withhold.
  const refreshOperation = useCallback(async () => {
    if (!operationId) return
    const current = await operationalRequest<S3PrivatePathOperation>(
      systemName,
      `s3-vpce/operations/${encodeURIComponent(operationId)}?include_history=false`,
    )
    setOperation((previous) => ({
      ...current,
      execution_plan_token: current.execution_plan_token ?? previous?.execution_plan_token,
    }))
    if (current.execution) {
      setExecution((previous) => ({
        ...(current.execution as unknown as S3EnforcementExecution),
        lifecycle_token: previous?.lifecycle_token ?? resume?.lifecycleToken ?? undefined,
      }))
    }
    // The ledger keeps the reviewed plan and dry-run result after stripping
    // bearer tokens. Rehydrate both so completed steps remain inspectable in
    // a resumed session instead of displaying contradictory empty states.
    const storedDocument = current as unknown as {
      plan?: Partial<S3EnforcementPlan>
      blockers?: S3EnforcementPlan["blockers"]
    }
    const storedPlan = storedDocument.plan
    if (storedPlan) {
      setPlan((previous) => ({
        ...storedPlan,
        readiness: storedPlan.readiness
          ?? ((storedPlan.blockers ?? storedDocument.blockers ?? []).length ? "BLOCKED" : "READY"),
        operation_id: storedPlan.operation_id ?? current.operation_id,
        operation_state: storedPlan.operation_state ?? current.state,
        bucket_name: storedPlan.bucket_name ?? resume?.bucketName ?? bucket.name,
        vpce_ids: storedPlan.vpce_ids ?? [],
        enforcement_mode: storedPlan.enforcement_mode ?? "SINGLE_STAGE",
        exempt_principal_arns: storedPlan.exempt_principal_arns ?? [],
        canary_principal_arns: storedPlan.canary_principal_arns ?? [],
        blockers: storedPlan.blockers ?? storedDocument.blockers ?? [],
        impact: {
          observed_consumers: 0,
          protected_consumers: 0,
          public_consumers: 0,
          unknown_consumers: 0,
          exempt_principals: 0,
          vpc_endpoints: 0,
          policy_statements_added: 0,
          ...(storedPlan.impact ?? {}),
        },
        plan_token: previous?.plan_token ?? storedPlan.plan_token ?? null,
      }))
    }
    const storedSimulation = (current as unknown as { simulation?: S3EnforcementSimulation }).simulation
    if (storedSimulation) {
      setSimulation((previous) => previous ?? storedSimulation)
    }
    const latest = (current.verification?.full ?? current.verification?.canary) as
      | S3EnforcementVerification
      | undefined
    if (latest) setVerification(latest)
    updateRememberedOperation(systemName, current.operation_id, {
      state: current.state,
      snapshotId: current.execution?.snapshot_id ?? undefined,
      endpointId: current.execution?.endpoint_id ?? undefined,
    })
  }, [operationId, systemName, resume?.lifecycleToken])

  useEffect(() => {
    if (!resume?.operationId || resumedRef.current) return
    resumedRef.current = true
    void runAction("resume", refreshOperation)
  }, [resume?.operationId, refreshOperation, runAction])

  // Poll only once the rollout is actually moving server-side.
  useEffect(() => {
    if (!operationId || !operationState || isTerminal(operationState)) return
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

  const analyze = () => runAction("analyze", async () => {
    setPlan(null)
    setSimulation(null)
    setOperation(null)
    setExecution(null)
    setVerification(null)
    setRearm(null)
    const body = await post<S3EnforcementPlan>("s3-bucket-policy/plan", {
      resource_id: bucket.id,
      account_id: accountId || undefined,
      region: region || bucket.region || undefined,
      window_days: 90,
      exempt_principal_arns: parseArns(exemptText),
      canary_principal_arns: parseArns(canaryText),
    })
    setPlan(body)
    setPinnedStep(1)
    if (body.operation_id) {
      rememberOperation({
        operationId: body.operation_id,
        kind: S3_ENFORCEMENT_KIND,
        systemName,
        bucketId: bucket.id,
        bucketName: body.bucket_name ?? bucket.name,
        vpcId: body.vpc_id ?? null,
        state: body.operation_state,
        updatedAt: new Date().toISOString(),
      })
    }
  })

  const simulate = () => runAction("simulate", async () => {
    if (!plan?.plan_token || !plan.operation_id) {
      throw new Error("This enforcement was analyzed in another session — run the analysis again to continue from here.")
    }
    const result = await post<S3EnforcementSimulation>("s3-bucket-policy/simulate", {
      operation_id: plan.operation_id,
      plan_token: plan.plan_token,
    })
    setSimulation(result)
    updateRememberedOperation(systemName, plan.operation_id, { state: result.operation_state })
  })

  const requestApproval = () => runAction("request-approval", async () => {
    if (!operationId) throw new Error("No operation to request approval for — analyze first.")
    try { window.localStorage.setItem(IDENTITY_KEY, requester) } catch { /* best effort */ }
    const result = await post<S3PrivatePathOperation>("s3-bucket-policy/request-approval", {
      operation_id: operationId,
      requested_by: requester,
      note: "Make the proven private S3 path mandatory at the bucket policy.",
    })
    setOperation(result)
    updateRememberedOperation(systemName, operationId, { state: result.state })
  })

  const approve = () => runAction("approve", async () => {
    if (!operationId) throw new Error("No operation to approve — analyze first.")
    const result = await post<S3PrivatePathOperation>("s3-bucket-policy/approve", {
      operation_id: operationId,
      approved_by: approver,
      note: "Reviewed the Deny statement, exemptions, canary scope, and rollback.",
    })
    setOperation(result)
    updateRememberedOperation(systemName, operationId, { state: result.state })
  })

  const primaryVpce = plan?.vpce_ids?.[0]
    ?? execution?.endpoint_id
    ?? operation?.execution?.endpoint_id
    ?? resume?.endpointId
    ?? null
  const applyBucketName = plan?.bucket_name ?? resume?.bucketName ?? bucket.name
  const expectedApply = applyBucketName && primaryVpce ? `ENFORCE ${applyBucketName} ${primaryVpce}` : ""

  const execute = () => runAction("execute", async () => {
    const executionPlanToken = operation?.execution_plan_token
    if (!operationId) throw new Error("No operation to execute — analyze first.")
    if (!executionPlanToken) {
      throw new Error("The execution authorization from approval is not in this session — it is handed out once, at approval time. Re-run the flow from analysis.")
    }
    const result = await post<S3EnforcementExecution>("s3-bucket-policy/execute", {
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
    } : previous)
    updateRememberedOperation(systemName, operationId, {
      state: result.operation_state,
      snapshotId: result.snapshot_id ?? undefined,
      endpointId: result.endpoint_id ?? undefined,
      lifecycleToken: result.lifecycle_token ?? undefined,
    })
  })

  const lifecycleToken = execution?.lifecycle_token ?? rearm?.lifecycle_token ?? resume?.lifecycleToken ?? null
  const snapshotId = execution?.snapshot_id ?? operation?.execution?.snapshot_id ?? rearm?.snapshot_id ?? resume?.snapshotId ?? null
  const expectedRollback = snapshotId ? `ROLLBACK ${snapshotId}` : ""

  const verify = () => runAction("verify", async () => {
    if (!lifecycleToken || !operationId || !primaryVpce) return
    const result = await post<S3EnforcementVerification>("s3-bucket-policy/verify", {
      operation_id: operationId,
      plan_token: lifecycleToken,
      endpoint_id: primaryVpce,
    })
    setVerification(result)
    if (result.operation_state) {
      updateRememberedOperation(systemName, operationId, { state: result.operation_state })
    }
    await refreshOperation().catch(() => undefined)
  })

  const expand = () => runAction("expand", async () => {
    if (!lifecycleToken || !operationId) return
    const result = await post<S3EnforcementExecution>("s3-bucket-policy/expand", {
      operation_id: operationId,
      plan_token: lifecycleToken,
      executed_by: requester,
    })
    if (result.operation_state) {
      updateRememberedOperation(systemName, operationId, { state: result.operation_state })
    }
    await refreshOperation().catch(() => undefined)
  })

  const rollback = () => runAction("rollback", async () => {
    if (!lifecycleToken || !snapshotId || !operationId) return
    const result = await post<Record<string, unknown>>("s3-bucket-policy/rollback", {
      operation_id: operationId,
      plan_token: lifecycleToken,
      snapshot_id: snapshotId,
      confirmation: rollbackConfirmation,
      requested_by: requester,
    })
    setVerification((previous) => ({ ...(previous ?? { state: "PENDING_EVIDENCE" }), ...result } as S3EnforcementVerification))
    await refreshOperation().catch(() => undefined)
  })

  // Cross-browser rollback: re-mint the one-time lifecycle token via the SHARED
  // kind-aware endpoint. The server gates it to this operation's requester or
  // approver and re-issues under the original window, minting an enforcement
  // lifecycle token because the operation's kind is enforcement.
  const rearmRollback = () => runAction("rearm-rollback", async () => {
    if (!operationId) return
    try { window.localStorage.setItem(IDENTITY_KEY, requester) } catch { /* best effort */ }
    const result = await post<S3VpceRollbackTokenReissue>(
      `s3-vpce/operations/${encodeURIComponent(operationId)}/rollback-token`,
      { operation_id: operationId, requested_by: requester.trim() },
    )
    setRearm(result)
    rememberOperation({
      operationId,
      kind: S3_ENFORCEMENT_KIND,
      systemName,
      bucketId: bucket.id,
      bucketName: applyBucketName,
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
  const nothingToEnforce = blockerCodes.has("NO_OBSERVED_CONSUMERS")
    || blockerCodes.has("NO_PRIVATE_PATH_PROOF")
    || blockerCodes.has("ENFORCEMENT_ALREADY_PRESENT")
  const suggestedExemptions = plan?.out_of_vpc_principals ?? []
  const policyValidator = simulation?.checks?.validator?.trim() ?? ""
  const supplementalLintUnavailable = policyValidator.toLowerCase().startsWith("unavailable")
  const canExpand = operationState === "CANARY_VERIFIED"
    && (plan?.enforcement_mode ?? execution?.enforcement_mode) === "PRINCIPAL_CANARY"
  const rolloutActive = ["APPROVED", "SNAPSHOT_VERIFIED", "CANARY_APPLYING", "CANARY_MONITORING", "CANARY_VERIFIED", "EXPANDING"].includes(operationState ?? "")
  const rollbackAvailable = Boolean(snapshotId)
    && operationState !== "ROLLED_BACK"
    && operationState !== "ROLLBACK_FAILED"
    && operationState !== "ROLLING_BACK"
  const rollbackExpiresAt = rearm?.rollback_expires_at
    ?? operation?.execution?.lifecycle_expires_at
    ?? resume?.rollbackExpiresAt
    ?? null
  const rollbackWindowClosed = rollbackExpiresAt
    ? Date.parse(rollbackExpiresAt) - Date.now() < 60_000
    : false
  const rollbackRequestedBy = operation?.approval?.requested_by ?? resume?.requestedBy ?? null
  const rollbackApprovedBy = operation?.approval?.approved_by ?? resume?.approvedBy ?? null
  const resumedWithoutPlan = !plan && !!operationState && (
    operationState === "READY_FOR_SIMULATION"
    || (operationState === "APPROVED" && !operation?.execution_plan_token)
  )
  const stepDone = (index: number) => index < currentStep

  return (
    <div className="fixed inset-0 z-[240] flex items-stretch justify-center bg-slate-900/40 p-0 md:items-center md:p-6" role="dialog" aria-label={`S3 private-path enforcement for ${bucket.name}`}>
      <div className="flex w-full max-w-4xl flex-col overflow-hidden bg-white shadow-2xl md:max-h-[92vh] md:rounded-2xl" style={{ color: "#1A2330" }}>
        {/* Header */}
        <header className="border-b px-6 py-4" style={{ borderColor: "#DDE3E8", background: "#FFFFFF" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "#0E8B7A" }}>
                Configuration fix · Enforce private S3 access
              </div>
              <h2 className="mt-1 truncate text-lg font-bold">{bucket.name}</h2>
              <p className="mt-0.5 text-xs" style={{ color: "#5A6B7A" }}>
                Review who would keep or lose access before making the proven endpoint path mandatory.
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Close enforcement">
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
                  data-testid={`enforce-wizard-step-${index}`}
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
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5" style={{ background: "#F4F6F8" }}>
          {!executionEnabled ? (
            <div className="mb-4 rounded-xl border p-3 text-xs" style={{ borderColor: "#C9D4DE", background: "#F8FAFC", color: "#3D4B5C" }} data-testid="enforce-wizard-preview-banner">
              <span className="mr-2 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ borderColor: "#94A8BA", color: "#5A6B7A", background: "#FFFFFF" }}>
                Preview
              </span>
              <strong>Preview only.</strong>{" "}
              Analyze and review are available. Approval and AWS changes are disabled in this environment.
            </div>
          ) : null}
          {resumedWithoutPlan && shownStep >= 2 ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" data-testid="enforce-wizard-resume-banner">
              <strong>Resumed from another session.</strong> The signed plan and its safety-check authorization were
              issued to the session that created them and cannot be recovered here. Run <strong>Analyze this fix</strong>{" "}
              again — it re-checks everything fresh (nothing in AWS was changed).
            </div>
          ) : null}

          {/* Step 0 — Review */}
          {shownStep === 0 ? (
            <div className="space-y-4" data-testid="enforce-wizard-review">
              <div className="rounded-xl border p-4" style={{ borderColor: "#C9D4DE", background: "#FFFFFF" }}>
                <div className="text-sm font-bold">Require the endpoint only after every caller is understood</div>
                <p className="mt-1 text-xs leading-5" style={{ color: "#5A6B7A" }}>
                  Cyntro first separates VPC workloads using the reviewed endpoint from callers outside the VPC. Only
                  after every affected caller is reviewed can it propose one <strong>bucket-policy rule</strong> requiring
                  object access through that endpoint. IAM, routes, and bucket administration are not changed.
                </p>
              </div>
              <div className="rounded-xl border p-4 text-xs" style={{ borderColor: "#DDE3E8", background: "#FFFFFF", color: "#5A6B7A" }}>
                <div className="flex items-center gap-2 font-semibold" style={{ color: "#1A2330" }}>
                  <Lock className="h-4 w-4" style={{ color: "#0E8B7A" }} /> Before you enforce
                </div>
                <p className="mt-1 leading-5">
                  Analyze re-checks the observed consumers, endpoint IDs, public-path evidence, and exemptions. If a
                  consumer still uses a public path or the evidence cannot prove eligibility, the plan blocks before
                  approval or policy mutation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-[11px] font-semibold underline"
                style={{ color: "#0E8B7A" }}
              >
                {showAdvanced ? "Hide" : "Show"} advanced options (exemptions, canary)
              </button>
              {showAdvanced ? (
                <div className="space-y-3 rounded-xl border p-4" style={{ borderColor: "#DDE3E8", background: "#FFFFFF" }}>
                  <label className="block text-xs font-semibold text-slate-700">
                    Exempt principals — never denied (one ArnLike pattern per line)
                    <textarea
                      aria-label="Exempt principal ARNs"
                      value={exemptText}
                      onChange={(e) => setExemptText(e.target.value)}
                      placeholder="arn:aws:iam::111122223333:role/break-glass-*"
                      rows={3}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-[11px]"
                    />
                  </label>
                  {suggestedExemptions.length ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900" data-testid="enforce-wizard-suggested-exemptions">
                      <div className="font-semibold">Observed outside-VPC callers to review</div>
                      <ul className="mt-1 space-y-1 font-mono">
                        {suggestedExemptions.map((principal) => <li key={principal}>{principal}</li>)}
                      </ul>
                      <button
                        type="button"
                        onClick={() => setExemptText(suggestedExemptions.join("\n"))}
                        className="mt-2 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 font-sans font-semibold text-amber-900"
                        data-testid="enforce-wizard-use-suggested-exemptions"
                      >
                        Use these reviewed callers as exemptions
                      </button>
                    </div>
                  ) : null}
                  <label className="block text-xs font-semibold text-slate-700">
                    Canary principals — enforce for these first (optional; leave blank for single-stage)
                    <textarea
                      aria-label="Canary principal ARNs"
                      value={canaryText}
                      onChange={(e) => setCanaryText(e.target.value)}
                      placeholder="arn:aws:iam::111122223333:role/staging-worker"
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-[11px]"
                    />
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Step 1 — Plan */}
          {shownStep === 1 && plan ? (
            <div className="space-y-4" data-testid="enforce-wizard-plan">
              <EnforcementJourneySummary plan={plan} />
              <OperationsExplanation explanation={explanation} loading={explanationLoading} />
              {plan.blockers.length ? (
                <div className="space-y-2">
                  {plan.blockers.map((blocker) => {
                    const guidance = blockerGuidance(blocker.code)
                    const benign = nothingToEnforce
                    return (
                      <div key={blocker.code} className={`rounded-xl border bg-white p-3 text-xs ${benign ? "border-teal-200" : "border-orange-200"}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className={benign ? "text-teal-800" : "text-orange-800"}>{guidance.title}</strong>
                        </div>
                        <p className="mt-1 leading-5 text-slate-600">{blocker.message}</p>
                        <p className="mt-1.5 leading-5 text-slate-700"><strong>Next:</strong> {guidance.next}</p>
                        <details className="mt-2 text-[10px] text-slate-500">
                          <summary className="cursor-pointer font-semibold">Technical detail</summary>
                          <div className="mt-1 space-y-2 rounded bg-slate-50 p-2">
                            <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono">{blocker.code}</span>
                            {blocker.details?.reasons?.length ? (
                              <div>
                                <div className="font-semibold text-slate-600">Evidence gaps</div>
                                <ul className="mt-1 space-y-0.5 font-mono">
                                  {blocker.details.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                                </ul>
                              </div>
                            ) : null}
                            {blocker.details?.unobserved_subjects?.length ? (
                              <div>
                                <div className="font-semibold text-slate-600">Configured but not observed privately</div>
                                <ul className="mt-1 space-y-0.5 font-mono">
                                  {blocker.details.unobserved_subjects.map((subject) => <li key={subject}>{subject}</li>)}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        </details>
                        {blocker.code === "OUT_OF_VPC_ACCESS_UNREVIEWED" && suggestedExemptions.length ? (
                          <button
                            type="button"
                            onClick={() => { setShowAdvanced(true); setPinnedStep(0) }}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold"
                            style={{ borderColor: "#0E8B7A", color: "#0E8B7A", background: "#FFFFFF" }}
                            data-testid="enforce-wizard-review-exemptions"
                          >
                            Review {suggestedExemptions.length} suggested exemption{suggestedExemptions.length === 1 ? "" : "s"}
                          </button>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
          {shownStep === 1 && !plan ? (
            <div className="text-sm" style={{ color: "#5A6B7A" }}>Run the analysis from the Review step first.</div>
          ) : null}

          {/* Step 2 — Safety check */}
          {shownStep === 2 ? (
            <div className="space-y-4" data-testid="enforce-wizard-safety">
              <div className="rounded-xl border p-4" style={{ borderColor: "#C9D4DE", background: "#FFFFFF" }}>
                <div className="text-sm font-bold">Validate the policy before it goes live</div>
                <p className="mt-1 text-xs leading-5" style={{ color: "#5A6B7A" }}>
                  Cyntro checks the exact deny document and freezes the plan under a hash. If anything about the bucket or
                  its policy changes before apply, execution refuses and asks for a fresh analysis.
                </p>
              </div>
              {simulation ? (
                <div
                  className={`rounded-xl border bg-white p-3 text-xs ${simulation.safe_to_apply
                    ? supplementalLintUnavailable
                      ? "border-amber-200 text-amber-800"
                      : "border-teal-200 text-teal-800"
                    : "border-red-200 text-red-700"}`}
                  data-testid="enforce-wizard-simulation"
                >
                  <strong>{simulation.safe_to_apply
                    ? supplementalLintUnavailable
                      ? "Core safety checks passed"
                      : "Safety checks passed"
                    : "Safety check blocked"}</strong>
                  {" "}· plan frozen under hash <span className="font-mono">{simulation.plan_hash.slice(0, 10)}…</span>
                  {policyValidator ? (
                    <> · {supplementalLintUnavailable ? "Additional policy lint unavailable" : "Additional policy lint passed"}</>
                  ) : null}
                  {simulation.errors?.length ? (
                    <ul className="mt-1 list-disc pl-4">{simulation.errors.map((e) => <li key={e}>{e}</li>)}</ul>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                  No validation yet. Use the button below — it takes a few seconds.
                </div>
              )}
            </div>
          ) : null}

          {/* Step 3 — Approval */}
          {shownStep === 3 ? (
            <div className="space-y-4" data-testid="enforce-wizard-approval">
              <div className="rounded-xl border p-4" style={{ borderColor: "#C9D4DE", background: "#FFFFFF" }}>
                <div className="text-sm font-bold">Four-eyes approval</div>
                <p className="mt-1 text-xs leading-5" style={{ color: "#5A6B7A" }}>
                  One person requests, a different person approves. Approval freezes the exact deny document; both
                  identities are recorded on the change ledger.
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
            <div className="space-y-4" data-testid="enforce-wizard-rollout">
              {operationState === "APPROVED" ? (
                <div className="space-y-2 rounded-xl border border-teal-200 bg-white p-3">
                  <p className="text-xs text-slate-600">
                    Applying takes a snapshot of the current bucket policy first, then writes the deny
                    {plan?.enforcement_mode === "PRINCIPAL_CANARY" ? " for the canary principals only" : ""}. Cyntro then
                    watches real traffic to confirm every proven flow still works and nobody new is denied — and rolls the
                    snapshot back automatically if proof does not arrive in time.
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
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700" data-testid="enforce-wizard-error-state">
                  <strong>{view.label}.</strong>{" "}
                  {operationState === "ROLLED_BACK"
                    ? "The prior bucket policy was restored from the snapshot. Review the details, fix the cause, and analyze again when ready."
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
                    Endpoint <span className="font-mono">{primaryVpce ?? "—"}</span>
                    {" "}· snapshot <span className="font-mono">{snapshotId ?? "—"}</span>
                    {" "}· stage <span className="font-mono">{execution?.applied_stage ?? "—"}</span>
                  </p>
                  {(() => {
                    const mirror = snapshotMirrorSummary(
                      execution?.snapshot_mirror ?? operation?.execution?.snapshot_mirror,
                    )
                    if (!mirror) return null
                    const tone =
                      mirror.tone === "ok"
                        ? "text-teal-700"
                        : mirror.tone === "warn"
                          ? "text-amber-700"
                          : "text-blue-800/70"
                    return (
                      <p className={`break-all text-xs ${tone}`} data-testid="enforce-wizard-snapshot-mirror">
                        {mirror.text}
                      </p>
                    )
                  })()}
                  {rolloutActive ? (
                    <div className="space-y-2 rounded-lg border border-blue-200 bg-white p-3 text-xs text-blue-900">
                      <div className="flex items-center gap-2 font-semibold"><RefreshCw className="h-3.5 w-3.5" /> Watching enforced traffic</div>
                      <p className="leading-5 text-blue-800">
                        Cyntro confirms the enforced policy is intact, every expected flow still reaches S3 through the
                        endpoint, and no request was denied — then completes, or restores the snapshot if proof does not
                        arrive before the safety timeout.
                      </p>
                    </div>
                  ) : null}
                  {verification ? (
                    <div className="space-y-1 rounded-lg bg-white p-3 text-xs text-blue-900" data-testid="enforce-wizard-verification">
                      <div>
                        Verification: <strong>{verification.state}</strong>
                        {verification.policy_intact != null ? (
                          <> · policy {verification.policy_intact ? "intact" : "drifted"}</>
                        ) : null}
                      </div>
                      {verification.expected_s3_flows != null ? (
                        <div>Proven flows still private: {verification.fresh_private_s3_flows ?? 0}/{verification.expected_s3_flows}</div>
                      ) : null}
                      <div>
                        Access denials since enforcing:{" "}
                        <strong className={Number(verification.endpoint_denial_rows) > 0 ? "text-red-700" : "text-teal-700"}>
                          {verification.endpoint_denial_rows ?? "—"}
                        </strong>
                      </div>
                      {verification.denied_principals?.length ? (
                        <div className="text-red-700">
                          Denied: {verification.denied_principals.map((d) => `${d.principal_arn} (${d.denials})`).join(", ")}
                        </div>
                      ) : null}
                      {verification.message ? <div>{verification.message}</div> : null}
                    </div>
                  ) : null}
                  {rollbackAvailable ? (
                    <div className="space-y-2 border-t border-blue-200 pt-3">
                      {rollbackExpiresAt ? (
                        <p className="text-[11px] font-semibold text-blue-900" data-testid="enforce-wizard-rollback-window">
                          {rollbackWindowClosed
                            ? "The rollback window has closed — the snapshot is retained for audit."
                            : `Rollback window open until ${new Date(rollbackExpiresAt).toLocaleString()}.`}
                        </p>
                      ) : null}
                      {lifecycleToken ? (
                        <>
                          {rearm ? (
                            <p className="text-[11px] font-semibold text-teal-700" data-testid="enforce-wizard-rearmed">
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
                            data-testid="enforce-wizard-rollback"
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Roll back to the prior policy
                          </button>
                        </>
                      ) : rollbackWindowClosed ? (
                        <p className="text-[11px] leading-5 text-blue-800">
                          Manual rollback is no longer available from any session. Restoring the retained snapshot now is a
                          platform-owner action.
                        </p>
                      ) : (
                        <div className="space-y-2" data-testid="enforce-wizard-rearm">
                          <p className="text-[11px] leading-5 text-blue-800">
                            The rollback authorization was issued once, to the session that applied this change. Re-arm it
                            here — only this operation&apos;s requester
                            {rollbackRequestedBy ? <> (<strong>{rollbackRequestedBy}</strong>)</> : null} or approver
                            {rollbackApprovedBy ? <> (<strong>{rollbackApprovedBy}</strong>)</> : null} can, and the original
                            rollback window is never extended. The automatic safety timeout protects this rollout either way.
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
                            data-testid="enforce-wizard-rearm-rollback"
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
            <div className="space-y-4" data-testid="enforce-wizard-done">
              <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-teal-800">
                  <Lock className="h-5 w-5" /> Private path enforced
                </div>
                <p className="mt-1 text-xs leading-5 text-teal-800">
                  The bucket policy now denies any object access that does not arrive through endpoint{" "}
                  <span className="font-mono">{primaryVpce ?? ""}</span>. Every proven flow was re-observed with zero
                  denials. The snapshot is retained — rollback stays available while the change window is open.
                </p>
              </div>
              {verification ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Metric label="Private flows" value={`${verification.fresh_private_s3_flows ?? 0}/${verification.expected_s3_flows ?? 0}`} />
                  <Metric label="Access denials" value={verification.endpoint_denial_rows ?? 0} />
                  <Metric label="Policy" value={verification.policy_intact ? "intact" : "drifted"} />
                </div>
              ) : null}
            </div>
          ) : null}

          {actionError ? (
            isMutationDisabledError(actionError) ? (
              // The mutation gate refused (flag off, or flipped off after this
              // tab loaded). This is the feature being disabled, not a failure
              // — explain it that way instead of a raw 503.
              <div className="mt-4 rounded-xl border p-3 text-xs" style={{ borderColor: "#C9D4DE", background: "#F8FAFC", color: "#3D4B5C" }} data-testid="enforce-wizard-disabled-error">
                <strong>Enforcement execution is disabled on this backend.</strong>{" "}
                The change was refused before anything touched AWS. Ask the platform owner to enable enforcement, then
                run the flow again from analysis.
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" data-testid="enforce-wizard-action-error">
                {actionError}
              </div>
            )
          ) : null}
        </div>

        {/* Footer */}
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
          </div>
          <div className="flex items-center gap-2">
            {shownStep === 0 ? (
              <button
                type="button"
                onClick={analyze}
                disabled={!!action}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "#0E8B7A" }}
                data-testid="enforce-wizard-analyze"
              >
                {action === "analyze" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Analyze this fix
              </button>
            ) : null}
            {shownStep === 1 ? (
              nothingToEnforce ? (
                <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white" style={{ background: "#0E8B7A" }}>
                  Done — nothing to change
                </button>
              ) : plan?.readiness === "READY" ? (
                <button
                  type="button"
                  onClick={() => setPinnedStep(null)}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
                  style={{ background: "#0E8B7A" }}
                  data-testid="enforce-wizard-next-safety"
                >
                  Continue to safety check <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={analyze}
                  disabled={!!action}
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
                  data-testid="enforce-wizard-reanalyze"
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
                  data-testid="enforce-wizard-simulate"
                >
                  {action === "simulate" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Validate the policy
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
                    data-testid="enforce-wizard-reanalyze-approved"
                  >
                    {action === "analyze" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Start fresh analysis
                  </button>
                )
              ) : operationState === "APPROVAL_PENDING" ? (
                <button
                  type="button"
                  onClick={approve}
                  disabled={!executionEnabled || !!action || approver.trim().length < 3 || approver.trim().toLowerCase() === (operation?.approval?.requested_by ?? requester).trim().toLowerCase()}
                  title={!executionEnabled ? "Disabled in preview — enforcement execution is off on this backend." : undefined}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 disabled:opacity-40"
                  data-testid="enforce-wizard-approve"
                >
                  Approve enforcement
                </button>
              ) : (
                <button
                  type="button"
                  onClick={requestApproval}
                  disabled={!executionEnabled || !!action || requester.trim().length < 3}
                  title={!executionEnabled ? "Disabled in preview — enforcement execution is off on this backend." : undefined}
                  className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                  style={{ background: "#0D1B2A" }}
                  data-testid="enforce-wizard-request-approval"
                >
                  {executionEnabled ? "Request approval" : "Request approval (preview)"}
                </button>
              )
            ) : null}
            {shownStep === 4 ? (
              operationState === "APPROVED" && !operation?.execution_plan_token ? (
                <button
                  type="button"
                  onClick={analyze}
                  disabled={!!action}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: "#0E8B7A" }}
                  data-testid="enforce-wizard-reanalyze-rollout"
                >
                  {action === "analyze" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Start fresh analysis
                </button>
              ) : operationState === "APPROVED" ? (
                <button
                  type="button"
                  onClick={execute}
                  disabled={!executionEnabled || !!action || !operation?.execution_plan_token || confirmation !== expectedApply}
                  title={!executionEnabled ? "Disabled in preview — enforcement execution is off on this backend." : undefined}
                  className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                  style={{ background: "#0D1B2A" }}
                  data-testid="enforce-wizard-execute"
                >
                  Snapshot and enforce
                </button>
              ) : canExpand ? (
                <button
                  type="button"
                  onClick={expand}
                  disabled={!executionEnabled || !!action || !lifecycleToken}
                  title={!executionEnabled ? "Disabled in preview — enforcement execution is off on this backend." : undefined}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                  style={{ background: "#0D1B2A" }}
                  data-testid="enforce-wizard-expand"
                >
                  {action === "expand" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Enforce for all principals
                </button>
              ) : rolloutActive ? (
                <button
                  type="button"
                  onClick={verify}
                  disabled={!!action || !lifecycleToken}
                  className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                  style={{ borderColor: "#0E8B7A", background: "#FFFFFF", color: "#0E8B7A" }}
                  data-testid="enforce-wizard-verify"
                >
                  {action === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
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
