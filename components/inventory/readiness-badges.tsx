"use client"

import { CheckCircle2, HelpCircle, XCircle } from "lucide-react"
import {
  formatMaxOutcome,
  READINESS_LAYER_LABELS,
  type ReadinessPayload,
} from "@/lib/readiness-labels"

function LayerIcon({ ok, unknown }: { ok: boolean; unknown?: boolean }) {
  if (unknown) return <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
  if (ok) return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
  return <XCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
}

export function ReadinessBadges({
  readiness,
  loading,
  error,
}: {
  readiness: ReadinessPayload | null
  loading?: boolean
  error?: string | null
}) {
  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Checking data readiness…
      </div>
    )
  }

  if (error || !readiness) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Readiness check unavailable{error ? `: ${error}` : ""}.
      </div>
    )
  }

  const layers = {
    inventory: readiness.inventory,
    config_collected: readiness.config_collected,
    evidence_collected: readiness.evidence_collected,
    remediation_ready: readiness.remediation_ready,
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Data readiness
        </p>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700">
          Max decision: <strong>{formatMaxOutcome(readiness.max_outcome)}</strong>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {READINESS_LAYER_LABELS.map(({ key, label }) => (
          <div
            key={key}
            className="flex items-center gap-1.5 text-[11px] text-slate-700 min-w-0"
          >
            <LayerIcon ok={layers[key]} unknown={key === "evidence_collected" && !readiness.surface_id?.startsWith("inventory") && !layers[key] && !layers.config_collected} />
            <span className="truncate">{label}</span>
          </div>
        ))}
      </div>

      {!readiness.config_collected && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1">
          Configuration not fully collected — run <strong>Sync from AWS</strong> before trusting this view.
        </p>
      )}

      {readiness.missing && readiness.missing.length > 0 && (
        <details className="text-[11px] text-slate-500">
          <summary className="cursor-pointer hover:text-slate-700">Missing ({readiness.missing.length})</summary>
          <ul className="mt-1 list-disc pl-4 space-y-0.5 font-mono">
            {readiness.missing.slice(0, 8).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
