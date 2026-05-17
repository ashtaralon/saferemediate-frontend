"use client"

// Live Safety Pipeline Modal — the demo moneymaker.
//
// Visualizes the 6-stage UnifiedPipeline cascade with realistic timing:
//   1. SIMULATE   (0.5-1s)  — AWS boto3 dry-run validates the change
//   2. SNAPSHOT   (0.5-1s)  — Rollback state written to S3
//   3. PREFLIGHT  (0.3s)    — View-parity + freshness gates
//   4. CANARY     (30s)     — Apply to 1 workload, observe live traffic
//   5. VALIDATE   (1-2s)    — No new alarms, latency unchanged
//   6. FULL APPLY (1-3s)    — Roll to remaining workloads
//
// Each stage animates from ⏸ pending → 🟡 running → 🟢 complete with
// per-stage descriptive text. Total demo run: ~35-40s.
//
// THIS IS A VISUAL PREVIEW — no actual AWS mutation in v1. Backend
// posture-visibility execute endpoint exists for real execution; this
// modal serves the demo + investor + CISO use cases where you want
// to show the safety pipeline WITHOUT mutating real infrastructure.
// Real-execute wiring is queued as a follow-up task.
//
// Per feedback_remediation_safety_signals: the modal calls itself
// "Preview" and labels each stage with what it WOULD do, not what it
// has done. No fabricated outcomes (no "12 connections allowed" —
// the demo data is structural ("Stage complete") not numeric).

import React, { useEffect, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  RotateCcw,
  Shield,
  X,
} from "lucide-react"
import type { PostureWorkload } from "./trust-boundary-map"

type StageStatus = "pending" | "running" | "complete" | "error"

interface PipelineStage {
  id: string
  label: string
  description: string
  durationMs: number
  status: StageStatus
}

interface LivePipelineModalProps {
  workload: PostureWorkload
  onClose: () => void
}

// Stage durations modeled on observed real-world UnifiedPipeline runs
// (see project_live_pipeline_first_run.md). Canary at 30s is the safety
// observation window — real backend uses CYNTRO_CANARY_OBSERVATION_SECONDS.
const INITIAL_STAGES: PipelineStage[] = [
  {
    id: "simulate",
    label: "Simulate",
    description: "AWS dry-run validates the proposed change",
    durationMs: 800,
    status: "pending",
  },
  {
    id: "snapshot",
    label: "Snapshot",
    description: "Rollback state written to durable storage",
    durationMs: 700,
    status: "pending",
  },
  {
    id: "preflight",
    label: "Preflight",
    description: "View-parity + behavioral-freshness gates",
    durationMs: 400,
    status: "pending",
  },
  {
    id: "canary",
    label: "Canary",
    description: "Apply to 1 workload, observe live traffic for 30s",
    durationMs: 30000,
    status: "pending",
  },
  {
    id: "validate",
    label: "Validate",
    description: "Verify no new alarms or latency regressions",
    durationMs: 1500,
    status: "pending",
  },
  {
    id: "full_apply",
    label: "Full Apply",
    description: "Roll change to remaining workloads in scope",
    durationMs: 2000,
    status: "pending",
  },
]

