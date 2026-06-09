"use client"

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
import {
  buildEffectiveDamageMatrix,
  type DamageVerbKey,
  verbLabel,
} from "./effective-damage-matrix"
import {
  buildGranularDamageLines,
  groupLinesByVerb,
} from "./granular-damage-lines"
import { actionToEnglish } from "./iam-action-to-english"
import { assessLpExecution, gateTone } from "./lp-execution-gate"
import { pathIdentityLabel, pathSourceLabel } from "./path-damage-summary"
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

interface DamageAwarePathCardProps {
  path: IdentityAttackPath
  jewel: CrownJewelSummary | null
  systemName: string
  scope: DamageScopePayload | null
  scopeLoading?: boolean
  scopeError?: string | null
}

function confidenceTone(label: string): string {
  switch (label) {
    case "Observed":
    case "Confirmed":
      return "text-emerald-300"
    case "Configured":
      return "text-amber-300"
    case "Blocked":
      return "text-red-300"
    default:
      return "text-slate-400"
  }
}

function pathStatusLabel(path: IdentityAttackPath): {
  label: string
  tone: string
} {
  const effective = path.damage_capability?.effective_damage
  if (effective === "network_blocked" || effective === "data_plane_blocked") {
    return { label: "Blocked", tone: "text-red-300" }
  }
  if (effective === "no_jewel_perms") {
    return { label: "No jewel permissions", tone: "text-slate-400" }
  }
  const hasObserved = (path.edges ?? []).some((e) => e.is_observed)
  if (hasObserved || path.evidence_type === "observed") {
    return { label: "Observed", tone: "text-emerald-300" }
  }
  return { label: "Configured", tone: "text-amber-300" }
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
          <Check className="h-3 w-3 text-emerald-400" aria-hidden />
        ) : (
          <X className="h-3 w-3 text-slate-600" aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-[11px] text-slate-200">{label}</span>
        <span className={`ml-2 text-[9px] font-semibold uppercase ${confidenceTone(confidence)}`}>
          {confidence}
        </span>
        {detail && (
          <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{detail}</p>
        )}
      </div>
    </div>
  )
}

