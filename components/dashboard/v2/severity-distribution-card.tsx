import { DashboardCard, DashboardEmptyState } from "./dashboard-card"
import { StatusChip } from "./status-chip"
import { relativeTime, type IssuesSummaryData, type SourceState } from "./use-home-data"

interface SeverityDistributionCardProps {
  state: SourceState<IssuesSummaryData>
  onRetry: () => void
}

const BAR_COLORS: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-amber-500",
  medium: "bg-blue-500",
  low: "bg-slate-400",
}

const LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
}

export function SeverityDistributionCard({ state, onRetry }: SeverityDistributionCardProps) {
  const d: any = state.data
  const critical = numberish(d?.critical, d?.by_severity?.critical)
  const high = numberish(d?.high, d?.by_severity?.high)
  const medium = numberish(d?.medium, d?.by_severity?.medium)
  const low = numberish(d?.low, d?.by_severity?.low)
  const total = critical + high + medium + low
  const declaredTotal = typeof d?.total === "number" ? d.total : total

  const segments = [
    { key: "critical", count: critical },
    { key: "high", count: high },
    { key: "medium", count: medium },
    { key: "low", count: low },
  ]

  return (
    <DashboardCard
      title="Severity distribution"
      description={total > 0 ? `${declaredTotal} active findings` : undefined}
      loading={state.loading}
      error={state.error ?? null}
      onRetry={onRetry}
      freshness={relativeTime(state.fetchedAt)}
    >
      {declaredTotal === 0 ? (
        <DashboardEmptyState
          title="No open findings"
          hint="Neo4j returned no findings for this system."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            {segments.map((s) =>
              s.count > 0 ? (
                <div
                  key={s.key}
                  className={BAR_COLORS[s.key]}
                  style={{ width: `${Math.max(2, (s.count / total) * 100)}%` }}
                  title={`${LABEL[s.key]}: ${s.count}`}
                />
              ) : null,
            )}
          </div>

          <div className="grid grid-cols-4 gap-2">
            {segments.map((s) => (
              <div key={s.key} className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${BAR_COLORS[s.key]}`} />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {LABEL[s.key]}
                  </span>
                </div>
                <div className="text-lg font-semibold tabular-nums text-slate-900">
                  {s.count}
                </div>
              </div>
            ))}
          </div>

          {d?.byCategory?.permissions ? (
            <PermissionFootnote perm={d.byCategory.permissions} />
          ) : null}

          <FindingsByLayer bySource={(d as any)?.by_source ?? (d as any)?.bySource} />
        </div>
      )}
    </DashboardCard>
  )
}

function FindingsByLayer({
  bySource,
}: {
  bySource: Record<string, number> | undefined
}) {
  if (!bySource) return null
  const iam = numberish(bySource.iam, bySource.IAM)
  const sg = numberish(
    bySource.securityGroups,
    bySource.security_groups,
    bySource.sg,
    bySource.network,
  )
  const s3 = numberish(bySource.s3, bySource.S3, bySource.data)
  if (iam === 0 && sg === 0 && s3 === 0) return null

  const layers = [
    { label: "IAM", count: iam, color: "text-blue-700", dot: "bg-blue-500" },
    { label: "Security Groups", count: sg, color: "text-amber-700", dot: "bg-amber-500" },
    { label: "S3", count: s3, color: "text-emerald-700", dot: "bg-emerald-500" },
  ]

  return (
    <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-3">
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
        By remediation layer
      </div>
      <div className="grid grid-cols-3 gap-2">
        {layers.map((l) => (
          <div
            key={l.label}
            className="flex flex-col gap-0.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5"
          >
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${l.dot}`} />
              <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">
                {l.label}
              </span>
            </div>
            <div className={`text-base font-semibold tabular-nums ${l.color}`}>
              {l.count}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PermissionFootnote({
  perm,
}: {
  perm: { allowed?: number; used?: number; unused?: number; gap_percentage?: number }
}) {
  const allowed = perm?.allowed ?? 0
  const unused = perm?.unused ?? 0
  const gap = perm?.gap_percentage
  if (!allowed) return null
  return (
    <div className="border-t border-slate-100 pt-3 text-xs text-slate-600">
      <StatusChip tone="amber">
        {unused}/{allowed} permissions unused
        {typeof gap === "number" ? ` · ${Math.round(gap)}% gap` : ""}
      </StatusChip>
    </div>
  )
}

function numberish(...values: Array<unknown>): number {
  for (const v of values) {
    if (typeof v === "number" && !Number.isNaN(v)) return v
  }
  return 0
}
