"use client"

import { useMemo, useState } from "react"
import { AlertCircle, Layers, Network, Sliders, Zap } from "lucide-react"
import {
  buildMapViewModel,
  chainPathD,
  type MapViewModel,
} from "@/lib/attack-map/map-view-model"
import type { AttackMapPayload, Position, TopologySnapshot } from "@/lib/attack-map/slot-mapper"
import { AttackMapNodeCard } from "./attack-map-node-card"

type ActiveLens = "reachability" | "lateral" | "exfiltration"

const LENS_STROKE: Record<ActiveLens, string> = {
  reachability: "#fb7185",
  lateral: "#fbbf24",
  exfiltration: "#c084fc",
}

export interface AttackMapExperienceProps {
  payload: AttackMapPayload
  topology: TopologySnapshot
  positions: Map<string, Position>
  density: { jewel_column_capacity: number; tile_w: number; tile_h: number; tile_gap: number; tiles_per_row: number }
}

export function AttackMapExperience({
  payload,
  topology,
  positions,
  density,
}: AttackMapExperienceProps) {
  const [activeLens, setActiveLens] = useState<ActiveLens>("reachability")
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    payload.movement_chain[0]?.node_id ?? null,
  )

  const model: MapViewModel = useMemo(
    () => buildMapViewModel(payload, topology, positions, density),
    [payload, topology, positions, density],
  )

  const spine = useMemo(
    () => chainPathD(payload.movement_chain, positions),
    [payload.movement_chain, positions],
  )

  const strokeColor = LENS_STROKE[activeLens]
  const { bounds } = model
  const canvasH = Math.max(bounds.h, 520)

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-slate-800/60 bg-[#090D16] p-3 shadow-xl"
      data-testid="cyntro-attack-map-experience"
      data-map-version="v3"
    >
      <div className="flex flex-col gap-3 border-b border-slate-800/40 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-100">
            <Layers className="h-4 w-4 text-cyan-500" />
            Active Threat Flow Topology
            <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-cyan-400">
              v3
            </span>
          </h2>
          <p className="mt-0.5 font-mono text-[11px] text-slate-500">
            {topology.system} · blast {payload.score}
            {payload.blast?.crown_jewels_reachable
              ? ` · ${payload.blast.crown_jewels_reachable} crown jewel${
                  payload.blast.crown_jewels_reachable === 1 ? "" : "s"
                } reachable`
              : ""}
          </p>
        </div>

        <div className="flex gap-1 rounded-lg border border-slate-800/80 bg-slate-950/85 p-1 shadow-inner">
          {(
            [
              { id: "reachability" as const, label: "Reachability", icon: Zap },
              { id: "lateral" as const, label: "Lateral", icon: Sliders },
              { id: "exfiltration" as const, label: "Exfiltration", icon: Network },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveLens(id)}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 font-mono text-xs transition-all ${
                activeLens === id
                  ? id === "reachability"
                    ? "border border-rose-500/30 bg-rose-500/10 text-rose-400"
                    : id === "lateral"
                      ? "border border-amber-500/30 bg-amber-500/10 text-amber-400"
                      : "border border-purple-500/30 bg-purple-500/10 text-purple-400"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative max-h-[78vh] min-h-[520px] overflow-auto rounded-xl border border-slate-900 bg-slate-950/40 shadow-inner">
        <div
          className="relative w-max select-none"
          style={{
            width: `${bounds.w}px`,
            height: `${canvasH}px`,
            minWidth: "1000px",
            minHeight: "520px",
          }}
          data-testid="cyntro-attack-map-canvas"
        >
          <svg
            className="pointer-events-none absolute left-0 top-0 overflow-visible"
            width={bounds.w}
            height={canvasH}
            viewBox={`${bounds.minX} ${bounds.minY} ${bounds.w} ${canvasH}`}
            aria-hidden
          >
            <defs>
              <marker
                id="cyntro-exp-arrow"
                viewBox="0 0 10 10"
                refX="24"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={strokeColor} />
              </marker>
              <filter id="cyntro-exp-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <rect
              x={topology.vpc.x}
              y={topology.vpc.y - 26}
              width={topology.vpc.w}
              height={22}
              rx={6}
              fill="#0b1220"
              stroke="#334155"
              strokeWidth={1}
            />
            <text
              x={topology.vpc.x + 12}
              y={topology.vpc.y - 10}
              fill="#94a3b8"
              fontSize={11}
              fontWeight={600}
              letterSpacing="0.12em"
            >
              VPC · {topology.system}
            </text>

            <rect
              x={topology.vpc.x}
              y={topology.vpc.y}
              width={topology.vpc.w}
              height={topology.vpc.h}
              rx={16}
              fill="none"
              stroke="#1e293b"
              strokeWidth={1.5}
              strokeDasharray="5 5"
            />

            {Object.values(topology.subnets).map((sub) => (
              <g key={sub.id}>
                <rect
                  x={sub.x}
                  y={sub.y}
                  width={sub.w}
                  height={sub.h}
                  rx={10}
                  fill={sub.kind === "public" ? "#0b111e" : "#080e1a"}
                  stroke={sub.kind === "public" ? "#0ea5e9" : "#1e293b"}
                  strokeWidth={1}
                  opacity={0.95}
                />
                <text
                  x={sub.x + 8}
                  y={sub.y + 14}
                  fill="#64748b"
                  fontSize={8}
                  fontWeight={600}
                  letterSpacing="0.08em"
                >
                  {sub.az.toUpperCase()} · {sub.kind === "public" ? "PUBLIC DMZ" : "PRIVATE"} ·{" "}
                  {sub.id.slice(-8)}
                </text>
              </g>
            ))}

            {Object.values(topology.groups).map((g) => (
              <rect
                key={g.id}
                x={g.x}
                y={g.y}
                width={g.w}
                height={g.h}
                rx={6}
                fill="#0b1220"
                stroke="#1e293b"
                strokeWidth={1}
                opacity={0.75}
              />
            ))}

            <line
              x1={topology.crown_jewel_column.x}
              y1={topology.vpc.y - 4}
              x2={topology.crown_jewel_column.x}
              y2={topology.vpc.y + topology.vpc.h + 8}
              stroke="#7c3aed"
              strokeWidth={1}
              strokeDasharray="3 4"
              opacity={0.45}
            />
            <text
              x={topology.crown_jewel_column.x}
              y={topology.vpc.y - 32}
              fill="#a78bfa"
              fontSize={10}
              fontWeight={700}
              letterSpacing="0.12em"
            >
              CROWN JEWELS
            </text>

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
              opacity={0.55}
            />
            <text
              x={topology.drift_lane.x + 10}
              y={topology.drift_lane.y + 16}
              fill="#fca5a5"
              fontSize={10}
              fontWeight={600}
            >
              DRIFT LANE
            </text>

            {spine.d && (
              <>
                <path
                  d={spine.d}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={3.5}
                  strokeLinejoin="round"
                  opacity={0.15}
                />
                <path
                  d={spine.d}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  markerEnd="url(#cyntro-exp-arrow)"
                  opacity={0.92}
                  filter="url(#cyntro-exp-glow)"
                />
                <path
                  d={spine.d}
                  fill="none"
                  stroke="#fde047"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  strokeDasharray={`12 ${spine.length}`}
                  opacity={0.85}
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    from={spine.length}
                    to={0}
                    dur="2.6s"
                    repeatCount="indefinite"
                  />
                </path>
              </>
            )}

            {model.movementEdges.map((edge) => {
              const src = positions.get(edge.src)
              const dst = positions.get(edge.dst)
              if (!src || !dst) return null
              return (
                <circle key={`${edge.src}-${edge.dst}`} r={4.5} fill={strokeColor} opacity={0.9}>
                  <animateMotion
                    path={`M ${src.x} ${src.y} L ${dst.x} ${dst.y}`}
                    dur="2.5s"
                    repeatCount="indefinite"
                  />
                </circle>
              )
            })}
          </svg>

          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${-bounds.minX}px, ${-bounds.minY}px)`,
            }}
          >
            {model.nodes.map((node) => (
              <AttackMapNodeCard
                key={node.id}
                node={node}
                selected={
                  selectedNodeId != null &&
                  (node.id === selectedNodeId ||
                    node.id.startsWith(`${selectedNodeId}::hop-`))
                }
                onSelect={setSelectedNodeId}
              />
            ))}

            {model.constraintChips.map((chip) => (
              <div
                key={chip.id}
                style={{ left: `${chip.x}px`, top: `${chip.y}px` }}
                className={`absolute z-20 rounded border px-1.5 py-0.5 font-mono text-[8px] shadow pointer-events-none ${
                  chip.severity === "critical"
                    ? "border-red-500/50 bg-red-950/90 text-red-200"
                    : chip.severity === "high"
                      ? "border-orange-500/50 bg-orange-950/90 text-orange-200"
                      : "border-slate-800 bg-slate-950/90 text-cyan-400"
                }`}
              >
                🛡️ {chip.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {(payload.collection_gaps?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2 rounded-lg border border-slate-800/60 bg-slate-950/50 p-2">
          <span className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-slate-500">
            <AlertCircle className="h-3 w-3 text-amber-500" />
            Collection gaps
          </span>
          {payload.collection_gaps!.map((gap) => (
            <span
              key={gap}
              className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[9px] text-amber-300"
            >
              {gap}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 rounded-b-xl border-t border-slate-900 bg-slate-950/60 p-3 text-[10px]">
        <span className="font-mono text-[9px] uppercase tracking-wider text-slate-500">
          Map indicators
        </span>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3.5 bg-rose-500" />
          <span className="font-mono text-slate-400">Reachability</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3.5 bg-amber-500" />
          <span className="font-mono text-slate-400">Lateral</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3.5 bg-purple-500" />
          <span className="font-mono text-slate-400">Exfiltration</span>
        </div>
        <span className="ml-auto font-mono text-[9px] text-slate-600">?map=legacy for old view</span>
      </div>
    </div>
  )
}
