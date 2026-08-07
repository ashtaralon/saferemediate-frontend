"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Settings2 } from "lucide-react"
import { formatImpactMoney, type BusinessImpactResponse, type BusinessImpactScenario, type SystemRegulatoryExposureSummary } from "@/lib/business-impact"
import { BusinessImpactSettings } from "./business-impact-settings"

type SystemOption = { name: string; environment?: string | null; criticality?: string | null }

function regulatoryValue(item: BusinessImpactScenario["regulatory_exposure"][number]): string {
  if (item.amount != null && item.currency) return formatImpactMoney(item.amount, item.currency)
  if (item.low != null && item.high != null && item.currency) return `${formatImpactMoney(item.low, item.currency)}–${formatImpactMoney(item.high, item.currency)}`
  return item.formula || "Context only"
}

function SystemExposureRow({ summary, onConfigure }: {
  summary: SystemRegulatoryExposureSummary
  onConfigure: (systemName: string) => void
}) {
  const statusLabel = {
    CALCULATED: "Calculated",
    INPUT_REQUIRED: "Inputs required",
    NO_RULES_SELECTED: "Obligations not defined",
    NO_MATCHING_SCENARIOS: "No matching impact scenario",
  }[summary.status]
  return (
    <div className="grid gap-3 border-t border-slate-200 px-3 py-3 first:border-t-0 lg:grid-cols-[1fr_2fr_auto]">
      <div>
        <div className="text-xs font-semibold text-slate-900">{summary.business_service || summary.system_name}</div>
        {summary.business_service ? <div className="mt-0.5 text-[9px] text-slate-400">{summary.system_name}</div> : null}
        <div className="mt-1 text-[9px] uppercase tracking-wide text-slate-500">{statusLabel} · {summary.scenario_count} scenario{summary.scenario_count === 1 ? "" : "s"}</div>
      </div>
      <div>
        {summary.exposures.length ? <div className="space-y-1.5">{summary.exposures.map((item, index) => <div key={`${item.regime}-${item.exposure_type}-${index}`} className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5"><div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-[10px] font-semibold text-slate-700">{item.regime} · {item.exposure_type}</span><span className="text-[11px] font-semibold text-slate-900">{regulatoryValue(item)}</span></div><div className="mt-0.5 flex flex-wrap items-center gap-2 text-[9px] text-slate-400"><span>{(item.applicability || "POTENTIAL").replace(/_/g, " ")}</span><span>·</span><span>{(item.calculation_status || "CONTEXT_ONLY").replace(/_/g, " ")}</span><a href={item.source_url} target="_blank" rel="noreferrer" className="font-semibold text-violet-700 underline">Source</a></div></div>)}</div> : <div className="text-[10px] text-slate-500">{summary.obligations_selected.length ? "Selected obligations do not yet have a matching calculated exposure." : "Select the obligations that apply to this system."}</div>}
        {summary.missing_inputs.length ? <div className="mt-1.5 text-[9px] text-amber-700">Required: {summary.missing_inputs.map((item) => item.replace(/_/g, " ")).join(", ")}</div> : null}
      </div>
      <button type="button" onClick={() => onConfigure(summary.system_name)} className="cyntro-no-print h-fit rounded-md border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50">Define</button>
    </div>
  )
}

function ScenarioRow({ scenario }: { scenario: BusinessImpactScenario }) {
  const [open, setOpen] = useState(false)
  const loss = scenario.conditional_loss
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="grid gap-4 p-4 sm:grid-cols-[1.25fr_1fr]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-violet-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-700">{scenario.title}</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-600">{scenario.confidence} confidence</span>
          </div>
          <div className="mt-2 font-semibold text-slate-950">{scenario.business_service || scenario.system_name}</div>
          <p className="mt-1 text-xs leading-5 text-slate-600">{scenario.business_effect}</p>
          <div className="mt-2 text-[10px] text-slate-400">{scenario.crown_jewel_name || scenario.crown_jewel_id} · {scenario.path_count} enabling path{scenario.path_count === 1 ? "" : "s"}</div>
        </div>
        <div className="border-l border-slate-200 pl-4">
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">If this scenario occurs</div>
          {loss ? <><div className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{formatImpactMoney(loss.p50, loss.currency)}</div><div className="mt-1 text-[10px] text-slate-500">P10 {formatImpactMoney(loss.p10, loss.currency)} · P90 {formatImpactMoney(loss.p90, loss.currency)}</div></> : <div className="mt-2 text-xs font-medium text-amber-800">Financial definitions required</div>}
          <div className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-500"><b className="text-slate-700">Technical exposure:</b> {scenario.technical_exposure.replace(/_/g, " ")}</div>
        </div>
      </div>
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2 text-left text-[10px] font-semibold text-slate-600">{open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}Assumptions and obligations</button>
      {open ? <div className="grid gap-4 border-t border-slate-200 p-4 text-[10px] leading-4 text-slate-600 sm:grid-cols-3"><div><b className="text-slate-800">Assumptions</b><ul className="mt-1 space-y-1">{scenario.assumptions.map((item) => <li key={item}>• {item}</li>)}</ul>{scenario.missing_inputs.length ? <div className="mt-2 text-amber-800"><b>Missing:</b> {scenario.missing_inputs.map((item) => item.replace(/_/g, " ")).join(", ")}</div> : null}</div><div><b className="text-slate-800">Regulatory and contractual exposure</b>{scenario.regulatory_exposure.length ? <ul className="mt-1 space-y-2">{scenario.regulatory_exposure.map((item, index) => { const missingInputs = item.missing_inputs || []; return <li key={`${item.regime}-${index}`} className="rounded border border-slate-200 p-2"><div><b>{item.regime}</b> — {item.exposure_type}</div><div className="mt-0.5 font-semibold text-slate-800">{regulatoryValue(item)}</div><div className="mt-0.5 text-[9px] uppercase text-slate-400">{(item.applicability || "POTENTIAL").replace(/_/g, " ")} · {(item.calculation_status || "CONTEXT_ONLY").replace(/_/g, " ")}</div>{missingInputs.length ? <div className="text-amber-700">Required: {missingInputs.map((value) => value.replace(/_/g, " ")).join(", ")}</div> : null}<a href={item.source_url} target="_blank" rel="noreferrer" className="font-semibold text-violet-700 underline">Primary source</a></li> })}</ul> : <p className="mt-1">No rule data selected.</p>}</div><div><b className="text-slate-800">Comparable public outcomes</b>{scenario.comparable_incidents.length ? <ul className="mt-1 space-y-2">{scenario.comparable_incidents.map((incident) => <li key={incident.incident_id}>• <b>{incident.title}</b> — {incident.financial_outcome} <a href={incident.source_url} target="_blank" rel="noreferrer" className="font-semibold text-violet-700 underline">Source</a></li>)}</ul> : <p className="mt-1">No high-provenance comparable matched.</p>}<p className="mt-2 text-slate-400">Context only; never an automatic multiplier.</p></div></div> : null}
    </div>
  )
}

