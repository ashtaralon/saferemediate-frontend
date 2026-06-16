"use client"

import { useMemo } from "react"
import {
  compressConstraintsForEdge,
  deriveMovementEdges,
  type AttackMapPayload,
  type Position,
  type TopologySnapshot,
  type Verdict,
} from "@/lib/attack-map/slot-mapper"

const VERDICT_COLOR: Record<Verdict, string> = {
  ENTRY: "#38bdf8",
  SEEN: "#22d3ee",
  ALLOWED: "#f97316",
  NOT_OBSERVED: "#94a3b8",
  BLOCKED: "#ef4444",
}

function shortLabel(nodeId: string, nodeType: string): string {
  if (nodeType === "Internet") return "Internet"
  if (nodeType === "IAMRole" || nodeType === "InstanceProfile") {
    const part = nodeId.split("/").pop() ?? nodeId
    return part.length > 22 ? `${part.slice(0, 10)}…${part.slice(-8)}` : part
  }
  if (nodeId.startsWith("arn:")) {
    const tail = nodeId.split(":").pop() ?? nodeId
    return tail.length > 24 ? `${tail.slice(0, 12)}…` : tail
  }
  if (nodeId.startsWith("i-")) return nodeId
  if (nodeId.startsWith("sg-")) return nodeId
  return nodeId.length > 20 ? `${nodeId.slice(0, 10)}…` : nodeId
}

export interface AttackMapCanvasProps {
  payload: AttackMapPayload
  topology: TopologySnapshot
  positions: Map<string, Position>
}

