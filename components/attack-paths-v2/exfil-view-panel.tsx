"use client"

/**
 * EXFIL View Panel — Phase A.
 *
 * Renders the "where does the data go?" map by re-using the
 * TrafficFlowMap renderer (same component, same visual language,
 * same animated flow lines) that powers the Attacker View. The
 * BFS direction is inverted — jewel on the LEFT, exit points on
 * the RIGHT — but the visual contract is identical so operators
 * don't context-switch when they flip tabs.
 *
 * Lane mapping into TFM's existing vocabulary:
 *
 *   entryPoints  ←  the crown jewel itself (SOURCE — leftmost lane)
 *   iamRoles     ←  accessors (capable + observed)
 *   computeServices ← workloads that carry the accessor roles
 *   subnets/SG/NACLs ← network containment of those workloads
 *   egressGateways  ← IGW / NAT / etc. on the exit side
 *   resources    ←  destinations (Internet card; future: External
 *                   Account, External Region)
 *
 * Color contract — the canonical Allowed-vs-Actual frame applied
 * to the exit side: capable → amber outline, observed → red fill.
 * TFM's existing "observed traffic = red animated line" matches
 * this contract for free; we just feed it real `bytes` / `hit_count`
 * on the flows we synthesize when CloudTrail confirms exfil.
 *
 * NotWired sub-lanes (IDENTITY EGRESS / DATA PROPAGATION) render
 * as a strip BELOW the map until Phase B/C collectors land — they
 * carry the not_wired_reason copy inline so the operator sees the
 * collector backlog explicitly.
 */

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { Crown, AlertTriangle, ArrowRight, RefreshCw, Route } from "lucide-react"
import { useRetryFetch } from "@/lib/use-retry-fetch"
import { FreshnessBanner } from "@/components/freshness-banner"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import type {
  SystemArchitecture,
  ServiceNode,
  SubnetNode,
  SecurityCheckpoint,
  EgressGatewayNode,
  TrafficFlow,
} from "@/components/dependency-map/traffic-flow-map"

const TrafficFlowMap = dynamic(
  () => import("@/components/dependency-map/traffic-flow-map"),
  { ssr: false },
)

// ─── Types (mirror backend api/exfil_paths.py response shape) ─────

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
  // Backend tags every row with the accessor + channel that produced
  // it so the frontend can partition the canvas per exfil path
  // (2026-05-25 per-path PRD revision).
  channel?: string
  accessor_id?: string
  accessor_name?: string
  service_name?: string | null
  endpoint_type?: string | null
  via_workload: { id: string; name: string; type: string }
  via_subnet: {
    id: string
    name: string
    public: boolean | null
    route_table?: { id: string; name: string; route_count?: number | null; is_main?: boolean | null } | null
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

interface ExfilLaneNotWired {
  items: unknown[]
  not_wired: true
  not_wired_reason: string
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
    identity: ExfilLaneNotWired
    data_propagation: ExfilLaneNotWired
  }
  destinations: ExfilDestination[]
  observed_exfil: { available: boolean; not_wired_reason: string }
  phase: string
  phase_note: string
}

// ─── Component ─────────────────────────────────────────────────────

interface ExfilViewPanelProps {
  systemName: string
  jewel: CrownJewelSummary | null
}

