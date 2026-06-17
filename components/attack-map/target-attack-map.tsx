"use client"

import { useMemo, useState } from "react"
import {
  ArrowRight,
  Cpu,
  Database,
  Fingerprint,
  Folder,
  Globe,
  Key,
  Layers,
  Lock,
  Moon,
  Network,
  Server,
  Shield,
  Sliders,
  Sun,
  Zap,
} from "lucide-react"
import type {
  TargetLens,
  TargetNode,
  TargetNodeType,
  TargetTopology,
} from "@/lib/attack-map/to-target-topology"

const LENS_COLOR: Record<TargetLens, { dark: string; light: string }> = {
  reachability: { dark: "#fb7185", light: "#e11d48" },
  lateral: { dark: "#fbbf24", light: "#d97706" },
  exfiltration: { dark: "#c084fc", light: "#7c3aed" },
}


function nodeIcon(type: TargetNodeType, dark: boolean) {
  const cls = "w-3.5 h-3.5"
  switch (type) {
    case "threat":
      return <Globe className={`${cls} text-rose-500`} />
    case "compute":
      return <Server className={`${cls} ${dark ? "text-slate-400" : "text-slate-500"}`} />
    case "lambda":
      return <Zap className={`${cls} text-amber-500`} />
    case "database":
      return <Database className={`${cls} text-amber-500`} />
    case "s3":
      return <Folder className={`${cls} text-violet-500`} />
    case "kms":
      return <Key className={`${cls} text-emerald-500`} />
    case "iam":
      return <Fingerprint className={`${cls} text-pink-500`} />
    case "sg":
      return <Shield className={`${cls} text-cyan-500`} />
    case "nat":
      return <Network className={`${cls} text-slate-500`} />
    case "alb":
      return <Sliders className={`${cls} text-cyan-500`} />
    case "igw":
      return <Globe className={`${cls} text-orange-500`} />
    case "vpce":
      return <Network className={`${cls} text-emerald-500`} />
    case "bastion":
      return <Lock className={`${cls} text-indigo-400`} />
    default:
      return <Cpu className={`${cls} text-slate-400`} />
  }
}

