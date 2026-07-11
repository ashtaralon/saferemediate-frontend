"use client"

/**
 * BlastRadiusMap — Zoom −1 composition: KPI strip + zone spine + plane/cuts.
 * Light theme — readable inside the Attack Paths shell.
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
      className={`rounded-lg border px-3 py-2 min-w-[9rem] bg-background ${
        exposed ? "border-red-500/45 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.08)]" : "border-border"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {exposed ? (
          <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" aria-hidden />
        ) : null}
        <span className="text-sm font-medium text-foreground truncate">{n.name ?? n.id}</span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-muted-foreground">
        {n.kind ? <span>{KIND_LABEL[n.kind] ?? n.kind}</span> : null}
        {n.exposure_state ? (
          <span className="text-red-700 dark:text-red-400 uppercase tracking-wide font-semibold">
            {n.exposure_state}
          </span>
        ) : null}
        {typeof n.risk === "number" ? <span>risk {n.risk}</span> : null}
      </div>
      {n.role ? (
        <div className="mt-0.5 text-[10px] text-muted-foreground truncate">role: {n.role}</div>
      ) : null}
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
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-4 shadow-sm">
      {ordered.map((z) => (
        <div key={z.key} className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {z.label ?? z.key}
          </span>
          <div className="flex flex-wrap gap-2">
            {(z.nodes ?? []).length > 0 ? (
              (z.nodes ?? []).map((n) => <NodeCard key={n.id} n={n} />)
            ) : (
              <span className="text-[11px] text-muted-foreground">—</span>
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
    <div className="flex flex-col gap-4 p-4 sm:p-5 bg-background">
      <BlastRadiusKpiStrip systemName={systemName} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
        {zones.length > 0 ? <ZonesSpine zones={zones} /> : <div />}
        <BlastRadiusPlaneCuts systemName={systemName} />
      </div>
    </div>
  )
}
