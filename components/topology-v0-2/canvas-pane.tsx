"use client"

/**
 * Topology v0.2 — main canvas pane.
 *
 * The mockup's AWS canonical frame (VPC > AZ > Subnet > SG > workload) is
 * scaffolded by tier classification (Web/App/Data) and AZ data the contract
 * does NOT carry today. Per CLAUDE.md rule #1 we refuse to fabricate those.
 *
 * Honest fallback: render workloads grouped by subnet_id (which the contract
 * DOES carry — §3.2). The subnet group surfaces the same density-by-segment
 * information the AWS frame conveys, without inventing AZ or tier labels.
 *
 * Each node card shows: severity halo, name, type, score+tier badge,
 * confidence badge with reason chips, contributors summary, jewel marker.
 * Click → opens DetailPanel.
 */

import { useMemo } from "react"
import {
  type Contributor,
  type ScoreTier,
  SIGNAL_LABEL,
  type TopologyNode,
} from "./types"

interface Props {
  vpcId: string | null
  nodes: TopologyNode[]
  selectedNodeId: string | null
  onSelect: (id: string) => void
}

function halo(tier: ScoreTier | "STALE" | "UNSCORED"): string {
  switch (tier) {
    case "WORST":
      return "ring-2 ring-rose-500/70 shadow-[0_0_0_4px_rgba(244,63,94,0.12)]"
    case "HIGH":
      return "ring-2 ring-rose-400/55"
    case "ELEVATED":
      return "ring-2 ring-amber-400/55"
    case "QUIET":
      return "ring-1 ring-emerald-500/40"
    case "STALE":
      return "ring-1 ring-slate-600 opacity-60"
    default:
      return "ring-1 ring-slate-700"
  }
}

function tierBg(tier: ScoreTier): string {
  switch (tier) {
    case "WORST":
      return "bg-rose-900/30 text-rose-200"
    case "HIGH":
      return "bg-rose-800/30 text-rose-200"
    case "ELEVATED":
      return "bg-amber-800/30 text-amber-200"
    case "QUIET":
      return "bg-emerald-800/30 text-emerald-200"
  }
}

function ContributorPills({ contributors }: { contributors: Contributor[] }) {
  const active = contributors.filter(c => c.value > 0).sort((a, b) => b.value - a.value)
  if (active.length === 0) {
    return (
      <div className="text-[10px] text-slate-500 italic">
        All contributors quiet — no risk signals fired
      </div>
    )
  }
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {active.map(c => (
        <span
          key={c.signal}
          className="text-[10px] px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700 text-slate-300"
          title={`weight ${c.weight} · value ${c.value.toFixed(2)}${!c.freshness.is_fresh ? ` · ${c.freshness.source} stale` : ""}`}
        >
          {SIGNAL_LABEL[c.signal]} {Math.round(c.value * 100)}%
          {!c.freshness.is_fresh && <span className="ml-1 text-amber-300">⚠</span>}
        </span>
      ))}
    </div>
  )
}

function NodeCard({
  node,
  selected,
  onClick,
}: {
  node: TopologyNode
  selected: boolean
  onClick: () => void
}) {
  const stale = !!node.stale
  const tier: ScoreTier | "STALE" | "UNSCORED" = stale
    ? "STALE"
    : node.score?.tier ?? "UNSCORED"

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded p-3 bg-slate-900/60 border border-slate-700/60 transition-all
        ${halo(tier)}
        ${selected ? "ring-offset-2 ring-offset-slate-950 ring-teal-400" : ""}
        hover:bg-slate-800/80`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {node.is_jewel && (
              <span title="Crown jewel" className="text-amber-300">
                ♛
              </span>
            )}
            <span className="text-xs font-semibold text-slate-100 truncate">
              {node.name}
            </span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">
            {node.type ?? "?"} · {node.id}
          </div>
        </div>
        {node.score && (
          <div className="text-right shrink-0">
            <div className={`text-xs font-bold px-2 py-0.5 rounded ${tierBg(node.score.tier)}`}>
              {node.score.value}
            </div>
            <div className="text-[9px] text-slate-500 mt-0.5">
              #{node.score.rank ?? "—"}
            </div>
          </div>
        )}
      </div>

      {stale && (
        <div className="text-[10px] text-slate-500 mt-2">
          STALE · {node.stale!.reason}
        </div>
      )}

      {node.score && (
        <>
          <ContributorPills contributors={node.score.contributors} />
          <div className="flex items-center justify-between mt-2 text-[10px] text-slate-400">
            <span>
              confidence {Math.round(node.score.confidence.value * 100)}% ·{" "}
              <span
                className={
                  node.score.confidence.tier === "FULL"
                    ? "text-emerald-300"
                    : node.score.confidence.tier === "DEGRADED"
                    ? "text-amber-300"
                    : "text-rose-300"
                }
              >
                {node.score.confidence.tier}
              </span>
            </span>
          </div>
        </>
      )}
    </button>
  )
}

function SubnetGroup({
  subnetId,
  nodes,
  selectedNodeId,
  onSelect,
}: {
  subnetId: string | null
  nodes: TopologyNode[]
  selectedNodeId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="border border-slate-700/40 rounded-lg p-3 bg-slate-950/40">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-semibold font-mono">
          {subnetId ?? "no subnet"}
        </div>
        <div className="text-[10px] text-slate-500">{nodes.length} workload{nodes.length === 1 ? "" : "s"}</div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {nodes.map(n => (
          <NodeCard
            key={n.id}
            node={n}
            selected={n.id === selectedNodeId}
            onClick={() => onSelect(n.id)}
          />
        ))}
      </div>
    </div>
  )
}

export function CanvasPane({ vpcId, nodes, selectedNodeId, onSelect }: Props) {
  const groups = useMemo(() => {
    const m = new Map<string | null, TopologyNode[]>()
    for (const n of nodes) {
      const key = n.subnet_id || null
      const list = m.get(key) ?? []
      list.push(n)
      m.set(key, list)
    }
    // Sort each subnet's nodes: scored by rank, stale last
    for (const [k, list] of m) {
      list.sort((a, b) => {
        if (a.stale && !b.stale) return 1
        if (!a.stale && b.stale) return -1
        if (a.score && b.score) {
          return (a.score.rank ?? 999) - (b.score.rank ?? 999)
        }
        if (a.score) return -1
        if (b.score) return 1
        return 0
      })
      m.set(k, list)
    }
    // Sort subnet groups: by worst-rank within
    return [...m.entries()].sort((a, b) => {
      const rankA = a[1].find(n => n.score)?.score?.rank ?? 999
      const rankB = b[1].find(n => n.score)?.score?.rank ?? 999
      return rankA - rankB
    })
  }, [nodes])

  if (nodes.length === 0) {
    return (
      <div className="bg-slate-900/30 border border-slate-700/40 rounded-lg p-10 text-center">
        <div className="text-slate-300 font-semibold mb-1">No workloads match the current filters</div>
        <div className="text-xs text-slate-500">
          Try widening the workload-type or severity filters in the rail.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400 font-semibold">
          {vpcId ? `VPC ${vpcId}` : "Workloads"}
        </div>
        <div className="text-[10px] text-slate-500">
          grouped by subnet · {groups.length} subnet group{groups.length === 1 ? "" : "s"}
        </div>
      </div>
      {groups.map(([subnetId, list]) => (
        <SubnetGroup
          key={subnetId ?? "no-subnet"}
          subnetId={subnetId}
          nodes={list}
          selectedNodeId={selectedNodeId}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
