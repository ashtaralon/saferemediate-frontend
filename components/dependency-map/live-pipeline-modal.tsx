"use client"

// Safety Pipeline Modal — wired to the live backend.
//
// For SG remediation the unified pipeline is exposed over HTTP as two
// endpoints:
//   POST /api/security-groups/{sg_id}/simulate   — dry-run, read-only
//   POST /api/security-groups/{sg_id}/remediate  — atomic snapshot + revoke
//
// Backend /remediate is atomic — it doesn't expose separate snapshot /
// canary / validate stages over HTTP. Canary + validate exist only in
// the IAM pipeline today. We render that honestly: 4 stages map to
// real API events for SG; canary + validate are marked "skipped — not
// in SG pipeline" rather than mocked with setTimeout.
//
// Modal opens in IDLE state. NO auto-fire. Two actions:
//   - "Run dry-run" → /simulate, populates SIMULATE + PREFLIGHT with
//     real result. SNAPSHOT + FULL APPLY are marked "skipped — dry-run".
//   - "Run real apply" → 2-step confirm → /remediate. Populates
//     SIMULATE + PREFLIGHT + SNAPSHOT + FULL APPLY from the real
//     response. Snapshot id surfaces a rollback button on success.
//
// Per feedback_no_mock_numbers_in_ui and feedback_safety_language —
// no fake timers, no fabricated checkmarks. Every stage detail line
// reflects real API data.

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

interface SimulateResponse {
  is_safe?: boolean
  safety_warnings?: string[]
  potential_impact?: Array<{ active_connections?: number; warning?: string }>
  rules_to_remove?: number
  rollback_snapshot?: { sg_id: string; sg_name: string }
  error?: string
  detail?: string
}

interface RemediateResponse {
  success?: boolean
  error?: string
  message?: string
  rules_removed?: number
  snapshot_id?: string
  rollback_snapshot?: { snapshot_id?: string; sg_id?: string }
  safety_warnings?: string[]
  potential_impact?: any[]
}

interface LivePipelineModalProps {
  workload: PostureWorkload
  onClose: () => void
}

