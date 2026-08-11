"use client"

import { Bot, CheckCircle2, ChevronDown, RotateCcw, Route, SearchCheck } from "lucide-react"
import type { ConfigurationFixExplanation } from "@/components/topology-v0-2/estate-operations"

interface Props {
  explanation: ConfigurationFixExplanation | null
  loading?: boolean
}

export function OperationsExplanation({ explanation, loading = false }: Props) {
  if (loading && !explanation) {
    return (
      <div className="rounded-xl border bg-white p-4 text-xs text-slate-500" style={{ borderColor: "#DDE3E8" }}>
        Building the operator briefing from the reviewed plan…
      </div>
    )
  }
  if (!explanation) return null
  if (
    !explanation.headline
    || !explanation.why_this_change
    || !explanation.current_state
    || !explanation.scope_summary
    || !explanation.verification
    || !explanation.rollback
    || !Array.isArray(explanation.steps)
  ) return null

  const assisted = explanation.source === "llm" || explanation.source === "llm_cache"
  return (
    <section
      className="overflow-hidden rounded-2xl border bg-white"
      style={{ borderColor: "#B9DED8" }}
      data-testid="configuration-fix-explanation"
    >
      <div className="border-b px-4 py-3" style={{ borderColor: "#D7EEEA", background: "#F0FDFA" }}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "#0E8B7A" }}>
              Why this matters
            </div>
            <h3 className="mt-1 text-sm font-bold text-slate-900">{explanation.headline}</h3>
          </div>
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-wide"
            style={{ borderColor: "#B9DED8", background: "#FFFFFF", color: "#0E8B7A" }}
            title={assisted
              ? "AI simplified the wording. Scope, steps, verification, and rollback are still produced by the Cyntro engine."
              : "The LLM is disabled or unavailable. This explanation comes directly from the Cyntro engine."}
          >
            {assisted ? <Bot className="h-3 w-3" /> : <Route className="h-3 w-3" />}
            {assisted ? "AI wording · engine facts" : "Engine wording"}
          </span>
        </div>
      </div>

      <div className="p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Operational reason</div>
            <p className="mt-1 text-xs leading-5 text-slate-700">{explanation.why_this_change}</p>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Current situation</div>
            <p className="mt-1 text-xs leading-5 text-slate-700">{explanation.current_state}</p>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">
          <strong className="text-slate-800">Change boundary:</strong> {explanation.scope_summary}
        </div>

        <details className="group mt-3 rounded-xl border border-slate-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-semibold text-slate-700">
            Execution, verification, and rollback details
            <ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t p-3" style={{ borderColor: "#E2E8F0" }}>
            <ol className="space-y-2">
              {explanation.steps.map((step, index) => (
                <li key={`${index}-${step}`} className="flex items-start gap-2 text-xs leading-5 text-slate-700">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-700 text-[10px] font-bold text-white">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>

            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">
              <div className="flex items-start gap-2">
                <SearchCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" />
                <span><strong className="text-slate-800">Verification:</strong> {explanation.verification}</span>
              </div>
              <div className="mt-2 flex items-start gap-2">
                <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-600" />
                <span><strong className="text-slate-800">Rollback:</strong> {explanation.rollback}</span>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-500">
              <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" />
              The explanation cannot approve or modify this operation.
            </div>
          </div>
        </details>
      </div>
    </section>
  )
}
