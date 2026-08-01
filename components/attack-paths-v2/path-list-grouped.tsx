"use client"

// Path list grouped by ATT&CK Initial Access category (alon@2026-06-20).
// Replaces the prior workload-type grouping ("FROM EC2 / FROM LAMBDA")
// because workload type doesn't answer the operator's first question —
// "how does an attacker actually break in?" Categories follow the
// ATT&CK Cloud Matrix's Initial Access tactic mapped to AWS surfaces.
//
// Source-of-truth: the backend INITIAL_ACCESS_VIA edge per AttackPath,
// surfaced as path.initial_access.category. Missing category → UNKNOWN
// (unavailable). Never derive from node signals on the FE.

import { useMemo, useState } from "react"
import {
  ChevronDown, ChevronRight, Server, Crown, Database, Globe, Globe2, Box,
  Terminal, KeyRound, ShieldCheck, HelpCircle, Cloud,
} from "lucide-react"
import type {
  IdentityAttackPath,
  CrownJewelSummary,
  InitialAccessCategory,
} from "@/components/identity-attack-paths/types"
import type { ActivePathList } from "@/lib/active-filters"
import {
  acquisitionChrome,
  isAcquisitionNoteworthy,
} from "@/lib/attack-paths/acquisition-chrome"
import { initialAccessCategoryFromBackend } from "@/lib/attack-paths/initial-access-from-backend"
import { MaterializedScopeBadge } from "./materialized-scope-badge"
import { PathComparisonTable } from "./path-comparison-table"
import type {
  PathListRow,
  InitialAccessCategoryLite,
} from "./attack-path-report-types"
import { compilePathListRow } from "./compile-path-list-row"
import {
  compareReachableDamagePriority,
  layerChipLabel,
  type LayerEvidence,
} from "./reachable-damage-priority"
import { TrustNarrowPanel } from "./trust-narrow-panel"

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
  UNKNOWN: { label: "INITIAL ACCESS UNAVAILABLE", icon: HelpCircle, tone: "text-muted-foreground" },
}

// Severity → tone for the secondary severity label on Zoom 0 rows.
function severityTone(level?: string | null) {
  const l = (level || "").toLowerCase()
  if (l === "critical") return "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300"
  if (l === "high") return "bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-300"
  if (l === "medium") return "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
  if (l === "low") return "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
  return "bg-muted border-border text-muted-foreground"
}