export function AttackMapCanvas({ payload, topology, positions }: AttackMapCanvasProps) {
  const chain = payload.movement_chain
  const movementEdges = useMemo(() => deriveMovementEdges(chain), [chain])

  const bounds = useMemo(() => {
    let minX = topology.vpc.x - 40
    let minY = topology.vpc.y - 72
    let maxX = topology.crown_jewel_column.x + 140
    let maxY = topology.drift_lane.y + topology.drift_lane.h + 24

    for (const p of positions.values()) {
      minX = Math.min(minX, p.x - 48)
      minY = Math.min(minY, p.y - 48)
      maxX = Math.max(maxX, p.x + 96)
      maxY = Math.max(maxY, p.y + 56)
    }
    return { minX, minY, w: maxX - minX, h: maxY - minY }
  }, [positions, topology])

  const chainPoints = chain
    .map((h) => positions.get(h.node_id))
    .filter((p): p is Position => Boolean(p))

  return (
    <svg
      viewBox={`${bounds.minX} ${bounds.minY} ${bounds.w} ${bounds.h}`}
      className="w-full h-[min(680px,72vh)] min-h-[420px]"
      role="img"
      aria-label="Cyntro attack map"
      data-testid="cyntro-attack-map-canvas"
    >
      <defs>
        <marker id="cyntro-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#f97316" />
        </marker>
      </defs>

      {/* VPC shell */}
      <rect
        x={topology.vpc.x}
        y={topology.vpc.y}
        width={topology.vpc.w}
        height={topology.vpc.h}
        rx={12}
        fill="#0f172a"
        stroke="#334155"
        strokeWidth={1.5}
      />
      <text
        x={topology.vpc.x + 12}
        y={topology.vpc.y + 18}
        fill="#64748b"
        fontSize={10}
        fontWeight={600}
        letterSpacing="0.08em"
      >
        VPC
      </text>

      {/* Subnets */}
      {Object.values(topology.subnets).map((sub) => (
        <g key={sub.id}>
          <rect
            x={sub.x}
            y={sub.y}
            width={sub.w}
            height={sub.h}
            rx={8}
            fill="#1e293b"
            stroke={sub.kind === "public" ? "#0ea5e9" : "#475569"}
            strokeWidth={1}
            strokeDasharray={sub.kind === "public" ? undefined : "4 3"}
          />
          <text x={sub.x + 8} y={sub.y + 14} fill="#94a3b8" fontSize={9}>
            {sub.az} · {sub.id.slice(-8)}
          </text>
        </g>
      ))}

      {/* Groups */}
      {Object.values(topology.groups).map((g) => (
        <rect
          key={g.id}
          x={g.x}
          y={g.y}
          width={g.w}
          height={g.h}
          rx={6}
          fill="#0b1220"
          stroke="#334155"
          strokeWidth={1}
        />
      ))}

      {/* Jewel column guide */}
      <line
        x1={topology.crown_jewel_column.x}
        y1={topology.vpc.y}
        x2={topology.crown_jewel_column.x}
        y2={topology.vpc.y + topology.vpc.h}
        stroke="#7c3aed"
        strokeWidth={1}
        strokeDasharray="3 4"
        opacity={0.5}
      />
      <text
        x={topology.crown_jewel_column.x + 4}
        y={topology.vpc.y + 14}
        fill="#a78bfa"
        fontSize={9}
        fontWeight={600}
      >
        CROWN JEWELS
      </text>

      {/* Drift / orphan lanes */}
      <rect
        x={topology.drift_lane.x}
        y={topology.drift_lane.y}
        width={topology.drift_lane.w}
        height={topology.drift_lane.h}
        rx={6}
        fill="#1c1017"
        stroke="#7f1d1d"
        strokeWidth={1}
        strokeDasharray="5 4"
      />
      <text x={topology.drift_lane.x + 8} y={topology.drift_lane.y + 14} fill="#fca5a5" fontSize={9}>
        drift lane
      </text>

      {/* Movement spine */}
      {chainPoints.length > 1 && (
        <polyline
          points={chainPoints.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="#f97316"
          strokeWidth={2.5}
          strokeLinejoin="round"
          markerEnd="url(#cyntro-arrow)"
          opacity={0.9}
        />
      )}

      {/* Constraint bands on edges */}
      {movementEdges.map((edge) => {
        const src = positions.get(edge.src)
        const dst = positions.get(edge.dst)
        if (!src || !dst) return null
        const compressed = compressConstraintsForEdge(
          `${edge.src}→${edge.dst}`,
          payload.constraint_edges,
          new Date(),
        )
        if (!compressed.visible.length) return null
        const mx = (src.x + dst.x) / 2
        const my = (src.y + dst.y) / 2 - 18
        return (
          <g key={`${edge.src}-${edge.dst}`}>
            <rect
              x={mx - 52}
              y={my - 10}
              width={104}
              height={20}
              rx={10}
              fill="#312e81"
              stroke="#6366f1"
            />
            <text x={mx} y={my + 4} textAnchor="middle" fill="#e0e7ff" fontSize={8}>
              {compressed.visible[0].node_type}
              {compressed.visible[0].count > 1 ? ` ×${compressed.visible[0].count}` : ""}
              {compressed.overflow > 0 ? ` +${compressed.overflow}` : ""}
            </text>
          </g>
        )
      })}

      {/* Nodes */}
      {chain.map((hop, idx) => {
        const pos = positions.get(hop.node_id)
        if (!pos) return null
        const color = VERDICT_COLOR[hop.verdict] ?? "#94a3b8"
        const isJewel = hop.is_crown_jewel || pos.anchor_kind === "jewel"
        const r = isJewel ? 14 : pos.anchor_kind === "label" ? 0 : 11
        return (
          <g key={hop.node_id} data-hop-index={idx}>
            {pos.anchor_kind === "label" ? (
              <rect
                x={pos.x - 36}
                y={pos.y - 8}
                width={72}
                height={16}
                rx={4}
                fill="#1e293b"
                stroke={color}
              />
            ) : (
              <circle
                cx={pos.x}
                cy={pos.y}
                r={r}
                fill={isJewel ? "#4c1d95" : "#0f172a"}
                stroke={color}
                strokeWidth={isJewel ? 2.5 : 2}
              />
            )}
            <text
              x={pos.x}
              y={pos.y + (pos.anchor_kind === "label" ? 22 : 24)}
              textAnchor="middle"
              fill="#e2e8f0"
              fontSize={9}
            >
              {shortLabel(hop.node_id, hop.node_type)}
            </text>
            <text x={pos.x} y={pos.y - (pos.anchor_kind === "label" ? 12 : 16)} textAnchor="middle" fill={color} fontSize={8} fontWeight={700}>
              {idx + 1}
            </text>
            {pos.fallback && (
              <text x={pos.x + 14} y={pos.y - 10} fill="#fca5a5" fontSize={7}>
                {pos.fallback}
              </text>
            )}
          </g>
        )
      })}

      {/* Off-chain constraints */}
      {payload.constraint_edges
        .filter((c) => c.appears_as === "constraint")
        .map((c) => {
          const pos = positions.get(c.constraint_node_id)
          if (!pos || chain.some((h) => h.node_id === c.constraint_node_id)) return null
          return (
            <g key={c.constraint_node_id}>
              <rect x={pos.x - 28} y={pos.y - 8} width={56} height={16} rx={8} fill="#312e81" stroke="#818cf8" />
              <text x={pos.x} y={pos.y + 4} textAnchor="middle" fill="#e0e7ff" fontSize={7}>
                {c.constraint_node_type}
              </text>
            </g>
          )
        })}
    </svg>
  )
}
