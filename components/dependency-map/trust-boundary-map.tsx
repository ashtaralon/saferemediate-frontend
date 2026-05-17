"use client"

// Trust Boundary Map — the CISO/investor demo visualization.
//
// Top-down render of one VPC as a "trust boundary":
//   - VPC = outer container (the trust zone)
//   - Subnets = nested zones (public on left, private on right)
//   - Workloads = colored chips by 4-bucket classification:
//       🟢 ISOLATED          (no internet capability)
//       🟡 AWS_REDIRECTABLE  (uses AWS via IGW — could use VPCE)
//       🟠 ACTIVE_INTERNET   (legit external use — narrow SG egress)
//       🔴 LATENT_EXPOSURE   (open but unused — close immediately)
//   - Egress Boundary = thick horizontal divider with the gates row
//     below it (IGW, NAT, VPCEs)
//   - Below the boundary = external destinations clustered by org +
//     AWS-backbone destinations clustered by service
//
// Stale-while-revalidate via useCachedFetch (lib/use-cached-fetch).
// Backend cold-call is 30-40s on alon-prod; localStorage SWR renders
// the previous map instantly on revisit so demo cold-starts don't
// kill the moment.
//
// Per feedback_no_mock_numbers_in_ui — three-state UI: loading-on-
// first-mount, live-with-real-data, or honest-error-with-retry. No
// fabricated numbers anywhere.

import React, { useMemo, useState } from "react"
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  Cloud,
  Globe,
  Lock,
  Network,
  Server,
  Shield,
  ShieldOff,
} from "lucide-react"
import { useCachedFetch } from "@/lib/use-cached-fetch"

// ---- Types (mirrors api/egress_posture.py response shape) ----------

export type WorkloadBucket =
  | "ISOLATED"
  | "AWS_REDIRECTABLE"
  | "ACTIVE_INTERNET"
  | "LATENT_EXPOSURE"

export interface PostureWorkload {
  workload: {
    id: string
    name: string
    node_type: string | null
    subnet_id: string | null
    subnet_name: string | null
    subnet_is_public: boolean | null
  }
  totals: {
    destinations: number
    aws_destinations: number
    external_destinations: number
    internal_destinations: number
    total_bytes: number
    total_hits: number
  }
  top_destinations: any[]
  attached_security_groups: Array<{
    id: string
    name: string
    has_public_egress: boolean
  }>
  route_table: { id: string; routes: any[] } | null
  bucket: WorkloadBucket
  has_internet_capability: boolean
  has_public_sg_egress: boolean
  has_igw_route: boolean
  recommendation: PostureRecommendation | null
}

export interface PostureRecommendation {
  type:
    | "REMOVE_SG_PUBLIC_EGRESS"
    | "ADD_VPC_ENDPOINT"
    | "NARROW_SG_EGRESS_TO_OBSERVED"
  confidence_signal: string
  scope_workload_count: number
  candidate_sg_id?: string | null
  candidate_sg_name?: string | null
  candidate_aws_service?: string
  candidate_aws_services?: string[]
  candidate_is_gateway_vpce?: boolean
  candidate_destination_count?: number
  action_description: string
}

export interface PostureSubnet {
  id: string
  name: string
  is_public: boolean | null
  route_table_id: string | null
  workload_count: number
  bucket_counts: Record<WorkloadBucket, number>
}

export interface PostureGate {
  id: string
  name: string
  kind: "InternetGateway" | "NATGateway" | "VPCEndpoint"
  state?: string | null
  endpoint_type?: string | null
  service_name?: string | null
  policy_is_open?: boolean
}

export interface PostureSummary {
  total_workloads: number
  isolated: number
  aws_redirectable: number
  active_internet: number
  latent_exposure: number
  exfil_surface_count: number
  closable_today_count: number
  redirectable_to_vpce_count: number
  review_needed_count: number
}

export interface PostureResponse {
  system_name: string
  lookback_days: number
  vpc: {
    id: string
    cidr: string | null
    region: string | null
    name: string
  } | null
  summary: PostureSummary
  subnets: PostureSubnet[]
  workloads: PostureWorkload[]
  gates: PostureGate[]
  destinations: {
    external_clusters: Array<{
      org: string
      destination_count: number
      total_bytes: number
      total_hits: number
      signals: string[]
    }>
    aws_backbone: Array<{
      service: string
      destination_count: number
      total_bytes: number
      via_igw_count: number
      via_vpce_count: number
      redirectable: boolean
      is_gateway_eligible: boolean
    }>
  }
}

