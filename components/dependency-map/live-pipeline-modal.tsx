"use client"

// Safety Pipeline Modal — wired to the unified UnifiedPipeline endpoint.
//
// Posture remediation flows through one endpoint over HTTP:
//   POST /api/posture-visibility/proposals/execute
// which is a thin wrapper around unified.execution.pipeline.UnifiedPipeline
// and runs:
//   ANALYZE -> SIMULATE -> PREFLIGHT -> SNAPSHOT -> CANARY -> VALIDATE_CANARY
//   -> FULL -> VALIDATE_FULL
// with auto-rollback on canary/validate failure. The endpoint is
// SYNCHRONOUS — one POST returns the final PipelineResult after the
// pipeline finishes (~30-40s for SG ingress closure). There is no
// streaming API; the brief forbids inventing one. So the modal uses
// "post-hoc reconcile": all stages render as RUNNING during the call
// with a shared "Pipeline executing on backend" label, then reconcile
// to per-stage status from the response (result.stage tells us how
// far it advanced; result.status tells us success/failure/rolled-back).
//
// REMOVE_SG_PUBLIC_EGRESS in the workload bucket maps to action
// SG_RULE_DELETE_PUBLIC_INGRESS on the unified endpoint — direction is
// INBOUND, mirroring api/posture_remediations.py:_emit_recommendations.
// This is a SEMANTIC change from the pre-migration legacy SG endpoint
// which closed OUTBOUND. The confirmation banner spells out which
// direction the operator is approving.
//
// Modal opens in IDLE state. NO auto-fire. Two actions:
//   - "Run dry-run" → /execute with max_stage=SIMULATE. ANALYZE +
//     SIMULATE run; PREFLIGHT/SNAPSHOT/CANARY/FULL skip.
//   - "Run real apply" → 2-step confirm → /execute with max_stage=FULL.
//     If canary fails, the backend auto-rolls back the snapshot before
//     returning; the response carries rollback_performed=true so the
//     UI surfaces "AWS untouched — auto-rollback fired" honestly.
//
// Rollback: snapshot_id from change_results[0].snapshot_id is stored
// in React state. Rollback button calls /api/posture-visibility/rollback
// which dispatches by resource_type via SnapshotManager + the
// resource's unified strategy.
//
// Per feedback_no_mock_numbers_in_ui and feedback_safety_language —
// no fake per-stage timers, no fabricated checkmarks. Stage detail
// lines reflect what actually happened per the API response.

import React, { useState } from "react"
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  RotateCcw,
  Shield,
  ShieldOff,
  X,
} from "lucide-react"
import type { PostureWorkload } from "./trust-boundary-map"
import {
  OverrideModalShared,
  buildOverrideStateForOpen,
  INITIAL_SHARED_OVERRIDE_STATE,
  type OverrideLineagePayload,
  type SharedOverrideState,
} from "@/components/override-modal-shared"
import { dispatchRemediationChanged } from "@/lib/remediation-events"

type StageStatus = "pending" | "running" | "complete" | "error" | "skipped"

interface PipelineStage {
  id: string
  label: string
  description: string
  status: StageStatus
  // Real measurement when complete, not a hardcoded prediction.
  durationMs?: number
  // Populated from API response when the stage runs.
  detail?: string
  // Shown when status === "skipped" — explains why we honestly didn't run it.
  skipReason?: string
}

// Unified PipelineStage / PipelineStatus enum values — kept in sync with
// unified/models.py:PipelineStage and unified/models.py:PipelineStatus.
// Listed verbatim so a backend rename surfaces here at typecheck.
type UnifiedStage =
  | "ANALYZE"
  | "SIMULATE"
  | "PREFLIGHT"
  | "SNAPSHOT"
  | "CANARY"
  | "VALIDATE_CANARY"
  | "STAGED"
  | "VALIDATE_STAGED"
  | "FULL"
  | "VALIDATE_FULL"

type UnifiedStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "MONITORING"
  | "COMPLETED"
  | "FAILED"
  | "ROLLED_BACK"
  | "PAUSED"

interface ScoreComponent {
  name: string
  value: number
  sub_factors?: Record<string, any>
}

interface ScoreBreakdown {
  api_classification?: string
  components?: ScoreComponent[]
  confidence_level?: string
  decision?: string
  formula?: string
  gates_applied?: string[]
  observation_days?: number
  rollback_available?: boolean
  score?: number
  system_tier?: number
  telemetry_coverage?: number
}

interface UnifiedChangeResult {
  change_id: string
  success: boolean
  action: string
  snapshot_id: string | null
  error: string | null
  aws_calls: string[]
}

// Response envelope from POST /api/posture-visibility/proposals/execute.
// Mirrors api/posture_remediations.py:execute_proposal return shape.
interface UnifiedExecuteResponse {
  proposal_id?: string | null
  pipeline_id?: string
  stage?: UnifiedStage
  status?: UnifiedStatus
  rollback_performed?: boolean
  rollback_available?: boolean
  score_breakdown?: ScoreBreakdown | null
  change_results?: UnifiedChangeResult[]
  errors?: string[]
  // FastAPI HTTPException error shape (when the proxy passes through a non-2xx)
  detail?: string | { message?: string; error?: string }
  // Proxy network-error shape
  error?: string
}

// Response envelope from POST /api/posture-visibility/rollback.
// Mirrors api/posture_remediations.py:execute_rollback return shape.
interface UnifiedRollbackResponse {
  snapshot_id?: string
  resource_type?: string
  resource_id?: string
  success?: boolean
  aws_calls?: string[]
  error?: string | null
  detail?: string | { error?: string; message?: string }
}

interface LivePipelineModalProps {
  workload: PostureWorkload
  onClose: () => void
}

