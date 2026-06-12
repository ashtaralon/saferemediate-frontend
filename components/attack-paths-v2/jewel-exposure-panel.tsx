"use client"

// Crown Jewel Exposure panel — Slice 5b of Attack Paths v2.
//
// The "all doors" view: how many workloads / roles / policies expose
// this crown jewel, ranked by observed hit count. Companion to the
// per-path PathAnalysisPanel — the toggle at the top of the right
// column flips between them.
//
// Per-path = "explain one route."
// Exposure = "quantify and reduce total blast radius."
//
// Visual: 8 lanes laid out left-to-right matching the per-path map
// language so operators feel oriented:
//   COMPUTE → SUBNETS → SGs → NACLs → IAM ROLES → INSTANCE PROFILES
//          → IAM POLICIES → RESOURCES
//
// VPCe lane intentionally omitted in Exposure mode (VPCEs are per-path
// detail, not exposure-level signal — see slice plan 5b notes).
//
// Per-lane signals (per feedback from 2026-05-21 design discussion):
//   1. Count badge — COMPUTE (10), IAM ROLES (4)
//   2. Fresh vs stale split — pilot noise filtered by default
//   3. Observed hit count on roles/policies — alon-demo-ec2-role · 11 hits
//   4. Shared-jewel warning — "same policy grants prod-data + analytics"
//
// Fix-impact deltas ("closing this policy reduces access to N jewels")
// are wired here but read .shared_jewels from the backend; the actual
// score delta lands in Slice 6 (cross-jewel fix-impact computation).

import { useMemo, useState } from "react"
import {
  Crown,
  Server,
  Zap,
  Box,
  ShieldAlert,
  Key,
  Layers,
  FileText,
  Database,
  AlertTriangle,
  EyeOff,
  Eye,
  Clock,
  Plus,
  Minus,
  ArrowRightLeft,
  History,
} from "lucide-react"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"

// ─── Backend response shapes ─────────────────────────────────────────
// Mirrored from api/jewel_exposure.py. Kept loose with optional fields
// so backend schema drift doesn't crash the panel — null shows as "—".

export interface JewelExposureResponse {
  jewel: {
    id: string
    name: string
    type: string | null
    system_name: string
    is_active: boolean | null
  }
  summary: {
    identity_count: number
    workload_count: number
    policy_count: number
    instance_profile_count: number
    security_group_count: number
    subnet_count: number
    vpc_count: number
    stale_count: number
    headline: string
  }
  identities: ExposureIdentity[]
  workloads: ExposureWorkload[]
  instance_profiles: ExposureInstanceProfile[]
  policies: ExposurePolicy[]
  network: {
    security_groups: Array<{ id: string; name: string; vpc_id?: string | null }>
    subnets: Array<{ id: string; name: string; is_public?: boolean | null; vpc_id?: string | null }>
    vpcs: string[]
    nacls: Array<{ id: string; name: string }>
  }
  data_plane: {
    encryption_at_rest: any
    versioning: any
    public_access_block: any
    bucket_policy: any
    is_public: boolean | null
    is_sensitive_data: boolean | null
    criticality: string | null
  }
  generated_at: string
  // Slice 8 — exposure-diff timeline. Present only when the request
  // included include_changes=true. change_log = null means first scan
  // (no prior snapshot to diff against); explicit null + reason in
  // change_summary surfaces an honest "first scan" empty state instead
  // of guessing.
  change_log?: ExposureChange[] | null
  change_summary?: ExposureChangeSummary
}

export interface ExposureChange {
  category: "workload" | "identity" | "policy" | "data_plane"
  type: "added" | "removed" | "modified"
  subject: string
  subject_id: string
  narrative: string
  detail?: Record<string, any>
}

export interface ExposureChangeSummary {
  previous_snapshot_date: string | null
  previous_snapshot_time: string | null
  added_count: number
  removed_count: number
  modified_count: number
  total_count: number
  reason?: "first_scan" | "diff_unavailable"
}

interface ExposureIdentity {
  id: string
  name: string
  type: string | null
  observed_hit_count: number
  edge_types: string[]
  allowed_actions?: number | null
  used_actions?: number | null
  unused_actions?: number | null
  is_stale: boolean
  hidden?: boolean
}

