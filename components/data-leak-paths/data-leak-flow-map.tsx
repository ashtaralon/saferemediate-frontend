"use client"

// Data Leak Flow Map — egress visualization rendered in the Attack
// Paths node-card aesthetic. Per operator: "use the same design
// pattern as the attack paths flow map, only design — not copy the
// services or the traffic direction".
//
// Layout: two horizontal rows that share the workload column on the
// left. Network plane (egress) on top; access plane (read context)
// underneath. Animated SVG dashed curves between adjacent nodes,
// per-edge labels for bytes/hits when real telemetry is present.
//
//   COMPUTE     NETWORK PLANE
//     │         workload ──→ subnet ──→ SG ──→ NACL ──→ gateway ──→ destinations
//     │
//     └──→      ACCESS PLANE (context)
//               workload ──→ identity ──→ data store ──→ observed actions
//
// Node cards copy the ServiceNodeBox visual style from Attack Paths:
// rounded-xl border-2, icon in a colored rounded square, name + tiny
// subtitle. Card tones follow the same per-type color palette
// (compute=blue, security_group=orange, etc.) so the two pages read
// as the same design system.
//
// Per feedback_no_mock_numbers_in_ui: real counts only — zero is
// shown honestly. Per feedback_signal_language: never "suspicious".

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Activity,
  AlertTriangle,
  Database,
  Globe,
  HardDrive,
  Key,
  Lock,
  Network,
  Server,
  Shield,
  Zap,
  type LucideIcon,
} from "lucide-react"
import type {
  DataLeakBucket,
  DataLeakInternetDestinations,
  DataLeakPath,
} from "@/lib/types"

interface Props {
  path: DataLeakPath
}

