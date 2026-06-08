"use client"

import { useMemo } from "react"
import { ChevronRight, AlertCircle } from "lucide-react"
import { DashboardCard, DashboardEmptyState } from "./dashboard-card"
import { StatusChip } from "./status-chip"
import { relativeTime, type SourceState, type SystemSummary } from "./use-home-data"

interface TopAccountsCardProps {
  state: SourceState<SystemSummary[]>
  activeSystem: string
  onSelect: (systemName: string) => void
  onRetry: () => void
  maxVisible?: number
}

export function TopAccountsCard({
  state,
  activeSystem,
  onSelect,
  onRetry,
  maxVisible = 6,
}: TopAccountsCardProps) {
  const systems = state.data ?? []

  const ranked = useMemo(() => rankSystems(systems), [systems])
  const visible = ranked.slice(0, maxVisible)
  const hiddenCount = ranked.length - visible.length

  return (
    <DashboardCard
      title="Top accounts"
      description={
        ranked.length > 0
          ? `${ranked.length} systems · lowest score first`
          : undefined
      }
      loading={state.loading}
      error={state.error ?? null}
      onRetry={onRetry}
      freshness={relativeTime(state.fetchedAt)}
    >
      {ranked.length === 0 ? (
        <DashboardEmptyState title="No systems discovered" />
      ) : (
        <div className="flex flex-col">
          <div className="flex flex-col divide-y divide-slate-100">
            {visible.map((s) => (
              <AccountRow
                key={s.name}
                system={s}
                active={s.name === activeSystem}
                onSelect={() => onSelect(s.name)}
              />
            ))}
          </div>
          {hiddenCount > 0 ? (
            <div className="pt-3 text-xs text-slate-500">+{hiddenCount} more</div>
          ) : null}
        </div>
      )}
    </DashboardCard>
  )
}

function AccountRow({
  system,
  active,
  onSelect,
}: {
  system: SystemSummary
  active: boolean
  onSelect: () => void
}) {
  const score = getScore(system)
  const scoreColor =
    score === null
      ? "text-slate-400"
      : score >= 85
        ? "text-emerald-700"
        : score >= 60
          ? "text-amber-700"
          : "text-red-700"

  const critical = system.critical_count ?? 0
  const high = system.high_count ?? 0
  const status = (system.status || "").toLowerCase()

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group flex w-full items-center gap-3 py-2.5 text-left ${
        active ? "bg-blue-50/40" : "hover:bg-slate-50"
      }`}
    >
      <div className={`w-12 shrink-0 text-right text-2xl font-semibold tabular-nums ${scoreColor}`}>
        {score !== null ? score : "—"}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-900">{system.name}</span>
          {active ? <StatusChip tone="blue">active</StatusChip> : null}
          <StatusTone status={status} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          {system.environment ? <span>{system.environment}</span> : null}
          {system.region ? <span>· {system.region}</span> : null}
          {typeof system.resourceCount === "number" ? (
            <span>· {system.resourceCount.toLocaleString()} resources</span>
          ) : null}
          {critical > 0 ? (
            <StatusChip tone="red">
              <AlertCircle className="h-2.5 w-2.5" />
              {critical} critical
            </StatusChip>
          ) : null}
          {high > 0 ? <StatusChip tone="amber">{high} high</StatusChip> : null}
        </div>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-500" />
    </button>
  )
}

function StatusTone({ status }: { status: string }) {
  if (!status) return null
  if (status === "healthy") return <StatusChip tone="green">healthy</StatusChip>
  if (status === "warning") return <StatusChip tone="amber">warning</StatusChip>
  if (status === "at_risk" || status === "critical")
    return <StatusChip tone="red">at risk</StatusChip>
  return <StatusChip tone="neutral">{status}</StatusChip>
}

function getScore(s: SystemSummary): number | null {
  if (typeof s.healthScore === "number") return Math.round(s.healthScore)
  if (typeof s.health_score === "number") return Math.round(s.health_score)
  return null
}

function rankSystems(systems: SystemSummary[]): SystemSummary[] {
  return [...systems].sort((a, b) => {
    // Status first — at_risk/warning before healthy
    const statusOrder: Record<string, number> = { at_risk: 0, critical: 0, warning: 1, healthy: 2 }
    const sa = statusOrder[(a.status || "").toLowerCase()] ?? 3
    const sb = statusOrder[(b.status || "").toLowerCase()] ?? 3
    if (sa !== sb) return sa - sb

    // Then lowest score first
    const scoreA = getScore(a) ?? 100
    const scoreB = getScore(b) ?? 100
    if (scoreA !== scoreB) return scoreA - scoreB

    // Tiebreak — most critical findings first
    return (b.critical_count ?? 0) - (a.critical_count ?? 0)
  })
}