export function DamageAwarePathCard({
  path,
  jewel,
  systemName,
  scope,
  scopeLoading,
  scopeError,
}: DamageAwarePathCardProps) {
  const [showTechnical, setShowTechnical] = useState(false)
  const [openModal, setOpenModal] = useState<ModalTarget | null>(null)

  const matrix = useMemo(
    () => buildEffectiveDamageMatrix(path.damage_capability, scope, false),
    [path.damage_capability, scope],
  )

  const granularLines = useMemo(
    () => buildGranularDamageLines(path.damage_capability, scope, matrix),
    [path.damage_capability, scope, matrix],
  )
  const byVerb = useMemo(() => groupLinesByVerb(granularLines), [granularLines])

  const topFix = path.risk_reduction?.top_actions?.[0]
  // Prefer the backend damage-cell-bound fix (e.g. "Remove s3:DeleteObject")
  // over the generic top risk-reducer when the S3 damage matrix is present.
  const boundFix = useMemo(
    () => selectRecommendedFix(scope?.damage_matrix),
    [scope],
  )
  const lpAssessment = useMemo(
    () => assessLpExecution(scope?.lp_confidence, scope?.lp_confidence?.consumer_count),
    [scope],
  )

  const expectedResult =
    scope?.narrative?.post_remediation ??
    scope?.scope_post_lp?.headline ??
    path.risk_reduction?.reduction_summary

  const whyLines = useMemo(() => {
    const lines: Array<{ label: string; text: string; confidence: string }> = []
    const gates = path.damage_capability?.gates
    if (gates) {
      lines.push({
        label: "Network",
        text: gates.network_reachable
          ? "Reachable through network controls on this path"
          : gates.network_reason ?? "Blocked by network controls",
        confidence: gates.network_reachable ? "Configured" : "Blocked",
      })
    }
    const directActions = path.damage_capability?.direct_actions ?? []
    if (directActions.length) {
      const english = directActions.slice(0, 4).map((a) => actionToEnglish(a).sentence)
      lines.push({
        label: "IAM",
        text: english.join("; ") + (directActions.length > 4 ? ` (+${directActions.length - 4})` : ""),
        confidence: "Configured",
      })
    } else if (scope?.scope_today?.headline) {
      lines.push({
        label: "IAM",
        text: scope.scope_today.headline,
        confidence: "Configured",
      })
    }
    if (gates && gates.data_plane_reachable === false && gates.data_plane_reason) {
      lines.push({
        label: "KMS / data plane",
        text: gates.data_plane_reason,
        confidence: "Blocked",
      })
    } else if (gates?.data_plane_reachable) {
      lines.push({
        label: "KMS / data plane",
        text: "Decrypt / data-plane access permitted on this path",
        confidence: "Configured",
      })
    }
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
          path.damage_narrative ??
          path.damage_capability?.reason ??
          "Insufficient signals for this jewel type",
        confidence: "Unknown",
      })
    }
    return lines
  }, [path, scope])

  const chainLine = useMemo(() => {
    const source = pathSourceLabel(path)
    const identity = pathIdentityLabel(path)
    const target = jewel?.name ?? path.nodes?.[path.nodes.length - 1]?.name ?? "crown jewel"
    return `${source} → ${identity} → ${target}`
  }, [path, jewel])

  const status = pathStatusLabel(path)

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

  const blastLine = useMemo(() => {
    const brs = path.target_blast_radius
    if (brs?.rationale?.length) return brs.rationale[0]
    const n = lpAssessment.consumerCount
    if (n != null && n > 1) {
      return `${n} workloads share this role — LP change may affect more than this path`
    }
    if (n === 1) return "Role attached to 1 workload"
    return null
  }, [path, lpAssessment.consumerCount])

  return (
    <>
      <div
        className="mx-6 mt-3 mb-2 rounded-xl border border-slate-700/80 bg-slate-900/50 overflow-hidden shadow-lg shadow-black/20"
        data-testid="damage-aware-path-card"
      >
        <div className="px-4 py-3 border-b border-slate-800/80 bg-slate-950/60">
          <div className="flex items-center gap-2 flex-wrap">
            <Shield className="h-4 w-4 text-blue-300 shrink-0" />
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-100">
              Damage-Aware Path to Crown Jewel
            </h2>
            {jewel && (
              <span
                className="ml-auto inline-flex items-center gap-1 text-[10px] text-amber-300 font-mono truncate max-w-[220px]"
                title={jewel.name}
              >
                <Crown className="h-3 w-3 shrink-0" />
                {jewel.name}
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Path · Damage · Least-Privilege Fix</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-800/60">
          <section className="px-4 py-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Path</div>
            <p className="text-sm text-slate-100 font-mono leading-snug">{chainLine}</p>
            <div className="flex flex-wrap items-center gap-2 text-[10px]">
              <span className={`uppercase tracking-wider font-semibold ${status.tone}`}>
                {status.label}
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400">{path.hop_count} hop{path.hop_count === 1 ? "" : "s"}</span>
              {(path.nodes ?? []).some((n) => isPrincipalNodeType(n.type) && n.name === "root") && (
                <>
                  <span className="text-slate-600">·</span>
                  <span className="text-red-300 font-semibold uppercase">Root credentials</span>
                </>
              )}
            </div>
            {path.damage_narrative && (
              <p className="text-[12px] text-slate-300 leading-snug">{path.damage_narrative}</p>
            )}
          </section>

          <section className="px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
              Potential damage on jewel
            </div>
            {scopeLoading && !scope ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
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
                      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                        {verbLabel(verb)}
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
              <p className="text-[11px] text-amber-400/90 mt-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Scope unavailable — showing configured signals only
              </p>
            )}
          </section>
        </div>

        <section className="px-4 py-3 border-t border-slate-800/60 bg-slate-950/30">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Why</div>
          <ul className="space-y-1.5">
            {whyLines.map((w) => (
              <li key={w.label} className="text-[11px] leading-snug">
                <span className="text-slate-500 uppercase tracking-wider text-[9px] mr-2">
                  {w.label}
                </span>
                <span className="text-slate-300">{w.text}</span>
                <span
                  className={`ml-2 text-[9px] font-semibold uppercase ${confidenceTone(w.confidence)}`}
                >
                  {w.confidence}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-800/60 border-t border-slate-800/60">
          <section className="px-4 py-3 bg-emerald-500/[0.03]">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-400 mb-1">
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
                <p className="text-sm text-slate-100">{topFix.action}</p>
                {topFix.node_name && (
                  <p className="text-[11px] font-mono text-slate-500 mt-0.5">on {topFix.node_name}</p>
                )}
                {topFix.impact < 0 && (
                  <p className="text-[10px] text-emerald-400 mt-1">
                    −{Math.abs(Math.round(topFix.impact))} path score
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => handleApply(topFix)}
                  className="mt-3 inline-flex items-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/20 transition-colors"
                  data-testid="damage-aware-apply-cta"
                >
                  Preview LP fix
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 italic">
                No LP recommendation computed for this path yet
              </p>
            )}
          </section>
          <section className="px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
              Expected result
            </div>
            <p className="text-sm text-slate-200 leading-snug">
              {expectedResult ?? "Post-LP scope will appear after damage-scope loads"}
            </p>
            {scope?.damage_reduction_percent != null && scope.damage_reduction_percent > 0 && (
              <p className="text-[10px] text-emerald-400 mt-1">
                ~{Math.round(scope.damage_reduction_percent)}% dangerous scope removed (configured
                basis)
              </p>
            )}
          </section>
        </div>

        <div className="px-4 py-2.5 border-t border-slate-800/60 bg-slate-950/40 space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-[10px]">
            <span className="text-slate-500 uppercase tracking-wider">LP confidence</span>
            <span
              className={`font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${gateTone(lpAssessment.gate)}`}
              title={lpAssessment.reason}
            >
              {lpAssessment.label}
            </span>
            {blastLine && (
              <>
                <span className="text-slate-600">·</span>
                <span
                  className={lpAssessment.gate === "REVIEW" ? "text-amber-300" : "text-slate-400"}
                  title="Blast impact if this role is narrowed"
                >
                  Blast: {blastLine}
                </span>
              </>
            )}
          </div>
          <p className="text-[10px] text-slate-500 leading-snug">{lpAssessment.reason}</p>
          {lpAssessment.evidenceGaps.length > 0 && (
            <button
              type="button"
              onClick={() => setShowTechnical((s) => !s)}
              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200"
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
            <ul className="text-[10px] text-slate-500 list-disc pl-4 space-y-0.5">
              {lpAssessment.evidenceGaps.slice(0, 4).map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-slate-600 italic">
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