export function TargetAttackMap({ topo }: { topo: TargetTopology }) {
  const [activeLens, setActiveLens] = useState<TargetLens>("reachability")
  const [isDark, setIsDark] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(
    topo.nodes.find((n) => n.onPath)?.id ?? topo.nodes[0]?.id ?? null,
  )

  // ── layout: internet (left) · subnet rows (wrap into a grid, never stack) ·
  //    regional/global column (right). Each tier band grows to fit its rows. ──
  const TIER_META: { key: string; label: string }[] = [
    { key: "public", label: "Public subnet · internet-reachable" },
    { key: "private-app", label: "Private application subnet" },
    { key: "private-data", label: "Private data subnet" },
  ]
  const { positions, height, bands } = useMemo(() => {
    const pos: Record<string, { x: number; y: number }> = {}
    const X0 = 250
    const X1 = 820
    const COLS = 4
    const ROWH = 66

    // internet / threat — far left entry
    for (const n of topo.nodes) if (n.type === "threat") pos[n.id] = { x: 90, y: 180 }

    // regional / global column — stacked on the right
    const ext = topo.nodes.filter((n) => n.subnet === "external" && n.type !== "threat")
    ext.forEach((n, i) => {
      pos[n.id] = { x: 930, y: 120 + i * 100 }
    })

    // in-VPC nodes — per tier, wrap into a grid; bands stack and grow
    const localBands: { key: string; label: string; y: number; h: number }[] = []
    let cursorY = 78
    for (const tm of TIER_META) {
      const list = topo.nodes
        .filter((n) => n.subnet === tm.key && n.type !== "threat")
        .sort((a, b) => (a.onPath === b.onPath ? 0 : a.onPath ? -1 : 1) || a.label.localeCompare(b.label))
      if (!list.length) continue
      const colsUsed = Math.min(list.length, COLS)
      const colW = (X1 - X0) / colsUsed
      const rows = Math.ceil(list.length / colsUsed)
      list.forEach((node, i) => {
        const c = i % colsUsed
        const r = Math.floor(i / colsUsed)
        pos[node.id] = { x: X0 + (c + 0.5) * colW, y: cursorY + 36 + r * ROWH }
      })
      const h = 30 + rows * ROWH
      localBands.push({ key: tm.key, label: tm.label, y: cursorY, h })
      cursorY += h + 22
    }

    const bottom = Math.max(cursorY + 10, 130 + ext.length * 100)
    return { positions: pos, height: Math.max(480, bottom), bands: localBands }
  }, [topo.nodes])

  const lens = LENS_COLOR[activeLens]
  const stroke = isDark ? lens.dark : lens.light
  const selected = topo.nodes.find((n) => n.id === selectedId) ?? null

  return (
    <div
      data-testid="target-attack-map"
      className={`rounded-xl border p-4 transition-colors ${
        isDark ? "border-slate-800/50 bg-[#090D16]" : "border-slate-200 bg-white"
      }`}
    >
      {/* header: title + lens chips + theme toggle */}
      <div className="mb-3 flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-center sm:justify-between border-slate-200/60">
        <div>
          <h2 className={`flex items-center gap-2 text-sm font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>
            <Layers className="h-4 w-4 text-cyan-500" />
            Attack Path Topology
          </h2>
          <p className={`mt-0.5 font-mono text-[11px] ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            {topo.system} · blast {topo.score}
            {topo.jewelsReachable > 0
              ? ` · ${topo.jewelsReachable} jewel${topo.jewelsReachable === 1 ? "" : "s"} at risk`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex gap-1 rounded-lg border p-1 ${isDark ? "border-slate-800 bg-slate-950/80" : "border-slate-200 bg-slate-100"}`}>
            {(
              [
                { id: "reachability" as const, label: "Reachability", Icon: Zap },
                { id: "lateral" as const, label: "Lateral", Icon: Sliders },
                { id: "exfiltration" as const, label: "Exfiltration", Icon: Network },
              ]
            ).map(({ id, label, Icon }) => {
              const on = activeLens === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveLens(id)}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 font-mono text-xs transition-all ${
                    on
                      ? id === "reachability"
                        ? "bg-rose-100 text-rose-700 border border-rose-200"
                        : id === "lateral"
                          ? "bg-amber-100 text-amber-700 border border-amber-200"
                          : "bg-purple-100 text-purple-700 border border-purple-200"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => setIsDark((d) => !d)}
            title="Toggle theme"
            className={`rounded-lg border p-2 transition-all ${
              isDark ? "border-slate-800 bg-slate-950 text-amber-400" : "border-slate-300 bg-slate-100 text-indigo-600"
            }`}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* canvas */}
      <div
        className={`relative overflow-x-auto rounded-xl border ${
          isDark ? "border-slate-900 bg-slate-950/40" : "border-slate-200 bg-slate-50/60"
        }`}
      >
        <div className="relative mx-auto select-none" style={{ width: 1000, height }}>
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            <defs>
              {(["reachability", "lateral", "exfiltration"] as TargetLens[]).map((l) => (
                <marker key={l} id={`tam-arrow-${l}`} viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={isDark ? LENS_COLOR[l].dark : LENS_COLOR[l].light} />
                </marker>
              ))}
              <marker id="tam-arrow-mute" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={isDark ? "#475569" : "#cbd5e1"} />
              </marker>
            </defs>

            {/* containers */}
            <rect x="150" y="14" width="700" height={height - 28} rx="16" fill="none" stroke={isDark ? "#1e293b" : "#cbd5e1"} strokeWidth="1.5" strokeDasharray="5 5" />
            <text x="166" y="34" fill={isDark ? "#475569" : "#94a3b8"} fontSize="9" className="font-mono font-bold uppercase tracking-widest">
              AWS Cloud · {topo.system}
            </text>
            {/* subnet rows present in the data */}
            {bands.map((row) => (
              <g key={row.key}>
                <rect x="166" y={row.y} width="668" height={row.h} rx="10" fill={isDark ? "#0b111e" : "#f1f5f9"} stroke={isDark ? "#1e293b" : "#e2e8f0"} strokeWidth="1" />
                <text x="180" y={row.y + 16} fill={isDark ? "#64748b" : "#475569"} fontSize="8" className="font-mono font-semibold uppercase tracking-wider">
                  {row.label}
                </text>
              </g>
            ))}
            {/* external column */}
            <rect x="876" y="40" width="116" height={height - 80} rx="12" fill={isDark ? "#040810" : "#f8fafc"} stroke={isDark ? "#334155" : "#cbd5e1"} strokeWidth="1.5" strokeDasharray="2 4" />
            <text x="886" y="56" fill={isDark ? "#475569" : "#64748b"} fontSize="8" className="font-mono font-bold uppercase tracking-wider">
              Regional / Global
            </text>

            {/* edges */}
            {topo.edges.map((edge) => {
              const s = positions[edge.source]
              const t = positions[edge.target]
              if (!s || !t) return null
              const on = edge.lens === activeLens
              const col = on ? stroke : isDark ? "#1e293b" : "#e2e8f0"
              const marker = on ? `url(#tam-arrow-${edge.lens})` : "url(#tam-arrow-mute)"
              const dash = on ? (edge.evidence === "observed" ? undefined : "5 3") : "4 4"
              return (
                <g key={edge.id}>
                  <path d={`M ${s.x} ${s.y} L ${t.x} ${t.y}`} fill="none" stroke={col} strokeWidth={on ? 2.5 : 1.2} strokeDasharray={dash} markerEnd={marker} />
                  {on && edge.evidence === "observed" && (
                    <circle r="4" fill={col}>
                      <animateMotion path={`M ${s.x} ${s.y} L ${t.x} ${t.y}`} dur="2.4s" repeatCount="indefinite" />
                    </circle>
                  )}
                </g>
              )
            })}

            {/* lateral lens: shared-identity blast surface — sibling workloads
                that run the same on-path role can each reach the jewel. */}
            {activeLens === "lateral" && (() => {
              const role = topo.nodes.find((n) => n.type === "iam" && n.onPath)
              const rp = role ? positions[role.id] : null
              if (!rp) return null
              const amber = isDark ? "#fbbf24" : "#d97706"
              const sibs = topo.nodes.filter(
                (n) => (n.type === "compute" || n.type === "lambda") && n.id !== role!.id,
              )
              return (
                <g>
                  {sibs.map((n) => {
                    const p = positions[n.id]
                    if (!p) return null
                    return (
                      <g key={`lat-${n.id}`}>
                        <path d={`M ${p.x} ${p.y} L ${rp.x} ${rp.y}`} fill="none" stroke={amber} strokeWidth={1.8} strokeDasharray="5 4" opacity={0.85} markerEnd="url(#tam-arrow-lateral)" />
                        <circle r="3.4" fill={amber}>
                          <animateMotion path={`M ${p.x} ${p.y} L ${rp.x} ${rp.y}`} dur="2.6s" repeatCount="indefinite" />
                        </circle>
                      </g>
                    )
                  })}
                  <text x={rp.x} y={rp.y - 36} textAnchor="middle" fontSize={9} fontWeight={700} fill={amber}>
                    {`shared hub · ${topo.sharedWorkloads.length + 1} workloads → ${topo.jewelsReachable || 1} jewel${topo.jewelsReachable === 1 ? "" : "s"}`}
                  </text>
                </g>
              )
            })()}
          </svg>

          {/* node cards */}
          {topo.nodes.map((node: TargetNode) => {
            const c = positions[node.id]
            if (!c) return null
            const isSel = selectedId === node.id
            const dim = !node.onPath && !node.isCrownJewel && node.type !== "threat"
            // network controls (SG/NACL) are not workloads — render as a compact chip
            if (node.type === "sg") {
              return (
                <button
                  type="button"
                  key={node.id}
                  onClick={() => setSelectedId(node.id)}
                  style={{ left: c.x - 52, top: c.y - 13 }}
                  className={`absolute z-10 flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[9px] transition-all ${
                    isDark ? "border-cyan-500/40 bg-slate-950/90 text-cyan-300" : "border-cyan-300 bg-cyan-50 text-cyan-700"
                  } ${isSel ? "ring-2 ring-cyan-400" : ""} ${dim ? "opacity-60" : ""}`}
                >
                  <Shield className="h-3 w-3 shrink-0" />
                  <span className="max-w-[90px] truncate">{node.label}</span>
                </button>
              )
            }
            return (
              <button
                type="button"
                key={node.id}
                onClick={() => setSelectedId(node.id)}
                style={{ left: c.x - 65, top: c.y - 30 }}
                className={`absolute z-10 flex h-[60px] w-[130px] flex-col justify-between rounded-lg border p-2 text-left transition-all ${
                  node.isCrownJewel
                    ? isDark
                      ? "border-amber-500/80 bg-amber-950/60 text-amber-100"
                      : "border-amber-400 bg-amber-50/90 text-amber-950 shadow-sm"
                    : isDark
                      ? "border-slate-800 bg-slate-950/90 hover:border-slate-600"
                      : "border-slate-200 bg-white shadow-sm hover:border-slate-400"
                } ${isSel ? "ring-2 ring-cyan-400 scale-[1.04]" : ""} ${dim ? "opacity-50" : ""}`}
              >
                <div className="flex items-center gap-1 truncate">
                  <span className={`rounded border p-1 ${isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50"}`}>
                    {nodeIcon(node.type, isDark)}
                  </span>
                  <span className={`truncate text-[10px] font-bold ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                    {node.label}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`truncate font-mono text-[8px] ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                    {node.subLabel}
                  </span>
                  {node.isCrownJewel && node.jewelTier && (
                    <span className={`rounded px-1 font-mono text-[7px] font-extrabold ${isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-100 text-amber-800"}`}>
                      CJ-{node.jewelTier}
                    </span>
                  )}
                </div>
              </button>
            )
          })}

          {/* constraint chips on edge midpoints */}
          {topo.constraints.map((cn, idx) => {
            const edge = topo.edges.find((e) => e.id === cn.edgeId)
            if (!edge) return null
            const s = positions[edge.source]
            const t = positions[edge.target]
            if (!s || !t) return null
            const x = (s.x + t.x) / 2 - 38
            const y = (s.y + t.y) / 2 - 10 + idx * 20
            return (
              <div
                key={`${cn.edgeId}-${idx}`}
                style={{ left: x, top: y }}
                className={`pointer-events-none absolute z-20 rounded border px-1.5 py-0.5 font-mono text-[8px] shadow ${
                  isDark ? "border-slate-800 bg-slate-950/90 text-cyan-400" : "border-slate-200 bg-white text-cyan-700"
                }`}
              >
                🛡 {cn.label}
              </div>
            )
          })}
        </div>
      </div>

      {/* legend */}
      <div className={`mt-3 flex flex-wrap items-center gap-4 rounded-lg border p-2.5 text-[10px] ${isDark ? "border-slate-900 bg-slate-950/50" : "border-slate-200 bg-slate-50"}`}>
        <span className="font-mono uppercase tracking-wider text-slate-400">Lens:</span>
        {(["reachability", "lateral", "exfiltration"] as TargetLens[]).map((l) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3.5" style={{ background: isDark ? LENS_COLOR[l].dark : LENS_COLOR[l].light }} />
            <span className={`font-mono capitalize ${isDark ? "text-slate-400" : "text-slate-600"}`}>{l}</span>
          </span>
        ))}
        {selected && (
          <span className="ml-auto flex items-center gap-1 font-mono text-slate-500">
            <ArrowRight className="h-3 w-3 text-rose-400" />
            {selected.label}
          </span>
        )}
      </div>
    </div>
  )
}
