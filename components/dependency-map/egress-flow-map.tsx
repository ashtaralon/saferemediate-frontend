"use client"

/**
 * Egress Flow Map — "two ways to exit" path-flow visualization
 * =============================================================
 *
 * Same visual language as the Attack Paths "Path Flow Map" but for
 * outbound traffic: dark canvas, column-based swimlanes, animated SVG
 * arrows, node cards with bytes/hits, severity-coded signal chips.
 *
 * Layout: two stacked swimlanes — PUBLIC EXIT (NAT/IGW → Internet) on
 * top so the riskier story leads, PRIVATE EXIT (VPCE → AWS service)
 * below as the "safe alternative" comparison.
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  PUBLIC EXIT · via NAT / IGW                                 │
 *   │  [COMPUTE] → [SG] → [NAT/IGW] → [Internet destinations]      │
 *   └──────────────────────────────────────────────────────────────┘
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  PRIVATE EXIT · via VPC Endpoint                             │
 *   │  [COMPUTE] → [SG] → [VPCE] → [AWS services]                  │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Each swimlane only renders when it has flows; an empty lane shows a
 * one-line "no traffic via this route" instead of an empty grid.
 *
 * Data source: existing /api/proxy/egress/system/{systemName} — each
 * destination row carries via_route_node_kind (InternetGateway /
 * NATGateway / VPCEndpoint / TransitGateway / etc.) written by the
 * backend longest-prefix-match resolver against Subnet→ROUTES_VIA
 * edges. We bucket into PUBLIC (NAT/IGW/EIGW) vs PRIVATE (VPCE/TGW).
 */

import React, { useEffect, useMemo, useState } from "react"
import {
  Activity,
  AlertTriangle,
  Cloud,
  Globe,
  Key,
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

// ---- Signal vocabulary (pinned to backend codes) ---------------------

const SIGNAL_META: Record<
  string,
  { label: string; tooltip: string; tone: "warning" | "info" | "alert" }
> = {
  cross_region_aws: {
    label: "Cross-region AWS",
    tooltip:
      "Workload region differs from destination AWS region. Often legit cross-region replication; surfaces unintended egress costs.",
    tone: "info",
  },
  cross_cloud: {
    label: "Cross-cloud",
    tooltip:
      "AWS workload talking to a different cloud provider (Azure, GCP, etc.). Legit for replication; review for unintended.",
    tone: "info",
  },
  non_aws_public_from_private_subnet: {
    label: "Private→public IP",
    tooltip:
      "Private-subnet workload reached a non-AWS public IP via NAT. Expected for some workloads; worth a second look for others.",
    tone: "warning",
  },
  new_destination: {
    label: "New destination",
    tooltip:
      "Destination first appeared on this workload's flow history less than 7 days ago.",
    tone: "alert",
  },
  plaintext: {
    label: "Plaintext",
    tooltip:
      "Flow uses an unencrypted protocol/port (HTTP, FTP, Telnet, IMAP, POP3, LDAP, unencrypted MSSQL/MySQL/Postgres). Credentials/data leave in cleartext.",
    tone: "alert",
  },
  residential_isp: {
    label: "Residential ISP",
    tooltip:
      "Destination ASN matches the residential consumer-ISP heuristic list. Production workloads rarely have legitimate reasons to talk to a consumer ISP.",
    tone: "alert",
  },
  rare_asn: {
    label: "Rare ASN",
    tooltip:
      "Destination ASN is reached by only one destination in this system's 30-day window.",
    tone: "alert",
  },
}

function signalToneClasses(tone: "warning" | "info" | "alert"): string {
  switch (tone) {
    case "alert":
      return "bg-rose-500/15 text-rose-300 border-rose-500/50"
    case "warning":
      return "bg-amber-500/15 text-amber-300 border-amber-500/50"
    case "info":
    default:
      return "bg-sky-500/15 text-sky-300 border-sky-500/50"
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function countryFlag(country: string | null): string {
  if (!country || country.length !== 2) return ""
  const code = country.toUpperCase()
  return String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)))
}