export function ExfilViewPanel({ systemName, jewel }: ExfilViewPanelProps) {
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

  // ── Per-path selector (2026-05-25 user-driven reshape) ─────────
  // Each EXFIL use-case (network_via_igw / serverless_direct / etc.)
  // renders as ITS OWN canvas instead of being mashed into one.
  // selectedPathId is URL-synced via ?exfil_path=<id> so an operator
  // can deep-link to "show me the Lambda-direct path for role X".
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null)

  // On first mount, read ?exfil_path= from the URL so a deep-link wins
  // over the default highest-traffic pick.
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const p = new URLSearchParams(window.location.search).get("exfil_path")
      if (p) setSelectedPathId(p)
    } catch {
      // ignore (SSR / sandboxed env)
    }
  }, [])

  // When new payload arrives, snap to default selection if current id is
  // invalid for this dataset (jewel switched, or first load).
  useEffect(() => {
    if (!data?.paths || data.paths.length === 0) {
      setSelectedPathId(null)
      return
    }
    const valid = data.paths.some((p) => p.path_id === selectedPathId)
    if (!valid) {
      // paths[] is already sorted highest-traffic first by the backend.
      setSelectedPathId(data.paths[0]?.path_id ?? null)
    }
  }, [data, selectedPathId])

  // Mirror selection into the URL so refresh / back-button preserve it.
  // Skip the initial null → don't pollute the URL with a no-op.
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

  // Build the SystemArchitecture for TFM from the EXFIL payload. Same
  // pattern as buildAttackerArchitecture in attacker-view-panel.tsx,
  // just inverted. When a specific path is selected, filter the payload
  // down to that (accessor, channel) slice so the canvas tells one
  // coherent story instead of overlaying 7.
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

  const capableCount = data.accessors.filter((a) => a.provenance === "capable").length
  const observedCount = data.accessors.filter((a) => a.provenance === "observed").length
  const paths = data.paths ?? []
  const pathCountLine =
    paths.length > 0
      ? `${paths.length} exfil path${paths.length === 1 ? "" : "s"} — pick one to inspect`
      : ""
  const subtitle =
    pathCountLine ||
    `${data.accessors.length} accessor${data.accessors.length === 1 ? "" : "s"} (${capableCount} capable · ${observedCount} observed) → ${data.egress_lanes.network.length} network egress → ${data.destinations.length} destination${data.destinations.length === 1 ? "" : "s"}`

  if (!architecture) return null

  // Inner subtitle reflects the SELECTED path so the operator sees
  // the same answer twice (pill + canvas) — defends against the
  // "which path am I looking at?" wrong-view trap (cf. iam-permission-
  // analysis-modal.tsx wrong-view memory).
  const innerSubtitle = selectedPath
    ? `${selectedPath.channel_label} via ${selectedPath.accessor_name} — ${selectedPath.workload_count} workload${selectedPath.workload_count === 1 ? "" : "s"} · ${selectedPath.gateway_count} gateway${selectedPath.gateway_count === 1 ? "" : "s"} · ${selectedPath.jewel_hits.toLocaleString()} jewel hit${selectedPath.jewel_hits === 1 ? "" : "s"}`
    : data.observed_exfil.available
      ? "Data exit paths — capable (amber) vs observed (red)"
      : "Capable data-exit paths — observed-exfil layer pending Phase D collector"

  return (
    <div className="flex flex-col h-full">
      <Header jewel={jewel} subtitle={subtitle} />
      {paths.length > 0 && (
        <PathSelector
          paths={paths}
          selectedPathId={selectedPathId}
          onSelect={setSelectedPathId}
        />
      )}
      <div className="flex-1 min-h-0">
        <TrafficFlowMap
          systemName={systemName}
          architectureOverride={architecture}
          observedMode={true}
          titleOverride=""
          innerTitleOverride={
            selectedPath
              ? `Exfil path: ${selectedPath.channel_label}`
              : "Exfiltration Surface"
          }
          innerSubtitleOverride={innerSubtitle}
          pathBadgeOverride={
            selectedPath
              ? `${selectedPath.accessor_name} → ${data.jewel.name}`
              : `Exfil → ${data.jewel.name}`
          }
          defaultShowVPCBoundaries={true}
        />
      </div>

      {/* Phase A honest footer — surfaces the not-wired sub-lanes
          inline so the operator sees which exfil surfaces are
          collector-pending. Lives BELOW the map (not inside TFM)
          because TFM's lane vocabulary doesn't have native slots
          for "cross-account identity egress" or "data propagation
          replication". Promoted into TFM proper when the relevant
          collectors land. */}
      <div className="px-6 py-3 border-t border-slate-800/60 bg-slate-950/95 flex flex-wrap items-stretch gap-3">
        <NotWiredStrip
          title="IDENTITY EGRESS"
          tone="violet"
          reason={data.egress_lanes.identity.not_wired_reason}
        />
        <NotWiredStrip
          title="DATA PROPAGATION"
          tone="emerald"
          reason={data.egress_lanes.data_propagation.not_wired_reason}
        />
        {!data.observed_exfil.available && (
          <NotWiredStrip
            title="OBSERVED EXFIL"
            tone="rose"
            reason={data.observed_exfil.not_wired_reason}
          />
        )}
      </div>
    </div>
  )
}

