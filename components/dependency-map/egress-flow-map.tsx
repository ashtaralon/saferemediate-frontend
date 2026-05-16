"use client"

/**
 * Egress Flow Map
 * ===============
 *
 * 5-column animated visualization for the Risk → Traffic tab:
 *
 *   COMPUTE  →  EGRESS GATE (SG)  →  ROUTE (NAT/IGW/VPCE/TGW)  →
 *               DESTINATION (asn/country/hostname)  →  CHANNEL SIGNALS
 *
 * Data source: `/api/proxy/egress/system/{systemName}` — the same
 * endpoint EgressVisibilityPanel uses, no new proxy route. Each
 * workload row in the response carries `top_destinations[]` where each
 * destination has the via_route_node_* fields written by the backend's
 * longest-prefix-match resolver against the Subnet-[:ROUTES_VIA]
 * edges.
 *
 * "Channel signals" vocabulary is the egress-signals contract — never
 * "Suspicious" (memory: feedback_signal_language). Codes are pinned
 * with the backend `_compute_signals` in api/egress_visibility.py.
 */

import React, { useEffect, useMemo, useState } from "react"
import {
  Activity,
  AlertTriangle,
  Globe,
  Lock,
  Network,
  Server,
  ShieldAlert,
  ShieldOff,
  Sparkles,
  Zap,
} from "lucide-react"

// ---- Data shape (matches api/egress_visibility.py response) ----------

interface Destination {
  ip: string
  kind: "aws" | "external" | "internal" | "unknown"
  aws_service: string | null
  aws_region: string | null
  org: string | null
  asn: string | null
  country: string | null
  hostname: string | null
  ports: string[]
  protocols: string[]
  bytes: number
  hits: number
  last_seen: string | null
  first_seen: string | null
  signals: string[]
  via_route_node_id: string | null
  via_route_node_kind: string | null
  via_route_node_name: string | null
  via_route_cidr: string | null
}

interface WorkloadEgress {
  workload: {
    id: string
    name: string
    labels: string[]
    node_type: string | null
    region: string | null
    subnet_is_public: boolean | null
  }
  totals: {
    destinations: number
    aws_destinations: number
    external_destinations: number
    internal_destinations: number
    total_bytes: number
    total_hits: number
    signaled_destinations: number
    signals_breakdown: Record<string, number>
  }
  top_destinations: Destination[]
}

interface EgressResponse {
  system_name: string
  lookback_days: number
  workloads: WorkloadEgress[]
}

// ---- Signal vocabulary (label + tooltip + color tone) -----------------
// Pinned with the backend `_compute_signals` codes. Never "Suspicious"
// — operator decides what's malicious.

const SIGNAL_META: Record<
  string,
  { label: string; tooltip: string; tone: "warning" | "info" | "alert" }
> = {
  cross_region_aws: {
    label: "Cross-region AWS",
    tooltip:
      "Workload region differs from destination AWS region. Often legit cross-region replication; flag because it surfaces unintended egress and costs $$.",
    tone: "info",
  },
  cross_cloud: {
    label: "Cross-cloud",
    tooltip:
      "AWS workload talking to a different cloud provider (Azure, GCP, Oracle, DigitalOcean, etc.). Legit for replication; review for unintended.",
    tone: "info",
  },
  non_aws_public_from_private_subnet: {
    label: "Private→public IP",
    tooltip:
      "Private-subnet workload reached a non-AWS public IP (likely via NAT). Expected for some workloads; worth a second look for others.",
    tone: "warning",
  },
  new_destination: {
    label: "New destination",
    tooltip:
      "Destination first appeared on this workload's flow history less than 7 days ago. Hot signal for sudden behavior change.",
    tone: "alert",
  },
  plaintext: {
    label: "Plaintext channel",
    tooltip:
      "Flow uses an unencrypted protocol/port (HTTP/80, FTP/21, Telnet/23, IMAP/143, POP3/110, LDAP/389, MSSQL/MySQL/Postgres unencrypted). Credentials/data leave in cleartext.",
    tone: "alert",
  },
  residential_isp: {
    label: "Residential ISP",
    tooltip:
      "Destination ASN is on the residential consumer-ISP heuristic list (Comcast, Verizon FiOS, Spectrum, etc.). Production workloads almost never have legitimate reasons to talk to a consumer ISP.",
    tone: "alert",
  },
  rare_asn: {
    label: "Rare ASN",
    tooltip:
      "Destination ASN is reached by only one destination in this system's entire 30-day window. Catches the 'this workload reached somewhere none of its peers go' case.",
    tone: "alert",
  },
}

