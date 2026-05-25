"use client"

/**
 * Exfil View v0.3 — 9-lane data-egress renderer.
 *
 * Mirror of Attacker View v0.3 (attacker-view-v3.tsx) but inverted:
 * BFS-FORWARD from the crown jewel. Same 9-column grid primitive,
 * same NodeCard chip palette, same evidence dots, same connection-
 * layer SVG. Different lane semantics and direction:
 *
 *   CJ SOURCE  →  READER PRINCIPAL  →  READER WORKLOAD  →  STAGING  →
 *   EGRESS GATE  →  EGRESS PATH  →  EXFIL CHANNEL  →
 *   EXTERNAL DESTINATION  +  DEFENSE (overlay)
 *
 * Data source: /api/proxy/attack-chain/exfil-paths (no backend change).
 * The payload's accessors[] / paths[] / egress_lanes.network[] /
 * destinations[] are reshaped into the 9 lanes. Each path
 * (accessor, channel) becomes one selectable chain — mirrors how
 * Attacker View renders one chain per (workload, role, cj).
 *
 * Honesty contract — verified against live Neo4j 2026-05-25:
 *   - Lane 4 STAGING: zero graph nodes (no S3ReplicationRule,
 *     DataSyncTask, AppFlowFlow, StagingResource, etc. exist today).
 *     Renders explicit "Not collected — Phase B" empty state, NOT a
 *     fabricated card.
 *   - Lane 7 EXFIL CHANNEL: backend classifies 4 channels today
 *     (network_via_igw, serverless_direct, ec2_no_egress, direct_api).
 *     Spec §4 lists ~30 channels; the empty-state chip surfaces the
 *     roadmap honestly instead of hiding it.
 *   - Lane 8 EXTERNAL DESTINATION: only "Internet" placeholder until
 *     Phase D collectors land EXFILTRATED_TO edges. observed_exfil
 *     .available=false from backend → destination renders with
 *     amber "destination unverified" tone, not red.
 *   - Lane 9 DEFENSE: derived from existing graph fields only —
 *     accessor.used vs allowed gap, workload_network.evidence,
 *     observed_exfil.available, has_internet_exposed on the workload.
 *     No fabricated detection signals.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import * as React from "react"
import dynamic from "next/dynamic"
import {
  Crown,
  Key,
  Server,
  Package,
  Shield,
  Route,
  ArrowUpRight,
  Globe,
  Eye,
  AlertCircle,
  RefreshCw,
  Loader2,
} from "lucide-react"
import { useRetryFetch } from "@/lib/use-retry-fetch"
import { FreshnessBanner } from "@/components/freshness-banner"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import { buildExfilArchitecture } from "./exfil-view-panel"

// Lazy-load TrafficFlowMap so the heavy dynamic-map renderer is fetched
// only when this view is mounted. Mirrors the load pattern used by the
// legacy ExfilViewPanel (which also dynamic()'d it for SSR safety).
const TrafficFlowMap = dynamic(
  () => import("@/components/dependency-map/traffic-flow-map"),
  { ssr: false },
)

// ---------------------------------------------------------------------------
// 9 EXFIL lanes — mirror of ATTACK_LANES but data-egress-oriented
// ---------------------------------------------------------------------------

export type ExfilLane =
  | "source"       // CJ SOURCE — the crown jewel itself
  | "principal"    // READER PRINCIPAL — accessors with read on the jewel
  | "workload"     // READER WORKLOAD — where the read runs
  | "staging"      // STAGING — pre-egress buffers (S3 replication, /tmp, etc.)
  | "gate"         // EGRESS GATE — SG outbound, NACL outbound, resource policy
  | "path"         // EGRESS PATH — subnet, route table, IGW / NAT / VPCE
  | "channel"      // EXFIL CHANNEL — network_via_igw, serverless_direct, etc.
  | "destination"  // EXTERNAL DESTINATION — Internet / ExternalAccount / SaaS
  | "defense"      // DEFENSE — overlay of what would catch this

interface ExfilLaneConfig {
  id: ExfilLane
  label: string
  attackerQuestion: string
  accent: string
  icon: string
}

const EXFIL_LANES: ExfilLaneConfig[] = [
  {
    id: "source",
    label: "CJ SOURCE",
    attackerQuestion: "What data am I exfiltrating?",
    accent: "#10b981",
    icon: "Crown",
  },
  {
    id: "principal",
    label: "READER PRINCIPAL",
    attackerQuestion: "Whose identity is reading it?",
    accent: "#a855f7",
    icon: "Key",
  },
  {
    id: "workload",
    label: "READER WORKLOAD",
    attackerQuestion: "Where does the read run?",
    accent: "#3b82f6",
    icon: "Server",
  },
  {
    id: "staging",
    label: "STAGING",
    attackerQuestion: "Where is the data buffered?",
    accent: "#64748b",
    icon: "Package",
  },
  {
    id: "gate",
    label: "EGRESS GATE",
    attackerQuestion: "What controls allow it out?",
    accent: "#14b8a6",
    icon: "Shield",
  },
  {
    id: "path",
    label: "EGRESS PATH",
    attackerQuestion: "What's the route out of the VPC?",
    accent: "#0ea5e9",
    icon: "Route",
  },
  {
    id: "channel",
    label: "EXFIL CHANNEL",
    attackerQuestion: "What method carries the data?",
    accent: "#f97316",
    icon: "ArrowUpRight",
  },
  {
    id: "destination",
    label: "EXTERNAL DESTINATION",
    attackerQuestion: "Where does the data end up?",
    accent: "#ef4444",
    icon: "Globe",
  },
  {
    id: "defense",
    label: "DEFENSE & DETECTION",
    attackerQuestion: "What would catch this?",
    accent: "#facc15",
    icon: "Eye",
  },
]

const LANE_ICONS: Record<string, any> = {
  Crown,
  Key,
  Server,
  Package,
  Shield,
  Route,
  ArrowUpRight,
  Globe,
  Eye,
}

// ---------------------------------------------------------------------------
// Payload types — mirror backend api/exfil_paths.py response shape
// ---------------------------------------------------------------------------

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
  service_name?: string | null
  endpoint_type?: string | null
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

interface WorkloadNetwork {
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
  workload_network: WorkloadNetwork | null
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

interface ExfilLaneNotWired {
  items: unknown[]
  not_wired: true
  not_wired_reason: string
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

// ---------------------------------------------------------------------------
// Lane projection — turn an ExfilPath into per-lane node lists
// ---------------------------------------------------------------------------

interface LaneNode {
  id: string
  type: string
  name: string
  lane: ExfilLane
  /** Evidence strength for the dot — observed beats capable beats unknown. */
  evidence: "observed" | "config" | "unknown"
  /** Optional badge text shown on the card (e.g. "789k reads"). */
  badge?: string
}

