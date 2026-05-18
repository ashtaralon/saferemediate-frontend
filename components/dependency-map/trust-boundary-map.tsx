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
import { CrownJewelExfilPaths } from "./crown-jewel-exfil-paths"
import { TopExposureHero } from "./top-exposure-hero"

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

// Light-theme palette — page background is white, so map uses white
// cards with colored tints + dark text for proper contrast. Dark-theme
// palette was unreadable on the light system page (screenshot 2026-05-17).
const BUCKET_META: Record<
  WorkloadBucket,
  { label: string; emoji: string; hex: string; ring: string; bg: string; text: string }
> = {
  ISOLATED: {
    label: "Isolated",
    emoji: "🟢",
    hex: "#10b981",
    ring: "ring-emerald-500",
    bg: "bg-emerald-50 border-emerald-300",
    text: "text-emerald-800",
  },
  AWS_REDIRECTABLE: {
    label: "AWS-Redirectable",
    emoji: "🟡",
    hex: "#eab308",
    ring: "ring-amber-500",
    bg: "bg-amber-50 border-amber-300",
    text: "text-amber-800",
  },
  ACTIVE_INTERNET: {
    label: "Active Internet",
    emoji: "🟠",
    hex: "#f97316",
    ring: "ring-orange-500",
    bg: "bg-orange-50 border-orange-300",
    text: "text-orange-800",
  },
  LATENT_EXPOSURE: {
    label: "Latent Exposure",
    emoji: "🔴",
    hex: "#dc2626",
    ring: "ring-red-500",
    bg: "bg-red-50 border-red-400",
    text: "text-red-800",
  },
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}

// ---- Sub-components -----------------------------------------------