// Six modal stages mapped from unified PipelineStage. Order matches
// pipeline.py:execute. CANARY + VALIDATE are real under the unified
// pipeline (single-change path: canary applies the one change, then
// validates; FULL is a no-op since there are no remaining changes).
// "validate" in modal == VALIDATE_CANARY in unified.
const UNIFIED_STAGE_TEMPLATE: PipelineStage[] = [
  {
    id: "simulate",
    label: "Simulate",
    description: "AWS dry-run — would-remove + impact check",
    status: "pending",
  },
  {
    id: "preflight",
    label: "Preflight",
    description: "Safety gate — blocks apply on active traffic against the rule",
    status: "pending",
  },
  {
    id: "snapshot",
    label: "Snapshot",
    description: "Rollback state written to Neo4j (unified Snapshot label)",
    status: "pending",
  },
  {
    id: "canary",
    label: "Canary",
    description: "Apply on AWS + observe — auto-rolls back on validation failure",
    status: "pending",
  },
  {
    id: "validate",
    label: "Validate",
    description: "Post-apply view-parity + drift check",
    status: "pending",
  },
  {
    id: "full_apply",
    label: "Full Apply",
    description: "Atomic state refresh + audit-log write",
    status: "pending",
  },
]

type Mode =
  | "idle"
  | "running-dry-run"
  | "running-apply"
  | "confirming-apply"
  | "complete"
  | "error"

// Stable JSON canonicalization matching Python's
// json.dumps(..., sort_keys=True, separators=(",", ":")). Recursively
// sorts object keys; arrays preserve order; primitives go through
// JSON.stringify. Used by computeProposalId to match the backend's
// content-addressable proposal_id (api/posture_remediations.py:_proposal_id).
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]"
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") +
    "}"
  )
}

async function sha1Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

// Mirrors api/posture_remediations.py:_proposal_id so the backend can
// correlate the override-audit record to the recommendation surface.
// Re-validated server-side; backend is the source of truth.
async function computeProposalId(
  workloadId: string,
  action: string,
  resourceId: string,
  parameters: Record<string, unknown>,
): Promise<string> {
  const blob = canonicalJson({ w: workloadId, a: action, r: resourceId, p: parameters })
  const hex = await sha1Hex(blob)
  return "ppr-" + hex.slice(0, 16)
}

// Resolve the final stage index reached based on the unified PipelineStage
// the response reports. Modal stages are ordered as in UNIFIED_STAGE_TEMPLATE
// (simulate=0, preflight=1, snapshot=2, canary=3, validate=4, full_apply=5).
// Returns -1 for ANALYZE (pre-simulate); -2 for unknown.
function stageIndexFor(stage: UnifiedStage | undefined): number {
  switch (stage) {
    case "ANALYZE":
      return -1
    case "SIMULATE":
      return 0
    case "PREFLIGHT":
      return 1
    case "SNAPSHOT":
      return 2
    case "CANARY":
      return 3
    case "VALIDATE_CANARY":
      return 4
    case "STAGED":
    case "VALIDATE_STAGED":
    case "FULL":
    case "VALIDATE_FULL":
      return 5
    default:
      return -2
  }
}

// Format a one-line backend-error string from any of the response's
// error-carrying fields (HTTPException detail, pipeline errors[],
// success=false errors). Prefers the most specific message available.
function extractErrorMessage(
  data: UnifiedExecuteResponse | UnifiedRollbackResponse,
  httpStatus?: number,
): string {
  if (typeof data?.detail === "string") return data.detail
  if (data?.detail && typeof data.detail === "object") {
    if (data.detail.message) return data.detail.message
    if (data.detail.error) return data.detail.error
  }
  if ("errors" in data && Array.isArray(data.errors) && data.errors.length > 0) {
    return data.errors.join("; ")
  }
  if ("error" in data && typeof data.error === "string") return data.error
  return httpStatus ? `HTTP ${httpStatus}` : "Unknown error"
}

