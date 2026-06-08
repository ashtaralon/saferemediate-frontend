"use client"

// Proposal journey bar per docs/shared-resources-real-data-wiring.md §3
// (backend repo, PR-4 shipped commit f2b89ef).
//
// Renders the CREATE → MIGRATE → DELETE lifecycle of an approved
// SharedResourceNarrowingProposal. Operator sees step + per-step
// progress (scoped-roles-created / consumers-migrated / deletion-state)
// at a glance.
//
// Discipline:
//  - pattern_render_the_answer_not_the_inventory — the bar shows
//    "where in the journey is this proposal?" not "here are 7 fields."
//  - pattern_geometry_must_match_label — the highlighted step matches
//    the journey_step field; progress fractions match the planned vs
//    completed counts honestly.
//  - feedback_signal_language — labels are descriptive
//    ("In progress", "Pending"), not commit-pressuring.

import { useEffect, useState } from "react"
import { AlertCircle, CheckCircle2, Circle, Loader2 } from "lucide-react"
import type { NarrowingProposalJourney } from "./types"

interface Props {
  proposalId: string
}

interface StepDescriptor {
  step: 1 | 2 | 3
  label: string
  detail: (j: NarrowingProposalJourney) => string
}

const STEPS: StepDescriptor[] = [
  {
    step: 1,
    label: "Create scoped roles",
    detail: (j) => `${j.scoped_roles_created}/${j.scoped_roles_planned} created`,
  },
  {
    step: 2,
    label: "Migrate consumers",
    detail: (j) => `${j.consumers_migrated}/${j.consumers_planned} migrated`,
  },
  {
    step: 3,
    label: "Delete shared role",
    detail: (j) => j.shared_role_deletion_state.replace(/_/g, " "),
  },
]

export function ProposalJourneyBar({ proposalId }: Props) {
  const [journey, setJourney] = useState<NarrowingProposalJourney | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/proxy/shared-resources/narrowing-proposals/${encodeURIComponent(proposalId)}/journey`,
          { cache: "no-store" },
        )
        if (!res.ok) {
          throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`)
        }
        const data = (await res.json()) as NarrowingProposalJourney
        if (!cancelled) setJourney(data)
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err)
          setError(msg)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [proposalId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-3 text-xs text-slate-500">
        <Loader2 className="w-3 h-3 animate-spin mr-2" />
        Loading journey…
      </div>
    )
  }

  if (error || !journey) {
    return (
      <div className="flex items-start gap-2 p-2 rounded border border-rose-500/30 bg-rose-500/10 text-xs text-rose-200">
        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
        <div>
          <div className="font-semibold">Journey unavailable</div>
          {error && <div className="text-rose-300/80 text-[10px] mt-0.5">{error}</div>}
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col gap-2"
      data-proposal-journey="true"
      data-proposal-id={journey.proposal_id}
      data-journey-step={journey.journey_step}
      data-derived-progress-pct={Math.round(journey.derived_progress_pct * 100)}
    >
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
        <span>Proposal journey</span>
        <span className="font-mono">
          {Math.round(journey.derived_progress_pct * 100)}% complete
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {STEPS.map(({ step, label, detail }) => {
          const isComplete = step < journey.journey_step
          const isCurrent = step === journey.journey_step
          const tone = isComplete
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            : isCurrent
              ? "border-teal-500/50 bg-teal-500/15 text-teal-200"
              : "border-slate-700 bg-slate-900/40 text-slate-500"
          return (
            <div
              key={step}
              data-journey-step-card={step}
              data-journey-step-state={
                isComplete ? "complete" : isCurrent ? "current" : "pending"
              }
              className={`flex items-start gap-2 p-2 rounded border ${tone}`}
            >
              {isComplete ? (
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              ) : (
                <Circle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider">
                  Step {step} · {label}
                </div>
                <div className="text-[10px] opacity-80 truncate" title={detail(journey)}>
                  {detail(journey)}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
