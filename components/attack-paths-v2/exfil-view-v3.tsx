"use client"

/**
 * EXFIL View v3 — single dynamic flow map (greenfield rebuild 2026-05-26).
 *
 * STRUCTURAL TWIN of attacker-view-panel.tsx: one Header + one full-
 * height TrafficFlowMap. No static lane grid, no embedded sub-map, no
 * NotWired footer — those layers from the prior v3 attempt produced
 * the "looks really messy and bad" reaction (Alon, 2026-05-26). This
 * file is the single-map rewrite.
 *
 * Direction inverted vs Attacker View — BFS-forward from the crown
 * jewel. The 9-lane design (exfil-map-design.md §3) is enforced by
 * mapping each lane to one of TFM's existing SystemArchitecture
 * fields, so the canvas naturally lays out 9 columns left-to-right:
 *
 *   1. CJ SOURCE            → entryPoints   (entryLaneLabel="Source")
 *   2. READER PRINCIPAL     → iamRoles + principals
 *   3. READER WORKLOAD      → computeServices
 *   4. STAGING              → (no collector today — honest absence,
 *                              no fabricated card)
 *   5. EGRESS GATE          → securityGroups + nacls
 *   6. EGRESS PATH          → subnets + egressGateways + vpcEndpoints
 *   7. EXFIL CHANNEL        → exfilGate  (typed virtual gate, strength-
 *                              colored: emerald/blue/amber)
 *   8. EXTERNAL DESTINATION → resources
 *   9. DEFENSE              → workloadNetwork banner overlay (TFM's
 *                              evidence-backed "Non-VPC Workload" panel)
 *
 * Reads /api/proxy/attack-chain/exfil-paths (no backend change). Every
 * card on screen traces to a real Neo4j edge resolved by that endpoint;
 * lanes the graph can't fill today render empty rather than mocked.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { ArrowRight, ChevronDown, Crown, Route, AlertTriangle, RefreshCw } from "lucide-react"
import { useRetryFetch } from "@/lib/use-retry-fetch"
import { FreshnessBanner } from "@/components/freshness-banner"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import type {
  SystemArchitecture,
  ServiceNode,
  SubnetNode,
  SecurityCheckpoint,
  EgressGatewayNode,
  ExfilGateNode,
  TrafficFlow,
} from "@/components/dependency-map/traffic-flow-map"
import type { CanvasEdge, CanvasRelationshipType } from "@/lib/types/attack-canvas"

// Heavy renderer — lazy-load so the v2 page doesn't pull the full dep-map
// bundle until the operator switches to exfil view. Same load pattern as
// attacker-view-panel.tsx.
const TrafficFlowMap = dynamic(
  () => import("@/components/dependency-map/traffic-flow-map"),
  { ssr: false },
)

// ─── Backend response types — mirror api/exfil_paths.py shape ─────

interface ExfilAccessor {
  id: string
  name: string
  type: string
  provenance: "capable" | "observed"
  allowed_actions_count: number | null
  used_actions_count: number | null
  unused_actions_count: number | null
  rel_types: string[]
  hit_count: number
  total_bytes: number
  last_seen: string | null
}

interface ExfilNetworkEgressItem {
  kind: string
  id: string
  name: string
  channel?: string
  accessor_id?: string
  accessor_name?: string
  via_workload: { id: string; name: string; type: string }
  via_subnet: {
    id: string
    name: string
    public: boolean | null
    route_table?: {
      id: string
      name: string
      route_count?: number | null
      is_main?: boolean | null
    } | null
  }
  via_vpc: { id: string; name: string }
  via_security_groups?: Array<{
    id: string
    name: string
    inbound_rule_count?: number | null
    outbound_rule_count?: number | null
    has_public_ingress?: boolean | null
  }>
  provenance: "capable" | "observed"
}

interface WorkloadNetworkPayload {
  is_vpc_attached: boolean
  vpc_id: string | null
  vpc_name: string | null
  subnets: Array<{ id: string; name: string | null; is_public: boolean | null }>
  security_groups: Array<{ id: string; name: string | null }>
  evidence: string
  workload_count_queried: number
  workload_count_in_sample: number
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
  workload_network: WorkloadNetworkPayload | null
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
  system_name?: string
  jewel: { id: string; name: string; type: string; classification: string | null }
  accessors: ExfilAccessor[]
  paths?: ExfilPath[]
  egress_lanes: {
    network: ExfilNetworkEgressItem[]
    identity: { items: unknown[]; not_wired: true; not_wired_reason: string }
    data_propagation: { items: unknown[]; not_wired: true; not_wired_reason: string }
  }
  destinations: ExfilDestination[]
  observed_exfil: { available: boolean; not_wired_reason: string }
  phase: string
  phase_note: string
}

// ─── Component ────────────────────────────────────────────────────

interface ExfilViewV3Props {
  systemName: string
  jewel: CrownJewelSummary | null
}

export function ExfilViewV3({ systemName, jewel }: ExfilViewV3Props) {
  // Stable request body — recomputed only on system/jewel change, same
  // pattern as attacker-view-panel.tsx to keep useRetryFetch's dependency
  // comparison stable across renders.
  const requestBody = useMemo(
    () =>
      JSON.stringify({
        system_name: systemName,
        jewel_id: jewel?.id ?? "",
        include_capable: true,
        include_observed: true,
        max_destinations: 50,
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
  const { data, loading, error, retry, retrying, attempt } = useRetryFetch<ExfilPayload>(
    enabled ? "/api/proxy/attack-chain/exfil-paths" : null,
    {
      fetchInit,
      refetchKey: `${systemName}:${jewel?.id ?? ""}`,
      maxRetries: 2,
      initialDelayMs: 1000,
    },
  )

  // Per-path selection — each (accessor, channel) chain renders as its
  // own canvas. URL-synced so deep-links survive reload / back-button.
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const p = new URLSearchParams(window.location.search).get("exfil_path")
      if (p) setSelectedPathId(p)
    } catch {
      // ignore (SSR / sandboxed env)
    }
  }, [])

  useEffect(() => {
    if (!data?.paths || data.paths.length === 0) {
      setSelectedPathId(null)
      return
    }
    const valid = data.paths.some((p) => p.path_id === selectedPathId)
    if (!valid) {
      // Backend pre-sorts paths[] highest-traffic first; pick [0] as
      // the default lens if URL didn't carry one.
      setSelectedPathId(data.paths[0]?.path_id ?? null)
    }
  }, [data, selectedPathId])

  useEffect(() => {
    if (typeof window === "undefined" || !selectedPathId) return
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.get("exfil_path") === selectedPathId) return
      url.searchParams.set("exfil_path", selectedPathId)
      window.history.replaceState(null, "", url.toString())
    } catch {
      // ignore
    }
  }, [selectedPathId])

  const selectedPath = useMemo<ExfilPath | null>(() => {
    if (!data?.paths || !selectedPathId) return null
    return data.paths.find((p) => p.path_id === selectedPathId) ?? null
  }, [data, selectedPathId])

  const architecture = useMemo<SystemArchitecture | null>(() => {
    if (!data || !data.ok) return null
    return buildExfilArchitecture(data, selectedPath)
  }, [data, selectedPath])

  if (!enabled) {
    return (
      <div className="flex flex-col h-full">
        <Header jewel={jewel} subtitle="Select a crown jewel to see its exfil surface" />
        <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
          No crown jewel selected.
        </div>
      </div>
    )
  }

  if (loading) {
    const retryLabel =
      retrying && attempt > 0
        ? `Backend was slow — retrying (attempt ${attempt + 1})…`
        : "Walking forward from the jewel — mapping every door the data can leave through…"
    return (
      <div className="flex flex-col h-full">
        <Header jewel={jewel} subtitle="Computing the exfiltration surface…" />
        <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
          {retryLabel}
        </div>
      </div>
    )
  }

  if (error || !data || !data.ok) {
    const msg = error || data?.error || "Exfil paths failed"
    return (
      <div className="flex flex-col h-full">
        <Header jewel={jewel} subtitle="Could not load exfil view" />
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
      </div>
    )
  }

  if (!architecture) return null

  const paths = data.paths ?? []
  const capableCount = data.accessors.filter((a) => a.provenance === "capable").length
  const observedCount = data.accessors.filter((a) => a.provenance === "observed").length

  // Header subtitle: simple counts only. No archetype noise, no
  // "phase X / collectors pending" jargon — operators read this at a
  // glance to know how big the surface is.
  const subtitle = paths.length
    ? `${paths.length} exfil path${paths.length === 1 ? "" : "s"} · ${observedCount} observed reader${observedCount === 1 ? "" : "s"} · ${capableCount} capable reader${capableCount === 1 ? "" : "s"} · ${data.destinations.length} destination${data.destinations.length === 1 ? "" : "s"}`
    : "No accessors or paths resolved for this jewel"

  const innerSubtitle = selectedPath
    ? `${selectedPath.channel_label} via ${selectedPath.accessor_name} · ${selectedPath.workload_count} workload${selectedPath.workload_count === 1 ? "" : "s"} · ${selectedPath.gateway_count} gateway${selectedPath.gateway_count === 1 ? "" : "s"} · ${selectedPath.jewel_hits.toLocaleString()} read${selectedPath.jewel_hits === 1 ? "" : "s"}`
    : data.observed_exfil.available
      ? "Data exit paths — capable (amber) vs observed (red)"
      : "Capable data-exit paths — observed-exfil layer pending"

  const pathSelectorNode =
    paths.length > 0 ? (
      <PathSelector
        paths={paths}
        selectedPathId={selectedPathId}
        onSelect={setSelectedPathId}
      />
    ) : null

  return (
    <div className="flex flex-col h-full">
      <Header jewel={jewel} subtitle={subtitle} />
      <div className="flex-1 min-h-0">
        <TrafficFlowMap
          systemName={systemName}
          architectureOverride={architecture}
          observedMode={true}
          titleOverride=""
          innerTitleOverride={
            selectedPath
              ? `Exfil path · ${selectedPath.channel_label}`
              : "Exfiltration Surface"
          }
          innerSubtitleOverride={innerSubtitle}
          pathBadgeOverride={
            selectedPath
              ? `${selectedPath.accessor_name} → ${data.jewel.name}`
              : `Exfil → ${data.jewel.name}`
          }
          headerSlot={pathSelectorNode}
          defaultShowVPCBoundaries={true}
        />
      </div>
    </div>
  )
}

// ─── Header ───────────────────────────────────────────────────────
// Mirrors attacker-view-panel.tsx Header structure — same sticky top
// bar, same FreshnessBanner pill, jewel slot on right. The only
// semantic flip: "target" → "source" because the jewel IS the data
// origin in EXFIL, not the attacker's destination.

function Header({ jewel, subtitle }: { jewel: CrownJewelSummary | null; subtitle: string }) {
  return (
    <div className="px-6 py-3 border-b border-slate-800/60 bg-slate-950/95 backdrop-blur sticky top-0 z-10 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5 flex items-center gap-1.5">
          <ArrowRight className="h-3 w-3 text-amber-300" />
          EXFIL VIEW · where the data leaves
          <FreshnessBanner variant="pill" className="ml-2" />
        </div>
        <div className="text-[11px] text-slate-400">{subtitle}</div>
      </div>
      {jewel && (
        <div className="text-right shrink-0">
          <div className="flex items-center gap-1.5 justify-end mb-0.5">
            <Crown className="h-3 w-3 text-amber-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">source</span>
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
  )
}

// ─── Path selector ───────────────────────────────────────────────
// Compact dropdown rendered INLINE in TFM's top toolbar (via headerSlot).
// Inline so it stays visible in TFM's full-screen mode where outer panel
// chrome is hidden. Dropdown so 7+ paths fit a single toolbar row.

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

  // Tone per channel — used on both the trigger dot AND each row dot so
  // operators can scan-distinguish channels at a glance.
  const dotFor = (channel: string): string =>
    ({
      network_via_igw: "bg-amber-400",
      serverless_direct: "bg-violet-400",
      ec2_no_egress: "bg-slate-300",
      direct_api: "bg-rose-400",
    }) as Record<string, string>[channel] || "bg-slate-300"

  const selected = paths.find((p) => p.path_id === selectedPathId) ?? paths[0]
  if (!selected) return null

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-600/60 bg-slate-800/60 hover:bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-100"
        title="Switch exfil path"
      >
        <Route className="h-3 w-3 text-slate-400" />
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
          Path {paths.indexOf(selected) + 1}/{paths.length}
        </span>
        <span className={`h-1.5 w-1.5 rounded-full ${dotFor(selected.channel)}`} />
        <span className="truncate max-w-[200px]">{selected.channel_label}</span>
        <ChevronDown
          className={`h-3 w-3 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 w-[420px] max-w-[calc(100vw-32px)] rounded-lg border border-slate-700 bg-slate-900 shadow-2xl shadow-black/60 ring-1 ring-black/40">
          <div className="px-3 py-2 border-b border-slate-800 text-[9px] font-bold uppercase tracking-wider text-slate-500">
            {paths.length} exfil path{paths.length === 1 ? "" : "s"} — pick one to inspect
          </div>
          <div className="max-h-[60vh] overflow-y-auto py-1">
            {paths.map((p, idx) => {
              const isSelected = p.path_id === selectedPathId
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
                    isSelected ? "bg-slate-800/80" : "hover:bg-slate-800/50"
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
                        className={`text-[8px] uppercase tracking-wider font-bold ${observed ? "text-red-300" : "text-amber-300"}`}
                      >
                        {observed ? "observed" : "capable"}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {p.channel_label} · {p.workload_count} workload
                      {p.workload_count === 1 ? "" : "s"} · {p.gateway_count} gateway
                      {p.gateway_count === 1 ? "" : "s"}
                    </div>
                  </div>
                  <span className="text-[10px] tabular-nums font-mono text-slate-400 shrink-0">
                    {compactNumber(p.jewel_hits)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function compactNumber(n: number): string {
  if (!isFinite(n) || n < 1) return "0"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return String(Math.round(n))
}

// ─── Architecture builder ────────────────────────────────────────
//
// Project the EXFIL payload into a SystemArchitecture that
// TrafficFlowMap can render. BFS-forward from the jewel — opposite
// direction from the attacker-view buildAttackerArchitecture.
//
// 9-lane mapping (design doc §3):
//   1. CJ SOURCE            → entryPoints + entryLaneLabel="Source"
//   2. READER PRINCIPAL     → iamRoles (+ principals if non-role actor)
//   3. READER WORKLOAD      → computeServices
//   4. STAGING              → no lane today (honestly empty)
//   5. EGRESS GATE          → securityGroups + nacls
//   6. EGRESS PATH          → subnets + egressGateways (+ vpcEndpoints)
//   7. EXFIL CHANNEL        → exfilGate (typed, strength-colored)
//   8. EXTERNAL DESTINATION → resources
//   9. DEFENSE              → workloadNetwork overlay banner
//
// Heavy serverless fans (e.g. a single role attached to 14 Lambdas)
// would dominate the canvas — cap the compute lane and emit a
// "+N more" placeholder so the count stays honest without exploding
// the visual.
const EXFIL_COMPUTE_VISIBLE_CAP = 5

function buildExfilArchitecture(
  payload: ExfilPayload,
  selectedPath: ExfilPath | null,
): SystemArchitecture {
  const computeServices: ServiceNode[] = []
  const resources: ServiceNode[] = []
  const iamRoles: SecurityCheckpoint[] = []
  const subnets: SubnetNode[] = []
  const securityGroups: SecurityCheckpoint[] = []
  const egressGateways: EgressGatewayNode[] = []
  const exfilGate: ExfilGateNode[] = []
  const entryPoints: ServiceNode[] = []
  const flows: TrafficFlow[] = []
  const seen = new Set<string>()

  // Explicit-edges contract for TFM's renderer — each synthesized flow
  // gets a paired CanvasEdge with relationship + plane classification.
  // Renderer draws one plane-colored curve per edge; flows[] stays for
  // back-compat header math (totalBytes / totalConnections).
  const builtEdges: CanvasEdge[] = []
  const edgeKeys = new Set<string>()
  const pushEdge = (
    source: string,
    target: string,
    relationship: string,
    observed: boolean | null,
    bytes: number | null,
    hitCount: number | null,
    port: number | null,
    protocol: string | null,
  ) => {
    if (!source || !target) return
    const rel = relationship.toUpperCase()
    const id = `${source}|${rel}|${target}`
    if (edgeKeys.has(id)) return
    edgeKeys.add(id)
    builtEdges.push({
      id,
      source_aws_id: source,
      target_aws_id: target,
      relationship: rel as CanvasRelationshipType,
      observed,
      hit_count: hitCount,
      bytes,
      first_seen: null,
      last_seen: null,
      port,
      protocol,
    })
  }

  // When a path is selected, restrict to its (accessor, channel) slice.
  // Otherwise show every row (initial-frame fallback before selection).
  const networkRows = selectedPath
    ? payload.egress_lanes.network.filter(
        (e) =>
          e.accessor_id === selectedPath.accessor_id &&
          (e.channel ?? "") === selectedPath.channel,
      )
    : payload.egress_lanes.network

  const accessorsForPath = selectedPath
    ? payload.accessors.filter((a) => a.id === selectedPath.accessor_id)
    : payload.accessors

  // ── 1. CJ SOURCE ──────────────────────────────────────────────────
  // Jewel renders in entryPoints with entryLaneLabel="Source" so the
  // leftmost lane header reads "Source", not "Entry". Chip type derived
  // from the real jewel.type so the badge honestly reflects what the
  // resource IS (S3, DynamoDB, RDS, …) instead of "PRINCIPAL".
  const jewelId = payload.jewel.id
  entryPoints.push({
    id: jewelId,
    name: payload.jewel.name,
    shortName: shortName(payload.jewel.name),
    type: jewelToNodeType(payload.jewel.type),
    instanceId: jewelId.slice(-12),
  })

  // ── 2. READER PRINCIPAL ──────────────────────────────────────────
  // IAM role(s) that read the jewel. Carries used / allowed action
  // counts so the role card's gap ring renders against real numbers.
  for (const a of accessorsForPath) {
    if (seen.has(a.id)) continue
    seen.add(a.id)
    iamRoles.push({
      id: a.id,
      type: "iam_role",
      name: a.name,
      shortName: shortName(a.name, 30),
      usedCount: a.used_actions_count ?? 0,
      totalCount: a.allowed_actions_count ?? 0,
      gapCount: a.unused_actions_count ?? 0,
      connectedSources: [],
      connectedTargets: [],
    })
    // Jewel → accessor (the read edge inverted into "data leaves jewel
    // via this accessor"). Animated red line when observed.
    flows.push({
      sourceId: jewelId,
      targetId: a.id,
      ports: [],
      protocol: "iam",
      bytes: a.total_bytes,
      connections: a.hit_count || 1,
      isActive: a.provenance === "observed",
    })
    pushEdge(
      jewelId,
      a.id,
      "ACCESSES_RESOURCE",
      a.provenance === "observed",
      a.total_bytes ?? 0,
      a.hit_count ?? 0,
      null,
      null,
    )
  }

  // ── 3. READER WORKLOAD ───────────────────────────────────────────
  // Workloads carrying the accessor role. De-duped by id. Heavy fans
  // (one role × 14 Lambdas) collapse into top-N + "+N more".
  const allWorkloads: ServiceNode[] = []
  for (const e of networkRows) {
    const w = e.via_workload
    if (!w?.id || seen.has(w.id)) continue
    seen.add(w.id)
    allWorkloads.push({
      id: w.id,
      name: w.name,
      shortName: shortName(w.name, 30),
      type: w.type.toLowerCase().includes("lambda") ? "lambda" : "compute",
      instanceId: w.id.startsWith("i-") ? w.id : w.id.slice(-12),
    })
  }
  if (allWorkloads.length <= EXFIL_COMPUTE_VISIBLE_CAP) {
    computeServices.push(...allWorkloads)
  } else {
    computeServices.push(...allWorkloads.slice(0, EXFIL_COMPUTE_VISIBLE_CAP))
    const hiddenCount = allWorkloads.length - EXFIL_COMPUTE_VISIBLE_CAP
    computeServices.push({
      id: `__exfil_more__:${allWorkloads.length}`,
      name: `+${hiddenCount} more workload${hiddenCount === 1 ? "" : "s"}`,
      shortName: `+${hiddenCount} more`,
      type: "compute",
      instanceId: `${hiddenCount} hidden`,
    })
  }

  // ── 5+6. EGRESS GATE + EGRESS PATH (network) ─────────────────────
  // Subnets, route-tables, security groups, gateways. Sourced from the
  // network-egress payload's via_subnet / via_security_groups + the
  // EGRESS_KINDS rows. Lane 4 (STAGING) intentionally stays empty —
  // no collector today; absence is the honest signal.
  const subnetSeen = new Set<string>()
  for (const e of networkRows) {
    const s = e.via_subnet
    if (!s?.id || subnetSeen.has(s.id)) continue
    subnetSeen.add(s.id)
    subnets.push({
      id: s.id,
      name: s.name,
      shortName: shortName(s.name, 26),
      isPublic: s.public,
      vpcId: e.via_vpc?.id ?? undefined,
      connectedComputeIds: [],
      routeTableId: s.route_table?.id,
      routeTableCount: s.route_table?.route_count ?? undefined,
      routeTableIsMain: s.route_table?.is_main ?? undefined,
    } as SubnetNode)
  }

  const sgSeen = new Set<string>()
  for (const e of networkRows) {
    for (const sg of e.via_security_groups || []) {
      if (!sg?.id || sgSeen.has(sg.id)) continue
      sgSeen.add(sg.id)
      const inb = Number(sg.inbound_rule_count ?? 0) || 0
      const outb = Number(sg.outbound_rule_count ?? 0) || 0
      securityGroups.push({
        id: sg.id,
        type: "security_group",
        name: sg.name,
        shortName: shortName(sg.name, 24),
        usedCount: 0,
        totalCount: inb + outb,
        gapCount: 0,
        connectedSources: [],
        connectedTargets: [],
      })
    }
  }

  // Backfill subnets + SGs from path.workload_network when networkRows
  // didn't carry them (serverless_direct paths emit WorkloadOnly rows
  // without subnet/SG edges, but the workload itself may still be
  // VPC-attached). workload_network is the authoritative per-workload
  // signal — use it as a backfill source.
  if (selectedPath?.workload_network?.is_vpc_attached) {
    for (const s of selectedPath.workload_network.subnets) {
      if (!s.id || subnetSeen.has(s.id)) continue
      subnetSeen.add(s.id)
      subnets.push({
        id: s.id,
        name: s.name ?? s.id,
        shortName: shortName(s.name ?? s.id, 26),
        isPublic: s.is_public ?? undefined,
        vpcId: selectedPath.workload_network.vpc_id ?? undefined,
        connectedComputeIds: [],
      } as SubnetNode)
    }
    for (const sg of selectedPath.workload_network.security_groups) {
      if (!sg.id || sgSeen.has(sg.id)) continue
      sgSeen.add(sg.id)
      securityGroups.push({
        id: sg.id,
        type: "security_group",
        name: sg.name ?? sg.id,
        shortName: shortName(sg.name ?? sg.id, 24),
        usedCount: 0,
        totalCount: 0,
        gapCount: 0,
        connectedSources: [],
        connectedTargets: [],
      })
    }
  }

  // EGRESS PATH gateways — real AWS gateway resources only. WorkloadOnly
  // placeholder rows in networkRows are NOT gateways; filtering them out
  // prevents the "EGRESS GATEWAYS (15)" miscount on serverless paths.
  const EGRESS_KINDS = new Set([
    "InternetGateway",
    "NATGateway",
    "EgressOnlyInternetGateway",
    "TransitGateway",
    "VPCEndpoint",
  ])
  for (const e of networkRows) {
    if (!EGRESS_KINDS.has(e.kind)) continue
    if (seen.has(e.id)) continue
    seen.add(e.id)
    const kind = (e.kind as EgressGatewayNode["kind"]) || "InternetGateway"
    const kindLabel: Record<string, string> = {
      InternetGateway: "IGW",
      NATGateway: "NAT GW",
      EgressOnlyInternetGateway: "Egress-only IGW",
      TransitGateway: "Transit GW",
      VPCEndpoint: "VPC Endpoint",
    }
    egressGateways.push({
      id: e.id,
      name: e.name,
      shortName: shortName(e.name),
      vpcId: e.via_vpc?.id ?? null,
      kind: kind,
      kindLabel: kindLabel[kind] || kind,
    })
    if (e.via_workload?.id) {
      flows.push({
        sourceId: e.via_workload.id,
        targetId: e.id,
        ports: [],
        protocol: "tcp",
        bytes: 0,
        connections: 0,
        isActive: false,
      })
      pushEdge(e.via_workload.id, e.id, "ROUTES_VIA", false, 0, 0, null, null)
      const sgIdForEdge = e.via_security_groups?.[0]?.id
      if (sgIdForEdge) {
        pushEdge(e.via_workload.id, sgIdForEdge, "SECURED_BY", false, 0, 0, null, null)
      }
    }
  }

  // ── 7. EXFIL CHANNEL + 8. EXTERNAL DESTINATION ───────────────────
  // One virtual ExfilGate card per selected path, color-coded by gate
  // strength (emerald=strong, blue=weak_observable, amber=weak_unobservable).
  // Destination card sits to the right of the gate — Internet for IGW/NAT
  // paths, "AWS partition" for service-plane paths (no further controls).
  if (selectedPath) {
    const observedRouteCount = payload.destinations.reduce(
      (s, d) => s + (d.observed_route_count || 0),
      0,
    )
    const observedBytes = payload.destinations.reduce(
      (s, d) => s + (d.observed_bytes_24h || 0),
      0,
    )
    const isObserved = observedRouteCount > 0

    let destId: string
    let destLabel: string
    let destType: "internet" | "storage"
    let destProtocol: string
    let routeSourceIds: string[]
    let destIsTracked = false

    const gateId = `exfil-gate:${selectedPath.path_id}`
    let gateKind: ExfilGateNode["kind"]
    let gateKindLabel: string
    let gateName: string
    let gateStrength: ExfilGateNode["gateStrength"]
    let gateHint: string

    if (selectedPath.channel === "network_via_igw") {
      const realGw = egressGateways[0]
      gateKind = realGw?.kind === "NATGateway" ? "NATGateway" : "InternetGateway"
      gateKindLabel = realGw?.kindLabel ?? "IGW"
      gateName = realGw?.name ?? "Internet Gateway"
      gateStrength = "weak_observable"
      gateHint = "VPC Flow Logs · SG egress is the final gate"
      destId = "internet"
      destLabel = "Internet"
      destType = "internet"
      destProtocol = "internet"
      routeSourceIds = egressGateways.map((g) => g.id)
      destIsTracked = true
    } else if (selectedPath.channel === "direct_api") {
      gateKind = "AWSServicePlane"
      gateKindLabel = "AWS Control Plane"
      gateName = "Public AWS API endpoint"
      gateStrength = "weak_unobservable"
      gateHint = "IAM is the only gate — no VPC, no SG"
      destId = `exfil-dest:aws-partition:${selectedPath.path_id}`
      destLabel = "AWS partition"
      destType = "internet"
      destProtocol = "https"
      routeSourceIds = [selectedPath.accessor_id]
    } else {
      // serverless_direct / ec2_no_egress — bytes leave through the AWS
      // public API endpoint. Gate = service plane (weak / unobservable).
      gateKind = "AWSServicePlane"
      gateKindLabel = "AWS Service Plane"
      gateName = `Public ${payload.jewel.type} endpoint`
      gateStrength = "weak_unobservable"
      gateHint = "No VPC · IAM is the only gate"
      destId = `exfil-dest:aws-partition:${selectedPath.path_id}`
      destLabel = "AWS partition"
      destType = "internet"
      destProtocol = "https"
      routeSourceIds = computeServices
        .filter((c) => !c.id.startsWith("__exfil_more__"))
        .map((c) => c.id)
    }

    exfilGate.push({
      id: gateId,
      kind: gateKind,
      kindLabel: gateKindLabel,
      name: gateName,
      shortName: shortName(gateName, 22),
      gateStrength,
      hint: gateHint,
    })

    const routeCount = Math.max(1, routeSourceIds.length)
    const headlineSuffix = destIsTracked
      ? observedRouteCount > 0
        ? `${routeCount} route${routeCount === 1 ? "" : "s"} · ${observedRouteCount} observed`
        : `${routeCount} route${routeCount === 1 ? "" : "s"} capable`
      : "no further controls"
    const richLabel = `${destLabel} — ${headlineSuffix}`

    resources.push({
      id: destId,
      name: richLabel,
      shortName: destIsTracked
        ? shortName(destLabel, 18) +
          (observedRouteCount > 0 ? `  ${observedRouteCount}/${routeCount}` : `  ${routeCount}↗`)
        : shortName(destLabel, 22),
      type: destType,
    } as ServiceNode)

    // Draw destination edges ONLY for tracked destinations (real AWS
    // gateway → Internet). Conceptual placeholders (AWS partition, no
    // graph edge) render the chip but skip the line — a synthesized
    // line would imply observed flow that the graph can't back.
    if (destIsTracked) {
      const destRel: string =
        selectedPath.channel === "network_via_igw" ? "ROUTES_VIA" : "ACCESSES_RESOURCE"
      for (const srcId of routeSourceIds) {
        flows.push({
          sourceId: srcId,
          targetId: destId,
          ports: [],
          protocol: destProtocol,
          bytes: observedBytes,
          connections: observedRouteCount,
          isActive: isObserved,
        })
        pushEdge(
          srcId,
          destId,
          destRel,
          isObserved,
          observedBytes,
          observedRouteCount,
          null,
          destProtocol,
        )
      }
    }
  } else {
    // Fallback: no path selected (initial frame). Render destinations
    // as a flat aggregate so the canvas isn't empty.
    for (const d of payload.destinations) {
      if (seen.has(d.id)) continue
      seen.add(d.id)
      const isObserved = d.observed_route_count > 0
      const capable = d.capable_route_count
      const observed = d.observed_route_count
      const headlineSuffix =
        observed > 0
          ? `${capable} routes · ${observed} observed`
          : `${capable} route${capable === 1 ? "" : "s"} capable`
      resources.push({
        id: d.id,
        name: `${d.label} — ${headlineSuffix}`,
        shortName:
          shortName(d.label, 18) + (observed > 0 ? `  ${observed}/${capable}` : `  ${capable}↗`),
        type: d.kind === "internet" ? "internet" : "storage",
      } as ServiceNode)
      for (const e of networkRows) {
        flows.push({
          sourceId: e.id,
          targetId: d.id,
          ports: [],
          protocol: d.kind === "internet" ? "internet" : "tcp",
          bytes: d.observed_bytes_24h,
          connections: d.observed_route_count,
          isActive: isObserved,
        })
        pushEdge(
          e.id,
          d.id,
          "ROUTES_VIA",
          isObserved,
          d.observed_bytes_24h,
          d.observed_route_count,
          null,
          d.kind === "internet" ? "internet" : "tcp",
        )
      }
    }
  }

  const totalBytes = flows.reduce((s, f) => s + (f.bytes || 0), 0)
  const totalConnections = flows.reduce((s, f) => s + (f.connections || 0), 0)

  return {
    computeServices,
    entryPoints,
    exfilGate,
    entryLaneLabel: "Source",
    // CloudTrail metrics basis — drops the misleading "0 B Traffic"
    // sub-card (CloudTrail doesn't carry payload size) and relabels
    // "Connections" → "API calls" (hit_count, not TCP).
    metricsBasis: "cloudtrail",
    principals: [],
    resources,
    subnets,
    securityGroups,
    nacls: [],
    iamRoles,
    instanceProfiles: [],
    iamPolicies: [],
    vpcEndpoints: [],
    egressGateways,
    flows,
    edges: builtEdges,
    totalBytes,
    totalConnections,
    totalGaps: 0,
    vpcGroups: [],
    // Evidence-backed DEFENSE overlay — drives TFM's "Non-VPC Workload"
    // banner with real Cypher evidence instead of inferring from empty
    // arrays. null when no path selected (no banner).
    workloadNetwork: selectedPath?.workload_network
      ? {
          is_vpc_attached: selectedPath.workload_network.is_vpc_attached,
          vpc_id: selectedPath.workload_network.vpc_id,
          vpc_name: selectedPath.workload_network.vpc_name,
          evidence: selectedPath.workload_network.evidence,
          workload_count_queried: selectedPath.workload_network.workload_count_queried,
          workload_count_in_sample: selectedPath.workload_network.workload_count_in_sample,
        }
      : null,
  }
}

// ─── String helpers ──────────────────────────────────────────────

function shortName(name: string, maxLen = 22): string {
  if (!name) return ""
  if (name.length <= maxLen) return name
  const half = Math.floor((maxLen - 1) / 2)
  return name.slice(0, half) + "…" + name.slice(-(maxLen - half - 1))
}

// Map AWS jewel type → TFM NodeType so the SOURCE chip badge says
// what the resource actually IS (S3, DynamoDB, RDS, Lambda, EC2)
// instead of "PRINCIPAL". KMS has no dedicated NodeType — storage is
// the least-wrong fallback; the chip subtitle still shows real type.
function jewelToNodeType(
  awsType: string | undefined | null,
): "storage" | "dynamodb" | "database" | "lambda" | "compute" {
  switch (awsType) {
    case "S3Bucket":
      return "storage"
    case "DynamoDBTable":
      return "dynamodb"
    case "RDSInstance":
    case "RDSCluster":
    case "RDSDatabase":
      return "database"
    case "LambdaFunction":
      return "lambda"
    case "EC2Instance":
      return "compute"
    case "KMSKey":
      return "storage"
    default:
      return "storage"
  }
}