function signalToneClasses(tone: "warning" | "info" | "alert"): string {
  switch (tone) {
    case "alert":
      return "bg-rose-500/10 text-rose-300 border-rose-500/40"
    case "warning":
      return "bg-amber-500/10 text-amber-300 border-amber-500/40"
    case "info":
    default:
      return "bg-sky-500/10 text-sky-300 border-sky-500/40"
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function countryFlag(country: string | null): string {
  // ISO 3166-1 alpha-2 → flag emoji via regional indicator math. Returns
  // "" for missing/invalid country codes so the UI can omit gracefully.
  if (!country || country.length !== 2) return ""
  const code = country.toUpperCase()
  return String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)))
}

function routeKindIcon(kind: string | null) {
  switch (kind) {
    case "InternetGateway":
      return <Globe className="w-3.5 h-3.5 text-amber-400" />
    case "NATGateway":
      return <Network className="w-3.5 h-3.5 text-blue-400" />
    case "VPCEndpoint":
      return <Lock className="w-3.5 h-3.5 text-emerald-400" />
    case "TransitGateway":
      return <Activity className="w-3.5 h-3.5 text-violet-400" />
    case "EgressOnlyInternetGateway":
      return <Globe className="w-3.5 h-3.5 text-orange-400" />
    default:
      return <ShieldOff className="w-3.5 h-3.5 text-slate-500" />
  }
}

// Pick the dominant route node for a workload — the one with the most
// bytes routed through it. We render ONE route node per workload row
// to keep the visual flow readable; clicking a destination chip would
// drill into per-destination route (future iteration).
function dominantRoute(destinations: Destination[]): {
  kind: string
  name: string
  bytes: number
} | null {
  const byNode = new Map<string, { kind: string; name: string; bytes: number }>()
  for (const d of destinations) {
    if (!d.via_route_node_id || !d.via_route_node_kind) continue
    const cur =
      byNode.get(d.via_route_node_id) ?? {
        kind: d.via_route_node_kind,
        name: d.via_route_node_name ?? d.via_route_node_id,
        bytes: 0,
      }
    cur.bytes += d.bytes
    byNode.set(d.via_route_node_id, cur)
  }
  if (byNode.size === 0) return null
  return [...byNode.values()].sort((a, b) => b.bytes - a.bytes)[0]
}

// ---- Component --------------------------------------------------------

