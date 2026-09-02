"use client"

import type { IamGapAnalysis } from "./types"

type EvidenceTableProps = {
  gap: IamGapAnalysis | null
}

function dependencyLabel(gap: IamGapAnalysis) {
  if (!gap.dependency_context?.has_critical_dependencies) return "None detected"
  const names = (gap.dependency_context.dependencies || [])
    .map((dep) => dep.name)
    .filter(Boolean)
    .slice(0, 4)
  return names.length > 0 ? names.join(", ") : "Critical dependencies detected"
}

export function EvidenceTable({ gap }: EvidenceTableProps) {
  if (!gap) return null

  const rows: Array<{ label: string; value: string }> = [
    { label: "Observation window", value: `${gap.observation_days} days` },
    {
      label: "API events found",
      // null is "not measured", never "0" or "null" (F6).
      value: gap.summary.cloudtrail_events == null ? "not measured" : `${gap.summary.cloudtrail_events}`,
    },
    {
      label: "Evidence source",
      value:
        gap.summary.data_confidence === "OBSERVED"
          ? "CloudTrail observed behavior"
          : gap.summary.data_confidence === "UNKNOWN"
            ? "Coverage incomplete"
            : gap.summary.data_confidence,
    },
    { label: "Dependencies", value: dependencyLabel(gap) },
  ]

  if (!gap.is_remediable) {
    rows.push({
      label: "Evidence gap",
      value: gap.remediable_reason,
    })
  } else if (gap.behavioral_authority?.limitation) {
    rows.push({
      label: "Evidence note",
      value: gap.behavioral_authority.limitation,
    })
  }

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-950">Evidence</h3>
      <div className="mt-4 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-slate-50">
        {rows.slice(0, 5).map((row) => (
          <div key={row.label} className="grid gap-2 px-4 py-3 md:grid-cols-[220px_1fr]">
            <div className="text-sm font-medium text-slate-500">{row.label}</div>
            <div className="text-sm text-slate-900">{row.value}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
