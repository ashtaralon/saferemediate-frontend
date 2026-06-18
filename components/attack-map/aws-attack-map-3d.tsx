"use client"

import dynamic from "next/dynamic"
import { useMemo, useState } from "react"
import { Box, Layers, Network, Shield, Sparkles } from "lucide-react"
import type { AttackMapPayload, TopologySnapshot } from "@/lib/attack-map/slot-mapper"
import { layoutPayload3D, riskColor } from "@/lib/attack-map/slot-mapper-3d"
import type { DensityRules } from "@/lib/attack-map/slot-mapper"

const AwsAttackMap3DScene = dynamic(
  () => import("./aws-attack-map-3d-scene").then((m) => m.AwsAttackMap3DScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[520px] items-center justify-center text-[12px] text-slate-400">
        Initializing 3-D scene…
      </div>
    ),
  },
)

const MAP_BUILD = "aws-3d-v1"

type CameraPreset = "iso" | "network" | "identity" | "data"

export interface AwsAttackMap3DProps {
  payload: AttackMapPayload
  topology: TopologySnapshot
  density: DensityRules
}

export function AwsAttackMap3D({ payload, topology, density }: AwsAttackMap3DProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    payload.movement_chain[0]?.node_id ?? null,
  )
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("iso")
  const [webglOk] = useState(() => {
    if (typeof window === "undefined") return true
    try {
      const canvas = document.createElement("canvas")
      return Boolean(
        canvas.getContext("webgl") || canvas.getContext("experimental-webgl"),
      )
    } catch {
      return false
    }
  })

  const scene = useMemo(
    () => layoutPayload3D(payload, topology, density),
    [payload, topology, density],
  )

  const selected = scene.nodes.find((n) => n.id === selectedNodeId)

  if (!webglOk) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-8 text-center text-[12px] text-amber-200">
        WebGL is unavailable in this browser — switch to Surface or Classic for a 2-D view.
      </div>
    )
  }

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-slate-800/70 bg-[#070b12] overflow-hidden shadow-xl"
      data-testid="aws-attack-map-3d"
      data-map-build={MAP_BUILD}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/60 px-3 py-2.5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-100">
            <Box className="h-4 w-4 text-orange-400" />
            AWS Attack Path
            <span className="rounded border border-orange-500/30 bg-orange-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-orange-300">
              3-D
            </span>
          </h2>
          <p className="mt-0.5 font-mono text-[10px] text-slate-500">
            {topology.system} · {payload.movement_chain.length} hops · score {payload.score}
            {payload.blast?.crown_jewels_reachable
              ? ` · ${payload.blast.crown_jewels_reachable} crown jewel${
                  payload.blast.crown_jewels_reachable === 1 ? "" : "s"
                }`
              : ""}
            <span className="ml-2 text-slate-600" data-testid="map-build-id">
              {MAP_BUILD}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ["iso", "Iso", Sparkles],
              ["network", "Network", Network],
              ["identity", "Identity", Shield],
              ["data", "Data", Layers],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setCameraPreset(key)}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] transition-colors ${
                cameraPreset === key
                  ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-200"
                  : "border-slate-700 text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1fr_220px]">
        <div className="h-[min(68vh,620px)] min-h-[520px] w-full">
          <AwsAttackMap3DScene
            scene={scene}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            cameraPreset={cameraPreset}
          />
        </div>

        <aside className="border-t border-slate-800/60 bg-slate-950/50 p-3 lg:border-t-0 lg:border-l">
          <p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">Path chain</p>
          <ol className="mt-2 space-y-1.5 max-h-[280px] overflow-y-auto">
            {payload.movement_chain.map((hop, i) => (
              <li key={hop.node_id}>
                <button
                  type="button"
                  onClick={() => setSelectedNodeId(hop.node_id)}
                  className={`flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${
                    selectedNodeId === hop.node_id
                      ? "border-cyan-500/40 bg-cyan-500/10"
                      : "border-slate-800 hover:border-slate-600"
                  }`}
                >
                  <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[9px] font-bold text-slate-300">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-medium text-slate-200">
                      {hop.node_type}
                    </span>
                    <span className="block truncate font-mono text-[9px] text-slate-500">
                      {hop.node_id.length > 28 ? `…${hop.node_id.slice(-24)}` : hop.node_id}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>

          {selected ? (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
              <p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">Selected</p>
              <p className="mt-1 text-[12px] font-semibold text-slate-100">{selected.label}</p>
              <p className="font-mono text-[10px] text-slate-500">{selected.nodeType}</p>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: riskColor(selected.riskScore) }}
                />
                <span className="text-[10px] text-slate-400">Risk {selected.riskScore}</span>
              </div>
              {selected.isCrownJewel ? (
                <p className="mt-2 text-[10px] font-semibold text-amber-400">Crown jewel target</p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 space-y-1 text-[9px] text-slate-500">
            <p>
              <span className="text-slate-400">X</span> network plane ·{" "}
              <span className="text-slate-400">Y</span> identity ·{" "}
              <span className="text-slate-400">Z</span> data depth
            </p>
            <p>Drag to orbit · scroll to zoom · click nodes for detail</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