interface ProjectedExfilChain {
  path: ExfilPath
  payload: ExfilPayload
  /** The network egress rows filtered to this path's (accessor, channel). */
  networkRows: ExfilNetworkEgressItem[]
  nodesByLane: Record<ExfilLane, LaneNode[]>
  /** Honest "not collected" copy per lane when graph has nothing. */
  notCollectedByLane: Partial<Record<ExfilLane, string>>
}

function compactCount(n: number | null | undefined): string {
  if (!n || !isFinite(n)) return "0"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return String(Math.round(n))
}

function projectExfilChain(
  payload: ExfilPayload,
  path: ExfilPath,
): ProjectedExfilChain {
  // Filter the flat network[] array down to this (accessor, channel) slice
  // so the lane cards reflect only this chain's posture.
  const networkRows = payload.egress_lanes.network.filter(
    (e) => e.accessor_id === path.accessor_id && (e.channel ?? "") === path.channel,
  )

  const nodesByLane: Record<ExfilLane, LaneNode[]> = {
    source: [],
    principal: [],
    workload: [],
    staging: [],
    gate: [],
    path: [],
    channel: [],
    destination: [],
    defense: [],
  }
  const notCollectedByLane: Partial<Record<ExfilLane, string>> = {}

  // Lane 1 — CJ SOURCE (always backed; payload.jewel is required).
  nodesByLane.source.push({
    id: payload.jewel.id,
    type: payload.jewel.type,
    name: payload.jewel.name,
    lane: "source",
    evidence: "observed",
    badge:
      payload.jewel.classification ||
      (payload.jewel.type ? payload.jewel.type : undefined),
  })

  // Lane 2 — READER PRINCIPAL (the path's accessor).
  const accessor = payload.accessors.find((a) => a.id === path.accessor_id)
  if (accessor) {
    nodesByLane.principal.push({
      id: accessor.id,
      type: accessor.type,
      name: accessor.name,
      lane: "principal",
      evidence: accessor.provenance === "observed" ? "observed" : "config",
      badge:
        accessor.hit_count > 0
          ? `${compactCount(accessor.hit_count)} reads`
          : undefined,
    })
  } else {
    nodesByLane.principal.push({
      id: path.accessor_id,
      type: path.accessor_type,
      name: path.accessor_name,
      lane: "principal",
      evidence: path.accessor_provenance === "observed" ? "observed" : "config",
    })
  }

  // Lane 3 — READER WORKLOAD (from path.workload_sample; falls back to
  // via_workload from network rows when sample is empty).
  const workloadIds = new Set<string>()
  for (const wk of path.workload_sample || []) {
    if (!wk.id || workloadIds.has(wk.id)) continue
    workloadIds.add(wk.id)
    nodesByLane.workload.push({
      id: wk.id,
      type: wk.type,
      name: wk.name,
      lane: "workload",
      evidence: "config",
    })
  }
  for (const row of networkRows) {
    const wk = row.via_workload
    if (!wk?.id || workloadIds.has(wk.id)) continue
    workloadIds.add(wk.id)
    nodesByLane.workload.push({
      id: wk.id,
      type: wk.type,
      name: wk.name,
      lane: "workload",
      evidence: "config",
    })
  }
  if (nodesByLane.workload.length === 0) {
    // direct_api channel — accessor calls AWS API with no workload.
    notCollectedByLane.workload =
      path.channel === "direct_api"
        ? "Direct API call — no workload in the chain (root / service-linked role)"
        : "No workload edge in graph for this accessor"
  }

  // Lane 4 — STAGING. Verified against live Neo4j 2026-05-25: zero
  // S3ReplicationRule / DataSyncTask / AppFlowFlow / StagingResource
  // nodes exist for this jewel. Honest empty state per design memo §10.
  notCollectedByLane.staging =
    "Not collected — Phase B: S3 replication rules, DataSync tasks, AppFlow flows, local-disk buffers"

  // Lane 5 — EGRESS GATE: deduped SGs from network rows + workload_network
  // fallback for non-VPC workloads.
  const gateIds = new Set<string>()
  for (const row of networkRows) {
    for (const sg of row.via_security_groups || []) {
      if (!sg?.id || gateIds.has(sg.id)) continue
      gateIds.add(sg.id)
      const totalRules =
        (sg.inbound_rule_count ?? 0) + (sg.outbound_rule_count ?? 0)
      nodesByLane.gate.push({
        id: sg.id,
        type: "SecurityGroup",
        name: sg.name,
        lane: "gate",
        evidence: "config",
        badge: totalRules > 0 ? `${totalRules} rules` : undefined,
      })
    }
  }
  if (
    nodesByLane.gate.length === 0 &&
    path.workload_network?.is_vpc_attached
  ) {
    for (const sg of path.workload_network.security_groups || []) {
      if (!sg.id || gateIds.has(sg.id)) continue
      gateIds.add(sg.id)
      nodesByLane.gate.push({
        id: sg.id,
        type: "SecurityGroup",
        name: sg.name ?? sg.id,
        lane: "gate",
        evidence: "config",
      })
    }
  }
  if (nodesByLane.gate.length === 0) {
    notCollectedByLane.gate =
      path.channel === "serverless_direct" || path.channel === "direct_api"
        ? "No network controls — IAM is the only gate"
        : "No SG / NACL on workload — verify VPC attachment"
  }

  // Lane 6 — EGRESS PATH: subnet + route table + gateway. Per row, but
  // deduped across rows.
  const pathIds = new Set<string>()
  for (const row of networkRows) {
    const sn = row.via_subnet
    if (sn?.id && !pathIds.has(`sn:${sn.id}`)) {
      pathIds.add(`sn:${sn.id}`)
      const visibility =
        sn.public === true ? "Public subnet" : sn.public === false ? "Private subnet" : undefined
      nodesByLane.path.push({
        id: sn.id,
        type: "Subnet",
        name: sn.name || sn.id,
        lane: "path",
        evidence: "config",
        badge: visibility,
      })
      const rt = sn.route_table
      if (rt?.id && !pathIds.has(`rt:${rt.id}`)) {
        pathIds.add(`rt:${rt.id}`)
        nodesByLane.path.push({
          id: rt.id,
          type: "RouteTable",
          name: rt.name || rt.id,
          lane: "path",
          evidence: "config",
          badge:
            rt.is_main === true
              ? "main RT"
              : rt.route_count != null
                ? `${rt.route_count} routes`
                : undefined,
        })
      }
    }
    // Gateways (skip WorkloadOnly synthetics).
    if (row.kind && row.kind !== "WorkloadOnly" && !pathIds.has(`gw:${row.id}`)) {
      pathIds.add(`gw:${row.id}`)
      const kindLabel: Record<string, string> = {
        InternetGateway: "IGW",
        NATGateway: "NAT",
        EgressOnlyInternetGateway: "EIGW",
        TransitGateway: "TGW",
        VPCEndpoint: "VPCE",
      }
      nodesByLane.path.push({
        id: row.id,
        type: row.kind,
        name: row.name,
        lane: "path",
        evidence: "config",
        badge: kindLabel[row.kind] || row.kind,
      })
    }
  }
  if (nodesByLane.path.length === 0) {
    notCollectedByLane.path =
      path.channel === "serverless_direct"
        ? "Non-VPC Lambda — AWS-managed network, no SG / route table / gateway"
        : path.channel === "direct_api"
          ? "Direct API call — no VPC route"
          : "No subnet / route / gateway edges in graph"
  }

  // Lane 7 — EXFIL CHANNEL: one card per path. Backend currently
  // classifies 4 channels; carry the label and provenance.
  const channelBadge = {
    network_via_igw: "Network via IGW",
    serverless_direct: "Serverless direct",
    ec2_no_egress: "EC2, no egress",
    direct_api: "Direct API",
  }[path.channel] || path.channel
  nodesByLane.channel.push({
    id: `channel:${path.path_id}`,
    type: path.channel,
    name: path.channel_label,
    lane: "channel",
    evidence: path.accessor_provenance === "observed" ? "observed" : "config",
    badge: channelBadge,
  })

  // Lane 8 — EXTERNAL DESTINATION. Phase A only ships "Internet"
  // placeholder; observed_exfil.available=false from backend means
  // destination is structurally inferred, not observation-backed.
  // Render the destination, mark unverified honestly.
  const dest = payload.destinations.find((d) => d.kind === "internet")
  if (
    dest &&
    (path.channel === "network_via_igw" ||
      path.channel === "serverless_direct" ||
      path.channel === "direct_api")
  ) {
    const verified = payload.observed_exfil.available
    nodesByLane.destination.push({
      id: dest.id,
      type: dest.kind,
      name: dest.label,
      lane: "destination",
      evidence: verified ? "observed" : "config",
      badge: verified
        ? `${dest.observed_route_count}/${dest.capable_route_count} routes observed`
        : "destination unverified",
    })
  } else if (path.channel === "ec2_no_egress") {
    notCollectedByLane.destination =
      "EC2 in private subnet with no IGW / NAT — data has no observed exit route"
  } else {
    notCollectedByLane.destination =
      "No destination edge in graph — Phase D: EXFILTRATED_TO from CloudTrail data events"
  }

  return { path, payload, networkRows, nodesByLane, notCollectedByLane }
}

