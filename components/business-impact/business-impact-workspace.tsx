"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, BarChart3, Building2, Loader2, RefreshCw, Settings2, ShieldCheck } from "lucide-react"
import { BusinessImpactPanel } from "./business-impact-panel"
import { BusinessImpactSettings } from "./business-impact-settings"
import type { BusinessImpactResponse, SystemRegulatoryExposureSummary } from "@/lib/business-impact"
import { useScopedSystemCatalog } from "@/lib/scoped-system-catalog"

type SystemOption = {
  name: string
  environment?: string | null
  criticality?: string | null
}

type RawSystem = {
  SystemName?: unknown
  name?: unknown
  environment?: unknown
  criticality?: unknown
  business_criticality?: unknown
}

function normalizeSystems(payload: unknown): SystemOption[] {
  const raw = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { systems?: unknown }).systems)
      ? (payload as { systems: RawSystem[] }).systems
      : []

  const byName = new Map<string, SystemOption>()
  for (const item of raw as RawSystem[]) {
    const candidate = typeof item.SystemName === "string" ? item.SystemName : typeof item.name === "string" ? item.name : ""
    const name = candidate.trim()
    if (!name) continue
    const environment = typeof item.environment === "string" && item.environment.trim() ? item.environment.trim() : null
    const rawCriticality = typeof item.business_criticality === "string" ? item.business_criticality : item.criticality
    const criticality = typeof rawCriticality === "string" && rawCriticality.trim() ? rawCriticality.trim() : null
    const existing = byName.get(name)
    byName.set(name, {
      name,
      environment: existing?.environment || environment,
      criticality: existing?.criticality || criticality,
    })
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function readable(value: string): string {
  return value.replace(/_/g, " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase())
}

function identityKey(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function metadataOptions(values: Array<string | null | undefined>, formatLabel = false): Array<{ key: string; label: string }> {
  const options = new Map<string, string>()
  for (const value of values) {
    if (!value?.trim()) continue
    const key = identityKey(value)
    if (!options.has(key)) options.set(key, formatLabel ? readable(value) : value.trim())
  }
  return Array.from(options, ([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label))
}

function summaryStatus(summary?: SystemRegulatoryExposureSummary): { label: string; tone: string } {
  if (!summary) return { label: "Not reported", tone: "bg-slate-100 text-slate-600" }
  if (summary.status === "CALCULATED") return { label: "Calculated", tone: "bg-emerald-50 text-emerald-700" }
  if (summary.status === "NO_RULES_SELECTED") return { label: "Obligations required", tone: "bg-amber-50 text-amber-800" }
  if (summary.status === "NO_MATCHING_SCENARIOS") return { label: "No matching scenarios", tone: "bg-slate-100 text-slate-600" }
  return { label: "Inputs required", tone: "bg-amber-50 text-amber-800" }
}

export function BusinessImpactWorkspace({ initialSystem }: { initialSystem?: string | null }) {
  const systemsCatalog = useScopedSystemCatalog()
  const [systems, setSystems] = useState<SystemOption[]>([])
  const [portfolio, setPortfolio] = useState<BusinessImpactResponse | null>(null)
  const [selectedSystem, setSelectedSystem] = useState(initialSystem || "")
  const [environment, setEnvironment] = useState<string | null>(null)
  const [criticality, setCriticality] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSystem, setSettingsSystem] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const load = useCallback(async () => {
    if (!systemsCatalog.ready) return
    if (!systemsCatalog.url) {
      setSystems([])
      setPortfolio(null)
      setSelectedSystem("")
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const systemsResponse = await fetch(systemsCatalog.url, { cache: "no-store" })
      const systemsPayload = await systemsResponse.json()
      if (!systemsResponse.ok) throw new Error(systemsPayload.detail || systemsPayload.error || "Could not load systems")
      const nextSystems = normalizeSystems(systemsPayload)
      setSystems(nextSystems)
      setSelectedSystem((current) => {
        if (current && nextSystems.some((system) => system.name === current)) return current
        return nextSystems[0]?.name || ""
      })

      if (!nextSystems.length) {
        setPortfolio(null)
        return
      }
      const names = nextSystems.map((system) => system.name).join(",")
      const portfolioResponse = await fetch(`/api/proxy/business-impact/portfolio?systems=${encodeURIComponent(names)}`, { cache: "no-store" })
      const portfolioPayload = await portfolioResponse.json()
      if (!portfolioResponse.ok) throw new Error(portfolioPayload.detail || portfolioPayload.error || "Could not calculate business impact")
      setPortfolio(portfolioPayload)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load business impact")
    } finally {
      setLoading(false)
    }
  }, [refreshKey, systemsCatalog.ready, systemsCatalog.url])

  useEffect(() => { void load() }, [load])

  const environments = useMemo(() => metadataOptions(systems.map((system) => system.environment), true), [systems])
  const criticalities = useMemo(() => metadataOptions(systems.map((system) => system.criticality)), [systems])
  const filteredSystems = useMemo(() => systems.filter((system) => (!environment || (system.environment && identityKey(system.environment) === environment)) && (!criticality || (system.criticality && identityKey(system.criticality) === criticality))), [systems, environment, criticality])
  const filteredNames = useMemo(() => new Set(filteredSystems.map((system) => identityKey(system.name))), [filteredSystems])
  const scenarios = useMemo(() => (portfolio?.scenarios ?? []).filter((scenario) => filteredNames.has(identityKey(scenario.system_name))), [portfolio, filteredNames])
  const summaries = useMemo(() => new Map((portfolio?.system_regulatory_summaries ?? []).map((summary) => [identityKey(summary.system_name), summary])), [portfolio])
  const pricedScenarios = scenarios.filter((scenario) => Boolean(scenario.conditional_loss)).length
  const uniquePaths = new Set(scenarios.flatMap((scenario) => scenario.path_ids)).size
  const systemsNeedingDefinitions = filteredSystems.filter((system) => summaries.get(identityKey(system.name))?.status !== "CALCULATED").length

  useEffect(() => {
    if (loading || !systems.length) return
    if (selectedSystem && !filteredNames.has(identityKey(selectedSystem))) setSelectedSystem(filteredSystems[0]?.name || "")
  }, [filteredNames, filteredSystems, loading, selectedSystem, systems.length])

  const openSettings = (systemName?: string | null) => {
    setSettingsSystem(systemName || null)
    setSettingsOpen(true)
  }

  return (
    <main className="mx-auto max-w-[1500px] space-y-6" data-testid="business-impact-workspace">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-violet-700"><BarChart3 className="h-4 w-4" />Business Impact</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">Translate attack paths into business consequences</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Review conditional loss, regulatory exposure, affected systems, and the definitions required to support each conclusion. Technical exposure remains separate from monetary impact.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4" />Refresh</button>
          <button type="button" onClick={() => openSettings(selectedSystem)} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"><Settings2 className="h-4 w-4" />Definitions</button>
        </div>
      </header>

      {loading ? <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600"><Loader2 className="h-5 w-5 animate-spin" />Compiling business-impact scenarios from observed paths…</div> : null}
      {error ? <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><div className="font-semibold">Business impact is unavailable</div><div className="mt-1">{error}</div></div></div> : null}

      {!loading && !error && !systems.length ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center"><Building2 className="mx-auto h-7 w-7 text-slate-400" /><div className="mt-3 font-semibold text-slate-800">No systems are available</div><p className="mt-1 text-sm text-slate-500">Business impact will appear after systems and attack-path evidence are collected.</p></div> : null}

      {!loading && !error && systems.length ? <>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Portfolio scope</h2>
              <p className="mt-1 text-xs text-slate-500">Filters use system metadata reported by Cyntro. Missing metadata is not inferred.</p>
            </div>
            <div className="flex flex-wrap gap-4">
              {environments.length ? <fieldset><legend className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Environment</legend><div className="flex flex-wrap gap-1.5"><button type="button" onClick={() => setEnvironment(null)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${!environment ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600"}`}>All</button>{environments.map((option) => <button key={option.key} type="button" onClick={() => setEnvironment(option.key)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${environment === option.key ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600"}`}>{option.label}</button>)}</div></fieldset> : null}
              {criticalities.length ? <fieldset><legend className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Business criticality</legend><div className="flex flex-wrap gap-1.5"><button type="button" onClick={() => setCriticality(null)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${!criticality ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600"}`}>All</button>{criticalities.map((option) => <button key={option.key} type="button" onClick={() => setCriticality(option.key)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${criticality === option.key ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600"}`}>{option.label}</button>)}</div></fieldset> : null}
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Systems in scope</div><div className="mt-2 text-2xl font-semibold text-slate-950">{filteredSystems.length}</div></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Unique scenarios</div><div className="mt-2 text-2xl font-semibold text-slate-950">{scenarios.length}</div></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Observed paths collapsed</div><div className="mt-2 text-2xl font-semibold text-slate-950">{uniquePaths}</div></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Loss ranges calculated</div><div className="mt-2 text-2xl font-semibold text-slate-950">{pricedScenarios}/{scenarios.length}</div></div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div><h2 className="text-sm font-semibold text-slate-900">Impact readiness by system</h2><p className="mt-1 text-xs text-slate-500">Select a system to inspect its scenarios. Monetary outcomes are never summed across potentially correlated scenarios.</p></div>
            {systemsNeedingDefinitions ? <div className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">{systemsNeedingDefinitions} need definitions</div> : <div className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Definitions complete</div>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3">System</th><th className="px-4 py-3">Environment</th><th className="px-4 py-3">Criticality</th><th className="px-4 py-3">Scenarios</th><th className="px-4 py-3">Conditional loss</th><th className="px-4 py-3">Regulatory exposure</th><th className="px-5 py-3 text-right">Action</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSystems.map((system) => {
                  const summary = summaries.get(identityKey(system.name))
                  const systemScenarios = scenarios.filter((scenario) => identityKey(scenario.system_name) === identityKey(system.name))
                  const calculated = systemScenarios.filter((scenario) => Boolean(scenario.conditional_loss)).length
                  const status = summaryStatus(summary)
                  return <tr key={system.name} className={selectedSystem === system.name ? "bg-violet-50/60" : "bg-white"}>
                    <td className="px-5 py-4 font-semibold text-slate-900">{system.name}</td>
                    <td className="px-4 py-4 text-slate-600">{system.environment || "—"}</td>
                    <td className="px-4 py-4 text-slate-600">{system.criticality || "—"}</td>
                    <td className="px-4 py-4 text-slate-700">{summary?.scenario_count ?? systemScenarios.length}</td>
                    <td className="px-4 py-4 text-slate-700">{calculated}/{systemScenarios.length} calculated</td>
                    <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${status.tone}`}>{status.label}</span>{summary?.missing_inputs.length ? <div className="mt-1.5 text-[10px] text-amber-700">Required: {summary.missing_inputs.map(readable).join(", ")}</div> : null}</td>
                    <td className="px-5 py-4 text-right"><div className="inline-flex gap-2"><button type="button" onClick={() => setSelectedSystem(system.name)} className="rounded-md border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">Review</button><button type="button" onClick={() => openSettings(system.name)} className="rounded-md border border-violet-200 px-2.5 py-1.5 font-semibold text-violet-700 hover:bg-violet-50">Define</button></div></td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
          {!filteredSystems.length ? <div className="border-t border-slate-200 p-6 text-center text-sm text-slate-500">No systems match the selected metadata filters.</div> : null}
        </section>

        {selectedSystem ? <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-6 py-4"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-violet-700"><ShieldCheck className="h-4 w-4" />Selected system</div><h2 className="mt-1 text-xl font-semibold text-slate-950">{selectedSystem}</h2></div><BusinessImpactPanel systemName={selectedSystem} environment={systems.find((system) => system.name === selectedSystem)?.environment} criticality={systems.find((system) => system.name === selectedSystem)?.criticality} /></section> : null}
      </> : null}

      <BusinessImpactSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} systems={systems} initialSystem={settingsSystem || selectedSystem} onSaved={() => setRefreshKey((value) => value + 1)} />
    </main>
  )
}
