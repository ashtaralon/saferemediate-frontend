"use client"

/**
 * BlastRadiusMap — the composed full-width "Business System · Blast Radius Map"
 * view: KPI strip + killer path, the tiered trust-zone spine (external → public
 * → private → data), and the Shared Dependency Plane + ranked cuts — ALL from the
 * one real `/api/business-system/{system}/blast-radius` view-model.
 *
 * Composes the existing KpiStrip + PlaneCuts (they self-fetch on the shared SWR
 * cache key, so this is one network call) and adds the zones spine. Additive: a
 * new view, so it can't regress the working 3-column attacker shell — final
 * placement as a view mode + full-bleed layout tuning happens on the preview.
 */

import { useCachedFetch } from "@/lib/use-cached-fetch"
import { BlastRadiusKpiStrip } from "./blast-radius-kpi-strip"
import { BlastRadiusPlaneCuts } from "./blast-radius-plane-cuts"

interface ZoneNode {
  id: string
  name?: string | null
  kind?: string | null
  exposure_state?: string | null
  risk?: number | null
  role?: string | null
  subnet_tier?: string | null
}
interface Zone {
  key: string
  label?: string | null
  nodes?: ZoneNode[] | null
}
interface ZonesPayload {
  zones: Zone[]
}

const ZONE_ORDER = ["external", "public_exposure", "private_app", "data"]
const KIND_LABEL: Record<string, string> = {
  InternetGateway: "IGW",
  LoadBalancer: "ALB",
  ApplicationLoadBalancer: "ALB",
  EC2Instance: "EC2",
  RDSInstance: "RDS",
  Lambda: "λ",
  IAMRole: "role",
}

function NodeCard({ n }: { n: ZoneNode }) {
  const exposed = !!n.exposure_state
  return (
    <div
      className={`rounded-lg border px-3 py-2 min-w-[9rem] bg-slate-900/70 ${
        exposed ? "border-red-500/50" : "border-slate-700"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {exposed ? <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" aria-hidden /> : null}
        <span className="text-sm font-medium text-slate-100 truncate">{n.name ?? n.id}</span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-slate-400">
        {n.kind ? <span>{KIND_LABEL[n.kind] ?? n.kind}</span> : null}
        {n.exposure_state ? <span className="text-red-300 uppercase tracking-wide">{n.exposure_state}</span> : null}
        {typeof n.risk === "number" ? <span>risk {n.risk}</span> : null}
      </div>
      {n.role ? <div className="mt-0.5 text-[10px] text-slate-500 truncate">role: {n.role}</div> : null}
    </div>
  )
}

function ZonesSpine({ zones }: { zones: Zone[] }) {
  const byKey = new Map(zones.map((z) => [z.key, z]))
  const ordered = [
    ...ZONE_ORDER.map((k) => byKey.get(k)).filter(Boolean),
    ...zones.filter((z) => !ZONE_ORDER.includes(z.key)),
  ] as Zone[]
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 flex flex-col gap-3">
      {ordered.map((z) => (
        <div key={z.key} className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {z.label ?? z.key}
          </span>
          <div className="flex flex-wrap gap-2">
            {(z.nodes ?? []).length > 0 ? (
              (z.nodes ?? []).map((n) => <NodeCard key={n.id} n={n} />)
            ) : (
              <span className="text-[11px] text-slate-600">—</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export function BlastRadiusMap({ systemName }: { systemName: string }) {
  const url = systemName
    ? `/api/proxy/business-system/${encodeURIComponent(systemName)}/blast-radius`
    : null
  const { data } = useCachedFetch<ZonesPayload>(url, { cacheKey: `blast-radius:${systemName}` })
  const zones = data?.zones ?? []

  if (!systemName) return null

  return (
    <div className="flex flex-col gap-4 p-3">
      <BlastRadiusKpiStrip systemName={systemName} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
        {zones.length > 0 ? <ZonesSpine zones={zones} /> : <div />}
        <BlastRadiusPlaneCuts systemName={systemName} />
      </div>
    </div>
  )
}
