"use client"

import { ArrowRight, Loader2 } from "lucide-react"
import { IAM_LP_COPY } from "./copy"
import type { DecisionSplit, ExecutionState, IamGapAnalysis } from "./types"
import { cn } from "@/lib/utils"
import { buildExecutionReadiness } from "./resolvers/executionReadiness"

type ExecutionPlanProps = {
  gap: IamGapAnalysis | null
  split: DecisionSplit
  execution: ExecutionState
  onSimulate: (permissions: string[]) => Promise<void>
  onApplySafeSet: (permissions: string[]) => Promise<void>
  onRequestApproval: (permissions: string[]) => Promise<void>
  onRollback: () => Promise<void>
}

const STAGES = ["Simulate", "Snapshot", "Apply", "Verify", "Rollback available"] as const

function stageState(index: number, execution: ExecutionState) {
  if (index === 0 && execution.simulation) return execution.simulation.ok ? "done" : "failed"
  if (index === 1 && execution.snapshot) return execution.snapshot.status
  if (index === 2 && execution.apply) return execution.apply.ok ? "done" : "failed"
  if (index === 3 && execution.verify) return execution.verify.ok ? "done" : "failed"
  if (index === 4 && execution.rollback?.available) return "done"
  return "idle"
}

function stageNote(gap: IamGapAnalysis | null, execution: ExecutionState, split: DecisionSplit) {
  if (!gap) return ""
  if (execution.verify?.ok) return execution.verify.message || "Applied. Rollback available."
  if (execution.apply?.ok) {
    return execution.snapshot?.snapshot_id
      ? `Snapshot ${execution.snapshot.snapshot_id} written before mutation.`
      : "Apply completed. Rollback metadata ready."
  }
  if (execution.simulation?.ok) {
    return `No breaking dependency found for the ${split.autoApplyCount} auto-apply removals.`
  }
  if (split.conservationError) {
    return "Change set held: permission identities or summary counts do not conserve."
  }
  if (gap.is_remediable === false && gap.remediable_reason) {
    return gap.remediable_reason
  }
  return "Simulate the selected change set before applying any IAM mutation."
}

export function ExecutionPlan({
  gap,
  split,
  execution,
  onSimulate,
  onApplySafeSet,
  onRequestApproval,
  onRollback,
}: ExecutionPlanProps) {
  if (!gap) return null

  const simulateSelection =
    split.autoApplyPermissions.length > 0
      ? split.autoApplyPermissions
      : [
          ...split.autoApplyPermissions,
          ...split.needsApprovalPermissions,
        ]

  const readiness = buildExecutionReadiness(gap, split, execution)

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-950">Execution plan</h3>
      <p className="mt-1 text-sm text-slate-600">
        Keep the path obvious: simulate, snapshot, apply, verify, and always preserve rollback.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {STAGES.map((stage, index) => {
          const state = stageState(index, execution)
          return (
            <div key={stage} className="flex items-center gap-3">
              <div
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-medium",
                  state === "done" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                  state === "failed" && "border-rose-200 bg-rose-50 text-rose-700",
                  state === "pending" && "border-amber-200 bg-amber-50 text-amber-700",
                  state === "ready" && "border-sky-200 bg-sky-50 text-sky-700",
                  state === "idle" && "border-slate-200 bg-slate-50 text-slate-600",
                )}
              >
                {stage}
              </div>
              {index < STAGES.length - 1 && <ArrowRight className="h-4 w-4 text-slate-400" />}
            </div>
          )
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
        {stageNote(gap, execution, split)}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!readiness.canSimulate || simulateSelection.length === 0}
          onClick={() => void onSimulate(simulateSelection)}
          className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {IAM_LP_COPY.simulate}
        </button>

        {split.autoApplyCount > 0 && (
          <button
            type="button"
            disabled={!readiness.canApplySafe}
            onClick={() => void onApplySafeSet(split.autoApplyPermissions)}
            className="inline-flex items-center justify-center rounded-full bg-[#2D51DA] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2446c0] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {IAM_LP_COPY.applySafe(split.autoApplyCount)}
          </button>
        )}

        {split.needsApprovalCount > 0 && (
          <button
            type="button"
            disabled={!readiness.canRequestApproval}
            onClick={() => void onRequestApproval(split.needsApprovalPermissions)}
            className="inline-flex items-center justify-center rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {IAM_LP_COPY.requestApproval(split.needsApprovalCount)}
          </button>
        )}

        <button
          type="button"
          disabled={!execution.rollback?.available}
          onClick={() => void onRollback()}
          className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {execution.rollback?.status === "running" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Roll back
        </button>
      </div>
    </section>
  )
}
