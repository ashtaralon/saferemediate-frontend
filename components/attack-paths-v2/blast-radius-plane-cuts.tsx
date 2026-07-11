"use client"

/**
 * BlastRadiusPlaneCuts — Shared Dependency Plane + Recommended Cuts.
 * Light theme — matches Attack Paths shell.
 */

import { useCachedFetch } from "@/lib/use-cached-fetch"

interface DependencyItem {
  jewel_type: string
  reachable_observed?: number | null
  reachable_via_path?: number | null
  observed_sources?: number | null
  observed_edges?: number | null
  delete_capable_paths?: number | null
  write_capable_paths?: number | null
  protects_crown_jewels?: number | null
}
interface RecommendedCut {
  rank: number
  role_name?: string | null
  workload_name?: string | null
  closes_paths?: number | null
  reachable_after?: number | null
  remove_actions?: string[] | null
  confidence?: string | null
  is_aws_managed?: boolean | null
}
interface PlaneCutsPayload {
  dependency_plane: DependencyItem[]
  recommended_cuts: RecommendedCut[]
}

const JEWEL_LABEL: Record<string, string> = {
  S3Bucket: "S3",
  DynamoDBTable: "DynamoDB",
  KMSKey: "KMS",
  SecretsManagerSecret: "Secrets Mgr",
  RDSInstance: "RDS",
}

const CONF_TONE: Record<string, string> = {
  high: "text-emerald-800 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  medium: "text-amber-800 dark:text-amber-300 border-amber-500/30 bg-amber-500/10",
  low: "text-muted-foreground border-border bg-muted/50",
}

function Capability({ n, label, tone }: { n?: number | null; label: string; tone: string }) {
  if (!n) return null
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${tone}`}>
      {n} {label}
    </span>
  )
}

export function BlastRadiusPlaneCuts({ systemName }: { systemName: string }) {
  const url = systemName
    ? `/api/proxy/business-system/${encodeURIComponent(systemName)}/blast-radius`
    : null
  const { data, loading, error, retry } = useCachedFetch<PlaneCutsPayload>(url, {
    cacheKey: `blast-radius:${systemName}`,
  })

  if (loading && !data) {
    return (
      <div className="rounded-xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
        Loading dependency plane…
      </div>
    )
  }
  if (error && !data) {
    return (
      <div className="rounded-xl border border-border bg-card px-5 py-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Couldn’t load the dependency plane.</span>
        <button
          type="button"
          onClick={retry}
          className="text-sm text-primary hover:underline underline-offset-2"
        >
          Retry
        </button>
      </div>
    )
  }
  if (!data) return null

  const plane = data.dependency_plane ?? []
  const cuts = data.recommended_cuts ?? []

  return (
    <div className="flex flex-col gap-4">
      {plane.length > 0 && (
        <section className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <header className="px-5 pt-4 pb-2 border-b border-border/60">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">
              Shared Dependency Plane
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              reached via IAM roles — not inside a VPC
            </p>
          </header>
          <ul className="divide-y divide-border">
            {plane.map((d) => (
              <li
                key={d.jewel_type}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3"
              >
                <span className="text-sm font-semibold text-foreground min-w-[6rem]">
                  {JEWEL_LABEL[d.jewel_type] ?? d.jewel_type}
                </span>
                {typeof d.reachable_observed === "number" ? (
                  <span className="text-sm tabular-nums text-red-700 dark:text-red-400 font-medium">
                    {d.reachable_observed} reachable
                  </span>
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  <Capability
                    n={d.delete_capable_paths}
                    label="delete-capable"
                    tone="text-red-800 dark:text-red-300 border border-red-500/25 bg-red-500/10"
                  />
                  <Capability
                    n={d.write_capable_paths}
                    label="write-capable"
                    tone="text-amber-900 dark:text-amber-300 border border-amber-500/25 bg-amber-500/10"
                  />
                  {d.protects_crown_jewels ? (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-medium text-violet-800 dark:text-violet-300 border border-violet-500/25 bg-violet-500/10">
                      protects {d.protects_crown_jewels} jewels
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cuts.length > 0 && (
        <section className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <header className="px-5 pt-4 pb-2 border-b border-border/60">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">
              Recommended Cuts
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              ranked by reachable-damage reduction
            </p>
          </header>
          <ul className="divide-y divide-border">
            {cuts.map((c) => (
              <li key={`${c.rank}-${c.role_name ?? c.workload_name}`} className="px-5 py-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[11px] tabular-nums text-muted-foreground">{c.rank}</span>
                  <span className="text-sm font-semibold text-foreground">
                    Restrict {c.role_name ?? c.workload_name}
                  </span>
                  {c.is_aws_managed ? (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1 bg-muted/40">
                      AWS-managed
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                  {typeof c.closes_paths === "number" ? (
                    <span className="text-emerald-700 dark:text-emerald-400">
                      closes{" "}
                      <span className="tabular-nums font-semibold">{c.closes_paths}</span> paths
                    </span>
                  ) : null}
                  {c.remove_actions?.length ? (
                    <span className="text-muted-foreground">
                      removes{" "}
                      <span className="tabular-nums font-medium">{c.remove_actions.length}</span>{" "}
                      unused actions
                    </span>
                  ) : null}
                  {c.confidence ? (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide border ${
                        CONF_TONE[c.confidence.toLowerCase()] ?? CONF_TONE.low
                      }`}
                    >
                      conf {c.confidence}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
