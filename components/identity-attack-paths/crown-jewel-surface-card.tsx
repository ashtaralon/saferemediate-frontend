"use client"

import { useState } from "react"
import { Crown, Globe, Network, UserCircle, Skull, ShieldAlert, Wrench, Zap, Database, ChevronDown, ChevronRight } from "lucide-react"
import { useCachedFetch } from "@/lib/use-cached-fetch"

interface JewelSurfaceData {
  system_name: string
  jewel_id: string
  jewel?: {
    id?: string
    name?: string
    type?: string
    is_internet_exposed?: boolean
    data_classification?: string | null
    gap_count?: number
  }
  total_paths: number
  paths?: Array<any>
  aggregated_damage?: {
    state: string
    max_verbs?: { read: number; write: number; delete: number; admin: number }
    max_reachable_services?: Record<string, number>
    destructive_capable?: boolean
    roles?: Array<{ role_name?: string; destructive_capable?: boolean; verbs?: any }>
    summary?: string
  }
  cross_path_remediation?: Array<{
    node_name?: string
    node_type?: string
    action_type?: string
    action?: string
    plane?: "iam" | "network" | "data" | "other"
    breaks_path_count: number
    best_impact: number
  }>
  score_distribution?: { critical: number; high: number; medium: number; low: number }
  entry_summary?: {
    total: number
    public_ips: string[]
    private_ips: string[]
    principals: string[]
    aws_ips?: Array<{
      ip: string
      service: string  // e.g. "S3", "EC2", "CLOUDFRONT"
      region: string   // e.g. "us-east-1", "GLOBAL"
      network_border_group?: string
    }>
    // Enriched non-AWS public IPs — org/country/asn from ip_metadata.enrich_ip.
    // Empty fields when remote lookup unavailable.
    public_ips_enriched?: Array<{
      ip: string
      org?: string         // "Bezeq International", "Microsoft Azure", ...
      isp?: string
      asn?: string         // "AS21247 Bezeq International"
      country?: string     // "IL"
      country_name?: string  // "Israel"
      city?: string
    }>
  }
  error?: string
}

interface Props {
  systemName: string
  jewelId: string | null
}

