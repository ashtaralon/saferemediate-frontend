"use client"

/**
 * Egress Flow Map — Path-Flow-Map visual for outbound traffic.
 *
 * Reuses ConnectionLinesSVG + ServiceNodeBox from traffic-flow-map.tsx
 * so the visual is identical to the Attack Paths "Path Flow Map":
 * dark slate canvas, column-based swimlanes, animated curved SVG
 * arrows with cyan traffic dots, node cards with bytes/hits chips.
 *
 * Layout columns (mirrors path-flow):
 *   COMPUTE → SECURITY GROUPS → ROUTE (NAT/IGW/VPCE) → DESTINATION
 *
 * Data shape: we adapt the egress endpoint response into the
 * SystemArchitecture interface that ConnectionLinesSVG expects:
 *   - computeServices   ← workloads in the system with outbound flows
 *   - securityGroups    ← egress SG placeholder (not yet wired)
 *   - iamRoles slot     ← reused as the ROUTE column (NAT/IGW/VPCE
 *                          nodes), one card per gateway node referenced
 *                          by any destination's via_route_node_*
 *   - resources         ← destination IP/service chips
 *   - flows             ← (workload → route_node → destination) traffic
 *                          edges with bytes, ports, protocols
 *
 * Route nodes occupy the iamRoles slot because the existing
 * ConnectionLinesSVG draws compute → SG → role → resource paths;
 * by aliasing routes into the role column we get the same animated
 * traffic line story without rewriting the line-drawing primitives.
 */

