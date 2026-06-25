"use client"

// Path list grouped by ATT&CK Initial Access category (alon@2026-06-20).
// Replaces the prior workload-type grouping ("FROM EC2 / FROM LAMBDA")
// because workload type doesn't answer the operator's first question —
// "how does an attacker actually break in?" Categories follow the
// ATT&CK Cloud Matrix's Initial Access tactic mapped to AWS surfaces.
//
// Source-of-truth: the backend INITIAL_ACCESS_VIA edge per AttackPath,
// surfaced as path.initial_access.category. Until the backend
// classifier (BE-A.2) ships, the FE derives the category inline from
// signals already present on PathNodeDetail (is_internet_exposed,
// subnet_is_public, has_console_access, has_mfa, ARN structure).
//
// Path rows still show the workload as the "source" line (option a per
// 2026-06-20 design) — what changes is the GROUP HEADER, which now
// answers "how does the attacker get in?" instead of "what kind of
// workload is this?".

import { useMemo, useState } from "react"
import {
  ChevronDown, ChevronRight, Server, Crown, Database, Globe, Globe2, Box,
  Terminal, KeyRound, ShieldCheck, HelpCircle, Cloud,
} from "lucide-react"
import type {
  IdentityAttackPath,
  CrownJewelSummary,
  InitialAccessCategory,
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

// ATT&CK Initial Access bucket → operator-readable label + icon + tone.
// Categories follow alon@2026-06-20 taxonomy. Labels are operator-facing
// English (not raw AWS surface names) per the design principle that
// internal labels leak the integration list. "FROM EC2 IMDS THEFT"
// reads better than "FROM EC2" because it answers HOW.
const INITIAL_ACCESS_BUCKETS: Record<
  InitialAccessCategory,
  { label: string; icon: any; tone: string }
> = {
  LEAKED_ACCESS_KEY: { label: "FROM LEAKED ACCESS KEY", icon: KeyRound, tone: "text-red-600 dark:text-red-400" },
  IMDS_CREDENTIAL_THEFT: { label: "FROM EC2 IMDS THEFT", icon: Server, tone: "text-orange-600 dark:text-orange-400" },
  EXPOSED_S3_BUCKET: { label: "FROM EXPOSED S3 BUCKET", icon: Database, tone: "text-red-600 dark:text-red-400" },
  EXPOSED_RDS_SNAPSHOT: { label: "FROM EXPOSED RDS / EBS SNAPSHOT", icon: Database, tone: "text-red-600 dark:text-red-400" },
  EXPOSED_K8S_WORKLOAD: { label: "FROM EXPOSED EKS / FARGATE", icon: Box, tone: "text-red-600 dark:text-red-400" },
  EXPOSED_ECR_IMAGE: { label: "FROM EXPOSED ECR IMAGE", icon: Box, tone: "text-amber-600 dark:text-amber-400" },
  EXPOSED_WORKLOAD_RCE: { label: "FROM PUBLIC-FACING WORKLOAD", icon: Globe2, tone: "text-red-600 dark:text-red-400" },
  COGNITO_OR_FEDERATED_IDP: { label: "FROM FEDERATED IDP", icon: ShieldCheck, tone: "text-violet-600 dark:text-violet-400" },
  CONSOLE_OR_CLOUDSHELL: { label: "FROM CONSOLE / CLOUDSHELL", icon: Terminal, tone: "text-amber-600 dark:text-amber-400" },
  CROSS_ACCOUNT_TRUST: { label: "FROM EXTERNAL ACCOUNT", icon: Globe, tone: "text-red-600 dark:text-red-400" },
  UNKNOWN: { label: "FROM UNKNOWN ENTRY", icon: HelpCircle, tone: "text-muted-foreground" },
}

const ARN_PRINCIPAL_RE = /^arn:aws:[^:]+:[^:]*:(\d+):/

/** Find the path's ARN reference account by walking from node 1 onward.
 *  Used to detect cross-account paths without a hardcoded customer id —
 *  the path's own target chip provides the reference. */
function pathRefAccount(nodes: PathNodeDetail[]): string | null {
  for (let i = 1; i < nodes.length; i++) {
    const m = (nodes[i].id || "").match(ARN_PRINCIPAL_RE)
    if (m) return m[1]
  }
  return null
}

/** Classify a path into an ATT&CK Initial Access category.
 *
 *  Single source of truth lives in the graph as
 *  (ap:AttackPath)-[:INITIAL_ACCESS_VIA]->() — exposed on the path as
 *  `path.initial_access.category`. When the backend has computed it,
 *  we cite it directly. Otherwise we fall back to inline derivation
 *  from per-node signals the FE already has (is_internet_exposed,
 *  subnet_is_public, has_console_access, has_mfa, ARN structure).
 *
 *  The fallback only fires during the migration window (before BE-A.2
 *  ships). Once the backend writes the edge, every path gets a
 *  category from the same source and the FE stops re-deriving.
 */
function classifyInitialAccess(path: IdentityAttackPath): InitialAccessCategory {
  // Backend wrote it — single source of truth wins.
  const fromBackend = path.initial_access?.category
  if (fromBackend) return fromBackend

  const nodes = path.nodes ?? []
  if (nodes.length === 0) return "UNKNOWN"
  const principal = nodes[0]
  const workload = nodes[1]
  const jewel = nodes.find((n) => n.tier === "crown_jewel") ?? nodes[nodes.length - 1]

  // CROSS_ACCOUNT_TRUST — principal ARN account differs from the
  // reference account derived from the path's downstream chips.
  if (isPrincipalNodeType(principal.type)) {
    const m = (principal.id || "").match(ARN_PRINCIPAL_RE)
    if (m) {
      const acct = m[1]
      const ref = pathRefAccount(nodes)
      if (acct && ref && acct !== ref) return "CROSS_ACCOUNT_TRUST"
    }
  }

  // COGNITO_OR_FEDERATED_IDP — principal id matches OIDC / SAML / Cognito pattern.
  const pid = (principal.id || "").toLowerCase()
  if (/oidc|saml|cognito|federated/.test(pid)) return "COGNITO_OR_FEDERATED_IDP"

  // CONSOLE_OR_CLOUDSHELL — IAM user with console access enabled.
  const pType = (principal.type || "").toLowerCase()
  if ((pType.includes("user") || pType === "humanidentity") &&
      principal.has_console_access === true) {
    return "CONSOLE_OR_CLOUDSHELL"
  }

  // LEAKED_ACCESS_KEY — IAM user with no MFA AND path is observed
  // (real CloudTrail evidence the key is in use).
  if ((pType.includes("user") || pType === "iamuser") &&
      principal.has_mfa === false &&
      path.evidence_type === "observed") {
    return "LEAKED_ACCESS_KEY"
  }

  // EXPOSED_S3_BUCKET — crown jewel itself is internet-exposed and is S3.
  // 1-hop path where the bucket is the entry.
  const jewelType = (jewel?.type || "").toLowerCase()
  if (jewelType.includes("s3") && jewel?.is_internet_exposed === true) {
    return "EXPOSED_S3_BUCKET"
  }

  // EXPOSED_RDS_SNAPSHOT — crown jewel is RDS/EBS and reachable.
  if ((jewelType.includes("rds") || jewelType.includes("aurora") ||
       jewelType.includes("ebs") || jewelType.includes("snapshot")) &&
      jewel?.is_internet_exposed === true) {
    return "EXPOSED_RDS_SNAPSHOT"
  }

  // IMDS_CREDENTIAL_THEFT — EC2 workload reachable from the internet.
  // BE-A.1 (2026-06-20) added subnet_ingress_class as the typed signal
  // sourced from HAS_INGRESS_CLASS edges. We prefer it because it
  // distinguishes PUBLIC_INGRESS (real triple match: IGW + public IP +
  // open SG) from a subnet that merely routes via an IGW but has no
  // actual ingress posture. Falls back to is_internet_exposed /
  // subnet_is_public on responses that pre-date the BE-A.1 deploy.
  const wType = (workload?.type || "").toLowerCase()
  const subnetIngress = workload?.subnet_ingress_class
  const reachable =
    subnetIngress === "PUBLIC_INGRESS" ||
    subnetIngress === "ELB_FACING" ||
    workload?.is_internet_exposed === true ||
    workload?.subnet_is_public === true
  if (wType.includes("ec2") && reachable) {
    return "IMDS_CREDENTIAL_THEFT"
  }

  // EXPOSED_K8S_WORKLOAD — EKS / Fargate / ECS container reachable.
  if ((wType.includes("eks") || wType.includes("fargate") ||
       wType.includes("ecs") || wType.includes("container")) &&
      reachable) {
    return "EXPOSED_K8S_WORKLOAD"
  }

  // EXPOSED_WORKLOAD_RCE — any other workload (Lambda URL, etc.)
  // reachable from the internet.
  if (reachable) return "EXPOSED_WORKLOAD_RCE"

  // No identified initial access in current graph state — honest.
  return "UNKNOWN"
}

/** Observed-E2E classification — answers "is this path a real exfil
 *  route, just recon, or a paper capability?" — without a server-side
 *  classifier (Phase A FE-only slice for task #58).
 *
 *  Rules:
 *    - capability  → no edge on the path is observed. Pure config.
 *    - recon       → at least one observed edge but none of them are
 *                    data-plane edge TYPES. The role is doing API
 *                    calls / role assumes but never read the data.
 *    - live_exfil  → at least one data-plane edge type is observed
 *                    (ACTUAL_S3_ACCESS, READS_FROM, WRITES_TO,
 *                    ACCESSES_RESOURCE).
 *
 *  Known limitation (documented honestly via tooltip): ACCESSES_RESOURCE
 *  doesn't distinguish s3:GetBucket* (control plane) from s3:GetObject
 *  (data plane). For now both classify as `live_exfil`. Phase B will
 *  thread per-verb tags onto edges so the recon/exfil split is
 *  GetObject-true. Until then, the chip is honest about CONNECTIVITY
 *  evidence, not destructive-verb evidence.
 */
type ObservedE2EClass = "live_exfil" | "recon" | "capability"

const DATA_PLANE_EDGE_TYPES = new Set([
  "ACTUAL_S3_ACCESS",
  "READS_FROM",
  "WRITES_TO",
  "ACCESSES_RESOURCE",
])

const CONTROL_PLANE_EDGE_TYPES = new Set([
  "ACTUAL_API_CALL",
  "CALLS",
  "ASSUMES_ROLE_ACTUAL",
  "INVOKES",
])

function classifyObservedE2E(path: IdentityAttackPath): ObservedE2EClass {
  const edges = path.edges ?? []
  let observedDataPlane = false
  let observedControlPlane = false
  for (const e of edges) {
    if (!e.is_observed) continue
    if (DATA_PLANE_EDGE_TYPES.has(e.type)) observedDataPlane = true
    else if (CONTROL_PLANE_EDGE_TYPES.has(e.type)) observedControlPlane = true
  }
  if (observedDataPlane) return "live_exfil"
  if (observedControlPlane) return "recon"
  return "capability"
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

  // Group paths by ATT&CK Initial Access category. Each bucket holds
  // its paths sorted descending by OBSERVED HIT COUNT (real CloudTrail/
  // flow-log evidence) then by severity, then by hop count.
  const grouped = useMemo(() => {
    const buckets = new Map<InitialAccessCategory, IdentityAttackPath[]>()
    for (const p of paths) {
      const bucket = classifyInitialAccess(p)
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
            {grouped.length} initial-access categor{grouped.length === 1 ? "y" : "ies"}
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
          const meta = INITIAL_ACCESS_BUCKETS[bucket]
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
                    // Crown-jewel resolution (Bug #209): the path's nodes[]
                    // may end at the KMSKey that ENCRYPTS the jewel (compiler
                    // §5.4 KMS terminus dual-typing — the canvas legitimately
                    // shows both S3 and KMS at the chain tail). Naïvely
                    // labelling with nodes[last].name yields chips like
                    // "alon-demo-app2 → cyntro-demo-cmk" under a list header
                    // that says "PATHS TO saferemediate-logs". The path
                    // record's canonical terminus is `crown_jewel_id`; prefer
                    // that node, then the parent jewel context, then fall
                    // back to the chain tail.
                    const jewelNode =
                      (p.crown_jewel_id &&
                        p.nodes?.find((n) => n.id === p.crown_jewel_id)) ||
                      null
                    const target =
                      jewelNode ??
                      (jewel && p.crown_jewel_id === jewel.id
                        ? ({ id: jewel.id, name: jewel.name, type: jewel.type } as PathNodeDetail)
                        : p.nodes?.[p.nodes.length - 1])
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
                          {/* Observed-E2E class chip — Phase A of task #58.
                              Surfaces "is this path a real exfil route, just
                              recon, or a paper capability?" Computed from
                              edges[].type + is_observed (FE-derived; Phase B
                              promotes to a backend property + per-verb
                              ACCESSES_RESOURCE tagging). */}
                          {(() => {
                            const e2e = classifyObservedE2E(p)
                            const cfg = {
                              live_exfil: {
                                label: "Live exfil",
                                tone: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
                                title: "Data-plane edge observed on this path (ACTUAL_S3_ACCESS / READS_FROM / WRITES_TO / ACCESSES_RESOURCE with hits). Note: ACCESSES_RESOURCE doesn't yet split GetBucket* (control plane) from GetObject (data plane) — Phase B refines.",
                              },
                              recon: {
                                label: "Recon",
                                tone: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                                title: "Observed API calls or role-assumes on this path, but no observed data-plane edge. The role moved but didn't (yet) touch the jewel's data.",
                              },
                              capability: {
                                label: "Capability",
                                tone: "border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300",
                                title: "No observed activity on this path's edges. Pure policy: the attacker COULD reach the jewel but no CloudTrail/flow-log evidence shows them having tried.",
                              },
                            }[e2e]
                            return (
                              <span
                                className={`inline-flex items-center text-[9px] font-semibold uppercase tracking-wider rounded border px-1.5 py-0.5 ${cfg.tone}`}
                                title={cfg.title}
                              >
                                {cfg.label}
                              </span>
                            )
                          })()}
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