export function EgressFlowMap({ systemName }: { systemName: string }) {
  const [data, setData] = useState<EgressResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeSignalFilter, setActiveSignalFilter] = useState<string | null>(null)

  useEffect(() => {
    if (!systemName) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(
      `/api/proxy/egress/system/${encodeURIComponent(systemName)}?days=30&top_n=20`,
      { cache: "no-store" },
    )
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error(j.error || `HTTP ${r.status}`)
        }
        return r.json()
      })
      .then((j) => {
        if (!cancelled) setData(j)
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message ?? "Failed to load egress data")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [systemName])

  // Aggregate signal counts across the whole response so the rightmost
  // SIGNALS column can render a system-level summary the operator can
  // click to filter rows.
  const signalCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    if (!data) return counts
    for (const w of data.workloads || []) {
      for (const d of w.top_destinations || []) {
        for (const s of d.signals || []) {
          counts[s] = (counts[s] || 0) + 1
        }
      }
    }
    return counts
  }, [data])

  // Apply signal filter to workloads: only show rows that have at least
  // one destination carrying the selected signal.
  const visibleWorkloads = useMemo(() => {
    if (!data) return []
    if (!activeSignalFilter) return data.workloads
    return data.workloads.filter((w) =>
      (w.top_destinations || []).some((d) =>
        (d.signals || []).includes(activeSignalFilter),
      ),
    )
  }, [data, activeSignalFilter])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] rounded-xl bg-slate-900">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-white text-sm font-medium">Loading Egress Flow Map…</p>
          <p className="text-slate-400 text-xs mt-1">Querying Neo4j + ipinfo.io</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl bg-rose-500/5 border border-rose-500/30 p-6">
        <div className="flex items-center gap-2 text-rose-300 mb-2">
          <AlertTriangle className="w-5 h-5" />
          <span className="font-semibold">Failed to load egress data</span>
        </div>
        <p className="text-rose-200/80 text-sm">{error}</p>
      </div>
    )
  }

  if (!data || !data.workloads || data.workloads.length === 0) {
    return (
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-8 text-center">
        <Globe className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-300 text-sm font-medium mb-1">No outbound traffic observed</p>
        <p className="text-slate-500 text-xs">
          No workloads in <span className="font-mono">{systemName}</span> have outbound
          flows in the 30-day VPC Flow Log window.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-800 bg-gradient-to-r from-slate-900 to-slate-950">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              Egress Flow Map · {systemName}
            </h3>
            <p className="text-slate-400 text-xs mt-0.5">
              {data.workloads.length} workloads · 30-day window · animated outbound flows
            </p>
          </div>
          {activeSignalFilter && (
            <button
              onClick={() => setActiveSignalFilter(null)}
              className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              Clear signal filter
            </button>
          )}
        </div>
      </div>

      {/* 5-column header strip */}
      <div className="px-5 pt-4 pb-2 grid grid-cols-[1fr_140px_180px_1.5fr_220px] gap-3 text-[10px] uppercase tracking-wider font-semibold text-slate-500">
        <div className="flex items-center gap-1.5">
          <Server className="w-3 h-3" /> Compute
        </div>
        <div className="flex items-center gap-1.5">
          <ShieldAlert className="w-3 h-3" /> Egress Gate
        </div>
        <div className="flex items-center gap-1.5">
          <Network className="w-3 h-3" /> Route
        </div>
        <div className="flex items-center gap-1.5">
          <Globe className="w-3 h-3" /> Destination
        </div>
        <div className="flex items-center gap-1.5">
          <Zap className="w-3 h-3" /> Channel Signals
        </div>
      </div>

      {/* Workload rows */}
      <div className="px-5 pb-5 space-y-3">
        {visibleWorkloads.map((w) => (
          <WorkloadRow
            key={w.workload.id}
            workload={w}
            activeSignalFilter={activeSignalFilter}
          />
        ))}
        {visibleWorkloads.length === 0 && activeSignalFilter && (
          <div className="text-center py-8 text-slate-500 text-sm">
            No workloads match signal filter:{" "}
            <span className="font-mono text-slate-300">{activeSignalFilter}</span>
          </div>
        )}
      </div>

      {/* System-level signal summary footer */}
      {Object.keys(signalCounts).length > 0 && (
        <div className="border-t border-slate-800 bg-slate-900/50 px-5 py-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
            System-wide channel signals · click to filter
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(signalCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([code, count]) => {
                const meta = SIGNAL_META[code] ?? {
                  label: code,
                  tooltip: code,
                  tone: "info" as const,
                }
                const active = activeSignalFilter === code
                return (
                  <button
                    key={code}
                    onClick={() => setActiveSignalFilter(active ? null : code)}
                    title={meta.tooltip}
                    className={`px-2 py-1 rounded border text-[10px] font-semibold ${
                      active
                        ? "bg-white text-slate-900 border-white"
                        : signalToneClasses(meta.tone)
                    }`}
                  >
                    {meta.label} · {count}
                  </button>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Row: one workload spans all 5 columns ----------------------------

function WorkloadRow({
  workload,
  activeSignalFilter,
}: {
  workload: WorkloadEgress
  activeSignalFilter: string | null
}) {
  const route = dominantRoute(workload.top_destinations || [])
  // SG inference: not in the egress response today (the per-workload SG
  // chain is computed in the System Map but not in /egress/system).
  // Render an honest placeholder rather than fabricating — three-state
  // contract per the no-mock-numbers rule.
  const sgState = "not-wired"

  const destinations = workload.top_destinations || []
  const filteredDestinations = activeSignalFilter
    ? destinations.filter((d) => (d.signals || []).includes(activeSignalFilter))
    : destinations

  return (
    <div className="grid grid-cols-[1fr_140px_180px_1.5fr_220px] gap-3 items-start">
      {/* COMPUTE */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 min-h-[80px]">
        <div className="text-sm font-semibold text-slate-100 truncate">
          {workload.workload.name || workload.workload.id}
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">
          {workload.workload.node_type ?? "Workload"} ·{" "}
          {workload.workload.region ?? "—"}
        </div>
        <div className="flex items-center gap-2 mt-2 text-[11px]">
          <span className="text-cyan-300 font-mono">
            ↗ {formatBytes(workload.totals.total_bytes)}
          </span>
          <span className="text-slate-500">
            · {workload.totals.total_hits.toLocaleString()} hits
          </span>
        </div>
      </div>

      {/* EGRESS GATE */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 min-h-[80px]">
        {sgState === "not-wired" ? (
          <>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">
              SG egress
            </div>
            <div className="text-[11px] text-slate-400 mt-1.5 italic">
              not wired for this view
            </div>
            <div className="text-[10px] text-slate-600 mt-1 leading-relaxed">
              Per-flow SG attribution lands when the System-Map egress-SG
              query is folded into /egress/system.
            </div>
          </>
        ) : null}
      </div>

      {/* ROUTE */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 min-h-[80px]">
        {route ? (
          <>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-100">
              {routeKindIcon(route.kind)}
              <span className="truncate">{route.name}</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">{route.kind}</div>
            <div className="text-[10px] text-cyan-400 font-mono mt-1.5">
              {formatBytes(route.bytes)} routed
            </div>
          </>
        ) : (
          <>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">
              Route
            </div>
            <div className="text-[11px] text-slate-400 mt-1.5 italic">
              not in VPC / no route data
            </div>
          </>
        )}
      </div>

      {/* DESTINATIONS */}
      <div className="space-y-1.5">
        {filteredDestinations.slice(0, 5).map((d, i) => (
          <DestinationChip key={`${d.ip}:${i}`} destination={d} />
        ))}
        {filteredDestinations.length > 5 && (
          <div className="text-[10px] text-slate-500 pl-2">
            + {filteredDestinations.length - 5} more
          </div>
        )}
        {filteredDestinations.length === 0 && (
          <div className="text-[10px] text-slate-600 italic pl-2 pt-1">
            No destinations match filter
          </div>
        )}
      </div>

      {/* CHANNEL SIGNALS */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 min-h-[80px]">
        <SignalsForWorkload workload={workload} />
      </div>
    </div>
  )
}

// ---- Destination chip -------------------------------------------------

function DestinationChip({ destination }: { destination: Destination }) {
  const d = destination
  const isAWS = d.kind === "aws"
  const isNew = (d.signals || []).includes("new_destination")
  const isAlert = (d.signals || []).some((s) =>
    ["plaintext", "residential_isp", "rare_asn"].includes(s),
  )
  const borderCls = isAlert
    ? "border-rose-500/40"
    : isNew
    ? "border-amber-500/40"
    : isAWS
    ? "border-emerald-500/30"
    : "border-slate-700"

  return (
    <div className={`bg-slate-900 border ${borderCls} rounded-lg px-3 py-2`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {d.country ? (
            <span className="text-sm leading-none">{countryFlag(d.country)}</span>
          ) : null}
          <span className="text-xs font-semibold text-slate-100 truncate">
            {d.hostname || d.aws_service || d.org || d.ip}
          </span>
        </div>
        <span className="text-[10px] font-mono text-cyan-400 flex-shrink-0">
          {formatBytes(d.bytes)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500">
        {isAWS ? (
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
            AWS · {d.aws_service ?? "?"}
          </span>
        ) : (
          <>
            <span className="font-mono">{d.asn || "?"}</span>
            <span className="truncate">{d.org || "—"}</span>
          </>
        )}
        <span className="text-slate-600 ml-auto">{d.hits.toLocaleString()} hits</span>
      </div>
      {d.signals && d.signals.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {d.signals.map((s) => {
            const meta = SIGNAL_META[s] ?? { label: s, tooltip: s, tone: "info" as const }
            return (
              <span
                key={s}
                title={meta.tooltip}
                className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold ${signalToneClasses(
                  meta.tone,
                )}`}
              >
                {meta.label}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---- Per-workload signal summary --------------------------------------

function SignalsForWorkload({ workload }: { workload: WorkloadEgress }) {
  const breakdown = workload.totals.signals_breakdown || {}
  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) {
    return (
      <div className="text-[10px] text-slate-500 italic">No signals on this workload</div>
    )
  }
  return (
    <div className="space-y-1">
      {entries.map(([code, count]) => {
        const meta = SIGNAL_META[code] ?? {
          label: code,
          tooltip: code,
          tone: "info" as const,
        }
        return (
          <div
            key={code}
            title={meta.tooltip}
            className={`flex items-center justify-between px-1.5 py-0.5 rounded border text-[10px] font-semibold ${signalToneClasses(
              meta.tone,
            )}`}
          >
            <span className="truncate">{meta.label}</span>
            <span className="ml-1.5">{count}</span>
          </div>
        )
      })}
    </div>
  )
}

export default EgressFlowMap
