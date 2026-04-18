import { DashboardCard, DashboardEmptyState } from "./dashboard-card"
import { relativeTime, type PostureScoreData, type SourceState } from "./use-home-data"

interface PostureGradeCardProps {
  state: SourceState<PostureScoreData>
  onRetry: () => void
}

const DIMENSION_ORDER: Array<keyof NonNullable<PostureScoreData["dimensions"]>> = [
  "least_privilege",
  "network_security",
  "data_protection",
  "compliance",
  "observability",
]

const DIMENSION_LABEL: Record<string, string> = {
  least_privilege: "Least privilege",
  network_security: "Network",
  data_protection: "Data",
  compliance: "Compliance",
  observability: "Observability",
}

const DIMENSION_HINT: Record<string, string> = {
  least_privilege: "% of IAM permissions actually used",
  network_security: "Exposure of security groups / subnets",
  data_protection: "Encryption and public-access on data stores",
  compliance: "CIS / AWS Best Practices rule coverage",
  observability: "CloudTrail + VPC flow log coverage",
}

const GRADE_LABEL: Record<string, string> = {
  A: "Strong",
  B: "Solid",
  C: "Needs attention",
  D: "At risk",
  F: "Critical",
}

export function PostureGradeCard({ state, onRetry }: PostureGradeCardProps) {
  const d = state.data
  const hasData = !!d && typeof d.overall_score === "number" && d.dimensions

  return (
    <DashboardCard
      title="Posture grade"
      description="Weighted 0–100 score across 5 security dimensions"
      loading={state.loading}
      error={state.error ?? null}
      onRetry={onRetry}
      freshness={relativeTime(state.fetchedAt)}
    >
      {!hasData ? (
        <DashboardEmptyState title="Posture unavailable" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <GradeBadge grade={d!.grade ?? "—"} score={d!.overall_score} />
            <div className="flex min-w-0 flex-col">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums text-slate-900">
                  {Math.round(d!.overall_score)}
                </span>
                <span className="text-sm font-medium text-slate-400">/100</span>
              </div>
              <div className="text-xs text-slate-600">
                {GRADE_LABEL[(d!.grade || "").toUpperCase()] ?? "—"}
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 border-t border-slate-100 pt-3">
            {DIMENSION_ORDER.map((key) => {
              const dim = d!.dimensions?.[key]
              if (!dim) return null
              return (
                <DimensionRow
                  key={key}
                  label={DIMENSION_LABEL[key] ?? key}
                  hint={DIMENSION_HINT[key]}
                  score={dim.score}
                />
              )
            })}
          </div>
        </div>
      )}
    </DashboardCard>
  )
}

function GradeBadge({ grade, score }: { grade: string; score: number }) {
  const tone = gradeTone(grade, score)
  const bg =
    tone === "green"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "amber"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-red-50 text-red-700 border-red-200"
  return (
    <div
      className={`flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-[14px] border text-3xl font-semibold tabular-nums ${bg}`}
      title={`Overall posture score ${Math.round(score)}/100`}
    >
      {grade}
    </div>
  )
}

function gradeTone(grade: string, score: number): "green" | "amber" | "red" {
  const g = (grade || "").toUpperCase()
  if (g === "A" || g === "B") return "green"
  if (g === "C") return "amber"
  if (g === "D" || g === "F") return "red"
  if (score >= 80) return "green"
  if (score >= 60) return "amber"
  return "red"
}

function DimensionRow({
  label,
  hint,
  score,
}: {
  label: string
  hint?: string
  score: number
}) {
  const pct = Math.max(0, Math.min(100, score))
  const bar =
    pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500"

  return (
    <div className="flex items-center gap-3" title={hint}>
      <div className="w-24 shrink-0">
        <div className="text-xs text-slate-700">{label}</div>
        {hint ? (
          <div className="truncate text-[10px] text-slate-500">{hint}</div>
        ) : null}
      </div>
      <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-7 shrink-0 text-right text-xs font-medium tabular-nums text-slate-700">
        {Math.round(score)}
      </div>
    </div>
  )
}
