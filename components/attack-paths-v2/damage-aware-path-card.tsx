"use client"

// Damage-Aware Path Card — supporting-evidence drill-in below the IR-pure hero.
//
// Architecture (2026-06-15 IR cutover): this card is a PURE RENDERER of the
// backend-owned AttackPathReport. The dual-write helpers it used to import
// (effective-damage-matrix, granular-damage-lines, lp-execution-gate, path-
// damage-summary) computed security meaning locally from `path.damage_capability`;
// the AttackPathReport now carries the canonical damage_matrix, safety_decision,
// gates, current_state, and verification_target, so every claim here reads from
// `report.*`.
//
// The `scope` prop is KEPT — it comes from a different backend endpoint
// (damage-scope) and carries per-prefix observed detail + lp_confidence vetos +
// post-LP scope narrative that the AttackPathReport doesn't duplicate at the
// same granularity. Mixing the two substrates is fine because each one is
// authoritative for its own surface — only the security claims (damage class,
// gate decision, identity/target labels) MUST come from the report.
//
// NO MOCK DATA. When the report is unavailable the parent (path-analysis-panel)
// does not render this card at all — the hero above already surfaces the
// unavailable state, a second copy would be noise.

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Crown,
  Loader2,
  Shield,
  Sparkles,
  X,
} from "lucide-react"
import type {
  CrownJewelSummary,
  IdentityAttackPath,
  RiskReductionAction,
} from "@/components/identity-attack-paths/types"
import { isPrincipalNodeType } from "@/components/identity-attack-paths/types"
import { IAMPermissionAnalysisModal } from "@/components/iam-permission-analysis-modal"
import { SGRemediationModal } from "@/components/sg-remediation-modal"
import { S3RemediationModal } from "@/components/s3-remediation-modal"
import type { DamageScopePayload } from "./damage-scope-drawer"
import { actionToEnglish } from "./iam-action-to-english"
import {
  resolveModalTarget,
  resolveIamRoleFromPath,
  boundFixToTarget,
  type ModalTarget,
} from "./remediation-target"
import {
  selectRecommendedFix,
  expectedResultLabel,
  type RecommendedFix,
} from "./damage-matrix-fix"
import type {
  AttackPathReport,
  DamageCategory,
  DamageCell as ReportDamageCell,
  EvidenceGrade,
  GateState,
} from "./attack-path-report-types"

interface DamageAwarePathCardProps {
  /** Backend-owned AttackPathReport — required. Parent gates render on its presence. */
  report: AttackPathReport
  path: IdentityAttackPath
  jewel: CrownJewelSummary | null
  systemName: string
  /** Optional per-prefix enrichment from the separate damage-scope endpoint. */
  scope: DamageScopePayload | null
  scopeLoading?: boolean
  scopeError?: string | null
}

// ─── Local presentational shapes (no semantic compute — just rollups) ───────

type DamageVerbKey = "read" | "write" | "delete" | "admin"
type ConfidenceLabel = "Observed" | "Configured" | "Blocked" | "Unknown"

interface MatrixCell {
  allowed: boolean
  confidence: ConfidenceLabel
  detail?: string
}

interface EffectiveDamageMatrix {
  read: MatrixCell
  write: MatrixCell
  delete: MatrixCell
  admin: MatrixCell
  blockedReason?: string
}

interface GranularDamageLine {
  verb: DamageVerbKey
  label: string
  allowed: boolean
  confidence: ConfidenceLabel
  detail?: string
}

const VERB_LABELS: Record<DamageVerbKey, string> = {
  read: "READ",
  write: "WRITE",
  delete: "DELETE",
  admin: "ADMIN",
}

const CATEGORY_TO_VERB: Partial<Record<DamageCategory, DamageVerbKey>> = {
  READ: "read",
  WRITE: "write",
  DELETE: "delete",
  ADMIN: "admin",
}

function confidenceTone(label: string): string {
  switch (label) {
    case "Observed":
      return "text-emerald-700 dark:text-emerald-300"
    case "Configured":
      return "text-amber-700 dark:text-amber-300"
    case "Blocked":
      return "text-red-700 dark:text-red-300"
    default:
      return "text-muted-foreground"
  }
}

