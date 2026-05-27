"use client"

/**
 * EXFIL View v4 — attacker-view-style 5-lane flow renderer.
 *
 * Alon, 2026-05-27: "i want u to present the map out at the same way
 * you present the path to the CJ in the attacker view map, simple
 * flow, dynamic." This is the rebuild — drops the dense 5-column TFM
 * sidebar layout and mirrors attacker-view-v3's structure:
 *
 *   CROWN JEWEL → READER → WORKLOAD → EGRESS GATE → DESTINATION
 *
 * 5 lanes left-to-right. HTML+CSS grid for the lane bodies, SVG
 * connection layer drawn last for the flow lines, marching-dashes
 * animation on observed edges so the operator SEES data moving.
 *
 * Every line corresponds to a real EXFIL edge (the response's path
 * + workload_sample + gateway_sample + destinations). Inversion
 * vs attacker view: BFS-forward from the jewel, so "the source" is
 * the leftmost lane and "where it ends up" is the rightmost.
 *
 * Reads the existing /api/proxy/attack-chain/exfil-paths response —
 * no backend change. Drop-in replacement for ExfilViewV3 in the
 * attack-paths-v2 parent.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  Crown,
  Globe,
  Key,
  RefreshCw,
  Route,
  Server,
} from "lucide-react"
import { useRetryFetch } from "@/lib/use-retry-fetch"
import { FreshnessBanner } from "@/components/freshness-banner"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"

// ─── Lane definitions ────────────────────────────────────────────
// 5 lanes — operator's mental model of data egress. Each has an
// accent color + an "operator question" line that primes them to
// READ the column before parsing chips inside it.

interface ExfilLane {
  id: "jewel" | "reader" | "workload" | "egress" | "dest"
  label: string
  accent: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  question: string
}

const EXFIL_LANES: ExfilLane[] = [
  {
    id: "jewel",
    label: "Crown Jewel",
    accent: "#f59e0b",
    icon: Crown,
    question: "What's leaving?",
  },
  {
    id: "reader",
    label: "Reader",
    accent: "#ec4899",
    icon: Key,
    question: "Who reads it?",
  },
  {
    id: "workload",
    label: "Workload",
    accent: "#3b82f6",
    icon: Server,
    question: "What runs the read?",
  },
  {
    id: "egress",
    label: "Egress Gate",
    accent: "#06b6d4",
    icon: Globe,
    question: "How does it leave?",
  },
  {
    id: "dest",
    label: "Destination",
    accent: "#ef4444",
    icon: ArrowUpRight,
    question: "Where does it go?",
  },
]

// Evidence semantics — same as attacker-view-v3 for visual parity.
function evidenceDot(evidence: string): string {
  if (evidence === "observed") return "#10b981"
  if (evidence === "config" || evidence === "capable") return "#94a3b8"
  return "#f59e0b"
}

// ─── Response types — mirror api/exfil_paths.py exactly ──────────

interface ExfilAccessor {
  id: string
  name: string
  type: string
  provenance: "capable" | "observed"
  allowed_actions_count: number | null
  used_actions_count: number | null
  unused_actions_count: number | null
  hit_count: number
  total_bytes: number
  last_seen: string | null
}

interface ExfilPath {
  path_id: string
  accessor_id: string
  accessor_name: string
  accessor_type: string
  accessor_provenance: "capable" | "observed"
  channel: string
  channel_label: string
  jewel_hits: number
  workload_count: number
  workload_sample: Array<{ id: string; name: string; type: string }>
  gateway_count: number
  gateway_sample: Array<{ id: string; name: string; kind: string }>
}

interface ExfilDestination {
  kind: "internet" | "external_account" | "external_region"
  id: string
  label: string
  capable_route_count: number
  observed_route_count: number
  observed_bytes_24h: number
  icon: string
  provenance: "capable" | "observed"
}

interface ExfilPayload {
  ok: boolean
  error?: string
  jewel: { id: string; name: string; type: string; classification: string | null }
  accessors: ExfilAccessor[]
  paths?: ExfilPath[]
  destinations: ExfilDestination[]
  observed_exfil: { available: boolean; not_wired_reason: string }
}

// ─── Lane projection ─────────────────────────────────────────────

interface LaneNode {
  id: string
  name: string
  type: string
  lane: ExfilLane["id"]
  evidence: "observed" | "config" | "capable" | "unknown"
  isCrownJewel?: boolean
  // Extra display state — usage gap, hit count, etc.
  meta?: {
    used?: number
    allowed?: number
    hits?: number
    bytes?: number
    synthetic?: boolean
  }
}

interface ExfilHop {
  source_id: string
  target_id: string
  label: string
  evidence: "observed" | "config" | "capable"
}

interface ProjectedExfil {
  nodesByLane: Record<ExfilLane["id"], LaneNode[]>
  hops: ExfilHop[]
}

function shortName(name: string, maxLen = 22): string {
  if (!name) return ""
  if (name.length <= maxLen) return name
  const half = Math.floor((maxLen - 1) / 2)
  return name.slice(0, half) + "…" + name.slice(-(maxLen - half - 1))
}

function projectExfil(
  payload: ExfilPayload,
  selectedPath: ExfilPath | null,
): ProjectedExfil {
  const nodesByLane: Record<ExfilLane["id"], LaneNode[]> = {
    jewel: [],
    reader: [],
    workload: [],
    egress: [],
    dest: [],
  }
  const hops: ExfilHop[] = []
  if (!payload || !selectedPath) return { nodesByLane, hops }

  // 1. CROWN JEWEL — always the leftmost lane, single chip
  nodesByLane.jewel.push({
    id: payload.jewel.id,
    name: payload.jewel.name,
    type: payload.jewel.type,
    lane: "jewel",
    evidence: "observed",
    isCrownJewel: true,
  })

  // 2. READER — the accessor role for this path
  const accessor = payload.accessors.find(
    (a) => a.id === selectedPath.accessor_id,
  )
  if (accessor) {
    nodesByLane.reader.push({
      id: accessor.id,
      name: accessor.name,
      type: accessor.type,
      lane: "reader",
      evidence: accessor.provenance === "observed" ? "observed" : "capable",
      meta: {
        used: accessor.used_actions_count ?? undefined,
        allowed: accessor.allowed_actions_count ?? undefined,
        hits: accessor.hit_count,
        bytes: accessor.total_bytes,
      },
    })
    hops.push({
      source_id: payload.jewel.id,
      target_id: accessor.id,
      label: "ACCESSED BY",
      evidence: accessor.provenance === "observed" ? "observed" : "capable",
    })
  }

  // 3. WORKLOAD — what runs the accessor role
  for (const w of selectedPath.workload_sample ?? []) {
    if (!w?.id) continue
    nodesByLane.workload.push({
      id: w.id,
      name: w.name,
      type: w.type,
      lane: "workload",
      // Workload presence is observed (graph evidence); whether it
      // actually exercises the role we treat as capable for now.
      evidence: "config",
    })
    if (accessor) {
      hops.push({
        source_id: accessor.id,
        target_id: w.id,
        label: "USED BY",
        evidence: "config",
      })
    }
  }

  // 4. EGRESS GATE — real gateways if present, else a synthetic
  // AWS-Service-Plane chip so the lane never reads empty for serverless
  // / API-direct paths. The synthetic flag drives a distinct visual.
  if ((selectedPath.gateway_sample ?? []).length > 0) {
    for (const g of selectedPath.gateway_sample ?? []) {
      if (!g?.id) continue
      nodesByLane.egress.push({
        id: g.id,
        name: g.name,
        type: g.kind,
        lane: "egress",
        evidence: "config",
      })
      for (const w of selectedPath.workload_sample ?? []) {
        hops.push({
          source_id: w.id,
          target_id: g.id,
          label: "ROUTES VIA",
          evidence: "config",
        })
      }
    }
  } else {
    // Serverless / API-direct path — no real gateway, the data leaves
    // via the AWS service plane (public S3/DDB/etc endpoint).
    const syntheticGateId = `aws-service-plane:${selectedPath.path_id}`
    nodesByLane.egress.push({
      id: syntheticGateId,
      name: "AWS Service Plane",
      type: "Public endpoint",
      lane: "egress",
      evidence: "config",
      meta: { synthetic: true },
    })
    for (const w of selectedPath.workload_sample ?? []) {
      hops.push({
        source_id: w.id,
        target_id: syntheticGateId,
        label: "API VIA",
        evidence: "config",
      })
    }
  }

  // 5. DESTINATION — Internet / external account / external region.
  // We use the response's destinations[] which is jewel-scoped (not
  // per-path), but rendering all of them in the rightmost lane is
  // honest — they're where data could leave from this jewel.
  for (const d of payload.destinations ?? []) {
    nodesByLane.dest.push({
      id: d.id,
      name: d.label,
      type: d.kind,
      lane: "dest",
      evidence: d.provenance === "observed" ? "observed" : "capable",
      meta: {
        hits: d.observed_route_count,
        bytes: d.observed_bytes_24h,
      },
    })
    // egress → destination edges
    for (const g of nodesByLane.egress) {
      hops.push({
        source_id: g.id,
        target_id: d.id,
        label: "EGRESS TO",
        evidence: d.provenance === "observed" ? "observed" : "capable",
      })
    }
  }

  return { nodesByLane, hops }
}

// ─── Component ───────────────────────────────────────────────────

export interface ExfilViewV4Props {
  systemName: string
  jewel: CrownJewelSummary | null
}

export function ExfilViewV4({ systemName, jewel }: ExfilViewV4Props) {
  const requestBody = useMemo(
    () =>
      JSON.stringify({
        system_name: systemName,
        jewel_id: jewel?.id ?? "",
        include_capable: true,
        include_observed: true,
        max_destinations: 50,
        include_atlas: false,
      }),
    [systemName, jewel?.id],
  )

  const fetchInit = useMemo<RequestInit>(
    () => ({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    }),
    [requestBody],
  )

  const enabled = !!systemName && !!jewel?.id
  const { data, loading, error, retry, retrying, attempt } =
    useRetryFetch<ExfilPayload>(enabled ? "/api/proxy/attack-chain/exfil-paths" : null, {
      fetchInit,
      refetchKey: `${systemName}:${jewel?.id ?? ""}`,
      maxRetries: 2,
      initialDelayMs: 1000,
    })

  const [selectedPathId, setSelectedPathId] = useState<string | null>(null)

  useEffect(() => {
    if (!data?.paths || data.paths.length === 0) {
      setSelectedPathId(null)
      return
    }
    if (
      selectedPathId &&
      data.paths.some((p) => p.path_id === selectedPathId)
    ) {
      return
    }
    setSelectedPathId(data.paths[0]?.path_id ?? null)
  }, [data, selectedPathId])

  const selectedPath = useMemo<ExfilPath | null>(() => {
    if (!data?.paths || !selectedPathId) return null
    return data.paths.find((p) => p.path_id === selectedPathId) ?? null
  }, [data, selectedPathId])

  const projected = useMemo<ProjectedExfil | null>(() => {
    if (!data || !data.ok || !selectedPath) return null
    return projectExfil(data, selectedPath)
  }, [data, selectedPath])

  if (!enabled) {
    return (
      <ViewShell jewel={jewel}>
        <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
          Select a crown jewel to see its exfil path.
        </div>
      </ViewShell>
    )
  }

  if (loading) {
    const retryLabel =
      retrying && attempt > 0
        ? `Backend was slow — retrying (attempt ${attempt + 1})…`
        : "Walking forward from the jewel — mapping every door the data can leave through…"
    return (
      <ViewShell jewel={jewel}>
        <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          {retryLabel}
        </div>
      </ViewShell>
    )
  }

  if (error || !data || !data.ok) {
    const msg = error || data?.error || "Exfil paths failed"
    return (
      <ViewShell jewel={jewel}>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 max-w-md text-sm text-red-200">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-semibold">Exfil view failed</span>
            </div>
            <div className="text-xs text-red-200/80">{msg}</div>
            <button
              type="button"
              onClick={retry}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-500/20"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          </div>
        </div>
      </ViewShell>
    )
  }

  const paths = data.paths ?? []
  const obs = data.observed_exfil
  const observedCount = data.accessors.filter((a) => a.provenance === "observed").length
  const capableCount = data.accessors.filter((a) => a.provenance === "capable").length

  return (
    <ViewShell jewel={jewel}>
      {/* TOP NARRATIVE BAR — the human-readable story line. */}
      <NarrativeBar
        jewelName={data.jewel.name}
        accessorName={selectedPath?.accessor_name}
        channelLabel={selectedPath?.channel_label}
        observedCount={observedCount}
        capableCount={capableCount}
        pathCount={paths.length}
        destCount={data.destinations.length}
        observedAvailable={obs.available}
      />

      {/* PATH SELECTOR — switch which (accessor, channel) is on the canvas */}
      {paths.length > 0 && (
        <PathSelector
          paths={paths}
          selectedPathId={selectedPathId}
          onSelect={setSelectedPathId}
        />
      )}

      {/* THE 5-LANE FLOW — the actual map. Matches attacker view's
          `overflow-auto p-4` outer container. */}
      <div className="overflow-auto p-4">
        {projected ? (
          <FiveLaneFlow projected={projected} />
        ) : (
          <div className="text-sm text-slate-500 italic px-2">
            No exfil path resolved for this jewel.
          </div>
        )}
      </div>
    </ViewShell>
  )
}