// CANARY + VALIDATE exist in the IAM unified pipeline only. SG /remediate
// is atomic over HTTP — no separate canary or post-apply validate stage
// is exposed. Honest skip-reason per feedback_no_mock_numbers_in_ui.
const SG_STAGE_TEMPLATE: PipelineStage[] = [
  {
    id: "simulate",
    label: "Simulate",
    description: "AWS dry-run — would-remove + impact check",
    status: "pending",
  },
  {
    id: "snapshot",
    label: "Snapshot",
    description: "Rollback state written to Neo4j SGSnapshot",
    status: "pending",
  },
  {
    id: "preflight",
    label: "Preflight",
    description: "Safety gate — blocks apply on active traffic against the rule",
    status: "pending",
  },
  {
    id: "canary",
    label: "Canary",
    description: "Canary observation — IAM pipeline only; not implemented for SG",
    status: "skipped",
    skipReason: "SG /remediate is atomic over HTTP — no canary stage exposed",
  },
  {
    id: "validate",
    label: "Validate",
    description: "Post-apply alarm + latency check — IAM pipeline only",
    status: "skipped",
    skipReason: "SG /remediate is atomic over HTTP — no validate stage exposed",
  },
  {
    id: "full_apply",
    label: "Full Apply",
    description: "Revoke rule from AWS via boto3",
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

export function LivePipelineModal({ workload, onClose }: LivePipelineModalProps) {
  const [stages, setStages] = useState<PipelineStage[]>(SG_STAGE_TEMPLATE)
  const [mode, setMode] = useState<Mode>("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [snapshotId, setSnapshotId] = useState<string | null>(null)
  const [rollbackState, setRollbackState] = useState<
    "idle" | "running" | "done" | "error"
  >("idle")

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
    setStages(SG_STAGE_TEMPLATE.map((s) => ({ ...s })))
    setErrorMsg(null)
    setSnapshotId(null)
    setRollbackState("idle")
  }

  // REMOVE_SG_PUBLIC_EGRESS = default-egress 0.0.0.0/0 outbound ALL.
  // Mirrors the egress rule shape that backend egress_visibility.py
  // emits (direction=outbound, source field carries the peer CIDR).
  function buildRuleToRemove() {
    return {
      protocol: "-1",
      source: "0.0.0.0/0",
      direction: "outbound" as const,
    }
  }

  async function runDryRun() {
    if (!canFire) return
    resetStages()
    setMode("running-dry-run")
    setStage("simulate", { status: "running" })
    const t0 = Date.now()
    try {
      const res = await fetch(
        `/api/proxy/security-groups/${rec!.candidate_sg_id}/simulate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rules_to_remove: [buildRuleToRemove()],
            dry_run: true,
          }),
        },
      )
      const data: SimulateResponse = await res.json()
      const elapsed = Date.now() - t0

      if (!res.ok || data.error) {
        setStage("simulate", {
          status: "error",
          detail: data.error || data.detail || `HTTP ${res.status}`,
          durationMs: elapsed,
        })
        setErrorMsg(data.error || data.detail || `Simulate failed (${res.status})`)
        setMode("error")
        return
      }

      const matched = data.rules_to_remove ?? 0
      if (matched === 0) {
        setStage("simulate", {
          status: "error",
          durationMs: elapsed,
          detail:
            "No AWS rule matched — already removed, or live SG drifted from cached recommendation.",
        })
        setMode("error")
        setErrorMsg("No matching AWS rule")
        return
      }

      const impactCount = (data.potential_impact || []).length
      const safe = data.is_safe !== false && impactCount === 0
      setStage("simulate", {
        status: "complete",
        durationMs: elapsed,
        detail: safe
          ? `Safe — ${matched} rule${matched === 1 ? "" : "s"} matched, no observed traffic`
          : `Would block — ${impactCount} rule${impactCount === 1 ? "" : "s"} with active traffic`,
      })
      setStage("preflight", {
        status: safe ? "complete" : "error",
        detail: safe
          ? "Safety gate would pass"
          : (data.safety_warnings || []).join("; ") || "Safety gate would block",
      })
      setStage("snapshot", {
        status: "skipped",
        skipReason: "Dry-run — no snapshot created",
      })
      setStage("full_apply", {
        status: "skipped",
        skipReason: "Dry-run — no AWS mutation",
      })
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
    setStage("simulate", { status: "running" })
    setStage("preflight", { status: "running" })
    setStage("snapshot", { status: "running" })
    setStage("full_apply", { status: "running" })
    const t0 = Date.now()
    try {
      const res = await fetch(
        `/api/proxy/security-groups/${rec!.candidate_sg_id}/remediate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rules_to_remove: [buildRuleToRemove()],
            create_snapshot: true,
            force: false,
          }),
        },
      )
      const data: RemediateResponse = await res.json()
      const elapsed = Date.now() - t0

      if (!res.ok) {
        setStage("simulate", {
          status: "error",
          durationMs: elapsed,
          detail: data.error || `HTTP ${res.status}`,
        })
        setStage("preflight", { status: "pending" })
        setStage("snapshot", { status: "pending" })
        setStage("full_apply", { status: "pending" })
        setErrorMsg(data.error || `Remediation failed (${res.status})`)
        setMode("error")
        return
      }

      // Backend simulated first; safety gate blocked the apply.
      if (data.success === false) {
        const warnings = (data.safety_warnings || []).join("; ")
        const impact = (data.potential_impact || []).length
        setStage("simulate", {
          status: "complete",
          durationMs: elapsed,
          detail: `Dry-run ran inside /remediate — ${impact} impacted rule${impact === 1 ? "" : "s"}`,
        })
        setStage("preflight", {
          status: "error",
          detail: warnings || data.error || data.message || "Safety gate blocked",
        })
        setStage("snapshot", { status: "skipped", skipReason: "Blocked by safety gate" })
        setStage("full_apply", { status: "skipped", skipReason: "Blocked by safety gate" })
        setErrorMsg(data.error || data.message || "Safety gate blocked the apply")
        setMode("error")
        return
      }

      // Success — backend did simulate + snapshot + revoke.
      const snapId =
        data.snapshot_id || data.rollback_snapshot?.snapshot_id || null
      setStage("simulate", {
        status: "complete",
        durationMs: elapsed,
        detail: "Backend dry-run passed",
      })
      setStage("preflight", { status: "complete", detail: "Safety gate passed" })
      setStage("snapshot", {
        status: "complete",
        detail: snapId
          ? `snapshot_id ${snapId}`
          : "Snapshot written (id not returned in response)",
      })
      setStage("full_apply", {
        status: "complete",
        detail: `Revoked ${data.rules_removed ?? 1} rule${(data.rules_removed ?? 1) === 1 ? "" : "s"} via boto3`,
      })
      setSnapshotId(snapId)
      setMode("complete")
    } catch (e: any) {
      const elapsed = Date.now() - t0
      setStage("simulate", {
        status: "error",
        durationMs: elapsed,
        detail: e?.message || "Network error",
      })
      setStage("preflight", { status: "pending" })
      setStage("snapshot", { status: "pending" })
      setStage("full_apply", { status: "pending" })
      setMode("error")
      setErrorMsg(e?.message || "Network error")
    }
  }

  async function runRollback() {
    if (!snapshotId || !rec?.candidate_sg_id) return
    setRollbackState("running")
    try {
      const res = await fetch(
        `/api/proxy/security-groups/${rec.candidate_sg_id}/rollback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshot_id: snapshotId }),
        },
      )
      const data = await res.json()
      if (!res.ok || data?.success === false) {
        setErrorMsg(data?.error || data?.message || `Rollback failed (${res.status})`)
        setRollbackState("error")
        return
      }
      setRollbackState("done")
    } catch (e: any) {
      setErrorMsg(e?.message || "Rollback failed")
      setRollbackState("error")
    }
  }

  const isRunning = mode === "running-dry-run" || mode === "running-apply"
  const isDestructiveDisabled =
    !canFire || isRunning || mode === "confirming-apply" || mode === "complete" || rollbackState === "running"

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
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
              className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white"
              aria-label="Close"
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
                  Destructive AWS action
                </div>
                <div className="text-[11px] text-red-100/90 mt-1 leading-relaxed">
                  This will <b>revoke 0.0.0.0/0 outbound</b> on SG{" "}
                  <code className="font-mono">{rec?.candidate_sg_id}</code>
                  {rec?.candidate_sg_name ? ` (${rec.candidate_sg_name})` : ""}{" "}
                  in your AWS account. Outbound traffic from the workload that
                  depends on this rule will stop. A snapshot is written first
                  and rollback is one click after the apply completes. If the
                  backend safety gate sees active traffic for this rule, the
                  apply will be blocked before AWS is touched.
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
                  Apply complete — snapshot armed
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
                Rollback
              </button>
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

          {/* Dry-run-complete summary */}
          {mode === "complete" && !errorMsg && !snapshotId && (
            <div className="mt-4 rounded-lg border border-slate-600 bg-slate-800/40 p-3 text-[11px] text-slate-200">
              Dry-run complete. No AWS mutation occurred. The safety gate
              result above is what the real apply would see right now.
            </div>
          )}

          {/* Error banner */}
          {mode === "error" && (
            <div className="mt-4 rounded-lg border border-red-500/50 bg-red-500/10 p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                <div className="text-[11px] text-red-100 min-w-0">
                  <div className="font-semibold">Run failed</div>
                  <div className="mt-0.5 opacity-90 break-words">{errorMsg}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700/50 p-3 flex items-center justify-between gap-3">
          <div className="text-[10px] text-slate-500 italic min-w-0 truncate">
            {!canFire
              ? "This recommendation type isn't wired to the apply pipeline yet."
              : mode === "running-dry-run"
                ? "Calling /api/security-groups/.../simulate…"
                : mode === "running-apply"
                  ? "Calling /api/security-groups/.../remediate (destructive)…"
                  : mode === "complete" && snapshotId
                    ? "AWS mutated. Snapshot armed — rollback available."
                    : "Dry-run = read-only. Apply = revoke in AWS now (snapshot + rollback)."}
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
              Run real apply
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded border border-violet-500/50 bg-violet-500/15 hover:bg-violet-500/25 px-3 py-1.5 text-[11px] font-semibold text-violet-100"
              onClick={onClose}
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
