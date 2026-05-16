"use client"

import { useMemo, useState } from "react"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import { WorkloadCard } from "./workload-card"
import { WorkloadDrillDown } from "./workload-drill-down"
import {
  type PostureSummaryResponse,
  type PostureWorkloadsResponse,
  type WorkloadSummary,
} from "./posture-types"

function isPublicSubnet(w: WorkloadSummary): boolean | null {
  return w.subnet_is_public
}

function describeAge(iso: string | null): string {
  if (!iso) return "never"
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms) || ms < 0) return iso
  const mins = Math.round(ms / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  return `${Math.round(hrs / 24)} d ago`
}

const ROW_CLASS = "rounded-lg border border-zinc-800 bg-zinc-950/60 p-4"

export function PostureDashboard() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [includeCorrect, setIncludeCorrect] = useState(false)
  const [sensitiveOnly, setSensitiveOnly] = useState(false)

  const summaryResp = useCachedFetch<PostureSummaryResponse>(
    "/api/proxy/posture-visibility/summary",
    { cacheKey: "posture:summary", maxStaleMs: 10 * 60 * 1000 },
  )
  const summary = summaryResp.data

  const params = new URLSearchParams()
  if (includeCorrect) params.set("include_correct", "true")
  if (sensitiveOnly) params.set("sensitive_only", "true")
  params.set("limit", "300")
  const workloadsUrl = `/api/proxy/posture-visibility/workloads?${params.toString()}`

  const workloadsResp = useCachedFetch<PostureWorkloadsResponse>(workloadsUrl, {
    cacheKey: `posture:workloads:${includeCorrect ? "all" : "issues"}:${sensitiveOnly ? "sens" : "all"}`,
    maxStaleMs: 5 * 60 * 1000,
  })
  const allWorkloads = workloadsResp.data?.workloads ?? []

  const { publicGroup, privateGroup, unknownGroup } = useMemo(() => {
    const pub: WorkloadSummary[] = []
    const priv: WorkloadSummary[] = []
    const unk: WorkloadSummary[] = []
    for (const w of allWorkloads) {
      const p = isPublicSubnet(w)
      if (p === true) pub.push(w)
      else if (p === false) priv.push(w)
      else unk.push(w)
    }
    return { publicGroup: pub, privateGroup: priv, unknownGroup: unk }
  }, [allWorkloads])

  const selected = selectedId
    ? allWorkloads.find((w) => w.id === selectedId) || null
    : null

  const heroNumber = summary?.workload_count ?? 0
  const exposedCount = summary?.by_exposure_state?.EXPOSED ?? 0
  const latentCount = summary?.by_exposure_state?.LATENT_EXPOSURE ?? 0
  const containedCount = summary?.by_exposure_state?.CONTAINED ?? 0
  const depNone = summary?.by_internet_dependency_tier?.NONE ?? 0
  const depMinimal = summary?.by_internet_dependency_tier?.MINIMAL ?? 0
  const depModerate = summary?.by_internet_dependency_tier?.MODERATE ?? 0
  const depFull = summary?.by_internet_dependency_tier?.FULL ?? 0
  const vpceGapCount = summary?.workloads_with_vpce_coverage_gap ?? 0

  if (!summary || !summary.ready) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10 text-zinc-200">
        <h1 className="text-3xl font-semibold">Posture</h1>
        <p className="mt-2 text-[13px] text-zinc-400">
          Per-workload exposure verdict from observed reachability over 365 days.
        </p>
        <div className="mt-8 rounded-lg border border-zinc-800 bg-zinc-950/60 p-8 text-center">
          <p className="text-[14px] text-zinc-300">
            {summary?.message ||
              "PostureCorrelator has not produced a snapshot yet. The scheduler runs every 60 minutes."}
          </p>
          <p className="mt-2 text-[12px] text-zinc-500">
            POST <code className="font-mono text-zinc-400">/api/posture-visibility/recompute</code> on the backend to force a run.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 text-zinc-100">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Posture</h1>
          <p className="mt-1 text-[13px] text-zinc-400">
            Per-workload exposure verdict from observed reachability over 365 days.
            {workloadsResp.isStale && workloadsResp.cachedAt && (
              <span className="ml-2 text-amber-300">
                · cached {describeAge(new Date(workloadsResp.cachedAt).toISOString())}
              </span>
            )}
          </p>
        </div>
        <div className="text-right text-[11px] uppercase tracking-[0.16em] text-zinc-500">
          Snapshot {describeAge(summary.synced_at)}
        </div>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total workloads" value={heroNumber} tone="muted" />
        <Stat label="Exposed" value={exposedCount} tone="critical" />
        <Stat label="Latent path" value={latentCount} tone="warning" />
        <Stat label="Contained" value={containedCount} tone="ok" />
      </section>

      <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Stat label="Dep · None" value={depNone} tone="ok" sub="Candidates to remove NAT" />
        <Stat label="Dep · Minimal" value={depMinimal} tone="ok" sub="Tight allowlist" />
        <Stat label="Dep · Moderate" value={depModerate} tone="warning" sub="Review surface" />
        <Stat label="Dep · Full" value={depFull} tone="critical" sub="Justify the surface" />
        <Stat label="VPCE gap" value={vpceGapCount} tone="warning" sub="Add VPC Endpoint" />
      </section>

      <div className="mb-6 flex flex-wrap items-center gap-3 text-[12px] text-zinc-300">
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={includeCorrect}
            onChange={(e) => setIncludeCorrect(e.target.checked)}
            className="h-3.5 w-3.5 accent-cyan-500"
          />
          Show correctly-placed workloads
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={sensitiveOnly}
            onChange={(e) => setSensitiveOnly(e.target.checked)}
            className="h-3.5 w-3.5 accent-cyan-500"
          />
          Sensitive only
        </label>
        <button
          type="button"
          onClick={workloadsResp.retry}
          className="ml-auto rounded border border-zinc-800 px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-900"
        >
          Refresh
        </button>
      </div>

      {workloadsResp.error && allWorkloads.length === 0 && (
        <div className="mb-4 rounded-md border border-red-800/60 bg-red-950/40 px-3 py-2 text-[12px] text-red-200">
          {workloadsResp.error}
        </div>
      )}

      <div className="flex flex-col gap-6">
        <PostureRow
          title="Public subnets"
          subtitle="Should hold only edge / proxy (ALB, NAT, bastion, WAF). Sensitive workloads here are exposed by design."
          workloads={publicGroup}
          emptyText={
            includeCorrect
              ? "No workloads currently sit in public subnets."
              : "No workloads in public subnets need review."
          }
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <PostureRow
          title="Private subnets"
          subtitle="Should hold sensitive workloads, databases, internal jobs. LB-chain exposure still possible via internet-facing ALBs."
          workloads={privateGroup}
          emptyText={
            includeCorrect
              ? "No workloads currently sit in private subnets."
              : "No workloads in private subnets need review."
          }
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        {unknownGroup.length > 0 && (
          <PostureRow
            title="Subnet kind unknown"
            subtitle="Route-table → IGW resolution has not yet classified the subnet. Sync subnet visibility to fix."
            workloads={unknownGroup}
            emptyText=""
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}
      </div>

      {selected && (
        <WorkloadDrillDown workload={selected} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
  sub,
}: {
  label: string
  value: number
  tone: "muted" | "critical" | "warning" | "ok"
  sub?: string
}) {
  const TONE_NUM = {
    muted: "text-zinc-200",
    critical: "text-red-300",
    warning: "text-amber-300",
    ok: "text-emerald-300",
  } as const
  return (
    <div className={ROW_CLASS}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${TONE_NUM[tone]}`}>
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-[10px] text-zinc-500">{sub}</div>
      )}
    </div>
  )
}

function PostureRow({
  title,
  subtitle,
  workloads,
  emptyText,
  selectedId,
  onSelect,
}: {
  title: string
  subtitle: string
  workloads: WorkloadSummary[]
  emptyText: string
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <section className={ROW_CLASS}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold tracking-tight text-zinc-100">{title}</h2>
          <p className="text-[12px] text-zinc-500">{subtitle}</p>
        </div>
        <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
          {workloads.length} workload{workloads.length === 1 ? "" : "s"}
        </div>
      </div>
      {workloads.length === 0 ? (
        <p className="text-[12px] text-zinc-500">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {workloads.map((w) => (
            <WorkloadCard
              key={w.id}
              workload={w}
              selected={w.id === selectedId}
              onClick={() => onSelect(w.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
