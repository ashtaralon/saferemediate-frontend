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

      {/* THE 5-LANE FLOW — the actual map */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {projected ? (
          <FiveLaneFlow projected={projected} />
        ) : (
          <div className="text-sm text-slate-500 italic">
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
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b border-slate-800/60 bg-slate-950/95 backdrop-blur sticky top-0 z-10 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5 flex items-center gap-1.5">
            <ArrowUpRight className="h-3 w-3 text-amber-300" />
            EXFIL VIEW · where the data leaves
            <FreshnessBanner variant="pill" className="ml-2" />
          </div>
        </div>
        {jewel && (
          <div className="text-right shrink-0">
            <div className="flex items-center gap-1.5 justify-end mb-0.5">
              <Crown className="h-3 w-3 text-amber-400" />
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                source
              </span>
            </div>
            <div
              className="text-xs font-mono text-amber-200/90 break-all max-w-[520px]"
              title={jewel.name}
            >
              {jewel.name}
            </div>
          </div>
        )}
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
  return (
    <div className="px-6 py-3 border-b border-slate-800 bg-slate-900/40">
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className={`px-2.5 py-1 rounded border text-[10px] uppercase tracking-wider font-bold ${verdictTone}`}
        >
          {verdictLabel}
        </span>
        <span className="text-sm text-slate-200">
          {observedCount > 0 ? (
            <>
              Data{" "}
              <strong className="text-red-300">does leave</strong> this
              jewel via{" "}
              <strong>{observedCount}</strong> observed reader
              {observedCount === 1 ? "" : "s"}
            </>
          ) : (
            <>
              No observed exfil yet — <strong>{capableCount}</strong>{" "}
              capable reader{capableCount === 1 ? "" : "s"} could
            </>
          )}{" "}
          across <strong>{pathCount}</strong> path
          {pathCount === 1 ? "" : "s"} to{" "}
          <strong>{destCount}</strong> destination
          {destCount === 1 ? "" : "s"}.
        </span>
      </div>
      <div className="text-[11px] text-slate-500 mt-1.5">
        {accessorName ? (
          <>
            Currently inspecting:{" "}
            <span className="font-mono text-slate-300">{accessorName}</span>
            {channelLabel && (
              <>
                {" "}
                via <span className="text-slate-300">{channelLabel}</span>
              </>
            )}
            {" — "}data flows left to right; green=observed, gray=capable, dashed=configured-only.
          </>
        ) : (
          "Pick a path below to render its full exfil chain."
        )}
        {!observedAvailable && (
          <span className="ml-2 text-amber-300/70">
            · EXFILTRATED_TO collector pending — observed-exfil layer not yet
            wired (Phase D)
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
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const dotFor = (channel: string): string => {
    if (channel === "network_via_igw") return "bg-amber-400"
    if (channel === "serverless_direct") return "bg-violet-400"
    if (channel === "ec2_no_egress") return "bg-slate-300"
    if (channel === "direct_api") return "bg-rose-400"
    return "bg-slate-300"
  }

  const selected = paths.find((p) => p.path_id === selectedPathId) ?? paths[0]
  if (!selected) return null

  return (
    <div className="px-6 py-2 border-b border-slate-800/60 bg-slate-900/30">
      <div ref={containerRef} className="relative inline-block">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-600/60 bg-slate-800/60 hover:bg-slate-800 px-3 py-1 text-xs font-medium text-slate-100"
          title="Switch exfil path"
        >
          <Route className="h-3 w-3 text-slate-400" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Path {paths.indexOf(selected) + 1}/{paths.length}
          </span>
          <span className={`h-1.5 w-1.5 rounded-full ${dotFor(selected.channel)}`} />
          <span className="truncate max-w-[260px]">
            {selected.accessor_name} · {selected.channel_label}
          </span>
          <ChevronDown
            className={`h-3 w-3 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open && (
          <div className="absolute top-full left-0 mt-1.5 z-50 w-[440px] max-w-[calc(100vw-32px)] rounded-lg border border-slate-700 bg-slate-900 shadow-2xl ring-1 ring-black/40">
            <div className="px-3 py-2 border-b border-slate-800 text-[9px] font-bold uppercase tracking-wider text-slate-500">
              {paths.length} path{paths.length === 1 ? "" : "s"} — pick one to inspect
            </div>
            <div className="max-h-[60vh] overflow-y-auto py-1">
              {paths.map((p, idx) => {
                const isSel = p.path_id === selectedPathId
                const observed = p.accessor_provenance === "observed"
                return (
                  <button
                    key={p.path_id}
                    type="button"
                    onClick={() => {
                      onSelect(p.path_id)
                      setOpen(false)
                    }}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors ${
                      isSel ? "bg-slate-800/80" : "hover:bg-slate-800/50"
                    }`}
                  >
                    <span className="text-[9px] font-mono text-slate-500 w-4 shrink-0">
                      {idx + 1}
                    </span>
                    <span className={`h-2 w-2 rounded-full shrink-0 ${dotFor(p.channel)}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-slate-200 truncate">
                          {p.accessor_name}
                        </span>
                        <span
                          className={`text-[8px] uppercase tracking-wider font-bold ${
                            observed ? "text-red-300" : "text-amber-300"
                          }`}
                        >
                          {observed ? "observed" : "capable"}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {p.channel_label} · {p.workload_count} workload
                        {p.workload_count === 1 ? "" : "s"} · {p.gateway_count}{" "}
                        gateway{p.gateway_count === 1 ? "" : "s"}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
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

  return (
    <div ref={containerRef} className="relative">
      {/* Lane headers — icon + label + operator question */}
      <div className="grid grid-cols-5 gap-3 mb-3">
        {EXFIL_LANES.map((lane) => {
          const Icon = lane.icon
          const count = projected.nodesByLane[lane.id].length
          return (
            <div key={lane.id} className="text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Icon className="w-4 h-4" style={{ color: lane.accent }} />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-200">
                  {lane.label}
                </span>
                {count > 0 && (
                  <span className="text-[10px] text-slate-500">
                    ({count})
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-500 italic leading-tight">
                {lane.question}
              </div>
            </div>
          )
        })}
      </div>

      {/* Lane bodies */}
      <div className="grid grid-cols-5 gap-3 relative">
        {EXFIL_LANES.map((lane) => {
          const nodes = projected.nodesByLane[lane.id]
          return (
            <div
              key={lane.id}
              className="min-h-[260px] bg-slate-900/40 border border-slate-800 rounded p-2 space-y-2"
              style={{ borderLeftColor: lane.accent, borderLeftWidth: 3 }}
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

        {/* SVG flow lines — drawn last so they overlay */}
        <FlowLines
          hops={projected.hops}
          positions={nodePositions}
        />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5 bg-red-400 rounded" />
          <span className="text-slate-300">Observed traffic (animated)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-0.5 rounded"
            style={{
              borderTop: "2px dashed #94a3b8",
              borderRadius: 0,
            }}
          />
          <span className="text-slate-300">Capable / configured only</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: "#10b981" }}
          />
          <span className="text-slate-300">Evidence: observed</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: "#94a3b8" }}
          />
          <span className="text-slate-300">Evidence: capable</span>
        </span>
      </div>
    </div>
  )
}

// ─── Node card ───────────────────────────────────────────────────

function NodeCard({
  node,
  setRef,
}: {
  node: LaneNode
  setRef: (el: HTMLDivElement | null) => void
}) {
  const shortLabel = shortName(node.name, 22)
  const isJewel = node.isCrownJewel
  return (
    <div
      ref={setRef}
      className={`relative px-2.5 py-2 rounded text-[11px] border transition-colors ${
        isJewel
          ? "bg-amber-900/30 border-amber-500/60"
          : "bg-slate-800/80 border-slate-700 hover:border-slate-600"
      }`}
      title={`${node.type}: ${node.name}`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: evidenceDot(node.evidence) }}
        />
        <span className="text-slate-100 truncate flex-1 font-mono">
          {shortLabel}
        </span>
      </div>
      <div className="text-[9px] text-slate-500 mt-0.5 truncate uppercase tracking-wider">
        {node.type}
      </div>
      {/* Compact stats — one row of evidence chips */}
      {(node.meta?.used !== undefined ||
        (node.meta?.hits !== undefined && node.meta.hits > 0) ||
        node.meta?.synthetic) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {node.meta?.used !== undefined && node.meta.allowed !== undefined && (
            <span className="px-1.5 py-0.5 rounded text-[9px] border bg-slate-700/60 border-slate-600 text-slate-300">
              {node.meta.used}/{node.meta.allowed} actions used
            </span>
          )}
          {node.meta?.hits !== undefined && node.meta.hits > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[9px] border bg-emerald-900/30 border-emerald-500/40 text-emerald-200">
              {compactNum(node.meta.hits)} hits
            </span>
          )}
          {node.meta?.synthetic && (
            <span className="px-1.5 py-0.5 rounded text-[9px] border bg-cyan-900/30 border-cyan-500/40 text-cyan-200">
              service plane
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function compactNum(n: number): string {
  if (!isFinite(n) || n < 1) return "0"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return String(Math.round(n))
}

// ─── Flow lines (SVG with marching dashes on observed) ───────────

function FlowLines({
  hops,
  positions,
}: {
  hops: ExfilHop[]
  positions: Map<string, { x: number; y: number; w: number; h: number }>
}) {
  if (positions.size === 0) return null

  // For each hop, compute endpoints anchored to the right edge of
  // source and left edge of target — gives a clean left-to-right flow.
  const lines = hops
    .map((hop, i) => {
      const a = positions.get(hop.source_id)
      const b = positions.get(hop.target_id)
      if (!a || !b) return null
      const x1 = a.x + a.w
      const y1 = a.y + a.h / 2
      const x2 = b.x
      const y2 = b.y + b.h / 2
      // Smooth horizontal curve between the two endpoints
      const dx = Math.max(40, (x2 - x1) / 2)
      const c1x = x1 + dx
      const c1y = y1
      const c2x = x2 - dx
      const c2y = y2
      const d = `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`
      const observed = hop.evidence === "observed"
      const stroke = observed ? "#f87171" : "#94a3b8"
      // Marching dashes — animated on observed; static dashes on
      // capable/config so the difference reads at a glance.
      const dasharray = observed ? "8 6" : "4 4"
      return (
        <g key={`hop-${i}`}>
          <path
            d={d}
            stroke={stroke}
            strokeWidth={observed ? 2 : 1.5}
            fill="none"
            strokeDasharray={dasharray}
            opacity={observed ? 0.95 : 0.65}
            style={
              observed
                ? {
                    animation: `exfil-march 0.9s linear infinite`,
                  }
                : undefined
            }
          />
        </g>
      )
    })
    .filter(Boolean)

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
        <marker
          id="exfil-arrow-observed"
          markerWidth="6"
          markerHeight="6"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="#f87171" />
        </marker>
        <marker
          id="exfil-arrow-capable"
          markerWidth="6"
          markerHeight="6"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
        </marker>
      </defs>
      {lines}
    </svg>
  )
}
