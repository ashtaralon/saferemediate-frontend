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

import { useMemo } from "react"
import dynamic from "next/dynamic"
import { Crown, AlertTriangle, ArrowRight, RefreshCw } from "lucide-react"
import { useRetryFetch } from "@/lib/use-retry-fetch"
import { FreshnessBanner } from "@/components/freshness-banner"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import type {
  SystemArchitecture,
  ServiceNode,
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
  via_workload: { id: string; name: string; type: string }
  via_subnet: { id: string; name: string; public: boolean | null }
  via_vpc: { id: string; name: string }
  provenance: "capable" | "observed"
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

  // Build the SystemArchitecture for TFM from the EXFIL payload. Same
  // pattern as buildAttackerArchitecture in attacker-view-panel.tsx,
  // just inverted.
  const architecture = useMemo<SystemArchitecture | null>(() => {
    if (!data || !data.ok) return null
    return buildExfilArchitecture(data)
  }, [data])

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
  const subtitle = `${data.accessors.length} accessor${data.accessors.length === 1 ? "" : "s"} (${capableCount} capable · ${observedCount} observed) → ${data.egress_lanes.network.length} network egress → ${data.destinations.length} destination${data.destinations.length === 1 ? "" : "s"}`

  if (!architecture) return null

  return (
    <div className="flex flex-col h-full">
      <Header jewel={jewel} subtitle={subtitle} />
      <div className="flex-1 min-h-0">
        <TrafficFlowMap
          systemName={systemName}
          architectureOverride={architecture}
          observedMode={true}
          titleOverride=""
          innerTitleOverride="Exfiltration Surface"
          innerSubtitleOverride={
            data.observed_exfil.available
              ? "Data exit paths — capable (amber) vs observed (red)"
              : "Capable data-exit paths — observed-exfil layer pending Phase D collector"
          }
          pathBadgeOverride={`Exfil → ${data.jewel.name}`}
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
function buildExfilArchitecture(payload: ExfilPayload): SystemArchitecture {
  const computeServices: ServiceNode[] = []
  const resources: ServiceNode[] = []
  const iamRoles: SecurityCheckpoint[] = []
  const egressGateways: EgressGatewayNode[] = []
  const entryPoints: ServiceNode[] = []
  const flows: TrafficFlow[] = []
  const seen = new Set<string>()

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
  for (const a of payload.accessors) {
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
  //    Sourced from the network-egress payload's via_workload chip.
  //    Multiple egress entries may share a workload — de-dupe.
  for (const e of payload.egress_lanes.network) {
    const w = e.via_workload
    if (!w?.id || seen.has(w.id)) continue
    seen.add(w.id)
    computeServices.push({
      id: w.id,
      name: w.name,
      shortName: shortName(w.name),
      type: w.type.toLowerCase().includes("lambda") ? "lambda" : "compute",
      instanceId: w.id.startsWith("i-") ? w.id : w.id.slice(-12),
    })
  }

  // 4. EGRESS GATEWAYS — IGW / NAT / etc. Same lane the Attacker
  //    View uses on the exit side; we just populate it from
  //    payload.egress_lanes.network directly.
  for (const e of payload.egress_lanes.network) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    const kind = (e.kind as EgressGatewayNode["kind"]) || "InternetGateway"
    const kindLabel: Record<string, string> = {
      InternetGateway: "IGW",
      NATGateway: "NAT GW",
      EgressOnlyInternetGateway: "Egress-only IGW",
      TransitGateway: "Transit GW",
    }
    egressGateways.push({
      id: e.id,
      name: e.name,
      shortName: shortName(e.name),
      vpcId: e.via_vpc?.id ?? null,
      kind: kind,
      kindLabel: kindLabel[kind] || kind,
    })
    // Flow: workload → IGW. Configured (gray) line — observed-byte
    // attribution per egress route lands with Phase D.
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
    }
  }

  // 5. DESTINATIONS → resources lane (rightmost). These are the
  //    final exit points (Internet today; ExternalAccount /
  //    ExternalRegion when Phase C lands). Render as crown-jewel-
  //    styled "data destination" cards.
  for (const d of payload.destinations) {
    if (seen.has(d.id)) continue
    seen.add(d.id)
    const isObserved = d.observed_route_count > 0
    resources.push({
      id: d.id,
      name: d.label,
      shortName: shortName(d.label, 28),
      type: "storage", // TFM resource lane visual; "destination" isn't a TFM type
    })
    // Flow: each egress → destination. Observed (red) when any
    // observed routes exist for the destination; else configured.
    for (const e of payload.egress_lanes.network) {
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

  // Aggregate totals — TFM renders these in the inner header.
  const totalBytes = flows.reduce((s, f) => s + (f.bytes || 0), 0)
  const totalConnections = flows.reduce((s, f) => s + (f.connections || 0), 0)

  return {
    computeServices,
    entryPoints,
    principals: [], // empty — the entry card IS the jewel itself
    resources,
    subnets: [],
    securityGroups: [],
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