// ─── Shell ───────────────────────────────────────────────────────

function ViewShell({
  jewel,
  children,
}: {
  jewel: CrownJewelSummary | null
  children: React.ReactNode
}) {
  // Byte-equivalent to attacker-view-v3's outer + header
  // (lines 445-481). Background, divider, eyebrow, headline.
  return (
    <div className="flex flex-col h-full overflow-y-auto bg-[#0f172a] text-slate-100">
      <div className="px-4 py-3 border-b border-slate-700/60 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <ArrowUpRight className="h-3 w-3 text-amber-300" />
            EXFIL VIEW · v0.1 · 5-Lane Egress Map
            <FreshnessBanner variant="pill" className="ml-2" />
          </div>
          <div className="text-sm font-semibold text-slate-100 mt-0.5">
            {jewel?.name ?? "(no jewel)"}{" "}
            {jewel?.type && (
              <span className="text-xs text-slate-400 font-normal">
                ({jewel.type})
              </span>
            )}
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}

// ─── Narrative bar — the "what story is this?" panel ─────────────

function NarrativeBar({
  jewelName,
  accessorName,
  channelLabel,
  observedCount,
  capableCount,
  pathCount,
  destCount,
  observedAvailable,
}: {
  jewelName: string
  accessorName: string | undefined
  channelLabel: string | undefined
  observedCount: number
  capableCount: number
  pathCount: number
  destCount: number
  observedAvailable: boolean
}) {
  const verdictTone =
    observedCount > 0
      ? "bg-red-500/15 text-red-200 border-red-500/40"
      : capableCount > 0
        ? "bg-amber-500/15 text-amber-200 border-amber-500/40"
        : "bg-emerald-500/15 text-emerald-200 border-emerald-500/40"
  const verdictLabel =
    observedCount > 0
      ? "OBSERVED exfil"
      : capableCount > 0
        ? "Capable exfil"
        : "No reach"
  // Same shape as attacker-view-v3's ChainSummaryBar (lines 649-700) —
  // 10px uppercase eyebrow with stats inline.
  return (
    <div className="px-4 py-2 border-b border-slate-700/40">
      <div className="flex items-center gap-2 mb-1 text-[10px] text-slate-400 uppercase tracking-wider flex-wrap">
        <span>{pathCount} paths</span>
        <span
          className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${verdictTone}`}
        >
          {verdictLabel}
        </span>
        <span>
          <strong className="text-slate-200">{observedCount}</strong> observed
        </span>
        <span>·</span>
        <span>
          <strong className="text-slate-200">{capableCount}</strong> capable
        </span>
        <span>·</span>
        <span>
          <strong className="text-slate-200">{destCount}</strong> destination
          {destCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="text-xs text-slate-300">
        {accessorName ? (
          <>
            <span className="font-mono text-slate-200">{accessorName}</span>{" "}
            <span className="text-slate-500">via</span>{" "}
            <span className="text-slate-200">{channelLabel}</span>{" "}
            <span className="text-slate-500">
              — data flows left → right; green=observed, gray=capable, dashed=configured-only.
            </span>
          </>
        ) : (
          <span className="text-slate-500">
            Pick a path to render its exfil chain.
          </span>
        )}
        {!observedAvailable && (
          <span className="ml-2 text-amber-300/70 text-[11px]">
            · EXFILTRATED_TO collector pending (Phase D)
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Path selector ───────────────────────────────────────────────

function PathSelector({
  paths,
  selectedPathId,
  onSelect,
}: {
  paths: ExfilPath[]
  selectedPathId: string | null
  onSelect: (id: string) => void
}) {
  // Mirror attacker-view-v3's selector — inline buttons, no dropdown.
  // Operator scans all paths at once instead of clicking to expand.
  if (paths.length === 0) return null

  const toneFor = (observed: boolean) =>
    observed
      ? "bg-red-900/30 border-red-500/50 text-red-200"
      : "bg-amber-900/20 border-amber-500/40 text-amber-200"

  return (
    <div className="px-4 py-2 border-b border-slate-700/40">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-slate-400 mr-1">
          Paths
        </span>
        {paths.map((p, idx) => {
          const isSel = p.path_id === selectedPathId
          const observed = p.accessor_provenance === "observed"
          return (
            <button
              key={p.path_id}
              type="button"
              onClick={() => onSelect(p.path_id)}
              className={`px-2 py-1 rounded border text-[10px] font-mono transition-colors ${toneFor(
                observed,
              )} ${
                isSel
                  ? "ring-2 ring-slate-100/30 ring-offset-1 ring-offset-slate-900"
                  : "opacity-70 hover:opacity-100"
              }`}
              title={`${p.accessor_name} via ${p.channel_label} · ${p.workload_count} workload${p.workload_count === 1 ? "" : "s"} · ${p.gateway_count} gateway${p.gateway_count === 1 ? "" : "s"}`}
            >
              <span className="text-[8px] uppercase tracking-wider opacity-70 mr-1">
                #{idx + 1}
              </span>
              <span className="truncate">
                {shortName(p.accessor_name, 18)} · {p.channel_label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── The 5-lane flow renderer ────────────────────────────────────

function FiveLaneFlow({ projected }: { projected: ProjectedExfil }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const [nodePositions, setNodePositions] = useState<
    Map<string, { x: number; y: number; w: number; h: number }>
  >(new Map())

  // Measure node positions for SVG line drawing — same approach as
  // attacker-view-v3's ConnectionLayer.
  useEffect(() => {
    const measure = () => {
      if (!containerRef.current) return
      const container = containerRef.current.getBoundingClientRect()
      const positions = new Map<
        string,
        { x: number; y: number; w: number; h: number }
      >()
      cardRefs.current.forEach((el, id) => {
        if (!el) return
        const r = el.getBoundingClientRect()
        positions.set(id, {
          x: r.left - container.left,
          y: r.top - container.top,
          w: r.width,
          h: r.height,
        })
      })
      setNodePositions(positions)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (containerRef.current) ro.observe(containerRef.current)
    window.addEventListener("resize", measure)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [projected])

  // ATTACKER-VIEW-V3 CLONE — same grid + lane header + lane body
  // shape as attacker-view-v3.tsx lines 789-858. Only differences:
  // 5 columns instead of 9 (the EXFIL stage count), and the lane
  // accents/labels reflect EXFIL semantics. Every CSS class below
  // is copied verbatim from the attacker view file.
  return (
    <div ref={containerRef} className="relative">
      {/* Lane headers — verbatim from attacker-view-v3 lines 791-813 */}
      <div className="grid grid-cols-5 gap-2 mb-2">
        {EXFIL_LANES.map((lane) => {
          const Icon = lane.icon
          const count = projected.nodesByLane[lane.id].length
          return (
            <div key={lane.id} className="text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Icon className="w-3.5 h-3.5" style={{ color: lane.accent }} />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                  {lane.label}
                </span>
                {count > 0 ? (
                  <span className="text-[10px] text-slate-400">({count})</span>
                ) : null}
              </div>
              <div className="text-[9px] text-slate-500 italic px-1 leading-tight">
                {lane.question}
              </div>
            </div>
          )
        })}
      </div>

      {/* Lane bodies — verbatim from attacker-view-v3 lines 815-848 */}
      <div className="grid grid-cols-5 gap-2 relative">
        {EXFIL_LANES.map((lane) => {
          const nodes = projected.nodesByLane[lane.id]
          return (
            <div
              key={lane.id}
              className="min-h-[300px] bg-slate-900/40 border border-slate-800 rounded p-1.5 space-y-1.5"
              style={{ borderLeftColor: lane.accent, borderLeftWidth: 2 }}
            >
              {nodes.length === 0 ? (
                <div className="text-[10px] text-slate-500 italic px-2 py-3 text-center">
                  No {lane.label.toLowerCase()} on this path
                </div>
              ) : (
                nodes.map((n) => (
                  <NodeCard
                    key={n.id}
                    node={n}
                    setRef={(el) => {
                      cardRefs.current.set(n.id, el)
                    }}
                  />
                ))
              )}
            </div>
          )
        })}

        {/* SVG connection layer — verbatim from attacker-view-v3
            ConnectionLayer (lines 1117-1202), with marching-dash
            animation added ONLY for observed edges (the dynamic
            element the user asked for). */}
        <ConnectionLayer
          hops={projected.hops}
          positions={nodePositions}
        />
      </div>
    </div>
  )
}

// ─── Node card ───────────────────────────────────────────────────

// ATTACKER-VIEW-V3 CLONE — verbatim from lines 865-931. Crown jewel
// uses the same emerald-tinted treatment as attacker view's `data`
// lane. The chip classes (CHIP_RED/AMBER/GREEN/SLATE) and the
// posture-chip logic match the attacker-view-v3 patterns exactly.
const CHIP_GREEN = "bg-emerald-900/30 border-emerald-500/50 text-emerald-200"
const CHIP_SLATE = "bg-slate-700/60 border-slate-600 text-slate-300"
const CHIP_AMBER = "bg-amber-900/30 border-amber-500/50 text-amber-200"
const CHIP_CYAN = "bg-cyan-900/30 border-cyan-500/50 text-cyan-200"

function NodeCard({
  node,
  setRef,
}: {
  node: LaneNode
  setRef: (el: HTMLDivElement | null) => void
}) {
  const isCrownJewel = node.isCrownJewel
  const shortLabel =
    node.name.length > 22
      ? node.name.slice(0, 10) + "…" + node.name.slice(-10)
      : node.name

  // Build posture chips — same shape as attacker-view-v3's
  // buildNodeChips, scoped to the data we have for EXFIL nodes.
  const chips: Array<{ label: string; tone: string; tooltip?: string }> = []
  if (node.meta?.used !== undefined && node.meta?.allowed !== undefined) {
    const excess = node.meta.allowed - node.meta.used
    const tone =
      excess === 0
        ? CHIP_GREEN
        : excess <= 2
          ? CHIP_AMBER
          : CHIP_SLATE
    chips.push({
      label: `${node.meta.used}/${node.meta.allowed} used`,
      tone,
      tooltip:
        excess === 0
          ? "All allowed actions are observed in use"
          : `${excess} action${excess === 1 ? "" : "s"} allowed but never used — gap`,
    })
  }
  if (node.meta?.hits !== undefined && node.meta.hits > 0) {
    chips.push({
      label: `${compactNum(node.meta.hits)} hits`,
      tone: CHIP_GREEN,
      tooltip: "Observed access hit count",
    })
  }
  if (node.meta?.synthetic) {
    chips.push({
      label: "service plane",
      tone: CHIP_CYAN,
      tooltip: "AWS public API endpoint — IAM is the only gate",
    })
  }

  return (
    <div
      ref={setRef}
      className={`relative px-2 py-1.5 rounded text-[10px] border ${
        isCrownJewel
          ? "bg-emerald-900/40 border-emerald-500/60"
          : "bg-slate-800/80 border-slate-700"
      }`}
      title={`${node.type}: ${node.name}`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: evidenceDot(node.evidence) }}
        />
        <span className="text-slate-200 truncate flex-1 font-mono">
          {shortLabel}
        </span>
      </div>
      <div className="text-[9px] text-slate-500 mt-0.5 truncate">
        {node.type}
      </div>
      {chips.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {chips.map((c) => (
            <span
              key={c.label}
              className={`px-1.5 py-0.5 rounded text-[9px] border ${c.tone}`}
              title={c.tooltip || c.label}
            >
              {c.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function compactNum(n: number): string {
  if (!isFinite(n) || n < 1) return "0"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return String(Math.round(n))
}

// ATTACKER-VIEW-V3 CLONE — ConnectionLayer verbatim from lines
// 1117-1202. The ONE addition: marching-dashes animation applied
// only to observed edges (the "dynamic" element the user asked for;
// attacker-view-v3 itself has static lines). Removing the animation
// gives byte-identical attacker-view rendering.
function ConnectionLayer({
  hops,
  positions,
}: {
  hops: ExfilHop[]
  positions: Map<string, { x: number; y: number; w: number; h: number }>
}) {
  if (positions.size === 0) return null

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 5, width: "100%", height: "100%" }}
    >
      <style>{`
        @keyframes exfil-march {
          from { stroke-dashoffset: 0; }
          to   { stroke-dashoffset: -28; }
        }
      `}</style>
      <defs>
        {/* Arrowhead markers verbatim from attacker-view-v3 ConnectionLayer
            (lines 1149-1169). Two variants: observed (green) and
            config (slate). We add an additional "observed-red" variant
            for EXFIL because the "data leaving" framing reads more
            urgently in red than green. */}
        <marker
          id="exfil-arrow-observed"
          markerWidth="6"
          markerHeight="6"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="#10b981" />
        </marker>
        <marker
          id="exfil-arrow-config"
          markerWidth="6"
          markerHeight="6"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
        </marker>
      </defs>
      {hops.map((hop, i) => {
        const a = positions.get(hop.source_id)
        const b = positions.get(hop.target_id)
        if (!a || !b) return null
        // Anchor lines to the right edge of source + left edge of target
        // (same anchor pattern as attacker-view, but attacker-view uses
        // center-to-center — both work since cards are roughly aligned
        // by lane row).
        const x1 = a.x + a.w
        const y1 = a.y + a.h / 2
        const x2 = b.x
        const y2 = b.y + b.h / 2
        const observed = hop.evidence === "observed"
        // Same stroke values as attacker-view-v3 lines 1175-1183
        const stroke = observed
          ? "#10b981"
          : hop.evidence === "config" || hop.evidence === "capable"
            ? "#94a3b8"
            : "#f59e0b"
        const dash = observed ? "none" : "4 3"
        const marker = observed
          ? "url(#exfil-arrow-observed)"
          : "url(#exfil-arrow-config)"
        return (
          <g key={`${i}`}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={stroke}
              strokeWidth={1.4}
              strokeDasharray={dash}
              opacity={0.6}
              markerEnd={marker}
              style={
                observed
                  ? {
                      strokeDasharray: "6 6",
                      animation: "exfil-march 0.9s linear infinite",
                    }
                  : undefined
              }
            />
          </g>
        )
      })}
    </svg>
  )
}
