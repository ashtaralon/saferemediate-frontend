"use client"

import { ChevronDown, ChevronUp } from "lucide-react"
import { useMemo, useState } from "react"
import type { IamGapAnalysis } from "./types"

type AdvancedDrawerProps = {
  gap: IamGapAnalysis | null
  defaultOpen?: boolean
}

export function AdvancedDrawer({ gap, defaultOpen = false }: AdvancedDrawerProps) {
  const [open, setOpen] = useState(defaultOpen)

  const reductionPct = useMemo(() => {
    if (!gap?.summary?.total_permissions) return null
    return Math.round((gap.summary.unused_count / gap.summary.total_permissions) * 100)
  }, [gap])

  if (!gap) return null

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Advanced</h3>
          <p className="mt-1 text-sm text-slate-600">
            Raw confidence, safety vector, and full permission detail live here.
          </p>
        </div>
        {open ? <ChevronUp className="h-5 w-5 text-slate-500" /> : <ChevronDown className="h-5 w-5 text-slate-500" />}
      </button>

      {open && (
        <div className="mt-5 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">LP score</div>
              <div className="mt-2 text-2xl font-bold text-slate-950">{gap.summary.lp_score ?? "—"}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Reduction percentage</div>
              <div className="mt-2 text-2xl font-bold text-slate-950">
                {reductionPct === null ? "—" : `${reductionPct}%`}
              </div>
            </div>
          </div>

          <pre className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-950 p-4 text-xs text-slate-100">
            {JSON.stringify(
              {
                confidence: gap.confidence,
                confidence_groups: gap.confidence_groups,
                safety_vector: gap.safety_vector,
                permissions_analysis: gap.permissions_analysis,
                evidence_breakdown: gap.evidence_breakdown,
              },
              null,
              2,
            )}
          </pre>
        </div>
      )}
    </section>
  )
}