export function LivePipelineModal({ workload, onClose }: LivePipelineModalProps) {
  const [stages, setStages] = useState<PipelineStage[]>(UNIFIED_STAGE_TEMPLATE)
  const [mode, setMode] = useState<Mode>("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [snapshotId, setSnapshotId] = useState<string | null>(null)
  const [rollbackState, setRollbackState] = useState<
    "idle" | "running" | "done" | "error"
  >("idle")
  // Last block response (unified-pipeline scorer OR safety-gate / preflight).
  // Drives the score-breakdown panel + the "Override" button visibility.
  // Cleared on every fresh run.
  const [blockResponse, setBlockResponse] = useState<UnifiedExecuteResponse | null>(null)
  // True when the canary auto-rollback fired during the last apply.
  // Surfaces the "AWS untouched — auto-rolled back" banner separate
  // from the generic error path.
  const [autoRolledBack, setAutoRolledBack] = useState(false)
  // OverrideModalShared state — gated form for force=true + lineage
  // (Decision Contract §7). Same shared component used by the SG
  // remediation card + IAM modal so the audit trail stays consistent.
  const [overrideState, setOverrideState] = useState<SharedOverrideState>(
    INITIAL_SHARED_OVERRIDE_STATE,
  )
  // Disambiguates which action the OverrideModalShared submit should
  // fire. Same shared form serves both /remediate force and /rollback
  // force; context is set when the operator opens the modal.
  const [overrideContext, setOverrideContext] = useState<
    "apply" | "force-rollback"
  >("apply")
  // True when the last /rollback returned 409 snapshot_already_rolled_back.
  // Surfaces the force-rollback CTA instead of a generic error.
  const [rollbackAlreadyDone, setRollbackAlreadyDone] = useState(false)

  const rec = workload.recommendation
  // Only REMOVE_SG_PUBLIC_EGRESS maps to a one-step `/remediate` call
  // we can build a payload for. ADD_VPC_ENDPOINT and
  // NARROW_SG_EGRESS_TO_OBSERVED need different remediation paths —
  // the apply button is disabled until those are wired.
  const canFire = rec?.type === "REMOVE_SG_PUBLIC_EGRESS" && !!rec?.candidate_sg_id

  function setStage(id: string, patch: Partial<PipelineStage>) {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function resetStages() {
    setStages(UNIFIED_STAGE_TEMPLATE.map((s) => ({ ...s })))
    setErrorMsg(null)
    setSnapshotId(null)
    setRollbackState("idle")
    setBlockResponse(null)
    setAutoRolledBack(false)
  }

  // Derive which pipeline layer blocked the apply. Drives the override
  // CTA copy + acknowledgedTags so the audit trail reflects the right
  // block source. Returns null for HTTP / network failures (not
  // override-able) and for runs that didn't block.
  function deriveBlockLayer(
    data: UnifiedExecuteResponse | null,
  ): "scorer" | "preflight" | "canary" | "apply" | null {
    if (!data) return null
    if (data.status === "COMPLETED" && data.stage === "ANALYZE") return "scorer"
    if (data.status === "FAILED" && data.stage === "PREFLIGHT") return "preflight"
    if (
      (data.status === "FAILED" || data.status === "ROLLED_BACK") &&
      (data.stage === "CANARY" || data.stage === "VALIDATE_CANARY")
    ) {
      return "canary"
    }
    if (data.status === "FAILED") return "apply"
    return null
  }

  const blockLayer = deriveBlockLayer(blockResponse)
  // force=true + lineage overrides a backend BLOCK at the scorer,
  // preflight, or canary layers. Network / HTTP 5xx failures are NOT
  // override-able (no pipeline ran).
  const isOverridable = !!blockLayer && !!rec?.candidate_sg_id && canFire

  // Build the unified-pipeline proposal envelope. Maps the workload-bucket
  // REMOVE_SG_PUBLIC_EGRESS recommendation to action
  // SG_RULE_DELETE_PUBLIC_INGRESS, direction INBOUND, matching
  // api/posture_remediations.py:_emit_recommendations params shape.
  // This is a SEMANTIC change from the legacy modal which sent egress
  // shape to the SG /remediate endpoint — the confirmation banner
  // calls out which direction the operator is approving.
  async function buildExecutePayload(opts: {
    maxStage: "SIMULATE" | "FULL"
    force: boolean
    lineage?: OverrideLineagePayload
  }): Promise<Record<string, unknown>> {
    const sgId = rec!.candidate_sg_id!
    const parameters: Record<string, unknown> = {
      sg_id: sgId,
      direction: "ingress",
      cidr: "0.0.0.0/0",
      reason:
        rec?.action_description ||
        "Posture-recommended close of 0.0.0.0/0 inbound on direct internet path",
    }
    const proposalId = await computeProposalId(
      workload.workload.id,
      "SG_RULE_DELETE_PUBLIC_INGRESS",
      sgId,
      parameters,
    )
    const payload: Record<string, unknown> = {
      proposal_id: proposalId,
      action: "SG_RULE_DELETE_PUBLIC_INGRESS",
      resource_type: "SecurityGroup",
      resource_id: sgId,
      parameters,
      max_stage: opts.maxStage,
      force: opts.force,
      requested_by: "trust-boundary-modal",
    }
    if (opts.force && opts.lineage) {
      payload.override_lineage = opts.lineage
    }
    return payload
  }

  // Reconcile the 6 modal stages from the unified PipelineResult.
  //   stage  = how far the pipeline advanced (last stage entered)
  //   status = COMPLETED | FAILED | ROLLED_BACK | ...
  //   rollback_performed = canary/validate failed AND auto-rollback restored AWS
  // Stages BEFORE the failure point are marked complete. The failure
  // stage is marked error. Stages AFTER are skipped with an honest
  // reason. For dry-run (maxStage=SIMULATE), unreached stages are
  // marked skipped with "dry-run — not exercised".
  function reconcileStages(
    data: UnifiedExecuteResponse,
    opts: { maxStage: "SIMULATE" | "FULL"; elapsedMs: number; overrode: boolean },
  ): {
    snapshotId: string | null
    autoRolledBack: boolean
    blocked: boolean
    summaryError: string | null
  } {
    const reachedIdx = stageIndexFor(data.stage)
    const status = data.status
    const errors = data.errors || []
    const cr = data.change_results?.[0]
    const snapshotId = cr?.snapshot_id || null
    const overrideNote = opts.overrode ? " (force=true override)" : ""

    // BLOCK at ANALYZE — score gate refused. The pipeline returns
    // status=COMPLETED at stage=ANALYZE with errors[] populated, and
    // score_breakdown carries the explanation.
    const isAnalyzeBlock =
      data.stage === "ANALYZE" && (errors.length > 0 || !!data.score_breakdown)
    if (isAnalyzeBlock) {
      setStage("simulate", {
        status: "skipped",
        skipReason: "Pipeline blocked at ANALYZE — simulate not invoked",
      })
      for (const id of ["preflight", "snapshot", "canary", "validate", "full_apply"]) {
        setStage(id, { status: "skipped", skipReason: "Blocked by unified pipeline scorer" })
      }
      return {
        snapshotId: null,
        autoRolledBack: false,
        blocked: true,
        summaryError: errors[0] || "Unified pipeline scorer blocked at ANALYZE",
      }
    }

    const stageIds = ["simulate", "preflight", "snapshot", "canary", "validate", "full_apply"]
    const dryRun = opts.maxStage === "SIMULATE"

    // Success path. For dry-run, anything past SIMULATE is honestly
    // skipped. For full apply, every stage up to reachedIdx is complete;
    // anything past is also complete (single-change pipeline reaches FULL
    // when canary+validate pass).
    if (status === "COMPLETED") {
      if (dryRun) {
        setStage("simulate", {
          status: "complete",
          durationMs: opts.elapsedMs,
          detail: "AWS dry-run passed (delete_route / revoke_security_group_ingress DryRun=true)",
        })
        for (const id of stageIds.slice(1)) {
          setStage(id, { status: "skipped", skipReason: "Dry-run — not exercised" })
        }
      } else {
        setStage("simulate", {
          status: "complete",
          durationMs: opts.elapsedMs,
          detail: "AWS dry-run passed" + overrideNote,
        })
        setStage("preflight", {
          status: "complete",
          detail: opts.overrode
            ? "Bypassed via operator override — OverrideEvent recorded"
            : "Safety gate passed (no active traffic on rule)",
        })
        setStage("snapshot", {
          status: "complete",
          detail: snapshotId ? `snapshot_id ${snapshotId}` : "Snapshot written + verified",
        })
        setStage("canary", {
          status: "complete",
          detail: "Apply succeeded; canary observation passed",
        })
        setStage("validate", {
          status: "complete",
          detail: "Post-apply view-parity verified",
        })
        setStage("full_apply", {
          status: "complete",
          detail: cr
            ? `${cr.aws_calls?.join(", ") || "AWS mutated"} — audit recorded`
            : "Audit recorded",
        })
      }
      return { snapshotId, autoRolledBack: false, blocked: false, summaryError: null }
    }

    // Failure path (FAILED or ROLLED_BACK). Mark stages before reachedIdx
    // complete, the failure stage error, the rest skipped. The
    // rollback_performed flag drives the "AWS untouched" banner.
    const failureMsg = extractErrorMessage(data) || "Pipeline failed"
    const failureIdx = Math.max(0, reachedIdx)
    for (let i = 0; i < stageIds.length; i++) {
      const id = stageIds[i]
      if (i < failureIdx) {
        setStage(id, {
          status: "complete",
          detail:
            i === 0
              ? `AWS dry-run passed${overrideNote}`
              : i === 1
                ? opts.overrode
                  ? "Bypassed via operator override"
                  : "Safety gate passed"
                : i === 2
                  ? snapshotId
                    ? `snapshot_id ${snapshotId}`
                    : "Snapshot written"
                  : i === 3
                    ? "Canary apply succeeded"
                    : "Validation in progress when next stage failed",
        })
      } else if (i === failureIdx) {
        setStage(id, {
          status: "error",
          durationMs: i === 0 ? opts.elapsedMs : undefined,
          detail: failureMsg,
        })
      } else {
        setStage(id, {
          status: "skipped",
          skipReason: data.rollback_performed
            ? "Skipped — auto-rollback fired upstream"
            : "Skipped — upstream stage failed",
        })
      }
    }
    return {
      snapshotId,
      autoRolledBack: !!data.rollback_performed,
      blocked: false,
      summaryError: failureMsg,
    }
  }

  // Mark every stage RUNNING during the synchronous POST. The endpoint
  // doesn't expose per-stage progress, so we don't fake it — all stages
  // share one "Pipeline executing" detail line and reconcile to actual
  // per-stage status from the response when the call returns.
  function setAllStagesRunning() {
    setStages((prev) =>
      prev.map((s) => ({
        ...s,
        status: "running" as StageStatus,
        detail: "Pipeline executing on backend (~30-40s)…",
      })),
    )
  }

  async function runDryRun() {
    if (!canFire) return
    resetStages()
    setMode("running-dry-run")
    setStage("simulate", { status: "running", detail: "Calling /proposals/execute (max_stage=SIMULATE)…" })
    const t0 = Date.now()
    try {
      const payload = await buildExecutePayload({ maxStage: "SIMULATE", force: false })
      const res = await fetch("/api/proxy/posture-visibility/proposals/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data: UnifiedExecuteResponse = await res.json()
      const elapsed = Date.now() - t0

      if (!res.ok) {
        const msg = extractErrorMessage(data, res.status)
        setStage("simulate", { status: "error", durationMs: elapsed, detail: msg })
        for (const id of ["preflight", "snapshot", "canary", "validate", "full_apply"]) {
          setStage(id, { status: "skipped", skipReason: "Dry-run failed at the HTTP layer" })
        }
        setErrorMsg(msg)
        setMode("error")
        return
      }

      const result = reconcileStages(data, { maxStage: "SIMULATE", elapsedMs: elapsed, overrode: false })
      if (result.blocked) {
        setBlockResponse(data as any)
        setErrorMsg(result.summaryError || "Scorer blocked")
        setMode("error")
        return
      }
      if (result.summaryError) {
        setErrorMsg(result.summaryError)
        setMode("error")
        return
      }
      setMode("complete")
    } catch (e: any) {
      const elapsed = Date.now() - t0
      setStage("simulate", {
        status: "error",
        durationMs: elapsed,
        detail: e?.message || "Network error",
      })
      setMode("error")
      setErrorMsg(e?.message || "Network error")
    }
  }

  async function runRealApply() {
    if (!canFire) return
    resetStages()
    setMode("running-apply")
    setAllStagesRunning()
    const t0 = Date.now()
    try {
      const payload = await buildExecutePayload({ maxStage: "FULL", force: false })
      const res = await fetch("/api/proxy/posture-visibility/proposals/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data: UnifiedExecuteResponse = await res.json()
      const elapsed = Date.now() - t0

      if (!res.ok) {
        const msg = extractErrorMessage(data, res.status)
        setStages((prev) =>
          prev.map((s) => ({
            ...s,
            status: "skipped" as StageStatus,
            skipReason: "Request failed before the pipeline started",
            detail: undefined,
          })),
        )
        setStage("simulate", { status: "error", durationMs: elapsed, detail: msg })
        setErrorMsg(msg)
        setMode("error")
        return
      }

      const result = reconcileStages(data, { maxStage: "FULL", elapsedMs: elapsed, overrode: false })
      if (result.snapshotId) setSnapshotId(result.snapshotId)
      setAutoRolledBack(result.autoRolledBack)

      if (result.blocked) {
        setBlockResponse(data)
        setErrorMsg(result.summaryError || "Pipeline blocked")
        setMode("error")
        return
      }
      if (result.summaryError) {
        // Not a score block — preflight/canary/validate failure. Still
        // override-able via force=true (which makes the scorer ignore the
        // posture computed-dimensions opt-out, and bypasses the canary
        // validation gate). Surface so the override CTA renders.
        setBlockResponse(data)
        setErrorMsg(result.summaryError)
        setMode("error")
        return
      }
      setMode("complete")
      // Cross-component broadcast — LP Tab / dashboard re-read so the
      // SG row reflects its new remediated state (or, if canary auto-
      // rollback fired, reverts to active). See lib/remediation-events.ts.
      dispatchRemediationChanged({
        action: result.autoRolledBack ? "rollback" : "remediate",
        resource_type: "SecurityGroup",
        resource_id: rec!.candidate_sg_id!,
        source_id: data.pipeline_id,
      })
    } catch (e: any) {
      const elapsed = Date.now() - t0
      setStages((prev) =>
        prev.map((s) => ({
          ...s,
          status: "skipped" as StageStatus,
          skipReason: "Network error before the pipeline started",
          detail: undefined,
        })),
      )
      setStage("simulate", {
        status: "error",
        durationMs: elapsed,
        detail: e?.message || "Network error",
      })
      setMode("error")
      setErrorMsg(e?.message || "Network error")
    }
  }

  // Override-apply: re-fires /proposals/execute with force=true +
  // override_lineage. The backend records an (OverrideEvent) in Neo4j
  // BEFORE the pipeline runs per Decision Contract §7 (fires on every
  // force=true, not just gate-bypass). force=true bypasses both the
  // scorer's BLOCK decision and any canary-validation failure. Snapshot
  // + rollback path stays armed.
  async function runOverrideApply(lineage: OverrideLineagePayload) {
    if (!canFire) return
    setStages(UNIFIED_STAGE_TEMPLATE.map((s) => ({ ...s })))
    setErrorMsg(null)
    setSnapshotId(null)
    setBlockResponse(null)
    setAutoRolledBack(false)
    setMode("running-apply")
    setAllStagesRunning()
    const t0 = Date.now()
    try {
      const payload = await buildExecutePayload({
        maxStage: "FULL",
        force: true,
        lineage,
      })
      const res = await fetch("/api/proxy/posture-visibility/proposals/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data: UnifiedExecuteResponse = await res.json()
      const elapsed = Date.now() - t0

      if (!res.ok) {
        const msg = extractErrorMessage(data, res.status)
        setBlockResponse(data)
        setStages((prev) =>
          prev.map((s) => ({
            ...s,
            status: "skipped" as StageStatus,
            skipReason: "Override request failed before the pipeline started",
            detail: undefined,
          })),
        )
        setStage("simulate", { status: "error", durationMs: elapsed, detail: msg })
        setErrorMsg(msg)
        setMode("error")
        setOverrideState((prev) => ({ ...prev, phase: "error", resultMessage: msg }))
        return
      }

      const result = reconcileStages(data, { maxStage: "FULL", elapsedMs: elapsed, overrode: true })
      if (result.snapshotId) setSnapshotId(result.snapshotId)
      setAutoRolledBack(result.autoRolledBack)

      if (result.summaryError || result.blocked) {
        const msg = result.summaryError || "Pipeline failed"
        setBlockResponse(data)
        setErrorMsg(msg)
        setMode("error")
        setOverrideState((prev) => ({ ...prev, phase: "error", resultMessage: msg }))
        return
      }

      setMode("complete")
      setOverrideState((prev) => ({
        ...prev,
        phase: "success",
        resultMessage: "Apply complete via override — OverrideEvent recorded",
      }))
      dispatchRemediationChanged({
        action: result.autoRolledBack ? "rollback" : "override-apply",
        resource_type: "SecurityGroup",
        resource_id: rec!.candidate_sg_id!,
        source_id: data.pipeline_id,
      })
    } catch (e: any) {
      const elapsed = Date.now() - t0
      const msg = e?.message || "Network error"
      setStages((prev) =>
        prev.map((s) => ({
          ...s,
          status: "skipped" as StageStatus,
          skipReason: "Network error before the pipeline started",
          detail: undefined,
        })),
      )
      setStage("simulate", { status: "error", durationMs: elapsed, detail: msg })
      setMode("error")
      setErrorMsg(msg)
      setOverrideState((prev) => ({ ...prev, phase: "error", resultMessage: msg }))
    }
  }

  function openOverrideModal() {
    if (!isOverridable || !blockResponse) return
    const reasons: string[] = []
    if (Array.isArray(blockResponse.errors)) reasons.push(...blockResponse.errors)
    const cr = blockResponse.change_results?.[0]
    if (cr?.error) reasons.push(cr.error)
    if (blockResponse.score_breakdown?.decision) {
      reasons.push(
        `Scorer decision: ${blockResponse.score_breakdown.decision}` +
          (typeof blockResponse.score_breakdown.score === "number"
            ? ` (score=${blockResponse.score_breakdown.score.toFixed(4)})`
            : ""),
      )
    }
    if (reasons.length === 0) reasons.push("Pipeline blocked")
    setOverrideContext("apply")
    setOverrideState(buildOverrideStateForOpen(reasons))
  }

  // Single dispatcher for OverrideModalShared.onSubmit — picks the
  // right backend call based on which CTA opened the form. Same shared
  // identity/acknowledged-tags persistence applies to both paths.
  async function handleOverrideSubmit(lineage: OverrideLineagePayload) {
    if (overrideContext === "force-rollback") {
      return runForceRollback(lineage)
    }
    return runOverrideApply(lineage)
  }

  async function runRollback() {
    if (!snapshotId) return
    setRollbackState("running")
    setRollbackAlreadyDone(false)
    try {
      const res = await fetch("/api/proxy/posture-visibility/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot_id: snapshotId,
          requested_by: "trust-boundary-modal",
        }),
      })
      const data: UnifiedRollbackResponse = await res.json()
      // Backend returns 409 with structured detail when the snapshot
      // has already been rolled back. Surface the force-rollback flow
      // so operator can re-run with override_lineage (Decision Contract §7).
      if (res.status === 409) {
        const detailMsg =
          (typeof data.detail === "object" && data.detail?.message) ||
          (typeof data.detail === "string" ? data.detail : "")
        if (
          typeof data.detail === "string"
            ? data.detail.toLowerCase().includes("already rolled back")
            : data.detail?.error === "snapshot_already_rolled_back" ||
              (data.detail?.message || "").toLowerCase().includes("already rolled back")
        ) {
          setRollbackAlreadyDone(true)
          setErrorMsg(
            detailMsg ||
              "Snapshot has already been rolled back — use force to re-run.",
          )
          setRollbackState("error")
          return
        }
      }
      if (!res.ok || data?.success === false) {
        setErrorMsg(extractErrorMessage(data, res.status))
        setRollbackState("error")
        return
      }
      setRollbackState("done")
      dispatchRemediationChanged({
        action: "rollback",
        resource_type: "SecurityGroup",
        resource_id: rec!.candidate_sg_id!,
        source_id: snapshotId || undefined,
      })
    } catch (e: any) {
      setErrorMsg(e?.message || "Rollback failed")
      setRollbackState("error")
    }
  }

  // Force-rollback via Decision Contract §7. Invoked by
  // OverrideModalShared.onSubmit when the operator re-runs a rollback
  // that was previously consumed (e.g. prior rollback ran against
  // buggy code and didn't actually restore AWS state).
  async function runForceRollback(lineage: OverrideLineagePayload) {
    if (!snapshotId) return
    setRollbackState("running")
    setErrorMsg(null)
    try {
      const res = await fetch("/api/proxy/posture-visibility/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot_id: snapshotId,
          force: true,
          override_lineage: lineage,
          requested_by: "trust-boundary-modal",
        }),
      })
      const data: UnifiedRollbackResponse = await res.json()
      if (!res.ok || data?.success === false) {
        const msg = extractErrorMessage(data, res.status)
        setErrorMsg(msg)
        setRollbackState("error")
        setOverrideState((prev) => ({ ...prev, phase: "error", resultMessage: msg }))
        return
      }
      setRollbackAlreadyDone(false)
      setRollbackState("done")
      const callsSummary =
        Array.isArray(data?.aws_calls) && data.aws_calls.length > 0
          ? ` — ${data.aws_calls.join(", ")}`
          : ""
      setOverrideState((prev) => ({
        ...prev,
        phase: "success",
        resultMessage: `Re-rollback complete${callsSummary}`,
      }))
      dispatchRemediationChanged({
        action: "force-rollback",
        resource_type: "SecurityGroup",
        resource_id: rec!.candidate_sg_id!,
        source_id: snapshotId || undefined,
      })
    } catch (e: any) {
      const msg = e?.message || "Network error"
      setErrorMsg(msg)
      setRollbackState("error")
      setOverrideState((prev) => ({ ...prev, phase: "error", resultMessage: msg }))
    }
  }

  function openForceRollbackModal() {
    if (!snapshotId || !rec?.candidate_sg_id) return
    const reasons = [
      `Snapshot ${snapshotId} has already been rolled back`,
      "Re-running rollback to fix prior incomplete restore",
    ]
    setOverrideState(buildOverrideStateForOpen(reasons))
    setOverrideContext("force-rollback")
  }

  const isRunning = mode === "running-dry-run" || mode === "running-apply"
  const isDestructiveDisabled =
    !canFire || isRunning || mode === "confirming-apply" || mode === "complete" || rollbackState === "running"

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={mode === "running-apply" ? undefined : onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-violet-500/40 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-slate-700/50 p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-violet-400" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-violet-300 font-semibold">
                  Safety Pipeline {mode === "complete" && !errorMsg ? "Run" : "Preview"}
                </div>
                <div className="text-base font-bold text-slate-100">
                  {rec?.action_description || "Proposed change"}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={mode === "running-apply"}
              className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={
                mode === "running-apply"
                  ? "Close disabled — pipeline running"
                  : "Close"
              }
              title={
                mode === "running-apply"
                  ? "Cannot close while the unified pipeline is running — auto-rollback fires on the backend regardless"
                  : "Close"
              }
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-3 text-[10px]">
            <Chip label="Workload" value={workload.workload.name} mono />
            <Chip
              label="Scope"
              value={`${rec?.scope_workload_count || 1} workload${rec?.scope_workload_count === 1 ? "" : "s"}`}
            />
            <Chip
              label="Target SG"
              value={rec?.candidate_sg_id || "—"}
              mono
            />
          </div>
        </div>

        {/* Confirm dialog — gates the destructive apply */}
        {mode === "confirming-apply" && (
          <div className="mx-4 mt-4 rounded-lg border border-red-500/60 bg-red-500/10 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-300 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-red-100">
                  Destructive AWS action — this will modify AWS
                </div>
                <div className="text-[11px] text-red-100/90 mt-1 leading-relaxed">
                  This will <b>revoke 0.0.0.0/0 INBOUND</b> on SG{" "}
                  <code className="font-mono">{rec?.candidate_sg_id}</code>
                  {rec?.candidate_sg_name ? ` (${rec.candidate_sg_name})` : ""}{" "}
                  in your AWS account via the unified pipeline (ANALYZE →
                  SIMULATE → PREFLIGHT → SNAPSHOT → CANARY → VALIDATE → FULL).
                  Anyone currently reaching this workload from the public
                  internet will lose access. The pipeline writes a snapshot
                  before any mutation and auto-rolls back if the canary
                  validation fails; you can also roll back manually after
                  apply completes. The endpoint is synchronous and takes
                  ~30-40s — the modal cannot be closed while the pipeline
                  is running.
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={runRealApply}
                    className="inline-flex items-center gap-1.5 rounded border border-red-500 bg-red-500/30 hover:bg-red-500/50 px-3 py-1.5 text-[11px] font-semibold text-red-50"
                  >
                    <ShieldOff className="w-3 h-3" />
                    Yes — apply to AWS now
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("idle")}
                    className="inline-flex items-center gap-1.5 rounded border border-slate-600 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-[11px] font-semibold text-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stages */}
        <div className="p-4">
          <div className="space-y-2">
            {stages.map((stage) => (
              <StageRow key={stage.id} stage={stage} />
            ))}
          </div>

          {/* Apply-complete + rollback affordance */}
          {mode === "complete" && !errorMsg && snapshotId && rollbackState === "idle" && (
            <div className="mt-4 rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-3 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-emerald-100">
                  Apply complete — snapshot armed for rollback
                </div>
                <div className="text-[10px] text-emerald-200/80 mt-0.5 font-mono truncate">
                  snapshot_id {snapshotId}
                </div>
              </div>
              <button
                type="button"
                onClick={runRollback}
                className="inline-flex items-center gap-1.5 rounded border border-amber-500/50 bg-amber-500/15 hover:bg-amber-500/25 px-3 py-1.5 text-[11px] font-semibold text-amber-100 shrink-0"
              >
                <RotateCcw className="w-3 h-3" />
                Roll Back Now
              </button>
            </div>
          )}

          {/* Canary auto-rollback banner — fires when the pipeline
              applied the change to AWS, the canary validation failed,
              and the backend restored state from the snapshot before
              returning. AWS is in its pre-apply state. */}
          {mode === "error" && autoRolledBack && (
            <div className="mt-4 rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-3 flex items-start gap-2">
              <RotateCcw className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-emerald-100">
                  Canary validation failed → auto-rollback fired. AWS is back to
                  pre-apply state.
                </div>
                <div className="text-[10px] text-emerald-200/80 mt-0.5">
                  The pipeline applied the change, the post-apply view-parity
                  check detected drift, and the snapshot was restored before
                  this response returned. Override and re-run is available if
                  you want to bypass the validation gate.
                </div>
              </div>
            </div>
          )}

          {rollbackState === "running" && (
            <div className="mt-4 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-[11px] text-amber-100">
              Rolling back via snapshot {snapshotId}…
            </div>
          )}
          {rollbackState === "done" && (
            <div className="mt-4 rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-3 text-[11px] text-emerald-100">
              ✓ Rollback complete — AWS rule restored.
            </div>
          )}

          {/* Force-rollback CTA — visible when backend returned 409
              snapshot_already_rolled_back. Re-running rollback is the
              right recovery for "prior rollback didn't actually restore
              AWS state" (e.g. pre-9dc5b3a buggy filter). Decision
              Contract §7 lineage captures the operator's intent. */}
          {rollbackState === "error" && rollbackAlreadyDone && snapshotId && (
            <div className="mt-4 rounded-lg border border-amber-500/60 bg-amber-500/10 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-amber-100 min-w-0">
                    <div className="font-semibold">
                      Snapshot already rolled back
                    </div>
                    <div className="mt-0.5 opacity-90 break-words">
                      {errorMsg}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openForceRollbackModal}
                  className="inline-flex items-center gap-1.5 rounded border border-amber-500 bg-amber-500/30 hover:bg-amber-500/50 px-3 py-1.5 text-[11px] font-semibold text-amber-50 shrink-0"
                >
                  <RotateCcw className="w-3 h-3" />
                  Force rollback
                </button>
              </div>
            </div>
          )}
          {rollbackState === "error" && !rollbackAlreadyDone && (
            <div className="mt-4 rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-[11px] text-red-100">
              <div className="font-semibold">Rollback failed</div>
              <div className="mt-0.5 opacity-90 break-words">{errorMsg}</div>
            </div>
          )}

          {/* Dry-run-complete summary */}
          {mode === "complete" && !errorMsg && !snapshotId && (
            <div className="mt-4 rounded-lg border border-slate-600 bg-slate-800/40 p-3 text-[11px] text-slate-200">
              Dry-run complete. No AWS mutation occurred. The safety gate
              result above is what the real apply would see right now.
            </div>
          )}

          {/* Error banner — split into "block (overridable)" vs
              "hard failure (not overridable)" so the operator sees
              the right path forward. Score breakdown surfaces the
              unified-pipeline scorer's reasoning when present. */}
          {mode === "error" && (
            <div className="mt-4 rounded-lg border border-red-500/50 bg-red-500/10 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                <div className="text-[11px] text-red-100 min-w-0 flex-1">
                  <div className="font-semibold">
                    {!isOverridable
                      ? "Run failed"
                      : blockLayer === "scorer"
                        ? "Apply blocked by unified pipeline scorer"
                        : blockLayer === "preflight"
                          ? "Apply blocked by preflight safety gate"
                          : blockLayer === "canary"
                            ? "Canary validation failed"
                            : "Apply failed"}
                  </div>
                  <div className="mt-0.5 opacity-90 break-words">{errorMsg}</div>
                </div>
              </div>

              {/* Score-breakdown panel — only when the backend returned
                  one (unified-pipeline scorer blocks). Per
                  feedback_no_hardcoded_multipliers, every number here
                  comes from the API; nothing fabricated. */}
              {blockResponse?.score_breakdown && (
                <div className="rounded border border-red-500/40 bg-red-950/40 p-2.5">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-red-200">
                      Score breakdown
                    </span>
                    {typeof blockResponse.score_breakdown.score === "number" && (
                      <span className="text-[11px] font-mono font-bold text-red-100">
                        {blockResponse.score_breakdown.score.toFixed(4)}
                      </span>
                    )}
                    {blockResponse.score_breakdown.decision && (
                      <span className="px-1.5 py-0.5 rounded bg-red-500/30 border border-red-500/60 text-red-50 text-[9px] font-bold uppercase tracking-wider">
                        {blockResponse.score_breakdown.decision}
                      </span>
                    )}
                    {blockResponse.score_breakdown.confidence_level && (
                      <span className="text-[9px] text-red-200/90 uppercase tracking-wider">
                        {blockResponse.score_breakdown.confidence_level} confidence
                      </span>
                    )}
                  </div>
                  {Array.isArray(blockResponse.score_breakdown.components) && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {blockResponse.score_breakdown.components.map((c) => (
                        <div
                          key={c.name}
                          className="rounded border border-red-500/30 bg-red-950/50 px-2 py-1"
                        >
                          <div className="text-[9px] uppercase tracking-wider text-red-300/80 truncate" title={c.name}>
                            {c.name.replace(/_/g, " ")}
                          </div>
                          <div className="text-[12px] font-mono font-bold text-red-50">
                            {typeof c.value === "number" ? c.value.toFixed(2) : "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {blockResponse.score_breakdown.formula && (
                    <div className="mt-1.5 text-[10px] text-red-100/70 font-mono break-words">
                      {blockResponse.score_breakdown.formula}
                    </div>
                  )}
                  {Array.isArray(blockResponse.score_breakdown.gates_applied) &&
                    blockResponse.score_breakdown.gates_applied.length > 0 && (
                      <div className="mt-1.5 text-[10px] text-red-100/70">
                        <span className="opacity-70">Gates: </span>
                        {blockResponse.score_breakdown.gates_applied.join(", ")}
                      </div>
                    )}
                </div>
              )}

              {/* Override CTA — Decision Contract §7 force=true path.
                  Visible only when the failure was a backend BLOCK
                  (safety gate or unified pipeline). Network/HTTP
                  errors are NOT override-able. */}
              {isOverridable && (
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[10px] text-red-100/80 leading-relaxed">
                    Override requires a written rationale and identity capture.
                    The backend records an{" "}
                    <code className="font-mono">OverrideEvent</code> in Neo4j
                    on every force=true execution (Decision Contract §7).
                  </div>
                  <button
                    type="button"
                    onClick={openOverrideModal}
                    className="inline-flex items-center gap-1.5 rounded border border-red-500 bg-red-500/30 hover:bg-red-500/50 px-3 py-1.5 text-[11px] font-semibold text-red-50 shrink-0"
                  >
                    <ShieldOff className="w-3 h-3" />
                    Override apply
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Shared override modal — captures rationale + identity +
            ack and calls runOverrideApply with the lineage payload.
            Same component used by sg-remediation-card + IAM modal so
            the audit trail stays single-sourced. */}
        <OverrideModalShared
          state={overrideState}
          setState={setOverrideState}
          acknowledgedTags={
            overrideContext === "force-rollback"
              ? ["snapshot_already_rolled_back", "operator_override", "rerun_rollback"]
              : [
                  blockLayer === "scorer"
                    ? "unified_pipeline_block"
                    : blockLayer === "preflight"
                      ? "preflight_block"
                      : blockLayer === "canary"
                        ? "canary_validation_block"
                        : "score_based_block",
                  "operator_override",
                ]
          }
          onSubmit={handleOverrideSubmit}
          contextBlurb={
            overrideContext === "force-rollback"
              ? "This snapshot has already been rolled back once. Re-running rollback is safe — the snapshot itself is unchanged. Common case: the prior rollback ran against pre-9dc5b3a code that silently dropped IpProtocol=-1 rules from the restore step, so AWS state isn't actually back to the snapshot."
              : blockLayer === "scorer"
                ? "The unified pipeline scorer blocked this apply with confidence below threshold. Overriding force=true bypasses the score gate; the snapshot + rollback path stays armed."
                : blockLayer === "preflight"
                  ? "The preflight safety gate blocked this apply because observed traffic exists for the rule. Overriding force=true revokes the rule anyway; the snapshot + rollback path stays armed."
                  : blockLayer === "canary"
                    ? "The canary observed drift after applying the change and auto-rolled back. Overriding force=true bypasses the canary validation gate and leaves the change applied (snapshot + manual rollback stay available)."
                    : "Apply failed at the pipeline. Overriding force=true bypasses gates; the snapshot + rollback path stays armed."
          }
          rationalePlaceholder={
            overrideContext === "force-rollback"
              ? `Why re-run rollback on snapshot ${snapshotId ?? ""}? (e.g. prior rollback ran against buggy code, AWS state still shows the rule removed)`
              : `Why is it safe to remove ${rec?.candidate_sg_id ? `0.0.0.0/0 inbound on ${rec.candidate_sg_id}` : "this rule"} despite the block? (e.g. demo SG, deprecated workload, validated false positive)`
          }
        />

        {/* Footer */}
        <div className="border-t border-slate-700/50 p-3 flex items-center justify-between gap-3">
          <div className="text-[10px] text-slate-500 italic min-w-0 truncate">
            {!canFire
              ? "This recommendation type isn't wired to the apply pipeline yet."
              : mode === "running-dry-run"
                ? "POST /posture-visibility/proposals/execute (max_stage=SIMULATE)…"
                : mode === "running-apply"
                  ? "POST /posture-visibility/proposals/execute (destructive, max_stage=FULL)…"
                  : mode === "complete" && snapshotId
                    ? "AWS mutated via unified pipeline. Snapshot armed — rollback available."
                    : "Dry-run = read-only. Apply = revoke INBOUND in AWS via UnifiedPipeline (snapshot + auto-rollback on canary)."}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={!canFire || isRunning || mode === "confirming-apply"}
              onClick={runDryRun}
              className="inline-flex items-center gap-1.5 rounded border border-slate-500/50 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 text-[11px] font-semibold text-slate-100"
            >
              {mode === "running-dry-run" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Shield className="w-3 h-3" />
              )}
              Run dry-run
            </button>
            <button
              type="button"
              disabled={isDestructiveDisabled}
              onClick={() => setMode("confirming-apply")}
              className="inline-flex items-center gap-1.5 rounded border border-red-500/50 bg-red-500/20 hover:bg-red-500/35 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 text-[11px] font-semibold text-red-100"
            >
              {mode === "running-apply" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <ShieldOff className="w-3 h-3" />
              )}
              Execute for Real
            </button>
            <button
              type="button"
              disabled={mode === "running-apply"}
              className="inline-flex items-center gap-1.5 rounded border border-violet-500/50 bg-violet-500/15 hover:bg-violet-500/25 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 text-[11px] font-semibold text-violet-100"
              onClick={onClose}
              title={
                mode === "running-apply"
                  ? "Cannot close while pipeline is running"
                  : "Close"
              }
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Chip({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1 min-w-0">
      <div className="text-slate-500 uppercase tracking-wider">{label}</div>
      <div
        className={`text-slate-200 truncate ${mono ? "font-mono" : "font-semibold"}`}
        title={value}
      >
        {value}
      </div>
    </div>
  )
}

function StageRow({ stage }: { stage: PipelineStage }) {
  const statusIcon = (() => {
    switch (stage.status) {
      case "complete":
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />
      case "running":
        return <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-400" />
      case "skipped":
      default:
        return <Clock className="w-4 h-4 text-slate-600" />
    }
  })()

  const tone = (() => {
    switch (stage.status) {
      case "complete":
        return "border-emerald-500/30 bg-emerald-500/5"
      case "running":
        return "border-amber-500/50 bg-amber-500/10 ring-1 ring-amber-500/40"
      case "error":
        return "border-red-500/50 bg-red-500/10"
      case "skipped":
        return "border-slate-700 bg-slate-900/40 opacity-60"
      default:
        return "border-slate-700 bg-slate-900/40"
    }
  })()

  return (
    <div className={`rounded-lg border ${tone} p-2.5 transition-all`}>
      <div className="flex items-center gap-2.5">
        <div className="shrink-0">{statusIcon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-100">
              {stage.label}
            </span>
            {stage.status === "complete" && stage.durationMs !== undefined && (
              <span className="text-[10px] text-emerald-400/70 font-mono">
                ✓ {(stage.durationMs / 1000).toFixed(1)}s
              </span>
            )}
            {stage.status === "skipped" && (
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                skipped
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {stage.detail || stage.skipReason || stage.description}
          </div>
        </div>
      </div>
    </div>
  )
}

export default LivePipelineModal