export function DataLeakFlowMap({ path }: Props) {
  const observed = path.dataPlane.observedApiCalls
  const dests = path.networkPlane.internetDestinations

  const networkLane = networkLaneNodes(path, dests)
  const accessLane = accessLaneNodes(path, observed)

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/95 overflow-hidden">
      <Header path={path} observed={observed} dests={dests} />
      <div className="px-6 py-6 space-y-8">
        <LaneRow label="Network plane · exfil channel" accent="amber" icon={Network} lane={networkLane} />
        <LaneRow label="Access plane · what data is reachable" accent="violet" icon={Lock} lane={accessLane} />
        <Legend bucket={path.workload.bucket} />
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Header (matches the TrafficFlowMap inner header — same Cloud icon, LIVE
// pill, Events / Destinations metrics on the right)
// ---------------------------------------------------------------------------

function Header({
  path,
  observed,
  dests,
}: {
  path: DataLeakPath
  observed: DataLeakPath["dataPlane"]["observedApiCalls"]
  dests: DataLeakInternetDestinations
}) {
  const events =
    observed._state === "wired" && typeof observed.totalEvents === "number"
      ? observed.totalEvents.toLocaleString()
      : "—"
  const destinations = dests._state === "wired" ? String(dests.totalDistinct) : "—"
  return (
    <div className="px-6 py-4 border-b border-slate-700 flex items-center gap-3 flex-wrap">
      <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
        <Activity className="w-5 h-5 text-emerald-400" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-bold text-white truncate">Egress flow map</h3>
        <p className="text-xs text-slate-400 truncate font-mono">{path.pathId}</p>
      </div>
      <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15">
        <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
        <span className="text-xs font-bold text-emerald-300 tracking-wider">LIVE</span>
      </span>
      <div className="flex items-center divide-x divide-slate-700 ml-1">
        <Metric label="Access events" value={events} accent="emerald" />
        <Metric label="Destinations" value={destinations} accent={dests.totalDistinct > 0 ? "amber" : "slate"} />
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: "emerald" | "amber" | "slate"
}) {
  const cls =
    accent === "emerald" ? "text-emerald-300" : accent === "amber" ? "text-amber-300" : "text-slate-400"
  return (
    <div className="px-4 text-center">
      <div className={`text-base font-bold ${cls}`}>{value}</div>
      <div className="text-[9px] text-slate-500 uppercase tracking-wider">{label}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lane row — a horizontal sequence of NodeCards with animated SVG curves
// drawn over a position:relative wrapper. Per-edge labels carry
// bytes/hits when present (matches Attack Paths' floating edge labels).
// ---------------------------------------------------------------------------

type LaneAccent = "amber" | "violet"

interface LaneNode {
  id: string
  type: NodeKind
  primary: string | null
  secondary?: string | null
  subline?: string | null   // optional tertiary line (e.g. "0.0.0.0/0 egress")
  badge?: string | null     // optional small badge in the corner
  empty?: boolean           // placeholder card (no real node — ghost styling)
  edgeLabelToNext?: string | null // text printed on the curve to the NEXT node
}

interface Lane {
  nodes: LaneNode[]
  trailer?: { label: string; sublabel?: string } // shown right of the last node when nodes is non-empty
  emptyMessage?: string // shown right of last node when there are no nodes after the workload
}

function LaneRow({
  label,
  accent,
  icon: Icon,
  lane,
}: {
  label: string
  accent: LaneAccent
  icon: LucideIcon
  lane: Lane
}) {
  const accentText = accent === "amber" ? "text-amber-300" : "text-violet-300"
  const accentBg =
    accent === "amber" ? "bg-amber-500/10 border-amber-500/30" : "bg-violet-500/10 border-violet-500/30"
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-[0.14em] border ${accentBg} ${accentText}`}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </span>
      </div>
      <FlowSequence nodes={lane.nodes} emptyMessage={lane.emptyMessage} accent={accent} />
    </div>
  )
}

function FlowSequence({
  nodes,
  emptyMessage,
  accent,
}: {
  nodes: LaneNode[]
  emptyMessage?: string
  accent: LaneAccent
}) {
  // Strokes match the lane accent so the two rows read clearly.
  const stroke = accent === "amber" ? "rgb(252, 211, 77)" : "rgb(196, 181, 253)" // amber-300 / violet-300

  // Refs for each node card so we can compute the SVG curve endpoints.
  // Re-runs on resize via a ResizeObserver mounted on the container.
  const containerRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const [edges, setEdges] = useState<
    Array<{ x1: number; y1: number; x2: number; y2: number; label?: string | null }>
  >([])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const recompute = () => {
      const containerRect = container.getBoundingClientRect()
      const out: typeof edges = []
      for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodeRefs.current.get(nodes[i].id)
        const b = nodeRefs.current.get(nodes[i + 1].id)
        if (!a || !b) continue
        const ar = a.getBoundingClientRect()
        const br = b.getBoundingClientRect()
        out.push({
          x1: ar.right - containerRect.left,
          y1: ar.top + ar.height / 2 - containerRect.top,
          x2: br.left - containerRect.left,
          y2: br.top + br.height / 2 - containerRect.top,
          label: nodes[i].edgeLabelToNext,
        })
      }
      setEdges(out)
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(container)
    window.addEventListener("resize", recompute)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", recompute)
    }
  }, [nodes])

  if (nodes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700 bg-slate-800/40 p-6 text-center">
        <div className="text-sm text-slate-300 font-medium mb-1">{emptyMessage || "No data"}</div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative flex items-stretch gap-6 overflow-x-auto pb-2">
      {/* Animated dashed curves between nodes */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 0 }}
      >
        {edges.map((e, i) => {
          // Cubic-bezier with vertical-aligned control points → smooth horizontal flow
          const dx = (e.x2 - e.x1) * 0.5
          const d = `M ${e.x1},${e.y1} C ${e.x1 + dx},${e.y1} ${e.x2 - dx},${e.y2} ${e.x2},${e.y2}`
          return (
            <g key={i}>
              <path
                d={d}
                stroke={stroke}
                strokeWidth={2}
                strokeOpacity={0.55}
                strokeDasharray="6 4"
                fill="none"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="0"
                  to="-20"
                  dur="1.4s"
                  repeatCount="indefinite"
                />
              </path>
              {e.label && (
                <g>
                  <rect
                    x={(e.x1 + e.x2) / 2 - 28}
                    y={(e.y1 + e.y2) / 2 - 9}
                    width={56}
                    height={18}
                    rx={4}
                    fill="rgb(15, 23, 42)"
                    stroke={stroke}
                    strokeOpacity={0.5}
                  />
                  <text
                    x={(e.x1 + e.x2) / 2}
                    y={(e.y1 + e.y2) / 2 + 4}
                    textAnchor="middle"
                    fontSize={10}
                    fill={stroke}
                    fontFamily="ui-monospace, SFMono-Regular, monospace"
                  >
                    {e.label}
                  </text>
                </g>
              )}
            </g>
          )
        })}
      </svg>

      {nodes.map((n) => (
        <div
          key={n.id}
          ref={(el) => {
            nodeRefs.current.set(n.id, el)
          }}
          className="shrink-0 self-center"
          style={{ zIndex: 1 }}
        >
          <NodeCard node={n} />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Node card — visual style copied from ServiceNodeBox in
// components/dependency-map/traffic-flow-map.tsx so both pages share
// the same design system.
// ---------------------------------------------------------------------------

type NodeKind =
  | "workload"
  | "subnet"
  | "security_group"
  | "nacl"
  | "gateway"
  | "destination_aws"
  | "destination_external"
  | "destination_empty"
  | "identity"
  | "data_store"
  | "actions"
  | "actions_empty"

interface NodeConfig {
  icon: LucideIcon
  color: string
  bg: string
  border: string
  text: string
}

const NODE_KIND_CONFIG: Record<NodeKind, NodeConfig> = {
  workload:             { icon: Server,    color: "text-blue-400",    bg: "bg-blue-500/20",    border: "border-blue-500/50",    text: "Workload"        },
  subnet:               { icon: Globe,     color: "text-cyan-400",    bg: "bg-cyan-500/20",    border: "border-cyan-500/50",    text: "Subnet"          },
  security_group:       { icon: Shield,    color: "text-orange-400",  bg: "bg-orange-500/20",  border: "border-orange-500/50",  text: "Security group"  },
  nacl:                 { icon: Lock,      color: "text-purple-400",  bg: "bg-purple-500/20",  border: "border-purple-500/50",  text: "Network ACL"     },
  gateway:              { icon: Network,   color: "text-amber-400",   bg: "bg-amber-500/20",   border: "border-amber-500/50",   text: "Gateway"         },
  destination_aws:      { icon: HardDrive, color: "text-blue-300",    bg: "bg-blue-500/15",    border: "border-blue-500/40",    text: "Managed cloud"   },
  destination_external: { icon: Globe,     color: "text-rose-300",    bg: "bg-rose-500/15",    border: "border-rose-500/40",    text: "External"        },
  destination_empty:    { icon: Globe,     color: "text-slate-400",   bg: "bg-slate-500/15",   border: "border-slate-600",      text: "No traffic"      },
  identity:             { icon: Key,       color: "text-yellow-300",  bg: "bg-yellow-500/15",  border: "border-yellow-500/40",  text: "Workload identity"},
  data_store:           { icon: Database,  color: "text-emerald-400", bg: "bg-emerald-500/20", border: "border-emerald-500/50", text: "Data store"      },
  actions:              { icon: Zap,       color: "text-violet-300",  bg: "bg-violet-500/15",  border: "border-violet-500/40",  text: "Observed actions"},
  actions_empty:        { icon: Zap,       color: "text-slate-400",   bg: "bg-slate-500/15",   border: "border-slate-600",      text: "No actions"      },
}

function NodeCard({ node }: { node: LaneNode }) {
  const cfg = NODE_KIND_CONFIG[node.type]
  const Icon = cfg.icon
  const isEmpty = node.empty
  const cardCls = isEmpty
    ? "bg-slate-800/40 border-2 border-dashed border-slate-600 opacity-80"
    : `bg-slate-800/60 border-2 ${cfg.border}`
  return (
    <div
      className={`relative flex items-center gap-3 px-4 py-3 rounded-xl ${cardCls} min-w-[200px] max-w-[260px]`}
    >
      <div
        className={`w-11 h-11 rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0`}
      >
        <Icon className={`w-5 h-5 ${cfg.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-white truncate" title={node.primary || ""}>
          {node.primary || <span className="text-slate-500 italic font-normal">—</span>}
        </div>
        {node.secondary && (
          <div className="text-[10px] text-slate-400 truncate font-mono" title={node.secondary}>
            {node.secondary}
          </div>
        )}
        {node.subline && (
          <div className={`text-[10px] ${cfg.color} uppercase tracking-wider mt-0.5`}>
            {node.subline}
          </div>
        )}
      </div>
      {node.badge && (
        <span className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-900 border border-slate-600 text-slate-300 font-mono">
          {node.badge}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lane composers — DataLeakPath → LaneNode[]
// ---------------------------------------------------------------------------

function networkLaneNodes(path: DataLeakPath, dests: DataLeakInternetDestinations): Lane {
  const w = path.workload
  const gate = path.networkPlane.egressGate
  const trafficLabel = totalTrafficLabel(dests)

  const baseNodes: LaneNode[] = [
    {
      id: `${w.id}-net`,
      type: "workload",
      primary: w.name,
      secondary: w.id,
      subline: w.type,
    },
    {
      id: w.subnet.id || "subnet",
      type: "subnet",
      primary: w.subnet.name || w.subnet.id || "—",
      secondary: w.subnet.id || null,
      subline:
        w.subnet.isPublic === true
          ? "Public"
          : w.subnet.isPublic === false
            ? "Private"
            : "Unknown",
    },
    {
      id: w.securityGroup.id || "sg",
      type: "security_group",
      primary: w.securityGroup.name || w.securityGroup.id || "—",
      secondary: w.securityGroup.id || null,
      subline: w.securityGroup.hasPublicEgress ? "0.0.0.0/0 egress" : "Narrow egress",
      badge:
        w.securityGroup.additionalCount && w.securityGroup.additionalCount > 0
          ? `+${w.securityGroup.additionalCount}`
          : null,
    },
    {
      id: w.nacl?.id || "nacl",
      type: "nacl",
      primary: w.nacl?.id || "default",
      secondary: w.nacl?.isDefault ? "Default rules" : null,
    },
    {
      id: gate?.id || "gate",
      type: "gateway",
      primary: gate ? humanGateKind(gate.kind) : "No route",
      secondary: gate?.id || w.routeTable.id || null,
      subline: gate?.cidr === "0.0.0.0/0" ? "0.0.0.0/0 route" : null,
      edgeLabelToNext: trafficLabel,
    },
  ]

  // Destinations: real nodes if observed, otherwise a single ghost card.
  if (dests._state === "wired" && dests.topDestinations.length > 0) {
    dests.topDestinations.slice(0, 5).forEach((d, i) => {
      const idBase = d.ip || `dest-${i}`
      baseNodes.push({
        id: `dest:${idBase}:${i}`,
        type: d.kind === "external" ? "destination_external" : "destination_aws",
        primary: d.service ? humanService(d.service) : d.org || d.ip || "Destination",
        secondary: d.ip || null,
        subline: d.hits ? `${formatCount(d.hits)} hits` : null,
        badge: d.signals && d.signals.length > 0 ? "signal" : null,
      })
    })
  } else if (dests._state === "not_wired") {
    baseNodes.push({
      id: "dest-not-wired",
      type: "destination_empty",
      primary: "Not yet computed",
      secondary: "Egress tracking not enabled",
      empty: true,
    })
  } else {
    baseNodes.push({
      id: "dest-zero",
      type: "destination_empty",
      primary: "No traffic observed",
      secondary: `0 destinations in last ${path.networkPlane.bucket === "LATENT_EXPOSURE" ? "30 days" : "window"}`,
      subline: "Path is open · unused",
      empty: true,
    })
  }
  return { nodes: baseNodes }
}

function accessLaneNodes(
  path: DataLeakPath,
  observed: DataLeakPath["dataPlane"]["observedApiCalls"],
): Lane {
  const w = path.workload
  const store = path.dataStore
  const role = w.iamRole
  const eventsLabel = accessEventsLabel(observed)

  const baseNodes: LaneNode[] = [
    {
      id: `${w.id}-acc`,
      type: "workload",
      primary: w.name,
      secondary: w.id,
      subline: w.type,
    },
    {
      id: role.id || "role",
      type: "identity",
      primary: role.name || "—",
      secondary: role.id ? truncateArn(role.id) : null,
    },
    {
      id: store.id,
      type: "data_store",
      primary: store.name,
      secondary: store.id,
      subline: store.crownJewelClass,
      edgeLabelToNext: eventsLabel,
    },
  ]

  if (observed._state === "wired" && observed.actions && observed.actions.length > 0) {
    const top = observed.actions.slice(0, 3).join(", ")
    const extra = observed.actions.length > 3 ? ` +${observed.actions.length - 3}` : ""
    baseNodes.push({
      id: "actions",
      type: "actions",
      primary: top + extra,
      secondary: observed.totalEvents
        ? `${observed.totalEvents.toLocaleString()} events`
        : null,
      subline: observed.lastSeen
        ? `Last seen ${new Date(observed.lastSeen).toLocaleDateString()}`
        : null,
    })
  } else {
    baseNodes.push({
      id: "actions-empty",
      type: "actions_empty",
      primary: observed._state === "not_wired" ? "Not yet computed" : "No actions in window",
      empty: true,
    })
  }
  return { nodes: baseNodes }
}

function totalTrafficLabel(dests: DataLeakInternetDestinations): string | null {
  if (dests._state !== "wired" || dests.totalDistinct === 0) return null
  const bytes = dests.topDestinations.reduce((s, d) => s + (d.bytes ?? 0), 0)
  if (bytes > 0) return formatBytes(bytes)
  const hits = dests.topDestinations.reduce((s, d) => s + (d.hits ?? 0), 0)
  return hits > 0 ? `${formatCount(hits)} hits` : null
}

function accessEventsLabel(
  observed: DataLeakPath["dataPlane"]["observedApiCalls"],
): string | null {
  if (observed._state !== "wired") return null
  const events = observed.totalEvents ?? 0
  if (events === 0) return null
  return `${formatCount(events)} events`
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function Legend({ bucket }: { bucket: DataLeakBucket }) {
  return (
    <div className="border-t border-slate-700 pt-3 text-[11px] text-slate-400 leading-relaxed">
      <span className="text-slate-300 font-semibold">Why this is a leak path:</span>{" "}
      the workload has both an open <span className="text-amber-300">egress channel</span> AND read
      access to the data store via <span className="text-violet-300">workload identity</span>.
      {bucket === "ACTIVE_INTERNET" && (
        <>
          {" "}
          <span className="text-rose-300">
            External destinations observed in the last 30 days — see the right-most lane.
          </span>
        </>
      )}
      {bucket === "AWS_REDIRECTABLE" && (
        <>
          {" "}
          <span className="text-amber-300">
            Traffic to managed-cloud services flows over the public route — each destination could
            be redirected onto a private bridge.
          </span>
        </>
      )}
      {bucket === "LATENT_EXPOSURE" && (
        <>
          {" "}
          <span className="text-amber-300">
            No traffic observed in the window — the egress channel is open and the workload could
            phone home at any time.
          </span>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function humanGateKind(kind: string): string {
  if (kind === "InternetGateway") return "Internet gateway"
  if (kind === "NATGateway") return "NAT gateway"
  if (kind === "EgressOnlyInternetGateway") return "Egress-only gateway"
  if (kind === "VPCEndpoint") return "Private network bridge"
  return kind || "Gateway"
}

function humanService(svc: string): string {
  const map: Record<string, string> = {
    s3: "Object storage",
    dynamodb: "Key-value store",
    kms: "Key management",
    ec2: "Compute control plane",
    ssm: "Systems management",
    sts: "Identity broker",
    secretsmanager: "Secret store",
    rds: "Managed database",
    lambda: "Function runtime",
    cloudwatch: "Telemetry",
    logs: "Log ingestion",
    sqs: "Message queue",
    sns: "Pub/sub",
  }
  return map[svc.toLowerCase()] || svc
}

function truncateArn(arn: string): string {
  if (arn.length <= 36) return arn
  return "…" + arn.slice(-35)
}

function formatBytes(n: number): string {
  if (!n) return "0 B"
  if (n < 1024) return `${n} B`
  const units = ["KB", "MB", "GB", "TB"]
  let v = n / 1024
  let u = 0
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024
    u++
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[u]}`
}

function formatCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K`
  return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
}