export function CrownJewelSurfaceCard({ systemName, jewelId }: Props) {
  // Collapsible per CISO feedback: "the orange part takes 50% of the screen,
  // fix that". Collapsed renders only a 1-line summary; expanded shows the
  // full 3-column WORST-CASE / ENTRY / FIXES layout. Default collapsed so
  // the diagram below gets the screen real estate it needs.
  const [expanded, setExpanded] = useState(false)

  // Stale-while-revalidate via useCachedFetch — localStorage-backed.
  // Replaced raw fetch+useState because the operator was hitting cold
  // backend (47s+) and seeing either a 30s loading spinner OR a
  // "Surface aggregation failed: aborted due to timeout" error after
  // every backend deploy. SWR shows the LAST cached aggregation
  // instantly on revisit while a background refresh runs; if the
  // refresh fails (backend 502/504 cold), the stale data stays put
  // with an isStale=true signal — operator's still productive, never
  // looking at a blank error screen.
  const url = systemName && jewelId
    ? `/api/proxy/identity-attack-paths/${encodeURIComponent(systemName)}/jewel-surface/${encodeURIComponent(jewelId)}`
    : null
  const { data, isStale, loading, error } = useCachedFetch<JewelSurfaceData>(url, {
    cacheKey: `jewel-surface:${systemName}:${jewelId}`,
  })

  if (!jewelId) return null
  // First-ever load with NO cached fallback — show a loading hint.
  // (After the first successful fetch, even cold backend cycles will
  // render stale data instantly via SWR — this branch only fires for
  // brand-new jewels the operator has never opened.)
  if (loading && !data) {
    return (
      <div className="px-4 py-2 text-[10px] text-slate-500 border-b border-slate-700/50">
        Loading attack-surface aggregation…
      </div>
    )
  }
  // Surface error only when there's no cached fallback. With cache present,
  // useCachedFetch keeps showing stale data with isStale=true and never
  // surfaces a backend error — the operator stays productive.
  if (error && !data) {
    return (
      <div className="px-4 py-2 text-[10px] text-red-400 border-b border-red-900/50">
        Surface aggregation failed: {error}
      </div>
    )
  }
  if (!data || !data.aggregated_damage) return null

  const dmg = data.aggregated_damage
  const verbs = dmg.max_verbs ?? { read: 0, write: 0, delete: 0, admin: 0 }
  const top = (data.cross_path_remediation ?? []).slice(0, 5)
  const entry = data.entry_summary ?? { total: 0, public_ips: [], private_ips: [], principals: [], aws_ips: [], public_ips_enriched: [] }
  const awsIps = entry.aws_ips ?? []
  const publicEnriched = entry.public_ips_enriched ?? []
  const dist = data.score_distribution ?? { critical: 0, high: 0, medium: 0, low: 0 }
  const totalPaths = data.total_paths || 0

  const planeColor = (p?: string) => {
    if (p === "iam") return "text-purple-300 border-purple-500/30 bg-purple-500/10"
    if (p === "network") return "text-cyan-300 border-cyan-500/30 bg-cyan-500/10"
    if (p === "data") return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
    return "text-slate-300 border-slate-500/30 bg-slate-500/10"
  }

  return (
    <div
      className={`px-4 border-b ${expanded ? "py-3" : "py-1.5"}`}
      style={{
        background: "linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(15, 23, 42, 0.7) 100%)",
        borderColor: "rgba(148, 163, 184, 0.15)",
      }}
    >
      {/* Header — clickable to toggle expanded. Even when collapsed it shows
          the headline numbers (paths, total actions, destructive flag,
          top fix) so the CISO sees the whole picture in one row. */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 text-left hover:bg-white/5 rounded transition-colors -mx-1 px-1 py-0.5"
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
        <Crown className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-100">
          Crown Jewel Attack Surface
        </span>
        <span className="text-[10px] text-slate-500">
          · {totalPaths} path{totalPaths === 1 ? "" : "s"}
        </span>
        {!expanded && (
          <>
            <span className="text-[10px] text-amber-300 font-bold tabular-nums">
              · {verbs.read + verbs.write + verbs.delete + verbs.admin} actions
            </span>
            {top[0] && (
              <span className="text-[10px] text-emerald-300 truncate max-w-[260px]">
                · top fix: {top[0].action ?? top[0].action_type} (breaks {top[0].breaks_path_count}/{totalPaths})
              </span>
            )}
          </>
        )}
        {dmg.destructive_capable && (
          <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-red-300 bg-red-500/15 border border-red-500/40">
            <Skull className="w-3 h-3" /> destructive reachable
          </span>
        )}
      </button>

      {!expanded ? null : <div className="grid grid-cols-12 gap-3 mt-3">
        {/* Aggregated damage capability */}
        <div className="col-span-4 p-3 rounded-md border border-slate-700/60 bg-slate-900/40">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Database className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">
              Worst-case damage
            </span>
          </div>
          <div className="flex items-baseline gap-3 mb-1">
            <span className="text-2xl font-bold text-amber-300 tabular-nums">
              {verbs.read + verbs.write + verbs.delete + verbs.admin}
            </span>
            <span className="text-[10px] text-slate-500">total actions reachable</span>
          </div>
          <div className="grid grid-cols-4 gap-1 text-[10px]">
            {[
              { k: "read", label: "R", val: verbs.read, cls: "text-blue-300 bg-blue-500/10" },
              { k: "write", label: "W", val: verbs.write, cls: "text-amber-300 bg-amber-500/10" },
              { k: "delete", label: "D", val: verbs.delete, cls: "text-red-300 bg-red-500/15" },
              { k: "admin", label: "A", val: verbs.admin, cls: "text-purple-300 bg-purple-500/15" },
            ].map((v) => (
              <div key={v.k} className={`px-1.5 py-1 rounded text-center ${v.cls}`}>
                <div className="font-bold tabular-nums">{v.val}</div>
                <div className="opacity-70">{v.label}</div>
              </div>
            ))}
          </div>
          {dmg.roles && dmg.roles.length > 0 && (
            <div className="text-[9px] text-slate-500 mt-1.5">
              {dmg.roles.length} role{dmg.roles.length === 1 ? "" : "s"} reach this jewel
            </div>
          )}
        </div>

        {/* Entry surface — public vs private vs principals */}
        <div className="col-span-4 p-3 rounded-md border border-slate-700/60 bg-slate-900/40">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Globe className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">
              Entry surface
            </span>
          </div>
          <div className="space-y-1.5">
            {/* Public IPs — when public_ips_enriched is present, render the
                enriched view with org / country instead of the bare IP list.
                CISO sees "188.125.64.7 · Bezeq International · IL" instead of
                an opaque IP. Falls back to the simple count row when enrichment
                isn't available. */}
            {publicEnriched.length > 0 ? (
              <div
                className="flex items-start gap-1.5 text-[10px]"
                title={"External public IPs (not in AWS-published ranges) with org / country from ip-api.com.\nBlank fields = remote lookup unavailable for that IP."}
              >
                <Globe className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
                <span className="text-slate-400 w-16 shrink-0">Public IPs</span>
                <span className="font-bold tabular-nums text-rose-300 shrink-0">{publicEnriched.length}</span>
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  {publicEnriched.slice(0, 5).map((p) => {
                    const label = [p.org, p.country].filter(Boolean).join(" · ")
                    return (
                      <div
                        key={p.ip}
                        className="flex items-center gap-1.5 truncate"
                        title={[p.ip, p.org, p.country_name, p.city, p.asn].filter(Boolean).join(" · ")}
                      >
                        <span className="text-slate-300 tabular-nums">{p.ip}</span>
                        {label && (
                          <span className="text-slate-500 truncate">· {label}</span>
                        )}
                      </div>
                    )
                  })}
                  {publicEnriched.length > 5 && (
                    <span className="text-slate-500">+{publicEnriched.length - 5} more</span>
                  )}
                </div>
              </div>
            ) : (
              <EntryRow
                icon={<Globe className="w-3 h-3 text-rose-400" />}
                label="Public IPs"
                count={entry.public_ips.length}
                items={entry.public_ips}
                cls="text-rose-300"
                tooltip="Public internet IPs not in AWS-published ranges — likely external attacker / customer / unknown source"
              />
            )}
            {/* AWS IPs — populated when classify_endpoint matches a public IP
                against AWS-published ranges. Shows service + region per IP
                so the CISO sees "AWS S3 us-east-1" instead of an opaque IP. */}
            {awsIps.length > 0 && (
              <div
                className="flex items-start gap-1.5 text-[10px]"
                title={
                  "Public IPs that match AWS-published prefix ranges. Service + region identify which AWS service owns the IP.\n\n" +
                  awsIps.slice(0, 8).map((a) => `${a.ip}  ${a.service}/${a.region}`).join("\n") +
                  (awsIps.length > 8 ? `\n…+${awsIps.length - 8} more` : "")
                }
              >
                <Globe className="w-3 h-3 text-orange-300 shrink-0 mt-0.5" />
                <span className="text-slate-400 w-16 shrink-0">AWS IPs</span>
                <span className="font-bold tabular-nums text-orange-300 shrink-0">{awsIps.length}</span>
                <div className="flex flex-wrap gap-0.5 flex-1 min-w-0">
                  {awsIps.slice(0, 4).map((a) => (
                    <span
                      key={a.ip}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-200 text-[9px] font-semibold border border-orange-500/30"
                      title={`${a.ip} → AWS ${a.service} in ${a.region}`}
                    >
                      {a.service}
                      {a.region && a.region !== "GLOBAL" && (
                        <span className="text-orange-300/70">·{a.region}</span>
                      )}
                    </span>
                  ))}
                  {awsIps.length > 4 && (
                    <span className="text-[9px] text-slate-500">+{awsIps.length - 4}</span>
                  )}
                </div>
              </div>
            )}
            <EntryRow
              icon={<Network className="w-3 h-3 text-cyan-400" />}
              label="Private IPs"
              count={entry.private_ips.length}
              items={entry.private_ips}
              cls="text-cyan-300"
              tooltip="RFC1918 / east-west VPC traffic — internal source, not external attacker"
            />
            <EntryRow
              icon={<UserCircle className="w-3 h-3 text-amber-400" />}
              label="Principals"
              count={entry.principals.length}
              items={entry.principals}
              cls="text-amber-300"
              tooltip="CloudTrail principals (root, AWS service principals) on the path"
            />
          </div>
        </div>

        {/* Cross-path remediation — fix once, breaks N */}
        <div className="col-span-4 p-3 rounded-md border border-amber-500/20 bg-amber-500/5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Wrench className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">
              Highest-leverage fixes
            </span>
            <span className="ml-auto text-[9px] text-slate-500">
              {top.length} of {(data.cross_path_remediation ?? []).length}
            </span>
          </div>
          {top.length === 0 ? (
            <div className="text-[10px] text-slate-500 italic">
              No actionable cross-path remediation found.
            </div>
          ) : (
            <ul className="space-y-1">
              {top.map((a, i) => (
                <li
                  key={i}
                  className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px] border ${planeColor(a.plane)}`}
                  title={`${a.action ?? a.action_type ?? "—"}\nNode: ${a.node_name}\nBest score impact on a single path: ${a.best_impact}\nBreaks ${a.breaks_path_count} of ${totalPaths} paths`}
                >
                  <Zap className="w-2.5 h-2.5 opacity-70 flex-shrink-0" />
                  <span className="truncate flex-1 font-medium">
                    {a.action ?? a.action_type ?? "—"}
                  </span>
                  <span className="font-bold tabular-nums whitespace-nowrap">
                    breaks {a.breaks_path_count}/{totalPaths}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>}

      {/* Score distribution strip — only when expanded */}
      {expanded && (
        <div className="mt-2 flex items-center gap-2 text-[10px]">
          <span className="text-slate-500 uppercase tracking-wider">Severity mix:</span>
          {dist.critical > 0 && <span className="text-red-300 font-semibold">{dist.critical} critical</span>}
          {dist.high > 0 && <span className="text-orange-300 font-semibold">{dist.high} high</span>}
          {dist.medium > 0 && <span className="text-amber-300 font-semibold">{dist.medium} medium</span>}
          {dist.low > 0 && <span className="text-emerald-300 font-semibold">{dist.low} low</span>}
          {dmg.summary && (
            <span className="ml-auto text-slate-400 italic truncate max-w-[480px]" title={dmg.summary}>
              {dmg.summary}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function EntryRow({
  icon,
  label,
  count,
  items,
  cls,
  tooltip,
}: {
  icon: React.ReactNode
  label: string
  count: number
  items: string[]
  cls: string
  tooltip: string
}) {
  return (
    <div
      className="flex items-center gap-1.5 text-[10px]"
      title={tooltip + (items.length > 0 ? "\n\n" + items.slice(0, 8).join("\n") + (items.length > 8 ? `\n…+${items.length - 8} more` : "") : "")}
    >
      {icon}
      <span className="text-slate-400 w-16 shrink-0">{label}</span>
      <span className={`font-bold tabular-nums ${cls}`}>{count}</span>
      {count > 0 && (
        <span className="text-slate-500 truncate flex-1">
          {items.slice(0, 3).join(", ")}
          {items.length > 3 && ` …+${items.length - 3}`}
        </span>
      )}
      {count === 0 && <span className="text-slate-600">—</span>}
    </div>
  )
}
