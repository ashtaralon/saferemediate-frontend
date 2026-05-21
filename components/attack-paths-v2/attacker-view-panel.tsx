"use client"

// Attacker View — Slice 9 of Attack Paths v2.
//
// Renders the path as the attacker sees it: each hop is a card with
// the actual Neo4j labels + key properties, the explicit edge to the
// next hop, and BELOW each card the lateral edges grouped by their
// attacker-relevance class (escalation / data / identity / network /
// forensic / misc). No column-fill abstraction, no synthesized lanes.
//
// The data source is the new /api/attack-chain/graph-view endpoint
// which returns whatever Neo4j actually holds — no transformation,
// no inference, no lane-completeness rules. If the graph has an
// IAMPolicy attached to the role, it appears. If the role assumes
// another role, that appears. If the role accesses a second crown
// jewel, that appears with its observed hit count.
//
// Per feedback_no_mock_numbers_in_ui + the 2026-05-22 credibility
// audit. This is the architectural pivot: render the explicit graph
// hops, not pattern-fill predefined columns.

import { useEffect, useMemo, useState } from "react"
import {
  Crown,
  Server,
  Zap,
  Box,
  Key,
  FileText,
  ShieldAlert,
  Database,
  Network,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Layers,
  AlertOctagon,
  AlertTriangle,
  Eye,
  Lock,
  Globe,
  ExternalLink,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import type {
  IdentityAttackPath,
  CrownJewelSummary,
} from "@/components/identity-attack-paths/types"

interface AttackerViewPanelProps {
  path: IdentityAttackPath
  jewel: CrownJewelSummary | null
  systemName: string
}

interface GraphViewResponse {
  system_name: string
  node_count: number
  nodes: GraphViewNode[]
  laterals_by_node: Record<string, GraphViewEdge[]>
  generated_at: string
}

interface GraphViewNode {
  id: string
  name: string | null
  labels: string[]
  type: string
  key_properties: Record<string, any>
}

interface GraphViewEdge {
  direction: "in" | "out"
  type: string
  neighbor_id: string
  neighbor_arn: string | null
  neighbor_name: string | null
  neighbor_labels: string[]
  neighbor_type: string
  observed: boolean | null
  bytes: number | null
  hit_count: number | null
  port: number | null
  protocol: string | null
  first_seen: string | null
  last_seen: string | null
  on_path: boolean
  significance:
    | "escalation"
    | "data"
    | "identity"
    | "network"
    | "forensic"
    | "control"
    | "misc"
}

// Significance ordering for sorting laterals — highest attacker
// relevance first.
const SIG_ORDER: Record<GraphViewEdge["significance"], number> = {
  escalation: 0,
  data: 1,
  control: 2,
  identity: 3,
  forensic: 4,
  network: 5,
  misc: 6,
}

const SIG_META: Record<
  GraphViewEdge["significance"],
  { label: string; tone: string; icon: any }
> = {
  escalation: { label: "ESCALATION", tone: "text-red-300 border-red-500/40 bg-red-500/10", icon: ArrowUp },
  data: { label: "DATA ACCESS", tone: "text-violet-300 border-violet-500/40 bg-violet-500/10", icon: Database },
  control: { label: "CONTROL", tone: "text-orange-300 border-orange-500/40 bg-orange-500/10", icon: ShieldAlert },
  identity: { label: "IDENTITY", tone: "text-pink-300 border-pink-500/40 bg-pink-500/10", icon: Key },
  forensic: { label: "OBSERVED", tone: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10", icon: Eye },
  network: { label: "NETWORK", tone: "text-cyan-300 border-cyan-500/40 bg-cyan-500/10", icon: Network },
  misc: { label: "CONTEXT", tone: "text-slate-400 border-slate-700 bg-slate-900/40", icon: Box },
}

function nodeTypeIcon(type: string) {
  const t = (type || "").toLowerCase()
  if (t.includes("ec2") || t.includes("instance")) return Server
  if (t.includes("lambda")) return Zap
  if (t.includes("ecs") || t.includes("fargate")) return Box
  if (t.includes("iamrole") || t === "role") return Key
  if (t.includes("policy")) return FileText
  if (t.includes("instanceprofile")) return Layers
  if (t.includes("s3") || t.includes("bucket")) return Database
  if (t.includes("dynamo")) return Database
  if (t.includes("rds")) return Database
  if (t.includes("kms")) return Lock
  if (t.includes("cloudtrail") || t.includes("principal")) return Globe
  if (t.includes("securitygroup")) return ShieldAlert
  if (t.includes("subnet") || t.includes("vpc")) return Network
  return Box
}

export function AttackerViewPanel({ path, jewel, systemName }: AttackerViewPanelProps) {
  const [data, setData] = useState<GraphViewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch the graph view for the path's nodes. We do this as a POST
  // so we can ship the full node_ids array + path_edges hint.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const nodeIds = (path.nodes ?? []).map((n) => n.id)
    const pathEdges = (path.edges ?? []).map((e) => ({
      source: e.source,
      target: e.target,
    }))
    fetch("/api/proxy/attack-chain/graph-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_name: systemName,
        node_ids: nodeIds,
        path_edges: pathEdges,
        lateral_cap_per_node: 30,
      }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d: GraphViewResponse) => {
        if (!cancelled) setData(d)
      })
      .catch((e: any) => {
        if (!cancelled) setError(String(e?.message ?? e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [path.id, systemName])

  // Map path.edges into a per-hop transition: prev-node → curr-node
  // with the original edge metadata. The frontend renders the
  // arrow between cards using this info.
  const edgeByTransition = useMemo(() => {
    const map = new Map<string, IdentityAttackPath["edges"][number]>()
    for (const e of path.edges ?? []) {
      map.set(`${e.source}|${e.target}`, e)
      map.set(`${e.target}|${e.source}`, e)
    }
    return map
  }, [path])

  if (loading) {
    return (
      <div className="flex flex-col h-full px-6 py-4">
        <ViewHeader jewel={jewel} />
        <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
          Loading the live graph for this path…
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex flex-col h-full px-6 py-4">
        <ViewHeader jewel={jewel} />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 max-w-md text-sm text-red-200">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-semibold">Could not load graph view</span>
            </div>
            <div className="text-xs text-red-200/80">{error}</div>
          </div>
        </div>
      </div>
    )
  }
  if (!data) return null

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <ViewHeader
        jewel={jewel}
        subtitle={`${data.node_count} hop${data.node_count === 1 ? "" : "s"} · live Neo4j neighborhood`}
      />

      <div className="px-6 py-4 space-y-4">
        {data.nodes.map((node, idx) => {
          const prevNode = idx > 0 ? data.nodes[idx - 1] : null
          const transitionEdge = prevNode
            ? edgeByTransition.get(`${prevNode.id}|${node.id}`)
            : null
          const laterals = (data.laterals_by_node[node.id] ?? []).filter((e) => !e.on_path)
          // Sort laterals: significance order, then observed > unobserved
          laterals.sort((a, b) => {
            if (SIG_ORDER[a.significance] !== SIG_ORDER[b.significance])
              return SIG_ORDER[a.significance] - SIG_ORDER[b.significance]
            if (!!a.observed !== !!b.observed) return a.observed ? -1 : 1
            return (b.bytes ?? 0) - (a.bytes ?? 0)
          })
          return (
            <div key={node.id}>
              {/* Inbound chain arrow + edge label, between cards */}
              {prevNode && transitionEdge && (
                <TransitionArrow
                  from={prevNode}
                  to={node}
                  edgeType={transitionEdge.type ?? "unknown"}
                  observed={transitionEdge.is_observed ?? false}
                  bytes={transitionEdge.traffic_bytes ?? 0}
                />
              )}
              <HopCard
                node={node}
                hopNumber={idx + 1}
                totalHops={data.nodes.length}
                isCrownJewel={(jewel?.id ?? "") === node.id}
              />
              {laterals.length > 0 && (
                <LateralFanout laterals={laterals} hostNodeName={node.name ?? node.id} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Header ──────────────────────────────────────────────────────────

function ViewHeader({
  jewel,
  subtitle,
}: {
  jewel: CrownJewelSummary | null
  subtitle?: string
}) {
  return (
    <div className="px-6 py-4 border-b border-slate-800/60 bg-slate-950/95 backdrop-blur sticky top-0 z-10">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
            ATTACKER VIEW · live Neo4j graph
          </div>
          <div className="text-sm font-semibold text-slate-100 leading-snug">
            Hop-by-hop traversal as the graph holds it — every node, every edge, every
            lateral pivot the attacker could take from each step.
          </div>
          {subtitle && (
            <div className="text-[11px] text-slate-400 mt-1">{subtitle}</div>
          )}
        </div>
        {jewel && (
          <div className="text-right shrink-0">
            <div className="flex items-center gap-1.5 justify-end mb-0.5">
              <Crown className="h-3 w-3 text-amber-400" />
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                target
              </span>
            </div>
            <div className="text-xs font-mono text-amber-200/90 truncate max-w-[260px]" title={jewel.name}>
              {jewel.name}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Transition arrow (the path edge between two adjacent hops) ─────

function TransitionArrow({
  from,
  to,
  edgeType,
  observed,
  bytes,
}: {
  from: GraphViewNode
  to: GraphViewNode
  edgeType: string
  observed: boolean
  bytes: number
}) {
  return (
    <div className="flex items-center gap-2 pl-6 my-1 text-[10px]">
      <ArrowDown className={`h-3 w-3 ${observed ? "text-emerald-400" : "text-amber-400"}`} />
      <span className={`font-mono ${observed ? "text-emerald-300" : "text-amber-300"}`}>
        {edgeType}
      </span>
      {observed ? (
        <span className="text-emerald-400 uppercase tracking-wider">observed</span>
      ) : (
        <span className="text-amber-400 uppercase tracking-wider">configured</span>
      )}
      {bytes > 0 && (
        <span className="text-slate-400 font-mono">{formatBytes(bytes)} on the wire</span>
      )}
    </div>
  )
}

// ─── Hop card ────────────────────────────────────────────────────────

function HopCard({
  node,
  hopNumber,
  totalHops,
  isCrownJewel,
}: {
  node: GraphViewNode
  hopNumber: number
  totalHops: number
  isCrownJewel: boolean
}) {
  const Icon = nodeTypeIcon(node.type)
  const tone = isCrownJewel
    ? "border-amber-500/50 bg-amber-500/[0.06]"
    : node.type === "CloudTrailPrincipal" || node.type === "IAMUser"
      ? "border-rose-500/30 bg-rose-500/[0.04]"
      : "border-slate-700 bg-slate-900/30"
  const keyProps = Object.entries(node.key_properties || {}).filter(
    ([k, v]) => v !== null && v !== undefined && v !== "" && !(typeof v === "string" && v.length > 200),
  )
  return (
    <div className={`rounded-xl border ${tone} p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
          HOP {hopNumber}/{totalHops}
        </span>
        {isCrownJewel && (
          <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider rounded border border-amber-500/40 bg-amber-500/15 text-amber-200 px-1.5 py-0.5">
            <Crown className="h-2.5 w-2.5" /> crown jewel
          </span>
        )}
        <Icon className="h-3.5 w-3.5 text-slate-300 ml-1" />
        <span className="text-sm font-semibold text-white truncate">
          {node.name ?? node.id}
        </span>
        <span className="text-[9px] uppercase tracking-wider text-slate-500 ml-auto">
          {node.type}
        </span>
      </div>
      <div className="text-[10px] font-mono text-slate-500 truncate mb-2" title={node.id}>
        {node.id}
      </div>
      {/* Labels stripe — the actual Neo4j labels, no abstraction */}
      <div className="flex items-center gap-1 flex-wrap mb-2">
        {(node.labels || []).map((l) => (
          <span
            key={l}
            className="text-[9px] font-mono rounded border border-slate-700 bg-slate-900/60 text-slate-400 px-1 py-0.5"
            title={`Neo4j label: ${l}`}
          >
            :{l}
          </span>
        ))}
      </div>
      {/* Key properties — per-type curated set, real values only */}
      {keyProps.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5 mt-2 text-[10px]">
          {keyProps.slice(0, 8).map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-2 min-w-0">
              <span className="text-slate-500 uppercase tracking-wider shrink-0">{k}</span>
              <span className="font-mono text-slate-200 truncate" title={String(v)}>
                {String(v)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Lateral fan-out — the attacker's pivot options from this hop ───

function LateralFanout({
  laterals,
  hostNodeName,
}: {
  laterals: GraphViewEdge[]
  hostNodeName: string
}) {
  const [collapsed, setCollapsed] = useState(false)
  // Group by significance for visual grouping
  const grouped = useMemo(() => {
    const map = new Map<GraphViewEdge["significance"], GraphViewEdge[]>()
    for (const e of laterals) {
      const arr = map.get(e.significance) ?? []
      arr.push(e)
      map.set(e.significance, arr)
    }
    return Array.from(map.entries()).sort(
      ([a], [b]) => SIG_ORDER[a] - SIG_ORDER[b],
    )
  }, [laterals])

  return (
    <div className="ml-6 mt-2 mb-2 border-l-2 border-slate-800 pl-3">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
        <span>
          From {hostNodeName}: {laterals.length} lateral move{laterals.length === 1 ? "" : "s"}
        </span>
      </button>
      {!collapsed && (
        <div className="mt-2 space-y-2">
          {grouped.map(([sig, edges]) => {
            const meta = SIG_META[sig]
            const SigIcon = meta.icon
            return (
              <div key={sig}>
                <div className={`inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider rounded border px-1.5 py-0.5 ${meta.tone}`}>
                  <SigIcon className="h-2.5 w-2.5" />
                  {meta.label}
                  <span className="opacity-60 ml-0.5">({edges.length})</span>
                </div>
                <div className="mt-1 space-y-1">
                  {edges.map((e, i) => (
                    <LateralEdgeRow key={`${e.direction}-${e.type}-${e.neighbor_id}-${i}`} edge={e} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function LateralEdgeRow({ edge }: { edge: GraphViewEdge }) {
  const Icon = nodeTypeIcon(edge.neighbor_type)
  const DirIcon = edge.direction === "out" ? ArrowRight : ArrowUp
  return (
    <div className="flex items-center gap-2 p-1.5 rounded-md bg-slate-900/40 border border-slate-800 text-[11px]">
      <DirIcon className={`h-3 w-3 shrink-0 ${edge.direction === "in" ? "text-violet-400" : "text-slate-500"}`} />
      <span className="font-mono text-slate-500 text-[10px] shrink-0">
        {edge.type}
      </span>
      <Icon className="h-3 w-3 text-slate-400 shrink-0" />
      <span className="font-mono text-slate-200 truncate flex-1">
        {edge.neighbor_name || edge.neighbor_id}
      </span>
      <span className="text-[9px] uppercase text-slate-500 shrink-0">
        {edge.neighbor_type}
      </span>
      {edge.observed === true && (
        <span className="text-[9px] uppercase tracking-wider text-emerald-300 font-bold shrink-0">
          obs
        </span>
      )}
      {edge.hit_count !== null && edge.hit_count > 0 && (
        <span className="text-[10px] text-emerald-400 font-semibold shrink-0">
          {edge.hit_count} hits
        </span>
      )}
      {edge.bytes !== null && edge.bytes > 0 && (
        <span className="text-[10px] text-slate-400 font-mono shrink-0">
          {formatBytes(edge.bytes)}
        </span>
      )}
    </div>
  )
}

function formatBytes(n: number): string {
  if (n === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}