// ---------------------------------------------------------------------------
// Defense signals — derive ONLY from existing payload fields
// ---------------------------------------------------------------------------

interface DefenseSignal {
  label: string
  state: "ok" | "warning" | "gap"
  detail: string
}

function deriveDefenseSignals(projected: ProjectedExfilChain): DefenseSignal[] {
  const { path, payload } = projected
  const sigs: DefenseSignal[] = []

  // 1. Observed exfil layer (Phase D). When unavailable, every observed
  // count is structurally zero — surface that explicitly.
  sigs.push({
    label: payload.observed_exfil.available
      ? "Observed exfil edges present"
      : "Observed exfil layer not wired",
    state: payload.observed_exfil.available ? "ok" : "warning",
    detail: payload.observed_exfil.available
      ? "EXFILTRATED_TO edges populated from CloudTrail data events"
      : "Phase D: CloudTrail data-event classifier pending",
  })

  // 2. VPC posture evidence — honest "what did we look at" citation.
  if (path.workload_network) {
    sigs.push({
      label: path.workload_network.is_vpc_attached
        ? "Workload VPC-attached"
        : "Workload non-VPC",
      state: path.workload_network.is_vpc_attached ? "ok" : "warning",
      detail: path.workload_network.evidence,
    })
  } else {
    sigs.push({
      label: "Workload network not queried",
      state: "warning",
      detail:
        path.channel === "direct_api"
          ? "Direct API path — no workload to query"
          : "No workload found in graph for this accessor",
    })
  }

  // 3. Role action gap — closure opportunity.
  const accessor = payload.accessors.find((a) => a.id === path.accessor_id)
  if (
    accessor &&
    accessor.allowed_actions_count != null &&
    accessor.used_actions_count != null &&
    accessor.allowed_actions_count > 0
  ) {
    const excess =
      accessor.unused_actions_count ??
      Math.max(accessor.allowed_actions_count - accessor.used_actions_count, 0)
    sigs.push({
      label: excess > 0 ? "Excess role permissions" : "Role fully utilised",
      state: excess > 0 ? "gap" : "ok",
      detail:
        excess > 0
          ? `${accessor.used_actions_count} of ${accessor.allowed_actions_count} actions used — ${excess} closable`
          : `${accessor.used_actions_count} of ${accessor.allowed_actions_count} actions used — no excess`,
    })
  }

  // 4. Channel-specific defense gap.
  if (path.channel === "serverless_direct" || path.channel === "direct_api") {
    sigs.push({
      label: "No network gate",
      state: "gap",
      detail:
        "No SG / NACL / NAT in the path — only IAM permission limits the reach",
    })
  }

  return sigs
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ExfilViewV3Props {
  systemName: string
  jewel: CrownJewelSummary | null
}

export function ExfilViewV3({ systemName, jewel }: ExfilViewV3Props) {
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
  const { data, loading, error, retry } = useRetryFetch<ExfilPayload>(
    enabled ? "/api/proxy/attack-chain/exfil-paths" : null,
    {
      fetchInit,
      refetchKey: `${systemName}:${jewel?.id ?? ""}`,
      maxRetries: 2,
      initialDelayMs: 1000,
    },
  )

  const paths = data?.paths ?? []
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null)

  // Snap to default path when payload arrives or jewel switches.
  useEffect(() => {
    if (!paths.length) {
      setSelectedPathId(null)
      return
    }
    const valid = paths.some((p) => p.path_id === selectedPathId)
    if (!valid) setSelectedPathId(paths[0].path_id)
  }, [paths, selectedPathId])

  const projected = useMemo<ProjectedExfilChain | null>(() => {
    if (!data?.ok) return null
    const path = paths.find((p) => p.path_id === selectedPathId) ?? paths[0]
    if (!path) return null
    return projectExfilChain(data, path)
  }, [data, paths, selectedPathId])

  if (!enabled) {
    return (
      <div className="flex flex-col h-full bg-[#0f172a] text-slate-100">
        <Header jewel={jewel} subtitle="Select a crown jewel to see its exfil surface" />
        <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
          No crown jewel selected.
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-[#0f172a] text-slate-100">
        <Header jewel={jewel} subtitle="Computing exfiltration surface…" />
        <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Walking forward from the jewel — mapping every door the data can leave through…
        </div>
      </div>
    )
  }

  if (error || !data || !data.ok) {
    const msg = error || data?.error || "Exfil paths failed"
    return (
      <div className="flex flex-col h-full bg-[#0f172a] text-slate-100">
        <Header jewel={jewel} subtitle="Could not load exfil view" />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 max-w-md text-sm text-red-200">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4" />
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

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-[#0f172a] text-slate-100">
      <Header
        jewel={jewel}
        subtitle={`${paths.length} exfil path${paths.length === 1 ? "" : "s"} · ${data.accessors.length} reader${data.accessors.length === 1 ? "" : "s"} · ${data.egress_lanes.network.length} network egress row${data.egress_lanes.network.length === 1 ? "" : "s"} · phase ${data.phase}`}
      />

      <ChainSummaryBar
        paths={paths}
        selectedId={projected?.path.path_id ?? null}
        onSelect={setSelectedPathId}
      />

      <div className="overflow-auto p-4">
        {paths.length === 0 ? (
          <EmptyState />
        ) : projected ? (
          <NineLaneGrid projected={projected} />
        ) : null}
      </div>

      {/* Dynamic flow map — embedded TrafficFlowMap scoped to the selected
          exfil chain. Mirrors attacker-view-v3.tsx's ChainFlowMapSection
          (line 510) which gives operators a SPATIAL view of the same chain
          they just saw in the categorical lane grid. The architecture is
          built by buildExfilArchitecture() from the legacy exfil-view-panel
          — same egress-oriented SystemArchitecture (jewel on left, exfil
          gates on right, observed flows animated red) the operator was
          already familiar with. */}
      {projected && systemName ? (
        <ChainFlowMapSection
          payload={data}
          selectedPath={projected.path}
          systemName={systemName}
        />
      ) : null}

      {projected ? (
        <BusinessSentencePanel projected={projected} />
      ) : null}

      {/* Honest collector-backlog strip — surfaces the not-wired exfil
          sub-lanes inline so the operator sees which surfaces are
          pending instead of inferring completeness. */}
      <NotWiredStrip payload={data} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Header({
  jewel,
  subtitle,
}: {
  jewel: CrownJewelSummary | null
  subtitle: string
}) {
  return (
    <div className="px-4 py-3 border-b border-slate-700/60 flex items-center justify-between bg-slate-950/95 backdrop-blur sticky top-0 z-10">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <ArrowUpRight className="h-3 w-3 text-amber-300" />
          Exfil View · v0.3 · 9-Lane Data-Egress Map
          <FreshnessBanner variant="pill" className="ml-2" />
        </div>
        <div className="text-sm font-semibold text-slate-100 mt-0.5 truncate">
          {jewel?.name ?? "(no jewel selected)"}{" "}
          {jewel?.type ? (
            <span className="text-xs text-slate-400 font-normal">({jewel.type})</span>
          ) : null}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">{subtitle}</div>
      </div>
    </div>
  )
}

function ChainSummaryBar({
  paths,
  selectedId,
  onSelect,
}: {
  paths: ExfilPath[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (paths.length === 0) return null
  return (
    <div className="px-4 py-2 border-b border-slate-700/40">
      <div className="flex items-center gap-2 mb-2 text-[10px] text-slate-400 uppercase tracking-wider">
        <span>{paths.length} exfil chain{paths.length === 1 ? "" : "s"}</span>
        <span className="text-slate-600">·</span>
        <span className="text-slate-500">
          one chain per (reader, channel) — pick one to inspect
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {paths.map((p) => {
          const active = selectedId === p.path_id
          const observed = p.accessor_provenance === "observed"
          const dot = observed ? "#ef4444" : "#f59e0b"
          return (
            <button
              key={p.path_id}
              onClick={() => onSelect(p.path_id)}
              className={`px-2.5 py-1 rounded border text-[11px] transition-colors text-left ${
                active
                  ? "bg-amber-500/10 border-amber-500/50 text-slate-100"
                  : "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-700/60"
              }`}
              title={`${p.channel_label} · ${p.workload_count} workload${p.workload_count === 1 ? "" : "s"} · ${p.gateway_count} gateway${p.gateway_count === 1 ? "" : "s"} · ${p.jewel_hits.toLocaleString()} reads`}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
                style={{ background: dot }}
              />
              <span className="font-mono">{p.accessor_name}</span>{" "}
              <span className="text-slate-400">·</span>{" "}
              <span>{p.channel_label}</span>{" "}
              <span className="text-slate-500">
                · {compactCount(p.jewel_hits)} reads
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-sm">
      <AlertCircle className="w-8 h-8 mb-3 text-slate-500" />
      <div className="font-semibold text-slate-200 mb-1">No exfil paths surfaced</div>
      <div className="text-xs text-slate-400 max-w-md text-center">
        Backend returned ok but no (accessor, channel) chains. Likely this
        jewel has no ACCESSES_RESOURCE / ACTUAL_S3_ACCESS edges in the
        graph yet — re-sync CloudTrail or re-run the LP collector.
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 9-lane grid — mirror of attacker-view-v3's NineLaneGrid
// ---------------------------------------------------------------------------

function NineLaneGrid({ projected }: { projected: ProjectedExfilChain }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(
    new Map(),
  )
  const [, forceUpdate] = useState({})

  const defenseSignals = useMemo(
    () => deriveDefenseSignals(projected),
    [projected],
  )

  // Re-measure card positions after layout for the SVG connection layer.
  useEffect(() => {
    const measure = () => {
      if (!containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      const positions = new Map<string, { x: number; y: number }>()
      cardRefs.current.forEach((el, id) => {
        if (!el) return
        const r = el.getBoundingClientRect()
        positions.set(id, {
          x: r.left - containerRect.left + r.width / 2,
          y: r.top - containerRect.top + r.height / 2,
        })
      })
      nodePositionsRef.current = positions
      forceUpdate({})
    }
    const id = requestAnimationFrame(measure)
    window.addEventListener("resize", measure)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener("resize", measure)
    }
  }, [projected])

  return (
    <div ref={containerRef} className="relative">
      {/* Lane headers */}
      <div className="grid grid-cols-9 gap-2 mb-2">
        {EXFIL_LANES.map((lane) => {
          const Icon = LANE_ICONS[lane.icon] || Globe
          const count = (projected.nodesByLane[lane.id] || []).length
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
                {lane.attackerQuestion}
              </div>
            </div>
          )
        })}
      </div>

      {/* Lane bodies */}
      <div className="grid grid-cols-9 gap-2 relative">
        {EXFIL_LANES.map((lane) => {
          const nodes = projected.nodesByLane[lane.id] || []
          const notCollected = projected.notCollectedByLane[lane.id]
          return (
            <div
              key={lane.id}
              className="min-h-[300px] bg-slate-900/40 border border-slate-800 rounded p-1.5 space-y-1.5"
              style={{ borderLeftColor: lane.accent, borderLeftWidth: 2 }}
            >
              {lane.id === "defense" ? (
                <DefenseLaneContent signals={defenseSignals} />
              ) : nodes.length === 0 ? (
                <LaneEmptyState lane={lane} reason={notCollected} />
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

        <ConnectionLayer
          containerRef={containerRef}
          nodePositions={nodePositionsRef.current}
          nodesByLane={projected.nodesByLane}
        />
      </div>
    </div>
  )
}

// Chip palette — same as attacker-view-v3 so the visual language is identical.
const CHIP_RED = "bg-red-900/40 border-red-500/60 text-red-200"
const CHIP_AMBER = "bg-amber-900/30 border-amber-500/50 text-amber-200"
const CHIP_GREEN = "bg-emerald-900/30 border-emerald-500/50 text-emerald-200"
const CHIP_SLATE = "bg-slate-700/60 border-slate-600 text-slate-300"

function evidenceDot(evidence: string): string {
  if (evidence === "observed") return "#10b981"
  if (evidence === "config") return "#94a3b8"
  return "#f59e0b"
}

function NodeCard({
  node,
  setRef,
}: {
  node: LaneNode
  setRef: (el: HTMLDivElement | null) => void
}) {
  const isSource = node.lane === "source"
  const isDestination = node.lane === "destination"
  const shortName =
    node.name.length > 22
      ? node.name.slice(0, 10) + "…" + node.name.slice(-10)
      : node.name

  let badgeTone = CHIP_SLATE
  if (node.badge === "destination unverified") badgeTone = CHIP_AMBER
  else if (node.badge?.includes("observed")) badgeTone = CHIP_RED
  else if (node.badge === "Public subnet") badgeTone = CHIP_AMBER
  else if (node.badge === "Private subnet") badgeTone = CHIP_GREEN
  else if (node.evidence === "observed") badgeTone = CHIP_GREEN

  return (
    <div
      ref={setRef}
      className={`relative px-2 py-1.5 rounded text-[10px] border ${
        isSource
          ? "bg-emerald-900/40 border-emerald-500/60"
          : isDestination
            ? "bg-red-900/30 border-red-500/50"
            : "bg-slate-800/80 border-slate-700"
      }`}
      title={`${node.type}: ${node.name}`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: evidenceDot(node.evidence) }}
        />
        <span className="text-slate-200 truncate flex-1 font-mono">{shortName}</span>
      </div>
      <div className="text-[9px] text-slate-500 mt-0.5 truncate">{node.type}</div>
      {node.badge ? (
        <div className="mt-1">
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] border ${badgeTone}`}
            title={node.badge}
          >
            {node.badge}
          </span>
        </div>
      ) : null}
    </div>
  )
}

function LaneEmptyState({
  lane,
  reason,
}: {
  lane: ExfilLaneConfig
  reason?: string
}) {
  return (
    <div className="text-[10px] text-slate-500 italic px-2 py-3 text-center leading-tight">
      {reason ? (
        <>
          <div className="text-amber-400/80 text-[9px] uppercase tracking-wider mb-1 font-semibold not-italic">
            Honest empty
          </div>
          <div>{reason}</div>
        </>
      ) : (
        <>No {lane.label.toLowerCase()} on this chain</>
      )}
    </div>
  )
}

function DefenseLaneContent({ signals }: { signals: DefenseSignal[] }) {
  if (signals.length === 0) {
    return (
      <div className="text-[10px] text-slate-500 italic px-2 py-3 text-center">
        No defense signals derived
      </div>
    )
  }
  return (
    <>
      {signals.map((s, i) => {
        const palette =
          s.state === "ok"
            ? {
                bg: "bg-emerald-900/30",
                border: "border-emerald-500/40",
                color: "text-emerald-300",
                icon: "✓",
              }
            : s.state === "warning"
              ? {
                  bg: "bg-amber-900/30",
                  border: "border-amber-500/40",
                  color: "text-amber-300",
                  icon: "⚠",
                }
              : {
                  bg: "bg-red-900/30",
                  border: "border-red-500/40",
                  color: "text-red-300",
                  icon: "✗",
                }
        return (
          <div
            key={i}
            className={`px-2 py-1.5 rounded text-[10px] ${palette.bg} border ${palette.border}`}
          >
            <div
              className={`flex items-center gap-1 ${palette.color} text-[10px] font-semibold`}
            >
              <span>{palette.icon}</span>
              <span>{s.label}</span>
            </div>
            <div className="text-[9px] text-slate-400 mt-0.5 leading-tight">
              {s.detail}
            </div>
          </div>
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// SVG connection layer — orange lane-to-lane arrows in EXFIL direction
// ---------------------------------------------------------------------------

function ConnectionLayer({
  containerRef,
  nodePositions,
  nodesByLane,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>
  nodePositions: Map<string, { x: number; y: number }>
  nodesByLane: Record<ExfilLane, LaneNode[]>
}) {
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return
      const r = containerRef.current.getBoundingClientRect()
      setSize({ w: r.width, h: r.height })
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef.current])

  if (nodePositions.size === 0) return null

  // Build the egress flow: connect each card in lane[i] to each card in
  // the next NON-EMPTY lane (skip staging when empty, skip destination
  // when not-collected). DEFENSE lane is overlay — never wired.
  const FLOW_LANES: ExfilLane[] = [
    "source",
    "principal",
    "workload",
    "staging",
    "gate",
    "path",
    "channel",
    "destination",
  ]
  const arrows: Array<{
    from: { x: number; y: number }
    to: { x: number; y: number }
    key: string
    observed: boolean
  }> = []
  for (let i = 0; i < FLOW_LANES.length - 1; i++) {
    const fromLane = FLOW_LANES[i]
    const fromNodes = nodesByLane[fromLane] || []
    if (fromNodes.length === 0) continue
    // Find next non-empty lane.
    let j = i + 1
    while (j < FLOW_LANES.length && (nodesByLane[FLOW_LANES[j]] || []).length === 0) j++
    if (j >= FLOW_LANES.length) continue
    const toNodes = nodesByLane[FLOW_LANES[j]] || []
    for (const a of fromNodes) {
      for (const b of toNodes) {
        const pa = nodePositions.get(a.id)
        const pb = nodePositions.get(b.id)
        if (!pa || !pb) continue
        arrows.push({
          from: pa,
          to: pb,
          key: `${a.id}->${b.id}`,
          observed: a.evidence === "observed" && b.evidence === "observed",
        })
      }
    }
  }

  return (
    <svg
      width={size.w}
      height={size.h}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 5 }}
    >
      <defs>
        <marker
          id="exfil-arrow-observed"
          markerWidth="6"
          markerHeight="6"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="#f97316" />
        </marker>
        <marker
          id="exfil-arrow-capable"
          markerWidth="6"
          markerHeight="6"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="#fb923c" />
        </marker>
      </defs>
      {arrows.map((a) => (
        <line
          key={a.key}
          x1={a.from.x}
          y1={a.from.y}
          x2={a.to.x}
          y2={a.to.y}
          stroke={a.observed ? "#f97316" : "#fb923c"}
          strokeWidth={1.4}
          strokeDasharray={a.observed ? "none" : "4 3"}
          opacity={0.45}
          markerEnd={
            a.observed
              ? "url(#exfil-arrow-observed)"
              : "url(#exfil-arrow-capable)"
          }
        />
      ))}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Dynamic flow map — embeds TrafficFlowMap with an EXFIL-oriented
// architectureOverride. Mirrors attacker-view-v3.tsx's ChainFlowMapSection
// (the structural twin: header → 520px TrafficFlowMap container, scoped
// to the selected chain). buildExfilArchitecture builds the egress-
// oriented SystemArchitecture (jewel on left, exfil gates on right,
// observed flows animated red) — same builder the legacy ExfilViewPanel
// used; exported now for cross-component reuse.
// ---------------------------------------------------------------------------

function ChainFlowMapSection({
  payload,
  selectedPath,
  systemName,
}: {
  payload: ExfilPayload
  selectedPath: ExfilPath
  systemName: string
}) {
  const architecture = useMemo(
    () => buildExfilArchitecture(payload as any, selectedPath as any),
    [payload, selectedPath],
  )
  return (
    <div className="border-t border-slate-700/60 bg-slate-950/60">
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">
            Flow Map · This Chain's Egress
          </div>
          <div className="text-xs text-slate-300 mt-0.5">
            {payload.jewel.name}{" "}
            <span className="text-slate-500">→</span>{" "}
            {selectedPath.accessor_name}{" "}
            <span className="text-slate-500">→</span>{" "}
            {selectedPath.channel_label}{" "}
            <span className="text-slate-500">
              · {selectedPath.workload_count} workload
              {selectedPath.workload_count === 1 ? "" : "s"} ·{" "}
              {selectedPath.gateway_count} gateway
              {selectedPath.gateway_count === 1 ? "" : "s"} ·{" "}
              {selectedPath.jewel_hits.toLocaleString()} reads
            </span>
          </div>
        </div>
      </div>
      <div className="px-4 pb-4">
        <div
          className="relative rounded-xl border border-slate-800 bg-slate-950/80 overflow-hidden"
          style={{ height: "520px" }}
        >
          <TrafficFlowMap
            systemName={systemName}
            architectureOverride={architecture}
            observedMode={true}
            titleOverride=""
            innerTitleOverride={`Exfil path: ${selectedPath.channel_label}`}
            innerSubtitleOverride={`${selectedPath.accessor_name} → ${payload.jewel.name}`}
            pathBadgeOverride={`Exfil → ${payload.jewel.name}`}
            defaultShowVPCBoundaries={true}
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Business sentence + closure
// ---------------------------------------------------------------------------

function BusinessSentencePanel({
  projected,
}: {
  projected: ProjectedExfilChain
}) {
  const { path, payload } = projected
  const observed = path.accessor_provenance === "observed"
  const statusColor = observed ? "#ef4444" : "#f59e0b"
  const statusLabel = observed ? "Observed Reader" : "Capable Reader"
  const statusBg = observed
    ? "bg-red-500/15 border-red-500/50"
    : "bg-amber-500/15 border-amber-500/50"

  // Sentence is built from real payload fields — no fabricated copy.
  const accessor = payload.accessors.find((a) => a.id === path.accessor_id)
  const readsClause = accessor
    ? `${path.accessor_name} ${observed ? "reads" : "can read"} ${payload.jewel.name}${accessor.hit_count > 0 ? ` (${accessor.hit_count.toLocaleString()} reads observed)` : ""}`
    : `${path.accessor_name} reads ${payload.jewel.name}`
  const channelClause =
    {
      network_via_igw: `egresses through ${path.gateway_count} gateway${path.gateway_count === 1 ? "" : "s"} via IGW / NAT`,
      serverless_direct:
        "egresses via the AWS public service endpoint (no VPC, no SG)",
      ec2_no_egress:
        "is on an EC2 in a private subnet with no IGW / NAT — no observed exit route",
      direct_api: "calls the AWS API directly (no workload, no VPC)",
    }[path.channel] || `via channel ${path.channel_label}`
  const destClause = payload.observed_exfil.available
    ? "with EXFILTRATED_TO edges in graph"
    : "with no observed exfil edges yet (Phase D pending)"

  const sentence = `${readsClause}, ${channelClause}, ${destClause}.`

  return (
    <div className="px-4 py-3 border-t border-slate-700/60 bg-slate-900/60">
      <div className="flex items-start gap-3">
        <div
          className={`flex-shrink-0 px-2.5 py-1 rounded text-[10px] font-semibold border ${statusBg}`}
          style={{ color: statusColor }}
        >
          {statusLabel}
        </div>
        <div className="text-xs text-slate-200 leading-relaxed flex-1">
          {sentence}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Collector-backlog strip — honest "what's not wired yet"
// ---------------------------------------------------------------------------

function NotWiredStrip({ payload }: { payload: ExfilPayload }) {
  const items: { title: string; reason: string }[] = []
  if (payload.egress_lanes.identity?.not_wired) {
    items.push({
      title: "Identity egress",
      reason: payload.egress_lanes.identity.not_wired_reason,
    })
  }
  if (payload.egress_lanes.data_propagation?.not_wired) {
    items.push({
      title: "Data propagation",
      reason: payload.egress_lanes.data_propagation.not_wired_reason,
    })
  }
  if (!payload.observed_exfil.available) {
    items.push({
      title: "Observed exfil",
      reason: payload.observed_exfil.not_wired_reason,
    })
  }
  if (items.length === 0) return null
  return (
    <div className="px-4 py-3 border-t border-slate-700/60 bg-slate-950/60">
      <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
        Not yet collected — honest backlog
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <div
            key={it.title}
            className="flex-1 min-w-[260px] rounded border border-dashed border-amber-500/30 bg-amber-500/5 text-amber-200 p-2.5"
            title={it.reason}
          >
            <div className="text-[9px] font-bold uppercase tracking-wider mb-1 opacity-80">
              {it.title}
            </div>
            <div className="text-[10px] leading-snug opacity-80">
              {it.reason}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