function gradeToConfidence(grade: EvidenceGrade): ConfidenceLabel {
  switch (grade) {
    case "OBSERVED":
      return "Observed"
    case "CONFIGURED":
      return "Configured"
    case "BLOCKED":
      return "Blocked"
    default:
      // INFERRED / UNKNOWN — surfaced as Unknown in this rollup view; the IR's
      // can_drive_damage flag prevents these from authorizing damage cells
      // upstream anyway.
      return "Unknown"
  }
}

function dominantConfidence(cells: ReportDamageCell[]): ConfidenceLabel {
  const allowed = cells.filter((c) => c.status === "ALLOWED")
  if (allowed.length === 0) {
    const blocked = cells.find((c) => c.status === "BLOCKED")
    return blocked ? "Blocked" : "Unknown"
  }
  if (allowed.some((c) => c.evidence_grade === "OBSERVED")) return "Observed"
  if (allowed.some((c) => c.evidence_grade === "CONFIGURED")) return "Configured"
  return "Unknown"
}

function pathStatusFromReport(
  report: AttackPathReport,
): { label: string; tone: string } {
  // Global block beats anything in damage_matrix — the path can't reach the jewel.
  if (report.gates.network === "CLOSED") {
    return { label: "Blocked", tone: "text-red-700 dark:text-red-300" }
  }
  if (report.gates.data_plane === "CLOSED") {
    return { label: "Blocked", tone: "text-red-700 dark:text-red-300" }
  }
  // OPEN_OBSERVED on any gate = at least one observed hop on this path.
  const gateValues: Array<GateState | undefined> = [
    report.gates.entry,
    report.gates.identity,
    report.gates.network,
    report.gates.data_plane,
    report.gates.exfil,
  ]
  if (gateValues.includes("OPEN_OBSERVED")) {
    return { label: "Observed", tone: "text-emerald-700 dark:text-emerald-300" }
  }
  // Fall back to current_state.status when gates are entirely UNKNOWN.
  if (report.current_state.status === "BLOCKED") {
    return { label: "Blocked", tone: "text-red-700 dark:text-red-300" }
  }
  return { label: "Configured", tone: "text-amber-700 dark:text-amber-300" }
}

