import { DashboardCard, DashboardEmptyState } from "./dashboard-card"
import { relativeTime, type EnforcementScoreData, type SourceState } from "./use-home-data"

interface EnforcementScoreCardProps {
  state: SourceState<EnforcementScoreData>
  onRetry: () => void
}

export function EnforcementScoreCard({ state, onRetry }: EnforcementScoreCardProps) {
  const d = state.data
  const hasRealScore =
    !!d && !d.error && (d.customerScore > 0 || (d.actions?.length ?? 0) > 0)
  const improvement = d?.projected?.improvement ?? 0
  const projectedScore = d?.projected?.customerScore ?? 0
  const layers = d?.layers

  return (
    <DashboardCard
      title="Enforcement score"
      loading={state.loading}
      error={state.error ?? d?.error ?? null}
      onRetry={onRetry}
      freshness={relativeTime(state.fetchedAt)}
    >
      {!hasRealScore ? (
        <DashboardEmptyState
          title="Score not yet computed for this system"
          hint="Backend scoring returned empty payload — confirm the system name matches what exists in Neo4j."
        />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-baseline gap-2">
            <span className="text-7xl font-semibold tabular-nums leading-none tracking-tight text-slate-900">
              {d!.customerScore}
            </span>
            <span className="text-xl font-medium text-slate-400">/100</span>
            {improvement > 0 ? (
              <span className="ml-auto text-sm font-medium text-emerald-700">
                +{improvement} → {projectedScore}
              </span>
            ) : null}
          </div>

          {layers ? (
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <LayerMini label="Privilege" layer={layers.privilege} />
              <div className="h-6 w-px bg-slate-100" />
              <LayerMini label="Network" layer={layers.network} />
              <div className="h-6 w-px bg-slate-100" />
              <LayerMini label="Data" layer={layers.data} />
            </div>
          ) : null}

          <EnforcementTiers tiers={d!.enforcementTiers} />

          {d!.impact?.riskStatement || d!.impact?.primaryDriver ? (
            <div className="border-t border-slate-100 pt-3 text-xs leading-snug text-slate-600">
              {d!.impact?.primaryDriver ? (
                <span className="mr-1 font-medium text-slate-700">
                  {d!.impact.primaryDriver}:
                </span>
              ) : null}
              {d!.impact?.riskStatement}
            </div>
          ) : null}
        </div>
      )}
    </DashboardCard>
  )
}

function EnforcementTiers({
  tiers,
}: {
  tiers: EnforcementScoreData["enforcementTiers"] | undefined
}) {
  if (!tiers) return null
  const strong = tiers.strongly_enforced ?? 0
  const gaps = tiers.enforced_with_gaps ?? 0
  const weak = tiers.weakly_enforced ?? 0
  const crit = tiers.critically_exposed ?? 0
  const total = strong + gaps + weak + crit
  if (total === 0) return null

  const segments = [
    { key: "strong", count: strong, label: "Strong", color: "bg-emerald-500" },
    { key: "gaps", count: gaps, label: "With gaps", color: "bg-amber-500" },
    { key: "weak", count: weak, label: "Weak", color: "bg-orange-500" },
    { key: "crit", count: crit, label: "Exposed", color: "bg-red-500" },
  ]

  return (
    <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
          Enforcement tiers
        </div>
        <div className="text-[10px] text-slate-500">{total} resources</div>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
        {segments.map((s) =>
          s.count > 0 ? (
            <div
              key={s.key}
              className={s.color}
              style={{ width: `${Math.max(2, (s.count / total) * 100)}%` }}
              title={`${s.label}: ${s.count}`}
            />
          ) : null,
        )}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-slate-600">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${s.color}`} />
            <span className="tabular-nums">{s.count}</span>
            <span className="text-slate-500">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LayerMini({ label, layer }: { label: string; layer: any }) {
  const score = typeof layer?.score === "number" ? layer.score : null
  const color =
    score === null
      ? "text-slate-400"
      : score >= 85
        ? "text-emerald-700"
        : score >= 60
          ? "text-amber-700"
          : "text-red-700"

  return (
    <div className="flex flex-1 flex-col items-center gap-0.5">
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <span className={`text-base font-semibold tabular-nums ${color}`}>
        {score !== null ? score : "—"}
      </span>
    </div>
  )
}
