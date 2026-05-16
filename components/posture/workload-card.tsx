"use client"

import { VERDICT_META, type WorkloadSummary } from "./posture-types"

interface Props {
  workload: WorkloadSummary
  selected: boolean
  onClick: () => void
}

const TONE_CLASS = {
  critical: "border-red-500/70 bg-red-500/10 text-red-50 hover:bg-red-500/20",
  warning: "border-amber-500/60 bg-amber-500/10 text-amber-50 hover:bg-amber-500/20",
  info: "border-sky-500/60 bg-sky-500/10 text-sky-50 hover:bg-sky-500/20",
  ok: "border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-900/90",
} as const

const PRIO_BADGE_CLASS = {
  critical: "bg-red-600 text-red-50",
  warning: "bg-amber-600 text-amber-50",
  info: "bg-sky-600 text-sky-50",
  ok: "bg-zinc-700 text-zinc-200",
} as const

function shortenLabel(labels: string[]): string {
  if (!labels.length) return "Workload"
  const priority = ["EC2Instance", "Lambda", "ECS", "RDS", "Service", "Resource"]
  for (const p of priority) if (labels.includes(p)) return p
  return labels[0]
}

export function WorkloadCard({ workload, selected, onClick }: Props) {
  const meta = VERDICT_META[workload.posture_verdict] || VERDICT_META.CORRECT
  const tone = meta.tone
  const kind = shortenLabel(workload.labels)
  const inSubnet = workload.subnet_is_public === true
    ? "public subnet"
    : workload.subnet_is_public === false
      ? "private subnet"
      : "subnet unknown"

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group flex w-full flex-col gap-2 rounded-md border px-3 py-2.5 text-left transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-cyan-400/40",
        TONE_CLASS[tone],
        selected ? "ring-2 ring-cyan-400/70" : "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PRIO_BADGE_CLASS[tone]}`}>
          {meta.priorityCode}
        </span>
        <span className="truncate text-[11px] uppercase tracking-wider opacity-70">
          {kind}
        </span>
      </div>

      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold leading-tight">
          {workload.name}
        </div>
        <div className="truncate text-[11px] opacity-70">
          {workload.system_name || "—"} · {inSubnet}
        </div>
      </div>

      <div className="text-[11px] leading-snug opacity-85">
        {meta.label}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-wider opacity-70">
        {workload.is_sensitive && <span>· Sensitive</span>}
        {workload.direct_path_count > 0 && <span>· {workload.direct_path_count} direct path{workload.direct_path_count === 1 ? "" : "s"}</span>}
        {workload.lb_chain_count > 0 && <span>· {workload.lb_chain_count} LB chain{workload.lb_chain_count === 1 ? "" : "s"}</span>}
        {workload.observed_inbound_from_public_365d && (
          <span>· {workload.observed_inbound_unique_sources_365d} inbound src</span>
        )}
      </div>
    </button>
  )
}