interface ExposureWorkload {
  id: string
  name: string
  type: string | null
  is_stale: boolean
  hidden?: boolean
  roles_carried: Array<{ role_name: string; binding: string; via_instance_profile?: string | null }>
  security_groups?: string[]
  subnets?: string[]
  vpcs?: string[]
}

interface ExposureInstanceProfile {
  id: string
  name: string
  wraps_role: string
  carried_by: string[]
}

interface ExposurePolicy {
  id: string
  name: string
  is_inline?: boolean | null
  is_stale: boolean
  hidden?: boolean
  permission_count?: number
  actions?: string[]
  resources_granted?: string[]
  has_wildcard_resource?: boolean
  attached_to_roles?: string[]
  shared_jewels?: Array<{ id: string; name: string }>
  // Slice 6 — cross-jewel fix-impact computation.
  jewel_reach?: Array<{
    jewel_id: string
    jewel_name: string
    is_current_jewel: boolean
    observed_access_hits: number
    is_droppable: boolean
  }>
  narrowing_impact?: {
    current_jewel_count: number | null
    droppable_jewel_count: number | null
    droppable_jewel_names: string[]
    confidence: "high" | "unknown"
    reason?: string
  }
}

// ─── Panel ───────────────────────────────────────────────────────────

interface JewelExposurePanelProps {
  jewel: CrownJewelSummary
  systemName: string
}

