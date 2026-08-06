"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, ChevronDown, ChevronRight, Landmark, Loader2, Settings2, ShieldCheck } from "lucide-react"
import {
  formatImpactMoney,
  type BusinessImpactResponse,
  type BusinessImpactScenario,
} from "@/lib/business-impact"
import { BusinessImpactSettings } from "./business-impact-settings"

function ExposureCard({ scenario }: { scenario: BusinessImpactScenario }) {
  const [expanded, setExpanded] = useState(false)
  const estimate = scenario.conditional_loss
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="grid gap-4 p-4 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-violet-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-700">{scenario.title}</span>
            <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">Confidence {scenario.confidence.toLowerCase()}</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-700">{scenario.business_effect}</p>
          <div className="mt-3 text-[11px] text-slate-500">{scenario.crown_jewel_name || scenario.crown_jewel_id} · {scenario.path_count} enabling path{scenario.path_count === 1 ? "" : "s"}</div>
        </div>

        <div className="space-y-3 border-l border-slate-200 pl-4">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">Technical exposure</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{scenario.technical_exposure.replace(/_/g, " ")}</div>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">{scenario.technical_exposure_basis}</p>
          </div>
          <div className="border-t border-slate-200 pt-3">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">Conditional loss · if this scenario occurs</div>
            {estimate ? (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div><div className="text-[9px] uppercase text-slate-400">Lower · P10</div><div className="text-sm font-semibold text-slate-700">{formatImpactMoney(estimate.p10, estimate.currency)}</div></div>
                <div><div className="text-[9px] uppercase text-slate-400">Central · P50</div><div className="text-sm font-semibold text-violet-800">{formatImpactMoney(estimate.p50, estimate.currency)}</div></div>
                <div><div className="text-[9px] uppercase text-slate-400">Severe · P90</div><div className="text-sm font-semibold text-rose-700">{formatImpactMoney(estimate.p90, estimate.currency)}</div></div>
              </div>
            ) : (
              <div className="mt-2 flex items-start gap-2 rounded-md bg-amber-50 p-2 text-[11px] leading-4 text-amber-900"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Add business-owned loss assumptions to calculate a defensible range.</div>
            )}
          </div>
        </div>
      </div>

      <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2 text-left text-[11px] font-semibold text-slate-600 hover:bg-slate-100">
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Calculation, assumptions, and regulatory exposure
      </button>
      {expanded ? (
        <div className="grid gap-5 border-t border-slate-200 p-4 lg:grid-cols-3">
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Loss components</h4>
            {estimate?.components.length ? <div className="mt-2 space-y-2">{estimate.components.map((component) => <div key={component.key} className="rounded-md border border-slate-100 bg-slate-50 p-2"><div className="flex justify-between gap-3 text-xs"><span className="font-semibold text-slate-700">{component.label}</span><span className="font-mono text-slate-600">{formatImpactMoney(component.low, estimate.currency)}–{formatImpactMoney(component.high, estimate.currency)}</span></div><div className="mt-1 text-[9px] text-slate-400">{component.source}</div></div>)}</div> : <p className="mt-2 text-xs text-slate-500">No monetary components are defined yet.</p>}
            {scenario.missing_inputs.length ? <div className="mt-3 text-[10px] leading-4 text-amber-800"><b>Missing inputs:</b> {scenario.missing_inputs.map((item) => item.replace(/_/g, " ")).join(", ")}</div> : null}
          </div>
          <div>
            <h4 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Landmark className="h-3.5 w-3.5" />Regulatory and contractual exposure</h4>
            {scenario.regulatory_exposure.length ? <div className="mt-2 space-y-2">{scenario.regulatory_exposure.map((item, index) => <div key={`${item.regime}-${index}`} className="rounded-md border border-slate-200 p-2"><div className="text-xs font-semibold text-slate-800">{item.regime} · {item.exposure_type}</div><div className="mt-1 text-[11px] text-slate-600">{item.amount != null && item.currency ? formatImpactMoney(item.amount, item.currency) : item.low != null && item.high != null && item.currency ? `${formatImpactMoney(item.low, item.currency)}–${formatImpactMoney(item.high, item.currency)}` : item.formula}</div><p className="mt-1 text-[9px] leading-4 text-slate-400">{item.conditions.join(" ")}</p><div className="mt-1 text-[9px] text-slate-400">{item.rule_version} · source checked {item.source_checked_at}</div><a href={item.source_url} target="_blank" rel="noreferrer" className="text-[9px] font-semibold text-violet-700 underline">Primary source</a></div>)}</div> : <p className="mt-2 text-xs text-slate-500">No potentially applicable rule pack is selected for this scenario.</p>}
          </div>
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Comparable public outcomes</h4>
            {scenario.comparable_incidents.length ? <div className="mt-2 space-y-2">{scenario.comparable_incidents.map((incident) => <div key={incident.incident_id} className="rounded-md border border-slate-200 p-2"><div className="text-xs font-semibold text-slate-800">{incident.title}</div><p className="mt-1 text-[11px] leading-4 text-slate-600">{incident.financial_outcome}</p><div className="mt-1 text-[9px] text-slate-400">{incident.similarity_reasons.join(" · ")}</div><a href={incident.source_url} target="_blank" rel="noreferrer" className="text-[9px] font-semibold text-violet-700 underline">{incident.source_kind}</a></div>)}</div> : <p className="mt-2 text-xs text-slate-500">No high-provenance comparable is matched yet.</p>}
            <p className="mt-2 text-[9px] leading-4 text-slate-400">Context only. Public outcomes never become automatic multipliers or predictions.</p>
          </div>
        </div>
      ) : null}
    </article>
  )
}

export function BusinessImpactPanel({ systemName, pathId, environment, criticality }: {
  systemName: string
  pathId?: string | null
  environment?: string | null
  criticality?: string | null
}) {
  const [data, setData] = useState<BusinessImpactResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const query = pathId ? `?path_id=${encodeURIComponent(pathId)}` : ""
      const response = await fetch(`/api/proxy/business-impact/scenarios/${encodeURIComponent(systemName)}${query}`, { cache: "no-store" })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.detail || payload.error || "Could not calculate business impact")
      setData(payload)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not calculate business impact")
    } finally {
      setLoading(false)
    }
  }, [pathId, systemName])

  useEffect(() => { void load() }, [load, refreshKey])

  return (
    <section className="border-b border-slate-200 bg-slate-50 px-6 py-5" data-testid="business-impact-panel">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700"><ShieldCheck className="h-4 w-4 text-violet-700" />Business impact</div>
          <p className="mt-1 text-[11px] text-slate-500">Conditional impact and technical exposure are intentionally separate. No annual probability is claimed.</p>
        </div>
        <button type="button" onClick={() => setSettingsOpen(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"><Settings2 className="h-3.5 w-3.5" />Definitions</button>
      </div>

      {loading ? <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Calculating unique business scenarios…</div> : null}
      {error ? <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div> : null}
      {!loading && !error && data?.scenarios.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-600">No terminal business-impact scenario is compiled for this path. Privilege and execution capabilities may be enablers without a priced terminal consequence.</div> : null}
      {!loading && !error && data?.scenarios.length ? <div className="space-y-3">{data.scenarios.map((scenario) => <ExposureCard key={scenario.scenario_id} scenario={scenario} />)}</div> : null}

      <BusinessImpactSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        systems={[{ name: systemName, environment, criticality }]}
        initialSystem={systemName}
        onSaved={() => setRefreshKey((value) => value + 1)}
      />
    </section>
  )
}