// ProjectedAfterCard — ACT 4 of the CISO demo. Shows the projected
// state of the system AFTER applying all recommendations. Renders
// below SummaryHeader so the operator sees current-state alongside
// projected-state side-by-side.
//
// Projection model (honest, no fabrication):
//   - LATENT_EXPOSURE → ISOLATED (after REMOVE_SG_PUBLIC_EGRESS,
//     workload has no internet capability remaining)
//   - AWS_REDIRECTABLE → ISOLATED-effective (after ADD_VPC_ENDPOINT,
//     all observed AWS traffic moves to backbone; workload retains
//     IGW capability but practically has zero internet usage)
//   - ACTIVE_INTERNET → SCOPED (after NARROW_SG_EGRESS_TO_OBSERVED,
//     workload still reaches internet but only to observed dests)
//   - ISOLATED → stays ISOLATED
//
// Cost projection: NAT GW data processing approximate $0.045/GB
// (varies by region). We only show the projection when movable
// bytes > 0 — never fabricate a "$X savings" if no bytes data.
function ProjectedAfterCard({
  summary,
  destinations,
  workloads,
  lookbackDays,
}: {
  summary: PostureSummary
  destinations: PostureResponse["destinations"]
  workloads: PostureWorkload[]
  lookbackDays: number
}) {
  // Projected bucket counts.
  const projectedIsolated = summary.isolated + summary.latent_exposure + summary.aws_redirectable
  const projectedScoped = summary.active_internet
  const projectedLatent = 0
  const projectedRedirectable = 0
  const projectedActive = 0

  // Exfil surface after — only ACTIVE workloads still have internet need.
  const exfilBefore = summary.exfil_surface_count
  const exfilAfter = projectedScoped
  const exfilReductionPct = exfilBefore > 0
    ? Math.round(((exfilBefore - exfilAfter) / exfilBefore) * 100)
    : 0

  // Recommendation breakdown.
  const recCounts = workloads.reduce<Record<string, number>>((acc, w) => {
    if (w.recommendation?.type) {
      acc[w.recommendation.type] = (acc[w.recommendation.type] || 0) + 1
    }
    return acc
  }, {})
  const totalRecs = Object.values(recCounts).reduce((a, b) => a + b, 0)

  // NAT savings projection — only for AWS clusters marked redirectable.
  // Scale observed bytes to monthly rate using lookbackDays.
  const movableBytes = destinations.aws_backbone
    .filter((c) => c.redirectable)
    .reduce((acc, c) => acc + (c.total_bytes || 0), 0)
  const movableGB = movableBytes / (1024 ** 3)
  const monthlyMovableGB = lookbackDays > 0 ? movableGB * (30 / lookbackDays) : 0
  // $0.045/GB NAT processing fee (eu-west-1 baseline; varies per region)
  const monthlyNatSavingsUSD = monthlyMovableGB * 0.045

  if (totalRecs === 0) {
    return null
  }

  return (
    <div className="rounded-xl border-2 border-violet-300 bg-gradient-to-br from-violet-50 to-white shadow-sm p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">✨</span>
        <div className="text-[11px] font-bold uppercase tracking-wider text-violet-800">
          After applying all {totalRecs} closures · projected
        </div>
        <span className="ml-auto text-[10px] text-violet-700 italic">
          Honest projection from observed traffic — no AWS mutation occurs
        </span>
      </div>

      {/* Bucket diff — current → projected with arrows */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        <DiffBucket
          label="Isolated"
          emoji="🟢"
          before={summary.isolated}
          after={projectedIsolated}
          tone="border-emerald-300 bg-emerald-50 text-emerald-800"
        />
        <DiffBucket
          label="Redirectable"
          emoji="🟡"
          before={summary.aws_redirectable}
          after={projectedRedirectable}
          tone="border-amber-300 bg-amber-50 text-amber-800"
        />
        <DiffBucket
          label="Active (scoped)"
          emoji="🟠"
          before={summary.active_internet}
          after={projectedScoped}
          tone="border-orange-300 bg-orange-50 text-orange-800"
          afterLabel="scoped"
        />
        <DiffBucket
          label="Latent"
          emoji="🔴"
          before={summary.latent_exposure}
          after={projectedLatent}
          tone="border-red-400 bg-red-50 text-red-800"
        />
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard
          label="Exfil surface"
          value={`-${exfilReductionPct}%`}
          subtitle={`${exfilBefore} → ${exfilAfter} workloads`}
          tone="emerald"
        />
        <MetricCard
          label="Effort"
          value={`${totalRecs}`}
          subtitle={[
            recCounts["REMOVE_SG_PUBLIC_EGRESS"]
              ? `${recCounts["REMOVE_SG_PUBLIC_EGRESS"]}× REMOVE`
              : null,
            recCounts["ADD_VPC_ENDPOINT"]
              ? `${recCounts["ADD_VPC_ENDPOINT"]}× VPCE`
              : null,
            recCounts["NARROW_SG_EGRESS_TO_OBSERVED"]
              ? `${recCounts["NARROW_SG_EGRESS_TO_OBSERVED"]}× NARROW`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          tone="violet"
        />
        <MetricCard
          label={monthlyMovableGB > 0 ? "Est. NAT savings" : "NAT savings"}
          value={
            monthlyMovableGB > 0
              ? `$${monthlyNatSavingsUSD.toFixed(monthlyNatSavingsUSD < 10 ? 2 : 0)}/mo`
              : "—"
          }
          subtitle={
            monthlyMovableGB > 0
              ? `${monthlyMovableGB.toFixed(monthlyMovableGB < 1 ? 3 : 1)} GB/mo movable to backbone`
              : "no AWS-via-IGW traffic to redirect"
          }
          tone="cyan"
        />
      </div>
    </div>
  )
}

function DiffBucket({
  label,
  emoji,
  before,
  after,
  tone,
  afterLabel,
}: {
  label: string
  emoji: string
  before: number
  after: number
  tone: string
  afterLabel?: string
}) {
  const delta = after - before
  const deltaDisplay = delta === 0 ? "—" : delta > 0 ? `+${delta}` : `${delta}`
  const deltaTone = delta < 0
    ? "text-red-700"
    : delta > 0
      ? "text-emerald-700"
      : "text-slate-500"
  return (
    <div className={`rounded border ${tone} px-2 py-1.5`}>
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-[10px]">{emoji}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider truncate">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-base font-bold text-slate-500 line-through">{before}</span>
        <span className="text-slate-400 text-xs">→</span>
        <span className="text-xl font-bold text-slate-900">{after}</span>
        {afterLabel && (
          <span className="text-[9px] text-slate-500 italic">{afterLabel}</span>
        )}
      </div>
      <div className={`text-[10px] font-bold ${deltaTone}`}>{deltaDisplay}</div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  subtitle,
  tone,
}: {
  label: string
  value: string
  subtitle: string
  tone: "emerald" | "violet" | "cyan"
}) {
  const toneClasses = {
    emerald: "border-emerald-300 bg-emerald-50 text-emerald-900",
    violet: "border-violet-300 bg-violet-50 text-violet-900",
    cyan: "border-cyan-300 bg-cyan-50 text-cyan-900",
  }[tone]
  return (
    <div className={`rounded border ${toneClasses} px-3 py-2`}>
      <div className="text-[9px] font-bold uppercase tracking-wider opacity-75">
        {label}
      </div>
      <div className="text-xl font-bold mt-0.5">{value}</div>
      <div className="text-[10px] mt-0.5 opacity-80">{subtitle}</div>
    </div>
  )
}

function SummaryHeader({ summary, vpcLabel }: { summary: PostureSummary; vpcLabel: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">
            Trust Boundary
          </div>
          <div className="text-lg font-semibold text-slate-900">{vpcLabel}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            Total workloads
          </div>
          <div className="text-2xl font-bold text-slate-900">{summary.total_workloads}</div>
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
            // Per-bucket tooltip — explains the meaning + the operator
            // action implied by membership in this bucket. Hover-only so
            // the dense metric grid stays scannable.
            const tooltip: Record<WorkloadBucket, string> = {
              ISOLATED:
                "Workloads that CANNOT reach the internet. No SG public-egress rule OR no subnet route to IGW/NAT/EIGW. No action needed.",
              AWS_REDIRECTABLE:
                "Workloads that egress ONLY to AWS services (S3, DynamoDB) but route through the public IGW instead of a VPC Endpoint. ADD VPCE to keep traffic on the AWS backbone (free for Gateway VPCEs).",
              ACTIVE_INTERNET:
                "Workloads with observed outbound traffic to external (non-AWS) destinations. Closures here are NARROW (constrain egress to observed endpoints) — they're using the internet capability, so removal would break them.",
              LATENT_EXPOSURE:
                "Workloads that CAN egress to the internet (SG allows 0.0.0.0/0 + subnet routes to IGW/NAT/EIGW) but made ZERO observed requests in the 30-day window. Closable TODAY — remove the public-egress rule, the workload's silence is the safety basis.",
            }
            return (
              <div
                key={b}
                className={`rounded-lg border ${meta.bg} px-3 py-2`}
                title={tooltip[b]}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-sm">{meta.emoji}</span>
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${meta.text}`}>
                    {meta.label}
                  </span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{count}</div>
              </div>
            )
          },
        )}
      </div>

      {summary.closable_today_count > 0 && (
        <div
          className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 flex items-center gap-2"
          title="Closable today = LATENT_EXPOSURE workloads with a REMOVE_SG_PUBLIC_EGRESS recommendation. Exfil surface = active internet egress + latent capability count. Review = scoped narrows still need operator sign-off."
        >
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <span className="text-[11px] font-semibold text-red-900">
            {summary.closable_today_count} workload{summary.closable_today_count === 1 ? "" : "s"} with
            zero observed internet egress — closable today
          </span>
          <span
            className="ml-auto text-[10px] text-red-700"
            title="Exfil surface = workloads that could send data out (active + latent). Review = workloads with narrowable rules needing manual sign-off."
          >
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
      className={`text-left rounded border ${meta.bg} px-2 py-1.5 transition-all hover:scale-105 hover:shadow-md ${
        selected ? `ring-2 ${meta.ring}` : ""
      }`}
      title={`${meta.label} · ${name}`}
    >
      <div className="flex items-center gap-1">
        <span className="text-[10px]">{meta.emoji}</span>
        <span className={`text-[11px] font-medium ${meta.text} truncate`} style={{ maxWidth: 130 }}>
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
    ? "border-amber-300 bg-amber-50"
    : "border-emerald-300 bg-emerald-50"
  return (
    <div className={`rounded-lg border-2 ${zoneTone} p-2.5`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          {isPublic ? (
            <Globe className="w-3 h-3 text-amber-700" />
          ) : (
            <Lock className="w-3 h-3 text-emerald-700" />
          )}
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${isPublic ? "text-amber-900" : "text-emerald-900"}`}>
            {isPublic ? "Public" : "Private"} · {subnet.name}
          </span>
        </div>
        <span className="text-[10px] text-slate-600 font-mono font-semibold">{subnet.workload_count}</span>
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
    <div className="relative rounded-xl border-2 border-slate-300 bg-slate-50 shadow-sm p-3">
      {/* VPC label — sits on the border edge for the "container" effect */}
      <div className="absolute -top-3 left-4 bg-white border border-slate-300 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1">
        <Network className="w-3 h-3" />
        VPC · {vpcLabel}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2">
        {/* Public subnets column */}
        <div>
          <div className="text-[9px] uppercase tracking-wider text-amber-700 font-bold mb-1.5 flex items-center gap-1">
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
          <div className="text-[9px] uppercase tracking-wider text-emerald-700 font-bold mb-1.5 flex items-center gap-1">
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
    ? "border-amber-300 bg-amber-50"
    : "border-emerald-300 bg-emerald-50"
  const icon = isInternetEgress ? (
    <Globe className="w-4 h-4 text-amber-700" />
  ) : (
    <Lock className="w-4 h-4 text-emerald-700" />
  )
  return (
    <div className={`rounded-lg border-2 ${tone} px-3 py-2 min-w-[160px] shadow-sm`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className={`text-[10px] font-bold uppercase tracking-wider ${isInternetEgress ? "text-amber-900" : "text-emerald-900"}`}>
          {gate.kind === "InternetGateway"
            ? "IGW"
            : gate.kind === "NATGateway"
              ? "NAT"
              : "VPCE"}
        </span>
      </div>
      <div className="text-[10px] font-mono text-slate-700 truncate" title={gate.name}>
        {gate.name}
      </div>
      {isVpce && gate.service_name && (
        <div className="text-[9px] text-slate-500 mt-0.5 truncate font-semibold">
          {gate.service_name.split(".").pop()}
        </div>
      )}
      {isVpce && gate.policy_is_open && (
        <div className="mt-1 inline-flex items-center gap-1 rounded border border-red-400 bg-red-100 px-1.5 py-0.5">
          <AlertTriangle className="w-2.5 h-2.5 text-red-700" />
          <span className="text-[9px] font-bold uppercase tracking-wider text-red-800">
            Open Policy
          </span>
        </div>
      )}
      {isInternetEgress && (
        <div className="mt-1 inline-flex items-center gap-1 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5">
          <ShieldOff className="w-2.5 h-2.5 text-slate-500" />
          <span className="text-[9px] uppercase tracking-wider text-slate-600 font-semibold">
            No L7 Filter
          </span>
        </div>
      )}
    </div>
  )
}

function EgressBoundary({ gates }: { gates: PostureGate[] }) {
  return (
    <div className="relative my-5">
      {/* The wall — thick gradient bar */}
      <div className="relative h-1.5 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500 mb-4">
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 bg-white border border-violet-300 rounded text-[10px] font-bold uppercase tracking-wider text-violet-700 flex items-center gap-1 shadow-sm">
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
          ? "border-rose-300 bg-rose-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Cloud className="w-3 h-3 text-slate-500 shrink-0" />
          <span className="text-[11px] font-semibold text-slate-900 truncate">
            {cluster.org}
          </span>
        </div>
        <span className="text-[9px] font-mono text-cyan-700 shrink-0 font-semibold">
          {formatBytes(cluster.total_bytes)}
        </span>
      </div>
      <div className="mt-0.5 text-[9px] text-slate-600">
        {cluster.destination_count} dest · {cluster.total_hits} hits
      </div>
      {hasAlert && (
        <div className="mt-0.5 text-[9px] text-rose-700 uppercase font-bold">
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
    ? "border-amber-300 bg-amber-50"
    : "border-emerald-300 bg-emerald-50"
  return (
    <div className={`rounded-lg border ${tone} px-2.5 py-1.5`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Server className={`w-3 h-3 ${cluster.redirectable ? "text-amber-700" : "text-emerald-700"} shrink-0`} />
          <span className={`text-[11px] font-semibold truncate ${cluster.redirectable ? "text-amber-900" : "text-emerald-900"}`}>
            {cluster.service}
          </span>
        </div>
        <span className="text-[9px] font-mono text-cyan-700 shrink-0 font-semibold">
          {formatBytes(cluster.total_bytes)}
        </span>
      </div>
      <div className="mt-0.5 text-[9px] text-slate-600">
        {cluster.destination_count} dest · IGW {cluster.via_igw_count} · VPCE {cluster.via_vpce_count}
      </div>
      {cluster.redirectable && (
        <div className="mt-1 inline-flex items-center gap-1 rounded border border-amber-400 bg-amber-100 px-1.5 py-0.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-amber-800">
            Add VPCE{cluster.is_gateway_eligible ? " · free" : ""}
          </span>
        </div>
      )}
    </div>
  )
}

// Orgs / IPs whose traffic is overwhelmingly low-signal infrastructure
// noise (NTP pools, AWS metadata, reverse-DNS providers). Filtered by
// default so the operator sees BUSINESS-relevant destinations first
// without scrolling past 50+ NTP entries.
const NOISE_ORG_KEYWORDS = [
  "ntp", // *.ntp.org pool participants
  "amazon technologies inc.", // EC2/metadata neighbour orgs
]
const NOISE_ORG_REGEX = /\b(ntp|pool\.ntp|time\.)\b/i

function isNoiseOrg(org: string | null | undefined): boolean {
  if (!org) return false
  const lower = org.toLowerCase()
  if (NOISE_ORG_KEYWORDS.some((k) => lower.includes(k))) return true
  if (NOISE_ORG_REGEX.test(org)) return true
  return false
}

function DestinationsArea({
  destinations,
}: {
  destinations: PostureResponse["destinations"]
}) {
  // Filter toggle — default ON (hide noise) so the destination list
  // surfaces real business-tier traffic first. NTP probes (HEANET,
  // YAHOO-IRD, etc.) overwhelm the volume metric otherwise — those orgs
  // got "53k hits" because every workload pings them every minute, not
  // because there's a real exfil signal.
  const [hideNoise, setHideNoise] = useState(true)
  const filtered = hideNoise
    ? destinations.external_clusters.filter((c) => !isNoiseOrg(c.org))
    : destinations.external_clusters
  const hiddenCount = destinations.external_clusters.length - filtered.length
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-600 font-bold mb-2 flex items-center gap-1.5">
          <Globe className="w-3 h-3 text-cyan-700" />
          External Destinations · {filtered.length} org{filtered.length === 1 ? "" : "s"}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setHideNoise((v) => !v)}
              className="ml-auto text-[9px] normal-case font-normal tracking-normal text-slate-500 hover:text-slate-800 underline"
              title="NTP pool / reverse-DNS / metadata orgs are demo-grade noise — they hit 50k+ times but carry no business signal. Toggle to show them anyway."
            >
              {hideNoise ? `+ ${hiddenCount} noise hidden` : "Hide noise"}
            </button>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          {filtered.slice(0, 12).map((c) => (
            <ExternalClusterCard key={c.org} cluster={c} />
          ))}
          {filtered.length === 0 && (
            <div className="text-[10px] italic text-slate-500">
              {destinations.external_clusters.length === 0
                ? "No external destinations observed"
                : `All ${destinations.external_clusters.length} destinations match the noise filter (NTP / metadata). Toggle to show.`}
            </div>
          )}
          {filtered.length > 12 && (
            <div className="text-[10px] text-slate-500 italic pl-1">
              + {filtered.length - 12} more
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-600 font-bold mb-2 flex items-center gap-1.5">
          <Cloud className="w-3 h-3 text-emerald-700" />
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
      <div className="rounded-xl border border-slate-200 bg-white p-12 flex flex-col items-center gap-3 min-h-[500px] justify-center shadow-sm">
        <Activity className="w-8 h-8 animate-pulse text-violet-500" />
        <div className="text-sm font-semibold text-slate-900">
          Loading Trust Boundary Map…
        </div>
        <div className="text-xs text-slate-600">
          First-time analysis takes 30-40 seconds. Subsequent loads are instant.
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-600" />
        <div className="text-sm font-semibold text-red-900 mb-1">
          Failed to load Trust Boundary Map
        </div>
        <div className="text-xs text-red-700 mb-3">{error}</div>
        <button
          onClick={retry}
          className="px-3 py-1.5 rounded text-xs font-semibold bg-red-100 hover:bg-red-200 text-red-900 border border-red-300"
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
      {/* HERO — single focal answer at the top. Picks the worst crown
          jewel + its 1-hop exfil chain so the operator reads ONE sentence
          and knows what to do. Always visible (no collapse). */}
      <TopExposureHero
        workloads={data.workloads}
        systemName={data.system_name}
        onSelectWorkload={handleSelectWorkload}
      />

      {/* Inverted CJ list — collapsed by default since the hero already
          surfaces the top jewel. Operators who want the full per-jewel
          inverted view expand it themselves. */}
      <CrownJewelExfilPaths
        workloads={data.workloads}
        onSelectWorkload={handleSelectWorkload}
      />

      {/* HEADLINE METRICS — bucket counts. Always visible. */}
      <SummaryHeader summary={data.summary} vpcLabel={`${vpcLabel}${vpcSubtitle ? ` · ${vpcSubtitle}` : ""}`} />

      {/* PROJECTION — what changes if you apply all recommended closures.
          Behind a drawer because it's a what-if, not the current state.
          Operators chase the current state first; planning is secondary. */}
      <CollapsibleSection
        title="Projected state after applying all closures"
        subtitle="What-if simulation — honest projection from observed traffic, no AWS mutation"
        defaultOpen={false}
      >
        <ProjectedAfterCard
          summary={data.summary}
          destinations={data.destinations}
          workloads={data.workloads}
          lookbackDays={data.lookback_days}
        />
      </CollapsibleSection>

      {/* VPC + SUBNETS — the dense map. Behind a drawer because most
          operators don't want a per-subnet picker on first look. */}
      <CollapsibleSection
        title="VPC layout — subnets and workloads"
        subtitle={`${data.subnets.length} subnet${data.subnets.length === 1 ? "" : "s"}, ${data.workloads.length} workload${data.workloads.length === 1 ? "" : "s"}`}
        defaultOpen={false}
      >
        <VPCContainer
          vpcLabel={`${vpcLabel}${vpcSubtitle ? ` · ${vpcSubtitle}` : ""}`}
          subnets={data.subnets}
          workloads={data.workloads}
          onSelectWorkload={handleSelectWorkload}
          selectedWorkloadId={selectedWorkloadId}
        />
      </CollapsibleSection>

      {/* EGRESS GATES — VPCEs and their policy status. Drawer. */}
      <CollapsibleSection
        title="Egress boundary gates"
        subtitle={`${data.gates.length} gate${data.gates.length === 1 ? "" : "s"} controlling private vs public egress`}
        defaultOpen={false}
      >
        <EgressBoundary gates={data.gates} />
      </CollapsibleSection>

      {/* DESTINATIONS — external orgs + AWS services. Drawer. NTP / pool
          noise filtered out by default; toggle inside the area to show
          all. */}
      <CollapsibleSection
        title="Destination clusters"
        subtitle={`${data.destinations.external_clusters.length} external org${data.destinations.external_clusters.length === 1 ? "" : "s"}, ${data.destinations.aws_backbone.length} AWS service${data.destinations.aws_backbone.length === 1 ? "" : "s"}`}
        defaultOpen={false}
      >
        <DestinationsArea destinations={data.destinations} />
      </CollapsibleSection>
    </div>
  )
}

// CollapsibleSection — thin wrapper around <details>/<summary> with
// our typography. Used to demote secondary sections behind a one-line
// summary so the page doesn't show 7 dashboards at once.
function CollapsibleSection({
  title,
  subtitle,
  defaultOpen,
  children,
}: {
  title: string
  subtitle?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <details
      className="rounded-lg border border-slate-200 bg-white shadow-sm group"
      open={defaultOpen}
    >
      <summary className="cursor-pointer select-none px-4 py-3 flex items-center gap-3 hover:bg-slate-50">
        <ChevronRight className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-90 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-slate-900 truncate">
            {title}
          </div>
          {subtitle && (
            <div className="text-[10px] text-slate-500 mt-0.5 truncate">
              {subtitle}
            </div>
          )}
        </div>
      </summary>
      <div className="px-4 pb-4 pt-1">{children}</div>
    </details>
  )
}

export default TrustBoundaryMap