export function JewelExposurePanel({ jewel, systemName }: JewelExposurePanelProps) {
  const [showStale, setShowStale] = useState(false)

  // Slice 8 — always request include_changes=true. Backend writes a
  // daily snapshot + returns the diff against the most recent prior
  // snapshot. First-scan state surfaces as change_log=null +
  // change_summary.reason="first_scan" and the UI handles that
  // honestly below.
  const params = new URLSearchParams()
  if (showStale) params.set("include_stale", "true")
  params.set("include_changes", "true")
  const url = `/api/proxy/jewel-exposure/${encodeURIComponent(systemName)}/${encodeURIComponent(jewel.id)}?${params.toString()}`
  const { data, loading, error } = useCachedFetch<JewelExposureResponse>(url, {
    cacheKey: `jewel-exposure:${systemName}:${jewel.id}:stale=${showStale}:changes=true`,
  })

  if (loading && !data) {
    return (
      <div className="flex flex-col h-full">
        <ExposureHeader jewel={jewel} headline="Loading exposure…" />
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Computing the all-doors view…
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex flex-col h-full">
        <ExposureHeader jewel={jewel} headline="Exposure data unavailable" />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 max-w-md text-sm text-red-700 dark:text-red-300">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-semibold">Could not load exposure</span>
            </div>
            <div className="text-xs text-red-700 dark:text-red-300/80">{String(error)}</div>
          </div>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <ExposureHeader
        jewel={jewel}
        headline={data.summary.headline}
        staleCount={data.summary.stale_count}
        showStale={showStale}
        onToggleStale={() => setShowStale((s) => !s)}
      />

      {/* Slice 8 — "WHAT CHANGED SINCE LAST SCAN" timeline. Renders
          above the lanes so attack-surface drift is the first thing
          the operator sees. Three states:
            - change_log present + non-empty → render the timeline
            - change_log null + reason=first_scan → honest "first scan" empty
            - change_log empty array → "no changes since last scan"
          (We don't surface change_log when change_summary is missing;
          that means the request didn't include_changes or the backend
          had a transient diff failure.) */}
      {data.change_summary && (
        <ChangeTimeline changeLog={data.change_log} summary={data.change_summary} />
      )}

      {/* The 8-lane "all doors" panel */}
      <div className="px-6 py-4 space-y-3">
        <LaneCard
          title="COMPUTE"
          icon={Server}
          tone="text-blue-700 dark:text-blue-300"
          bg="bg-blue-500/5 border-blue-500/20"
          count={data.summary.workload_count}
          subtitle={`${data.workloads.filter((w) => !w.hidden).length} live · ${data.workloads.filter((w) => w.hidden).length} stale`}
        >
          {data.workloads
            .filter((w) => showStale || !w.hidden)
            .map((w) => (
              <WorkloadRow key={w.id} workload={w} />
            ))}
        </LaneCard>

        <LaneCard
          title="NETWORK"
          icon={ShieldAlert}
          tone="text-orange-700 dark:text-orange-300"
          bg="bg-orange-500/5 border-orange-500/20"
          count={data.summary.security_group_count + data.summary.subnet_count}
          subtitle={`${data.summary.security_group_count} SG · ${data.summary.subnet_count} subnet · ${data.summary.vpc_count} VPC`}
        >
          <NetworkSummary network={data.network} />
        </LaneCard>

        <LaneCard
          title="IAM ROLES"
          icon={Key}
          tone="text-pink-700 dark:text-pink-300"
          bg="bg-pink-500/5 border-pink-500/20"
          count={data.summary.identity_count}
          subtitle={`${data.identities.filter((i) => !i.hidden).reduce((s, i) => s + (i.observed_hit_count || 0), 0)} total observed hits`}
        >
          {data.identities
            .filter((i) => showStale || !i.hidden)
            .map((i) => (
              <IdentityRow key={i.id} identity={i} />
            ))}
        </LaneCard>

        <LaneCard
          title="INSTANCE PROFILES"
          icon={Layers}
          tone="text-amber-700 dark:text-amber-300"
          bg="bg-amber-500/5 border-amber-500/20"
          count={data.summary.instance_profile_count}
          subtitle={
            data.summary.instance_profile_count === 0
              ? "no IMDS bindings on the workloads above"
              : `${data.summary.instance_profile_count} IP · binds EC2 metadata service to role`
          }
        >
          {data.instance_profiles.map((ip) => (
            <InstanceProfileRow key={ip.id} ip={ip} />
          ))}
        </LaneCard>

        <LaneCard
          title="IAM POLICIES"
          icon={FileText}
          tone="text-violet-700 dark:text-violet-300"
          bg="bg-violet-500/5 border-violet-500/20"
          count={data.summary.policy_count}
          subtitle={
            data.policies.some((p) => (p.shared_jewels?.length ?? 0) > 0)
              ? "⚠ shared-policy warning — some policies grant access to other jewels"
              : "policies attached to the roles above"
          }
        >
          {data.policies
            .filter((p) => showStale || !p.hidden)
            .map((p) => (
              <PolicyRow key={p.id} policy={p} />
            ))}
        </LaneCard>

        <LaneCard
          title="DATA PLANE — the jewel itself"
          icon={Database}
          tone="text-emerald-700 dark:text-emerald-300"
          bg="bg-emerald-500/5 border-emerald-500/20"
          count={null}
          subtitle="bucket-level controls"
        >
          <DataPlaneRow dp={data.data_plane} />
        </LaneCard>
      </div>
    </div>
  )
}

// ─── Header ──────────────────────────────────────────────────────────

function ExposureHeader({
  jewel,
  headline,
  staleCount,
  showStale,
  onToggleStale,
}: {
  jewel: CrownJewelSummary
  headline: string
  staleCount?: number
  showStale?: boolean
  onToggleStale?: () => void
}) {
  return (
    <div className="px-6 py-4 border-b border-border bg-background/95 backdrop-blur sticky top-0 z-10">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            EXPOSURE VIEW · all doors to this crown jewel
          </div>
          <div className="text-sm font-semibold text-foreground leading-snug">
            {headline}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="flex items-center gap-1.5 justify-end mb-0.5">
            <Crown className="h-3 w-3 text-amber-600 dark:text-amber-400" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">crown jewel</span>
          </div>
          <div className="text-xs font-mono text-amber-700 dark:text-amber-300/90 truncate max-w-[260px]" title={jewel.name}>
            {jewel.name}
          </div>
        </div>
      </div>
      {staleCount !== undefined && staleCount > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={onToggleStale}
            className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider rounded border border-border bg-card text-foreground hover:bg-accent hover:border-border transition-colors px-2 py-1"
          >
            {showStale ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
            {showStale ? `Hide ${staleCount} stale` : `Show ${staleCount} stale (pilot / inactive)`}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Lane wrapper ────────────────────────────────────────────────────

function LaneCard({
  title,
  icon: Icon,
  tone,
  bg,
  count,
  subtitle,
  children,
}: {
  title: string
  icon: any
  tone: string
  bg: string
  count: number | null
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className={`rounded-xl border ${bg} overflow-hidden`}>
      <div className="px-4 py-2.5 flex items-center gap-2 border-b border-border bg-muted/30">
        <Icon className={`h-3.5 w-3.5 ${tone}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground">{title}</span>
        {count !== null && (
          <span className={`text-[10px] font-bold tabular-nums rounded border border-border bg-muted ${tone} px-1.5 py-0.5`}>
            {count}
          </span>
        )}
        {subtitle && (
          <span className="ml-auto text-[10px] text-muted-foreground italic truncate">{subtitle}</span>
        )}
      </div>
      <div className="px-4 py-3 space-y-1.5">{children}</div>
    </div>
  )
}

// ─── Per-lane row renderers ──────────────────────────────────────────

function WorkloadRow({ workload }: { workload: ExposureWorkload }) {
  const isLambda = (workload.type || "").toLowerCase().includes("lambda")
  const Icon = isLambda ? Zap : workload.type === "ECSTask" ? Box : Server
  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-md ${
        workload.is_stale
          ? "bg-card border border-border opacity-50"
          : "bg-card border border-border"
      }`}
    >
      <Icon className={`h-3.5 w-3.5 shrink-0 ${workload.is_stale ? "text-muted-foreground" : "text-blue-700 dark:text-blue-300"}`} />
      <span className="text-xs font-mono text-foreground truncate flex-1">{workload.name}</span>
      <div className="flex items-center gap-1 flex-wrap justify-end">
        {workload.roles_carried.map((r, i) => (
          <span
            key={`${r.role_name}-${i}`}
            className="text-[9px] font-mono rounded border border-pink-500/30 bg-pink-500/5 text-pink-700 dark:text-pink-300 px-1.5 py-0.5"
            title={`Binding: ${r.binding}${r.via_instance_profile ? ` (via ${r.via_instance_profile})` : ""}`}
          >
            {r.role_name}
          </span>
        ))}
        {workload.is_stale && (
          <span className="text-[9px] font-semibold uppercase tracking-wider rounded border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-1.5 py-0.5">
            ⚠ stale
          </span>
        )}
      </div>
    </div>
  )
}

function IdentityRow({ identity }: { identity: ExposureIdentity }) {
  const unusedPct =
    identity.allowed_actions && identity.allowed_actions > 0
      ? Math.round(((identity.unused_actions ?? 0) / identity.allowed_actions) * 100)
      : null
  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-md ${
        identity.is_stale
          ? "bg-card border border-border opacity-50"
          : "bg-pink-500/5 border border-pink-500/20"
      }`}
    >
      <Key className={`h-3.5 w-3.5 shrink-0 ${identity.is_stale ? "text-muted-foreground" : "text-pink-700 dark:text-pink-300"}`} />
      <span className="text-xs font-mono text-foreground truncate flex-1">{identity.name}</span>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground shrink-0">
        <span className="text-emerald-700 dark:text-emerald-300 font-semibold tabular-nums">
          {identity.observed_hit_count} hits
        </span>
        {identity.allowed_actions !== null && identity.allowed_actions !== undefined && (
          <span title={`${identity.used_actions} of ${identity.allowed_actions} actions used`}>
            {identity.used_actions ?? 0}/{identity.allowed_actions} used
            {unusedPct !== null && unusedPct > 50 && (
              <span className="text-amber-700 dark:text-amber-300 ml-1">({unusedPct}% unused)</span>
            )}
          </span>
        )}
        {identity.is_stale && (
          <span className="text-[9px] font-semibold uppercase tracking-wider rounded border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-1.5 py-0.5">
            ⚠ stale
          </span>
        )}
      </div>
    </div>
  )
}

function InstanceProfileRow({ ip }: { ip: ExposureInstanceProfile }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/5 border border-amber-500/20">
      <Layers className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300 shrink-0" />
      <span className="text-xs font-mono text-amber-700 dark:text-amber-300 truncate flex-1">{ip.name}</span>
      <span className="text-[10px] text-muted-foreground">
        wraps <span className="font-mono text-pink-700 dark:text-pink-300">{ip.wraps_role}</span> · carried by {ip.carried_by.length} EC2
      </span>
    </div>
  )
}

function PolicyRow({ policy }: { policy: ExposurePolicy }) {
  const sharedCount = policy.shared_jewels?.length ?? 0
  return (
    <div
      className={`p-2 rounded-md ${
        policy.is_stale
          ? "bg-card border border-border opacity-50"
          : "bg-violet-500/5 border border-violet-500/20"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <FileText className={`h-3.5 w-3.5 shrink-0 ${policy.is_stale ? "text-muted-foreground" : "text-violet-700 dark:text-violet-300"}`} />
        <span className="text-xs font-mono text-foreground truncate flex-1">{policy.name}</span>
        {policy.is_inline && (
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">inline</span>
        )}
        {policy.has_wildcard_resource && (
          <span className="text-[9px] font-semibold uppercase tracking-wider rounded border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300 px-1.5 py-0.5">
            wildcard scope
          </span>
        )}
        {policy.is_stale && (
          <span className="text-[9px] font-semibold uppercase tracking-wider rounded border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-1.5 py-0.5">
            ⚠ stale
          </span>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground flex items-center gap-2 flex-wrap">
        {policy.actions && policy.actions.length > 0 && (
          <span>
            <span className="text-foreground">{policy.actions.length}</span> action{policy.actions.length === 1 ? "" : "s"}
          </span>
        )}
        {policy.attached_to_roles && policy.attached_to_roles.length > 0 && (
          <span>
            attached to <span className="text-pink-700 dark:text-pink-300 font-mono">{policy.attached_to_roles.join(", ")}</span>
          </span>
        )}
      </div>
      {/* Slice 6 — narrowing-impact chip. Renders one of three honest
          states based on the backend's fix-impact computation:
            unknown    — wildcard policy, scope unprovable
            droppable  — N jewels in scope have ZERO observed access from
                         the attached roles; narrowing drops them safely
            all-used   — every jewel in scope has observed access; the
                         policy is genuinely needed at the resource level
                         (action-level narrowing is a separate signal)
          shared_jewels still renders the cross-jewel WARNING below the
          impact chip — operator needs both "this policy is wide" AND
          "narrowing it actually closes N doors." */}
      {policy.narrowing_impact?.confidence === "unknown" && (
        <div className="mt-1.5 flex items-start gap-1.5 p-1.5 rounded bg-muted border border-border">
          <AlertTriangle className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-[10px] text-foreground leading-snug">
            <span className="font-semibold">Scope unknown:</span> {policy.narrowing_impact.reason ?? "wildcard policy"}.
          </div>
        </div>
      )}
      {policy.narrowing_impact?.confidence === "high" && (policy.narrowing_impact.droppable_jewel_count ?? 0) > 0 && (
        <div className="mt-1.5 flex items-start gap-1.5 p-1.5 rounded bg-emerald-500/10 border border-emerald-500/30">
          <Layers className="h-3 w-3 text-emerald-700 dark:text-emerald-300 shrink-0 mt-0.5" />
          <div className="text-[10px] text-emerald-800 dark:text-emerald-100 leading-snug">
            <span className="font-semibold">
              Narrowing protects {policy.narrowing_impact.droppable_jewel_count} additional jewel
              {policy.narrowing_impact.droppable_jewel_count === 1 ? "" : "s"}:
            </span>{" "}
            <span className="font-mono">{policy.narrowing_impact.droppable_jewel_names.join(", ")}</span>{" "}
            <span className="text-emerald-700 dark:text-emerald-300/80">(no observed access from attached roles)</span>.
          </div>
        </div>
      )}
      {policy.narrowing_impact?.confidence === "high" &&
        (policy.narrowing_impact.current_jewel_count ?? 0) > 1 &&
        (policy.narrowing_impact.droppable_jewel_count ?? 0) === 0 && (
          <div className="mt-1.5 flex items-start gap-1.5 p-1.5 rounded bg-amber-500/10 border border-amber-500/30">
            <AlertTriangle className="h-3 w-3 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
            <div className="text-[10px] text-amber-800 dark:text-amber-100 leading-snug">
              <span className="font-semibold">
                Shared across {policy.narrowing_impact.current_jewel_count} jewels — all observed in use.
              </span>{" "}
              <span className="text-amber-700 dark:text-amber-300/80">
                Resource scope can't be reduced safely, but action-level narrowing is still available (see role's unused actions).
              </span>
            </div>
          </div>
        )}
      {/* Optional drill-down: per-jewel observed-access detail. Hidden
          by default to keep the row compact; the impact chip above
          summarizes. Surface jewel_reach[] inline only when there are
          shared jewels worth scrutinizing. */}
      {policy.jewel_reach && policy.jewel_reach.length > 1 && (
        <details className="mt-1.5">
          <summary className="text-[9px] uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground">
            per-jewel access detail ({policy.jewel_reach.length} jewels)
          </summary>
          <div className="mt-1 space-y-0.5">
            {policy.jewel_reach.map((jr) => (
              <div key={jr.jewel_id} className="flex items-center gap-2 text-[10px]">
                <span className={`font-mono truncate ${jr.is_current_jewel ? "text-amber-700 dark:text-amber-300" : "text-foreground"}`}>
                  {jr.jewel_name}
                  {jr.is_current_jewel && <span className="ml-1 text-[9px] uppercase text-amber-600 dark:text-amber-400">current</span>}
                </span>
                <span className="ml-auto tabular-nums shrink-0">
                  {jr.observed_access_hits > 0 ? (
                    <span className="text-emerald-700 dark:text-emerald-300">{jr.observed_access_hits} hits</span>
                  ) : (
                    <span className="text-muted-foreground italic">no observed access</span>
                  )}
                </span>
                {jr.is_droppable && (
                  <span className="text-[9px] font-semibold uppercase tracking-wider rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-1 py-0.5">
                    droppable
                  </span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function NetworkSummary({ network }: { network: JewelExposureResponse["network"] }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-[10px]">
      <div>
        <div className="text-muted-foreground uppercase tracking-wider mb-1">Security groups</div>
        {network.security_groups.length === 0 ? (
          <span className="text-muted-foreground italic">none</span>
        ) : (
          network.security_groups.map((sg) => (
            <div key={sg.id} className="font-mono text-foreground truncate">
              {sg.name}
            </div>
          ))
        )}
      </div>
      <div>
        <div className="text-muted-foreground uppercase tracking-wider mb-1">
          Subnets / VPCs ({network.vpcs.length} VPC{network.vpcs.length === 1 ? "" : "s"})
        </div>
        {network.subnets.length === 0 ? (
          <span className="text-muted-foreground italic">none</span>
        ) : (
          network.subnets.slice(0, 6).map((sn) => (
            <div key={sn.id} className="font-mono text-foreground truncate">
              {sn.name || sn.id}
              {sn.is_public === true && (
                <span className="ml-1 text-[9px] uppercase tracking-wider text-red-700 dark:text-red-300">public</span>
              )}
            </div>
          ))
        )}
        {network.subnets.length > 6 && (
          <div className="text-muted-foreground italic">+{network.subnets.length - 6} more</div>
        )}
      </div>
    </div>
  )
}

function DataPlaneRow({ dp }: { dp: JewelExposureResponse["data_plane"] }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-[10px]">
      <DPCell label="Encryption at rest" value={dp.encryption_at_rest} okWhen="set" />
      <DPCell label="Versioning" value={dp.versioning} okWhen="enabled" />
      <DPCell label="Public access block" value={dp.public_access_block} okWhen="enforced" />
      <DPCell label="Bucket policy" value={dp.bucket_policy} okWhen="present" />
      <DPCell label="Is sensitive" value={dp.is_sensitive_data} />
      <DPCell label="Criticality" value={dp.criticality} />
    </div>
  )
}

// ─── Slice 8 — Change timeline ──────────────────────────────────────
//
// Three render states match the three honest backend states:
//   first_scan       → muted "First scan — nothing to compare yet"
//   diff_unavailable → muted "Diff temporarily unavailable" (operator
//                       still sees the live exposure data; just no diff)
//   has_changes      → expandable list of change_log entries grouped
//                       by category (workload / identity / policy /
//                       data_plane)
// We deliberately keep this collapsed by default — operators glance at
// the count chip, click to expand only when they want detail.
function ChangeTimeline({
  changeLog,
  summary,
}: {
  changeLog: ExposureChange[] | null | undefined
  summary: ExposureChangeSummary
}) {
  const [expanded, setExpanded] = useState(true)

  // first_scan / diff_unavailable empty states
  if (changeLog === null || changeLog === undefined) {
    return (
      <div className="px-6 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          {summary.reason === "first_scan" ? (
            <span>First scan for this jewel — nothing to compare yet. Future visits will show what changed.</span>
          ) : (
            <span>Diff temporarily unavailable. Live exposure data above is still accurate.</span>
          )}
        </div>
      </div>
    )
  }

  // No changes since last scan
  if (changeLog.length === 0) {
    return (
      <div className="px-6 py-3 border-b border-border bg-emerald-500/[0.04]">
        <div className="flex items-center gap-2 text-[10px] text-emerald-700 dark:text-emerald-300">
          <Clock className="h-3 w-3" />
          <span>
            No changes since {summary.previous_snapshot_date ?? "last scan"} — attack surface is steady.
          </span>
        </div>
      </div>
    )
  }

  // Has changes — render the timeline
  return (
    <div className="border-b border-border bg-amber-500/[0.04]">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-6 py-3 flex items-center gap-2 text-left hover:bg-amber-500/[0.06] transition-colors"
      >
        <History className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
          What changed since {summary.previous_snapshot_date ?? "last scan"}
        </span>
        <span className="ml-2 text-[10px] text-foreground">
          {summary.added_count > 0 && (
            <span className="text-emerald-700 dark:text-emerald-300 mr-2">+{summary.added_count}</span>
          )}
          {summary.removed_count > 0 && (
            <span className="text-red-700 dark:text-red-300 mr-2">−{summary.removed_count}</span>
          )}
          {summary.modified_count > 0 && (
            <span className="text-amber-700 dark:text-amber-300">∼{summary.modified_count}</span>
          )}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {expanded ? "click to collapse" : `${summary.total_count} change${summary.total_count === 1 ? "" : "s"} — click to expand`}
        </span>
      </button>
      {expanded && (
        <div className="px-6 pb-4 space-y-1.5">
          {changeLog.map((c, i) => (
            <ChangeRow key={`${c.category}-${c.subject_id}-${i}`} change={c} />
          ))}
        </div>
      )}
    </div>
  )
}

function ChangeRow({ change }: { change: ExposureChange }) {
  // Type → icon + tone
  const typeMeta: Record<ExposureChange["type"], { icon: any; tone: string }> = {
    added: { icon: Plus, tone: "text-emerald-700 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/10" },
    removed: { icon: Minus, tone: "text-red-700 dark:text-red-300 border-red-500/30 bg-red-500/10" },
    modified: { icon: ArrowRightLeft, tone: "text-amber-700 dark:text-amber-300 border-amber-500/30 bg-amber-500/10" },
  }
  const m = typeMeta[change.type]
  const TypeIcon = m.icon

  // Category → icon for the subject side
  const catIcon: Record<ExposureChange["category"], any> = {
    workload: Server,
    identity: Key,
    policy: FileText,
    data_plane: Database,
  }
  const CatIcon = catIcon[change.category]

  // Strip simple markdown bold marks (**X**) from the narrative for
  // inline rendering. Keep them stylable.
  const parts = change.narrative.split(/\*\*/)
  return (
    <div className="flex items-start gap-2 p-2 rounded-md bg-card border border-border">
      <span className={`shrink-0 inline-flex items-center justify-center w-4 h-4 rounded border ${m.tone}`}>
        <TypeIcon className="h-2.5 w-2.5" />
      </span>
      <CatIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="text-[11px] text-foreground leading-snug min-w-0">
        {parts.map((p, i) =>
          i % 2 === 1 ? (
            <span key={i} className="font-mono font-semibold text-foreground">
              {p}
            </span>
          ) : (
            <span key={i}>{p}</span>
          )
        )}
      </div>
    </div>
  )
}

function DPCell({ label, value, okWhen }: { label: string; value: any; okWhen?: string }) {
  const isNull = value === null || value === undefined
  const tone = isNull ? "text-muted-foreground" : value === true ? "text-emerald-700 dark:text-emerald-300" : value === false ? "text-red-700 dark:text-red-300" : "text-foreground"
  const display =
    isNull ? "not set" : typeof value === "boolean" ? (value ? "✓" : "✗") : String(value)
  return (
    <div>
      <div className="text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`font-mono ${tone}`}>{display}</div>
    </div>
  )
}
