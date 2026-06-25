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
import type {
  PathListRow,
  InitialAccessCategoryLite,
} from "./attack-path-report-types"
import { compilePathListRow } from "./compile-path-list-row"

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

// Observed-E2E classification moved into compile-path-list-row.ts so the
// list/comparison renderers stop re-computing per render (#34 PR 2).

// Observed-E2E chip presentation — labels + Tailwind tones + tooltip
// copy. Display-only concern, so it stays in the renderer module (the
// IR only carries the enum, not the styling).
const OBSERVED_E2E_CHIP: Record<
  "live_exfil" | "recon" | "capability",
  { label: string; tone: string; title: string }
> = {
  live_exfil: {
    label: "Live exfil",
    tone: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    title:
      "Data-plane edge observed on this path (ACTUAL_S3_ACCESS / READS_FROM / WRITES_TO / ACCESSES_RESOURCE with hits). Note: ACCESSES_RESOURCE doesn't yet split GetBucket* (control plane) from GetObject (data plane) — Phase B refines.",
  },
  recon: {
    label: "Recon",
    tone: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    title:
      "Observed API calls or role-assumes on this path, but no observed data-plane edge. The role moved but didn't (yet) touch the jewel's data.",
  },
  capability: {
    label: "Capability",
    tone: "border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300",
    title:
      "No observed activity on this path's edges. Pure policy: the attacker COULD reach the jewel but no CloudTrail/flow-log evidence shows them having tried.",
  },
}

// Severity → tone for the per-path chip. Theme-aware (light + dark)
// and aligned with FindingCard's severity palette. Phase 2 will hoist
// this into a shared *_CONFIG export in lib/types.ts.
function severityTone(level?: string | null) {
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
  // Compile the IR once for every path in the list. Every renderer
  // selector that used to live inline (observed-hit aggregation,
  // source/identity resolution, damage summary, fix label, e2e class)
  // collapses into this single pass.
  //
  // 2026-05-22 audit context preserved: sort key is observed-hit total
  // desc, then severity.overall_score desc, then hop_count asc. The
  // 11-hit alon-demo-ec2-role path beats the 2-hit cyntro-demo-ec2-s3-role
  // path because that's the real "biggest door".
  const rows = useMemo<PathListRow[]>(() => {
    return paths.map((p) =>
      compilePathListRow(p, jewel, classifyInitialAccess(p)),
    )
  }, [paths, jewel])

  // Group rows by ATT&CK Initial Access category. Each bucket holds its
  // rows sorted descending by observed_hits, then severity_score, then
  // hop_count.
  const grouped = useMemo(() => {
    const buckets = new Map<InitialAccessCategoryLite, PathListRow[]>()
    for (const row of rows) {
      const bucket = row.initial_access_category
      if (!buckets.has(bucket)) buckets.set(bucket, [])
      buckets.get(bucket)!.push(row)
    }
    for (const list of buckets.values()) {
      list.sort((a, b) => {
        if (b.observed_hits !== a.observed_hits) return b.observed_hits - a.observed_hits
        const sa = a.severity_score ?? 0
        const sb = b.severity_score ?? 0
        if (sb !== sa) return sb - sa
        return a.hop_count - b.hop_count
      })
    }
    // Order buckets by highest-hit-path in each (so the bucket containing
    // the busiest path appears first, regardless of bucket population).
    return Array.from(buckets.entries()).sort((a, b) => {
      const maxA = Math.max(...a[1].map((r) => r.observed_hits), 0)
      const maxB = Math.max(...b[1].map((r) => r.observed_hits), 0)
      if (maxB !== maxA) return maxB - maxA
      return b[1].length - a[1].length
    })
  }, [rows])

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

  if (rows.length === 0) {
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
            {rows.length} path{rows.length === 1 ? "" : "s"} ·{" "}
            {grouped.length} initial-access categor{grouped.length === 1 ? "y" : "ies"}
          </span>
          <MaterializedScopeBadge
            surfaced={rows.length}
            graphTotal={jewel?.materialized_path_count}
          />
        </div>
      </div>

      <PathComparisonTable
        rows={rows}
        selectedPathId={selectedPathId}
        onSelectPath={onSelectPath}
      />

      {/* Grouped path list */}
      <div className="divide-y divide-border">
        {grouped.map(([bucket, bucketRows]) => {
          const meta = INITIAL_ACCESS_BUCKETS[bucket as InitialAccessCategory]
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
                  {bucketRows.length}
                </span>
              </button>

              {/* Group contents */}
              {!isCollapsed && (
                <div className="pl-2 pb-2">
                  {bucketRows.map((row, idxInBucket) => {
                    const isSelected = row.id === selectedPathId
                    // Top-of-bucket marker — flag the row with the most
                    // observed traffic so operators don't need to squint
                    // at every hit-count chip.
                    const isTopOfBucket = idxInBucket === 0 && row.observed_hits > 0
                    const e2eCfg = OBSERVED_E2E_CHIP[row.observed_e2e_class]
                    return (
                      <button
                        key={row.id}
                        onClick={() => onSelectPath(row.id)}
                        className={`w-full text-left rounded-lg px-3 py-2 mx-2 mb-1 transition-colors border ${
                          isSelected
                            ? "bg-primary/10 border-primary/40"
                            : "bg-transparent border-transparent hover:bg-accent/50 hover:border-border"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wider rounded border px-1.5 py-0.5 ${severityTone(row.severity_label)}`}>
                            {row.severity_label ?? "—"}
                            {row.severity_score !== null && (
                              <span className="ml-1 opacity-80">{row.severity_score}</span>
                            )}
                          </span>
                          {/* Observed-hit chip — surfaces the real
                              CloudTrail/flow-log volume per path. The
                              alon-demo-ec2-role path (11 hits) now shows
                              the same as cyntro-demo-ec2-s3-role (2
                              hits) at a glance. */}
                          {row.observed_hits > 0 && (
                            <span
                              className="inline-flex items-center text-[9px] font-semibold rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5"
                              title={`${row.observed_hits} CloudTrail/flow-log events observed across this path`}
                            >
                              {row.observed_hits.toLocaleString()} hits
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
                            {row.hop_count} hop{row.hop_count === 1 ? "" : "s"}
                          </span>
                          {row.evidence_type === "observed" && row.observed_hits === 0 && (
                            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                              observed (no hit count)
                            </span>
                          )}
                          {/* Observed-E2E class chip — #58 Phase A. */}
                          <span
                            className={`inline-flex items-center text-[9px] font-semibold uppercase tracking-wider rounded border px-1.5 py-0.5 ${e2eCfg.tone}`}
                            title={e2eCfg.title}
                          >
                            {e2eCfg.label}
                          </span>
                          {row.is_materialized_stale && (
                            <span
                              className="inline-flex items-center text-[9px] font-semibold uppercase tracking-wider rounded border border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300 px-1.5 py-0.5"
                              title={row.stale_reason ?? "Workload inactive — graph path retained for audit"}
                            >
                              inactive workload
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-foreground font-mono truncate">
                          {row.start_label ?? "—"}{" "}
                          <span className="text-muted-foreground">→</span>{" "}
                          <span className="text-muted-foreground">{row.target_label ?? "jewel"}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
                          <span className="text-muted-foreground">
                            Damage: <span className="text-foreground">{row.damage_summary}</span>
                          </span>
                          {row.top_fix_label !== "—" && (
                            <span className="text-emerald-600 dark:text-emerald-400 truncate max-w-[180px]" title={row.top_fix_label}>
                              → {row.top_fix_label}
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
