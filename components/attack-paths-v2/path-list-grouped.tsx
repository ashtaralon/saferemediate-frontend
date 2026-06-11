"use client"

// Path list grouped by source-type. Per the 2026-05-21 design discussion,
// operators think "I have a Lambda problem" vs "I have an EC2 problem"
// before they think about severity — so the primary grouping is source
// type, with paths inside each group ranked by severity.
//
// Source-type classification is from the FIRST node on the path (the
// entry node, tier='entry'). Common starts: Lambda, EC2, Principal
// (CloudTrail IAM activity), HumanIdentity, IAMUser, ExternalIP. Less
// common: StepFunction, ECSTask. Anything we can't classify falls into
// "OTHER" — operator-visible so they can flag mis-classification.

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Server, Zap, Cloud, User, Globe, Box, Crown, Database, AlertOctagon } from "lucide-react"
import type {
  IdentityAttackPath,
  CrownJewelSummary,
  PathNodeDetail,
} from "@/components/identity-attack-paths/types"
import { isPrincipalNodeType } from "@/components/identity-attack-paths/types"
import type { ActivePathList } from "@/lib/active-filters"
import { MaterializedScopeBadge } from "./materialized-scope-badge"
import { PathComparisonTable } from "./path-comparison-table"
import { pathDamageSummary, pathTopFixLabel } from "./path-damage-summary"

interface PathListGroupedProps {
  // ActivePathList enforces at compile time that the caller passed
  // this array through filterActivePaths. See lib/active-filters.ts.
  paths: ActivePathList<IdentityAttackPath>
  jewel: CrownJewelSummary | null
  selectedPathId: string | null
  onSelectPath: (pathId: string) => void
}

// Bucket → operator-readable label + icon + color tone. The bucket
// names are operator-facing (not raw AWS labels) per the design
// principle that internal labels leak the integration list. "From
// External" reads better than "From CloudTrailPrincipal".
const SOURCE_BUCKETS: Record<
  string,
  { label: string; icon: any; tone: string }
> = {
  root: { label: "FROM ROOT CREDENTIALS", icon: AlertOctagon, tone: "text-red-600 dark:text-red-400" },
  lambda: { label: "FROM LAMBDA", icon: Zap, tone: "text-orange-600 dark:text-orange-400" },
  ec2: { label: "FROM EC2", icon: Server, tone: "text-blue-600 dark:text-blue-400" },
  ecs: { label: "FROM ECS / CONTAINER", icon: Box, tone: "text-sky-600 dark:text-sky-400" },
  human: { label: "FROM HUMAN USER", icon: User, tone: "text-emerald-600 dark:text-emerald-400" },
  external: { label: "FROM EXTERNAL", icon: Globe, tone: "text-red-600 dark:text-red-400" },
  external_account: { label: "FROM EXTERNAL ACCOUNT", icon: Globe, tone: "text-red-600 dark:text-red-400" },
  service: { label: "FROM AWS SERVICE", icon: Cloud, tone: "text-violet-600 dark:text-violet-400" },
  database: { label: "FROM DATABASE", icon: Database, tone: "text-purple-600 dark:text-purple-400" },
  other: { label: "FROM OTHER", icon: Box, tone: "text-muted-foreground" },
}

function nodeTypeBucket(type: string | undefined): keyof typeof SOURCE_BUCKETS | null {
  const t = (type || "").toLowerCase()
  if (t.includes("lambda")) return "lambda"
  if (t.includes("ec2")) return "ec2"
  if (t.includes("ecs") || t.includes("container") || t.includes("eks") || t === "fargate") return "ecs"
  if (t.includes("human") || t === "iamuser") return "human"
  if (t === "rdsinstance" || t.includes("dynamodb") || t.includes("redshift") || t.includes("elasticache")) return "database"
  return null
}

