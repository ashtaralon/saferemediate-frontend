"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Crown, Route } from "lucide-react"
import { DashboardCard, DashboardEmptyState } from "./dashboard-card"
import { StatusChip } from "./status-chip"
import {
  relativeTime,
  type IdentityAttackPathsData,
  type SourceState,
} from "./use-home-data"

interface IdentityAttackPathsQueueProps {
  state: SourceState<IdentityAttackPathsData>
  onRetry: () => void
  maxVisible?: number
}

interface RichPath {
  id?: string
  crown_jewel_id?: string
  // Backend returns severity either as a string ("MEDIUM") OR as a scoring object
  // { overall_score: number, severity: "MEDIUM", impact, ... }. Handle both via getSeverityLabel.
  severity?: string | { severity?: string; overall_score?: number; [k: string]: any }
  hop_count?: number
  evidence_type?: string
  path_kind?: string
  target_blast_radius?: number
  risk_reduction?: number
  nodes?: Array<{ id?: string; name?: string; type?: string; tier?: string; lane?: string; is_internet_exposed?: boolean }>
}

function getSeverityLabel(severity: RichPath["severity"] | undefined): string {
  if (!severity) return ""
  if (typeof severity === "string") return severity.toUpperCase()
  if (typeof severity === "object" && typeof severity.severity === "string") {
    return severity.severity.toUpperCase()
  }
  return ""
}

function getSeverityScore(severity: RichPath["severity"] | undefined): number | null {
  if (severity && typeof severity === "object" && typeof severity.overall_score === "number") {
    return severity.overall_score
  }
  return null
}

interface Jewel {
  id?: string
  name?: string
  type?: string
  severity?: string
  path_count?: number
  priority_score?: number
  is_internet_exposed?: boolean
}

export function IdentityAttackPathsQueue({
  state,
  onRetry,
  maxVisible = 5,
}: IdentityAttackPathsQueueProps) {
  const router = useRouter()
  const raw: any = state.data
  const paths: RichPath[] = raw?.paths ?? raw?.attack_paths ?? []
  const jewels: Jewel[] = raw?.crown_jewels ?? []
  const jewelById = useMemo(() => {
    const m = new Map<string, Jewel>()
    for (const j of jewels) if (j.id) m.set(j.id, j)
    return m
  }, [jewels])

  const ranked = useMemo(() => rankPaths(paths), [paths])
  const visible = ranked.slice(0, maxVisible)
  const hiddenCount = ranked.length - visible.length
  const totalPaths = raw?.total_paths ?? paths.length
  const exposedJewels = raw?.exposed_jewels ?? 0
  const totalJewels = raw?.total_jewels ?? jewels.length

  return (
    <DashboardCard
      title="Top identity attack paths"
      description={
        totalPaths > 0
          ? `${totalPaths} paths · ${exposedJewels}/${totalJewels} crown jewels exposed`
          : undefined
      }
      loading={state.loading}
      error={state.error ?? null}
      onRetry={onRetry}
      freshness={relativeTime(state.fetchedAt)}
      action={
        totalPaths > 0 ? (
          <button
            type="button"
            onClick={() => router.push("/?section=attack-paths")}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            View all
          </button>
        ) : null
      }
    >
      {ranked.length === 0 ? (
        <DashboardEmptyState
          title="No attack paths detected"
          hint="Neo4j has no ACTUAL_TRAFFIC edges from identities to crown jewels for this system."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((p, idx) => (
            <PathRow
              key={p.id ?? idx}
              path={p}
              jewel={p.crown_jewel_id ? jewelById.get(p.crown_jewel_id) : undefined}
              onInvestigate={() =>
                router.push(`/?section=attack-paths&path=${encodeURIComponent(p.id ?? "")}`)
              }
            />
          ))}
          {hiddenCount > 0 ? (
            <div className="pt-1 text-xs text-slate-500">
              +{hiddenCount} more paths
            </div>
          ) : null}
        </div>
      )}
    </DashboardCard>
  )
}

function PathRow({
  path,
  jewel,
  onInvestigate,
}: {
  path: RichPath
  jewel: Jewel | undefined
  onInvestigate: () => void
}) {
  const severity = getSeverityLabel(path.severity) || (jewel?.severity || "").toUpperCase()
  const overallScore = getSeverityScore(path.severity)
  const tone =
    severity === "CRITICAL" ? "red" : severity === "HIGH" ? "red" : severity === "MEDIUM" ? "amber" : "blue"

  const nodes = path.nodes ?? []
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  const middle = nodes.length > 2 ? nodes.slice(1, -1) : []

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 transition-colors hover:bg-slate-50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Crown className="h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
            <div className="truncate text-sm font-medium text-slate-900">
              {jewel?.name || path.crown_jewel_id || "Crown jewel"}
            </div>
            {severity ? (
              <StatusChip tone={tone}>
                {severity}
                {overallScore !== null ? ` · ${Math.round(overallScore)}` : ""}
              </StatusChip>
            ) : null}
            {jewel?.is_internet_exposed ? (
              <StatusChip tone="red">internet-exposed</StatusChip>
            ) : null}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-600">
            {first ? <NodeChip node={first} /> : null}
            {middle.length > 0 ? (
              <>
                <ArrowRight className="h-3 w-3 text-slate-400" />
                <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-slate-600">
                  +{middle.length} hop{middle.length === 1 ? "" : "s"}
                </span>
              </>
            ) : null}
            {last && last !== first ? (
              <>
                <ArrowRight className="h-3 w-3 text-slate-400" />
                <NodeChip node={last} />
              </>
            ) : null}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {typeof path.hop_count === "number" ? (
              <StatusChip tone="neutral">
                <Route className="h-2.5 w-2.5" />
                {path.hop_count} hops
              </StatusChip>
            ) : null}
            {path.evidence_type ? (
              <StatusChip tone="neutral">evidence · {path.evidence_type}</StatusChip>
            ) : null}
            {typeof path.target_blast_radius === "number" && path.target_blast_radius > 0 ? (
              <StatusChip tone="amber">blast {path.target_blast_radius}</StatusChip>
            ) : null}
            {typeof path.risk_reduction === "number" && path.risk_reduction > 0 ? (
              <StatusChip tone="green">−{path.risk_reduction} on fix</StatusChip>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={onInvestigate}
          className="flex-shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Investigate
        </button>
      </div>
    </div>
  )
}

function NodeChip({ node }: { node: NonNullable<RichPath["nodes"]>[number] }) {
  return (
    <span className="inline-flex max-w-[200px] items-center gap-1 truncate rounded border border-slate-200 bg-white px-1.5 py-0.5 text-slate-700">
      <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
        {node.tier || node.type || "node"}
      </span>
      <span className="truncate">{node.name || node.id || "—"}</span>
    </span>
  )
}

function rankPaths(paths: RichPath[]): RichPath[] {
  const sevOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
  return [...paths].sort((a, b) => {
    const sa = sevOrder[getSeverityLabel(a.severity)] ?? 4
    const sb = sevOrder[getSeverityLabel(b.severity)] ?? 4
    if (sa !== sb) return sa - sb
    const scoreA = getSeverityScore(a.severity) ?? 0
    const scoreB = getSeverityScore(b.severity) ?? 0
    if (scoreA !== scoreB) return scoreB - scoreA
    const br = (b.target_blast_radius ?? 0) - (a.target_blast_radius ?? 0)
    if (br !== 0) return br
    return (b.risk_reduction ?? 0) - (a.risk_reduction ?? 0)
  })
}
