import { DashboardCard } from "./dashboard-card"
import { StatusChip } from "./status-chip"
import {
  relativeTime,
  type IssuesSummaryData,
  type PostureScoreData,
  type SourceState,
} from "./use-home-data"

interface CoverageStripProps {
  posture: SourceState<PostureScoreData>
  issues: SourceState<IssuesSummaryData>
}

export function CoverageStrip({ posture, issues }: CoverageStripProps) {
  const p = posture.data
  const obs = p?.dimensions?.observability
  const obsScore = typeof obs?.score === "number" ? Math.round(obs.score) : null
  const obsDetails: any = obs?.details ?? null
  const flow = obsDetails?.with_flow_logs
  const cloudtrail = obsDetails?.with_cloudtrail
  const totalRes = obsDetails?.total_resources

  const issuesTs = issues.data?.timestamp ?? null
  const postureTs = (posture.data as any)?.timestamp ?? null

  const loadingAny = posture.loading || issues.loading

  return (
    <DashboardCard title="Evidence coverage" contentClassName="py-3">
      {loadingAny && !p && !issues.data ? (
        <div className="text-sm text-slate-500">Loading evidence sources…</div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {obsScore !== null ? (
            <StatusChip tone={obsScore >= 80 ? "green" : obsScore >= 50 ? "amber" : "red"}>
              Observability {obsScore}/100
            </StatusChip>
          ) : (
            <StatusChip tone="neutral">Observability unknown</StatusChip>
          )}

          {typeof flow === "number" && typeof totalRes === "number" && totalRes > 0 ? (
            <StatusChip tone={flow === totalRes ? "green" : flow > 0 ? "amber" : "red"}>
              VPC flow logs {flow}/{totalRes}
            </StatusChip>
          ) : null}

          {typeof cloudtrail === "number" && typeof totalRes === "number" && totalRes > 0 ? (
            <StatusChip
              tone={cloudtrail === totalRes ? "green" : cloudtrail > 0 ? "amber" : "red"}
            >
              CloudTrail {cloudtrail}/{totalRes}
            </StatusChip>
          ) : null}

          {issuesTs ? (
            <StatusChip tone="neutral">Issues {relativeTime(issuesTs)}</StatusChip>
          ) : null}

          {postureTs ? (
            <StatusChip tone="neutral">Posture {relativeTime(postureTs)}</StatusChip>
          ) : null}

          {posture.error ? <StatusChip tone="red">Posture error</StatusChip> : null}
          {issues.error ? <StatusChip tone="red">Issues error</StatusChip> : null}
        </div>
      )}
    </DashboardCard>
  )
}
