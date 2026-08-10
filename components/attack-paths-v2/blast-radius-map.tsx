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
const ZONE_PREVIEW_LIMIT = 6
const KIND_LABEL: Record<string, string> = {
  InternetGateway: "IGW",
  LoadBalancer: "ALB",
  ApplicationLoadBalancer: "ALB",
  EC2Instance: "EC2",
  RDSInstance: "RDS",
  Lambda: "λ",
  IAMRole: "role",
}

function NodeCard({ n, similarCount = 1 }: { n: ZoneNode; similarCount?: number }) {
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
        {similarCount > 1 ? <span>{similarCount} similar resources</span> : null}
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
      {ordered.map((z) => {
        const nodes = [...(z.nodes ?? [])].sort((a, b) => {
          if (!!a.exposure_state !== !!b.exposure_state) return a.exposure_state ? -1 : 1
          return (b.risk ?? -1) - (a.risk ?? -1)
        })
        const signature = (node: ZoneNode) => `${node.kind ?? ""}|${node.name ?? node.id}`
        const signatureCounts = new Map<string, number>()
        nodes.forEach((node) => {
          const key = signature(node)
          signatureCounts.set(key, (signatureCounts.get(key) ?? 0) + 1)
        })
        const seen = new Set<string>()
        const representatives = nodes.filter((node) => {
          const key = signature(node)
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        const visible = representatives.slice(0, ZONE_PREVIEW_LIMIT)
        const visibleIds = new Set(visible.map((node) => node.id))
        const hidden = nodes.filter((node) => !visibleIds.has(node.id))

        return (
          <section key={z.key} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {z.label ?? z.key}
              </span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                {nodes.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {visible.length > 0 ? (
                visible.map((n) => (
                  <NodeCard key={n.id} n={n} similarCount={signatureCounts.get(signature(n))} />
                ))
              ) : (
                <span className="text-[11px] text-muted-foreground">No resources</span>
              )}
            </div>
            {hidden.length > 0 ? (
              <details className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                  View {hidden.length} more resources
                </summary>
                <div className="mt-2 flex flex-wrap gap-2">
                  {hidden.map((n) => <NodeCard key={n.id} n={n} />)}
                </div>
              </details>
            ) : null}
          </section>
        )
      })}
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