// ---- Bucket visual mapping ----------------------------------------

const BUCKET_META: Record<
  WorkloadBucket,
  { label: string; emoji: string; hex: string; ring: string; bg: string; text: string }
> = {
  ISOLATED: {
    label: "Isolated",
    emoji: "🟢",
    hex: "#10b981",
    ring: "ring-emerald-500/40",
    bg: "bg-emerald-500/10 border-emerald-500/40",
    text: "text-emerald-300",
  },
  AWS_REDIRECTABLE: {
    label: "AWS-Redirectable",
    emoji: "🟡",
    hex: "#eab308",
    ring: "ring-amber-500/40",
    bg: "bg-amber-500/10 border-amber-500/40",
    text: "text-amber-300",
  },
  ACTIVE_INTERNET: {
    label: "Active Internet",
    emoji: "🟠",
    hex: "#f97316",
    ring: "ring-orange-500/40",
    bg: "bg-orange-500/10 border-orange-500/40",
    text: "text-orange-300",
  },
  LATENT_EXPOSURE: {
    label: "Latent Exposure",
    emoji: "🔴",
    hex: "#dc2626",
    ring: "ring-red-500/50",
    bg: "bg-red-500/10 border-red-500/50",
    text: "text-red-300",
  },
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}

// ---- Sub-components -----------------------------------------------