function layerChipTone(evidence: LayerEvidence): string {
  if (evidence === "observed") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
  }
  if (evidence === "config-open") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
  }
  if (evidence === "na-standing") {
    return "border-border bg-muted/60 text-muted-foreground"
  }
  if (evidence === "closed") {
    return "border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300"
  }
  return "border-border bg-muted text-muted-foreground"
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
      compilePathListRow(p, jewel, initialAccessCategoryFromBackend(p)),
    )
  }, [paths, jewel])

  // Group rows by ATT&CK Initial Access category. Within each bucket sort by
  // Reachable Damage Priority (PRD FR5) — not a blended risk score.
  const grouped = useMemo(() => {
    const buckets = new Map<InitialAccessCategoryLite, PathListRow[]>()
    for (const row of rows) {
      const bucket = row.initial_access_category
      if (!buckets.has(bucket)) buckets.set(bucket, [])
      buckets.get(bucket)!.push(row)
    }
    for (const list of buckets.values()) {
      list.sort(compareReachableDamagePriority)
    }
    // Order buckets by best (lowest) reachable_damage_rank in each.
    return Array.from(buckets.entries()).sort((a, b) => {
      const minA = Math.min(...a[1].map((r) => r.reachable_damage_rank), 99)
      const minB = Math.min(...b[1].map((r) => r.reachable_damage_rank), 99)
      if (minA !== minB) return minA - minB
      return b[1].length - a[1].length
    })
  }, [rows])

  // The trust-narrow panel needs the full path (to resolve the materialized
  // :AttackPath id the same way the closure panel does), not the compiled row.
  const pathsById = useMemo(() => {
    const m = new Map<string, IdentityAttackPath>()
    for (const p of paths) m.set(p.id, p)
    return m
  }, [paths])

  // One panel open at a time. Each plan is a live iam:GetRole, so opening
  // several at once would be an API storm for no operator benefit.
  const [trustPanelPathId, setTrustPanelPathId] = useState<string | null>(null)

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
      {/* Path list chrome — jewel is already selected on the left; don't
          repeat the full bucket name as a second hero (UI skill: reduce clutter). */}
      <div className="px-4 py-3 border-b border-border sticky top-0 bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2">
          <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Paths
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            {rows.length} path{rows.length === 1 ? "" : "s"} · Reachable Damage Priority ·{" "}
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
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
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
                    // Top-of-bucket = highest Reachable Damage Priority (rank 1 first).
                    const isTopOfBucket = idxInBucket === 0
                    return (
                      <div key={row.id}>
                      {/* role="button" rather than a real <button>: the
                          acquisition chip below is itself a button (it opens the
                          trust-narrow panel), and interactive content nested
                          inside a <button> is invalid HTML — browsers tolerate
                          it, screen readers do not. Keyboard behaviour is
                          preserved explicitly rather than lost. */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectPath(row.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            onSelectPath(row.id)
                          }
                        }}
                        data-testid="zoom0-path-row"
                        className={`w-full text-left rounded-lg px-3 py-2.5 mx-2 mb-1 transition-colors border cursor-pointer ${
                          isSelected
                            ? "bg-primary/10 border-primary/40"
                            : "bg-transparent border-transparent hover:bg-accent/50 hover:border-border"
                        }`}
                      >
                        {/* Headline first (PRD FR4) — not a badge pile. */}
                        <div className="flex items-start gap-2 mb-1.5">
                          <p className="text-[12px] font-semibold text-foreground leading-snug flex-1 min-w-0">
                            {row.attacker_headline}
                          </p>
                          {isTopOfBucket && (
                            <span
                              className="shrink-0 inline-flex items-center text-[9px] font-semibold uppercase tracking-wider rounded border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-1.5 py-0.5"
                              title="Highest Reachable Damage Priority in this initial-access group"
                            >
                              top
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          {/* Server verdict, per path. Rendered ONLY when SERVE
                              sends one — absent means no chip, never an invented
                              state (#480: SERVE is the only authority).

                              This exists because the composite strip above the
                              map only appears for a single drawn path. Once the
                              EC2 paths returned the fan-in draws four, so the
                              default view showed no verdict at all. A verdict
                              per row is the honest shape: each path has its own,
                              and none of them is a claim about the others. */}
                          {row.path_state ? (
                            <span
                              data-path-state-chip={row.path_state}
                              data-activity-state-chip={row.activity_state ?? ""}
                              title={
                                row.activity_state
                                  ? `Path ${row.path_state} · activity ${row.activity_state}`
                                  : `Path ${row.path_state}`
                              }
                              className={`inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide rounded border px-1.5 py-0.5 ${
                                row.path_state === "REACHABLE"
                                  ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                  : row.path_state === "BLOCKED"
                                    ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                                    : "border-border bg-muted/40 text-muted-foreground"
                              }`}
                            >
                              {row.path_state.replace(/_/g, " ")}
                              {row.activity_state === "OBSERVED" && (
                                <span className="opacity-70">· obs</span>
                              )}
                            </span>
                          ) : null}
                          <span
                            className={`inline-flex items-center text-[9px] font-semibold rounded border px-1.5 py-0.5 ${layerChipTone(row.layer_permissions)}`}
                            title="Permissions / identity gate"
                          >
                            {layerChipLabel("P", row.layer_permissions)}
                          </span>
                          <span
                            className={`inline-flex items-center text-[9px] font-semibold rounded border px-1.5 py-0.5 ${layerChipTone(row.layer_network)}`}
                            title="Network / route gate — N/A when IAM-only standing access"
                          >
                            {layerChipLabel("N", row.layer_network)}
                          </span>
                          <span
                            className={`inline-flex items-center text-[9px] font-semibold rounded border px-1.5 py-0.5 ${layerChipTone(row.layer_data)}`}
                            title="Data-plane gate"
                          >
                            {layerChipLabel("D", row.layer_data)}
                          </span>
                          {row.damage_verbs.length > 0 && (
                            <span className="inline-flex items-center text-[9px] font-semibold rounded border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300 px-1.5 py-0.5">
                              Damage: {row.damage_verbs.join(", ")}
                            </span>
                          )}
                          {/* NOT lateral movement. The backend field behind this
                              (damage_capability.lateral_action_count, renamed
                              server-side to excess_service_reach) counts DISTINCT
                              NON-JEWEL AWS SERVICES in the role's excess IAM
                              breadth. It has never measured assume-role pivots —
                              those are identity_pivots, and an inbound assume into
                              the path principal is acquisition, not lateral.
                              Labelling it "Lateral: +0" made operators read "no
                              lateral movement here", which is a claim this number
                              cannot support. */}
                          <span
                            className="inline-flex items-center text-[9px] font-semibold rounded border border-border bg-muted/50 text-muted-foreground px-1.5 py-0.5"
                            title={
                              "Off-jewel IAM breadth: distinct non-jewel AWS services this role's " +
                              "excess permissions can reach. Not assume-role pivots, and not a " +
                              "statement about lateral movement."
                            }
                          >
                            Off-jewel: +{row.excess_service_reach} svc
                          </span>
                          {/* ACQUISITION — answers a question the group header
                              cannot: "FROM UNKNOWN ENTRY" is honest about how
                              the attacker reached the ACCOUNT, but says nothing
                              about who can take THIS principal once inside.
                              A path can have fully-explained acquisition and
                              unknown entry at the same time; that combination
                              used to render as a bare UNKNOWN with the most
                              alarming half left unsaid. Server-fed only — null
                              means nothing provable, so we render nothing
                              rather than an "unknown" chip. */}
                          {(() => {
                            const acq = acquisitionChrome(row.acquisition)
                            if (!acq) return null
                            const noteworthy = isAcquisitionNoteworthy(acq)
                            const label = `${acq.label}${
                              acq.unconditioned && acq.accountWide
                                ? " · no conditions"
                                : ""
                            }`
                            const tone = noteworthy
                              ? // No principal boundary at all. Orange, NOT the
                                // amber reserved for server-authored Security
                                // Gap findings.
                                "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                              : "border-border bg-muted/50 text-muted-foreground"
                            const base =
                              "inline-flex items-center text-[9px] font-semibold rounded px-1.5 py-0.5 border "
                            // Only account-wide + unconditioned trust has
                            // something to cut. A narrower chip is context, and
                            // dressing it as an action would promise a
                            // remediation that has no proposal behind it.
                            if (!noteworthy) {
                              return (
                                <span
                                  data-acquisition-chip="true"
                                  data-acquisition-noteworthy="false"
                                  title={acq.detail}
                                  className={base + tone}
                                >
                                  {label}
                                </span>
                              )
                            }
                            const open = trustPanelPathId === row.id
                            return (
                              <button
                                type="button"
                                data-acquisition-chip="true"
                                data-acquisition-noteworthy="true"
                                data-trust-narrow-trigger="true"
                                aria-expanded={open}
                                onClick={(e) => {
                                  // The row is a click target too; without this
                                  // the chip would also re-select the path and
                                  // scroll the map out from under the panel.
                                  e.stopPropagation()
                                  setTrustPanelPathId(open ? null : row.id)
                                }}
                                title={`${acq.detail}\n\nClick to plan a trust narrowing.`}
                                className={
                                  base +
                                  tone +
                                  " hover:brightness-110 cursor-pointer" +
                                  (open ? " ring-1 ring-orange-500/50" : "")
                                }
                              >
                                {label}
                                <span className="ml-1 opacity-70">
                                  {open ? "▴" : "▾"}
                                </span>
                              </button>
                            )
                          })()}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono truncate">
                          {row.start_label ?? "—"}{" "}
                          <span className="opacity-60">→</span>{" "}
                          {row.target_label ?? "jewel"}
                          <span className="mx-1.5 opacity-40">·</span>
                          {row.hop_count} hop{row.hop_count === 1 ? "" : "s"}
                          {row.severity_label && (
                            <>
                              <span className="mx-1.5 opacity-40">·</span>
                              <span
                                className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wider rounded border px-1.5 py-0.5 ${severityTone(row.severity_label)}`}
                                title="IAP severity label — secondary to observed/config chips above"
                              >
                                {row.severity_label}
                              </span>
                            </>
                          )}
                        </div>
                        {row.is_materialized_stale && (
                          <div className="mt-1">
                            <span
                              className="inline-flex items-center text-[9px] font-semibold uppercase tracking-wider rounded border border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300 px-1.5 py-0.5"
                              title={row.stale_reason ?? "Workload inactive — graph path retained for audit"}
                            >
                              inactive workload
                            </span>
                          </div>
                        )}
                      </div>
                      {/* The cut hangs off the chip, rendered under the row it
                          belongs to rather than in a modal — the operator keeps
                          the path in view while deciding. */}
                      {trustPanelPathId === row.id && pathsById.get(row.id) && (
                        <div className="mx-2 mb-2">
                          <TrustNarrowPanel
                            path={pathsById.get(row.id)!}
                            onClose={() => setTrustPanelPathId(null)}
                          />
                        </div>
                      )}
                      </div>
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