// ---- Lane classification ---------------------------------------------
// Bucket each destination into PUBLIC vs PRIVATE based on the resolved
// route. UNKNOWN bucket catches destinations whose via_route_* fields
// are null (workload outside VPC, or backend not yet deployed).

type LaneKind = "public" | "private" | "unknown"

const PUBLIC_ROUTE_KINDS = new Set([
  "InternetGateway",
  "NATGateway",
  "EgressOnlyInternetGateway",
])
const PRIVATE_ROUTE_KINDS = new Set([
  "VPCEndpoint",
  "TransitGateway",
])

function laneForDestination(d: Destination): LaneKind {
  // Honest fallback when route data isn't wired: classify by destination
  // kind (AWS → private if it'd typically go via VPCE; external → public).
  // The user sees the lane split even before sync-all populates
  // ROUTES_VIA edges; once edges land, classification becomes precise.
  if (d.via_route_node_kind) {
    if (PUBLIC_ROUTE_KINDS.has(d.via_route_node_kind)) return "public"
    if (PRIVATE_ROUTE_KINDS.has(d.via_route_node_kind)) return "private"
    return "unknown"
  }
  if (d.kind === "aws") return "private"
  if (d.kind === "external") return "public"
  return "unknown"
}

// ---- Bucketed shape for rendering ------------------------------------

interface LaneNode {
  // Per-route-node aggregation: each unique NAT/IGW/VPCE/etc gets one
  // node in the ROUTE column with its bytes summed across destinations.
  id: string
  name: string
  kind: string // raw target_kind from the backend
  bytes: number
  workloadIds: Set<string>
}

interface Lane {
  kind: LaneKind
  workloads: Map<string, { name: string; bytes: number; hits: number; signals: number }>
  routeNodes: Map<string, LaneNode>
  destinations: Destination[]
  totalBytes: number
  signalCount: number
}

function emptyLane(kind: LaneKind): Lane {
  return {
    kind,
    workloads: new Map(),
    routeNodes: new Map(),
    destinations: [],
    totalBytes: 0,
    signalCount: 0,
  }
}

function bucketLanes(workloads: WorkloadEgress[]): { public: Lane; private: Lane } {
  const out = {
    public: emptyLane("public"),
    private: emptyLane("private"),
  }
  for (const w of workloads) {
    for (const d of w.top_destinations || []) {
      const lane = laneForDestination(d)
      if (lane === "unknown") continue
      const target = out[lane]
      // Aggregate workload presence
      const wEntry = target.workloads.get(w.workload.id) ?? {
        name: w.workload.name || w.workload.id,
        bytes: 0,
        hits: 0,
        signals: 0,
      }
      wEntry.bytes += d.bytes
      wEntry.hits += d.hits
      wEntry.signals += (d.signals || []).length
      target.workloads.set(w.workload.id, wEntry)
      // Aggregate route node
      const routeId = d.via_route_node_id ?? `synthetic:${lane}:${d.aws_service ?? "internet"}`
      const routeKind =
        d.via_route_node_kind ?? (lane === "private" ? "VPCEndpoint" : "InternetGateway")
      const routeName =
        d.via_route_node_name ??
        (lane === "private" ? `via ${d.aws_service ?? "AWS service"}` : "via Internet")
      const rEntry = target.routeNodes.get(routeId) ?? {
        id: routeId,
        name: routeName,
        kind: routeKind,
        bytes: 0,
        workloadIds: new Set<string>(),
      }
      rEntry.bytes += d.bytes
      rEntry.workloadIds.add(w.workload.id)
      target.routeNodes.set(routeId, rEntry)
      // Destination
      target.destinations.push(d)
      target.totalBytes += d.bytes
      target.signalCount += (d.signals || []).length
    }
  }
  return out
}

function routeIcon(kind: string) {
  switch (kind) {
    case "InternetGateway":
      return <Globe className="w-4 h-4 text-amber-400" />
    case "EgressOnlyInternetGateway":
      return <Globe className="w-4 h-4 text-orange-400" />
    case "NATGateway":
      return <Network className="w-4 h-4 text-blue-400" />
    case "VPCEndpoint":
      return <Lock className="w-4 h-4 text-emerald-400" />
    case "TransitGateway":
      return <Activity className="w-4 h-4 text-violet-400" />
    default:
      return <ShieldOff className="w-4 h-4 text-slate-500" />
  }
}