// Classify a path's "source" for grouping. Real path shape is:
//   node[0] = CloudTrailPrincipal (the identity that authenticated)
//   node[1] = workload that carries the role (EC2 / Lambda / etc)
//   node[2..] = network gates / role / target
//
// The operator-meaningful "source" is the WORKLOAD (node 1) because
// that's the resource they'd remediate. Node 0 being CloudTrailPrincipal
// is shared across most paths so grouping by it tells you nothing.
//
// Special cases that override:
//   - CloudTrailPrincipal.name = 'root' → FROM ROOT (operator-critical signal)
//   - CloudTrailPrincipal carries an external-account ARN → FROM EXTERNAL ACCOUNT
//   - Workload node missing → fall back to node-0 type
function classifySource(nodes: PathNodeDetail[] | undefined): keyof typeof SOURCE_BUCKETS {
  if (!nodes || nodes.length === 0) return "other"
  const first = nodes[0]
  const second = nodes[1]

  // Root-credential signal — surface as its own bucket so operators
  // see it instantly. Two paths with "root" as the principal name on
  // alon-prod today; the design doc specifically calls this out as
  // the kind of finding the page should NOT bury.
  // Post 2026-05-22 canonical-type fix: root arrives as AWSPrincipal
  // (was CloudTrailPrincipal); the type check is widened to any
  // principal-like wrapper so the bucket keeps catching it.
  if (isPrincipalNodeType(first.type) && first.name === "root") {
    return "root"
  }

  // External-account principal — an ARN that's not from the same
  // account as the path's TARGET landed on a workload here. Sprint 4
  // territory (cross-account).
  //
  // 2026-05-30: removed hardcoded "745783559495" reference account
  // (was Cyntro's demo customer). The path's target node carries its
  // own account id in the ARN; we derive the reference from there.
  // On multi-tenant deploys this means cross-account detection just
  // works without per-customer config — service-agnostic by
  // construction.
  if (isPrincipalNodeType(first.type) && /^arn:aws:[^:]+:[^:]*:(\d+):/.test(first.id || "")) {
    const acct = (first.id.match(/^arn:aws:[^:]+:[^:]*:(\d+):/) || [])[1]
    // Reference account: walk the path looking for any ARN-bearing
    // node and pull its account id. Skip the principal node itself.
    // Falls back to "no detection" rather than guessing if the path
    // has no ARN-bearing node.
    let refAccount: string | null = null
    for (let i = 1; i < nodes.length; i++) {
      const m = (nodes[i].id || "").match(/^arn:aws:[^:]+:[^:]*:(\d+):/)
      if (m) {
        refAccount = m[1]
        break
      }
    }
    if (acct && refAccount && acct !== refAccount) return "external_account"
  }

  // The workload carrying the role is the operator-meaningful source.
  const fromWorkload = nodeTypeBucket(second?.type)
  if (fromWorkload) return fromWorkload

  // Fall back to the first node type when there's no workload on node 1.
  const fromFirst = nodeTypeBucket(first.type)
  if (fromFirst) return fromFirst

  // CloudTrailPrincipal with no workload → AWS service identity.
  const t = (first.type || "").toLowerCase()
  if (t.includes("principal") || t === "awsprincipal" || t === "cloudtrailprincipal") {
    return "service"
  }
  if (t.includes("external") || t === "internet" || t === "cidrblock") return "external"
  return "other"
}

// Severity → tone for the per-path chip. Theme-aware (light + dark)
// and aligned with FindingCard's severity palette. Phase 2 will hoist
// this into a shared *_CONFIG export in lib/types.ts.
function severityTone(level?: string) {
  const l = (level || "").toLowerCase()
  if (l === "critical") return "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300"
  if (l === "high") return "bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-300"
  if (l === "medium") return "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
  if (l === "low") return "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
  return "bg-muted border-border text-muted-foreground"
}

