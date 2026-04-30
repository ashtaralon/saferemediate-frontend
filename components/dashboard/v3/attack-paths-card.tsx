"use client"

import { Crown, Globe } from "lucide-react"
import { ErrorCard, LoadingCard, Section, StaleIndicator } from "./card-shell"
import { descriptorClass, labelClass } from "./styles"
import { useCachedFetch } from "@/lib/use-cached-fetch"

/**
 * Top Attack Paths to Crown Jewels.
 *
 * Real source: /api/proxy/identity-attack-paths/all
 *   → fans out across systems → merges crown_jewels[] → sorts by
 *   priority_score desc.
 *
 * Honest: no synthesis. The 6-factor SeverityBreakdown sub-scores
 * exist on individual paths in the detail-page response but the
 * crown-jewel list endpoint only carries summary fields
 * (priority_score, highest_risk_score, severity, path_count,
 * is_internet_exposed). We render those — the per-factor sub-bars
 * shown in the reference mockup are NOT in the org-wide rollup,
 * so we don't pretend.
 */

type CrownJewel = {
  id: string
  name: string
  type: string
  severity: string
  path_count?: number
  highest_risk_score?: number
  is_internet_exposed?: boolean
  data_classification?: string | null
  priority_score?: number
  system_name?: string
}

type PathsResponse = {
  crown_jewels?: CrownJewel[]
  total_jewels?: number
  total_paths?: number
  exposed_jewels?: number
  systems_scanned?: number
  errors?: string[]
  error?: string
}

const SEVERITY_PILL: Record<string, string> = {
  CRITICAL: "bg-rose-100 text-rose-700",
  HIGH: "bg-amber-100 text-amber-700",
  MEDIUM: "bg-blue-50 text-blue-700",
  LOW: "bg-slate-100 text-slate-600",
}

const TYPE_TINT: Record<string, string> = {
  S3Bucket: "bg-teal-50 text-teal-700",
  KMSKey: "bg-purple-50 text-purple-700",
  RDSInstance: "bg-blue-50 text-blue-700",
  DynamoDBTable: "bg-indigo-50 text-indigo-700",
  IAMRole: "bg-violet-50 text-violet-700",
}

function priorityToneClass(score: number): string {
  // Higher priority_score = more dangerous → use rose/amber/slate.
  if (score >= 60) return "rounded-md bg-rose-50 px-2 py-0.5 text-rose-700"
  if (score >= 30) return "rounded-md bg-amber-50 px-2 py-0.5 text-amber-700"
  if (score > 0) return "rounded-md bg-slate-100 px-2 py-0.5 text-slate-700"
  return "rounded-md bg-slate-100 px-2 py-0.5 text-slate-400"
}

export function AttackPathsCard() {
  // Action-driving data — strict 10-min staleness. Anything older falls
  // back to the loading skeleton instead of showing stale "top attack
  // path" data, because acting on a 12h-old top path could mean
  // remediating something that was already fixed.
  const { data, loading, error, retry, isStale, cachedAt } = useCachedFetch<PathsResponse>(
    "/api/proxy/identity-attack-paths/all",
    {
      cacheKey: "identity-attack-paths-all",
      maxStaleMs: 10 * 60 * 1000,
      fetchInit: { cache: "no-store" },
    }
  )

  if (loading && !data) return <LoadingCard label="Top attack paths to crown jewels" />
  if (error && !data) return <ErrorCard label="Top attack paths" error={error} onRetry={retry} />
  if (!data) return null

  const jewels = (data.crown_jewels ?? []).slice(0, 8)
  const summary = (
    <span className="text-xs text-slate-500">
      <span className="font-semibold text-slate-700">{data.total_jewels ?? 0}</span> jewels ·{" "}
      <span className="font-semibold text-slate-700">{data.total_paths ?? 0}</span> paths ·{" "}
      <span className="font-semibold text-rose-700">{data.exposed_jewels ?? 0}</span> internet-exposed
    </span>
  )

  if (jewels.length === 0) {
    return (
      <Section
        label="Top attack paths to crown jewels"
        descriptor="No crown jewels currently have inbound attack paths"
        className="border-l-[3px] border-l-rose-500"
        icon={<Crown className="h-3.5 w-3.5 text-amber-500" strokeWidth={2.5} />}
        right={
        <span className="flex items-center gap-2">
          <StaleIndicator cachedAt={cachedAt} isStale={isStale} />
          {summary}
        </span>
      }
      >
        <div className={descriptorClass}>
          {data.systems_scanned ?? 0} systems scanned. None surfaced reachable jewels.
        </div>
      </Section>
    )
  }

  return (
    <Section
      label="Top attack paths to crown jewels"
      descriptor="Sorted by priority_score · click to drill into the path graph"
      className="border-l-[3px] border-l-rose-500"
      icon={<Crown className="h-3.5 w-3.5 text-amber-500" strokeWidth={2.5} />}
      right={
        <span className="flex items-center gap-2">
          <StaleIndicator cachedAt={cachedAt} isStale={isStale} />
          {summary}
        </span>
      }
    >
      <ul className="space-y-2">
        {jewels.map((j) => {
          const sevClass = SEVERITY_PILL[j.severity] ?? "bg-slate-100 text-slate-600"
          const typeClass = TYPE_TINT[j.type] ?? "bg-slate-100 text-slate-600"
          const priority = j.priority_score ?? j.highest_risk_score ?? 0
          return (
            <li
              key={j.id}
              className="flex items-center gap-3 rounded-md border border-slate-100 bg-slate-50/40 px-3 py-2 text-sm hover:bg-slate-50"
            >
              <span
                className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${typeClass}`}
              >
                {j.type}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 truncate font-medium text-slate-900">
                  <span className="truncate">{j.name || j.id}</span>
                  {j.is_internet_exposed && (
                    <Globe
                      className="h-3.5 w-3.5 shrink-0 text-rose-600"
                      strokeWidth={2.5}
                    />
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-500">
                  {j.system_name ?? "—"} · {j.path_count ?? 0} path
                  {j.path_count === 1 ? "" : "s"}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${sevClass}`}
              >
                {j.severity}
              </span>
              <span
                className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${priorityToneClass(priority)}`}
              >
                {priority.toFixed(0)}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
        <span>Globe icon = internet-exposed crown jewel</span>
        <a
          href="/attack-paths"
          className="font-medium text-slate-700 hover:text-slate-900"
        >
          View all paths →
        </a>
      </div>
    </Section>
  )
}