export function BusinessImpactReportSection({ systems }: { systems: SystemOption[] }) {
  const [data, setData] = useState<BusinessImpactResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSystem, setSettingsSystem] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const systemQuery = useMemo(
    () => systems.map((system) => system.name).join(","),
    [systems],
  )

  const load = useCallback(async () => {
    if (!systemQuery) { setLoading(false); setData(null); return }
    setLoading(true)
    setError(null)
    try {
      const query = encodeURIComponent(systemQuery)
      const response = await fetch(`/api/proxy/business-impact/portfolio?systems=${query}`, { cache: "no-store" })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.detail || payload.error || "Business impact insights unavailable")
      setData(payload)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Business impact insights unavailable")
    } finally {
      setLoading(false)
    }
  }, [systemQuery])

  useEffect(() => { void load() }, [load, refreshKey])

  return (
    <section id="report-business-impact">
      <div className="mb-4 flex items-end justify-between gap-6 border-b border-slate-200 pb-3">
        <div><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-700">04 · Conditional business impact</div><h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-slate-950">Plausible loss scenarios</h2></div>
        <button type="button" onClick={() => { setSettingsSystem(null); setSettingsOpen(true) }} className="cyntro-no-print inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Settings2 className="h-3.5 w-3.5" />Edit definitions</button>
      </div>
      <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 p-3 text-[11px] leading-5 text-violet-950"><b>How to read this section:</b> monetary ranges are conditional on each scenario occurring. Technical exposure is shown separately and is not used as an annual probability. Regulatory ceilings are not included in modeled loss.</div>
      {loading ? <div className="flex items-center gap-2 rounded-lg border border-slate-200 p-5 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Compiling unique business scenarios…</div> : null}
      {error ? <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div> : null}
      {!loading && !error && data ? <><div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-lg bg-slate-50 p-3"><div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Unique scenarios</div><div className="mt-1 text-xl font-semibold text-slate-950">{data.scenarios.length}</div></div><div className="rounded-lg bg-slate-50 p-3"><div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Paths collapsed</div><div className="mt-1 text-xl font-semibold text-slate-950">{data.paths_collapsed}</div></div><div className="rounded-lg bg-slate-50 p-3"><div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Loss ranges calculated</div><div className="mt-1 text-xl font-semibold text-slate-950">{data.scenarios_with_estimates}/{data.scenarios.length}</div></div><div className="rounded-lg bg-slate-50 p-3"><div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Rule exposures calculated</div><div className="mt-1 text-xl font-semibold text-slate-950">{data.regulatory_exposures_calculated ?? 0}/{data.regulatory_exposures_mapped ?? 0}</div></div></div>{(data.top_missing_inputs ?? []).length ? <div className="mb-4 flex items-start justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900"><div><b>Definitions needed:</b> {(data.top_missing_inputs ?? []).map((item) => item.replace(/_/g, " ")).join(", ")}</div><button type="button" onClick={() => { setSettingsSystem(null); setSettingsOpen(true) }} className="cyntro-no-print shrink-0 font-semibold underline">Add definitions</button></div> : null}<div className="mb-5 overflow-hidden rounded-lg border border-slate-200"><div className="bg-slate-50 px-3 py-2"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Potential regulatory exposure by system</div><div className="mt-0.5 text-[9px] text-slate-400">Repeated scenario exposures are collapsed. Amounts are sourced statutory exposure—not predicted penalties and not part of conditional loss.</div></div>{(data.system_regulatory_summaries ?? []).length ? data.system_regulatory_summaries.map((summary) => <SystemExposureRow key={summary.system_name} summary={summary} onConfigure={(systemName) => { setSettingsSystem(systemName); setSettingsOpen(true) }} />) : <div className="p-3 text-[10px] text-slate-500">Per-system regulatory definitions are not available in this reading.</div>}</div>{data.scenarios.length ? <div className="space-y-3">{data.scenarios.slice(0, 8).map((scenario) => <ScenarioRow key={scenario.scenario_id} scenario={scenario} />)}</div> : <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600">No terminal business-impact scenario is available for the selected systems.</div>}</> : null}
      <BusinessImpactSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} systems={systems} initialSystem={settingsSystem} onSaved={() => setRefreshKey((value) => value + 1)} />
    </section>
  )
}
