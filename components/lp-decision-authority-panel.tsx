"use client"

import React from "react"

import {
  decisionAuthorityView,
  previewDecisionGrade,
  type DecisionAuthorityView,
  type PreviewDecisionGrade,
} from "@/lib/lp-decision-authority"

type Props = {
  /** The Review's raw `decision_authority` block. */
  review: unknown
  /** The Preview's raw `decision_authority` block, once a Preview has run; undefined before. */
  preview?: unknown
}

function Receipt({ view }: { view: DecisionAuthorityView }) {
  if (!view.receipt) return null
  const r = view.receipt
  return (
    <div className="mt-1 text-[11px] text-slate-500" data-testid="decision-authority-receipt">
      Generation {r.projectionGeneration} · receipt {r.projectionReceiptHash.slice(0, 12)} · run {r.stagingRunId}
      {r.projectedThrough ? ` · evidence through ${r.projectedThrough}` : ""}
      {view.publishedAt ? ` · published ${view.publishedAt}` : ""}
    </div>
  )
}

function PreviewGrade({ grade }: { grade: PreviewDecisionGrade }) {
  if (grade.kind === "not_reported") return null
  return (
    <div className="mt-2 border-t border-slate-200 pt-2" data-testid="decision-authority-preview" data-grade={grade.kind}>
      <div className="text-xs font-semibold text-slate-800">{grade.title}</div>
      {grade.reasons.length > 0 && (
        <div className="text-[11px] text-slate-600">Reasons: {grade.reasons.join(", ")}</div>
      )}
      {grade.inUse.length > 0 && (
        <div className="text-[11px] text-slate-600">In use: {grade.inUse.join(", ")}</div>
      )}
      <div className="text-[11px] text-slate-500">
        Informational only: this does not authorize removal and does not change the Preview's safety decision.
      </div>
    </div>
  )
}

/**
 * What the activated RoleActionDecision generation says about this role. Coverage and removal are shown
 * separately: complete coverage is not a removal verdict, and nothing is shown as removable unless the
 * backend listed it as CLEARED.
 */
export function DecisionAuthorityPanel({ review, preview }: Props) {
  const view = decisionAuthorityView(review)
  const grade = previewDecisionGrade(preview)
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2" data-testid="decision-authority" data-kind={view.kind}>
      <div className="text-xs font-semibold text-slate-800">{view.title}</div>
      <div className="text-[11px] text-slate-600">{view.detail}</div>
      <Receipt view={view} />
      {(view.kind === "populated" || view.kind === "empty") && (
        <div className="mt-1 space-y-0.5 text-[11px] text-slate-600">
          <div data-testid="decision-authority-coverage">
            Coverage: {view.coverageComplete ? "every configured permission is decided" : "not every configured permission is decided"}
            {view.configuredSetClosed === false ? " (the configured set is open: wildcards or unreadable policies)" : ""}
          </div>
          <div data-testid="decision-authority-removal">
            Cleared for removal: {view.cleared.length} · In use: {view.inUse.length} · Cannot determine: {view.indeterminate.length}
          </div>
          {view.indeterminate.length > 0 && (
            <div className="text-slate-500">
              Why not cleared: {Array.from(new Set(view.indeterminate.map((e) => e.reason))).join(", ")}
            </div>
          )}
        </div>
      )}
      <PreviewGrade grade={grade} />
    </div>
  )
}