function SummaryHeader({ summary, vpcLabel }: { summary: PostureSummary; vpcLabel: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">
            Trust Boundary
          </div>
          <div className="text-lg font-semibold text-slate-100">{vpcLabel}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            Total workloads
          </div>
          <div className="text-2xl font-bold text-slate-100">{summary.total_workloads}</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {(["ISOLATED", "AWS_REDIRECTABLE", "ACTIVE_INTERNET", "LATENT_EXPOSURE"] as WorkloadBucket[]).map(
          (b) => {
            const meta = BUCKET_META[b]
            const count = summary[
              b === "ISOLATED"
                ? "isolated"
                : b === "AWS_REDIRECTABLE"
                  ? "aws_redirectable"
                  : b === "ACTIVE_INTERNET"
                    ? "active_internet"
                    : "latent_exposure"
            ]
            return (
              <div
                key={b}
                className={`rounded-lg border ${meta.bg} px-3 py-2`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-sm">{meta.emoji}</span>
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${meta.text}`}>
                    {meta.label}
                  </span>
                </div>
                <div className="text-2xl font-bold text-slate-50">{count}</div>
              </div>
            )
          },
        )}
      </div>

      {summary.closable_today_count > 0 && (
        <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-300" />
          <span className="text-[11px] font-semibold text-red-100">
            {summary.closable_today_count} workload{summary.closable_today_count === 1 ? "" : "s"} with
            zero observed internet egress — closable today
          </span>
          <span className="ml-auto text-[10px] text-red-200/70">
            Exfil surface: {summary.exfil_surface_count} · Review: {summary.review_needed_count}
          </span>
        </div>
      )}
    </div>
  )
}

function WorkloadChip({
  workload,
  onClick,
  selected,
}: {
  workload: PostureWorkload
  onClick: () => void
  selected: boolean
}) {
  const meta = BUCKET_META[workload.bucket]
  const name = workload.workload.name || workload.workload.id
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded border ${meta.bg} px-2 py-1.5 transition-all hover:scale-105 ${
        selected ? `ring-2 ${meta.ring}` : ""
      }`}
      title={`${meta.label} · ${name}`}
    >
      <div className="flex items-center gap-1">
        <span className="text-[10px]">{meta.emoji}</span>
        <span className="text-[10px] font-mono text-slate-100 truncate" style={{ maxWidth: 90 }}>
          {name}
        </span>
      </div>
    </button>
  )
}

function SubnetZone({
  subnet,
  workloads,
  onSelectWorkload,
  selectedWorkloadId,
}: {
  subnet: PostureSubnet
  workloads: PostureWorkload[]
  onSelectWorkload: (w: PostureWorkload) => void
  selectedWorkloadId: string | null
}) {
  const isPublic = subnet.is_public === true
  const zoneTone = isPublic
    ? "border-amber-500/30 bg-amber-500/[0.04]"
    : "border-emerald-500/30 bg-emerald-500/[0.04]"
  return (
    <div className={`rounded-lg border ${zoneTone} p-2.5`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          {isPublic ? (
            <Globe className="w-3 h-3 text-amber-400" />
          ) : (
            <Lock className="w-3 h-3 text-emerald-400" />
          )}
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-200">
            {isPublic ? "Public" : "Private"} · {subnet.name}
          </span>
        </div>
        <span className="text-[10px] text-slate-400 font-mono">{subnet.workload_count}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {workloads.map((w) => (
          <WorkloadChip
            key={w.workload.id}
            workload={w}
            onClick={() => onSelectWorkload(w)}
            selected={selectedWorkloadId === w.workload.id}
          />
        ))}
        {workloads.length === 0 && (
          <span className="text-[10px] italic text-slate-500">No workloads</span>
        )}
      </div>
    </div>
  )
}

function VPCContainer({
  vpcLabel,
  subnets,
  workloads,
  onSelectWorkload,
  selectedWorkloadId,
}: {
  vpcLabel: string
  subnets: PostureSubnet[]
  workloads: PostureWorkload[]
  onSelectWorkload: (w: PostureWorkload) => void
  selectedWorkloadId: string | null
}) {
  const publicSubnets = subnets.filter((s) => s.is_public === true)
  const privateSubnets = subnets.filter((s) => s.is_public !== true)
  const workloadsBySubnet = useMemo(() => {
    const map = new Map<string, PostureWorkload[]>()
    for (const w of workloads) {
      const sid = w.workload.subnet_id || "__none__"
      if (!map.has(sid)) map.set(sid, [])
      map.get(sid)!.push(w)
    }
    return map
  }, [workloads])

  return (
    <div className="relative rounded-xl border-2 border-slate-600 bg-slate-900/40 p-3">
      {/* VPC label */}
      <div className="absolute -top-3 left-4 bg-slate-950 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1">
        <Network className="w-3 h-3" />
        VPC · {vpcLabel}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2">
        {/* Public subnets column */}
        <div>
          <div className="text-[9px] uppercase tracking-wider text-amber-400 font-semibold mb-1.5 flex items-center gap-1">
            <Globe className="w-2.5 h-2.5" />
            Public Subnets ({publicSubnets.length})
          </div>
          <div className="flex flex-col gap-2">
            {publicSubnets.map((s) => (
              <SubnetZone
                key={s.id}
                subnet={s}
                workloads={workloadsBySubnet.get(s.id) || []}
                onSelectWorkload={onSelectWorkload}
                selectedWorkloadId={selectedWorkloadId}
              />
            ))}
            {publicSubnets.length === 0 && (
              <div className="text-[10px] italic text-slate-500 py-2">
                No public subnets
              </div>
            )}
          </div>
        </div>

        {/* Private subnets column */}
        <div>
          <div className="text-[9px] uppercase tracking-wider text-emerald-400 font-semibold mb-1.5 flex items-center gap-1">
            <Lock className="w-2.5 h-2.5" />
            Private Subnets ({privateSubnets.length})
          </div>
          <div className="flex flex-col gap-2">
            {privateSubnets.map((s) => (
              <SubnetZone
                key={s.id}
                subnet={s}
                workloads={workloadsBySubnet.get(s.id) || []}
                onSelectWorkload={onSelectWorkload}
                selectedWorkloadId={selectedWorkloadId}
              />
            ))}
            {privateSubnets.length === 0 && (
              <div className="text-[10px] italic text-slate-500 py-2">
                No private subnets
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function GateCard({ gate }: { gate: PostureGate }) {
  const isInternetEgress = gate.kind === "InternetGateway" || gate.kind === "NATGateway"
  const isVpce = gate.kind === "VPCEndpoint"
  const tone = isInternetEgress
    ? "border-amber-500/40 bg-amber-500/10"
    : "border-emerald-500/40 bg-emerald-500/10"
  const icon = isInternetEgress ? (
    <Globe className="w-4 h-4 text-amber-400" />
  ) : (
    <Lock className="w-4 h-4 text-emerald-400" />
  )
  return (
    <div className={`rounded-lg border ${tone} px-3 py-2 min-w-[140px]`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-100">
          {gate.kind === "InternetGateway"
            ? "IGW"
            : gate.kind === "NATGateway"
              ? "NAT"
              : "VPCE"}
        </span>
      </div>
      <div className="text-[10px] font-mono text-slate-300 truncate" title={gate.name}>
        {gate.name}
      </div>
      {isVpce && gate.service_name && (
        <div className="text-[9px] text-slate-400 mt-0.5 truncate">
          {gate.service_name.split(".").pop()}
        </div>
      )}
      {isVpce && gate.policy_is_open && (
        <div className="mt-1 inline-flex items-center gap-1 rounded border border-red-500/50 bg-red-500/15 px-1 py-0.5">
          <AlertTriangle className="w-2.5 h-2.5 text-red-300" />
          <span className="text-[9px] font-semibold uppercase tracking-wider text-red-200">
            Open Policy
          </span>
        </div>
      )}
      {isInternetEgress && (
        <div className="mt-1 inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900/50 px-1 py-0.5">
          <ShieldOff className="w-2.5 h-2.5 text-slate-500" />
          <span className="text-[9px] uppercase tracking-wider text-slate-400">
            No L7 Filter
          </span>
        </div>
      )}
    </div>
  )
}

function EgressBoundary({ gates }: { gates: PostureGate[] }) {
  return (
    <div className="relative my-4">
      {/* The wall — thick gradient bar */}
      <div className="relative h-1 rounded-full bg-gradient-to-r from-indigo-500/60 via-violet-500/60 to-indigo-500/60 mb-3">
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 bg-slate-950 text-[10px] font-semibold uppercase tracking-wider text-violet-300 flex items-center gap-1">
          <Shield className="w-3 h-3" />
          ✦ Egress Boundary · {gates.length} gates ✦
        </div>
      </div>

      {/* Gates row */}
      <div className="flex flex-wrap gap-2 justify-center">
        {gates.length === 0 ? (
          <div className="text-[10px] italic text-slate-500">No gates resolved</div>
        ) : (
          gates.map((g) => <GateCard key={g.id} gate={g} />)
        )}
      </div>
    </div>
  )
}

function ExternalClusterCard({
  cluster,
}: {
  cluster: PostureResponse["destinations"]["external_clusters"][number]
}) {
  const hasAlert = cluster.signals.some((s) =>
    ["plaintext", "residential_isp", "rare_asn"].includes(s),
  )
  return (
    <div
      className={`rounded-lg border px-2.5 py-1.5 ${
        hasAlert
          ? "border-rose-500/40 bg-rose-500/5"
          : "border-slate-700 bg-slate-900/40"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Cloud className="w-3 h-3 text-slate-400 shrink-0" />
          <span className="text-[11px] font-semibold text-slate-100 truncate">
            {cluster.org}
          </span>
        </div>
        <span className="text-[9px] font-mono text-cyan-400 shrink-0">
          {formatBytes(cluster.total_bytes)}
        </span>
      </div>
      <div className="mt-0.5 text-[9px] text-slate-500">
        {cluster.destination_count} dest · {cluster.total_hits} hits
      </div>
      {hasAlert && (
        <div className="mt-0.5 text-[9px] text-rose-300 uppercase font-semibold">
          ⚠ {cluster.signals.filter((s) => ["plaintext", "residential_isp", "rare_asn"].includes(s)).join(" · ")}
        </div>
      )}
    </div>
  )
}

function AWSClusterCard({
  cluster,
}: {
  cluster: PostureResponse["destinations"]["aws_backbone"][number]
}) {
  const tone = cluster.redirectable
    ? "border-amber-500/40 bg-amber-500/5"
    : "border-emerald-500/40 bg-emerald-500/5"
  return (
    <div className={`rounded-lg border ${tone} px-2.5 py-1.5`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Server className="w-3 h-3 text-emerald-400 shrink-0" />
          <span className="text-[11px] font-semibold text-emerald-50 truncate">
            {cluster.service}
          </span>
        </div>
        <span className="text-[9px] font-mono text-cyan-400 shrink-0">
          {formatBytes(cluster.total_bytes)}
        </span>
      </div>
      <div className="mt-0.5 text-[9px] text-slate-500">
        {cluster.destination_count} dest · IGW {cluster.via_igw_count} · VPCE {cluster.via_vpce_count}
      </div>
      {cluster.redirectable && (
        <div className="mt-1 inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/15 px-1 py-0.5">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-200">
            Add VPCE{cluster.is_gateway_eligible ? " · free" : ""}
          </span>
        </div>
      )}
    </div>
  )
}

function DestinationsArea({
  destinations,
}: {
  destinations: PostureResponse["destinations"]
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2 flex items-center gap-1.5">
          <Globe className="w-3 h-3 text-cyan-400" />
          External Destinations · {destinations.external_clusters.length} orgs
        </div>
        <div className="flex flex-col gap-1.5">
          {destinations.external_clusters.slice(0, 12).map((c) => (
            <ExternalClusterCard key={c.org} cluster={c} />
          ))}
          {destinations.external_clusters.length === 0 && (
            <div className="text-[10px] italic text-slate-500">
              No external destinations observed
            </div>
          )}
          {destinations.external_clusters.length > 12 && (
            <div className="text-[10px] text-slate-500 italic pl-1">
              + {destinations.external_clusters.length - 12} more
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2 flex items-center gap-1.5">
          <Cloud className="w-3 h-3 text-emerald-400" />
          AWS Backbone · {destinations.aws_backbone.length} services
        </div>
        <div className="flex flex-col gap-1.5">
          {destinations.aws_backbone.slice(0, 12).map((c) => (
            <AWSClusterCard key={c.service} cluster={c} />
          ))}
          {destinations.aws_backbone.length === 0 && (
            <div className="text-[10px] italic text-slate-500">
              No AWS-service destinations observed
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Main component -----------------------------------------------

interface TrustBoundaryMapProps {
  systemName: string
  onSelectWorkload?: (workload: PostureWorkload) => void
  selectedWorkloadId?: string | null
}

export function TrustBoundaryMap({
  systemName,
  onSelectWorkload,
  selectedWorkloadId: externalSelectedId = null,
}: TrustBoundaryMapProps) {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null)
  const selectedWorkloadId = externalSelectedId ?? internalSelectedId

  const url = systemName ? `/api/proxy/egress/posture/${encodeURIComponent(systemName)}` : null
  const { data, loading, error, retry } = useCachedFetch<PostureResponse>(url, {
    cacheKey: `tbm:${systemName}`,
  })

  const handleSelectWorkload = (w: PostureWorkload) => {
    setInternalSelectedId(w.workload.id)
    onSelectWorkload?.(w)
  }

  // Loading: only when we have NO cache at all (first-ever visit).
  if (loading && !data) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-12 flex flex-col items-center gap-3 min-h-[500px] justify-center">
        <Activity className="w-8 h-8 animate-pulse text-violet-400" />
        <div className="text-sm font-semibold text-slate-200">
          Loading Trust Boundary Map…
        </div>
        <div className="text-xs text-slate-500">
          First-time analysis takes 30-40 seconds. Subsequent loads are instant.
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-8 text-center">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-400" />
        <div className="text-sm font-semibold text-red-100 mb-1">
          Failed to load Trust Boundary Map
        </div>
        <div className="text-xs text-red-300/80 mb-3">{error}</div>
        <button
          onClick={retry}
          className="px-3 py-1.5 rounded text-xs font-semibold bg-red-500/20 hover:bg-red-500/30 text-red-100 border border-red-500/50"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data) {
    return null
  }

  const vpcLabel = data.vpc?.name || data.system_name
  const vpcSubtitle = data.vpc?.cidr || ""

  return (
    <div className="space-y-3">
      <SummaryHeader summary={data.summary} vpcLabel={`${vpcLabel}${vpcSubtitle ? ` · ${vpcSubtitle}` : ""}`} />
      <VPCContainer
        vpcLabel={`${vpcLabel}${vpcSubtitle ? ` · ${vpcSubtitle}` : ""}`}
        subnets={data.subnets}
        workloads={data.workloads}
        onSelectWorkload={handleSelectWorkload}
        selectedWorkloadId={selectedWorkloadId}
      />
      <EgressBoundary gates={data.gates} />
      <DestinationsArea destinations={data.destinations} />
    </div>
  )
}

export default TrustBoundaryMap
