"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Building2, Check, Database, Loader2, Save, X } from "lucide-react"
import {
  emptyOrganizationImpactProfile,
  emptySystemImpactProfile,
  type MoneyRange,
  type OrganizationImpactProfile,
  type SystemImpactProfile,
} from "@/lib/business-impact"

type SystemOption = {
  name: string
  environment?: string | null
  criticality?: string | null
}

const REGULATIONS = ["GDPR", "HIPAA", "CCPA/CPRA", "PCI DSS", "SOX", "NIS2"]
const DATA_CATEGORIES = [
  "Customer personal data",
  "Health information",
  "Payment-card data",
  "Credentials and secrets",
  "Financial records",
  "Intellectual property",
  "Operational data",
]

function list(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean)
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function TextInput({ label, value, onChange, placeholder, type = "text" }: {
  label: string
  value: string | number | null | undefined
  onChange: (value: string) => void
  placeholder?: string
  type?: "text" | "number"
}) {
  return (
    <label className="block text-xs font-semibold text-slate-700">
      {label}
      <input
        type={type}
        min={type === "number" ? 0 : undefined}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
      />
    </label>
  )
}

function RangeInput({ label, value, onChange, unit }: {
  label: string
  value?: MoneyRange | null
  onChange: (value: MoneyRange | null) => void
  unit?: string
}) {
  const update = (key: keyof MoneyRange, raw: string) => {
    if (!raw.trim() && !value) return
    const next = { low: value?.low ?? 0, likely: value?.likely ?? 0, high: value?.high ?? 0 }
    next[key] = numberOrNull(raw) ?? 0
    onChange(next)
  }
  return (
    <fieldset className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <legend className="px-1 text-xs font-semibold text-slate-700">{label}{unit ? ` · ${unit}` : ""}</legend>
      <div className="grid grid-cols-3 gap-2">
        {(["low", "likely", "high"] as const).map((key) => (
          <label key={key} className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {key === "likely" ? "Central" : key}
            <input
              type="number"
              min={0}
              value={value?.[key] ?? ""}
              onChange={(event) => update(key, event.target.value)}
              className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs font-normal text-slate-900"
            />
          </label>
        ))}
      </div>
      {value ? (
        <button type="button" onClick={() => onChange(null)} className="mt-2 text-[10px] text-slate-500 underline">
          Clear range
        </button>
      ) : null}
    </fieldset>
  )
}

function TogglePills({ options, selected, onChange }: {
  options: string[]
  selected: string[]
  onChange: (value: string[]) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = selected.includes(option)
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(active ? selected.filter((item) => item !== option) : [...selected, option])}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600"}`}
          >
            {active ? <Check className="mr-1 inline h-3 w-3" /> : null}{option}
          </button>
        )
      })}
    </div>
  )
}

