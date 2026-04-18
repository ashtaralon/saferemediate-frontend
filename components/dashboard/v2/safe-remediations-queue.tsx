"use client"

import { useMemo, useState } from "react"
import { Play, ShieldCheck, Shield, AlertTriangle, RotateCcw } from "lucide-react"
import { DashboardCard, DashboardEmptyState } from "./dashboard-card"
import { StatusChip } from "./status-chip"
import {
  relativeTime,
  type EnforcementAction,
  type EnforcementScoreData,
  type SourceState,
} from "./use-home-data"
import { SimulateFixModal } from "@/components/SimulateFixModal"

interface SafeRemediationsQueueProps {
  state: SourceState<EnforcementScoreData>
  onRetry: () => void
  maxVisible?: number
}

export function SafeRemediationsQueue({
  state,
  onRetry,
  maxVisible = 5,
}: SafeRemediationsQueueProps) {
  const [modalFinding, setModalFinding] = useState<{
    id: string
    title?: string
    severity?: string
  } | null>(null)

  const allActions = state.data?.actions ?? []
  const ranked = useMemo(() => rankActions(allActions), [allActions])
  const visible = ranked.slice(0, maxVisible)
  const hiddenCount = ranked.length - visible.length

  return (
    <>
      <DashboardCard
        title="Safe to remediate now"
        description="Ranked by confidence × blast radius"
        loading={state.loading}
        error={state.error ?? null}
        onRetry={onRetry}
        freshness={relativeTime(state.fetchedAt)}
      >
        {ranked.length === 0 ? (
          <DashboardEmptyState
            title="No high-confidence remediations for this system"
            hint="Either nothing needs remediating, or evidence confidence is below threshold. Ingest more CloudTrail history to raise confidence."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {visible.map((a) => (
              <ActionRow
                key={a.id}
                action={a}
                onSimulate={() =>
                  setModalFinding({
                    id: a.id,
                    title: a.title,
                    severity: a.confidence === "high" ? "HIGH" : "MEDIUM",
                  })
                }
              />
            ))}
            {hiddenCount > 0 ? (
              <div className="pt-1 text-xs text-slate-500">
                +{hiddenCount} more — see Least Privilege tab
              </div>
            ) : null}
          </div>
        )}
      </DashboardCard>

      <SimulateFixModal
        isOpen={!!modalFinding}
        onClose={() => setModalFinding(null)}
        finding={modalFinding ?? undefined}
      />
    </>
  )
}

function ActionRow({
  action,
  onSimulate,
}: {
  action: EnforcementAction
  onSimulate: () => void
}) {
  const tone = confidenceTone(action.confidence)
  const Icon = layerIcon(action.layer)
  const canApply = action.confidence === "high"

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 transition-colors hover:bg-slate-50">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <div
            className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md ${
              action.layer === "privilege"
                ? "bg-blue-50 text-blue-700"
                : action.layer === "network"
                  ? "bg-amber-50 text-amber-800"
                  : "bg-emerald-50 text-emerald-700"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="truncate text-sm font-medium text-slate-900">{action.title}</div>
              {action.count > 1 ? (
                <StatusChip tone="neutral">×{action.count}</StatusChip>
              ) : null}
            </div>
            {action.detail ? (
              <div className="mt-0.5 truncate text-xs text-slate-600" title={action.detail}>
                {action.detail}
              </div>
            ) : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StatusChip tone={tone}>confidence · {action.confidence}</StatusChip>
              {action.observationDays > 0 ? (
                <StatusChip tone="neutral">{action.observationDays}d evidence</StatusChip>
              ) : null}
              {action.rollback ? (
                <StatusChip tone="neutral">
                  <RotateCcw className="h-2.5 w-2.5" />
                  rollback ready
                </StatusChip>
              ) : null}
              {action.impact ? (
                <span className="text-[11px] text-slate-500">· {action.impact}</span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onSimulate}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Play className="h-3 w-3" />
            Simulate
          </button>
          <button
            type="button"
            onClick={onSimulate}
            disabled={!canApply}
            title={
              canApply
                ? "Opens simulation; apply is gated inside the modal"
                : "Only high-confidence actions can be applied"
            }
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
              canApply
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "cursor-not-allowed bg-slate-100 text-slate-400"
            }`}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

function rankActions(actions: EnforcementAction[]): EnforcementAction[] {
  const confOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
  const layerOrder: Record<string, number> = { privilege: 0, network: 1, data: 2 }
  return [...actions].sort((a, b) => {
    const c = (confOrder[a.confidence] ?? 3) - (confOrder[b.confidence] ?? 3)
    if (c !== 0) return c
    const l = (layerOrder[a.layer] ?? 3) - (layerOrder[b.layer] ?? 3)
    if (l !== 0) return l
    return (b.count ?? 0) - (a.count ?? 0)
  })
}

function confidenceTone(c: EnforcementAction["confidence"]): "green" | "amber" | "red" {
  if (c === "high") return "green"
  if (c === "medium") return "amber"
  return "red"
}

function layerIcon(layer: EnforcementAction["layer"]) {
  if (layer === "privilege") return ShieldCheck
  if (layer === "network") return Shield
  return AlertTriangle
}