// ─── Header (mirrors AttackerViewPanel.Header) ───────────────────

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
            className="text-xs font-mono text-amber-200/90 truncate max-w-[260px]"
            title={jewel.name}
          >
            {jewel.name}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Path selector pills ───────────────────────────────────────────
// One pill per (accessor, channel). Operator clicks to filter the
// canvas to that single use-case. Highest-traffic path renders first
// (backend sorts paths[] by jewel_hits DESC).

function PathSelector({
  paths,
  selectedPathId,
  onSelect,
}: {
  paths: ExfilPath[]
  selectedPathId: string | null
  onSelect: (id: string) => void
}) {
  // Tone per channel so the operator can scan-distinguish at a glance.
  const toneFor = (channel: string, selected: boolean): string => {
    const base = {
      network_via_igw: selected
        ? "border-amber-400/80 bg-amber-500/20 text-amber-100"
        : "border-amber-500/30 bg-amber-500/[0.04] text-amber-200/80 hover:bg-amber-500/10",
      serverless_direct: selected
        ? "border-violet-400/80 bg-violet-500/20 text-violet-100"
        : "border-violet-500/30 bg-violet-500/[0.04] text-violet-200/80 hover:bg-violet-500/10",
      ec2_no_egress: selected
        ? "border-slate-400/80 bg-slate-500/25 text-slate-100"
        : "border-slate-500/30 bg-slate-500/[0.04] text-slate-300/80 hover:bg-slate-500/10",
      direct_api: selected
        ? "border-rose-400/80 bg-rose-500/20 text-rose-100"
        : "border-rose-500/30 bg-rose-500/[0.04] text-rose-200/80 hover:bg-rose-500/10",
    } as Record<string, string>
    return base[channel] || (selected
      ? "border-slate-400/80 bg-slate-500/25 text-slate-100"
      : "border-slate-500/30 bg-slate-500/[0.04] text-slate-300/80 hover:bg-slate-500/10")
  }

  return (
    <div className="px-6 py-2.5 border-b border-slate-800/60 bg-slate-950/95 flex items-start gap-3">
      <div className="flex items-center gap-1.5 pt-1 shrink-0">
        <Route className="h-3 w-3 text-slate-500" />
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
          Exfil paths
        </span>
      </div>
      <div className="flex-1 flex flex-wrap gap-1.5">
        {paths.map((p) => {
          const selected = p.path_id === selectedPathId
          const tone = toneFor(p.channel, selected)
          const observed = p.accessor_provenance === "observed"
          return (
            <button
              key={p.path_id}
              type="button"
              onClick={() => onSelect(p.path_id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors ${tone}`}
              title={`${p.channel_label} via ${p.accessor_name} — ${p.workload_count} workload${p.workload_count === 1 ? "" : "s"}, ${p.gateway_count} gateway${p.gateway_count === 1 ? "" : "s"}, ${p.jewel_hits.toLocaleString()} jewel hit${p.jewel_hits === 1 ? "" : "s"}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${observed ? "bg-red-400" : "bg-amber-400/80"}`} />
              <span className="font-mono truncate max-w-[180px]">{p.accessor_name}</span>
              <span className="opacity-70">·</span>
              <span>{p.channel_label}</span>
              <span className="opacity-70">·</span>
              <span className="tabular-nums">{compactNumber(p.jewel_hits)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function compactNumber(n: number): string {
  if (!isFinite(n) || n < 1) return "0"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return String(Math.round(n))
}

function NotWiredStrip({
  title,
  tone,
  reason,
}: {
  title: string
  tone: "violet" | "emerald" | "rose"
  reason: string
}) {
  const toneCls = {
    violet: "border-violet-500/40 bg-violet-500/5 text-violet-200",
    emerald: "border-emerald-500/40 bg-emerald-500/5 text-emerald-200",
    rose: "border-rose-500/40 bg-rose-500/5 text-rose-200",
  }[tone]
  return (
    <div
      className={`flex-1 min-w-[260px] rounded-lg border border-dashed ${toneCls} p-2.5`}
      title={reason}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">{title}</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded bg-slate-700/60 px-1.5 py-px text-[8px] font-bold uppercase tracking-wider text-slate-300">
          backend not wired
        </span>
      </div>
      <div className="text-[10px] leading-snug opacity-80">{reason}</div>
    </div>
  )
}

// ─── Architecture builder ───────────────────────────────────────────

/**
 * Transform the EXFIL payload into a SystemArchitecture that
 * TrafficFlowMap can render. Inverted vs the attacker-view builder:
 *
 *   - Jewel becomes the ENTRY lane (SOURCE — leftmost).
 *   - Accessors land in iamRoles + instanceProfiles (when typed).
 *   - Workloads carrying those accessors land in computeServices.
 *   - Network egress destinations land in egressGateways + resources.
 *
 * Flow synthesis goes LEFT → RIGHT same as the attacker view, but
 * the source is the jewel and the targets are external gates /
 * destinations. Observed flows carry real bytes from the accessor's
 * `total_bytes` so TFM renders an animated red line at the right
 * intensity.
 */
// COMPUTE lane cap — collapse heavy serverless fans (e.g. the 14
// CyntroLambdaTier1-pilot Lambdas) into top-N + "+N more" so the
// canvas stays one-screen. Per-user feedback 2026-05-25: 16
// individual Lambda names dominate the EXFIL view and the operator
// can't read the narrative through the stack.
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
  const entryPoints: ServiceNode[] = []
  const flows: TrafficFlow[] = []
  const seen = new Set<string>()

  // Filter network egress to ONLY the selected path's (accessor, channel)
  // slice. When no path is selected (legacy fallthrough or paths[] empty)
  // we fall back to the full payload — the pre-per-path behavior.
  const networkRows = selectedPath
    ? payload.egress_lanes.network.filter(
        (e) =>
          e.accessor_id === selectedPath.accessor_id &&
          (e.channel ?? "") === selectedPath.channel,
      )
    : payload.egress_lanes.network

  // Accessor filter: when a path is selected, show ONLY its accessor.
  // direct_api paths produce no networkRows but still need their
  // accessor card rendered so the canvas isn't empty.
  const accessorsForPath = selectedPath
    ? payload.accessors.filter((a) => a.id === selectedPath.accessor_id)
    : payload.accessors

  // 1. SOURCE — the jewel renders as the ENTRY card. Using
  //    `entryPoints` (the lane Phase 2 added) keeps it leftmost
  //    without polluting compute/principals.
  const jewelId = payload.jewel.id
  entryPoints.push({
    id: jewelId,
    name: payload.jewel.name,
    shortName: shortName(payload.jewel.name),
    type: "principal", // TFM renders entryPoints via ServiceNodeBox; principal is the closest visual.
    instanceId: jewelId.slice(-12),
  })

  // 2. ACCESSORS → iamRoles lane. Carry usedCount/totalCount so
  //    TFM's IAMRoleNode renders the gap ring + provenance badge.
  for (const a of accessorsForPath) {
    if (seen.has(a.id)) continue
    seen.add(a.id)
    iamRoles.push({
      id: a.id,
      type: "iam_role",
      name: a.name,
      shortName: shortName(a.name),
      usedCount: a.used_actions_count ?? 0,
      totalCount: a.allowed_actions_count ?? 0,
      gapCount: a.unused_actions_count ?? 0,
      connectedSources: [],
      connectedTargets: [],
    })
    // Flow: jewel → accessor (the read edge, inverted into "data
    // leaves jewel via this accessor"). Observed accessors get a
    // red animated line driven by their CloudTrail hit_count.
    flows.push({
      sourceId: jewelId,
      targetId: a.id,
      ports: [],
      protocol: "iam",
      bytes: a.total_bytes,
      connections: a.hit_count || 1,
      isActive: a.provenance === "observed",
    })
  }

  // 3. WORKLOADS carrying the accessor roles → computeServices.
  //    Sourced from the network-egress payload's via_workload chip
  //    (every egress row carries its source workload). De-duped by id.
  //    Heavy serverless fans (CyntroLambdaTier1-pilot has 14 Lambdas)
  //    overflow the canvas; cap at EXFIL_COMPUTE_VISIBLE_CAP and emit
  //    a synthetic "+N more" placeholder so the count stays honest.
  const allWorkloads: ServiceNode[] = []
  for (const e of networkRows) {
    const w = e.via_workload
    if (!w?.id || seen.has(w.id)) continue
    seen.add(w.id)
    allWorkloads.push({
      id: w.id,
      name: w.name,
      shortName: shortName(w.name),
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

  // 3b. SUBNETS → unique via_subnet entries (+ RouteTable chip).
  //     The backend now carries via_subnet.route_table metadata when
  //     the subnet's route_table_id property resolves to a RouteTable
  //     node (Neo4j operator-traced 2026-05-25: 3 RouteTable nodes
  //     exist, joined by property not edge, hence the property-based
  //     extraction).
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

  // 3c. SECURITY GROUPS → unique via_security_groups across all
  //     egress rows. The backend now extracts SGs via canonical
  //     SECURED_BY edge + ENI fallback. Neo4j operator-traced 2026-
  //     05-25 confirmed every workload on this jewel's chain HAS an
  //     SG (saferemediate-test-app-sg, alon-demo-app-sg, default,
  //     cyntro-lambda-sg-pilot). The previous canvas's "SECURITY
  //     GROUPS (0)" was a frontend hardcode bug, not a graph gap.
  const sgSeen = new Set<string>()
  for (const e of networkRows) {
    for (const sg of e.via_security_groups || []) {
      if (!sg?.id || sgSeen.has(sg.id)) continue
      sgSeen.add(sg.id)
      const inb = Number(sg.inbound_rule_count ?? 0) || 0
      const outb = Number(sg.outbound_rule_count ?? 0) || 0
      const total = inb + outb
      securityGroups.push({
        id: sg.id,
        type: "security_group",
        name: sg.name,
        shortName: shortName(sg.name, 24),
        usedCount: 0,
        totalCount: total,
        gapCount: 0,
        connectedSources: [],
        connectedTargets: [],
      })
    }
  }

  // 4. EGRESS GATEWAYS — IGW / NAT / VPCE / TGW only. The backend
  //    also emits `WorkloadOnly` placeholder entries in the same
  //    network[] array when a workload has no resolved gateway
  //    (serverless Lambda, missing route-table edges). Those carry
  //    the COMPUTE info we've already added to computeServices
  //    above — they must NOT be pushed into egressGateways or
  //    they'd leak as fake gateway cards (2026-05-25 user report:
  //    "EGRESS GATEWAYS (15)" when only 6 real gateways exist).
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
    // Flow: workload → gateway, routed through the workload's
    // SG card so ConnectionLinesSVG zigzags through SG visually
    // (per 2026-05-25 user feedback: "why no traffic through SG").
    // The SG id we attach is the FIRST SG on this row's via_
    // security_groups — picking deterministically so multi-SG
    // workloads still produce a single visible flow line. If
    // future flows need to fan out per SG we'd push one flow per
    // SG instead.
    if (e.via_workload?.id) {
      const sgIdForFlow = e.via_security_groups?.[0]?.id
      flows.push({
        sourceId: e.via_workload.id,
        targetId: e.id,
        sgId: sgIdForFlow,
        ports: [],
        protocol: "tcp",
        bytes: 0,
        connections: 0,
        isActive: false,
      })
    }
  }

  // 5. DESTINATIONS → resources lane (rightmost). These are the
  //    final exit points (Internet today; ExternalAccount /
  //    ExternalRegion when Phase C lands). Render with type-
  //    matched icons via TFM's NodeType taxonomy ("internet"
  //    rather than "storage" so the operator doesn't see an S3
  //    bucket icon on the Internet card — 2026-05-25 user report).
  const destTypeFor = (kind: string): "internet" | "storage" => {
    if (kind === "internet") return "internet"
    // external_account / external_region don't have dedicated icons
    // yet; storage is the closest visual until Phase C lands.
    return "storage"
  }
  // 5a. Path-aware destination synthesis. Each exfil channel implies
  //     a SEMANTICALLY DIFFERENT destination — the Internet card only
  //     makes sense for network_via_igw. For serverless_direct /
  //     ec2_no_egress / direct_api we synthesize a destination that
  //     matches the channel's true exit semantics (AWS service public
  //     endpoint, AWS control-plane API).
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
    let routeSourceIds: string[] // ids that flow INTO the destination

    if (selectedPath.channel === "network_via_igw") {
      destId = "internet"
      destLabel = "Internet"
      destType = "internet"
      destProtocol = "internet"
      routeSourceIds = egressGateways.map((g) => g.id)
    } else if (selectedPath.channel === "direct_api") {
      // No workload — role called the AWS control-plane API directly
      // (root, AWSServiceRoleForResourceExplorer). Render a synthetic
      // "AWS Public API" destination flowing from the ACCESSOR.
      destId = "exfil-dest:aws-api"
      destLabel = "AWS Public API"
      destType = "internet"
      destProtocol = "https"
      routeSourceIds = [selectedPath.accessor_id]
    } else {
      // serverless_direct / ec2_no_egress — data leaves through the
      // AWS service plane (S3/DynamoDB public endpoint), NOT through
      // the customer's IGW. Flow originates at the WORKLOAD card.
      destId = `exfil-dest:${payload.jewel.type.toLowerCase()}-public`
      destLabel = `${payload.jewel.type} Public Endpoint`
      destType = "storage"
      destProtocol = "https"
      routeSourceIds = computeServices
        .filter((c) => !c.id.startsWith("__exfil_more__"))
        .map((c) => c.id)
    }

    const routeCount = Math.max(1, routeSourceIds.length)
    const headlineSuffix =
      observedRouteCount > 0
        ? `${routeCount} route${routeCount === 1 ? "" : "s"} · ${observedRouteCount} observed`
        : `${routeCount} route${routeCount === 1 ? "" : "s"} capable`
    const richLabel = `${destLabel} — ${headlineSuffix}`

    resources.push({
      id: destId,
      name: richLabel,
      shortName:
        shortName(destLabel, 18) +
        (observedRouteCount > 0 ? `  ${observedRouteCount}/${routeCount}` : `  ${routeCount}↗`),
      type: destType,
    } as ServiceNode)

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
    }
  } else {
    // Fallback: original all-paths-merged behavior (only fires on the
    // initial frame before defaultPathId is set).
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
      const richLabel = `${d.label} — ${headlineSuffix}`
      resources.push({
        id: d.id,
        name: richLabel,
        shortName: shortName(d.label, 18) + (observed > 0 ? `  ${observed}/${capable}` : `  ${capable}↗`),
        type: destTypeFor(d.kind),
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
      }
    }
  }

  // Aggregate totals — TFM renders these in the inner header.
  const totalBytes = flows.reduce((s, f) => s + (f.bytes || 0), 0)
  const totalConnections = flows.reduce((s, f) => s + (f.connections || 0), 0)

  return {
    computeServices,
    entryPoints,
    principals: [], // empty — the entry card IS the jewel itself
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
    totalBytes,
    totalConnections,
    totalGaps: 0,
    vpcGroups: [],
  }
}

function shortName(name: string, maxLen = 22): string {
  if (!name) return ""
  if (name.length <= maxLen) return name
  const half = Math.floor((maxLen - 1) / 2)
  return name.slice(0, half) + "…" + name.slice(-(maxLen - half - 1))
}
