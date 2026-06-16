"use client"

import {
  Database,
  Folder,
  Globe,
  Key,
  Lock,
  Network,
  Server,
  Shield,
  Sliders,
} from "lucide-react"
import type { Fallback, Verdict } from "@/lib/attack-map/slot-mapper"
import type { MapViewNode } from "@/lib/attack-map/map-view-model"

const VERDICT_RING: Record<Verdict, string> = {
  ENTRY: "ring-sky-400/80",
  SEEN: "ring-cyan-400/80",
  ALLOWED: "ring-orange-400/80",
  NOT_OBSERVED: "ring-slate-500/60",
  BLOCKED: "ring-red-500/80",
}

function NodeIcon({ type }: { type: MapViewNode["visualType"] }) {
  const cls = "w-3.5 h-3.5"
  switch (type) {
    case "threat":
      return <Globe className={`${cls} text-rose-500`} />
    case "alb":
      return <Sliders className={`${cls} text-cyan-500`} />
    case "nat":
      return <Network className={`${cls} text-slate-500`} />
    case "compute":
      return <Server className={`${cls} text-slate-400`} />
    case "database":
      return <Database className={`${cls} text-amber-500`} />
    case "s3":
      return <Folder className={`${cls} text-violet-500`} />
    case "kms":
      return <Key className={`${cls} text-emerald-500`} />
    case "bastion":
      return <Lock className={`${cls} text-indigo-400`} />
    case "identity":
      return <Shield className={`${cls} text-blue-400`} />
    default:
      return <Server className={`${cls} text-slate-500`} />
  }
}

export interface AttackMapNodeCardProps {
  node: MapViewNode
  selected?: boolean
  onSelect?: (nodeId: string) => void
}

export function AttackMapNodeCard({ node, selected, onSelect }: AttackMapNodeCardProps) {
  const hopKey = node.id.includes("::hop-") ? node.id.split("::hop-")[0]! : node.id
  const ring =
    node.onChain && node.verdict ? VERDICT_RING[node.verdict] : undefined

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(hopKey)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect?.(hopKey)
      }}
      style={{ left: `${node.x}px`, top: `${node.y}px` }}
      className={`absolute w-[130px] h-[60px] rounded-lg border text-left cursor-pointer transition-all duration-200 flex flex-col justify-between p-2 z-10 ${
        node.isCrownJewel
          ? "bg-amber-950/60 border-amber-500/80 text-amber-100 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
          : "bg-slate-950/90 border-slate-800 hover:border-slate-600"
      } ${node.muted ? "opacity-45 hover:opacity-70" : ""} ${
        selected ? "ring-2 ring-cyan-400 scale-[1.03] border-transparent shadow-[0_0_15px_rgba(34,211,238,0.3)]" : ""
      } ${ring ?? ""}`}
      data-testid={node.onChain ? `attack-map-hop-${node.hopIndex}` : `attack-map-node-${hopKey}`}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 min-w-0">
          <span className="p-1 rounded border bg-slate-900 border-slate-800 shrink-0">
            <NodeIcon type={node.visualType} />
          </span>
          <span className="text-[10px] font-bold truncate text-slate-200">{node.label}</span>
        </div>
        {node.onChain && node.hopIndex != null && (
          <span className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full border border-orange-500/60 bg-slate-950 text-[9px] font-bold text-orange-400">
            {node.hopIndex}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[8px] font-mono truncate text-slate-500">{node.subLabel}</span>
        {node.isCrownJewel && (
          <span className="text-[7px] font-extrabold font-mono px-1 rounded text-amber-400 bg-amber-500/10 shrink-0">
            CJ
          </span>
        )}
      </div>
      {node.fallback && (
        <span className="absolute -top-2 right-1 text-[7px] font-mono text-rose-400 bg-slate-950 px-1 rounded border border-rose-500/40">
          {node.fallback}
        </span>
      )}
    </div>
  )
}
