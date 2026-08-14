"use client"

import { Activity, Box, Clock3, Search } from "lucide-react"
import { useMemo, useState } from "react"
import type { SubnetMeta, TopologyNode, TrafficEdge } from "./types"

export interface OperationsEntry {
  id: string
  name: string
  type: string
  inbound: number
  outbound: number
  lastSeen: string | null
  placement: string
  stale: boolean
}

interface Props {
  nodes: TopologyNode[]
  edges: TrafficEdge[]
  subnets?: SubnetMeta[]
  selectedId: string | null
  onSelectWorkload: (nodeId: string) => void
  filtersSlot?: React.ReactNode
}

function latestIso(a: string | null, b: string | null | undefined): string | null {
  if (!b) return a
  if (!a) return b
  const aTime = Date.parse(a)
  const bTime = Date.parse(b)
  if (Number.isNaN(aTime)) return b
  if (Number.isNaN(bTime)) return a
  return bTime > aTime ? b : a
}

function placementLabel(node: TopologyNode, subnetById: Map<string, SubnetMeta>): string {
  const subnet = node.subnet_id ? subnetById.get(node.subnet_id) : undefined
  if (subnet) {
    const zone = subnet.az ?? node.region ?? "unknown zone"
    return `${zone} · ${subnet.tier}`
  }
  if (node.vpc_id) return `${node.region ?? "unknown region"} · VPC`
  return `${node.region ?? "global"} · regional`
}

export function buildOperationsEntries(
  nodes: TopologyNode[],
  edges: TrafficEdge[],
  subnets: SubnetMeta[] = [],
): OperationsEntry[] {
  const subnetById = new Map(subnets.map(subnet => [subnet.id, subnet]))
  const byId = new Map<string, OperationsEntry>()

  for (const node of nodes) {
    if (byId.has(node.id)) continue
    byId.set(node.id, {
      id: node.id,
      name: node.name,
      type: node.type ?? "Resource",
      inbound: 0,
      outbound: 0,
      lastSeen: null,
      placement: placementLabel(node, subnetById),
      stale: Boolean(node.stale),
    })
  }

  for (const edge of edges) {
    const source = byId.get(edge.source_id)
    if (source) {
      source.outbound += 1
      source.lastSeen = latestIso(source.lastSeen, edge.last_seen)
    }
    const target = byId.get(edge.target_id)
    if (target) {
      target.inbound += 1
      target.lastSeen = latestIso(target.lastSeen, edge.last_seen)
    }
  }

  return [...byId.values()].sort(
    (a, b) =>
      b.inbound + b.outbound - (a.inbound + a.outbound) ||
      Number(a.stale) - Number(b.stale) ||
      a.name.localeCompare(b.name),
  )
}

function formatLastSeen(value: string | null): string {
  if (!value) return "No runtime timestamp"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function RankedRail({
  nodes,
  edges,
  subnets = [],
  selectedId,
  onSelectWorkload,
  filtersSlot,
}: Props) {
  const [query, setQuery] = useState("")
  const entries = useMemo(
    () => buildOperationsEntries(nodes, edges, subnets),
    [nodes, edges, subnets],
  )
  const visibleEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return entries
    return entries.filter(entry =>
      `${entry.name} ${entry.type} ${entry.placement}`.toLowerCase().includes(normalized),
    )
  }, [entries, query])

  return (
    <aside
      className="rounded-lg flex flex-col min-h-0"
      style={{ background: "white", border: "1px solid #DDE3E8", color: "#1A2330" }}
    >
      <div className="px-3 pt-3 pb-2 border-b shrink-0" style={{ borderColor: "#E2E8F0" }}>
        <div className="flex items-center justify-between gap-2">
          <h2
            className="text-[11px] uppercase tracking-[0.16em] font-bold"
            style={{ color: "#1A2330" }}
          >
            Service index
          </h2>
          <span className="text-[10px] font-mono" style={{ color: "#5A6B7A" }}>
            {entries.length}
          </span>
        </div>
        <div className="relative mt-2">
          <Search
            className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
            style={{ color: "#94A3B8" }}
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Find service"
            className="w-full rounded-md border py-1.5 pl-7 pr-2 text-[11px] outline-none focus:border-[#00C2A8]"
            style={{ borderColor: "#CBD5E1", background: "#F8FAFC", color: "#1A2330" }}
            aria-label="Find service in topology"
          />
        </div>
        {filtersSlot ? <div className="mt-2">{filtersSlot}</div> : null}
      </div>
      <ol className="flex-1 overflow-y-auto m-0 p-0 list-none">
        {visibleEntries.length === 0 ? (
          <li className="px-4 py-6 text-[12px] italic" style={{ color: "#5A6B7A" }}>
            No services match this view.
          </li>
        ) : (
          visibleEntries.map(entry => {
            const selected = selectedId === entry.id
            const connectionCount = entry.inbound + entry.outbound
            return (
              <li key={entry.id} className="border-b" style={{ borderColor: "#EEF2F6" }}>
                <button
                  type="button"
                  onClick={() => onSelectWorkload(entry.id)}
                  className="w-full text-left px-3 py-2.5 transition-colors hover:bg-[#F9FAFB]"
                  style={{
                    background: selected ? "#F0FDFA" : undefined,
                    borderLeft: selected ? "3px solid #00C2A8" : "3px solid transparent",
                  }}
                  data-testid="topology-operations-entry"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                      style={{
                        background: connectionCount > 0 ? "#E6FBF7" : "#F1F5F9",
                        color: connectionCount > 0 ? "#0E8B7A" : "#64748B",
                      }}
                    >
                      {connectionCount > 0 ? <Activity size={14} /> : <Box size={14} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-semibold truncate" style={{ color: "#1A2330" }}>
                          {entry.name}
                        </span>
                        <span
                          className="h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ background: entry.stale ? "#F59E0B" : "#10B981" }}
                          title={entry.stale ? "Stale graph data" : "Current graph data"}
                        />
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-[10px]" style={{ color: "#64748B" }}>
                          {entry.type} · {entry.placement}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
                        <span className="font-mono" style={{ color: connectionCount > 0 ? "#0E8B7A" : "#94A3B8" }}>
                          {entry.inbound} in · {entry.outbound} out
                        </span>
                        <span className="inline-flex items-center gap-1 truncate" style={{ color: "#94A3B8" }}>
                          <Clock3 size={10} />
                          {formatLastSeen(entry.lastSeen)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            )
          })
        )}
      </ol>
    </aside>
  )
}
