"use client"

import { ErrorCard, LoadingCard, Section, StaleIndicator } from "./card-shell"
import { descriptorClass } from "./styles"
import { useCachedFetch } from "@/lib/use-cached-fetch"

/**
 * Top least-privilege issues — real data, sorted by gap%.
 *
 * Source: /api/proxy/least-privilege/issues (already existed).
 * Backend returns:
 *   - summary: critical/high/medium/low counts + iam/network/s3 splits
 *   - resources[]: per-resource gap data (allowedCount, usedCount,
 *     gapCount, gapPercent, resourceType, systemName)
 *
 * Sorted by gapPercent desc → biggest offenders first.
 *
 * Honest: gapPercent is a real ratio. We don't fabricate severities
 * for individual resources (the endpoint doesn't carry per-resource
 * severity), but a sort by gap% is itself the criticality lens —
 * highest gap is the highest blast-radius reduction opportunity.
 */

type Resource = {
  id: string
  resourceType: string
  resourceName: string
  systemName?: string
  allowedCount?: number
  usedCount?: number
  gapCount?: number
  gapPercent?: number
  observationDays?: number
}

type IssuesSummary = {
  totalResources?: number
  totalExcessPermissions?: number
  iamIssuesCount?: number
  networkIssuesCount?: number
  s3IssuesCount?: number
  criticalCount?: number
  highCount?: number
}

type IssuesResp = {
  summary?: IssuesSummary
  resources?: Resource[]
  error?: string
}

const TYPE_TINT: Record<string, string> = {
  IAMRole: "bg-violet-50 text-violet-700",
  IAMPolicy: "bg-violet-50 text-violet-700",
  SecurityGroup: "bg-blue-50 text-blue-700",
  S3Bucket: "bg-teal-50 text-teal-700",
}

function gapPillClass(pct: number): string {
  if (pct >= 80) return "rounded-md bg-rose-50 px-2 py-0.5 text-rose-700"
  if (pct >= 50) return "rounded-md bg-amber-50 px-2 py-0.5 text-amber-700"
  if (pct > 0) return "rounded-md bg-slate-100 px-2 py-0.5 text-slate-700"
  return "rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-700"
}

export function LPTopIssuesCard() {
  // Action-driving — strict 10-min staleness. LP issues feed remediation
  // decisions; stale data could route the operator to already-fixed roles.
  const { data, loading, error, retry, isStale, cachedAt } = useCachedFetch<IssuesResp>(
    "/api/proxy/least-privilege/issues",
    {
      cacheKey: "lp-issues",
      maxStaleMs: 60 * 60 * 1000,
      fetchInit: { cache: "no-store" },
    }
  )

  if (loading && !data) return <LoadingCard label="Top least-privilege issues" />
  if (error && !data) return <ErrorCard label="Top least-privilege issues" error={error} onRetry={retry} />
  if (!data) return null

  const summary = data.summary ?? {}
  const resources = (data.resources ?? [])
    .filter((r) => typeof r.gapPercent === "number" && r.gapPercent > 0)
    .sort((a, b) => (b.gapPercent ?? 0) - (a.gapPercent ?? 0))
    .slice(0, 6)

  const headerSummary = (
    <span className="flex items-center gap-2">
      <StaleIndicator cachedAt={cachedAt} isStale={isStale} />
      <span className="text-xs text-slate-500">
        <span className="font-semibold text-rose-700">{summary.criticalCount ?? 0}</span> crit ·{" "}
        <span className="font-semibold text-amber-700">{summary.highCount ?? 0}</span> high
      </span>
    </span>
  )

  if (resources.length === 0) {
    return (
      <Section
        label="Top least-privilege issues"
        descriptor="No resources with non-zero permission gaps"
        className="border-l-[3px] border-l-violet-500"
        right={headerSummary}
      >
        <div className={descriptorClass}>
          {summary.totalResources ?? 0} resources analyzed. None show excess permissions.
        </div>
      </Section>
    )
  }

  return (
    <Section
      label="Top least-privilege issues"
      descriptor={`${summary.totalResources ?? 0} resources · ${summary.totalExcessPermissions ?? 0} excess permissions across IAM (${summary.iamIssuesCount ?? 0}) · SGs (${summary.networkIssuesCount ?? 0}) · S3 (${summary.s3IssuesCount ?? 0})`}
      className="border-l-[3px] border-l-violet-500"
      right={headerSummary}
    >
      <ul className="space-y-2">
        {resources.map((r) => {
          const typeClass = TYPE_TINT[r.resourceType] ?? "bg-slate-100 text-slate-700"
          const pct = r.gapPercent ?? 0
          return (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-md border border-slate-100 bg-slate-50/40 px-3 py-2 text-sm hover:bg-slate-50"
            >
              <span
                className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${typeClass}`}
              >
                {r.resourceType}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-900">
                  {r.resourceName}
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-500">
                  {r.systemName ?? "—"} · {r.gapCount ?? 0} unused / {r.allowedCount ?? 0} total
                </div>
              </div>
              <span
                className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${gapPillClass(pct)}`}
              >
                {pct.toFixed(0)}%
              </span>
            </li>
          )
        })}
      </ul>

      <p className={`${descriptorClass} mt-3 border-t border-slate-100 pt-2`}>
        Sorted by gap% (unused / allowed). Higher = more reduction opportunity.
      </p>
    </Section>
  )
}
