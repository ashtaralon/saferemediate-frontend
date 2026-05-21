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

interface PathListGroupedProps {
  paths: IdentityAttackPath[]
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
  root: { label: "FROM ROOT CREDENTIALS", icon: AlertOctagon, tone: "text-red-300" },
  lambda: { label: "FROM LAMBDA", icon: Zap, tone: "text-orange-300" },
  ec2: { label: "FROM EC2", icon: Server, tone: "text-blue-300" },
  ecs: { label: "FROM ECS / CONTAINER", icon: Box, tone: "text-sky-300" },
  human: { label: "FROM HUMAN USER", icon: User, tone: "text-emerald-300" },
  external: { label: "FROM EXTERNAL", icon: Globe, tone: "text-red-300" },
  external_account: { label: "FROM EXTERNAL ACCOUNT", icon: Globe, tone: "text-red-300" },
  service: { label: "FROM AWS SERVICE", icon: Cloud, tone: "text-violet-300" },
  database: { label: "FROM DATABASE", icon: Database, tone: "text-purple-300" },
  other: { label: "FROM OTHER", icon: Box, tone: "text-slate-400" },
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
  if (first.type === "CloudTrailPrincipal" && first.name === "root") {
    return "root"
  }

  // External-account principal — an ARN that's not from this account
  // landed on a workload here. Sprint 4 territory (cross-account); we
  // detect by ARN prefix mismatch.
  if (first.type === "CloudTrailPrincipal" && /^arn:aws:[^:]+:[^:]*:(\d+):/.test(first.id || "")) {
    const acct = (first.id.match(/^arn:aws:[^:]+:[^:]*:(\d+):/) || [])[1]
    // Cyntro's primary account is 745783559495 today (per memory). If
    // we ever multi-tenant, this needs to come from the system config.
    if (acct && acct !== "745783559495") return "external_account"
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

// Severity → tone for the per-path chip. Mirrors the existing
// IdentityAttackPaths palette so v1 and v2 look consistent on a side-
// by-side comparison.
function severityTone(level?: string) {
  const l = (level || "").toLowerCase()
  if (l === "critical") return "bg-red-500/15 border-red-500/40 text-red-200"
  if (l === "high") return "bg-orange-500/15 border-orange-500/40 text-orange-200"
  if (l === "medium") return "bg-amber-500/15 border-amber-500/40 text-amber-200"
  if (l === "low") return "bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
  return "bg-slate-500/15 border-slate-500/40 text-slate-200"
}

export function PathListGrouped({
  paths,
  jewel,
  selectedPathId,
  onSelectPath,
}: PathListGroupedProps) {
  // Group paths by source bucket. Each bucket holds its paths sorted
  // descending by severity.score (when present) — within a bucket,
  // worst-first. Across buckets, we order by bucket population (most
  // paths first), so operators see the largest exposure surface up
  // top.
  const grouped = useMemo(() => {
    const buckets = new Map<keyof typeof SOURCE_BUCKETS, IdentityAttackPath[]>()
    for (const p of paths) {
      const bucket = classifySource(p.nodes)
      if (!buckets.has(bucket)) buckets.set(bucket, [])
      buckets.get(bucket)!.push(p)
    }
    // Sort within bucket — severity.overall_score desc, then hop_count asc.
    for (const list of buckets.values()) {
      list.sort((a, b) => {
        const sa = a.severity?.overall_score ?? 0
        const sb = b.severity?.overall_score ?? 0
        if (sb !== sa) return sb - sa
        return (a.hop_count ?? 0) - (b.hop_count ?? 0)
      })
    }
    // Order buckets by population.
    return Array.from(buckets.entries()).sort((a, b) => b[1].length - a[1].length)
  }, [paths])

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
    return (
      <div className="px-4 py-6">
        <div className="text-xs text-slate-400">
          No attack paths to <span className="font-mono text-slate-200">{jewel?.name ?? "this jewel"}</span> today.
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Jewel header — context for what the path list is about */}
      <div className="px-4 py-3 border-b border-slate-800/60 sticky top-0 bg-slate-950/95 backdrop-blur">
        <div className="flex items-center gap-2">
          <Crown className="h-3.5 w-3.5 text-amber-400" />
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            PATHS TO
          </div>
        </div>
        <div className="text-sm font-mono font-semibold text-white truncate mt-0.5" title={jewel?.name}>
          {jewel?.name ?? "—"}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">
          {paths.length} path{paths.length === 1 ? "" : "s"} ·{" "}
          {grouped.length} source type{grouped.length === 1 ? "" : "s"}
        </div>
      </div>

      {/* Grouped path list */}
      <div className="divide-y divide-slate-800/40">
        {grouped.map(([bucket, bucketPaths]) => {
          const meta = SOURCE_BUCKETS[bucket]
          const Icon = meta.icon
          const isCollapsed = collapsed.has(bucket as string)
          return (
            <div key={bucket as string} className="">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(bucket as string)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-900/40 transition-colors"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                )}
                <Icon className={`h-3.5 w-3.5 ${meta.tone}`} />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                  {meta.label}
                </span>
                <span className="text-[10px] text-slate-500 ml-auto">
                  {bucketPaths.length}
                </span>
              </button>

              {/* Group contents */}
              {!isCollapsed && (
                <div className="pl-2 pb-2">
                  {bucketPaths.map((p) => {
                    const isSelected = p.id === selectedPathId
                    // Operator-meaningful "start" — first node that isn't a
                    // CloudTrailPrincipal wrapper. Falls back to node 0.
                    const start =
                      p.nodes?.find((n) => n.type !== "CloudTrailPrincipal") ??
                      p.nodes?.[0]
                    const target = p.nodes?.[p.nodes.length - 1]
                    const sevLabel = p.severity?.severity?.toUpperCase() ?? "—"
                    const sevScore = p.severity?.overall_score
                    return (
                      <button
                        key={p.id}
                        onClick={() => onSelectPath(p.id)}
                        className={`w-full text-left rounded-lg px-3 py-2 mx-2 mb-1 transition-colors border ${
                          isSelected
                            ? "bg-blue-500/10 border-blue-500/40"
                            : "bg-transparent border-transparent hover:bg-slate-900/40 hover:border-slate-800"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wider rounded border px-1.5 py-0.5 ${severityTone(p.severity?.severity)}`}>
                            {sevLabel}
                            {sevScore !== undefined && sevScore !== null && (
                              <span className="ml-1 opacity-80">{sevScore}</span>
                            )}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {p.hop_count} hop{p.hop_count === 1 ? "" : "s"}
                          </span>
                          {p.evidence_type === "observed" && (
                            <span className="text-[9px] text-emerald-400 uppercase tracking-wider">
                              observed
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-300 font-mono truncate">
                          {start?.name ?? start?.id ?? "—"}{" "}
                          <span className="text-slate-600">→</span>{" "}
                          <span className="text-slate-400">{target?.name ?? "jewel"}</span>
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