function GranularLineRow({
  label,
  allowed,
  confidence,
  detail,
}: {
  label: string
  allowed: boolean
  confidence: string
  detail?: string
}) {
  return (
    <div className="flex items-start gap-2 py-1 pl-2">
      <span className="shrink-0 mt-0.5">
        {allowed ? (
          <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden />
        ) : (
          <X className="h-3 w-3 text-muted-foreground" aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-[11px] text-foreground">{label}</span>
        <span className={`ml-2 text-[9px] font-semibold uppercase ${confidenceTone(confidence)}`}>
          {confidence}
        </span>
        {detail && (
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{detail}</p>
        )}
      </div>
    </div>
  )
}

export function DamageAwarePathCard({
  report,
  path,
  jewel,
  systemName,
  scope,
  scopeLoading,
  scopeError,
}: DamageAwarePathCardProps) {
  const [showTechnical, setShowTechnical] = useState(false)
  const [openModal, setOpenModal] = useState<ModalTarget | null>(null)

  const matrix = useMemo<EffectiveDamageMatrix>(() => {
    // Global block — every verb reads as Blocked with the gate reason.
    if (report.gates.network === "CLOSED") {
      const reason = "Network controls block reachability on this path"
      return {
        read: { allowed: false, confidence: "Blocked", detail: reason },
        write: { allowed: false, confidence: "Blocked", detail: reason },
        delete: { allowed: false, confidence: "Blocked", detail: reason },
        admin: { allowed: false, confidence: "Blocked", detail: reason },
        blockedReason: reason,
      }
    }
    if (report.gates.data_plane === "CLOSED") {
      const reason = "Data-plane controls block access"
      return {
        read: { allowed: false, confidence: "Blocked", detail: reason },
        write: { allowed: false, confidence: "Blocked", detail: reason },
        delete: { allowed: false, confidence: "Blocked", detail: reason },
        admin: { allowed: false, confidence: "Blocked", detail: reason },
        blockedReason: reason,
      }
    }

    const byVerb: Record<DamageVerbKey, ReportDamageCell[]> = {
      read: [],
      write: [],
      delete: [],
      admin: [],
    }
    for (const cell of report.damage_matrix) {
      const verb = CATEGORY_TO_VERB[cell.category]
      if (verb) byVerb[verb].push(cell)
    }

    const buildVerb = (verb: DamageVerbKey): MatrixCell => {
      const cells = byVerb[verb]
      if (cells.length === 0) return { allowed: false, confidence: "Unknown" }
      const allowed = cells.some((c) => c.status === "ALLOWED")
      return { allowed, confidence: dominantConfidence(cells) }
    }

    return {
      read: buildVerb("read"),
      write: buildVerb("write"),
      delete: buildVerb("delete"),
      admin: buildVerb("admin"),
    }
  }, [report])

  // Per-cell rows — one entry per damage_matrix cell, enriched with observed
  // prefix detail from `scope` when present (still a separate endpoint).
  const granularLines = useMemo<GranularDamageLine[]>(() => {
    if (matrix.blockedReason) {
      return (["read", "write", "delete", "admin"] as DamageVerbKey[]).map((verb) => ({
        verb,
        label: VERB_LABELS[verb],
        allowed: false,
        confidence: "Blocked" as ConfidenceLabel,
        detail: matrix.blockedReason,
      }))
    }

    const lines: GranularDamageLine[] = []
    const observed = scope?.scope_observed as Record<string, unknown> | undefined
    const obsPrefix = (key: "read_prefixes" | "write_prefixes" | "delete_prefixes"): string | undefined => {
      const arr = (observed?.[key] as string[] | undefined) ?? []
      if (arr.length === 0) return undefined
      const head = arr[0]
      return `under /${head}/` + (arr.length > 1 ? ` (+${arr.length - 1} prefixes)` : "")
    }

    for (const cell of report.damage_matrix) {
      const verb = CATEGORY_TO_VERB[cell.category]
      if (!verb) continue
      const confidence: ConfidenceLabel =
        cell.status === "ALLOWED" ? gradeToConfidence(cell.evidence_grade) :
        cell.status === "BLOCKED" ? "Blocked" :
        "Unknown"
      // Detail priority: scope.scope_observed prefix (most specific) →
      // cell.scope.values from the report → none.
      const scopeKey =
        verb === "read" ? "read_prefixes" :
        verb === "write" ? "write_prefixes" :
        verb === "delete" ? "delete_prefixes" :
        undefined
      const scopeDetail = scopeKey ? obsPrefix(scopeKey) : undefined
      const cellScopeDetail = cell.scope?.values?.length
        ? `under /${cell.scope.values[0]}/` +
          (cell.scope.values.length > 1 ? ` (+${cell.scope.values.length - 1})` : "")
        : undefined
      lines.push({
        verb,
        label: cell.label,
        allowed: cell.status === "ALLOWED",
        confidence,
        detail: scopeDetail ?? cellScopeDetail,
      })
    }

    if (lines.length === 0) {
      // Report has no damage_matrix entries — show the verb rollup so the
      // section still communicates the (empty) state honestly.
      for (const verb of ["read", "write", "delete", "admin"] as DamageVerbKey[]) {
        const cell = matrix[verb]
        lines.push({
          verb,
          label: VERB_LABELS[verb],
          allowed: cell.allowed,
          confidence: cell.confidence,
          detail: cell.detail,
        })
      }
    }

    const order: DamageVerbKey[] = ["read", "write", "delete", "admin"]
    return lines.sort(
      (a, b) => order.indexOf(a.verb) - order.indexOf(b.verb) || Number(b.allowed) - Number(a.allowed),
    )
  }, [report, scope, matrix])

  const byVerb = useMemo<Record<DamageVerbKey, GranularDamageLine[]>>(() => {
    const out: Record<DamageVerbKey, GranularDamageLine[]> = {
      read: [],
      write: [],
      delete: [],
      admin: [],
    }
    for (const line of granularLines) out[line.verb].push(line)
    return out
  }, [granularLines])

  // Recommended fix sources, ordered by authority:
  //   1. scope.damage_matrix.recommended_fix — bound per-cell IAM patch from
  //      the s3_damage_matrix endpoint (different substrate, kept).
  //   2. path.risk_reduction.top_actions[0] — six-factor risk-reducer scorer.
  // The IR's report.remediation_diff is the canonical IAM scope-down (used
  // by the hero card), so we don't re-render it here; this section's job is
  // to point at the per-cell action a CISO can preview.
  const topFix = path.risk_reduction?.top_actions?.[0]
  const boundFix = useMemo(
    () => selectRecommendedFix(scope?.damage_matrix),
    [scope],
  )

  // LP assessment — gate decision from report.safety_decision.gate; the
  // verbose reason + evidence gaps still come from scope.lp_confidence when
  // present (separate endpoint, richer detail), but the gate itself is the
  // compiler's call, not ours.
  const lpAssessment = useMemo(() => {
    type Gate = "AUTO" | "REVIEW"
    const sd = report.safety_decision
    const gateLabel: Gate =
      sd?.gate === "AUTO_ELIGIBLE" ? "AUTO" : "REVIEW"
    const reason =
      sd?.reasons?.[0] ??
      (sd?.gate === "AUTO_ELIGIBLE"
        ? "High-confidence LP — backend safety_decision cleared this path for auto-execute"
        : "Backend safety_decision held this path for review")
    const consumerCount =
      report.remediation_diff?.consumers ??
      scope?.lp_confidence?.consumer_count ??
      null
    const evidenceGaps = scope?.lp_confidence?.evidence_gaps ?? []
    const vetos = scope?.lp_confidence?.vetos ?? []
    return {
      gate: gateLabel,
      label: gateLabel,
      reason,
      consumerCount,
      evidenceGaps,
      vetos,
    }
  }, [report, scope])

  const gateBorder =
    lpAssessment.gate === "AUTO"
      ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
      : "border-amber-500/40 text-amber-300 bg-amber-500/10"

  // Verification target's compiler-authored expected result wins; fall back
  // to scope narrative when the report doesn't carry one (older paths).
  const expectedResult =
    report.verification_target?.expected_result ??
    scope?.narrative?.post_remediation ??
    scope?.scope_post_lp?.headline ??
    path.risk_reduction?.reduction_summary

  // "Why" — per-plane sentences derived from report.gates first, then
  // enriched with scope's separate-endpoint detail (policy / SCP defense).
  const whyLines = useMemo(() => {
    const lines: Array<{ label: string; text: string; confidence: string }> = []
    const g = report.gates

    if (g.network) {
      const reachable = g.network === "OPEN_OBSERVED" || g.network === "OPEN_CONFIG"
      lines.push({
        label: "Network",
        text: reachable
          ? g.network === "OPEN_OBSERVED"
            ? "Reachable through network controls (observed traffic)"
            : "Reachable through network controls on this path"
          : "Blocked by network controls",
        confidence:
          g.network === "OPEN_OBSERVED" ? "Observed" :
          g.network === "OPEN_CONFIG" ? "Configured" :
          g.network === "CLOSED" ? "Blocked" :
          "Unknown",
      })
    }

    // IAM line — prefer the report's gap.observed_actions (compiler picked
    // these as the proven set) over re-deriving from path.damage_capability.
    const observedActs = report.gap?.observed_actions ?? []
    if (observedActs.length > 0) {
      const english = observedActs.slice(0, 4).map((a) => actionToEnglish(a).sentence)
      lines.push({
        label: "IAM",
        text:
          english.join("; ") +
          (observedActs.length > 4 ? ` (+${observedActs.length - 4})` : ""),
        confidence: "Observed",
      })
    } else if (scope?.scope_today?.headline) {
      lines.push({
        label: "IAM",
        text: scope.scope_today.headline,
        confidence: "Configured",
      })
    }

    if (g.data_plane) {
      if (g.data_plane === "CLOSED") {
        lines.push({
          label: "KMS / data plane",
          text: "Data-plane controls block access",
          confidence: "Blocked",
        })
      } else if (g.data_plane === "OPEN_OBSERVED") {
        lines.push({
          label: "KMS / data plane",
          text: "Decrypt / data-plane access observed on this path",
          confidence: "Observed",
        })
      } else if (g.data_plane === "OPEN_CONFIG") {
        lines.push({
          label: "KMS / data plane",
          text: "Decrypt / data-plane access permitted on this path",
          confidence: "Configured",
        })
      }
    }

    // Scope-endpoint enrichments (separate substrate, additive).
    if (scope?.scope_observed?.headline) {
      lines.push({
        label: "Observed",
        text: String(scope.scope_observed.headline),
        confidence: "Observed",
      })
    }
    if (scope?.scope_post_lp?.resource_policy_defense_note) {
      lines.push({
        label: "Bucket policy",
        text: String(scope.scope_post_lp.resource_policy_defense_note),
        confidence: "Configured",
      })
    }
    if (scope?.scope_post_lp?.scp_defense_note) {
      lines.push({
        label: "Org SCP",
        text: String(scope.scope_post_lp.scp_defense_note),
        confidence: "Blocked",
      })
    }
    if (lines.length === 0) {
      lines.push({
        label: "Signals",
        text:
          report.current_state.summary ||
          "Insufficient signals for this jewel type",
        confidence: "Unknown",
      })
    }
    return lines
  }, [report, scope])

  // Chain line — backend-authored source/target. The middle "identity" hop
  // is read off the canonical labels too; when source == target the middle
  // disappears so we don't print "pivot → pivot → jewel".
  const chainLine = useMemo(() => {
    const source = report.current_state.source_label || "—"
    const target =
      report.current_state.target_label || jewel?.name || "crown jewel"
    return [source, target].filter(Boolean).join(" → ")
  }, [report, jewel])

  const status = pathStatusFromReport(report)

  const handleApply = (action?: RiskReductionAction) => {
    const target = action
      ? resolveModalTarget(action, path.nodes ?? [])
      : topFix
        ? resolveModalTarget(topFix, path.nodes ?? [])
        : { kind: "none" as const, reason: "No action" }
    if (target.kind === "none") {
      const role = resolveIamRoleFromPath(path.nodes ?? [])
      if (role) setOpenModal({ kind: "iam", roleName: role })
      return
    }
    setOpenModal(target)
  }

  const handleApplyBoundFix = (rec: RecommendedFix) => {
    setOpenModal(boundFixToTarget(rec.fix))
  }

  // Blast line — report.blast_radius.headline is compiler-authored; fall
  // back to consumer-count phrasing when the headline isn't populated.
  const blastLine = useMemo(() => {
    const br = report.blast_radius
    if (br?.headline) return br.headline
    const n = lpAssessment.consumerCount
    if (n != null && n > 1) {
      return `${n} workloads share this role — LP change may affect more than this path`
    }
    if (n === 1) return "Role attached to 1 workload"
    return null
  }, [report, lpAssessment.consumerCount])

  return (
    <>
      <div
        className="mx-6 mt-3 mb-2 rounded-xl border border-border bg-card overflow-hidden shadow-md"
        data-testid="damage-aware-path-card"
      >
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2 flex-wrap">
            <Shield className="h-4 w-4 text-blue-500 shrink-0" />
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
              Damage-Aware Path to Crown Jewel
            </h2>
            {jewel && (
              <span
                className="ml-auto inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-300 font-mono truncate max-w-[220px]"
                title={jewel.name}
              >
                <Crown className="h-3 w-3 shrink-0" />
                {jewel.name}
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Path · Damage · Least-Privilege Fix</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
          <section className="px-4 py-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Path</div>
            <p className="text-sm text-foreground font-mono leading-snug">{chainLine}</p>
            <div className="flex flex-wrap items-center gap-2 text-[10px]">
              <span className={`uppercase tracking-wider font-semibold ${status.tone}`}>
                {status.label}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{path.hop_count} hop{path.hop_count === 1 ? "" : "s"}</span>
              {(path.nodes ?? []).some((n) => isPrincipalNodeType(n.type) && n.name === "root") && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-red-700 dark:text-red-300 font-semibold uppercase">Root credentials</span>
                </>
              )}
            </div>
            {report.current_state.summary && (
              <p className="text-[12px] text-foreground leading-snug">{report.current_state.summary}</p>
            )}
          </section>

          <section className="px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Potential damage on jewel
            </div>
            {scopeLoading && !scope ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading scope…
              </div>
            ) : (
              <div className="space-y-3">
                {(["read", "write", "delete", "admin"] as DamageVerbKey[]).map((verb) => {
                  const lines = byVerb[verb]
                  if (!lines.length) return null
                  return (
                    <div key={verb}>
                      <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
                        {VERB_LABELS[verb]}
                      </div>
                      {lines.map((line, i) => (
                        <GranularLineRow
                          key={`${verb}-${i}`}
                          label={line.label}
                          allowed={line.allowed}
                          confidence={line.confidence}
                          detail={line.detail}
                        />
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
            {scopeError && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Scope unavailable — showing configured signals only
              </p>
            )}
          </section>
        </div>

        <section className="px-4 py-3 border-t border-border bg-muted/30">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Why</div>
          <ul className="space-y-1.5">
            {whyLines.map((w) => (
              <li key={w.label} className="text-[11px] leading-snug">
                <span className="text-muted-foreground uppercase tracking-wider text-[9px] mr-2">
                  {w.label}
                </span>
                <span className="text-foreground">{w.text}</span>
                <span
                  className={`ml-2 text-[9px] font-semibold uppercase ${confidenceTone(w.confidence)}`}
                >
                  {w.confidence}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border border-t border-border">
          <section className="px-4 py-3 bg-emerald-500/[0.03]">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">
              <Sparkles className="h-3 w-3" />
              Recommended LP fix
            </div>
            {boundFix ? (
              <div>
                <p className="text-sm text-slate-100">{boundFix.action_label}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Addresses{" "}
                  <span className="text-slate-200">{boundFix.label.toLowerCase()}</span> on this
                  jewel
                </p>
                <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                  {boundFix.fix.resource_scope}
                </p>
                {expectedResultLabel(boundFix) && (
                  <p className="text-[10px] text-emerald-400 mt-1">
                    {expectedResultLabel(boundFix)}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => handleApplyBoundFix(boundFix)}
                  className="mt-3 inline-flex items-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/20 transition-colors"
                  data-testid="damage-aware-apply-cta"
                >
                  Preview LP fix
                </button>
              </div>
            ) : topFix ? (
              <div>
                <p className="text-sm text-foreground">{topFix.action}</p>
                {topFix.node_name && (
                  <p className="text-[11px] font-mono text-muted-foreground mt-0.5">on {topFix.node_name}</p>
                )}
                {(() => {
                  const reduction = Math.abs(topFix.impact ?? 0)
                  if (reduction <= 0) return null
                  return (
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">
                      −{Math.round(reduction)} path score
                    </p>
                  )
                })()}
                <button
                  type="button"
                  onClick={() => handleApply(topFix)}
                  className="mt-3 inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                  data-testid="damage-aware-apply-cta"
                >
                  Preview LP fix
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground italic">
                No LP recommendation computed for this path yet
              </p>
            )}
          </section>
          <section className="px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Expected result
            </div>
            <p className="text-sm text-foreground leading-snug">
              {expectedResult ?? "Post-LP scope will appear after damage-scope loads"}
            </p>
            {scope?.damage_reduction_percent != null && scope.damage_reduction_percent > 0 && (
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">
                ~{Math.round(scope.damage_reduction_percent)}% dangerous scope removed (configured
                basis)
              </p>
            )}
          </section>
        </div>

        <div className="px-4 py-2.5 border-t border-border bg-muted/30 space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-[10px]">
            <span className="text-muted-foreground uppercase tracking-wider">LP confidence</span>
            <span
              className={`font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${gateBorder}`}
              title={lpAssessment.reason}
            >
              {lpAssessment.label}
            </span>
            {blastLine && (
              <>
                <span className="text-muted-foreground">·</span>
                <span
                  className={lpAssessment.gate === "REVIEW" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}
                  title="Blast impact if this role is narrowed"
                >
                  Blast: {blastLine}
                </span>
              </>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug">{lpAssessment.reason}</p>
          {lpAssessment.evidenceGaps.length > 0 && (
            <button
              type="button"
              onClick={() => setShowTechnical((s) => !s)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            >
              {showTechnical ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {lpAssessment.evidenceGaps.length} evidence signal
              {lpAssessment.evidenceGaps.length === 1 ? "" : "s"}
            </button>
          )}
          {showTechnical && lpAssessment.evidenceGaps.length > 0 && (
            <ul className="text-[10px] text-muted-foreground list-disc pl-4 space-y-0.5">
              {lpAssessment.evidenceGaps.slice(0, 4).map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-muted-foreground italic">
            Remove dangerous damage, preserve required access — based on collected IAM, network,
            data, and observed usage signals.
          </p>
        </div>
      </div>

      {(openModal?.kind === "iam" || openModal?.kind === "iam_action_patch") && (
        <IAMPermissionAnalysisModal
          isOpen={true}
          onClose={() => setOpenModal(null)}
          roleName={openModal.roleName}
          systemName={systemName}
          identityType="role"
        />
      )}
      {openModal?.kind === "sg" && (
        <SGRemediationModal
          isOpen={true}
          onClose={() => setOpenModal(null)}
          sgId={openModal.sgId}
          sgName={openModal.sgName}
          systemName={systemName}
        />
      )}
      {openModal?.kind === "s3" && (
        <S3RemediationModal
          isOpen={true}
          onClose={() => setOpenModal(null)}
          bucketName={openModal.bucketName}
          systemName={systemName}
        />
      )}
    </>
  )
}
