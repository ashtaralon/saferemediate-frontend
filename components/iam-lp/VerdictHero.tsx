"use client"

import { AlertCircle, CheckCircle2, RotateCcw, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { IAM_LP_COPY } from "./copy"
import type { DecisionSplit, ExecutionState, IamGapAnalysis } from "./types"

type VerdictHeroProps = {
  gap: IamGapAnalysis | null
  split: DecisionSplit
  execution: ExecutionState
  verdictBucket: "blocked" | "manual_review" | "human_approval" | "auto_execute"
  blockedReason?: string | null
  llmSummary?: { executive: string; evidence: string; change: string } | null
}

function decisionChipLabel(
  gap: IamGapAnalysis,
  split: DecisionSplit,
  verdictBucket: VerdictHeroProps["verdictBucket"],
  blockedReason?: string | null,
) {
  if (verdictBucket === "blocked") {
    return `Blocked · ${blockedReason || IAM_LP_COPY.chipBlocked}`
  }
  if (!gap.is_remediable) {
    return `Blocked · ${gap.remediable_reason || IAM_LP_COPY.chipBlocked}`
  }
  if (split.autoApplyCount > 0 && split.needsApprovalCount > 0) {
    return IAM_LP_COPY.chipSplit(split.autoApplyCount, split.needsApprovalCount)
  }
  if (split.autoApplyCount > 0) return `${split.autoApplyCount} auto-apply`
  if (split.needsApprovalCount > 0) return `${split.needsApprovalCount} need approval`
  if (split.protectedCount > 0) return `${split.protectedCount} protected`
  return "No change needed"
}

export function VerdictHero({
  gap,
  split,
  execution,
  verdictBucket,
  blockedReason,
  llmSummary,
}: VerdictHeroProps) {
  if (!gap) return null

  const headline =
    gap.summary.unused_count > 0 ? IAM_LP_COPY.overPrivileged : IAM_LP_COPY.matchesObserved
  const support = IAM_LP_COPY.support(
    gap.summary.total_permissions || 0,
    gap.summary.used_count || 0,
  )
  const undoReady =
    !!execution.snapshot?.snapshot_id || execution.rollback?.available === true

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-rose-700">
            <ShieldAlert className="h-3.5 w-3.5" />
            IAM least privilege
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{headline}</h2>
          <p className="mt-2 text-base text-slate-700">{support}</p>
          {llmSummary?.executive && (
            <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
              <span className="font-semibold">Summary:</span> {llmSummary.executive}
            </div>
          )}
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-5 py-4">
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Current state</div>
          <div className="mt-2 flex items-end gap-3">
            <div className="text-4xl font-bold text-slate-950">{gap.summary.total_permissions}</div>
            <div className="pb-1 text-sm text-slate-600">allowed actions</div>
          </div>
          <div className="mt-2 text-sm text-slate-600">
            {gap.summary.used_count} observed · {gap.summary.unused_count} removable candidates
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          {IAM_LP_COPY.chipObserved(gap.observation_days, gap.summary.cloudtrail_events)}
        </div>
        <div
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm",
            gap.is_remediable
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-rose-200 bg-rose-50 text-rose-800",
          )}
        >
          <AlertCircle className="h-4 w-4" />
          {decisionChipLabel(gap, split, verdictBucket, blockedReason)}
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          <RotateCcw className="h-4 w-4 text-slate-500" />
          {undoReady ? IAM_LP_COPY.chipRollbackReady : IAM_LP_COPY.chipSnapshotOnApply}
        </div>
      </div>
    </section>
  )
}