// ---- Component --------------------------------------------------------

export function EgressFlowMap({ systemName }: { systemName: string }) {
  const [data, setData] = useState<EgressResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signalFilter, setSignalFilter] = useState<string | null>(null)

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

  const lanes = useMemo(() => {
    if (!data) return { public: emptyLane("public"), private: emptyLane("private") }
    let workloads = data.workloads || []
    if (signalFilter) {
      // Filter at the workload level — keep workloads that have at
      // least one destination with the selected signal. Lane bucketing
      // happens after.
      workloads = workloads
        .map((w) => ({
          ...w,
          top_destinations: (w.top_destinations || []).filter((d) =>
            (d.signals || []).includes(signalFilter),
          ),
        }))
        .filter((w) => w.top_destinations.length > 0)
    }
    return bucketLanes(workloads)
  }, [data, signalFilter])

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px] rounded-xl bg-slate-900">
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
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-cyan-500/20 rounded-xl flex items-center justify-center">
            <Cloud className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Egress Flow Map</h3>
            <p className="text-xs text-slate-400">
              {systemName} · two ways data leaves this system · 30-day VPC Flow Logs
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/20 rounded-full ml-4">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs font-medium text-emerald-400">LIVE</span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-center px-3">
            <div className="text-amber-400 font-bold">{formatBytes(lanes.public.totalBytes)}</div>
            <div className="text-[10px] text-slate-500">Public exit</div>
          </div>
          <div className="text-center px-3 border-l border-slate-700">
            <div className="text-emerald-400 font-bold">
              {formatBytes(lanes.private.totalBytes)}
            </div>
            <div className="text-[10px] text-slate-500">Private exit</div>
          </div>
          {Object.values(signalCounts).reduce((a, b) => a + b, 0) > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/15 rounded-lg border-l border-slate-700">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <div>
                <div className="text-rose-300 font-bold">
                  {Object.values(signalCounts).reduce((a, b) => a + b, 0)}
                </div>
                <div className="text-[10px] text-slate-500">Signals</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Signal filter chips */}
      {Object.keys(signalCounts).length > 0 && (
        <div className="px-6 py-3 border-b border-slate-800 bg-slate-900/30">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 mr-2">
              Filter
            </span>
            {Object.entries(signalCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([code, count]) => {
                const meta = SIGNAL_META[code] ?? {
                  label: code,
                  tooltip: code,
                  tone: "info" as const,
                }
                const active = signalFilter === code
                return (
                  <button
                    key={code}
                    onClick={() => setSignalFilter(active ? null : code)}
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
            {signalFilter && (
              <button
                onClick={() => setSignalFilter(null)}
                className="text-[10px] px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 ml-1"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Two swimlanes */}
      <div className="p-6 space-y-6">
        <Swimlane
          title="Public exit"
          subtitle="Via NAT Gateway / Internet Gateway → Internet"
          accent="amber"
          icon={<Globe className="w-5 h-5 text-amber-400" />}
          lane={lanes.public}
        />
        <Swimlane
          title="Private exit"
          subtitle="Via VPC Endpoint / Transit Gateway → AWS services (private)"
          accent="emerald"
          icon={<Lock className="w-5 h-5 text-emerald-400" />}
          lane={lanes.private}
        />
      </div>
    </div>
  )
}

// ---- Swimlane: one COMPUTE → SG → ROUTE → DESTINATION flow ---------

function Swimlane({
  title,
  subtitle,
  accent,
  icon,
  lane,
}: {
  title: string
  subtitle: string
  accent: "amber" | "emerald"
  icon: React.ReactNode
  lane: Lane
}) {
  const accentBorder =
    accent === "amber" ? "border-amber-500/30" : "border-emerald-500/30"
  const accentText = accent === "amber" ? "text-amber-300" : "text-emerald-300"
  const accentBg =
    accent === "amber"
      ? "bg-gradient-to-r from-amber-500/5 to-transparent"
      : "bg-gradient-to-r from-emerald-500/5 to-transparent"
  const flowColor = accent === "amber" ? "#f59e0b" : "#10b981"

  const workloads = [...lane.workloads.entries()]
    .map(([id, w]) => ({ id, ...w }))
    .sort((a, b) => b.bytes - a.bytes)
  const routeNodes = [...lane.routeNodes.values()].sort((a, b) => b.bytes - a.bytes)
  const destinations = [...lane.destinations].sort((a, b) => b.bytes - a.bytes)

  const empty = workloads.length === 0

  return (
    <div className={`rounded-xl border ${accentBorder} ${accentBg} overflow-hidden`}>
      {/* Lane header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/60 bg-slate-900/50">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <div className={`text-sm font-bold uppercase tracking-wider ${accentText}`}>
              {title}
            </div>
            <div className="text-[11px] text-slate-400">{subtitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-slate-500">
            <span className={`font-bold ${accentText}`}>{workloads.length}</span> workloads
          </span>
          <span className="text-slate-500">
            <span className={`font-bold ${accentText}`}>{routeNodes.length}</span>{" "}
            {accent === "amber" ? "gateways" : "endpoints"}
          </span>
          <span className="text-slate-500">
            <span className={`font-bold ${accentText}`}>{destinations.length}</span>{" "}
            destinations
          </span>
          <span className="text-slate-500">
            <span className={`font-bold ${accentText}`}>{formatBytes(lane.totalBytes)}</span>{" "}
            out
          </span>
          {lane.signalCount > 0 && (
            <span className="text-rose-300 font-bold">{lane.signalCount} signals</span>
          )}
        </div>
      </div>

      {empty ? (
        <div className="px-6 py-8 text-center">
          <div className="text-slate-500 text-sm">
            No traffic via this exit route in the 30-day window.
          </div>
          <div className="text-[11px] text-slate-600 mt-1">
            {accent === "amber"
              ? "All outbound traffic stays inside AWS via VPC Endpoints — or the workload has no public-route data wired."
              : "All outbound traffic exits to the Internet — no private-endpoint usage observed."}
          </div>
        </div>
      ) : (
        <div className="p-5">
          {/* 4-column grid: COMPUTE | SG | ROUTE | DESTINATION */}
          <div className="grid grid-cols-[1.1fr_0.7fr_1fr_1.5fr] gap-4 relative">
            {/* COMPUTE column */}
            <Column title="Compute" count={workloads.length}>
              {workloads.slice(0, 8).map((w) => (
                <NodeCard
                  key={w.id}
                  primary={w.name}
                  secondary={`${formatBytes(w.bytes)} · ${w.hits.toLocaleString()} hits`}
                  icon={<Server className="w-3.5 h-3.5 text-blue-400" />}
                  flagSignals={w.signals > 0}
                />
              ))}
              {workloads.length > 8 && (
                <MoreCard count={workloads.length - 8} label="workloads" />
              )}
            </Column>

            {/* SG column — placeholder honest state */}
            <Column title="Egress SG" count={0}>
              <div className="rounded-lg border border-dashed border-slate-700/60 bg-slate-900/40 px-3 py-3 text-center">
                <ShieldAlert className="w-4 h-4 text-slate-500 mx-auto mb-1" />
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                  Not wired
                </div>
                <div className="text-[10px] text-slate-600 mt-1 leading-relaxed">
                  Per-flow SG attribution lands when System Map's egress-SG
                  query folds into /egress/system.
                </div>
              </div>
            </Column>

            {/* ROUTE column */}
            <Column title={accent === "amber" ? "Gateway" : "Endpoint"} count={routeNodes.length}>
              {routeNodes.slice(0, 8).map((r) => (
                <NodeCard
                  key={r.id}
                  primary={r.name}
                  secondary={`${r.kind} · ${formatBytes(r.bytes)}`}
                  icon={routeIcon(r.kind)}
                />
              ))}
              {routeNodes.length > 8 && (
                <MoreCard count={routeNodes.length - 8} label="routes" />
              )}
            </Column>

            {/* DESTINATION column */}
            <Column title="Destination" count={destinations.length}>
              {destinations.slice(0, 10).map((d, i) => (
                <DestinationChip key={`${d.ip}-${i}`} destination={d} />
              ))}
              {destinations.length > 10 && (
                <MoreCard count={destinations.length - 10} label="destinations" />
              )}
            </Column>

            {/* Animated flow arrows overlay — SVG covers the full grid */}
            <FlowArrows color={flowColor} />
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Sub-components --------------------------------------------------

function Column({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 relative z-10">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1.5 pb-1 border-b border-slate-800">
        <span>{title}</span>
        <span className="text-slate-600">({count})</span>
      </div>
      {children}
    </div>
  )
}

function NodeCard({
  primary,
  secondary,
  icon,
  flagSignals = false,
}: {
  primary: string
  secondary?: string
  icon?: React.ReactNode
  flagSignals?: boolean
}) {
  return (
    <div
      className={`rounded-lg border bg-slate-900/80 px-3 py-2 min-h-[52px] flex items-center gap-2 ${
        flagSignals ? "border-rose-500/40" : "border-slate-700/60"
      }`}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-slate-100 truncate">{primary}</div>
        {secondary && (
          <div className="text-[10px] text-slate-500 truncate mt-0.5">{secondary}</div>
        )}
      </div>
      {flagSignals && (
        <Zap className="w-3 h-3 text-rose-400 flex-shrink-0" title="Has channel signals" />
      )}
    </div>
  )
}

function MoreCard({ count, label }: { count: number; label: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-[10px] text-slate-500 italic text-center">
      + {count} more {label}
    </div>
  )
}

function DestinationChip({ destination }: { destination: Destination }) {
  const d = destination
  const isAlert = (d.signals || []).some((s) =>
    ["plaintext", "residential_isp", "rare_asn"].includes(s),
  )
  const isNew = (d.signals || []).includes("new_destination")
  const borderCls = isAlert
    ? "border-rose-500/50"
    : isNew
    ? "border-amber-500/50"
    : d.kind === "aws"
    ? "border-emerald-500/30"
    : "border-slate-700/60"

  return (
    <div className={`rounded-lg border bg-slate-900/80 px-3 py-2 ${borderCls}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {d.country ? (
            <span className="text-sm leading-none flex-shrink-0">
              {countryFlag(d.country)}
            </span>
          ) : null}
          <span className="text-xs font-semibold text-slate-100 truncate">
            {d.hostname || d.aws_service || d.org || d.ip}
          </span>
        </div>
        <span className="text-[10px] font-mono text-cyan-300 flex-shrink-0">
          {formatBytes(d.bytes)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500 truncate">
        {d.kind === "aws" ? (
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
            AWS · {d.aws_service ?? "?"}
          </span>
        ) : (
          <>
            <span className="font-mono">{d.asn || "?"}</span>
            <span className="truncate">{d.org || "—"}</span>
          </>
        )}
      </div>
      {d.signals && d.signals.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {d.signals.map((s) => {
            const meta = SIGNAL_META[s] ?? {
              label: s,
              tooltip: s,
              tone: "info" as const,
            }
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

// Decorative animated arrows behind the swimlane columns. Three
// horizontal flow lines spanning the grid so the eye reads
// "left → right movement." We don't try to draw N×M arrows per node —
// that's the system map's job (lines per actual edge). Here we just
// want the visual cue that data flows in one direction.
function FlowArrows({ color }: { color: string }) {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none z-0"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`flow-${color}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={color} stopOpacity="0.05" />
          <stop offset="50%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {[20, 50, 80].map((pct, i) => (
        <line
          key={i}
          x1="0%"
          y1={`${pct}%`}
          x2="100%"
          y2={`${pct}%`}
          stroke={`url(#flow-${color})`}
          strokeWidth="2"
          strokeDasharray="6 8"
          style={{
            animation: `egress-flow-${i} ${3 + i * 0.5}s linear infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes egress-flow-0 { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -28; } }
        @keyframes egress-flow-1 { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -28; } }
        @keyframes egress-flow-2 { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -28; } }
      `}</style>
    </svg>
  )
}

export default EgressFlowMap