export function BusinessImpactSettings({ open, onClose, systems, initialSystem, onSaved }: {
  open: boolean
  onClose: () => void
  systems: SystemOption[]
  initialSystem?: string | null
  onSaved?: () => void
}) {
  const defaultSystem = initialSystem || systems[0]?.name || ""
  const [tab, setTab] = useState<"organization" | "system">(systems.length ? "system" : "organization")
  const [selectedSystem, setSelectedSystem] = useState(defaultSystem)
  const [organization, setOrganization] = useState<OrganizationImpactProfile>(emptyOrganizationImpactProfile())
  const [profile, setProfile] = useState<SystemImpactProfile>(emptySystemImpactProfile(defaultSystem))
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (systemName: string) => {
    setLoading(true)
    setError(null)
    try {
      const orgResponse = await fetch("/api/proxy/business-impact/organization", { cache: "no-store" })
      const systemResponse = systemName
        ? await fetch(`/api/proxy/business-impact/profiles/${encodeURIComponent(systemName)}`, { cache: "no-store" })
        : null
      if (!orgResponse.ok || (systemResponse && !systemResponse.ok)) throw new Error("Could not load business impact definitions")
      const orgJson = await orgResponse.json()
      setOrganization(orgJson.profile ?? emptyOrganizationImpactProfile())
      if (systemResponse) {
        const systemJson = await systemResponse.json()
        const systemMeta = systems.find((system) => system.name === systemName)
        setProfile({
          ...emptySystemImpactProfile(systemName),
          ...(systemJson.profile ?? {}),
          system_name: systemName,
          environment: systemJson.profile?.environment || systemMeta?.environment || null,
          business_criticality: systemJson.profile?.business_criticality || systemMeta?.criticality || null,
        })
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load definitions")
    } finally {
      setLoading(false)
    }
  }, [systems])

  useEffect(() => {
    if (!open) return
    const next = initialSystem || selectedSystem || systems[0]?.name || ""
    setSelectedSystem(next)
    if (!next) setTab("organization")
    void load(next)
  }, [open, initialSystem]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const rangeValues = [profile.response_cost, profile.restoration_cost, profile.legal_advisory_cost, profile.notification_cost_per_person, profile.contractual_loss, profile.customer_reputation_loss, profile.fraud_or_theft_loss, profile.extortion_payment, profile.outage_hours]
      if (rangeValues.some((range) => range && !(range.low <= range.likely && range.likely <= range.high))) {
        throw new Error("Each range must be ordered from lower to central to severe.")
      }
      const requests = [fetch("/api/proxy/business-impact/organization", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(organization),
        })]
      if (selectedSystem) requests.push(fetch(`/api/proxy/business-impact/profiles/${encodeURIComponent(selectedSystem)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...profile, system_name: selectedSystem }),
        }))
      const responses = await Promise.all(requests)
      if (responses.some((response) => !response.ok)) {
        const problem = await responses.find((response) => !response.ok)?.json().catch(() => null)
        throw new Error(problem?.detail || problem?.error || "Could not save definitions")
      }
      setMessage(selectedSystem ? "Definitions saved. Insights have been recalculated." : "Organization definitions saved.")
      onSaved?.()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save definitions")
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-label="Business impact definitions">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Business impact definitions</h2>
            <p className="mt-0.5 text-xs text-slate-500">Define the facts and planning ranges Cyntro may use. Missing values remain missing.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </header>

        <div className="flex border-b border-slate-200 px-6">
          <button type="button" onClick={() => setTab("organization")} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${tab === "organization" ? "border-violet-600 text-violet-800" : "border-transparent text-slate-500"}`}><Building2 className="h-4 w-4" />Organization</button>
          <button type="button" onClick={() => setTab("system")} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${tab === "system" ? "border-violet-600 text-violet-800" : "border-transparent text-slate-500"}`}><Database className="h-4 w-4" />System &amp; loss assumptions</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {loading ? <div className="grid h-56 place-items-center text-sm text-slate-500"><span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading definitions…</span></div> : null}
          {!loading && tab === "organization" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <TextInput label="Organization name" value={organization.organization_name} onChange={(value) => setOrganization({ ...organization, organization_name: value })} />
              <TextInput label="Industry" value={organization.industry} onChange={(value) => setOrganization({ ...organization, industry: value })} placeholder="Healthcare, financial services, technology…" />
              <TextInput label="Headquarters country" value={organization.headquarters_country} onChange={(value) => setOrganization({ ...organization, headquarters_country: value })} />
              <TextInput label="Operating countries" value={organization.operating_countries.join(", ")} onChange={(value) => setOrganization({ ...organization, operating_countries: list(value) })} placeholder="United States, Germany, Israel" />
              <TextInput label="Organization type" value={organization.organization_type} onChange={(value) => setOrganization({ ...organization, organization_type: value })} placeholder="Public company, private company, public sector…" />
              <label className="block text-xs font-semibold text-slate-700">Reporting currency<select value={organization.currency} onChange={(event) => setOrganization({ ...organization, currency: event.target.value as OrganizationImpactProfile["currency"] })} className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900">{["USD", "EUR", "GBP", "ILS", "CAD", "AUD", "JPY", "OTHER"].map((currency) => <option key={currency}>{currency}</option>)}</select></label>
              <TextInput label={`Annual revenue · ${organization.currency}`} type="number" value={organization.annual_revenue} onChange={(value) => setOrganization({ ...organization, annual_revenue: numberOrNull(value) })} />
              <TextInput label="Worldwide annual turnover · EUR" type="number" value={organization.annual_revenue_eur} onChange={(value) => setOrganization({ ...organization, annual_revenue_eur: numberOrNull(value) })} placeholder="Used only for GDPR statutory ceilings" />
              <TextInput label="Employees" type="number" value={organization.employee_count} onChange={(value) => setOrganization({ ...organization, employee_count: numberOrNull(value) })} />
            </div>
          ) : null}

          {!loading && tab === "system" ? (
            <div className="space-y-7">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="block text-xs font-semibold text-slate-700">System<select value={selectedSystem} onChange={(event) => { setSelectedSystem(event.target.value); void load(event.target.value) }} className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900">{systems.map((system) => <option key={system.name} value={system.name}>{system.name}</option>)}</select></label>
                <TextInput label="Business service" value={profile.business_service} onChange={(value) => setProfile({ ...profile, business_service: value })} placeholder="Payments, customer identity, patient care…" />
                <TextInput label="Owner" value={profile.owner} onChange={(value) => setProfile({ ...profile, owner: value })} />
                <TextInput label="Environment" value={profile.environment} onChange={(value) => setProfile({ ...profile, environment: value })} />
                <TextInput label="Business criticality" value={profile.business_criticality} onChange={(value) => setProfile({ ...profile, business_criticality: value })} />
                <TextInput label="Jurisdictions" value={profile.jurisdictions.join(", ")} onChange={(value) => setProfile({ ...profile, jurisdictions: list(value) })} placeholder="EU, US-CA, US-NY" />
              </div>

              <section>
                <h3 className="text-sm font-semibold text-slate-900">Applicable obligations</h3>
                <p className="mb-3 mt-1 text-xs text-slate-500">Selection identifies potentially relevant rule packs. Legal applicability still requires confirmation.</p>
                <TogglePills options={REGULATIONS} selected={profile.regulations} onChange={(regulations) => setProfile({ ...profile, regulations })} />
              </section>

              <section>
                <h3 className="text-sm font-semibold text-slate-900">Data and affected population</h3>
                <div className="mt-3"><TogglePills options={DATA_CATEGORIES} selected={profile.data_categories} onChange={(data_categories) => setProfile({ ...profile, data_categories })} /></div>
                <div className="mt-4 grid gap-4 md:grid-cols-4">
                  <TextInput label="Records" type="number" value={profile.record_count} onChange={(value) => setProfile({ ...profile, record_count: numberOrNull(value) })} />
                  <TextInput label="Affected people" type="number" value={profile.affected_people} onChange={(value) => setProfile({ ...profile, affected_people: numberOrNull(value) })} />
                  <label className="block text-xs font-semibold text-slate-700">Record-count source<select value={profile.record_count_source} onChange={(event) => setProfile({ ...profile, record_count_source: event.target.value as SystemImpactProfile["record_count_source"] })} className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900"><option value="CUSTOMER_DECLARED">Customer declared</option><option value="COLLECTED_PROXY">Collected proxy</option><option value="CLASS_DEFAULT">Class default</option><option value="UNKNOWN">Unknown</option></select></label>
                  <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700"><input type="checkbox" checked={profile.ccpa_private_action_eligible} onChange={(event) => setProfile({ ...profile, ccpa_private_action_eligible: event.target.checked })} className="h-4 w-4 accent-violet-600" />CCPA private-action conditions confirmed</label>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-slate-900">Conditional-loss assumptions · {organization.currency}</h3>
                <p className="mb-4 mt-1 text-xs text-slate-500">These are customer-owned planning ranges. Cyntro does not replace blanks with industry averages.</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <RangeInput label="Incident response & forensics" value={profile.response_cost} onChange={(response_cost) => setProfile({ ...profile, response_cost })} />
                  <RangeInput label="System and data restoration" value={profile.restoration_cost} onChange={(restoration_cost) => setProfile({ ...profile, restoration_cost })} />
                  <RangeInput label="Legal and advisory" value={profile.legal_advisory_cost} onChange={(legal_advisory_cost) => setProfile({ ...profile, legal_advisory_cost })} />
                  <RangeInput label="Notification and support" unit="per affected person" value={profile.notification_cost_per_person} onChange={(notification_cost_per_person) => setProfile({ ...profile, notification_cost_per_person })} />
                  <RangeInput label="Contractual / SLA loss" value={profile.contractual_loss} onChange={(contractual_loss) => setProfile({ ...profile, contractual_loss })} />
                  <RangeInput label="Customer and reputation loss" value={profile.customer_reputation_loss} onChange={(customer_reputation_loss) => setProfile({ ...profile, customer_reputation_loss })} />
                  <RangeInput label="Fraud or theft" value={profile.fraud_or_theft_loss} onChange={(fraud_or_theft_loss) => setProfile({ ...profile, fraud_or_theft_loss })} />
                  <RangeInput label="Extortion payment" value={profile.extortion_payment} onChange={(extortion_payment) => setProfile({ ...profile, extortion_payment })} />
                  <RangeInput label="Outage duration" unit="hours" value={profile.outage_hours} onChange={(outage_hours) => setProfile({ ...profile, outage_hours })} />
                  <TextInput label={`Revenue / operational value per hour · ${organization.currency}`} type="number" value={profile.revenue_per_hour} onChange={(value) => setProfile({ ...profile, revenue_per_hour: numberOrNull(value) })} />
                </div>
              </section>
            </div>
          ) : null}

          {error ? <div className="mt-5 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div> : null}
          {message ? <div className="mt-5 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"><Check className="h-4 w-4 shrink-0" />{message}</div> : null}
        </div>

        <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <p className="max-w-2xl text-[11px] leading-4 text-slate-500">Regulatory ceilings are shown separately from modeled loss and are never treated as predicted penalties. Technical exposure is never multiplied by these amounts.</p>
          <button type="button" onClick={() => void save()} disabled={saving || loading || (tab === "system" && !selectedSystem)} className="inline-flex items-center gap-2 rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? "Saving…" : "Save definitions"}</button>
        </footer>
      </div>
    </div>
  )
}