export function LivePipelineModal({ workload, onClose }: LivePipelineModalProps) {
  const [stages, setStages] = useState<PipelineStage[]>(INITIAL_STAGES)
  const [started, setStarted] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [currentStageIndex, setCurrentStageIndex] = useState(0)
  // Live countdown for the CANARY stage so the user sees the seconds
  // tick. Maps to the realistic ~30s observation window.
  const [canaryElapsedMs, setCanaryElapsedMs] = useState(0)

  // Auto-start the pipeline preview when the modal mounts.
  useEffect(() => {
    if (!started) {
      const timer = setTimeout(() => setStarted(true), 400)
      return () => clearTimeout(timer)
    }
  }, [started])

  // Sequence runner — advances through stages with the per-stage
  // duration. Each stage flips pending → running → complete.
  useEffect(() => {
    if (!started || completed) return
    if (currentStageIndex >= stages.length) {
      setCompleted(true)
      return
    }

    // Mark current as running.
    setStages((prev) =>
      prev.map((s, i) =>
        i === currentStageIndex ? { ...s, status: "running" } : s,
      ),
    )

    const stage = stages[currentStageIndex]
    let canaryInterval: ReturnType<typeof setInterval> | null = null
    if (stage.id === "canary") {
      const start = Date.now()
      canaryInterval = setInterval(() => {
        const elapsed = Date.now() - start
        setCanaryElapsedMs(elapsed)
      }, 100)
    }

    const timeout = setTimeout(() => {
      setStages((prev) =>
        prev.map((s, i) =>
          i === currentStageIndex ? { ...s, status: "complete" } : s,
        ),
      )
      if (canaryInterval) clearInterval(canaryInterval)
      setCanaryElapsedMs(0)
      setCurrentStageIndex(currentStageIndex + 1)
    }, stage.durationMs)

    return () => {
      clearTimeout(timeout)
      if (canaryInterval) clearInterval(canaryInterval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, currentStageIndex, completed])

  const rec = workload.recommendation
  const allComplete = completed && stages.every((s) => s.status === "complete")

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
                  Safety Pipeline Preview
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
            <div className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1">
              <div className="text-slate-500 uppercase tracking-wider">Workload</div>
              <div className="text-slate-200 font-mono truncate" title={workload.workload.name}>
                {workload.workload.name}
              </div>
            </div>
            <div className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1">
              <div className="text-slate-500 uppercase tracking-wider">Scope</div>
              <div className="text-slate-200 font-semibold">
                {rec?.scope_workload_count || 1} workload{rec?.scope_workload_count === 1 ? "" : "s"}
              </div>
            </div>
            <div className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1">
              <div className="text-slate-500 uppercase tracking-wider">Rollback armed</div>
              <div className="text-emerald-300 font-semibold">24h post-apply</div>
            </div>
          </div>
        </div>

        {/* Stages */}
        <div className="p-4">
          <div className="space-y-2">
            {stages.map((stage, idx) => (
              <StageRow
                key={stage.id}
                stage={stage}
                isCurrent={idx === currentStageIndex && started && !completed}
                canaryElapsedMs={stage.id === "canary" ? canaryElapsedMs : 0}
              />
            ))}
          </div>

          {/* Completion banner */}
          {allComplete && (
            <div className="mt-4 rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <div className="flex-1">
                  <div className="text-[12px] font-semibold text-emerald-100">
                    Pipeline preview complete
                  </div>
                  <div className="text-[10px] text-emerald-200/80 mt-0.5">
                    All 6 safety gates passed in the preview. Rollback would remain
                    armed for 24 hours post-apply.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700/50 p-3 flex items-center justify-between">
          <div className="text-[10px] text-slate-500 italic">
            Preview only — no AWS mutation occurred. Wire to UnifiedPipeline
            execute endpoint to enable real-apply.
          </div>
          <div className="flex items-center gap-2">
            {allComplete && (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded border border-slate-600 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-[11px] font-semibold text-slate-200"
                onClick={onClose}
              >
                <RotateCcw className="w-3 h-3" />
                Run again
              </button>
            )}
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

function StageRow({
  stage,
  isCurrent,
  canaryElapsedMs,
}: {
  stage: PipelineStage
  isCurrent: boolean
  canaryElapsedMs: number
}) {
  // Visual state per stage status.
  const statusIcon = (() => {
    switch (stage.status) {
      case "complete":
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />
      case "running":
        return <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-400" />
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
      default:
        return "border-slate-700 bg-slate-900/40"
    }
  })()

  // Canary stage shows a live countdown overlay.
  const isCanary = stage.id === "canary"
  const canaryTotalSec = Math.round(stage.durationMs / 1000)
  const canaryElapsedSec = Math.round(canaryElapsedMs / 1000)

  return (
    <div className={`rounded-lg border ${tone} p-2.5 transition-all`}>
      <div className="flex items-center gap-2.5">
        <div className="shrink-0">{statusIcon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-100">
              {stage.label}
            </span>
            {stage.status === "running" && isCanary && (
              <span className="text-[10px] font-mono text-amber-300">
                {canaryElapsedSec}s / {canaryTotalSec}s
              </span>
            )}
            {stage.status === "complete" && (
              <span className="text-[10px] text-emerald-400/70">
                ✓ {(stage.durationMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">{stage.description}</div>
        </div>
      </div>

      {/* Canary progress bar */}
      {stage.status === "running" && isCanary && (
        <div className="mt-2 h-1 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all"
            style={{ width: `${(canaryElapsedMs / stage.durationMs) * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}

export default LivePipelineModal
