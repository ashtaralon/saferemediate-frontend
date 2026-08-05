"use client"

import { AlertTriangle, CheckCircle2, ShieldCheck, XCircle } from "lucide-react"

export interface ExfiltrationSimulation {
  schema_version: string
  simulation_id?: string
  verdict: "OPEN" | "CLOSED" | "UNKNOWN" | string
  basis?: string
  steps: Array<{
    step: number
    operation: string
    subject?: string | null
    basis?: string | null
  }>
  potential_damage?: {
    headline?: string | null
    resource_scope?: string | null
    operation?: string | null
    damage_score?: number | null
    severity?: string | null
  } | null
  missing_evidence?: string[]
  recommended_cuts?: Array<{
    type?: string
    intent?: string
    expected_effect?: string
  }>
}

function verdictPresentation(verdict: string) {
  if (verdict === "OPEN") return {
    label: "Executable exfiltration path",
    Icon: XCircle,
    classes: "border-red-300 bg-red-50 text-red-950 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100",
  }
  if (verdict === "CLOSED") return {
    label: "Exfiltration path blocked",
    Icon: ShieldCheck,
    classes: "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100",
  }
  return {
    label: "Exfiltration evidence incomplete",
    Icon: AlertTriangle,
    classes: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",
  }
}

export function ExfiltrationSimulationSummary({
  simulation,
  compact = false,
}: {
  simulation: ExfiltrationSimulation
  compact?: boolean
}) {
  const presentation = verdictPresentation(simulation.verdict)
  const firstCut = simulation.recommended_cuts?.[0]
  return (
    <section
      className={`rounded-md border px-2.5 py-2 ${presentation.classes}`}
      data-testid="atlas-exfiltration-simulation"
      data-verdict={simulation.verdict}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold">
          <presentation.Icon className="h-3.5 w-3.5" />
          {presentation.label}
        </span>
        {simulation.potential_damage?.damage_score != null ? (
          <span className="text-[10px] font-semibold">
            Damage {simulation.potential_damage.damage_score}/100 · {simulation.potential_damage.severity}
          </span>
        ) : null}
      </div>
      {simulation.potential_damage?.headline ? (
        <p className="mt-1 text-[11px] leading-4">{simulation.potential_damage.headline}</p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">
        {simulation.steps.map((step, index) => (
          <span key={`${step.step}-${step.operation}`} className="inline-flex items-center gap-1">
            {index > 0 ? <span aria-hidden>→</span> : null}
            <span className="rounded border border-current/20 bg-background/50 px-1.5 py-0.5" title={step.subject || undefined}>
              {step.operation}
            </span>
          </span>
        ))}
      </div>
      {!compact && firstCut?.intent ? (
        <p className="mt-1.5 flex items-start gap-1 text-[10px]">
          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
          <span><strong>Fix first:</strong> {firstCut.intent}</span>
        </p>
      ) : null}
      {simulation.missing_evidence?.length ? (
        <p className="mt-1 text-[10px] opacity-80">
          Missing evidence: {simulation.missing_evidence.join(" · ")}
        </p>
      ) : null}
    </section>
  )
}