import React, { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import {
  AlertTriangle,
  Cloud,
  Globe,
  Lock,
  Network,
  RefreshCw,
  Server,
  ShieldOff,
  Sparkles,
  Zap,
  Activity,
} from "lucide-react"
import {
  ConnectionLinesSVG,
  ServiceNodeBox,
  type ServiceNode,
  type SecurityCheckpoint,
  type SubnetNode,
  type SystemArchitecture,
  type TrafficFlow,
  type NodeType,
} from "./traffic-flow-map"

// ---- Backend response shape (api/egress_visibility.py) -----------------

interface EgressDestination {
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

interface EgressWorkload {
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
  top_destinations: EgressDestination[]
}

interface EgressResponse {
  system_name: string
  lookback_days: number
  workload_count: number
  total_destinations: number
  total_signaled_destinations: number
  workloads: EgressWorkload[]
}

// ---- Signal label/tone (UI vocabulary; never "Suspicious") ------------

const SIGNAL_META: Record<string, { label: string; tone: "warning" | "info" | "alert"; tooltip: string }> = {
  cross_region_aws: { label: "Cross-region AWS", tone: "info", tooltip: "Destination AWS region differs from workload region." },
  cross_cloud: { label: "Cross-cloud", tone: "info", tooltip: "Workload on AWS talking to a different cloud provider." },
  non_aws_public_from_private_subnet: { label: "Private→public IP", tone: "warning", tooltip: "Private-subnet workload reached a non-AWS public IP (likely via NAT)." },
  new_destination: { label: "New destination", tone: "alert", tooltip: "Destination first appeared <7 days ago." },
  plaintext: { label: "Plaintext channel", tone: "alert", tooltip: "Unencrypted port (HTTP/80, FTP/21, Telnet/23, IMAP/143, etc.). Credentials/data move in cleartext." },
  residential_isp: { label: "Residential ISP", tone: "alert", tooltip: "Destination ASN is on the residential consumer-ISP heuristic list." },
  rare_asn: { label: "Rare ASN", tone: "alert", tooltip: "Destination ASN reached by only one destination across this system's 30-day window." },
}

function signalToneClasses(tone: "warning" | "info" | "alert"): string {
  switch (tone) {
    case "alert": return "bg-rose-500/10 text-rose-300 border-rose-500/40"
    case "warning": return "bg-amber-500/10 text-amber-300 border-amber-500/40"
    default: return "bg-sky-500/10 text-sky-300 border-sky-500/40"
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

// ---- Adapter: egress response → SystemArchitecture ---------------------
// We model the route gateway (NAT/IGW/VPCE) as an "iamRole"-shaped node so
// ConnectionLinesSVG draws compute→route→destination flows the same way
// it draws compute→iamRole→resource paths in the Path Flow Map.
function buildArchitecture(data: EgressResponse | null): SystemArchitecture {
  if (!data) {
    return {
      computeServices: [],
      resources: [],
      subnets: [],
      securityGroups: [],
      nacls: [],
      iamRoles: [],
      flows: [],
      totalBytes: 0,
      totalConnections: 0,
      totalGaps: 0,
    }
  }

  const computeServices: ServiceNode[] = []
  const resources: ServiceNode[] = []
  const routeNodes = new Map<string, SecurityCheckpoint>()
  const flows: TrafficFlow[] = []

  for (const w of data.workloads || []) {
    const wid = w.workload.id
    const nodeType: NodeType = (w.workload.node_type || "").toLowerCase().includes("lambda")
      ? "lambda"
      : "compute"
    computeServices.push({
      id: wid,
      name: w.workload.name || wid,
      shortName: (w.workload.name || wid).slice(0, 22),
      type: nodeType,
    })

    for (const d of w.top_destinations || []) {
      // Skip internal/RFC1918 — those are intra-VPC peers, not exits.
      if (d.kind === "internal") continue

      const routeId = d.via_route_node_id || (d.kind === "aws" ? "aws-direct" : "no-route")
      const routeKind = d.via_route_node_kind || (d.kind === "aws" ? "AWSService" : "Unknown")
      const routeName = d.via_route_node_name || (d.kind === "aws" ? "AWS service endpoint" : "Unrouted")
      if (!routeNodes.has(routeId)) {
        routeNodes.set(routeId, {
          id: routeId,
          name: routeName,
          shortName: routeName.slice(0, 22),
          // SecurityCheckpoint expects these — type narrows visual
          // but ConnectionLinesSVG just uses the position. We pick
          // "iam_role" so the icon lookup works.
          type: "iam_role",
          // @ts-expect-error — extra metadata for our chip layer
          routeKind,
        })
      }

      const destId = d.ip
      const destType: NodeType = d.kind === "aws"
        ? (d.aws_service?.toLowerCase().includes("s3") ? "storage" : d.aws_service?.toLowerCase().includes("dynamo") ? "database" : "api_gateway")
        : "internet"
      resources.push({
        id: destId,
        name: d.hostname || d.aws_service || d.org || d.ip,
        shortName: (d.hostname || d.aws_service || d.org || d.ip).slice(0, 28),
        type: destType,
      })

      flows.push({
        sourceId: wid,
        targetId: destId,
        roleId: routeId, // ConnectionLinesSVG routes compute→role→resource via this
        ports: d.ports || [],
        protocol: (d.protocols || [])[0] || "tcp",
        bytes: d.bytes,
        connections: d.hits,
        isActive: d.bytes > 0,
      })
    }
  }

  return {
    computeServices,
    resources,
    subnets: [],
    securityGroups: [],
    nacls: [],
    iamRoles: Array.from(routeNodes.values()),
    flows,
    totalBytes: data.workloads.reduce((sum, w) => sum + (w.totals?.total_bytes || 0), 0),
    totalConnections: data.workloads.reduce((sum, w) => sum + (w.totals?.total_hits || 0), 0),
    totalGaps: 0,
  }
}

// ---- Route icon for the gateway card ----------------------------------

function routeKindIcon(kind: string | null) {
  switch (kind) {
    case "InternetGateway": return <Globe className="w-4 h-4 text-amber-400" />
    case "NATGateway": return <Network className="w-4 h-4 text-blue-400" />
    case "VPCEndpoint": return <Lock className="w-4 h-4 text-emerald-400" />
    case "TransitGateway": return <Activity className="w-4 h-4 text-violet-400" />
    case "EgressOnlyInternetGateway": return <Globe className="w-4 h-4 text-orange-400" />
    case "AWSService": return <Cloud className="w-4 h-4 text-emerald-400" />
    default: return <ShieldOff className="w-4 h-4 text-slate-500" />
  }
}

// ---- Component --------------------------------------------------------

export function EgressFlowMap({ systemName }: { systemName: string }) {
  const [data, setData] = useState<EgressResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [animate, setAnimate] = useState(true)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [signalFilter, setSignalFilter] = useState<string | null>(null)

  const fetchData = (force = false) => {
    setLoading(true)
    setError(null)
    fetch(
      `/api/proxy/egress/system/${encodeURIComponent(systemName)}?days=30&top_n=20${force ? `&_=${Date.now()}` : ""}`,
      { cache: "no-store" },
    )
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error(j.error || `HTTP ${r.status}`)
        }
        return r.json()
      })
      .then((j) => setData(j))
      .catch((e: any) => setError(e?.message ?? "Failed to load egress data"))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!systemName) return
    fetchData(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemName])

  const architecture = useMemo(() => buildArchitecture(data), [data])

  // Bucket destinations by their route's kind so the operator can read
  // PUBLIC (IGW/NAT/EIGW) vs PRIVATE (VPCE/TGW) at a glance.
  const routeBucket = (kind: string | null): "public" | "private" | "other" => {
    if (!kind) return "other"
    if (["InternetGateway", "NATGateway", "EgressOnlyInternetGateway"].includes(kind)) return "public"
    if (["VPCEndpoint", "TransitGateway"].includes(kind)) return "private"
    return "other"
  }

  // Filter chips strip — aggregate signal counts across all destinations.
  const signalCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    if (!data) return counts
    for (const w of data.workloads || []) {
      for (const d of w.top_destinations || []) {
        for (const s of d.signals || []) counts[s] = (counts[s] || 0) + 1
      }
    }
    return counts
  }, [data])

  // Destinations matching the active signal filter (used to dim the rest
  // in the destination column — same UX as the heatmap mode in the path
  // flow map).
  const filteredFlowSet = useMemo(() => {
    if (!signalFilter || !data) return null
    const set = new Set<string>()
    for (const w of data.workloads || []) {
      for (const d of w.top_destinations || []) {
        if ((d.signals || []).includes(signalFilter)) {
          set.add(`${w.workload.id}→${d.ip}`)
        }
      }
    }
    return set
  }, [data, signalFilter])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[500px] rounded-xl bg-slate-900 border border-slate-800">
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
        <button onClick={() => fetchData(true)} className="mt-3 px-3 py-1.5 rounded bg-rose-500/20 text-rose-300 text-xs font-semibold hover:bg-rose-500/30">
          Retry
        </button>
      </div>
    )
  }

  if (!data || !data.workloads || data.workloads.length === 0) {
    return (
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-8 text-center">
        <Globe className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-300 text-sm font-medium mb-1">No outbound traffic observed</p>
        <p className="text-slate-500 text-xs">
          No workloads in <span className="font-mono">{systemName}</span> have outbound flows in the 30-day VPC Flow Log window.
        </p>
      </div>
    )
  }

  // Group destinations into PUBLIC (IGW/NAT) and PRIVATE (VPCE/TGW)
  // for the swimlane headers, but render in ONE shared column grid so
  // ConnectionLinesSVG can draw curved arrows across the whole canvas.
  const publicCount = architecture.iamRoles.filter((r: any) => routeBucket(r.routeKind) === "public").length
  const privateCount = architecture.iamRoles.filter((r: any) => routeBucket(r.routeKind) === "private").length
  const totalSignals = Object.values(signalCounts).reduce((a, b) => a + b, 0)
  const visibleSignalCount = signalFilter ? (signalCounts[signalFilter] || 0) : totalSignals

  return (
    <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
      {/* Controls bar — matches Path Flow Map header */}
      <div className="px-5 py-3 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-cyan-500/15 rounded-xl flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">Egress Flow Map</h3>
            <p className="text-slate-400 text-[10px]">
              {systemName} · {data.workload_count} workloads · 30-day VPC Flow Logs
            </p>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/15 rounded-full ml-3">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-semibold text-emerald-400">LIVE</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAnimate((a) => !a)}
            className={`px-2.5 py-1 rounded text-[10px] font-semibold ${animate ? "bg-cyan-500/20 text-cyan-300" : "bg-slate-800 text-slate-400"}`}
          >
            {animate ? "Pause" : "Animate"}
          </button>
          <button
            onClick={() => fetchData(true)}
            className="px-2.5 py-1 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="px-5 py-2.5 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-amber-400 font-bold text-base">{publicCount}</div>
            <div className="text-[9px] text-slate-500 uppercase tracking-wider">Public gateways</div>
          </div>
          <div className="w-px h-6 bg-slate-800" />
          <div className="text-center">
            <div className="text-emerald-400 font-bold text-base">{privateCount}</div>
            <div className="text-[9px] text-slate-500 uppercase tracking-wider">Private endpoints</div>
          </div>
          <div className="w-px h-6 bg-slate-800" />
          <div className="text-center">
            <div className="text-cyan-400 font-bold text-base">{formatBytes(architecture.totalBytes)}</div>
            <div className="text-[9px] text-slate-500 uppercase tracking-wider">30d traffic</div>
          </div>
          <div className="w-px h-6 bg-slate-800" />
          <div className="text-center">
            <div className="text-rose-300 font-bold text-base">
              {signalFilter ? `${visibleSignalCount} of ${totalSignals}` : totalSignals}
            </div>
            <div className="text-[9px] text-slate-500 uppercase tracking-wider">Signals</div>
          </div>
        </div>
        {/* Filter chips */}
        {Object.keys(signalCounts).length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-slate-500 uppercase tracking-wider mr-1">Filter</span>
            {Object.entries(signalCounts).sort((a, b) => b[1] - a[1]).map(([code, count]) => {
              const meta = SIGNAL_META[code] || { label: code, tone: "info" as const, tooltip: code }
              const active = signalFilter === code
              return (
                <button
                  key={code}
                  onClick={() => setSignalFilter(active ? null : code)}
                  title={meta.tooltip}
                  className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${active ? "bg-white text-slate-900 border-white" : signalToneClasses(meta.tone)}`}
                >
                  {meta.label} · {count}
                </button>
              )
            })}
            {signalFilter && (
              <button onClick={() => setSignalFilter(null)} className="px-2 py-0.5 rounded border text-[10px] font-semibold bg-slate-800 text-slate-300 border-slate-700">
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Canvas — relative container that ConnectionLinesSVG draws over */}
      <div className="relative px-5 py-6 min-h-[500px]" ref={containerRef}>
        {/* Dot grid background */}
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, #1e293b 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />

        {/* Animated connection lines — same primitive as Path Flow Map */}
        <ConnectionLinesSVG
          architecture={architecture}
          hoveredId={hoveredId}
          containerRef={containerRef as React.RefObject<HTMLDivElement>}
          animate={animate}
          heatmapMode={!!signalFilter}
          ghostedNodeIds={
            signalFilter && filteredFlowSet
              ? new Set(
                  // Ghost destinations NOT matching the filter
                  architecture.resources
                    .filter((d) => {
                      // a destination is matching if ANY flow targeting it is in the filter set
                      const hasMatch = architecture.flows.some(
                        (f) => f.targetId === d.id && filteredFlowSet.has(`${f.sourceId}→${f.targetId}`),
                      )
                      return !hasMatch
                    })
                    .map((d) => d.id),
                )
              : new Set<string>()
          }
        />

        {/* 4-column grid: COMPUTE | EGRESS SG (not-wired) | ROUTE | DESTINATION */}
        <div className="relative grid grid-cols-[1fr_140px_180px_1.5fr] gap-6 items-start" style={{ zIndex: 2 }}>
          {/* COMPUTE */}
          <div className="flex flex-col gap-2.5">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Server className="w-3 h-3 text-blue-400" />
              Compute ({architecture.computeServices.length})
            </div>
            {architecture.computeServices.map((node) => (
              <div key={node.id} data-compute-id={node.id}>
                <ServiceNodeBox
                  node={node}
                  position="left"
                  isHighlighted={hoveredId === node.id}
                  onHover={setHoveredId}
                  onClick={() => {}}
                />
              </div>
            ))}
          </div>

          {/* EGRESS SG — honest "not wired" placeholder */}
          <div className="flex flex-col gap-2.5">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-orange-400" />
              SG egress (0)
            </div>
            <div className="rounded-lg border-2 border-dashed border-slate-700/60 bg-slate-900/40 px-2.5 py-3 text-center">
              <ShieldOff className="w-4 h-4 text-slate-600 mx-auto mb-1" />
              <div className="text-[9px] text-slate-500 uppercase tracking-wider">Not wired</div>
              <div className="text-[9px] text-slate-600 mt-1 leading-relaxed">
                Per-flow SG attribution lands when System Map's egress-SG query folds into /egress/system.
              </div>
            </div>
          </div>

          {/* ROUTE — gateway cards (NAT/IGW/VPCE/TGW) */}
          <div className="flex flex-col gap-2.5">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Network className="w-3 h-3 text-violet-400" />
              Route ({architecture.iamRoles.length})
            </div>
            {architecture.iamRoles.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-slate-700/60 bg-slate-900/40 px-2.5 py-3 text-center">
                <ShieldOff className="w-4 h-4 text-slate-600 mx-auto mb-1" />
                <div className="text-[9px] text-slate-500 uppercase tracking-wider">No route data</div>
              </div>
            ) : (
              architecture.iamRoles.map((route: any) => {
                const bucket = routeBucket(route.routeKind)
                const tone = bucket === "public" ? "border-amber-500/40 bg-amber-500/5" : bucket === "private" ? "border-emerald-500/40 bg-emerald-500/5" : "border-slate-700 bg-slate-900/40"
                return (
                  <div
                    key={route.id}
                    data-role-id={route.id}
                    className={`rounded-lg border ${tone} px-3 py-2 hover:bg-slate-800/40 transition-colors cursor-pointer`}
                    onMouseEnter={() => setHoveredId(route.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <div className="flex items-center gap-1.5">
                      {routeKindIcon(route.routeKind)}
                      <span className="text-[11px] font-semibold text-slate-100 truncate flex-1">{route.shortName}</span>
                    </div>
                    <div className="text-[9px] text-slate-500 mt-0.5">{route.routeKind}</div>
                  </div>
                )
              })
            )}
          </div>

          {/* DESTINATION — destination chips, sorted by bytes */}
          <div className="flex flex-col gap-2">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Globe className="w-3 h-3 text-cyan-400" />
              Destination ({architecture.resources.length})
            </div>
            {architecture.resources.slice(0, 30).map((dest, i) => {
              const flow = architecture.flows.find((f) => f.targetId === dest.id)
              const wlSignals = data.workloads
                .find((w) => w.workload.id === flow?.sourceId)
                ?.top_destinations.find((d) => d.ip === dest.id)?.signals || []
              const isAlert = wlSignals.some((s) => ["plaintext", "residential_isp", "rare_asn"].includes(s))
              const isNew = wlSignals.includes("new_destination")
              const fullDest = data.workloads
                .flatMap((w) => w.top_destinations)
                .find((d) => d.ip === dest.id)
              return (
                <div
                  key={dest.id + i}
                  data-resource-id={dest.id}
                  className={`rounded-lg border px-3 py-2 ${isAlert ? "border-rose-500/40 bg-rose-500/5" : isNew ? "border-amber-500/40 bg-amber-500/5" : dest.type === "internet" ? "border-slate-700 bg-slate-900/60" : "border-emerald-500/30 bg-emerald-500/5"}`}
                  onMouseEnter={() => setHoveredId(dest.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {fullDest?.country ? <span className="text-sm leading-none">{countryFlag(fullDest.country)}</span> : null}
                      <span className="text-[11px] font-semibold text-slate-100 truncate">{dest.shortName}</span>
                    </div>
                    {flow ? (
                      <span className="text-[9px] font-mono text-cyan-400 flex-shrink-0">{formatBytes(flow.bytes)}</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-slate-500">
                    {fullDest?.kind === "aws" ? (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                        AWS · {fullDest.aws_service ?? "?"}
                      </span>
                    ) : (
                      <>
                        <span className="font-mono">{fullDest?.asn || "?"}</span>
                        <span className="truncate">{fullDest?.org || "—"}</span>
                      </>
                    )}
                  </div>
                  {wlSignals.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {wlSignals.map((s) => {
                        const meta = SIGNAL_META[s] || { label: s, tone: "info" as const, tooltip: s }
                        return (
                          <span key={s} title={meta.tooltip} className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold ${signalToneClasses(meta.tone)}`}>
                            {meta.label}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
            {architecture.resources.length > 30 && (
              <div className="text-[10px] text-slate-500 pl-2 italic">+ {architecture.resources.length - 30} more</div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center gap-4 text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><Server className="w-3 h-3 text-blue-400" />Compute</span>
          <span className="flex items-center gap-1"><Network className="w-3 h-3 text-violet-400" />Route</span>
          <span className="flex items-center gap-1"><Globe className="w-3 h-3 text-amber-400" />IGW</span>
          <span className="flex items-center gap-1"><Network className="w-3 h-3 text-blue-400" />NAT</span>
          <span className="flex items-center gap-1"><Lock className="w-3 h-3 text-emerald-400" />VPC Endpoint</span>
          <span className="flex items-center gap-1"><Cloud className="w-3 h-3 text-emerald-400" />AWS Service</span>
          <span className="flex items-center gap-1"><Globe className="w-3 h-3 text-slate-400" />Internet</span>
          <span className="flex items-center gap-1 ml-auto">
            <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
            Live traffic
          </span>
          <span className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-rose-400" />
            Has channel signal
          </span>
        </div>
      </div>
    </div>
  )
}

export default EgressFlowMap