export function PathListGrouped({
  paths,
  jewel,
  selectedPathId,
  onSelectPath,
}: PathListGroupedProps) {
  // Compute observed-hit total per path — the sum of hit_count across
  // every observed edge on the path. This is the OPERATOR-MEANINGFUL
  // ranking: a path with 11 CloudTrail-observed accesses is a bigger
  // attack than a path with 2.
  //
  // 2026-05-22 audit fix: previously sorted by severity.overall_score,
  // which is a synthesized 6-factor score that didn't correlate with
  // observed traffic. Result: the 11-hit alon-demo-ec2-role path was
  // listed BELOW the 2-hit cyntro-demo-ec2-s3-role path because of
  // synthetic-score arithmetic. Operator clicked the top one and saw
  // the LOWEST-traffic chain. Sorting by observed hits surfaces the
  // real "biggest door" first.
  const observedHits = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of paths) {
      let total = 0
      for (const e of p.edges ?? []) {
        if (e.is_observed) total += e.hit_count ?? 0
      }
      map.set(p.id, total)
    }
    return map
  }, [paths])

  // Group paths by source bucket. Each bucket holds its paths sorted
  // descending by OBSERVED HIT COUNT (real CloudTrail/flow-log evidence)
  // then by severity, then by hop count.
  const grouped = useMemo(() => {
    const buckets = new Map<keyof typeof SOURCE_BUCKETS, IdentityAttackPath[]>()
    for (const p of paths) {
      const bucket = classifySource(p.nodes)
      if (!buckets.has(bucket)) buckets.set(bucket, [])
      buckets.get(bucket)!.push(p)
    }
    // Sort within bucket — observed hits desc, then severity desc, then hop asc
    for (const list of buckets.values()) {
      list.sort((a, b) => {
        const ha = observedHits.get(a.id) ?? 0
        const hb = observedHits.get(b.id) ?? 0
        if (hb !== ha) return hb - ha
        const sa = a.severity?.overall_score ?? 0
        const sb = b.severity?.overall_score ?? 0
        if (sb !== sa) return sb - sa
        return (a.hop_count ?? 0) - (b.hop_count ?? 0)
      })
    }
    // Order buckets by highest-hit-path in each (so the bucket containing
    // the busiest path appears first, regardless of bucket population).
    return Array.from(buckets.entries()).sort((a, b) => {
      const maxA = Math.max(...a[1].map((p) => observedHits.get(p.id) ?? 0), 0)
      const maxB = Math.max(...b[1].map((p) => observedHits.get(p.id) ?? 0), 0)
      if (maxB !== maxA) return maxB - maxA
      return b[1].length - a[1].length
    })
  }, [paths, observedHits])

  // All groups start expanded. Operator can collapse to focus.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleGroup = (bucket: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(bucket)) next.delete(bucket)
      else next.add(bucket)
      return next
    })
  }

  if (paths.length === 0) {
    // Accuracy-audit F1 (2026-06-11): distinguish "graph says zero
    // materialized paths" (honest not-computed state) from "no paths
    // today". The synthesized list is suppressed backend-side for
    // not-computed jewels so the list and closure layer can't disagree.
    if (jewel?.paths_not_computed) {
      return (
        <div className="px-4 py-6">
          <div className="text-xs text-muted-foreground">
            Attack paths for{" "}
            <span className="font-mono text-foreground">{jewel?.name ?? "this jewel"}</span>{" "}
            have not been computed yet.
          </div>
          <div className="text-[11px] text-muted-foreground mt-1.5">
            No materialized attack-path evidence exists in the graph for this
            jewel. Run the attack-path materializer (Phase 3) to compute them —
            nothing is shown rather than showing unverified paths.
          </div>
        </div>
      )
    }
    return (
      <div className="px-4 py-6">
        <div className="text-xs text-muted-foreground">
          No attack paths to <span className="font-mono text-foreground">{jewel?.name ?? "this jewel"}</span> today.
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Jewel header — context for what the path list is about */}
      <div className="px-4 py-3 border-b border-border sticky top-0 bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2">
          <Crown className="h-3.5 w-3.5 text-amber-500" />
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            PATHS TO
          </div>
        </div>
        <div className="text-sm font-mono font-semibold text-foreground truncate mt-0.5" title={jewel?.name}>
          {jewel?.name ?? "—"}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            {paths.length} path{paths.length === 1 ? "" : "s"} ·{" "}
            {grouped.length} source type{grouped.length === 1 ? "" : "s"}
          </span>
          <MaterializedScopeBadge
            surfaced={paths.length}
            graphTotal={jewel?.materialized_path_count}
          />
        </div>
      </div>

      <PathComparisonTable
        paths={paths}
        selectedPathId={selectedPathId}
        onSelectPath={onSelectPath}
      />

      {/* Grouped path list */}
      <div className="divide-y divide-border">
        {grouped.map(([bucket, bucketPaths]) => {
          const meta = SOURCE_BUCKETS[bucket]
          const Icon = meta.icon
          const isCollapsed = collapsed.has(bucket as string)
          return (
            <div key={bucket as string} className="">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(bucket as string)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-accent/50 transition-colors"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <Icon className={`h-3.5 w-3.5 ${meta.tone}`} />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                  {meta.label}
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {bucketPaths.length}
                </span>
              </button>

              {/* Group contents */}
              {!isCollapsed && (
                <div className="pl-2 pb-2">
                  {bucketPaths.map((p, idxInBucket) => {
                    const isSelected = p.id === selectedPathId
                    // Operator-meaningful "start" — first node that isn't a
                    // principal-like wrapper (CTP/AWSPrincipal/etc). Falls
                    // back to node 0. Post 2026-05-22 the entry node may
                    // arrive as type AWSPrincipal or IAMRole (STS session
                    // with role label) — widen via isPrincipalNodeType
                    // so the first real workload is still picked.
                    const start =
                      p.nodes?.find((n) => !isPrincipalNodeType(n.type)) ??
                      p.nodes?.[0]
                    const target = p.nodes?.[p.nodes.length - 1]
                    const sevLabel = p.severity?.severity?.toUpperCase() ?? "—"
                    const sevScore = p.severity?.overall_score
                    const hits = observedHits.get(p.id) ?? 0
                    // Top-of-bucket marker — flag the path with the
                    // most observed traffic so operators don't need to
                    // squint at every hit-count chip.
                    const isTopOfBucket = idxInBucket === 0 && hits > 0
                    return (
                      <button
                        key={p.id}
                        onClick={() => onSelectPath(p.id)}
                        className={`w-full text-left rounded-lg px-3 py-2 mx-2 mb-1 transition-colors border ${
                          isSelected
                            ? "bg-primary/10 border-primary/40"
                            : "bg-transparent border-transparent hover:bg-accent/50 hover:border-border"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wider rounded border px-1.5 py-0.5 ${severityTone(p.severity?.severity)}`}>
                            {sevLabel}
                            {sevScore !== undefined && sevScore !== null && (
                              <span className="ml-1 opacity-80">{sevScore}</span>
                            )}
                          </span>
                          {/* Observed-hit chip — surfaces the real
                              CloudTrail/flow-log volume per path. The
                              alon-demo-ec2-role path (11 hits) now shows
                              the same as cyntro-demo-ec2-s3-role (2
                              hits) at a glance. */}
                          {hits > 0 && (
                            <span
                              className="inline-flex items-center text-[9px] font-semibold rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5"
                              title={`${hits} CloudTrail/flow-log events observed across this path`}
                            >
                              {hits.toLocaleString()} hits
                            </span>
                          )}
                          {isTopOfBucket && (
                            <span
                              className="inline-flex items-center text-[9px] font-semibold uppercase tracking-wider rounded border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-1.5 py-0.5"
                              title="Highest observed traffic in this source bucket — most likely the real attack route"
                            >
                              top
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {p.hop_count} hop{p.hop_count === 1 ? "" : "s"}
                          </span>
                          {p.evidence_type === "observed" && hits === 0 && (
                            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                              observed (no hit count)
                            </span>
                          )}
                          {p.materialized_stale && (
                            <span
                              className="inline-flex items-center text-[9px] font-semibold uppercase tracking-wider rounded border border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300 px-1.5 py-0.5"
                              title={p.stale_reason ?? "Workload inactive — graph path retained for audit"}
                            >
                              inactive workload
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-foreground font-mono truncate">
                          {start?.name ?? start?.id ?? "—"}{" "}
                          <span className="text-muted-foreground">→</span>{" "}
                          <span className="text-muted-foreground">{target?.name ?? "jewel"}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
                          <span className="text-muted-foreground">
                            Damage: <span className="text-foreground">{pathDamageSummary(p)}</span>
                          </span>
                          {pathTopFixLabel(p) !== "—" && (
                            <span className="text-emerald-600 dark:text-emerald-400 truncate max-w-[180px]" title={pathTopFixLabel(p)}>
                              → {pathTopFixLabel(p)}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
