"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import {
  X, Calendar, CheckCircle, AlertTriangle, Shield, ShieldCheck, Sparkles, Check,
  CheckSquare, Loader2, RefreshCw, XCircle, Activity, Lock
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { dispatchRemediationChanged } from "@/lib/remediation-events"
import {
  composeOverriddenBy,
  resolveOperatorIdentity,
} from "@/lib/operator-identity"
import {
  OverrideModalShared,
  type OverrideLineagePayload,
  type SharedOverrideState,
} from "@/components/override-modal-shared"
import { ConfidenceExplanationPanel } from "@/components/ConfidenceExplanationPanel"
import { fetchWithEnvelope } from "@/components/trust/use-trust-envelope"
import { TrustEnvelopeBadge, type Provenance } from "@/components/trust/trust-envelope-badge"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import type {
  ConfidenceScore,
  SimulateFixDecisionPersistence,
  SimulateFixProblem,
  SimulateFixSafety,
  DecisionOutcomeCanonical,
} from "@/lib/types"
import { type RoutingDecision, toRoutingDecision } from "@/lib/decision-routing"
import { resolveIamRemediationAuthority } from "@/lib/iam-remediation-authority"
import {
  iamEventCountCopy,
  iamObservationWindowCopy,
  type IamEventCountBasis,
  type IamObservationWindow,
} from "@/lib/iam-observation-copy"
import {
  automationReadiness,
  previewEvidenceNeeds,
  previewPermissionCounts,
  simulationPlanCounts,
} from "@/lib/resource-risk-preview-summary"
import { AdvancedDrawer } from "@/components/iam-lp/AdvancedDrawer"
import { TerraformExecutionChip } from "@/components/terraform-execution-chip"
import {
  ApprovalActionModal,
  buildApprovalActionInitialState,
  type ApprovalActionMode,
} from "@/components/iam-lp/ApprovalActionModal"
import { ChangeSetCard } from "@/components/iam-lp/ChangeSetCard"
import { ExecutionPlan } from "@/components/iam-lp/ExecutionPlan"
import { VerdictHero } from "@/components/iam-lp/VerdictHero"
import { EvidenceTable } from "@/components/iam-lp/EvidenceTable"
import { buildDecisionSplit } from "@/components/iam-lp/resolvers/decisionSplit"
import type {
  ApprovalRequestSummary,
  ExecutionState,
  IamGapAnalysis,
} from "@/components/iam-lp/types"
import { REMEDIATION_MODAL_BACKDROP_STYLE } from "@/components/remediation-modal-chrome"

export interface PermissionAnalysis {
  permission: string
  status: "USED" | "UNUSED"
  risk_level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  recommendation: string
  usage_count: number | null
  last_used?: string
  removal_score?: number | null
  removal_band?: "STRONG" | "REVIEW" | "LOW" | null
  removal_reason?: string
}

interface PermissionRemovalSafety {
  permission: string
  disposition: "USED" | "PROTECTED" | "INSUFFICIENT_EVIDENCE" | "REMOVAL_CANDIDATE"
  score: number | null
  band: "STRONG" | "REVIEW" | "LOW" | null
  consequence_class: "ROUTINE" | "OPERATIONAL" | "CRITICAL" | "CONTINGENCY"
  observation_days?: number | null
  required_observation_days?: number | null
  score_ceiling?: number | null
  factors?: {
    evidence_coverage: number
    observation_adequacy: number
    consumer_attribution: number
    dependency_certainty: number
    independent_corroboration: number
    raw_score: number
  } | null
  reason: string
  limiting_factors: string[]
}

export interface RemovalSafetyBundle {
  scorer_version: string
  plan_score: number | null
  scored_candidate_count: number
  used_count: number
  protected_count: number
  insufficient_evidence_count: number
  groups: Array<{ band: "STRONG" | "REVIEW" | "LOW" | "CANNOT_ASSESS"; count: number; permissions: string[] }>
  permissions: PermissionRemovalSafety[]
  shadow_only: boolean
}

export interface CanonicalPermissionView {
  used: PermissionAnalysis[]
  removable: PermissionAnalysis[]
  review: PermissionAnalysis[]
  protected: PermissionAnalysis[]
  totalCount: number
  usedCount: number
  unusedCount: number
}

/**
 * Build every tab from the same simulate-fix snapshot.
 *
 * Gap analysis remains useful for presentation metadata (usage counts, risk
 * labels), but it must never reclassify a permission after simulate-fix has
 * returned the authoritative action-level disposition. This was the source of
 * Summary showing 27 protected while Permissions showed 2 removable/25
 * protected for the exact same role and modal session.
 */
export function buildCanonicalPermissionView(
  legacyPermissions: PermissionAnalysis[],
  removalSafety: RemovalSafetyBundle | null,
): CanonicalPermissionView {
  if (!removalSafety) {
    const used = legacyPermissions.filter(item => item.status === "USED")
    // Raw non-use is inventory evidence, never removal authorization. If the
    // canonical scorer is unavailable, fail closed and expose every
    // not-observed action as awaiting evidence instead of inventing candidates.
    const review = legacyPermissions
      .filter(item => item.status === "UNUSED")
      .map(item => ({
        ...item,
        recommendation: item.recommendation || "Action-level removal evidence is unavailable.",
        removal_reason: item.removal_reason || "Action-level removal evidence is unavailable.",
      }))
    return {
      used,
      removable: [],
      review,
      protected: [],
      totalCount: legacyPermissions.length,
      usedCount: used.length,
      unusedCount: review.length,
    }
  }

  const legacyByPermission = new Map(
    legacyPermissions.map(item => [item.permission.toLowerCase(), item]),
  )
  const materialize = (item: PermissionRemovalSafety): PermissionAnalysis => {
    const legacy = legacyByPermission.get(item.permission.toLowerCase())
    return {
      permission: item.permission,
      status: item.disposition === "USED" ? "USED" : "UNUSED",
      risk_level: legacy?.risk_level ?? "MEDIUM",
      recommendation: item.reason,
      usage_count: legacy?.usage_count ?? null,
      last_used: legacy?.last_used,
      removal_score: item.score,
      removal_band: item.band,
      removal_reason: item.reason,
    }
  }
  const select = (disposition: PermissionRemovalSafety["disposition"]) =>
    removalSafety.permissions
      .filter(item => item.disposition === disposition)
      .map(materialize)

  const used = select("USED")
  const removable = select("REMOVAL_CANDIDATE")
  const review = select("INSUFFICIENT_EVIDENCE")
  const protectedPermissions = select("PROTECTED")
  const totalCount = removalSafety.permissions.length

  return {
    used,
    removable,
    review,
    protected: protectedPermissions,
    totalCount,
    usedCount: used.length,
    unusedCount: totalCount - used.length,
  }
}

export function resolveDefaultPermissionSelection(
  removalSafety: RemovalSafetyBundle,
  planPermissions: string[] | null,
): string[] {
  const candidates = removalSafety.permissions
    .filter(item => item.disposition === "REMOVAL_CANDIDATE")
    .map(item => item.permission)
  const candidateKeys = new Set(candidates.map(permission => permission.toLowerCase()))
  const planIsSafeSubset = !!planPermissions && planPermissions.every(
    permission => candidateKeys.has(permission.toLowerCase()),
  )
  return planIsSafeSubset ? planPermissions : candidates
}

export function resolveBreakGlassPermissionSelection(
  removalSafety: RemovalSafetyBundle | null,
  legacyUnused: string[],
): string[] {
  if (!removalSafety) return Array.from(new Set(legacyUnused))
  return removalSafety.permissions
    .filter(item =>
      item.disposition === "REMOVAL_CANDIDATE"
      || item.disposition === "INSUFFICIENT_EVIDENCE"
    )
    .map(item => item.permission)
}

export function RemovalSafetyPanel({ bundle }: { bundle: RemovalSafetyBundle }) {
  const byPermission = new Map(bundle.permissions.map(item => [item.permission, item]))
  const candidates = bundle.permissions.filter(item => item.disposition === "REMOVAL_CANDIDATE")
  const distinctScores = Array.from(new Set(
    candidates.map(item => item.score).filter((score): score is number => typeof score === "number"),
  ))
  const sharedAssessment = distinctScores.length === 1 ? candidates[0] : null
  const styles: Record<string, { label: string; bg: string; border: string; text: string }> = {
    STRONG: { label: "Strong evidence · 90–99", bg: "#f0fdf4", border: "#bbf7d0", text: "#166534" },
    REVIEW: { label: "Review · 75–89", bg: "#fffbeb", border: "#fde68a", text: "#92400e" },
    LOW: { label: "Low evidence · 0–74", bg: "#fff7ed", border: "#fed7aa", text: "#9a3412" },
    CANNOT_ASSESS: { label: "Cannot assess yet", bg: "#f8fafc", border: "#cbd5e1", text: "#475569" },
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4" data-testid="removal-safety-panel">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Removal safety</div>
          <h3 className="mt-1 text-lg font-bold text-slate-900">
            {bundle.scored_candidate_count} verified for removal · {bundle.insufficient_evidence_count} awaiting evidence · {bundle.used_count} in use · {bundle.protected_count} protected
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            This is an evidence index, not a probability. It measures how strongly the observed data supports removal without breaking expected use.
          </p>
        </div>
        {bundle.plan_score !== null && (
          <div className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-center text-white">
            <div className="text-[10px] uppercase tracking-wide text-slate-300">Change score</div>
            <div className="text-2xl font-bold tabular-nums">{bundle.plan_score}</div>
            <div className="text-[10px] text-slate-300">lowest selected</div>
          </div>
        )}
      </div>

      {sharedAssessment && candidates.length > 1 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" data-testid="shared-removal-score-explanation">
          <div className="font-semibold">
            Why all {candidates.length} permissions score {sharedAssessment.score}/100
          </div>
          <p className="mt-1">
            They share the same evidence inputs: {sharedAssessment.observation_days ?? "unknown"} observed days,
            {" "}the same consumers, the same dependency checks, and the same action-level log coverage.
          </p>
          {sharedAssessment.required_observation_days && (
            <p className="mt-1">
              Full observation credit for this action class requires {sharedAssessment.required_observation_days} days.
            </p>
          )}
          {sharedAssessment.factors && (
            <p className="mt-1 font-medium" data-testid="shared-removal-score-formula">
              Score: evidence {Math.round(sharedAssessment.factors.evidence_coverage)} + history {Math.round(sharedAssessment.factors.observation_adequacy)} + attribution {Math.round(sharedAssessment.factors.consumer_attribution)} + dependencies {Math.round(sharedAssessment.factors.dependency_certainty)} + corroboration {Math.round(sharedAssessment.factors.independent_corroboration)} = {sharedAssessment.score}.
            </p>
          )}
          {sharedAssessment.limiting_factors.length > 0 && (
            <p className="mt-1 text-amber-800">
              Main limits: {sharedAssessment.limiting_factors.join(" ")}
            </p>
          )}
        </div>
      )}

      {bundle.insufficient_evidence_count > 0 && (
        <div className="mt-3 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <strong>{bundle.insufficient_evidence_count} cannot be assessed.</strong>{" "}
          Cyntro will not assign a made-up score when action-level evidence is missing or stale.
        </div>
      )}

      <div className="mt-3 space-y-2">
        {bundle.groups.map(group => {
          const style = styles[group.band]
          return (
            <details key={group.band} className="overflow-hidden rounded-lg border" style={{ borderColor: style.border }} open={group.band === "STRONG"}>
              <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2" style={{ background: style.bg, color: style.text }}>
                <span className="font-semibold">{style.label}</span>
                <span className="text-sm font-bold tabular-nums">{group.count}</span>
              </summary>
              <div className="divide-y divide-slate-100 bg-white">
                {group.permissions.map(permission => {
                  const item = byPermission.get(permission)
                  const candidate = item?.disposition === "REMOVAL_CANDIDATE"
                  return (
                    <div key={permission} className="flex items-start gap-3 px-3 py-2">
                      {candidate
                        ? <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                        : <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
                      <div className="min-w-0 flex-1">
                        <div className={`truncate font-mono text-xs ${candidate ? "text-red-700" : "text-slate-700"}`}>{permission}</div>
                        {item?.reason && <div className="mt-0.5 text-xs text-slate-500">{item.reason}</div>}
                        {candidate && item?.consequence_class && (
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            Breakage impact: {item.consequence_class.toLowerCase()}
                          </div>
                        )}
                      </div>
                      {item?.score !== null && item?.score !== undefined && (
                        <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-bold tabular-nums text-slate-700">{item.score}/100</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </details>
          )
        })}
      </div>
    </section>
  )
}

export function IamRemediationAvailability({
  bundle,
  applyDisabled,
  disabledReason,
}: {
  bundle: RemovalSafetyBundle
  applyDisabled: boolean
  disabledReason?: string | null
}) {
  const hasCandidates = bundle.scored_candidate_count > 0

  if (hasCandidates && !applyDisabled) return null

  return (
    <section
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950"
      data-testid="iam-remediation-availability"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <div className="font-semibold">
            {!hasCandidates
              ? bundle.insufficient_evidence_count > 0
                ? `Nothing can be removed yet — ${bundle.insufficient_evidence_count} permissions await evidence`
                : "No eligible permission change was found"
              : "This plan is preview-only"}
          </div>
          {!hasCandidates && (
            <p className="mt-1 text-sm">
              {bundle.insufficient_evidence_count > 0
                ? `Cyntro observed no use for ${bundle.insufficient_evidence_count} permissions, but has not verified them as safe to remove. Open Permissions to see every action and its blocker.`
                : "Cyntro did not find an eligible permission to remove from this role."}
            </p>
          )}
          {applyDisabled && (
            <p className="mt-1 text-sm">
              {disabledReason ?? "Production IAM changes are not enabled in this release. You can review a verified plan, but Apply stays unavailable until the signed execution boundary is deployed and qualified."}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

interface DependencyInfo {
  arn?: string
  type?: string
  name?: string
  environment?: string
}

interface DependencyContext {
  status: 'ok' | 'not_computed' | 'not_found' | 'neo4j_unavailable' | 'error'
  system?: { name?: string; criticality?: string }
  dependencies?: DependencyInfo[] | null
  has_critical_dependencies?: boolean | null
  error?: string
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim().length > 0) {
    return payload
  }

  if (payload && typeof payload === "object") {
    const candidate = payload as {
      message?: unknown
      error?: unknown
      detail?: unknown
      reason_code?: unknown
    }

    const nested =
      extractErrorMessage(candidate.detail, "") ||
      extractErrorMessage(candidate.error, "") ||
      extractErrorMessage(candidate.message, "")

    if (nested) {
      const reasonCode =
        typeof candidate.reason_code === "string" && candidate.reason_code.trim().length > 0
          ? candidate.reason_code.trim()
          : null
      return reasonCode ? `${nested} (${reasonCode})` : nested
    }
  }

  return fallback
}

interface GapAnalysisData {
  role_name: string
  role_arn?: string
  observation_days: number
  /**
   * Measured bounds behind observation_days (backend `observation_window`).
   * Null when the backend omitted it. The modal renders only these bounds and
   * never derives a window edge from the browser clock (F5).
   */
  observation_window?: IamObservationWindow | null
  // Backend remediability contract (api/iam_gap_analysis.py). When
  // is_remediable is false the role must NOT be presented as removal-ready:
  // reason is 'no_policy_attached' (sync IAM policies) or 'usage_not_computed'
  // (usage never measured — sync CloudTrail/behavioral first). remediable_reason
  // is the human-readable string to surface.
  is_remediable?: boolean
  remediable_reason?: string
  reason?: string | null
  summary: {
    total_permissions: number
    used_count: number
    unused_count: number
    lp_score: number
    overall_risk: string
    // 'OBSERVED' | 'UNKNOWN' | 'LOW'. UNKNOWN = usage never measured (or no
    // policy attached). Never render a removal/clean verdict on UNKNOWN.
    data_confidence?: string
    /** Windowed USED_ACTION hit sum, or null when not measured (F6). */
    cloudtrail_events: number | null
    event_count_basis?: IamEventCountBasis | null
    high_risk_unused_count?: number
  }
  permissions_analysis: PermissionAnalysis[]
  used_permissions: string[]
  unused_permissions: string[]
  high_risk_unused: string[]
  confidence: string
  confidence_groups?: {
    groups: Array<{
      group_id: string
      label: string
      confidence_score: number
      data_source_type: string
      service_label: string
      logged_by_default: boolean
      explanation: string
      action: string
      color: string
      protected?: boolean
      warn?: boolean
      protection_tier?: string | null
      protection_category?: string | null
      // Layer 1 UX gating (additive — undefined on older deploys)
      auto_remediable?: boolean
      block_reason_code?: "ok" | "needs_telemetry" | "protected" | "inferred_usage" | "telemetry_asymmetry"
      block_reason_human?: string | null
      telemetry_enablement_action?: {
        service: string
        endpoint: string
        estimated_cost_usd_per_month?: number
      } | null
      // Sprint 1 Checkpoint 1 — Decision Contract operator_context. Optional
      // (only present when the group's block_reason_code mapped to a known
      // template). When present, renders the structured runbook in place of
      // the free-text block_reason_human banner.
      decision_contract?: {
        decision_id?: string
        reason_code?: string
        outcome?: string
        operator_context?: {
          summary?: string
          rendered_explanation?: string
          blocked_change?: { resource_id?: string; current_state?: string; proposed_change?: string }
          why?: { explanation?: string; confidence?: number }
          what_to_check?: Array<{ check?: string; command_or_link?: string; expected_result?: string }>
          suggested_safer_actions?:
            | Array<{ action?: string; explanation?: string; expected_risk_reduction?: string }>
            | { no_safer_action_known?: boolean; explanation?: string }
          override_requirements?: {
            allowed?: boolean
            required_acknowledgements?: string[]
            rationale_required?: boolean
            rollback_required?: boolean
          }
          escalation_target?: {
            target_type?: string  // resolved_owner | customer_default_team | customer_security_queue | unknown_no_default_configured
            display_name?: string | null
            source?: string
            confidence?: number
          }
        }
      } | null
      permission_count: number
      // v4.4 §11E dual-display: backend exposes both raw evidence and
      // calibrated execution score at the group level. confidence_score
      // remains the routing-driving value (= execution average); newer
      // ``evidence_confidence_score`` is the raw aggregate, surfaced
      // alongside for the dual-display.
      evidence_confidence_score?: number
      permissions: Array<{
        permission: string
        status: string
        risk_level: string
        damage_tier?: string
        // confidence_score is the backwards-compat alias of evidence
        // (raw); newer code should prefer evidence_confidence and
        // execution_confidence (the calibrated, routing-driving value).
        confidence_score: number
        evidence_confidence?: number
        execution_confidence?: number
        calibration_factor?: number
        calibration_reasons?: string[]
        data_source_type: string
        explanation: string
        logged_by_default: boolean
        protected?: boolean
        reserved?: boolean
        warn?: boolean
        protection_tier?: string | null
        protection_category?: string | null
      }>
    }>
    overall_confidence: number
    // v4.4 §11E dual-display top-level fields (additive — undefined on
    // older backend deploys). Single source of truth: backend emits
    // ``evidence_overall_confidence`` and ``calibration_reasons`` only;
    // the legacy aliases (overall_confidence_raw / calibration_penalties)
    // were removed alongside backend commit to drop the duplicates.
    evidence_overall_confidence?: number
    calibration_factor?: number
    calibration_reasons?: Record<string, number>
    total_permissions: number
    summary: {
      safe_to_remove: number
      verify_first: number
      investigate_first: number
      protected?: number
      warn_before_removing?: number
      reserved?: number
    }
    observation_days: number
    account_signals: {
      s3_data_events: boolean
      lambda_data_events: boolean
      dynamodb_data_events: boolean
    }
  }
  // Patent-A3 safety vector from unified scorer. Optional — older deploys
  // omit it; UI renders three-state (live / loading / not-wired).
  safety_vector?: {
    value: number              // overall 0-1
    source_coverage: number    // 0-1, planes-active / applicable
    signal_strength: number    // 0-1
    temporal_consistency: number
    source_agreement: number
    cross_validation: number
    planes_active: string[]
    signal_count: number
    observation_days: number
    // Patent-A4 dimensions (added 2026-05-07).
    health?: {
      value: number
      simulation: number
      posture: number
      environment: number
      historical_success: number
    } | null
    rollback?: {
      value: number
      snapshot_available: boolean
      snapshot_capable: boolean
      rollback_success_rate: number
    } | null
  } | null
  dependency_context?: DependencyContext
  remediated_at?: string | null
  service_role_analysis?: any
}

interface IAMPermissionAnalysisModalProps {
  isOpen: boolean
  onClose: () => void
  roleName: string
  findingId?: string
  systemName?: string
  identityType?: string
  // When the modal was reached by clicking an InstanceProfile, this
  // carries the wrapper's pedigree so the header can explain that the
  // user is looking at the WRAPPED role, not the profile itself.
  // IP carries no permissions of its own; surfacing this prevents
  // operator confusion when AWS gave the IP and the role the same name.
  viaInstanceProfile?: { name: string; arn: string }
  onApplyFix?: (data: any) => void
  onSuccess?: () => void
  onRemediationSuccess?: (roleName: string, receipt?: {
    snapshotId?: string | null
    eventId?: string | null
    rollbackAvailable?: boolean
    remediatedBy?: string | null
    remediatedAt?: string | null
    afterTotal?: number | null
    removedCount?: number | null
  }) => void
  onRollbackSuccess?: (roleName: string) => void
  /** When true, hide/disable all Apply mutation controls (mutation boundary not shipped). */
  applyDisabled?: boolean
  /** Authoritative estate-level veto. Review remains available; approval/execution do not. */
  authorityHoldReason?: string | null
}

export function shouldOfferIamSimulation(
  hasVerifiedSnapshot: boolean,
  removableCount: number,
  remediatedAt?: string | null,
): boolean {
  return hasVerifiedSnapshot && removableCount > 0 && !remediatedAt
}

/** A managed-policy rewrite is an execution mechanism, never work by itself. */
export function hasExecutableIamSelection(
  selectedPermissionCount: number,
  detachManagedPolicies: boolean,
  managedPolicyRewriteRequired: boolean,
): boolean {
  return selectedPermissionCount > 0
    || (detachManagedPolicies && !managedPolicyRewriteRequired)
}

/** Apply is permitted only for the exact permission set bound by Preview. */
export function selectionMatchesSignedIamPlan(
  selectedPermissions: Iterable<string>,
  planPermissions: string[] | null,
  planToken: string | null,
): boolean {
  if (!planToken || !planPermissions) return false
  const selected = Array.from(new Set(selectedPermissions)).sort()
  const planned = Array.from(new Set(planPermissions)).sort()
  return selected.length === planned.length
    && planned.every((permission, index) => permission === selected[index])
}

// Service role analysis from backend (trust policy based)
interface BackendServiceRoleAnalysis {
  is_service_role: boolean
  service_principals: string[]
  analysis: {
    service_principal: string
    service_name: string
    severity: 'critical' | 'high' | 'medium'
    cloudtrail_visible: boolean | null
    title: string
    description: string
    why_no_cloudtrail: string
    recommendation: string
    affected_permissions: string[] | null
  } | null
  error?: string
}

// Fallback client-side analysis when backend doesn't provide trust policy data
function fallbackAnalyzeRole(
  roleName: string,
  cloudtrailEvents: number | null,
  unusedCount: number,
  backendStatus: string | null = null,
): BackendServiceRoleAnalysis | null {
  // The backend now says when it could NOT classify the trust policy
  // (status "not_computed", F14) and when the event count is unmeasured
  // (null, F6). Neither is "no usage data"; do not invent an analysis.
  if (backendStatus === 'not_computed' || cloudtrailEvents == null) return null
  // Only provide fallback for obvious cases when backend analysis is unavailable
  if (cloudtrailEvents === 0 && unusedCount > 0) {
    return {
      is_service_role: false,
      service_principals: [],
      analysis: {
        service_principal: 'unknown',
        service_name: 'Unknown',
        severity: 'medium',
        cloudtrail_visible: null,
        title: `No usage data collected for ${roleName}`,
        description: `This role has ${unusedCount} permissions configured but no API activity was recorded.`,
        why_no_cloudtrail: 'This could mean: (1) the role is genuinely unused, (2) the role is used by an internal AWS service, or (3) the role is used infrequently.',
        recommendation: 'Investigate how this role is used before removing permissions.',
        affected_permissions: null
      }
    }
  }
  return null
}

function mapGapDataToIAMLp(gapData: GapAnalysisData | null): IamGapAnalysis | null {
  if (!gapData) return null

  const rawGap = gapData as any
  const normalizeAction = (
    action: string | undefined,
  ): IamGapAnalysis["confidence_groups"]["groups"][number]["action"] => {
    switch (action) {
      case "safe_to_remove":
      case "verify_first":
      case "investigate_first":
      case "warn_before_removing":
      case "protected":
      case "reserved":
        return action
      default:
        return "investigate_first"
    }
  }

  const mappedDependencies: IamGapAnalysis["dependency_context"]["dependencies"] = (
    gapData.dependency_context?.dependencies || []
  ).map((dependency) => ({
    ...dependency,
    criticality: dependency.environment,
  }))

  const mappedConfidenceGroups: IamGapAnalysis["confidence_groups"] = gapData.confidence_groups
    ? {
        groups: gapData.confidence_groups.groups.map((group) => {
          const action = normalizeAction(group.action)

          return {
            group_id: group.group_id,
            label: group.label,
            action,
            confidence_score: group.confidence_score,
            evidence_confidence_score: group.evidence_confidence_score,
            permission_count: group.permission_count,
            permissions: (group.permissions || []).map((permission) => ({
              ...permission,
              _action: permission.protected
                ? "protected"
                : permission.reserved
                  ? "reserved"
                  : permission.warn
                    ? "warn_before_removing"
                    : action,
              service_prefix: permission.permission?.includes(":")
                ? permission.permission.split(":")[0]
                : undefined,
            })),
            protected: !!group.protected,
            warn: !!group.warn,
            auto_remediable: group.auto_remediable === true,
            block_reason_code: group.block_reason_code ?? null,
            block_reason_human: group.block_reason_human ?? null,
            explanation: group.explanation,
            color: group.color,
          }
        }),
        overall_confidence: gapData.confidence_groups.overall_confidence,
        evidence_overall_confidence: gapData.confidence_groups.evidence_overall_confidence,
        summary: {
          safe_to_remove: gapData.confidence_groups.summary.safe_to_remove,
          verify_first: gapData.confidence_groups.summary.verify_first,
          investigate_first: gapData.confidence_groups.summary.investigate_first,
          protected: gapData.confidence_groups.summary.protected ?? 0,
          warn_before_removing: gapData.confidence_groups.summary.warn_before_removing ?? 0,
          reserved: gapData.confidence_groups.summary.reserved ?? 0,
        },
        total_permissions: gapData.confidence_groups.total_permissions,
        total_permissions_all:
          (gapData.confidence_groups as any).total_permissions_all ??
          gapData.confidence_groups.total_permissions,
      }
    : {
        groups: [],
        overall_confidence: 0,
        summary: {
          safe_to_remove: 0,
          verify_first: 0,
          investigate_first: 0,
          protected: 0,
        },
        total_permissions: gapData.summary.total_permissions,
        total_permissions_all: gapData.summary.total_permissions,
      }

  return {
    role_name: gapData.role_name,
    role_arn: gapData.role_arn || "",
    observation_days: gapData.observation_days,
    data_source: rawGap.data_source || "real",
    confidence_mode: rawGap.confidence_mode || "observed",
    summary: {
      total_permissions: gapData.summary.total_permissions,
      used_count: gapData.summary.used_count,
      unused_count: gapData.summary.unused_count,
      lp_score: gapData.summary.lp_score ?? null,
      overall_risk: gapData.summary.overall_risk,
      data_confidence: gapData.summary.data_confidence || "UNKNOWN",
      cloudtrail_events: gapData.summary.cloudtrail_events,
      high_risk_unused_count: gapData.summary.high_risk_unused_count || 0,
      api_relationships: rawGap.summary?.api_relationships || 0,
      traffic_relationships: rawGap.summary?.traffic_relationships || 0,
      total_evidence: rawGap.summary?.total_evidence || 0,
    },
    behavioral_authority: rawGap.behavioral_authority,
    permissions_analysis: (gapData.permissions_analysis || []).map((permission) => ({
      ...permission,
      service_prefix: permission.permission?.includes(":")
        ? permission.permission.split(":")[0]
        : undefined,
    })),
    used_permissions: gapData.used_permissions || [],
    unused_permissions: gapData.unused_permissions || [],
    high_risk_unused: gapData.high_risk_unused || [],
    confidence:
      typeof gapData.confidence === "string"
        ? { level: gapData.confidence }
        : ((gapData.confidence as unknown as Record<string, unknown>) || {}),
    confidence_groups: mappedConfidenceGroups,
    safety_vector: gapData.safety_vector || null,
    evidence_breakdown: rawGap.evidence_breakdown || {},
    is_remediable: gapData.is_remediable !== false,
    remediable_reason: gapData.remediable_reason || "",
    reason: gapData.reason ?? null,
    dependency_context: {
      // Absence is unknown, never an implicit successful dependency scan.
      status: gapData.dependency_context?.status || "not_computed",
      system: gapData.dependency_context?.system || null,
      dependencies: mappedDependencies,
      has_critical_dependencies: !!gapData.dependency_context?.has_critical_dependencies,
    },
    service_role_analysis: gapData.service_role_analysis,
    timestamp: rawGap.timestamp || new Date().toISOString(),
  }
}

export function IAMPermissionAnalysisModal({
  isOpen,
  onClose,
  roleName,
  findingId,
  systemName,
  identityType,
  viaInstanceProfile,
  onApplyFix,
  onSuccess,
  onRemediationSuccess,
  onRollbackSuccess,
  applyDisabled = false,
  authorityHoldReason = null,
}: IAMPermissionAnalysisModalProps) {
  // Fail-loud guard: refuse to render if system context is missing
  if (!systemName) {
    console.error('[IAMPermissionAnalysisModal] systemName prop missing — refusing safety check')
    return (
      <Alert variant="destructive">
        <AlertTitle>Safety check unavailable</AlertTitle>
        <AlertDescription>
          Cyntro could not verify safety for this role because system
          context is missing. Execution is blocked. Refresh the page,
          or contact support if this persists.
        </AlertDescription>
      </Alert>
    )
  }

  console.log('[IAMPermissionAnalysisModal] RENDER - isOpen:', isOpen, 'roleName:', roleName)
  const { toast } = useToast()
  const [gapData, setGapData] = useState<GapAnalysisData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tfAdapter, setTfAdapter] = useState<string>("unregistered")
  const [showSimulation, setShowSimulation] = useState(false)
  const [analysisTab, setAnalysisTab] = useState<'summary' | 'permissions' | 'context'>('summary')
  const [simulating, setSimulating] = useState(false)
  const [applying, setApplying] = useState(false)
  const [iamLpChangeSetExpanded, setIamLpChangeSetExpanded] = useState(false)
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequestSummary[]>([])
  const [approvalLoading, setApprovalLoading] = useState(false)
  const [approvalActionBusy, setApprovalActionBusy] = useState(false)
  const [approvalActionMode, setApprovalActionMode] = useState<ApprovalActionMode | null>(null)
  const [approvalActionRequestId, setApprovalActionRequestId] = useState<string | null>(null)
  const [approvalActionPermissions, setApprovalActionPermissions] = useState<string[]>([])
  const [approvalActionError, setApprovalActionError] = useState<string | null>(null)
  const [approvalActionState, setApprovalActionState] = useState(buildApprovalActionInitialState)
  // IAM rollback is a product invariant, not an operator preference. The
  // backend also enforces this before any AWS write.
  const createSnapshot = true
  // This flag no longer means "blindly detach a managed policy". When the
  // signed Preview plan requires it, the backend installs a lossless inline
  // replacement containing every kept action, then detaches the immutable
  // managed policy. It remains OFF until that explicit plan arrives.
  const [detachManagedPolicies, setDetachManagedPolicies] = useState(false)
  const [managedPolicyRewriteRequired, setManagedPolicyRewriteRequired] = useState(false)
  // Broad detachment is not a valid operation in the permission picker. The
  // operator selects exact actions; the signed plan owns the execution shape.
  const detachAllManagedPolicies = false
  const [selectedPermissionsToRemove, setSelectedPermissionsToRemove] = useState<Set<string>>(new Set())
  // In-app override confirmation modal. Replaces the old window.confirm
  // + window.prompt flow with a clean dialog that captures the rationale
  // + rollback acknowledgement. On submit -> handleApplyFix(true, lineage)
  // bypasses the native dialogs and proceeds straight to the API call.
  // The modal stays OPEN through the API call and shows result inline
  // (spinner -> ✓ success or ✗ error) so the operator sees explicit
  // feedback even if the toast component is hidden/missed.
  // State shape preserved for back-compat with ~55 existing references
  // throughout this file. The shared modal component
  // (override-modal-shared.tsx) is invoked from renderOverrideModal()
  // via a thin state adapter that translates between this legacy shape
  // and SharedOverrideState. New fields (operatorName, operatorEmail)
  // are additive — older code paths that don't touch them keep working.
  const [overrideModal, setOverrideModal] = useState<{
    open: boolean
    rationale: string
    ackRollback: boolean
    phase: 'form' | 'applying' | 'success' | 'error'
    message: string
    // New fields are OPTIONAL so the existing ~55 setOverrideModal
    // call sites that don't include them keep compiling. The shared-
    // modal adapter at renderOverrideModal() supplies safe defaults
    // (empty strings, empty array) when reading via `??`.
    operatorName?: string
    operatorEmail?: string
    blockReasons?: string[]
  }>({
    open: false,
    rationale: '',
    ackRollback: true,
    phase: 'form',
    message: '',
    operatorName: '',
    operatorEmail: '',
    blockReasons: [],
  })
  // SSR-safe portal mount flag — false on server and on the very first
  // client render (matches server output → no hydration mismatch), then
  // flips true after mount so createPortal runs only client-side.
  // Without this, conditionally rendering a portal based on a
  // `typeof document !== 'undefined'` check during render produces a
  // server-vs-client tree mismatch warning that can silently abort the
  // override modal subtree mount in production.
  const [portalReady, setPortalReady] = useState(false)
  useEffect(() => { setPortalReady(true) }, [])
  const [confidenceScore, setConfidenceScore] = useState<ConfidenceScore | null>(null)
  const [confidenceLoading, setConfidenceLoading] = useState(false)
  const [provenance, setProvenance] = useState<Provenance | null>(null)
  // Pipeline safety context from simulate-fix. When populated this is the
  // AUTHORITATIVE decision source — Agent 5 (confidenceScore) is merely
  // an explainer subordinate to it. See Layer 1/2 in backend.
  const [safetyContext, setSafetyContext] = useState<SimulateFixSafety | null>(null)
  const [removalSafety, setRemovalSafety] = useState<RemovalSafetyBundle | null>(null)
  // Counts from the same state-bound Preview response as SafetyVector. This
  // prevents the headline from disagreeing with the Resource Risk row when an
  // older gap-analysis snapshot is still cached.
  const [previewProblem, setPreviewProblem] = useState<SimulateFixProblem | null>(null)
  const [previewObservationDays, setPreviewObservationDays] = useState<number | null>(null)
  const [decisionPersistence, setDecisionPersistence] = useState<SimulateFixDecisionPersistence | null>(null)
  // Signed remediation plan from simulate-fix (exact-change binding). The
  // plan_token binds a FROZEN permission set; the backend, when it receives the
  // token, executes plan.permissions_to_remove AS-IS. planPermissions is that
  // bound set (the SAFE_TO_STAGE set). We forward the token on Apply ONLY when
  // the operator's current selection still equals it (see handleApplyFix), so
  // sending it can never execute a different set than what is shown.
  const [planToken, setPlanToken] = useState<string | null>(null)
  const [planPermissions, setPlanPermissions] = useState<string[] | null>(null)
  const [breakGlassPlanActive, setBreakGlassPlanActive] = useState(false)
  const [breakGlassPreparing, setBreakGlassPreparing] = useState(false)
  // Default to `true` so the FIRST render shows the loading skeleton,
  // not the "Cyntro could not verify safety" red fallback below
  // (which only fires correctly once the fetch has actually completed
  // without producing a safety context). The useEffect that drives
  // fetchSafetyContext fires AFTER the first render -- without this
  // default, users see a brief red flash before the loading state
  // kicks in. Bug surfaced 2026-05-07 ("its appear and than gone").
  const [safetyLoading, setSafetyLoading] = useState(true)
  // Only the newest simulation request may update decision-bearing state.
  // This prevents the background request fired on open from arriving after a
  // user-triggered simulation and restoring an older decision/plan.
  const simulateFixRequestVersion = useRef(0)

  // Fetch gap analysis + pipeline safety context when modal opens. The
  // confidence call is CHAINED off the safety context so we can pass it
  // as pipeline_decision — this is what makes Agent 5 subordinate to the
  // pipeline verdict in the modal (not just in the backend).
  useEffect(() => {
    if (!isOpen || !roleName) return
    fetchGapAnalysis()
    let cancelled = false
    ;(async () => {
      const safety = await fetchSafetyContext()
      if (cancelled) return
      fetchConfidenceScore(safety)
    })()
    return () => { cancelled = true }
  }, [isOpen, roleName, findingId])

  useEffect(() => {
    if (!isOpen || !systemName) {
      setTfAdapter("unregistered")
      return
    }
    let cancelled = false
    const params = new URLSearchParams({ tenant_id: systemName })
    if (gapData?.role_arn) params.set("cloud_ref", gapData.role_arn)
    void fetch(`/api/proxy/change-executions/ownership/terraform?${params.toString()}`, {
      cache: "no-store",
    })
      .then((res) => res.json().catch(() => ({})))
      .then((payload) => {
        if (cancelled) return
        if (payload?.execution_adapter) {
          setTfAdapter(payload.execution_adapter)
          return
        }
        const match = (Array.isArray(payload?.bindings) ? payload.bindings : []).find(
          (row: { cloud_ref?: string; role_arn?: string }) =>
            (row.cloud_ref || row.role_arn) === gapData?.role_arn,
        )
        setTfAdapter(match?.execution_adapter || "unregistered")
      })
      .catch(() => {
        if (!cancelled) setTfAdapter("unregistered")
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, systemName, gapData?.role_arn])

  const fetchApprovalRequests = async () => {
    if (!roleName) return
    setApprovalLoading(true)
    try {
      const query = new URLSearchParams({
        role_name: roleName,
        limit: "10",
      })
      if (systemName) query.set("system_name", systemName)
      const response = await fetch(`/api/proxy/iam-roles/approval-requests?${query.toString()}`, {
        cache: "no-store",
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.detail || data.error || `Approval requests failed: ${response.status}`)
      }
      setApprovalRequests(Array.isArray(data.requests) ? data.requests : [])
    } catch (error) {
      console.warn("[IAM-Modal] Failed to fetch approval requests:", error)
      setApprovalRequests([])
    } finally {
      setApprovalLoading(false)
    }
  }

  useEffect(() => {
    if (!isOpen || !roleName) return
    void fetchApprovalRequests()
  }, [isOpen, roleName, systemName])

  const openApprovalAction = (
    mode: ApprovalActionMode,
    options?: { requestId?: string | null; permissions?: string[] },
  ) => {
    setApprovalActionMode(mode)
    setApprovalActionRequestId(options?.requestId ?? null)
    setApprovalActionPermissions(options?.permissions ?? [])
    setApprovalActionError(null)
    setApprovalActionState(buildApprovalActionInitialState())
  }

  const closeApprovalAction = () => {
    setApprovalActionMode(null)
    setApprovalActionRequestId(null)
    setApprovalActionPermissions([])
    setApprovalActionError(null)
    setApprovalActionState(buildApprovalActionInitialState())
  }

  // One selection source for the entire modal. A signed plan wins; otherwise
  // use exactly the REMOVAL_CANDIDATE actions from the same simulate-fix
  // snapshot rendered by Summary and Permissions. Never initialize from the
  // legacy gap-analysis classifications: the two requests can resolve in
  // either order and previously made the selected count jump from 0 to 2.
  useEffect(() => {
    if (!gapData || safetyLoading) return
    const authority = resolveIamRemediationAuthority({
      legacyIsRemediable: gapData.is_remediable,
      legacyReason: gapData.remediable_reason,
      canonicalDecision: safetyContext?.decision_canonical,
      canonicalReason: safetyContext?.unsafe_reasons?.[0],
      planToken,
      planPermissions,
    })
    if (breakGlassPlanActive && planPermissions) {
      setSelectedPermissionsToRemove(new Set(planPermissions))
      return
    }
    if (authority.hardBlocked || authority.evidenceUnavailable) {
      setSelectedPermissionsToRemove(new Set())
      return
    }
    if (removalSafety) {
      // Defense in depth: a stale/legacy signed plan must never select an
      // action the displayed scorer marks USED, PROTECTED, or unassessed.
      // When the sets disagree we select only displayed candidates; the token
      // equality check in Apply then also prevents forwarding the stale plan.
      setSelectedPermissionsToRemove(new Set(
        resolveDefaultPermissionSelection(removalSafety, planPermissions),
      ))
      return
    }
    if (planPermissions) {
      setSelectedPermissionsToRemove(new Set(planPermissions))
      return
    }
    // Backward-compatible fallback only when simulate-fix returned no v2
    // bundle. The UI labels this legacy state separately and Apply remains
    // governed by the normal remediability gate.
    setSelectedPermissionsToRemove(new Set(gapData.unused_permissions))
  }, [breakGlassPlanActive, planPermissions, planToken, removalSafety, safetyContext?.decision_canonical, safetyContext?.unsafe_reasons, gapData, safetyLoading])

  const fetchSafetyContext = async (): Promise<SimulateFixSafety | null> => {
    const requestVersion = ++simulateFixRequestVersion.current
    setSafetyLoading(true)
    setSafetyContext(null)
    setRemovalSafety(null)
    setPreviewProblem(null)
    setPreviewObservationDays(null)
    setDecisionPersistence(null)
    setPlanToken(null)
    setPlanPermissions(null)
    setBreakGlassPlanActive(false)
    setManagedPolicyRewriteRequired(false)
    setDetachManagedPolicies(false)
    try {
      const res = await fetch('/api/proxy/least-privilege/simulate-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_type: 'IAMRole',
          resource_id: roleName,
          system_name: systemName,
          finding_id: findingId,
        }),
      })
      if (!res.ok) {
        console.warn('[IAM-Modal] simulate-fix fetch non-200:', res.status)
        return null
      }
      const data = await res.json()
      if (requestVersion !== simulateFixRequestVersion.current) return null
      return applySimulateFixSnapshot(data)
    } catch (e) {
      console.warn('[IAM-Modal] simulate-fix fetch failed:', e)
      return null
    } finally {
      setSafetyLoading(false)
    }
  }

  /**
   * Replace every decision-bearing field from one simulate-fix response.
   *
   * The Preview button used to open the Simulation Results drawer from the
   * response it had just received while leaving safety, plan and observation
   * state behind from the modal's earlier background request. That allowed a
   * fresh REQUIRE_APPROVAL plan to be rendered with a stale "6/90 days" block
   * (or, more dangerously, a stale executable plan with a fresh BLOCK). Keep
   * this as the only response-to-state boundary so a simulation is one
   * internally consistent snapshot.
   */
  const applySimulateFixSnapshot = (data: any): SimulateFixSafety | null => {
      setRemovalSafety(
        data?.removal_safety?.shadow_only && Array.isArray(data.removal_safety.permissions)
          ? data.removal_safety as RemovalSafetyBundle
          : null,
      )
      setPreviewProblem(data?.problem ?? null)
      const observedDays = data?.evidence?.observation_window_days ?? data?.safety?.observation_days
      setPreviewObservationDays(typeof observedDays === 'number' ? observedDays : null)
      setDecisionPersistence(data?.decision_persistence ?? null)
      // Capture the signed plan (issued by simulate-fix when there is a
      // safely-removable set). plan.permissions_to_remove is the bound safe set.
      const plan = data?.plan
      const requiresManagedPolicyRewrite = plan?.detach_managed_policies === true
      setManagedPolicyRewriteRequired(requiresManagedPolicyRewrite)
      setDetachManagedPolicies(requiresManagedPolicyRewrite)
      if (plan?.plan_token && Array.isArray(plan?.permissions_to_remove)) {
        setPlanToken(String(plan.plan_token))
        setPlanPermissions((plan.permissions_to_remove as unknown[]).map((p) => String(p)))
      } else {
        // A newer blocked/no-plan response must revoke any older executable
        // token already held by the modal.
        setPlanToken(null)
        setPlanPermissions(null)
      }
      const safety = data?.safety as SimulateFixSafety | undefined
      if (safety) {
        setSafetyContext(safety)
        return safety
      }
      setSafetyContext(null)
      return null
  }

  const fetchConfidenceScore = async (pipelineSafety: SimulateFixSafety | null) => {
    setConfidenceLoading(true)
    setConfidenceScore(null)
    try {
      // Agent 5 subordination: pass the pipeline decision context so the
      // backend can floor the scorer's routing to the pipeline verdict.
      // When pipelineSafety is null (simulate-fix unavailable) the call
      // falls back to legacy behavior.
      const body: Record<string, unknown> = {
        role_name: roleName,
        permissions_to_remove: [],
      }
      if (pipelineSafety) {
        body.pipeline_decision = {
          decision_canonical: pipelineSafety.decision_canonical,
          decision: pipelineSafety.decision,
          observation_days: pipelineSafety.observation_days,
          telemetry_coverage: pipelineSafety.telemetry_coverage,
          consumer_count: pipelineSafety.consumer_count,
          shared: pipelineSafety.shared,
          completeness: pipelineSafety.completeness,
          unsafe_reasons: pipelineSafety.unsafe_reasons,
        }
      }
      const res = await fetch('/api/proxy/confidence/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) return
      const data = await res.json()
      if (typeof data?.confidence === 'number') {
        setConfidenceScore(data as ConfidenceScore)
      }
    } catch (e) {
      console.warn('[IAM-Modal] confidence fetch failed:', e)
    } finally {
      setConfidenceLoading(false)
    }
  }

  const fetchGapAnalysis = async (forceRefresh = false) => {
    setLoading(true)
    setError(null)
    try {
      console.log('[IAM-Modal] Fetching gap analysis for:', roleName, forceRefresh ? '(force refresh)' : '')
      const refreshParam = forceRefresh ? '&refresh=true' : ''
      const env = await fetchWithEnvelope<any>(
        `/api/proxy/iam-roles/${encodeURIComponent(roleName)}/gap-analysis?days=365${refreshParam}`
      )
      setProvenance(env.provenance)
      const rawData = env.result
      console.log('[IAM-Modal] Raw API data:', rawData)
      console.log('[IAM-Modal] Raw data keys:', Object.keys(rawData))
      console.log('[IAM-Modal] Raw data summary:', rawData.summary)
      console.log('[IAM-Modal] Raw data allowed_count:', rawData.allowed_count)
      console.log('[IAM-Modal] Raw data used_count:', rawData.used_count)
      console.log('[IAM-Modal] Raw data used_permissions:', rawData.used_permissions?.length || 0)
      console.log('[IAM-Modal] Raw data unused_permissions:', rawData.unused_permissions?.length || 0)
      
      // Map API response (snake_case, flat) to expected format (nested summary)
      // API returns: allowed_count, used_count, unused_count, used_permissions[], unused_permissions[]
      // Modal expects: summary.total_permissions, summary.used_count, permissions_analysis[]
      
      // Try multiple field name variations
      const allowedCount = rawData.summary?.total_permissions ?? 
                          rawData.summary?.allowed_count ?? 
                          rawData.allowed_count ?? 
                          rawData.allowed_actions ?? 
                          (rawData.allowed_actions_list?.length || 0) ?? 0
      
      const usedCount = rawData.summary?.used_count ?? 
                       rawData.used_count ?? 
                       rawData.used_actions ?? 
                       (rawData.used_actions_list?.length || 0) ?? 0
      
      const unusedCount = rawData.summary?.unused_count ?? 
                         rawData.unused_count ?? 
                         rawData.unused_actions ?? 
                         (rawData.unused_actions_list?.length || 0) ?? 0
      
      const usedPerms = rawData.used_permissions || 
                       rawData.summary?.used_permissions || 
                       rawData.used_actions_list || 
                       []
      
      const unusedPerms = rawData.unused_permissions || 
                         rawData.summary?.unused_permissions || 
                         rawData.unused_actions_list || 
                         []
      
      // Use lists when available, but ALWAYS trust backend summary counts as authoritative
      // Lists may be empty when Neo4j has counts but not the actual permission arrays
      const actualUsedPerms = Array.isArray(usedPerms) ? usedPerms : []
      const actualUnusedPerms = Array.isArray(unusedPerms) ? unusedPerms : []

      // Backend summary counts are authoritative — lists are supplementary detail
      const finalUsedCount = actualUsedPerms.length > 0 ? actualUsedPerms.length : usedCount
      const finalUnusedCount = actualUnusedPerms.length > 0 ? actualUnusedPerms.length : unusedCount
      const finalTotalCount = allowedCount > 0 ? allowedCount : (finalUsedCount + finalUnusedCount)

      // LP score: trust backend first, then calculate from counts
      const derivedLpScore = rawData.summary?.lp_score ?? rawData.lp_score ??
        (finalTotalCount > 0 ? Math.round((finalUsedCount / finalTotalCount) * 100) : 0)

      // Track whether we have actual permission names or just counts
      const hasPermissionLists = actualUsedPerms.length > 0 || actualUnusedPerms.length > 0

      const mappedData: GapAnalysisData = {
        role_name: rawData.role_name || roleName,
        role_arn: rawData.role_arn,
        // Never invent a 365-day window when gap-analysis omits this field.
        // simulate-fix supplies the measured window and wins at render time.
        observation_days: rawData.observation_days ?? 0,
        // Measured bounds, or null. Absent bounds render as "not stored".
        observation_window: rawData.observation_window ?? null,
        // Backend remediability contract — consumed by the mutation gate below.
        is_remediable: rawData.is_remediable,
        remediable_reason: rawData.remediable_reason,
        reason: rawData.reason ?? null,
        summary: {
          // Always use backend counts — they come from Neo4j pre-computed data
          total_permissions: finalTotalCount,
          used_count: finalUsedCount,
          unused_count: finalUnusedCount,
          lp_score: derivedLpScore,
          overall_risk: rawData.summary?.overall_risk ?? rawData.overall_risk ?? 'MEDIUM',
          data_confidence: rawData.summary?.data_confidence ?? rawData.data_confidence,
          // null stays null: an unmeasured count is not zero events (F6).
          cloudtrail_events: rawData.summary?.cloudtrail_events ?? null,
          event_count_basis: rawData.summary?.event_count_basis ?? null,
          high_risk_unused_count: rawData.summary?.high_risk_unused_count ?? rawData.high_risk_unused?.length ?? 0
        },
        // Use backend's permissions_analysis when available (has real usage_count),
        // otherwise build from flat string arrays
        permissions_analysis: rawData.permissions_analysis?.length > 0
          ? rawData.permissions_analysis
          : [
            ...actualUsedPerms.map((p: string) => ({
              permission: p,
              status: 'USED' as const,
              risk_level: 'LOW' as const,
              recommendation: 'Keep this permission',
              usage_count: null  // No hardcoded count — will display "Active" instead of "1 API calls"
            })),
            ...actualUnusedPerms.map((p: string) => ({
              permission: p,
              status: 'UNUSED' as const,
              risk_level: (rawData.high_risk_unused || []).includes(p) ? 'HIGH' as const : 'MEDIUM' as const,
              recommendation: 'Remove this permission',
              usage_count: 0
            }))
          ],
        used_permissions: actualUsedPerms,
        unused_permissions: actualUnusedPerms,
        high_risk_unused: rawData.high_risk_unused || [],
        confidence: rawData.confidence?.level || rawData.confidence || 'HIGH',
        confidence_groups: rawData.confidence_groups || null,
        safety_vector: rawData.safety_vector || null,
        dependency_context: rawData.dependency_context,
        remediated_at: rawData.remediated_at || null,
        service_role_analysis: rawData.service_role_analysis || null
      }
      
      console.log('[IAM-Modal] Mapped data:', {
        total: mappedData.summary.total_permissions,
        used: mappedData.summary.used_count,
        unused: mappedData.summary.unused_count,
        permissions_analysis_count: mappedData.permissions_analysis.length,
        used_perms_count: mappedData.used_permissions.length,
        unused_perms_count: mappedData.unused_permissions.length
      })
      
      setGapData(mappedData)

      // Containment (P0-A): do NOT auto-enable managed-policy detach here.
      // The trigger condition (empty permission list but unused_count > 0) is
      // INDISTINGUISHABLE at the frontend from degraded/partial backend data:
      // a role whose excess is genuinely only in managed policies looks
      // identical to a role whose permission lists failed to hydrate. Silently
      // flipping on "Detach managed policies" AND "Detach ALL" on that
      // ambiguous signal turned incomplete data into the most aggressive
      // possible IAM mutation. Detaching managed policies is now always an
      // explicit operator choice via the checkboxes below.
    } catch (err: any) {
      console.error('[IAM-Modal] Error:', err)
      setError(err.message || 'Failed to fetch gap analysis')
    } finally {
      setLoading(false)
    }
  }

  // Set of permissions belonging to groups that backend marked auto_remediable.
  // Layer 1 contract: a permission is auto-remediable in three cases:
  //   1. Its group has auto_remediable=true outright.
  //   2. Its group has block_reason_code="telemetry_asymmetry" AND the
  //      permission's service has confirmed CloudTrail activity for the
  //      role. The asymmetry block is at the SERVICE level — backend GATE 2
  //      fires when a service is in aa_services_used but not in CT
  //      used_actions. Perms in services that DO have CT events are safe
  //      to remove even within an "asymmetry" group; only the asymmetric
  //      service's perms must be dropped.
  //   3. Otherwise (protected, needs_telemetry, inferred_usage, missing
  //      field) → not auto-remediable.
  //
  // Concrete example, alon-demo-ec2-role 2026-04-27:
  //   Group "EC2, IAM, S3 (13)" has auto_remediable=false,
  //   block_reason_code=telemetry_asymmetry. The 13 perms include:
  //     - 12 in services {s3, ec2} which DO have CT activity → safe
  //     - 1 (iam:ListRoles) in service iam which has zero CT events
  //       (this is the asymmetric service AA flagged) → unsafe
  //   Without this partial-remediation logic, the entire group was
  //   un-selectable; with it, Select All picks 12 and Apply Fix succeeds.
  const getAutoRemediablePermissions = (): Set<string> => {
    const result = new Set<string>()
    const groups = gapData?.confidence_groups?.groups ?? []

    // Services where the role has confirmed CloudTrail activity. Derived
    // from gapData.used_permissions — backend Phase 1's overlay populates
    // it from r.used_actions. Used to decide partial remediation within
    // telemetry_asymmetry groups.
    const ctServices = new Set<string>()
    for (const p of (gapData?.used_permissions ?? [])) {
      if (typeof p === 'string' && p.includes(':')) {
        ctServices.add(p.split(':')[0].toLowerCase())
      }
    }

    for (const g of groups) {
      if (g.auto_remediable === true) {
        for (const p of g.permissions) result.add(p.permission)
      } else if (g.block_reason_code === 'telemetry_asymmetry') {
        // Partial: include only perms whose service has confirmed CT activity.
        // The asymmetry trigger is at the service level — perms in confirmed
        // services pass GATE 2; perms in unconfirmed services would trip it.
        for (const p of g.permissions) {
          if (typeof p.permission === 'string' && p.permission.includes(':')) {
            const service = p.permission.split(':')[0].toLowerCase()
            if (ctServices.has(service)) {
              result.add(p.permission)
            }
          }
        }
      }
      // else (protected | needs_telemetry | inferred_usage | missing): exclude
    }
    return result
  }

  // Toggle permission selection
  const togglePermissionSelection = (permission: string) => {
    setSelectedPermissionsToRemove(prev => {
      const newSet = new Set(prev)
      if (newSet.has(permission)) {
        newSet.delete(permission)
      } else {
        newSet.add(permission)
      }
      return newSet
    })
  }

  // Select/deselect all unused permissions
  const selectAllPermissions = () => {
    if (gapData) {
      const autoRemediable = getAutoRemediablePermissions()
      setSelectedPermissionsToRemove(
        new Set(gapData.unused_permissions.filter(p => autoRemediable.has(p)))
      )
    }
  }

  const deselectAllPermissions = () => {
    setSelectedPermissionsToRemove(new Set())
  }

  const handleClose = () => {
    setShowSimulation(false)
    setAnalysisTab('summary')
    setGapData(null)
    setError(null)
    setManagedPolicyRewriteRequired(false)
    setDetachManagedPolicies(false)
    onClose()
  }

  const handlePrepareBreakGlass = async () => {
    if (!gapData || breakGlassPreparing) return
    const permissions = resolveBreakGlassPermissionSelection(
      removalSafety,
      gapData.unused_permissions,
    )
    if (permissions.length === 0) {
      toast({
        title: "No overpermission is available to remove",
        description: "Used and protected permissions are intentionally excluded from break-glass remediation.",
        variant: "destructive",
      })
      return
    }
    setBreakGlassPreparing(true)
    try {
      const response = await fetch('/api/proxy/least-privilege/break-glass-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_type: 'IAMRole',
          resource_id: gapData.role_arn || roleName,
          system_name: systemName,
          permissions_to_remove: permissions,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.plan?.plan_token) {
        const detail = payload?.detail
        const blockers = Array.isArray(detail?.blockers) ? detail.blockers.join(' ') : ''
        throw new Error(
          detail?.message || payload?.error || blockers
          || `Could not prepare break-glass plan (${response.status})`,
        )
      }
      const permissionsFromPlan = Array.isArray(payload.plan.permissions_to_remove)
        ? payload.plan.permissions_to_remove.map((item: unknown) => String(item))
        : permissions
      setPlanToken(String(payload.plan.plan_token))
      setPlanPermissions(permissionsFromPlan)
      setSelectedPermissionsToRemove(new Set(permissionsFromPlan))
      setManagedPolicyRewriteRequired(false)
      setDetachManagedPolicies(false)
      setBreakGlassPlanActive(true)
      setOverrideModal({
        open: true,
        rationale: '',
        ackRollback: true,
        phase: 'form',
        message: '',
        operatorName: '',
        operatorEmail: '',
        blockReasons: [
          overrideHoldReason || 'Canonical execution authority is unavailable.',
          'The selected permissions have incomplete or stale usage evidence.',
        ],
      })
    } catch (err: any) {
      toast({
        title: "Cannot prepare exact remediation",
        description: err?.message || 'Break-glass planning failed.',
        variant: "destructive",
      })
    } finally {
      setBreakGlassPreparing(false)
    }
  }

  const handleApplyFix = async (
    force: boolean = false,
    prebuiltLineage?: Record<string, any>,
    skipAutoClose: boolean = false,
    explicitPermissions?: string[],
  ): Promise<string | undefined> => {
    if (!gapData) return undefined

    const isBreakGlassSubmission = Boolean(
      force && prebuiltLineage && breakGlassPlanActive && planToken,
    )

    if (applyDisabled && !isBreakGlassSubmission) {
      toast({
        title: authorityHoldReason ? 'Execution authority is not ready' : 'Preview-only environment',
        description: authorityHoldReason ??
          'Cyntro can analyze and simulate this plan, but production changes are not enabled in this environment.',
        variant: authorityHoldReason ? 'destructive' : undefined,
      })
      return undefined
    }

    // Fail-closed (defense in depth): the backend marked this role not-remediable
    // — no attached policy data, or usage was never measured (data_confidence
    // UNKNOWN / reason 'usage_not_computed'). Refuse EVERY mutation path here
    // (Apply, Apply Anyway, Acknowledge & Apply, detach) regardless of which
    // caller reached this handler, so no code path can narrow on evidence we
    // don't have. Pairs with the UI gate in the button block and backend PR #519.
    const remediationAuthority = resolveIamRemediationAuthority({
      legacyIsRemediable: gapData.is_remediable,
      legacyReason: gapData.remediable_reason,
      canonicalDecision: safetyContext?.decision_canonical,
      canonicalReason: safetyContext?.unsafe_reasons?.[0],
      planToken,
      planPermissions,
    })
    if (remediationAuthority.hardBlocked && !isBreakGlassSubmission) {
      toast({
        title: "Apply blocked",
        description: remediationAuthority.effectiveReason,
        variant: "destructive",
      })
      return undefined
    }
    if (remediationAuthority.evidenceUnavailable && !isBreakGlassSubmission) {
      toast({
        title: "More data needed",
        description: remediationAuthority.effectiveReason
          || "Usage not computed — sync CloudTrail / behavioral usage before remediation.",
        variant: "destructive",
      })
      return undefined
    }

    // If this is an override (force=true) AND the caller didn't already
    // build a lineage payload, open the in-app confirmation modal and
    // exit. The modal's "Apply Anyway" button will call back into
    // handleApplyFix(true, builtLineage) which skips this branch and
    // proceeds straight to the API call. Replaces the old
    // window.confirm + window.prompt flow that looked like a system
    // error and silently cancelled on empty input.
    if (force && !prebuiltLineage) {
      setOverrideModal({ open: true, rationale: '', ackRollback: createSnapshot, phase: 'form', message: '' })
      return
    }

    // Per-permission auto-remediation gate: if user selected rows from
    // telemetry-gap groups (auto_remediable=false but not protected/SSM),
    // promote to force=true. With the new in-app override flow these
    // also route through the override modal -- no native dialogs.
    const autoRemediable = getAutoRemediablePermissions()
    const allSelected = explicitPermissions
      ? Array.from(new Set(explicitPermissions))
      : Array.from(selectedPermissionsToRemove)
    const selectionMatchesPlan = selectionMatchesSignedIamPlan(
      allSelected,
      planPermissions,
      planToken,
    )
    const executionMechanismMatchesPlan =
      detachManagedPolicies === managedPolicyRewriteRequired
      && !detachAllManagedPolicies
    if (!selectionMatchesPlan || !executionMechanismMatchesPlan) {
      toast({
        title: 'Verified plan required',
        description: 'The selected permissions no longer match the signed preview. Run Preview again before applying this IAM change.',
        variant: 'destructive',
      })
      return
    }
    const nonAutoSelected = allSelected.filter(p => !autoRemediable.has(p))
    let effectiveForce = force
    if (nonAutoSelected.length > 0 && !force) {
      // Open the override modal instead of running window.confirm.
      // When operator confirms, handleApplyFix re-runs with force=true.
      setOverrideModal({ open: true, rationale: '', ackRollback: createSnapshot, phase: 'form', message: '' })
      return
    }

    // Sprint 1 CP2 §7 — OverrideLineage. The in-app modal already
    // collected rationale + ackRollback; build the lineage payload here
    // by combining that with the selected groups' required
    // acknowledgements (so the audit record names exactly which
    // acknowledgements the operator implicitly confirmed by clicking
    // Apply Anyway).
    let overrideLineage: Record<string, any> | undefined = prebuiltLineage
    if (effectiveForce && !overrideLineage) {
      // Defensive fallback (shouldn't hit -- the early return above
      // routes the user through the modal first). Keep a minimal
      // lineage so the backend's CP2 §7 hard-reject doesn't reject a
      // legitimately operator-acknowledged override.
      const ackSet = new Set<string>()
      const groups = gapData?.confidence_groups?.groups ?? []
      const selectedSet = new Set(allSelected)
      for (const g of groups) {
        const overlap = (g.permissions || []).some(p => selectedSet.has(p.permission))
        if (!overlap) continue
        const acks = g.decision_contract?.operator_context?.override_requirements?.required_acknowledgements || []
        for (const a of acks) ackSet.add(a)
      }
      // Identity: pulled from localStorage (set by any prior SG/S3
      // override modal that captured operator name + email). Falls back
      // to "anonymous" with identity_source: "anonymous" when no prior
      // capture exists — backend audit log can flag those for review.
      // When SSO/auth lands, resolveOperatorIdentity() returns
      // identity_source: "auth_verified" instead.
      const _identity = resolveOperatorIdentity()
      overrideLineage = {
        rationale: 'Operator clicked Acknowledge & Apply on the safety hold modal.',
        acknowledged: Array.from(ackSet),
        rollback_plan_acknowledged: createSnapshot,
        overridden_by: _identity.identifier,
        overridden_at: new Date().toISOString(),
        identity_source: _identity.source,
      }
    }

    setApplying(true)
    // Hard timeout: without this, a hung proxy/backend means the override
    // modal stays in phase='applying' forever and the operator perceives
    // "click does nothing." The Vercel function maxDuration on the
    // remediate proxy is 300s, but the modal must surface a failure
    // long before that — 90s is generous (live IAM remediation usually
    // completes in 2-5s) and bounded enough to be actionable.
    const REMEDIATE_TIMEOUT_MS = 90_000
    const abortCtrl = new AbortController()
    const timeoutHandle = setTimeout(() => abortCtrl.abort(), REMEDIATE_TIMEOUT_MS)
    const reqStartedAt = Date.now()
    try {
      const permissionsToRemove = allSelected

      console.log('[IAM-Modal] Starting DIRECT MODIFY remediation for:', roleName)
      console.log('[IAM-Modal] Permissions to remove:', permissionsToRemove.length)
      console.log('[IAM-Modal] Create snapshot:', createSnapshot)
      console.log('[IAM-Modal] Detach managed policies:', detachManagedPolicies)
      console.log('[IAM-Modal] Detach ALL managed policies:', detachAllManagedPolicies)
      console.log('[IAM-Modal] Force override block:', effectiveForce, '(raw:', force, ', non-auto in selection:', nonAutoSelected.length, ')')
      console.log('[IAM-Modal] POST /api/proxy/cyntro/remediate (timeout=' + REMEDIATE_TIMEOUT_MS + 'ms)')

      const response = await fetch('/api/proxy/cyntro/remediate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortCtrl.signal,
        body: JSON.stringify({
          role_name: roleName,
          identity_type: identityType?.toLowerCase().includes('user') ? 'user' : 'role',
          dry_run: false,
          create_snapshot: createSnapshot,
          detach_managed_policies: detachManagedPolicies,
          detach_all_managed_policies: detachAllManagedPolicies,
          permissions_to_remove: permissionsToRemove,
          force: effectiveForce,
          plan_token: planToken,
          ...(overrideLineage ? { override_lineage: overrideLineage } : {}),
        })
      })
      clearTimeout(timeoutHandle)
      console.log('[IAM-Modal] Response received in', Date.now() - reqStartedAt, 'ms — status:', response.status)

      const result = await response.json()
      console.log('[IAM-Modal] Remediation response:', result)

      // Check response from proxy - it returns summary.unused_removed and success
      const permissionsRemoved = result.permissions_removed || result.summary?.unused_removed || 0
      const beforeTotal = result.summary?.before_total || 0
      const afterTotal = result.summary?.after_total || 0
      const snapshotId = result.snapshot_id
      const managedPoliciesDetached = result.managed_policies_detached || []
      const inlinePoliciesModified = result.inline_policies_modified || []

      if (result.success) {
        // Build description with details about DIRECT MODIFICATION
        let desc = ''

        // Show what was modified
        if (permissionsRemoved > 0) {
          desc = `Removed ${permissionsRemoved} unused permissions from ${roleName}`
        } else {
          desc = `Modified ${roleName}`
        }

        // Show managed policies detached
        if (managedPoliciesDetached.length > 0) {
          desc += `. Detached ${managedPoliciesDetached.length} managed policies`
        }

        // Show inline policies modified
        if (inlinePoliciesModified.length > 0) {
          desc += `. Modified ${inlinePoliciesModified.length} inline policies`
        }

        // Show snapshot ID for rollback
        if (snapshotId) {
          desc += `. Snapshot: ${snapshotId}`
        }

        // Show success toast with details
        toast({
          title: "✅ Remediation Applied Successfully",
          description: desc,
          variant: "default"
        })
        
        console.log('[IAM-Modal] Remediation successful, clearing caches...')
        
        // 1. Clear frontend cache for this role (force refresh)
        try {
          await fetch(`/api/proxy/iam-roles/${encodeURIComponent(roleName)}/gap-analysis?days=365&force_refresh=true`)
          console.log('[IAM-Modal] Cleared role cache')
        } catch (e) {
          console.warn('[IAM-Modal] Failed to clear role cache:', e)
        }
        
        // 2. Clear the LP issues cache (force refresh)
        try {
          await fetch(`/api/proxy/least-privilege/issues?force_refresh=true`)
          console.log('[IAM-Modal] Cleared LP issues cache')
        } catch (e) {
          console.warn('[IAM-Modal] Failed to clear LP cache:', e)
        }

        // Broadcast to cross-tree subscribers (Trust Boundary map,
        // dashboard counters, etc). LP Tab's own refresh is handled
        // by the onRemediationSuccess callback below — this is purely
        // for OTHER views. See lib/remediation-events.ts.
        dispatchRemediationChanged({
          action: "remediate",
          resource_type: "IAMRole",
          resource_id: roleName,
        })

        // Also call parent callback if provided
        if (onApplyFix) {
          onApplyFix({
            roleName,
            systemName,
            permissionsToRemove: gapData.unused_permissions,
            createSnapshot,
            confidence: calculateSafetyScore(),
            result
          })
        }
        
        // Remove this resource from the list
        if (onRemediationSuccess) {
          onRemediationSuccess(roleName, {
            snapshotId: snapshotId ?? null,
            eventId: result.event_id ?? null,
            rollbackAvailable: result.rollback_available === true,
            remediatedBy: result.remediated_by ?? null,
            remediatedAt: result.remediated_at ?? null,
            afterTotal: typeof afterTotal === 'number' ? afterTotal : null,
            removedCount: typeof permissionsRemoved === 'number' ? permissionsRemoved : null,
          })
        }

        // Refresh parent data
        onSuccess?.()

        // Close modal -- unless caller (e.g. the in-app override modal)
        // wants to show its own inline success state first. The override
        // modal calls handleApplyFix(true, lineage, /*skipAutoClose=*/ true)
        // and then transitions to phase='success'; the user clicks "Done"
        // on that surface to dismiss everything.
        if (!skipAutoClose) handleClose()
        return desc
      } else if (
        // Soft-gate: pipeline returned a decision that requires approval but
        // is NOT a hard BLOCK. The backend signals this with
        // decision="approval_required" and action_required="approval".
        // (See iam_gap_analysis.py: serialize_decision returns
        //  "approval_required" for REQUIRE_APPROVAL / MANUAL_REVIEW /
        //  CANARY_FIRST DecisionOutcomes — none of which are blocked=true.)
        // Surface the override prompt inline rather than throwing —
        // otherwise IAM remediation is unreachable, since the FULL_AUTO
        // threshold is structurally unreachable for IAMRoles with deps.
        !force && (result.decision === 'approval_required' || result.action_required === 'approval')
      ) {
        const reason = result.block_reason || result.message || 'Pipeline requires approval before applying.'
        const proceed = typeof window !== 'undefined'
          ? window.confirm(
              `This change requires approval to proceed.\n\n` +
              `Reason: ${reason}\n\n` +
              `Click OK to override and apply with a rollback snapshot. ` +
              `Cancel to abort and investigate first.`
            )
          : false
        if (proceed) {
          // Retry the same handler with force=true. handleApplyFix(true)
          // will run its own confirm() dialog as well; that's a second
          // chance for the operator to back out, deliberately preserved.
          setApplying(false)
          await handleApplyFix(true)
          return
        } else {
          // User declined override — surface a soft-toast, not an error.
          toast({
            title: "ⓘ Approval required",
            description: `Pipeline returned ${result.decision || 'approval_required'}. Investigate before proceeding.`,
            variant: "default",
          })
        }
      } else {
        // If not success, show appropriate error
        const errorMsg = result.error || result.message || 'Unknown error'
        throw new Error(`Remediation failed: ${errorMsg}`)
      }
    } catch (err: any) {
      clearTimeout(timeoutHandle)
      const elapsedMs = Date.now() - reqStartedAt
      // AbortError from our REMEDIATE_TIMEOUT_MS: surface as a clear
      // timeout message instead of the cryptic "AbortError" the browser
      // emits. The backend may still be processing — operator should
      // investigate via audit log before retrying to avoid a duplicate
      // mutation.
      const isTimeout = err?.name === 'AbortError' || err?.code === 20
      const friendlyMsg = isTimeout
        ? `Remediation request timed out after ${Math.round(elapsedMs / 1000)}s. The backend may still be processing — check the audit log before retrying.`
        : (err?.message || 'Failed to apply remediation')
      console.error('[IAM-Modal] Apply fix error after', elapsedMs, 'ms:', err?.name, err?.message)
      toast({
        title: isTimeout ? "⏱ Remediation Timed Out" : "❌ Remediation Failed",
        description: friendlyMsg,
        variant: "destructive"
      })
      // Replace the original err.message with our friendly version so the
      // override modal's catch shows a useful sentence instead of "AbortError".
      if (isTimeout) {
        err = new Error(friendlyMsg)
      }
      // After a failed apply (canary rollback, safety-gate block, etc.), the
      // role's gap-analysis state may have shifted: a perm we just tried to
      // remove might have been re-classified by the backend, or a service's
      // asymmetry signal may have updated. Re-fetch so the next retry sees
      // fresh auto_remediable / block_reason_code data instead of replaying
      // against stale gapData and hitting the same gate again.
      try {
        await fetchGapAnalysis(true)
      } catch (refetchErr) {
        console.warn('[IAM-Modal] Post-failure gap-analysis refetch failed:', refetchErr)
      }
      // When called from the in-app override modal (skipAutoClose=true),
      // re-throw so the modal's catch can transition to phase='error'
      // and render the failure inline. The destructive toast above is
      // a fallback in case the override modal isn't visible.
      if (skipAutoClose) {
        throw err
      }
    } finally {
      setApplying(false)
    }
    return undefined
  }

  const handleIAMLpSimulate = async (permissions: string[]) => {
    setSelectedPermissionsToRemove(new Set(permissions))
    await new Promise((resolve) => setTimeout(resolve, 0))
    // Preview is read-only. The restore point belongs to the atomic Apply
    // transaction immediately before the first AWS write.
    setShowSimulation(true)
  }

  const handleIAMLpApplySafeSet = async (permissions: string[]) => {
    await handleApplyFix(false, undefined, false, permissions)
  }

  const handleIAMLpRequestApproval = async (permissions: string[]) => {
    if (authorityHoldReason) {
      toast({
        title: "Approval unavailable",
        description: authorityHoldReason,
        variant: "destructive",
      })
      return
    }
    if (verdictBucket === "blocked") {
      toast({
        title: "Approval unavailable",
        description:
          (safetyContext?.unsafe_reasons?.[0] || "This role is blocked by the mutation boundary. Resolve the evidence issue and re-simulate first."),
        variant: "destructive",
      })
      return
    }
    if (!selectionMatchesSignedIamPlan(permissions, planPermissions, planToken)) {
      toast({
        title: "Verified plan required",
        description: "Approval must cover the exact permission set in the signed preview. Re-run Preview before requesting approval.",
        variant: "destructive",
      })
      return
    }
    openApprovalAction("request", { permissions })
  }

  const handleIAMLpApproveRequest = async (requestId: string) => {
    if (authorityHoldReason) {
      toast({
        title: "Approval unavailable",
        description: authorityHoldReason,
        variant: "destructive",
      })
      return
    }
    openApprovalAction("approve", { requestId })
  }

  const handleIAMLpRejectRequest = async (requestId: string) => {
    openApprovalAction("reject", { requestId })
  }

  const handleIAMLpExecuteApprovedRequest = async (requestId: string) => {
    if (applyDisabled || authorityHoldReason) {
      toast({
        title: "Execution blocked",
        description: authorityHoldReason ?? "Production IAM changes are not enabled in this environment.",
        variant: "destructive",
      })
      return
    }
    if (verdictBucket === "blocked") {
      toast({
        title: "Execution blocked",
        description:
          (safetyContext?.unsafe_reasons?.[0] || "The approved request cannot execute until the safety hold is cleared."),
        variant: "destructive",
      })
      return
    }
    openApprovalAction("execute", { requestId })
  }

  // ─────────────────────────────────────────────────────────────────
  // overrideModalUI — extracted so it renders REGARDLESS of which
  // view is shown.
  //
  // Bug previously hit: the component has two early-return views
  // (Simulation Results at `if (showSimulation)`, and the Main
  // Permission Usage view as the final return). The override modal
  // subtree was only inline-rendered inside the Main view's return.
  // When operators clicked Acknowledge & Apply on the Simulation
  // Results view, the click handler fired and setOverrideModal({open:
  // true}) updated state, but the component re-rendered into the
  // Simulation view branch — never reaching the override modal JSX
  // below. Operators saw "click does nothing" because the modal was
  // gated behind a return statement that never executed.
  //
  // Extracting to a helper means both views can include
  // {renderOverrideModal()} as a sibling in their returns, and the
  // override modal renders independently of which view is active.
  // ─────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────
  // renderSafetyBreakdown — show the scoring engine's work.
  //
  // Per v5 §8 SafetyVector, the engine evaluates 7 dimensions. We
  // render every dimension with its actual score, status, and the
  // raw data behind the score. Operator sees how the verdict was
  // reached AND which dimension drove it.
  //
  // No single composite score (anti-pattern per
  // feedback_v5_no_raw_decision_enum.md). The "weakest dimension
  // wins" footer points at the dimension that drove the verdict.
  //
  // Dimensions not yet computed (replay certificate, drift parity,
  // live calibration) render as "⊘ — pending Phase 2" — honest
  // about what the engine doesn't yet have.
  // ─────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────
  // renderConfidenceCard — v4.4 §11E confidence-score-driven verdict.
  //
  // Per Cyntro_Architecture_v4_4.md §11E (LOCKED safety model), every
  // remediation has a numeric confidence score (0-100) that maps to
  // one of 4 states. Score is computed by the unified scorer and
  // returned via gapData.confidence_groups.overall_confidence.
  //
  //   AUTO              ≥ 0.85   →  Eligible for full auto-execute
  //   STAGED_AUTO       0.65-0.85 → Canary + staged; full needs approval
  //   SUGGEST           0.40-0.65 → Recommendation queued; no execution
  //   INSUFFICIENT_DATA < 0.40   →  Not enough data to remediate safely
  //
  // No BLOCK / EVIDENCE_CONFLICT — operator explicitly excluded those
  // states from the v4.4 model in this product. Hard guardrails do not
  // override the score in this simplified UX.
  //
  // Per-resource-type thresholds (v4.4 table):
  //   IAM role narrowing      AUTO 0.85, STAGED 0.65 (default — what we use)
  //   IAM permission deletion AUTO 0.90, STAGED 0.75
  //   SG narrowing            AUTO 0.90, STAGED 0.70
  //   SG deletion             AUTO 0.92, STAGED 0.75
  //   S3 control narrowing    AUTO 0.88, STAGED 0.70
  //   S3 prefix narrowing     AUTO 0.85, STAGED 0.65
  //
  // This component currently always renders for IAM role narrowing;
  // when SG / S3 modal variants land, parameterize the threshold table
  // by resource type.
  // ─────────────────────────────────────────────────────────────────
  const renderSafetyVectorDecision = () => {
    if (!safetyContext) return null

    const canonical = safetyContext.decision_canonical
      ?? (safetyContext.decision === 'blocked'
        ? 'BLOCK'
        : safetyContext.decision === 'approval_required'
          ? 'REQUIRE_APPROVAL'
          : 'AUTO_EXECUTE')
    const presentation: Record<DecisionOutcomeCanonical, {
      label: string
      color: string
      background: string
      border: string
    }> = {
      AUTO_EXECUTE: { label: 'Auto-execute', color: '#166534', background: '#f0fdf4', border: '#bbf7d0' },
      CANARY_FIRST: { label: 'Canary first', color: '#1d4ed8', background: '#eff6ff', border: '#bfdbfe' },
      REQUIRE_APPROVAL: { label: 'Approval required', color: '#92400e', background: '#fffbeb', border: '#fde68a' },
      MANUAL_REVIEW: { label: 'Manual review', color: '#6b21a8', background: '#faf5ff', border: '#e9d5ff' },
      BLOCK: { label: 'Blocked', color: '#991b1b', background: '#fef2f2', border: '#fecaca' },
      EXCLUDE: { label: 'Excluded', color: '#475569', background: '#f8fafc', border: '#cbd5e1' },
    }
    const style = presentation[canonical]
    const evaluatedAt = decisionPersistence?.evaluated_at
    const expiresAt = decisionPersistence?.expires_at
    const bundleHash = safetyContext.decision_bundle_hash

    return (
      <div
        className="rounded-xl border-2 p-4"
        style={{ backgroundColor: style.background, borderColor: style.border }}
        data-testid="safetyvector-decision"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: style.color }}>
              SafetyVector decision
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-xl font-bold" style={{ color: style.color }}>{style.label}</span>
              <span className="rounded border px-1.5 py-0.5 font-mono text-[10px]" style={{ color: style.color, borderColor: style.border }}>
                {canonical}
              </span>
            </div>
            <div className="mt-1 text-sm" style={{ color: style.color }}>
              {safetyContext.unsafe_reasons?.[0] || 'The shared safety engine evaluated this proposed change.'}
            </div>
          </div>
          <div className="text-right text-xs" style={{ color: style.color }}>
            <div className="font-semibold">
              Queue: {decisionPersistence?.persisted ? 'Decision saved' : 'Not saved'}
            </div>
            {expiresAt && <div className="mt-0.5 opacity-80">Expires {expiresAt}</div>}
          </div>
        </div>

        <div className="mt-3 grid gap-1 border-t pt-3 text-xs sm:grid-cols-2" style={{ borderColor: style.border, color: style.color }}>
          <div>
            <span className="font-semibold">Engine:</span>{' '}
            {safetyContext.engine_decision || 'pipeline decision'}
            {safetyContext.engine_version ? ` · v${safetyContext.engine_version}` : ''}
          </div>
          <div>
            <span className="font-semibold">Policy pack:</span>{' '}
            {safetyContext.policy_pack_versions?.join(', ') || '—'}
          </div>
          <div className="break-all">
            <span className="font-semibold">Reason codes:</span>{' '}
            {safetyContext.decision_reason_codes?.join(', ') || '—'}
          </div>
          <div className="font-mono" title={bundleHash || undefined}>
            <span className="font-sans font-semibold">Bundle:</span>{' '}
            {bundleHash ? `${bundleHash.slice(0, 12)}…` : '—'}
          </div>
          {evaluatedAt && (
            <div className="sm:col-span-2 opacity-80">
              Evaluated {evaluatedAt}
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderConfidenceCard = () => {
    if (!gapData) return null
    // calculateSafetyScore returns 0-100 already, with same-source
    // backend computation when overall_confidence is set; falls back
    // to a local heuristic only when backend doesn't provide it. It is
    // null only before gap data exists (F12); with no score there is no
    // band to draw, so render nothing rather than a number.
    const score = calculateSafetyScore()
    if (score == null) return null

    // v4.4 default thresholds for IAM role narrowing.
    const T_AUTO = 85
    const T_STAGED = 65
    const T_SUGGEST = 40

    let stateName: string
    let stateLabel: string
    let stateBlurb: string
    let stateColor: string
    let stateBg: string
    let stateBorder: string
    let stateIcon: string
    if (score >= T_AUTO) {
      stateName = 'AUTO'
      stateLabel = 'Ready for auto-execute'
      stateBlurb = 'Eligible for the full pipeline: canary → staged → full rollout, no manual approval needed.'
      stateColor = '#15803d'; stateBg = '#f0fdf4'; stateBorder = '#bbf7d0'; stateIcon = '✓'
    } else if (score >= T_STAGED) {
      stateName = 'STAGED_AUTO'
      stateLabel = 'Canary + staged auto'
      stateBlurb = 'Eligible for canary and staged rollout. Full rollout requires human approval.'
      stateColor = '#1e40af'; stateBg = '#eff6ff'; stateBorder = '#bfdbfe'; stateIcon = '◐'
    } else if (score >= T_SUGGEST) {
      stateName = 'SUGGEST'
      stateLabel = 'Suggested — needs approval'
      stateBlurb = 'Recommendation queued for human approval. No execution without sign-off.'
      stateColor = '#9a3412'; stateBg = '#fff7ed'; stateBorder = '#fed7aa'; stateIcon = '⚠'
    } else {
      stateName = 'INSUFFICIENT_DATA'
      stateLabel = 'Not enough data to remediate safely'
      stateBlurb = 'Resource visible but Cyntro lacks the evidence to act. Improve coverage or override.'
      stateColor = '#991b1b'; stateBg = '#fef2f2'; stateBorder = '#fecaca'; stateIcon = '⊘'
    }

    // Distance to next band — tells operator what to fix to climb.
    let distance: string | null = null
    if (score < T_SUGGEST) distance = `${T_SUGGEST - score} below SUGGEST`
    else if (score < T_STAGED) distance = `${T_STAGED - score} below STAGED_AUTO`
    else if (score < T_AUTO) distance = `${T_AUTO - score} below AUTO`
    else distance = 'cleared all thresholds'

    // CROSS-SYSTEM ROUTING GATE — sharing across multiple systems is a
    // routing eligibility gate, not just a confidence input. A role with
    // cross-system dependencies should NOT auto-route to STAGED/AUTO
    // even at high confidence; the operator must verify each dependent
    // system uses none of the proposed-removed permissions before
    // narrowing the role. The score still reflects the engine's
    // calibrated confidence; the routing chip is force-downgraded to
    // MANUAL_REVIEW with an explicit cross-system reason. Without this
    // gate, a role shared by 3 systems with score 80 would route
    // STAGED_AUTO and approve narrowing 10 permissions that any of the
    // 3 systems might depend on — a real foot-gun.
    const consumerCount = safetyContext?.consumer_count ?? 0
    const crossSystemGated = consumerCount > 1 && (stateName === 'STAGED_AUTO' || stateName === 'AUTO')
    if (crossSystemGated) {
      stateName = 'MANUAL_REVIEW'
      stateLabel = 'Cross-system review required'
      stateBlurb = `Role shared across ${consumerCount} systems — narrowing affects all of them. Verify each dependent system does not use the proposed-removed permissions before approving.`
      stateColor = '#9a3412'; stateBg = '#fff7ed'; stateBorder = '#fed7aa'; stateIcon = '⚠'
    }

    // When the shared pipeline returned a canonical decision, it owns the
    // action vocabulary. The numeric analyzer score remains visible as a
    // supporting signal, but it must not introduce a contradictory routing
    // tier such as INSUFFICIENT_DATA beside a canonical BLOCK.
    const canonical = safetyContext?.decision_canonical
    if (canonical) {
      const canonicalPresentation: Record<DecisionOutcomeCanonical, {
        label: string
        blurb: string
        color: string
        background: string
        border: string
        icon: string
      }> = {
        AUTO_EXECUTE: { label: 'Auto-execute', blurb: 'SafetyVector cleared this proposed change for automatic execution.', color: '#15803d', background: '#f0fdf4', border: '#bbf7d0', icon: '✓' },
        CANARY_FIRST: { label: 'Canary first', blurb: 'SafetyVector requires a canary before broader rollout.', color: '#1d4ed8', background: '#eff6ff', border: '#bfdbfe', icon: '◐' },
        REQUIRE_APPROVAL: { label: 'Approval required', blurb: 'SafetyVector requires explicit human approval.', color: '#92400e', background: '#fffbeb', border: '#fde68a', icon: '⚠' },
        MANUAL_REVIEW: { label: 'Manual review', blurb: 'SafetyVector requires an operator to review the evidence.', color: '#6b21a8', background: '#faf5ff', border: '#e9d5ff', icon: '⚠' },
        BLOCK: { label: 'Blocked', blurb: safetyContext.unsafe_reasons?.[0] || 'SafetyVector blocked this proposed change.', color: '#991b1b', background: '#fef2f2', border: '#fecaca', icon: '⊘' },
        EXCLUDE: { label: 'Excluded', blurb: 'SafetyVector excluded this proposed change from remediation.', color: '#475569', background: '#f8fafc', border: '#cbd5e1', icon: '⊘' },
      }
      const p = canonicalPresentation[canonical]
      stateName = canonical
      stateLabel = p.label
      stateBlurb = p.blurb
      stateColor = p.color
      stateBg = p.background
      stateBorder = p.border
      stateIcon = p.icon
      distance = 'Supporting confidence only — SafetyVector decides action readiness'
    }

    return (
      <div className="p-4 rounded-xl border-2" style={{ backgroundColor: stateBg, borderColor: stateBorder }}>
        <div className="flex items-start justify-between gap-4">
          {/* Score */}
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: stateColor, opacity: 0.8 }}>
              {canonical ? 'Supporting confidence' : 'Confidence'}
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-5xl font-bold tabular-nums leading-none" style={{ color: stateColor }}>{Math.round(score)}</span>
              <span className="text-base" style={{ color: stateColor, opacity: 0.7 }}>/ 100</span>
            </div>
            <div className="text-xs mt-2" style={{ color: stateColor, opacity: 0.85 }}>{distance}</div>
          </div>
          {/* Routing — confidence-derived recommendation, NOT execution
              state. "STATE" was ambiguous (could read as runtime
              execution state — drift / preflight / AWS reachable);
              "ROUTING" matches v4.4 §11E "decision routing" and makes
              clear this is what the SCORE recommends, not whether the
              system is actually allowed to execute. Apply-time gates
              (view_parity, drift, snapshot readiness) live in the
              unified pipeline and surface as errors at click-Apply
              time, not as header state. */}
          <div className="text-right shrink-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: stateColor, opacity: 0.8 }}>
              {canonical ? 'Decision' : 'Routing'}
            </div>
            <div className="flex items-center justify-end gap-2 mt-0.5">
              <span className="text-2xl" style={{ color: stateColor }}>{stateIcon}</span>
              <span className="text-lg font-bold tabular-nums" style={{ color: stateColor, fontFamily: 'ui-monospace, monospace' }}>{stateName}</span>
            </div>
            <div className="text-xs mt-1 font-semibold" style={{ color: stateColor }}>{stateLabel}</div>
          </div>
        </div>
        {/* Threshold bar */}
        <div className="mt-4 relative">
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#e5e7eb' }}>
            <div className="h-full transition-all" style={{ width: `${Math.max(2, Math.min(100, score))}%`, backgroundColor: stateColor }} />
          </div>
          {/* Threshold tick marks */}
          {[T_SUGGEST, T_STAGED, T_AUTO].map(t => (
            <div
              key={t}
              className="absolute top-0 h-2 w-0.5"
              style={{ left: `calc(${t}% - 1px)`, backgroundColor: '#94a3b8' }}
              title={`${t === T_SUGGEST ? 'SUGGEST' : t === T_STAGED ? 'STAGED_AUTO' : 'AUTO'} threshold`}
            />
          ))}
          <div className="mt-1 relative text-[10px]" style={{ color: 'var(--muted-foreground, #6b7280)', height: '1rem' }}>
            <span className="absolute" style={{ left: '0%' }}>0</span>
            <span className="absolute" style={{ left: `${T_SUGGEST}%`, transform: 'translateX(-50%)' }}>{T_SUGGEST} <span className="opacity-60">SUGGEST</span></span>
            <span className="absolute" style={{ left: `${T_STAGED}%`, transform: 'translateX(-50%)' }}>{T_STAGED} <span className="opacity-60">STAGED</span></span>
            <span className="absolute" style={{ left: `${T_AUTO}%`, transform: 'translateX(-50%)' }}>{T_AUTO} <span className="opacity-60">AUTO</span></span>
            <span className="absolute" style={{ right: '0%' }}>100</span>
          </div>
        </div>
        <div className="mt-6 text-sm" style={{ color: stateColor }}>{stateBlurb}</div>
        {/* v4.4 §11E dual-display: when role-level calibration penalties
            fired, surface the raw evidence score alongside the calibrated
            value so the operator sees BOTH numbers and the reasons.
            Without this the calibration is invisible and the score looks
            arbitrary. */}
        {(() => {
          const cg = gapData?.confidence_groups
          if (!cg) return null
          const rawScore = cg.evidence_overall_confidence
          const reasons = cg.calibration_reasons
          if (typeof rawScore !== 'number' || !reasons || Object.keys(reasons).length === 0) return null
          // Per-dimension penalty names with explicit point contributions —
          // operators can read exactly which dimension drove the calibration
          // delta instead of an opaque "missing dimension" label.
          const reasonEntries = Object.entries(reasons)
            .map(([key, factor]) => {
              const name = key.replace(/_/g, ' ').replace('penalty', '').trim()
              const pts = Math.round((1 - (factor as number)) * Math.round(rawScore))
              return name && pts > 0 ? `${name}: −${pts} pts` : null
            })
            .filter(Boolean)
          const factor: number = Object.values(reasons).reduce<number>((acc, m) => acc * (m as number), 1)
          const reductionPct = Math.round((1 - factor) * 100)
          return (
            <div className="mt-4 pt-4 border-t flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ borderColor: stateBorder, color: stateColor, opacity: 0.85 }}>
              <span className="font-mono">
                Evidence <span className="line-through opacity-60">{Math.round(rawScore)}</span>
                <span className="mx-1">→</span>
                <span className="font-bold">Calibrated {Math.round(score)}</span>
                <span className="opacity-70 ml-1">(−{reductionPct}%)</span>
              </span>
              <span className="opacity-80">{reasonEntries.length > 0 ? reasonEntries.join(' · ') : 'Reasons: composite calibration'}</span>
            </div>
          )
        })()}
      </div>
    )
  }

  const renderSafetyBreakdown = () => {
    if (!safetyContext) return null

    const tel = safetyContext.telemetry_coverage
    const obs = safetyContext.observation_days ?? observationDays
    const consumers = safetyContext.consumer_count ?? 0
    const events = cloudtrailEvents
    const sv = gapData?.safety_vector

    type Status = 'pass' | 'partial' | 'fail' | 'not_computed'
    type Dim = {
      key: string
      name: string
      score: number | null
      status: Status
      data: string
      hint?: string
    }

    const STATUS_ICON: Record<Status, string> = {
      pass: '✓',
      partial: '⚠',
      fail: '✗',
      not_computed: '⊘',
    }
    const STATUS_COLOR: Record<Status, string> = {
      pass: '#15803d',
      partial: '#9a3412',
      fail: '#991b1b',
      not_computed: '#9ca3af',
    }

    // Compute Behavioral evidence with an Observability cap.
    // The substrate-reality fix: a high event count combined with low
    // observability coverage is a contradiction (where did the events
    // come from if no sources are active?). The honest calibration is
    // to cap Behavioral at the Observability score — we cannot claim
    // more behavioral trust than the evidence-source coverage supports.
    // Without this cap, the modal displays the contradiction directly
    // (Behavioral 100, Observability 0) which shreds the trust story
    // — a CISO reads it as "the engine doesn't know what it doesn't
    // know." See review 2026-06-14.
    // An unmeasured event count (null) is not_computed, not a score of 0 (F6).
    const behavioralRaw: number | null =
      events == null ? null : events > 200 ? 100 : events > 50 ? 75 : events > 0 ? 40 : 0
    const coverageScore = tel != null ? Math.round(tel * 100) : null
    const behavioralCapped: number | null =
      behavioralRaw == null
        ? null
        : coverageScore != null
          ? Math.min(behavioralRaw, coverageScore)
          : behavioralRaw
    const behavioralCapApplied =
      behavioralRaw != null && coverageScore != null && coverageScore < behavioralRaw

    const dimensions: Dim[] = [
      {
        key: 'behavioral',
        name: 'Behavioral evidence',
        score: behavioralCapped,
        status: behavioralCapped == null
          ? 'not_computed'
          : behavioralCapped >= 75 ? 'pass' : behavioralCapped >= 40 ? 'partial' : 'fail',
        data: behavioralCapApplied
          ? `${obs} days of observation · ${eventCountCopy.label} · score capped by Observability coverage`
          : `${obs} days of observation · ${eventCountCopy.label}`,
        hint: behavioralCapApplied
          ? 'Behavioral evidence cannot exceed Observability coverage — enable the missing sources to raise this score.'
          : events == null
            ? 'The windowed event count could not be measured; see the evidence basis.'
            : events <= 50 ? 'Increase observation window or wait for more activity.' : undefined,
      },
      {
        key: 'coverage',
        name: 'Observability coverage',
        score: coverageScore,
        status: tel == null ? 'not_computed' : tel >= 0.85 ? 'pass' : tel >= 0.5 ? 'partial' : 'fail',
        // Reconcile with the Behavioral evidence line: if events were captured
        // but coverage is low, surface BOTH numbers honestly so the operator
        // doesn't see a "0% sources / 500 events" contradiction without context.
        data: tel != null
          ? events != null && events > 0
            ? `${Math.round(tel * 100)}% of expected sources active · ${eventCountCopy.label} from active source(s)`
            : `${Math.round(tel * 100)}% of evidence sources active`
          : 'coverage not measured',
        hint: tel != null && tel < 0.85 ? 'Enable the missing evidence sources in this account.' : undefined,
      },
      {
        key: 'replay',
        name: 'Counterfactual replay',
        score: null,
        status: 'not_computed',
        data: 'replay certificate not yet computed (v5 Phase 2)',
      },
      {
        key: 'reversibility',
        name: 'Reversibility',
        score: sv?.rollback?.value != null ? Math.round(sv.rollback.value * 100) : 95,
        status: sv?.rollback?.snapshot_capable === false
          ? 'partial'
          : (sv?.rollback?.value ?? 0.95) >= 0.9 ? 'pass' : 'partial',
        data: sv?.rollback?.snapshot_capable === false
          ? 'rollback not confirmed for this resource type'
          : 'snapshot + restore confirmed',
      },
      {
        key: 'blast',
        name: 'Blast radius',
        score: consumers === 0 ? 100 : consumers <= 1 ? 75 : consumers <= 3 ? 50 : consumers <= 6 ? 30 : 10,
        status: consumers === 0 ? 'pass' : consumers <= 1 ? 'partial' : 'fail',
        data: consumers === 0
          ? 'no other systems depend on this resource'
          : `${consumers} dependent system${consumers === 1 ? '' : 's'} share this resource`,
        hint: consumers > 1 ? 'Verify each dependent system does not use the proposed-removed permissions.' : undefined,
      },
      {
        key: 'calibration',
        // Renamed from "Live calibration" — "live" implied customer-specific
        // history but this score is a Cyntro-fleet baseline against similar
        // role shapes. Customer-specific history would be a separate
        // dimension (and would only be meaningful after the customer has
        // accumulated their own remediation outcomes). Don't conflate.
        name: 'Fleet pattern confidence',
        score: sv?.health?.historical_success != null ? Math.round(sv.health.historical_success * 100) : null,
        status: sv?.health?.historical_success == null
          ? 'not_computed'
          : sv.health.historical_success >= 0.9 ? 'pass' : 'partial',
        data: sv?.health?.historical_success != null
          ? `${Math.round(sv.health.historical_success * 100)}% Cyntro-fleet historical success on similar role shapes (not customer-specific history)`
          : 'no L2 outcomes yet (v5 Phase 2)',
      },
      {
        key: 'drift',
        name: 'Drift & freshness',
        score: null,
        status: 'not_computed',
        data: 'live-state hash check not yet wired (v5 Phase 2)',
      },
    ]

    // Hide v5 Phase 2 placeholder rows from the visible breakdown.
    // Unscored placeholder dimensions (Counterfactual replay, Drift &
    // freshness, Live/Fleet calibration when not yet wired) appear in
    // the dimension list as structural scaffolding, but rendering them
    // in the operator-facing breakdown adds visual noise without
    // contributing to the composite. Show only the dimensions that
    // actually scored (status != 'not_computed'). When the v5 Phase 2
    // substrate ships, those rows will naturally appear because their
    // status flips from 'not_computed' to a real value.
    const visibleDimensions = dimensions.filter(d => d.status !== 'not_computed')

    // Find weakest dimension that drove the verdict (visible scored dims only).
    const computedFails = visibleDimensions
      .filter(d => d.status !== 'pass')
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    const weakest = computedFails[0]

    return (
      <div className="p-4 rounded-xl border bg-white" style={{ borderColor: 'var(--border, #e5e7eb)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted-foreground, #6b7280)' }}>
            Safety scoring breakdown
          </div>
          <div className="text-xs" style={{ color: 'var(--muted-foreground, #6b7280)' }}>
            Per-dimension scores from the engine
          </div>
        </div>
        <div className="space-y-1">
          {visibleDimensions.map(d => {
            const isWeakest = weakest && d.key === weakest.key
            return (
              <div
                key={d.key}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded"
                style={isWeakest ? { backgroundColor: '#fef3c7', border: '1px solid #fde68a' } : { border: '1px solid transparent' }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="shrink-0 w-5 text-center font-bold" style={{ color: STATUS_COLOR[d.status] }}>{STATUS_ICON[d.status]}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium" style={{ color: 'var(--foreground, #111827)' }}>{d.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground, #6b7280)' }}>{d.data}</div>
                    {d.hint && (
                      <div className="text-xs mt-0.5 italic" style={{ color: '#92400e' }}>→ {d.hint}</div>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xl font-bold tabular-nums leading-none" style={{ color: STATUS_COLOR[d.status] }}>
                    {d.score != null ? d.score : '—'}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--muted-foreground, #9ca3af)' }}>
                    {d.score != null ? '/ 100' : 'not computed'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-3 pt-2 border-t text-xs" style={{ borderColor: 'var(--border, #e5e7eb)', color: 'var(--muted-foreground, #6b7280)' }}>
          {/* Per v4.4 §11E, the composite confidence (shown in the
              card above) is a weighted formula of these dimensions —
              NOT min(). HARD evidence sources gate eligibility (their
              absence forces INSUFFICIENT_DATA regardless of score);
              SOFT signals scale within bands. The earlier "weakest
              dimension wins" framing was v5 §14 (p_break_upper_bound
              = max(bounds)), a different model that doesn't apply
              here. */}
          <span>
            Composite per v4.4 §11E. HARD evidence sources gate eligibility; SOFT signals scale the score within bands. The single confidence number above represents this composite.
          </span>
        </div>
      </div>
    )
  }

  const renderOverrideModal = () => {
    if (!overrideModal.open) return null

    // Aggregate required acknowledgements from the selected groups.
    // Computed on every render so the submit captures the LATEST
    // selection (operator can change selection while modal open).
    // Same logic the inline `Apply Anyway` onClick handler used before
    // this migration to OverrideModalShared.
    const ackSet = new Set<string>()
    const groups = gapData?.confidence_groups?.groups ?? []
    const selectedSet = new Set(Array.from(selectedPermissionsToRemove))
    for (const g of groups) {
      const overlap = (g.permissions || []).some((p: any) => selectedSet.has(p.permission))
      if (!overlap) continue
      const acks = g.decision_contract?.operator_context?.override_requirements?.required_acknowledgements || []
      for (const a of acks) ackSet.add(a)
    }

    // Adapter: SharedOverrideState ←→ legacy overrideModal shape.
    // 55 existing references in this file read/write the legacy shape;
    // we don't migrate those. The adapter only wraps the rendering.
    const sharedState: SharedOverrideState = {
      phase: overrideModal.open ? overrideModal.phase : 'closed',
      rationale: overrideModal.rationale,
      ackRollback: overrideModal.ackRollback,
      blockReasons: overrideModal.blockReasons ?? [],
      resultMessage: overrideModal.message,
      operatorName: overrideModal.operatorName ?? '',
      operatorEmail: overrideModal.operatorEmail ?? '',
    }

    const setSharedState = (next: SharedOverrideState) => {
      setOverrideModal({
        open: next.phase !== 'closed',
        phase: next.phase === 'closed' ? 'form' : next.phase,
        rationale: next.rationale,
        ackRollback: next.ackRollback,
        message: next.resultMessage,
        operatorName: next.operatorName,
        operatorEmail: next.operatorEmail,
        blockReasons: next.blockReasons,
      })
    }

    const onSharedSubmit = async (lineage: OverrideLineagePayload) => {
      try {
        // handleApplyFix already manages phase transitions internally
        // (applying → success/error) via setOverrideModal. We don't
        // need to wrap with try/catch transitions here — they'd race
        // with the internal ones. Pass-through only.
        await handleApplyFix(true, lineage as any, true)
      } catch (err: any) {
        // Defensive — handleApplyFix doesn't throw in practice (it
        // catches internally and sets phase='error'). Belt-and-
        // suspenders for the unexpected case.
        setOverrideModal((prev) => ({
          ...prev,
          phase: 'error',
          message: (err?.message || 'Apply failed').slice(0, 600),
        }))
      }
    }

    const contextBlurb = `Cyntro paused this change because telemetry coverage is incomplete and ${safetyContext?.consumer_count ?? 'multiple'} system${(safetyContext?.consumer_count ?? 0) === 1 ? '' : 's'} depend on this role. You can override and proceed — Cyntro creates a verified restore point before changing AWS, and records the override in the audit log.`

    return (
      <OverrideModalShared
        state={sharedState}
        setState={setSharedState}
        acknowledgedTags={Array.from(ackSet)}
        onSubmit={onSharedSubmit}
        contextBlurb={contextBlurb}
        rationalePlaceholder="e.g. Confirmed with @platform-team in #incidents that the 6 consumers don't use these permissions; ticket SECOPS-1842"
      />
    )
  }

  // ── Legacy inline override-modal renderer (kept for reference only) ──
  // Pre-migration this rendered ~170 lines of inline JSX. The
  // implementation above delegates to OverrideModalShared. The function
  // signature is preserved so the existing call sites (lines 1757,
  // 2685, and the inline duplicate at 2790+) continue to work.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _renderOverrideModalLegacy = () => {
    if (!overrideModal.open) return null
    return (
      <>
        {/* DIAGNOSTIC ribbon — fires regardless of CSS / portal /
            z-index. If this ribbon appears but the modal below
            doesn't, the bug is inside the modal subtree. */}
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            padding: '12px 24px',
            backgroundColor: '#dc2626',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '14px',
            textAlign: 'center',
            zIndex: 999999,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
          data-testid="override-modal-diagnostic-ribbon"
        >
          ⚠ OVERRIDE MODAL STATE = OPEN (phase: {overrideModal.phase}). If you see this ribbon but no modal below, the modal subtree render is failing — screenshot DevTools and send to claude.
        </div>
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            zIndex: 99999,
            visibility: 'visible',
            opacity: 1,
            pointerEvents: 'auto',
          }}
          aria-modal="true"
          role="dialog"
          data-testid="override-modal"
        >
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl">
            {overrideModal.phase === 'success' ? (
              <div className="text-center py-2">
                <CheckCircle className="w-12 h-12 mx-auto text-[#22c55e]" />
                <h3 className="mt-3 text-lg font-bold text-[#15803d]">Remediation applied</h3>
                <p className="mt-2 text-sm text-[var(--foreground,#374151)] whitespace-pre-line">{overrideModal.message}</p>
                <button
                  onClick={() => {
                    setOverrideModal({ open: false, rationale: '', ackRollback: true, phase: 'form', message: '' })
                    handleClose()
                  }}
                  className="mt-4 px-5 py-2 bg-[#22c55e] text-white rounded-lg font-bold hover:bg-[#16a34a]"
                >
                  Done
                </button>
              </div>
            ) : overrideModal.phase === 'error' ? (
              <div className="text-center py-2">
                <XCircle className="w-12 h-12 mx-auto text-[#ef4444]" />
                <h3 className="mt-3 text-lg font-bold text-[#991b1b]">Remediation failed</h3>
                <p className="mt-2 text-sm text-[var(--foreground,#374151)] whitespace-pre-line break-words">{overrideModal.message}</p>
                <div className="mt-4 flex justify-center gap-2">
                  <button
                    onClick={() => setOverrideModal({ ...overrideModal, phase: 'form', message: '' })}
                    className="px-4 py-2 border-2 border-[var(--border,#e5e7eb)] rounded-lg font-semibold text-[var(--foreground,#111827)] hover:bg-[var(--muted,#f3f4f6)]"
                  >
                    Try again
                  </button>
                  <button
                    onClick={() => setOverrideModal({ open: false, rationale: '', ackRollback: true, phase: 'form', message: '' })}
                    className="px-4 py-2 bg-[var(--foreground,#374151)] text-white rounded-lg font-semibold"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : overrideModal.phase === 'applying' ? (
              <div className="text-center py-6">
                <Loader2 className="w-12 h-12 mx-auto text-[#f59e0b] animate-spin" />
                <h3 className="mt-3 text-lg font-bold text-[#b45309]">Applying remediation…</h3>
                <p className="mt-2 text-sm text-[var(--muted-foreground,#6b7280)]">Snapshot, IAM mutate, and verify. Usually completes in a few seconds.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <Shield className="w-7 h-7 text-[#f59e0b]" />
                  <h3 className="text-lg font-bold text-[#b45309]">Override the safety hold?</h3>
                </div>
                <p className="text-sm text-[var(--foreground,#111827)] mb-4">
                  Cyntro paused this change because telemetry coverage is incomplete and {safetyContext?.consumer_count ?? 'multiple'} system{(safetyContext?.consumer_count ?? 0) === 1 ? '' : 's'} depend on this role. You can override and proceed -- Cyntro creates a verified restore point before changing AWS, and records the override in the audit log.
                </p>
                <label className="block text-xs font-semibold text-[#92400e] mb-1">
                  Why are you overriding? (Slack thread, ticket #, customer confirmation -- recorded in the audit trail)
                </label>
                <textarea
                  value={overrideModal.rationale}
                  onChange={(e) => setOverrideModal({ ...overrideModal, rationale: e.target.value })}
                  placeholder="e.g. Confirmed with @platform-team in #incidents that the 6 consumers don't use these permissions; ticket SECOPS-1842"
                  rows={3}
                  className="w-full border border-[var(--border,#d1d5db)] rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#f59e0b] mb-3"
                  autoFocus
                />
                <label className="flex items-start gap-2 mb-4 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overrideModal.ackRollback}
                    onChange={(e) => setOverrideModal({ ...overrideModal, ackRollback: e.target.checked })}
                    className="mt-0.5 w-4 h-4 text-[#f59e0b] rounded border-[var(--border,#d1d5db)] focus:ring-[#f59e0b]"
                  />
                  <span className="text-[var(--foreground,#374151)]">
                    I understand Cyntro will create a restore point before the change and I am responsible for verifying dependent systems after Apply.
                  </span>
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setOverrideModal({ open: false, rationale: '', ackRollback: true, phase: 'form', message: '' })}
                    disabled={applying}
                    className="px-4 py-2 border-2 border-[var(--border,#e5e7eb)] rounded-lg font-semibold text-[var(--foreground,#111827)] hover:bg-[var(--muted,#f3f4f6)] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      const trimmed = overrideModal.rationale.trim()
                      if (!trimmed) return
                      const ackSet = new Set<string>()
                      const groups = gapData?.confidence_groups?.groups ?? []
                      const selectedSet = new Set(Array.from(selectedPermissionsToRemove))
                      for (const g of groups) {
                        const overlap = (g.permissions || []).some((p: any) => selectedSet.has(p.permission))
                        if (!overlap) continue
                        const acks = g.decision_contract?.operator_context?.override_requirements?.required_acknowledgements || []
                        for (const a of acks) ackSet.add(a)
                      }
                      const _identity = resolveOperatorIdentity()
                      const lineage = {
                        rationale: trimmed,
                        acknowledged: Array.from(ackSet),
                        rollback_plan_acknowledged: overrideModal.ackRollback,
                        overridden_by: _identity.identifier,
                        overridden_at: new Date().toISOString(),
                        identity_source: _identity.source,
                      }
                      setOverrideModal({ ...overrideModal, phase: 'applying', message: '' })
                      try {
                        const desc = await handleApplyFix(true, lineage, true)
                        setOverrideModal({
                          open: true,
                          rationale: lineage.rationale,
                          ackRollback: overrideModal.ackRollback,
                          phase: 'success',
                          message: desc || 'The remediation completed successfully.',
                        })
                      } catch (err: any) {
                        setOverrideModal({
                          open: true,
                          rationale: lineage.rationale,
                          ackRollback: overrideModal.ackRollback,
                          phase: 'error',
                          message: (err?.message || 'The remediation request failed. Check console for details.').slice(0, 500),
                        })
                      }
                    }}
                    disabled={applying || !overrideModal.rationale.trim()}
                    className="px-5 py-2 bg-[#f59e0b] text-white rounded-lg font-bold hover:bg-[#d97706] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    title={!overrideModal.rationale.trim() ? "Rationale required for the audit log" : "Apply the change with override"}
                  >
                    <CheckSquare className="w-4 h-4" />
                    Apply Anyway
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </>
    )
  }

  // Calculate derived values
  const observationDays = previewObservationDays ?? gapData?.observation_days ?? 0
  const remediationAuthority = resolveIamRemediationAuthority({
    legacyIsRemediable: gapData?.is_remediable,
    legacyReason: gapData?.remediable_reason,
    canonicalDecision: safetyContext?.decision_canonical,
    canonicalReason: safetyContext?.unsafe_reasons?.[0],
    planToken,
    planPermissions,
  })
  const overallRisk = gapData?.summary?.overall_risk ?? 'UNKNOWN'
  // number | null. null means the backend could not measure the windowed
  // count; it is never coerced to 0 (F6).
  const cloudtrailEvents: number | null = gapData?.summary?.cloudtrail_events ?? null
  const eventCountCopy = iamEventCountCopy(cloudtrailEvents, gapData?.summary?.event_count_basis ?? null)

  const permissionView = buildCanonicalPermissionView(
    gapData?.permissions_analysis ?? [],
    removalSafety,
  )
  const usedPermissions = permissionView.used
  const unusedPermissions = [
    ...permissionView.removable,
    ...permissionView.review,
    ...permissionView.protected,
  ]

  // Once simulate-fix resolves, its immutable per-action partition is the
  // count source for every tab. Gap-analysis counts are only a legacy fallback.
  const usedCount = removalSafety
    ? permissionView.usedCount
    : gapData?.summary?.used_count ?? usedPermissions.length
  const unusedCount = removalSafety
    ? permissionView.unusedCount
    : gapData?.summary?.unused_count ?? unusedPermissions.length
  const totalPermissions = removalSafety
    ? permissionView.totalCount
    : gapData?.summary?.total_permissions ?? (usedCount + unusedCount)
  const lpScore = gapData?.summary?.lp_score ?? (totalPermissions > 0 ? Math.round((usedCount / totalPermissions) * 100) : 0)
  const hasPermissionLists = usedPermissions.length > 0 || unusedPermissions.length > 0

  const usedPercent = totalPermissions > 0 ? Math.round((usedCount / totalPermissions) * 100) : 0
  const unusedPercent = totalPermissions > 0 ? Math.round((unusedCount / totalPermissions) * 100) : 0
  const previewCounts = previewPermissionCounts(previewProblem, {
    usedCount,
    unusedCount,
    totalCount: totalPermissions,
  })
  const backendAnalysis = (gapData as any)?.service_role_analysis as BackendServiceRoleAnalysis | undefined
  const serviceAnalysis = backendAnalysis?.analysis || fallbackAnalyzeRole(
    roleName,
    cloudtrailEvents,
    unusedCount,
    (backendAnalysis as { status?: string } | undefined)?.status ?? null,
  )?.analysis
  const confidenceGroups = gapData?.confidence_groups
  const dependencyContext = gapData?.dependency_context
  const protectedSet = new Set(
    (confidenceGroups?.groups ?? [])
      .filter(g => g.protected || g.action === 'protected')
      .flatMap(g => g.permissions.map(p => p.permission))
  )
  const warnSet = new Set(
    (confidenceGroups?.groups ?? [])
      .filter(g => g.warn || g.action === 'warn_before_removing')
      .flatMap(g => g.permissions.map(p => p.permission))
  )
  const removablePerms = removalSafety
    ? permissionView.removable
    : unusedPermissions.filter(p => !protectedSet.has(p.permission) && !warnSet.has(p.permission))
  const warnPerms = removalSafety
    ? permissionView.review
    : unusedPermissions.filter(p => warnSet.has(p.permission))
  const protectedPerms = removalSafety
    ? permissionView.protected
    : unusedPermissions.filter(p => protectedSet.has(p.permission))
  const removableCount = removablePerms.length
  const overrideHoldReason = authorityHoldReason ?? (
    warnPerms.length > 0
      ? `${warnPerms.length} not-observed permission${warnPerms.length === 1 ? '' : 's'} still ${warnPerms.length === 1 ? 'has' : 'have'} incomplete action-level usage evidence.`
      : null
  )

  const renderChangeStatusCard = () => {
    if (!safetyContext) return null

    const readiness = automationReadiness(safetyContext.decision_canonical)
    const needs = previewEvidenceNeeds(safetyContext)
    const readinessStyle = {
      ready: { border: '#bbf7d0', bg: '#f0fdf4', color: '#166534', Icon: CheckCircle },
      review: { border: '#fde68a', bg: '#fffbeb', color: '#92400e', Icon: AlertTriangle },
      paused: { border: '#fecaca', bg: '#fef2f2', color: '#991b1b', Icon: Shield },
    }[readiness.tone]

    return (
      <section
        className="rounded-xl border-2 p-4"
        style={{ borderColor: readinessStyle.border, backgroundColor: readinessStyle.bg }}
        data-testid="change-status-card"
      >
        <div className="flex items-start gap-3">
          <readinessStyle.Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: readinessStyle.color }} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: readinessStyle.color }}>
                Change status
              </div>
              <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold" style={{ color: readinessStyle.color, borderColor: readinessStyle.border }}>
                {readiness.label}
              </span>
            </div>
            <h3 className="mt-1 text-lg font-bold" style={{ color: readinessStyle.color }}>{readiness.headline}</h3>

            {needs.length === 0 ? (
              <p className="mt-1 text-sm" style={{ color: readinessStyle.color }}>{readiness.detail}</p>
            ) : (
              <div className="mt-3 border-t pt-3" style={{ borderColor: readinessStyle.border }}>
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: readinessStyle.color }}>
                  Why Cyntro is waiting
                </div>
                <ul className="mt-2 space-y-2">
                  {needs.map((need) => (
                    <li key={need.id} className="text-sm text-slate-800">
                      <div className="font-semibold">{need.label}</div>
                      <div className="mt-0.5 text-xs text-slate-600">{need.action}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>
    )
  }

  const renderSimpleDecisionSummary = () => {
    if (!safetyContext) return null

    return (
      <div className="space-y-3" data-testid="resource-risk-simple-summary">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Over-permission summary
          </div>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-2xl font-bold text-slate-950">
                {previewCounts.unusedCount} of {previewCounts.totalCount} permissions were not used
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {previewCounts.usedCount} permission{previewCounts.usedCount === 1 ? ' was' : 's were'} observed in use and will be kept.
              </p>
            </div>
            <div className="rounded-lg bg-red-50 px-3 py-2 text-right">
              <div className="text-2xl font-bold tabular-nums text-red-600">{previewCounts.unusedPercent}%</div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-red-700">potential reduction</div>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-500">
            <div className="h-full bg-red-500" style={{ width: `${previewCounts.unusedPercent}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            “Not used” is the risk finding. Cyntro checks additional evidence before deciding whether removal is safe.
          </p>
        </section>

        {removalSafety ? <RemovalSafetyPanel bundle={removalSafety} /> : renderChangeStatusCard()}
      </div>
    )
  }

  const iamLpGap = useMemo(() => {
    const mapped = mapGapDataToIAMLp(gapData)
    return mapped
      ? {
          ...mapped,
          observation_days: observationDays,
          is_remediable: remediationAuthority.effectiveIsRemediable,
          remediable_reason: remediationAuthority.effectiveReason,
        }
      : null
  }, [gapData, observationDays, remediationAuthority.effectiveIsRemediable, remediationAuthority.effectiveReason])
  const iamLpSplit = useMemo(
    () => buildDecisionSplit(iamLpGap?.confidence_groups),
    [iamLpGap],
  )
  const latestApprovalRequest = useMemo<ApprovalRequestSummary | null>(() => {
    const matchingRequests = approvalRequests.filter((request) =>
      selectionMatchesSignedIamPlan(
        request.permissions_to_remove,
        planPermissions,
        planToken,
      ),
    )
    if (!matchingRequests.length) return null
    return (
      matchingRequests.find((request) => request.status === "PENDING_APPROVAL") ||
      matchingRequests.find((request) => request.status === "APPROVED") ||
      matchingRequests.find((request) => request.status === "EXECUTING") ||
      matchingRequests.find((request) => request.status === "EXECUTED") ||
      matchingRequests[0] ||
      null
    )
  }, [approvalRequests, planPermissions, planToken])
  const iamLpExecution = useMemo<ExecutionState>(
    () => ({
      approval: latestApprovalRequest,
      rollback: {
        available: !!gapData?.remediated_at,
        status: gapData?.remediated_at ? "ready" : "idle",
      },
    }),
    [gapData?.remediated_at, latestApprovalRequest],
  )
  const showLegacySummaryScaffolding = analysisTab === 'summary' && !iamLpGap

  const handleSubmitApprovalAction = async ({
    actorIdentifier,
    note,
  }: {
    actorIdentifier: string
    note: string
  }) => {
    if (!approvalActionMode) return

    setApprovalActionBusy(true)
    setApprovalActionError(null)

    try {
      if (approvalActionMode === "request") {
        if (!approvalActionPermissions.length) {
          throw new Error("No permissions selected for approval")
        }
        if (!selectionMatchesSignedIamPlan(
          approvalActionPermissions,
          planPermissions,
          planToken,
        )) {
          throw new Error(
            "Approval no longer matches the signed preview. Re-run Preview before requesting approval.",
          )
        }

        const response = await fetch("/api/proxy/iam-roles/approval-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role_name: roleName,
            system_name: systemName,
            permissions_to_remove: approvalActionPermissions,
            create_snapshot: createSnapshot,
            detach_managed_policies: detachManagedPolicies,
            detach_all_managed_policies: detachAllManagedPolicies,
            plan_token: planToken || undefined,
            requested_by: actorIdentifier,
            requester_note: note,
            summary: {
              total_permissions: totalPermissions,
              used_count: usedCount,
              unused_count: unusedCount,
              observation_days: observationDays,
              cloudtrail_events: cloudtrailEvents,
              auto_apply_count: iamLpSplit.autoApplyCount,
              needs_approval_count: iamLpSplit.needsApprovalCount,
              protected_count: iamLpSplit.protectedCount,
              selected_permissions_count: approvalActionPermissions.length,
              data_confidence: gapData?.summary?.data_confidence ?? null,
            },
          }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || data.success === false) {
          throw new Error(
            extractErrorMessage(data, "Failed to create approval request"),
          )
        }

        toast({
          title: "Approval request created",
          description: `${data.request?.request_id || "Request"} is now pending approval.`,
        })
        await fetchApprovalRequests()
        closeApprovalAction()
        return
      }

      if (!approvalActionRequestId) {
        throw new Error("No approval request selected")
      }

      const endpoint =
        approvalActionMode === "approve"
          ? `/api/proxy/iam-roles/approval-requests/${encodeURIComponent(approvalActionRequestId)}/approve`
          : approvalActionMode === "reject"
            ? `/api/proxy/iam-roles/approval-requests/${encodeURIComponent(approvalActionRequestId)}/reject`
            : `/api/proxy/iam-roles/approval-requests/${encodeURIComponent(approvalActionRequestId)}/execute`

      const body =
        approvalActionMode === "approve"
          ? { approved_by: actorIdentifier, note }
          : approvalActionMode === "reject"
            ? { rejected_by: actorIdentifier, note }
            : { executed_by: actorIdentifier, note }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.success === false) {
        throw new Error(
          extractErrorMessage(data, "Approval workflow action failed"),
        )
      }

      if (approvalActionMode === "approve") {
        toast({
          title: "Request approved",
          description: `${approvalActionRequestId} is ready for execution.`,
        })
      } else if (approvalActionMode === "reject") {
        toast({
          title: "Request rejected",
          description: `${approvalActionRequestId} was rejected and will not mutate AWS.`,
        })
      } else {
        const executionResult = data.result || {}
        const removed = executionResult.permissions_removed ?? "the stored"
        toast({
          title: "Approved request executed",
          description:
            typeof removed === "number"
              ? `Applied the approved change set and removed ${removed} permissions.`
              : "Applied the approved change set from the stored request.",
        })
        dispatchRemediationChanged({
          action: "remediate",
          resource_type: "IAMRole",
          resource_id: roleName,
        })
        onRemediationSuccess?.(roleName)
        onSuccess?.()
        await fetchGapAnalysis(true)
      }

      await fetchApprovalRequests()
      closeApprovalAction()
    } catch (error: any) {
      setApprovalActionError(error?.message || "Approval workflow action failed")
      throw error
    } finally {
      setApprovalActionBusy(false)
    }
  }

  const renderApprovalActionModal = () => (
    <ApprovalActionModal
      isOpen={approvalActionMode !== null}
      mode={approvalActionMode || "request"}
      actorName={approvalActionState.actorName}
      actorEmail={approvalActionState.actorEmail}
      note={approvalActionState.note}
      busy={approvalActionBusy}
      error={approvalActionError}
      onChange={setApprovalActionState}
      onClose={closeApprovalAction}
      onSubmit={handleSubmitApprovalAction}
    />
  )
  
  // Recording-period copy from the backend's measured bounds. The previous
  // code set the window end to `new Date()` and the start to today minus the
  // day count (F5); the evidence ends at the newest observed event, which on
  // C1 was 12 days before "today".
  const observationWindowCopy = iamObservationWindowCopy(
    gapData?.observation_window ?? null,
    observationDays,
  )

  // Safety score — uses backend-computed confidence when available. Returns
  // null before gap data exists: an unloaded modal has no score, and the
  // literal 95 that lived here was a fabricated one (F12).
  const calculateSafetyScore = (): number | null => {
    if (!gapData) return null
    // Comparisons below need a number; an unmeasured count (null) earns no
    // volume-based adjustment either way (F6).
    const knownEvents = cloudtrailEvents ?? 0

    // Use backend confidence engine score when available (data-driven, not hardcoded)
    if (gapData.confidence_groups?.overall_confidence != null) {
      let score = gapData.confidence_groups.overall_confidence

      // Apply service role penalty from trust policy analysis
      const backendAnalysis = (gapData as any)?.service_role_analysis as BackendServiceRoleAnalysis | undefined
      if (backendAnalysis?.is_service_role && backendAnalysis?.analysis?.cloudtrail_visible === false) {
        score = Math.min(score, 15) // Service role — hard cap
      }

      // Apply dependency penalty
      if (gapData.dependency_context?.has_critical_dependencies) {
        score = Math.max(10, score - 15)
      }

      return Math.max(5, Math.min(100, score))
    }

    // Fallback: compute locally if backend doesn't provide confidence_groups
    let score = 95
    const backendAnalysis = (gapData as any)?.service_role_analysis as BackendServiceRoleAnalysis | undefined
    const isKnownServiceRole = backendAnalysis?.is_service_role && backendAnalysis?.analysis?.cloudtrail_visible === false

    if (usedCount === 0 && unusedCount > 0) {
      if (isKnownServiceRole) {
        score = 15
      } else if (cloudtrailEvents === 0) {
        score = 35
      } else {
        score = 40
      }
    } else if (cloudtrailEvents === 0 && unusedCount > 0) {
      score = 35
    } else {
      const highRiskCount = gapData.high_risk_unused?.length ?? 0
      let highRiskPenalty = 0
      if (highRiskCount > 0) {
        if (knownEvents > 100000) highRiskPenalty = Math.min(3, highRiskCount)
        else if (knownEvents > 10000) highRiskPenalty = Math.min(5, Math.ceil(highRiskCount * 0.5))
        else if (knownEvents > 1000) highRiskPenalty = Math.min(8, highRiskCount)
        else highRiskPenalty = Math.min(12, highRiskCount * 2)
      }
      score -= highRiskPenalty
      if (knownEvents > 0 && knownEvents < 10) score -= 5
    }

    return Math.max(10, Math.min(100, score))
  }

  // Determine if remediation should be blocked
  const shouldBlockRemediation = () => {
    const backendAnalysis = (gapData as any)?.service_role_analysis as BackendServiceRoleAnalysis | undefined
    // Block if it's a critical service role
    if (backendAnalysis?.analysis?.severity === 'critical') return true
    return false
  }

  const legacySafetyScore = calculateSafetyScore()

  // One-score rule: when Agent 5's confidence scorer has returned, use it as
  // the single source of truth for the modal banner. The legacy client-side
  // calculateSafetyScore() stays as a fallback only while Agent 5 is loading
  // or if the /api/confidence/check call failed.
  // null until either scorer has a number. Unknown routes to manual review
  // below; it never reads as a high score (F12).
  const safetyScore: number | null = confidenceScore?.confidence ?? legacySafetyScore

  // ── Verdict bucket — PIPELINE IS AUTHORITATIVE ────────────────────
  // Source-of-truth hierarchy:
  //   1. safetyContext.decision_canonical      (unified pipeline — wins)
  //   2. confidenceScore.routing               (subordinated Agent 5)
  //   3. legacy score thresholds               (fallback while loading)
  //
  // Before Layer 3, the modal treated (2) as the primary. That let Agent
  // 5 show "SAFE TO APPLY / 95 confidence" on top of a pipeline BLOCK.
  // The pipeline decision is now the first read, so the badge can never
  // contradict the pipeline.
  // Bucket-name mapping kept stable for downstream consumers (VERDICT_CONFIG
  // lookup at line ~1987, plus `verdictBucket === 'blocked' | 'auto_execute'`
  // comparisons in both early-return views). Internal mapping now routes
  // through lib/decision-routing.toRoutingDecision so there is one source
  // of truth for legacy → canonical conversion. When the rest of the modal
  // migrates to RoutingDecision in a follow-up, this wrapper goes away.
  const CANONICAL_TO_BUCKET: Record<RoutingDecision,
    'blocked' | 'manual_review' | 'human_approval' | 'auto_execute'> = {
    INSUFFICIENT_DATA: 'blocked',
    SUGGEST: 'manual_review',
    STAGED_AUTO: 'human_approval',
    AUTO: 'auto_execute',
  }
  const canonicalToBucket = (d?: DecisionOutcomeCanonical | null):
    'blocked' | 'manual_review' | 'human_approval' | 'auto_execute' | null => {
    const routed = toRoutingDecision(d)
    return routed ? CANONICAL_TO_BUCKET[routed] : null
  }
  // Cap the non-pipeline fallback below auto_execute. The UI must never
  // render "SAFE TO APPLY" unless the unified pipeline explicitly said so.
  // If only Agent 5 (confidenceScore.routing) or the legacy score thresholds
  // are speaking, the highest the badge can go is "Human Approval" — the
  // operator decides, not the AI alone.
  const _pipelineBucket = canonicalToBucket(safetyContext?.decision_canonical ?? null)
  const _agentRouting = confidenceScore?.routing
  const _legacyFallback: 'blocked' | 'manual_review' | 'human_approval' =
    safetyScore == null || safetyScore < 50 ? 'manual_review'
      : 'human_approval'
  const _nonPipelineCandidate = _agentRouting ?? _legacyFallback
  // AI alone cannot approve auto-execute. Demote to human_approval if it tries.
  const _nonPipelineBucket: 'blocked' | 'manual_review' | 'human_approval' =
    _nonPipelineCandidate === 'auto_execute' ? 'human_approval' : _nonPipelineCandidate
  const verdictBucket: 'blocked' | 'manual_review' | 'human_approval' | 'auto_execute' =
    _pipelineBucket ?? _nonPipelineBucket

  // Copy for the "AI reviewer …" subtext on the banner. Subordination
  // text comes from backend pipeline_agreement when present. When the
  // modal talks to the subordinated /api/confidence/check with pipeline
  // context, this is always populated.
  const aiReviewerCopy = ((): string | null => {
    const agree = confidenceScore?.pipeline_agreement
    if (!agree) return null
    if (agree.reviewer_verdict === 'agrees') {
      return `Cyntro's AI reviewer agrees with the pipeline.`
    }
    // Subordinated: the deterministic pipeline math wins. Phrase
    // this as a feature, not jargon ("subordinated to" reads like
    // an internal error label).
    const firstReason = agree.caps_applied?.[0]?.reason
    return firstReason
      ? `The pipeline math takes precedence over the AI reviewer here -- ${firstReason}.`
      : `The pipeline math takes precedence over the AI reviewer here for safety.`
  })()

  const blockedReason =
    (remediationAuthority.hardBlocked || remediationAuthority.evidenceUnavailable
      ? remediationAuthority.effectiveReason
      : null)
      || null

  if (!isOpen) return null

  // Loading state
  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={REMEDIATION_MODAL_BACKDROP_STYLE}>
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-8 text-center">
          <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-[#8b5cf6]" />
          <h2 className="text-2xl font-bold mb-2 text-[var(--foreground,#111827)]">
            {applying ? 'Applying IAM change' : 'Analyzing permissions'}
          </h2>
          <p style={{ color: "var(--muted-foreground, #6b7280)" }}>
            {applying
              ? <>Creating a restore point, applying the selected permissions, and verifying AWS for <span className="font-bold" style={{ color: "var(--foreground, #111827)" }}>{roleName}</span>…</>
              : <>Analyzing usage data for <span className="font-bold" style={{ color: "var(--foreground, #111827)" }}>{roleName}</span>…</>}
          </p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={REMEDIATION_MODAL_BACKDROP_STYLE}>
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-8 text-center">
          <XCircle className="w-12 h-12 mx-auto mb-4 text-[#ef4444]" />
          <h2 className="text-2xl font-bold mb-2 text-[var(--foreground,#111827)]">Failed to Load Data</h2>
          <p className="mb-4" style={{ color: "var(--muted-foreground, #6b7280)" }}>{error}</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => fetchGapAnalysis()}
              className="px-4 py-2 bg-[#8b5cf6] text-white rounded-md hover:bg-[#7c3aed] text-sm font-medium flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
            <button
              onClick={handleClose}
              className="px-4 py-2 border border-[var(--border,#d1d5db)] rounded-md text-[var(--foreground,#374151)] hover:bg-gray-50 text-sm font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Simulation Loading
  if (simulating) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={REMEDIATION_MODAL_BACKDROP_STYLE}>
        <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full p-8">
          <h2 className="text-2xl font-bold mb-2 text-[var(--foreground,#111827)]">Simulating Permission Removal</h2>
          <p className="text-lg mb-6">
            <span className="font-bold" style={{ color: "var(--foreground, #111827)" }}>{roleName}</span>
            <span style={{ color: "var(--muted-foreground, #6b7280)" }}> - Analyzing {observationDays} days of permission usage...</span>
          </p>
          
          <div className="space-y-4">
            {[
              { title: "Loading usage history...", subtitle: cloudtrailEvents == null ? 'Analyzing observed API activity' : `Analyzing ${cloudtrailEvents.toLocaleString()} permission checks`, done: true },
              { title: "Identifying unused permissions...", subtitle: `Found ${unusedCount} never-used permissions`, done: true },
              { title: "Checking service dependencies...", subtitle: "Validating active services", done: true },
              {
                title: "Calculating removal evidence...",
                subtitle: "Combining observation, attribution, dependencies, and corroboration",
                done: false,
              }
            ].map((step, i) => (
              <div key={i} className={`flex items-start gap-4 p-4 rounded-lg ${step.done ? '' : 'ring-2'}`}>
                <div className="text-2xl">{step.done ? '✅' : '⏳'}</div>
                <div>
                  <div className="font-semibold" style={{ color: "var(--foreground, #111827)" }}>{step.title}</div>
                  <div className="text-sm " style={{ color: "var(--muted-foreground, #6b7280)" }}>{step.subtitle}</div>
                  {!step.done && (
                    <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--background, #f8f9fa)" }}>
                      <div className="h-full bg-[#8b5cf6] rounded-full animate-pulse" style={{ width: '70%' }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Simulation Results View
  if (showSimulation) {
    return (
      <>
      {renderOverrideModal()}
      {renderApprovalActionModal()}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={REMEDIATION_MODAL_BACKDROP_STYLE}>
        <div className="absolute inset-0" onClick={handleClose} />
        <div className="relative w-[900px] max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col my-4" style={{ background: "var(--card, #ffffff)" }}>
          {/* Header */}
          <div className="px-6 py-4 border-b flex items-center justify-between" style={{ background: "var(--background, #f8f9fa)", borderColor: "var(--border, #e5e7eb)" }}>
            <div>
              <h2 className="text-2xl font-bold" style={{ color: "var(--foreground, #111827)" }}>Simulation Results</h2>
              <p className="text-lg">
                <span className="font-bold" style={{ color: "var(--foreground, #111827)" }}>{roleName}</span>
                <span style={{ color: "var(--muted-foreground, #6b7280)" }}> - Permission Removal Analysis</span>
              </p>
            </div>
            <button onClick={handleClose} className="text-[var(--muted-foreground,#9ca3af)] hover:" style={{ color: "var(--muted-foreground, #6b7280)" }}>
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* v5 verdict banner — replaces the old "Safety Score Banner +
                Agent 5 Confidence Scorer + Service Usage Analysis" stack
                that showed a 100/100 confidence score next to a BLOCK
                decision (operators couldn't reconcile "100% safe →
                blocked"). New layout: typed verdict at the top, proposed
                change, why-paused gates as a fixable checklist, evidence
                summary as a binary checklist. Generic source labels so
                demo screen-recordings don't expose the AWS integration
                list. The legacy branches further down still render the
                detailed permission breakdown / context tabs. */}
            {(() => {
              const backendAnalysis = (gapData as any)?.service_role_analysis as BackendServiceRoleAnalysis | undefined
              const isServiceRole = backendAnalysis?.is_service_role && backendAnalysis?.analysis?.severity === 'critical'

              // Service-role hard-block stays as-is (different visual
              // treatment — destructive red, not amber).
              if (isServiceRole) {
                return (
                  <div className="p-6 bg-white border-2 border-red-400 rounded-2xl text-center">
                    <div className="flex items-center justify-center gap-3">
                      <XCircle className="w-10 h-10 text-[#ef4444]" />
                      <span className="text-2xl font-bold text-[#ef4444]">DO NOT APPLY — service role</span>
                    </div>
                    <p className="text-[#ef4444] mt-2 font-semibold">
                      This is an AWS service role. Removing permissions will break {backendAnalysis?.analysis?.service_name}.
                    </p>
                  </div>
                )
              }

              // Verdict header config per bucket. "blocked" is the
              // most common interactive case; the others map to
              // PR-001 §6 customer-facing posture.
              const VERDICT_CONFIG: Record<string, {
                label: string
                sublabel: string
                color: string
                bg: string
                border: string
                IconClass: typeof Shield
                showWhyPaused: boolean
              }> = {
                blocked: {
                  label: 'Paused — review required',
                  sublabel: 'Required evidence is incomplete in this account.',
                  color: '#92400e',
                  bg: '#fffbeb',
                  border: '#fde68a',
                  IconClass: Shield,
                  showWhyPaused: true,
                },
                manual_review: {
                  label: 'Manual review required',
                  sublabel: 'Some permissions need verification before remediation.',
                  color: '#9a3412',
                  bg: '#fff7ed',
                  border: '#fed7aa',
                  IconClass: AlertTriangle,
                  showWhyPaused: true,
                },
                human_approval: {
                  label: 'Approval required',
                  sublabel: 'A credible least-privilege change. Human approval required.',
                  color: '#1e40af',
                  bg: '#eff6ff',
                  border: '#bfdbfe',
                  IconClass: Shield,
                  showWhyPaused: true,
                },
                auto_execute: {
                  label: 'Ready to apply',
                  sublabel: 'All safety checks passed. Cyntro will create a rollback snapshot before mutation.',
                  color: '#15803d',
                  bg: '#f0fdf4',
                  border: '#bbf7d0',
                  IconClass: CheckCircle,
                  showWhyPaused: false,
                },
              }
              const cfg = VERDICT_CONFIG[verdictBucket as string] ?? VERDICT_CONFIG.blocked

              // Pull the most-actionable reason if available. Operator
              // sees ONE sentence at the top, not a stack of contradictory
              // signals.
              const primaryReason = safetyContext?.unsafe_reasons?.[0] ?? cfg.sublabel

              // The signed plan is the only source of truth for editable
              // deletion candidates. Gap-analysis groups can be older than
              // Preview and previously produced the impossible combination
              // "5 used / 23 protected / 13 deleted" for 27 total.
              const deletionCandidates = planPermissions ?? []
              const candidateSet = new Set(deletionCandidates)
              const selectedForDeletion = deletionCandidates.filter(permission =>
                selectedPermissionsToRemove.has(permission),
              )
              const planCounts = simulationPlanCounts(previewProblem, selectedForDeletion.length, {
                usedCount,
                unusedCount,
                totalCount: totalPermissions,
              })
              const manuallyKeptCount = deletionCandidates.length - selectedForDeletion.length
              const keptCount = planCounts.observedUsedCount + manuallyKeptCount
              const protectedCount = Math.max(
                0,
                planCounts.totalCount - planCounts.observedUsedCount - deletionCandidates.length,
              )

              // Why-paused gates — each is a binary check the operator
              // can act on. Only includes gates that actually apply to
              // this role's situation.
              const coveragePct = typeof safetyContext?.telemetry_coverage === 'number'
                ? Math.round(safetyContext.telemetry_coverage * 100)
                : 100
              const obsDays = typeof safetyContext?.observation_days === 'number'
                ? safetyContext.observation_days
                : observationDays
              const consumerCount = safetyContext?.consumer_count ?? 0
              const gates: Array<{ passed: boolean; label: string; hint: string }> = []
              if (coveragePct < 100) {
                gates.push({
                  passed: false,
                  label: `Telemetry coverage is ${coveragePct}%`,
                  hint: 'Enable the missing sources in this account to reach 100%.',
                })
              }
              if (obsDays < 21) {
                gates.push({
                  passed: false,
                  label: `Observation window is ${obsDays} days`,
                  hint: 'Cyntro needs ≥21 days of observation before automating production changes.',
                })
              }
              if (consumerCount > 0 && verdictBucket !== 'auto_execute') {
                gates.push({
                  passed: false,
                  label: `${consumerCount} system${consumerCount === 1 ? '' : 's'} depend on this role`,
                  hint: 'Verify each consumer does not use the proposed-removed permissions.',
                })
              }

              // Evidence summary — generic vendor-neutral labels.
              // Demo-safe (no AWS service names exposed). The N-of-6
              // count derives from telemetry_coverage so the proportion
              // matches reality without revealing which specific source
              // is missing.
              const TOTAL_EVIDENCE_SOURCES = 6
              const sourcesActive = Math.round((coveragePct / 100) * TOTAL_EVIDENCE_SOURCES)
              const EVIDENCE_LABELS = [
                'Activity history',
                'Permission usage',
                'Identity graph',
                'Network behavior',
                'Configuration baseline',
                'Application traces',
              ]
              const evidence = EVIDENCE_LABELS.map((name, i) => ({
                name,
                present: i < sourcesActive,
              }))

              return (
                <div className="space-y-3">
                  {/* v4.4 §11E confidence-score header — replaces the typed-
                      posture verdict ("Paused — review required") with the
                      numeric confidence + 4-state mapping (AUTO / STAGED_AUTO
                      / SUGGEST / INSUFFICIENT_DATA). The cfg.label / cfg.bg
                      typed-verdict styling is no longer applied; the
                      confidence card has its own per-state styling. */}
                  {removalSafety ? <RemovalSafetyPanel bundle={removalSafety} /> : renderChangeStatusCard()}
                  {false && (
                  <div
                    className="p-4 rounded-xl border-2"
                    style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}
                  >
                    <div className="flex items-start gap-3">
                      <cfg.IconClass className="w-7 h-7 shrink-0 mt-0.5" style={{ color: cfg.color }} />
                      <div className="min-w-0">
                        <div className="text-lg font-bold" style={{ color: cfg.color }}>{cfg.label}</div>
                        <div className="text-sm mt-1" style={{ color: cfg.color }}>{primaryReason}</div>
                      </div>
                    </div>
                  </div>
                  )}

                  <section className="rounded-xl border border-slate-200 bg-white p-4" data-testid="editable-change-plan">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Change plan</div>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                        <div className="text-2xl font-bold text-emerald-700">{keptCount}</div>
                        <div className="text-sm font-semibold text-emerald-800">Keep</div>
                        <div className="mt-1 text-xs text-emerald-700">
                          {planCounts.observedUsedCount} observed in use
                          {manuallyKeptCount > 0 ? ` + ${manuallyKeptCount} kept by you` : ''}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="text-2xl font-bold text-slate-700">{protectedCount}</div>
                        <div className="text-sm font-semibold text-slate-800">Protected</div>
                        <div className="mt-1 text-xs text-slate-600">Not eligible for deletion</div>
                      </div>
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                        <div className="text-2xl font-bold text-red-700">{selectedForDeletion.length}</div>
                        <div className="text-sm font-semibold text-red-800">Delete</div>
                        <div className="mt-1 text-xs text-red-700">Selected below</div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">Permissions selected for deletion</div>
                        <p className="mt-0.5 text-xs text-slate-600">
                          All deletion candidates are selected by default. Uncheck any permission you want to keep.
                        </p>
                      </div>
                      <div className="flex gap-2 text-xs">
                        <button
                          type="button"
                          className="font-semibold text-red-700 hover:underline"
                          onClick={() => setSelectedPermissionsToRemove(new Set(deletionCandidates))}
                        >
                          Delete all candidates
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          className="font-semibold text-slate-700 hover:underline"
                          onClick={() => {
                            setSelectedPermissionsToRemove(prev => {
                              const next = new Set(prev)
                              for (const permission of candidateSet) next.delete(permission)
                              return next
                            })
                          }}
                        >
                          Keep all candidates
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-2">
                      {deletionCandidates.map(permission => {
                        const selected = selectedPermissionsToRemove.has(permission)
                        return (
                          <label
                            key={permission}
                            className={`flex cursor-pointer items-center gap-3 rounded-md border p-2 transition-colors ${selected ? 'border-red-200 bg-white text-red-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => togglePermissionSelection(permission)}
                              className="h-4 w-4 rounded border-red-300 text-red-600 focus:ring-red-500"
                            />
                            <span className="min-w-0 flex-1 truncate font-mono text-xs">{permission}</span>
                            <span className={`text-[10px] font-bold uppercase ${selected ? 'text-red-700' : 'text-emerald-700'}`}>
                              {selected ? 'Delete' : 'Keep'}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </section>

                  {safetyContext?.shared_resource && safetyContext.shared_resource.consumer_count > 1 && (
                    <section
                      className="rounded-xl border border-amber-200 bg-amber-50 p-4"
                      data-testid="shared-role-impact"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                            Shared role impact
                          </div>
                          <h3 className="mt-1 font-semibold text-amber-950">
                            Approval is required for {safetyContext.shared_resource.consumer_count} attached consumers
                          </h3>
                          <p className="mt-1 text-sm text-amber-900">
                            The exact permission set will be frozen for review. AWS cannot be changed from this screen until that request is approved.
                          </p>
                        </div>
                        <a
                          href={`${safetyContext.shared_resource.ui_path || '/iam/shared-roles'}?system_name=${encodeURIComponent(systemName)}&role_ref=${encodeURIComponent(safetyContext.shared_resource.resource_id || roleName)}`}
                          className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                        >
                          Open Shared Resources
                        </a>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {safetyContext.shared_resource.consumers.map((consumer) => (
                          <div key={`${consumer.type}:${consumer.id}`} className="rounded-lg border border-amber-200 bg-white px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                              {consumer.type.replace(/_/g, ' ')}
                            </div>
                            <div className="mt-0.5 truncate font-mono text-xs text-slate-800" title={consumer.id}>
                              {consumer.name || consumer.id}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )

            })()}
            {/* Legacy confidence-group and dependency panels are intentionally
                removed from the rendered simulation workflow. They mix an
                older gap-analysis snapshot with the signed Preview plan and
                were the source of contradictory 4/5 and 23/9 counts. */}
            <div className="hidden" aria-hidden="true">
            {/* Permissions to Remove — Grouped by Backend Confidence Engine */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-lg" style={{ color: "var(--foreground, #111827)" }}>
                  Permissions to Remove ({unusedPermissions.length > 0 ? `${selectedPermissionsToRemove.size} of ${unusedCount} selected` : `${unusedCount} total`})
                </h3>
                {unusedPermissions.length > 0 && (
                  <div className="flex gap-2 text-xs">
                    <button
                      onClick={selectAllPermissions}
                      className="text-[#8b5cf6] hover:underline font-medium"
                    >
                      Select All
                    </button>
                    <span style={{ color: "var(--muted-foreground, #9ca3af)" }}>|</span>
                    <button
                      onClick={deselectAllPermissions}
                      className="text-[#8b5cf6] hover:underline font-medium"
                    >
                      Clear All
                    </button>
                  </div>
                )}
              </div>

              {/* Per-permission decisions — bucket summary by confidence
                  band. Replaces the static action-grouped tile grid with a
                  CONFIDENCE-BAND grouping the operator can act on directly:
                  each bucket has count + recommended action + one-click
                  "Select these N" button that adds the permissions in that
                  band to selectedPermissionsToRemove. Maps to v5 §5
                  CandidateSplitter — atomic candidates with per-candidate
                  confidence, exposed as actionable subsets rather than
                  aggregated to a misleading single role-level number. */}
              {gapData?.confidence_groups?.groups && (() => {
                type Perm = { permission: string; confidence_score: number }
                const removablePerms: Perm[] = []
                for (const g of gapData.confidence_groups.groups) {
                  if (g.protected || g.action === 'protected' || g.action === 'reserved') continue
                  for (const p of (g.permissions || [])) {
                    if (p.protected || p.reserved) continue
                    // v4.4 §11E: bucketing follows execution_confidence
                    // (calibration-aware, routing-driving) so that
                    // confidence-band selection matches the per-permission
                    // _action partition the backend computed. Falls back to
                    // confidence_score for older backend deploys that
                    // haven't shipped the dual-score split yet.
                    const score = typeof p.execution_confidence === 'number'
                      ? p.execution_confidence
                      : p.confidence_score
                    removablePerms.push({ permission: p.permission, confidence_score: score })
                  }
                }
                const protectedCount = (gapData.confidence_groups.summary.protected ?? 0) + (gapData.confidence_groups.summary.reserved ?? 0)

                const high = removablePerms.filter(p => p.confidence_score >= 90)
                const med  = removablePerms.filter(p => p.confidence_score >= 60 && p.confidence_score < 90)
                const low  = removablePerms.filter(p => p.confidence_score < 60)

                const selectBand = (perms: Perm[]) => {
                  setSelectedPermissionsToRemove(prev => {
                    const next = new Set(prev)
                    for (const p of perms) next.add(p.permission)
                    return next
                  })
                }
                const allSelected = (perms: Perm[]) => perms.length > 0 && perms.every(p => selectedPermissionsToRemove.has(p.permission))

                const buckets: Array<{
                  key: string
                  count: number
                  band: string
                  label: string
                  hint: string
                  color: string
                  bg: string
                  border: string
                  perms: Perm[]
                  actionable: boolean
                }> = []
                // Per feedback_safety_language.md: never claim "safe" when
                // the engine can't guarantee it. Per-permission high
                // confidence proves the USAGE gate passed for that
                // permission only — it does NOT clear role-level gates
                // (telemetry coverage, blast radius, drift). The verdict
                // header above is authoritative for the whole role; these
                // buckets describe per-permission usage evidence only.
                if (high.length > 0) buckets.push({
                  key: 'high', count: high.length, band: '90-100',
                  label: 'High confidence per permission — usage gates pass',
                  hint: 'Logged activity confirms zero usage in the observation window. Role-level gates may still require override — see the verdict above.',
                  color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0',
                  perms: high, actionable: true,
                })
                if (med.length > 0) buckets.push({
                  key: 'med', count: med.length, band: '60-89',
                  label: 'Medium confidence per permission — partial telemetry',
                  hint: 'Some evidence sources are missing for these permissions. Improve coverage or accept the gap via override.',
                  color: '#9a3412', bg: '#fff7ed', border: '#fed7aa',
                  perms: med, actionable: true,
                })
                if (low.length > 0) buckets.push({
                  key: 'low', count: low.length, band: '<60',
                  label: 'Low confidence per permission — investigation required',
                  hint: 'Insufficient evidence on these permissions. Improve coverage or accept the gap via override.',
                  color: '#991b1b', bg: '#fef2f2', border: '#fecaca',
                  perms: low, actionable: true,
                })
                if (protectedCount > 0) buckets.push({
                  key: 'protected', count: protectedCount, band: '—',
                  label: 'Protected — never touched',
                  hint: 'Internal-service or break-glass permissions Cyntro will not modify.',
                  color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb',
                  perms: [], actionable: false,
                })

                if (buckets.length === 0) return null

                return (
                  <div className="mb-4 p-5 rounded-xl bg-white border" style={{ borderColor: 'var(--border, #e5e7eb)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted-foreground, #6b7280)' }}>Per-permission usage evidence</div>
                      <div className="text-xs" style={{ color: 'var(--muted-foreground, #6b7280)' }}>
                        Per-permission usage signal only — role-level verdict above is authoritative
                      </div>
                    </div>
                    <div className="space-y-2">
                      {buckets.map(b => {
                        const selected = b.actionable && allSelected(b.perms)
                        return (
                          <div
                            key={b.key}
                            className="flex items-center justify-between p-3 rounded-lg border"
                            style={{ backgroundColor: b.bg, borderColor: b.border }}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="text-2xl font-bold tabular-nums shrink-0" style={{ color: b.color, minWidth: '2.5rem', textAlign: 'right' }}>{b.count}</div>
                              <div className="min-w-0">
                                <div className="font-semibold text-sm" style={{ color: b.color }}>
                                  {b.label}
                                  <span className="ml-2 text-[11px] font-normal" style={{ color: b.color, opacity: 0.7 }}>
                                    confidence {b.band}
                                  </span>
                                </div>
                                <div className="text-xs mt-0.5" style={{ color: b.color, opacity: 0.85 }}>{b.hint}</div>
                              </div>
                            </div>
                            {b.actionable && (
                              <button
                                onClick={() => selectBand(b.perms)}
                                disabled={applying || selected}
                                className="ml-3 shrink-0 px-3 py-1.5 text-xs font-semibold rounded-md border-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{
                                  borderColor: b.color,
                                  color: selected ? '#ffffff' : b.color,
                                  backgroundColor: selected ? b.color : 'transparent',
                                }}
                                title={selected ? `All ${b.count} already selected` : `Add these ${b.count} to the selection`}
                              >
                                {selected ? `✓ ${b.count} selected` : `Select these ${b.count}`}
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {unusedPermissions.length > 0 && gapData?.confidence_groups?.groups ? (
                <div className="space-y-4 max-h-[400px] overflow-y-auto">
                  {gapData.confidence_groups.groups.map((group, gi) => {
                    const isProtected = group.protected || group.action === 'protected'
                    const isReserved = group.action === 'reserved'
                    const isWarn = group.warn || group.action === 'warn_before_removing'
                    const blockedByBackend = group.auto_remediable === false
                    // Only PROTECTED/RESERVED hard-lock the UI. Telemetry-gap blocks become
                    // a soft warning — see Cyntro_Decision_Contract_v1.md §1 / v5 §6.
                    const isLocked = isProtected || isReserved
                    const isInferredOrTelemetryBlocked =
                      blockedByBackend && !isProtected && !isReserved
                    const colorMap: Record<string, { text: string; border: string; bg: string }> = {
                      green: { text: '#22c55e', border: '#bbf7d0', bg: '#f0fdf4' },
                      orange: { text: '#f97316', border: '#fed7aa', bg: '#fff7ed' },
                      red: { text: '#ef4444', border: '#fecaca', bg: '#fef2f2' },
                      blue: { text: '#3b82f6', border: '#bfdbfe', bg: '#eff6ff' },
                      gray: { text: '#6b7280', border: '#d1d5db', bg: '#f9fafb' },
                      yellow: { text: '#eab308', border: '#fde68a', bg: '#fefce8' },
                    }
                    const colors = colorMap[group.color] || (isProtected ? colorMap.gray : isWarn ? colorMap.yellow : colorMap.orange)

                    return (
                      <div key={gi} className={`rounded-xl border overflow-hidden ${isLocked ? 'opacity-75' : ''}`} style={{ borderColor: colors.border }}>
                        <div className="px-4 py-2 flex items-center justify-between" style={{ background: colors.bg }}>
                          <div className="flex items-center gap-2">
                            {isLocked ? (
                              <Lock className="w-4 h-4" style={{ color: colors.text }} />
                            ) : isWarn ? (
                              <AlertTriangle className="w-4 h-4" style={{ color: colors.text }} />
                            ) : (
                              <span className="flex flex-col items-start leading-tight">
                                <span className="text-[9px] uppercase tracking-wider text-slate-500">Coverage</span>
                                <span className="font-bold text-sm" style={{ color: colors.text }}>{group.confidence_score}%</span>
                              </span>
                            )}
                            {/* Generic vendor-neutral group label — backend-supplied
                                group.label leaks AWS service names (e.g. "EC2, IAM,
                                S3 (14)" / "DynamoDB Data Operations (5)" / "SSM Agent
                                — Internal Service (23)"). Map to a generic label
                                based on data_source_type / action, preserving the
                                permission count. The actual permission rows (s3:Get*,
                                etc) below are still in operator-required AWS syntax
                                because IAM permission strings ARE AWS-specific —
                                they're the data the operator is acting on. */}
                            <span className="font-semibold text-sm" style={{ color: "var(--foreground, #111827)" }}>
                              {(() => {
                                const count = group.permission_count ?? group.permissions.length
                                if (isProtected) return `Protected operations (${count})`
                                if (isReserved) return `Reserved operations (${count})`
                                if (group.data_source_type === 'management_event') return `Logged operations (${count})`
                                if (group.data_source_type === 'data_event') return `Data-plane operations (${count})`
                                if (group.data_source_type === 'internal_service') return `Internal service operations (${count})`
                                return `Other operations (${count})`
                              })()}
                            </span>
                            {isProtected ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-[#6b728020] text-[#6b7280]">
                                PROTECTED
                              </span>
                            ) : isWarn ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-[#eab30820] text-[#eab308]">
                                CAUTION
                              </span>
                            ) : isReserved ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-[#3b82f620] text-[#3b82f6]">
                                RESERVED
                              </span>
                            ) : null}
                          </div>
                          {!isLocked && (
                            <button
                              onClick={() => {
                                const groupPerms = group.permissions.map(p => p.permission)
                                const allSelected = groupPerms.every(p => selectedPermissionsToRemove.has(p))
                                const newSet = new Set(selectedPermissionsToRemove)
                                groupPerms.forEach(p => allSelected ? newSet.delete(p) : newSet.add(p))
                                setSelectedPermissionsToRemove(newSet)
                              }}
                              className="text-xs font-medium px-2 py-0.5 rounded" style={{ color: colors.text }}
                            >
                              {group.permissions.every(p => selectedPermissionsToRemove.has(p.permission)) ? 'Deselect group' : 'Select group'}
                            </button>
                          )}
                        </div>
                        <div className="p-2 space-y-1" style={{ background: "var(--card, #ffffff)" }}>
                          {group.permissions.map((perm, i) => (
                            <div
                              key={i}
                              className={`flex items-center gap-3 p-1.5 rounded transition-colors ${
                                isLocked
                                  ? 'opacity-60 cursor-not-allowed'
                                  : selectedPermissionsToRemove.has(perm.permission)
                                    ? 'bg-[#ef444410] cursor-pointer'
                                    : 'hover:bg-gray-50 cursor-pointer'
                              }`}
                              onClick={() => { if (!isLocked) togglePermissionSelection(perm.permission) }}
                            >
                              <input
                                type="checkbox"
                                checked={!isLocked && selectedPermissionsToRemove.has(perm.permission)}
                                disabled={isLocked}
                                onChange={() => { if (!isLocked) togglePermissionSelection(perm.permission) }}
                                className="w-4 h-4 rounded border-[var(--border,#d1d5db)] disabled:opacity-40"
                              />
                              <span className="font-mono text-xs text-[var(--foreground,#374151)] flex-1 truncate">{perm.permission}</span>
                              {/* v4.4 §11E dual-display: badge color and threshold come from
                                  execution_confidence (the calibration-aware, routing-driving value);
                                  raw evidence is shown alongside via "raw → calibrated" prefix when
                                  the role has a non-trivial calibration factor.

                                  Backwards-compat: when execution_confidence is absent (older
                                  backend deploy), fall back to confidence_score with no calibration
                                  prefix — the legacy behaviour. */}
                              {!isLocked && (typeof perm.execution_confidence === 'number' || typeof perm.confidence_score === 'number') && (
                                (() => {
                                  const evidence = typeof perm.evidence_confidence === 'number'
                                    ? perm.evidence_confidence
                                    : perm.confidence_score
                                  const execution = typeof perm.execution_confidence === 'number'
                                    ? perm.execution_confidence
                                    : perm.confidence_score
                                  const hasCalibration = (
                                    typeof perm.calibration_factor === 'number' &&
                                    perm.calibration_factor < 0.999 &&
                                    Array.isArray(perm.calibration_reasons) &&
                                    perm.calibration_reasons.length > 0
                                  )
                                  const reasonsLabel = hasCalibration
                                    ? (perm.calibration_reasons || [])
                                        .map(r => r
                                          .replace(/_/g, ' ')
                                          .replace('penalty', '')
                                          .trim()
                                        )
                                        .join(', ')
                                    : ''
                                  const tooltip = hasCalibration
                                    ? `Evidence: ${evidence}% × role calibration (${perm.calibration_factor}) = Execution: ${execution}%\nReasons: ${reasonsLabel}\n${execution >= 70 ? 'Safe to remove (≥70 — auto-eligible)' : execution >= 40 ? 'Verify first (40-69 — needs override)' : 'Investigate first (<40 — high risk)'}`
                                    : (execution >= 70 ? 'Safe to remove (≥70 — auto-eligible)' : execution >= 40 ? 'Verify first (40-69 — needs override)' : 'Investigate first (<40 — high risk)')
                                  return (
                                    <span className="flex items-center gap-1 flex-shrink-0" title={tooltip}>
                                      {hasCalibration && evidence !== execution && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-gray-500 bg-gray-100 line-through" title="Raw evidence (pre-calibration)">
                                          {evidence}%
                                        </span>
                                      )}
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                          execution >= 70 ? 'bg-[#22c55e20] text-[#16a34a]' :
                                          execution >= 40 ? 'bg-[#f9731620] text-[#d97706]' :
                                          'bg-[#ef444420] text-[#dc2626]'
                                        }`}
                                      >
                                        {execution}%
                                      </span>
                                    </span>
                                  )
                                })()
                              )}
                              {isLocked ? (
                                <span className="px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0" style={{ background: colors.bg, color: colors.text }}>
                                  {isReserved ? 'RESERVED' : 'LOCKED'}
                                </span>
                              ) : (
                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                                  perm.risk_level === 'CRITICAL' ? 'bg-[#ef444420] text-[#ef4444]' :
                                  perm.risk_level === 'HIGH' ? 'bg-[#f9731620] text-[#f97316]' :
                                  perm.risk_level === 'MEDIUM' ? 'bg-[#eab30820] text-[#ca8a04]' :
                                  'bg-gray-100 text-[var(--muted-foreground,#4b5563)]'
                                }`}>
                                  {(perm as any).damage_tier === 'IRREVERSIBLE' ? 'IRREVERSIBLE' :
                                   (perm as any).damage_tier === 'DESTRUCTIVE' ? 'DELETE' :
                                   (perm as any).damage_tier === 'WRITE' ? 'WRITE' :
                                   perm.risk_level}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : unusedPermissions.length > 0 ? (
                <div className="space-y-1 max-h-[300px] overflow-y-auto p-3 rounded-xl border" style={{ borderColor: "var(--border, #e5e7eb)" }}>
                  {unusedPermissions.map((perm, i) => (
                    <label key={i} className={`flex items-center gap-3 p-1.5 rounded cursor-pointer transition-colors ${
                      selectedPermissionsToRemove.has(perm.permission) ? 'bg-[#ef444410]' : 'hover:bg-gray-50'
                    }`}>
                      <input
                        type="checkbox"
                        checked={selectedPermissionsToRemove.has(perm.permission)}
                        onChange={() => togglePermissionSelection(perm.permission)}
                        className="w-4 h-4 text-[#ef4444] rounded border-[var(--border,#d1d5db)] focus:ring-[#ef4444]"
                      />
                      <span className="font-mono text-xs text-[var(--foreground,#374151)] flex-1 truncate">{perm.permission}</span>
                    </label>
                  ))}
                </div>
              ) : unusedCount > 0 ? (
                <div className="p-4 bg-[#ef444410] border border-[#ef444440] rounded-xl">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-[#ef4444] flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-[#ef4444]">{unusedCount} managed-policy permissions need exact rewriting</p>
                      <p className="text-sm mt-1" style={{ color: "var(--foreground, #374151)" }}>
                        These permissions come from an immutable AWS managed policy. Cyntro will create a replacement containing every kept action, verify it, and only then detach the original policy.
                      </p>
                      <div className="mt-3 p-3 bg-white rounded-lg border" style={{ borderColor: "var(--border, #e5e7eb)" }}>
                        <p className="text-xs font-semibold" style={{ color: "var(--muted-foreground, #4b5563)" }}>Remediation approach:</p>
                        <ol className="text-xs mt-1 space-y-1 list-decimal list-inside" style={{ color: "var(--foreground, #374151)" }}>
                          <li>Create rollback snapshot (automatic)</li>
                          <li>Install a lossless replacement before detaching the original</li>
                          <li>Verify selected actions are gone and every kept action remains</li>
                          <li>Write the verified restore point to Remediated and History</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Permissions to Keep */}
            <div>
              <h3 className="font-bold text-lg  mb-3" style={{ color: "var(--foreground, #111827)" }}>Permissions to Keep ({usedCount}):</h3>
              {usedPermissions.length > 0 ? (
                <div className="p-4 bg-[#22c55e10] border border-[#22c55e40] rounded-xl max-h-32 overflow-y-auto">
                  <div className="space-y-2">
                    {usedPermissions.map((perm, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-[#22c55e] flex-shrink-0" />
                        <span className="font-mono text-sm " style={{ color: "var(--foreground, #111827)" }}>{perm.permission}</span>
                        <span className="text-[#22c55e] text-sm">{perm.usage_count && perm.usage_count > 1 ? `${perm.usage_count.toLocaleString()} API calls` : 'Active'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : usedCount > 0 ? (
                <div className="p-4 bg-[#22c55e10] border border-[#22c55e40] rounded-xl">
                  <p className="text-sm" style={{ color: "var(--foreground, #374151)" }}>
                    <strong className="text-[#22c55e]">{usedCount} permission{usedCount !== 1 ? 's' : ''}</strong> observed in active use — these will be preserved in the new minimal inline policy after remediation.
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-[#f9731610] border border-[#f9731640] rounded-xl">
                  <p className="text-[#f97316]">No permissions observed in use during the observation period.</p>
                  <p className="text-[#f97316] text-sm mt-1">This role may be safe to delete entirely, or it may be used by an AWS service that doesn't log to CloudTrail.</p>
                </div>
              )}
            </div>

            {/* Dependency Context */}
            {gapData?.dependency_context && (
              <div className={`p-4 rounded-xl ${
                gapData.dependency_context.status === 'ok' && gapData.dependency_context.has_critical_dependencies
                  ? 'bg-[#f9731610] border border-[#f9731640]'
                  : gapData.dependency_context.status !== 'ok'
                  ? 'bg-gray-50 border border-[var(--border,#e5e7eb)]'
                  : 'bg-[#22c55e10] border border-[#22c55e40]'
              }`}>
                <h3 className="font-bold mb-3 flex items-center gap-2" style={{ color: "var(--foreground, #111827)" }}>
                  {gapData.dependency_context.status === 'ok' && gapData.dependency_context.has_critical_dependencies ? (
                    <>
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                      Critical Dependencies Detected
                    </>
                  ) : gapData.dependency_context.status !== 'ok' ? (
                    <>
                      <Activity className="w-5 h-5 text-[var(--muted-foreground,#9ca3af)]" />
                      Dependency Evidence Unavailable
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5 text-[#22c55e]" />
                      Dependency Analysis
                    </>
                  )}
                </h3>
                
                {gapData.dependency_context.status === 'ok' ? (
                  <>
                    {gapData.dependency_context.system?.name && (
                      <p className="text-sm text-[var(--muted-foreground,#4b5563)] mb-2">
                        System: <span className="font-medium">{gapData.dependency_context.system.name}</span>
                        {gapData.dependency_context.system.criticality && (
                          <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                            ['production', 'prod', 'critical', 'mission_critical'].includes(
                              (gapData.dependency_context.system.criticality || '').toLowerCase()
                            ) ? 'bg-[#ef444420] text-[#ef4444]' : 'bg-[#3b82f620] text-[#3b82f6]'
                          }`}>
                            {gapData.dependency_context.system.criticality}
                          </span>
                        )}
                      </p>
                    )}
                    
                    {gapData.dependency_context.dependencies && gapData.dependency_context.dependencies.length > 0 ? (
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        <p className="text-sm font-medium text-[var(--foreground,#374151)] mb-2">
                          Affected Resources ({gapData.dependency_context.dependencies.length}):
                        </p>
                        {gapData.dependency_context.dependencies.slice(0, 10).map((dep, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <span className="px-1.5 py-0.5 rounded text-xs bg-gray-200 text-[var(--muted-foreground,#4b5563)] font-mono">
                              {dep.type || 'Unknown'}
                            </span>
                            <span className="text-[var(--foreground,#374151)] truncate">{dep.name || dep.arn}</span>
                            {dep.environment && (
                              <span className={`px-1.5 py-0.5 rounded text-xs ${
                                ['prod', 'production'].includes(dep.environment.toLowerCase())
                                  ? 'bg-[#ef444420] text-[#ef4444]'
                                  : 'bg-gray-100 text-[var(--muted-foreground,#4b5563)]'
                              }`}>
                                {dep.environment}
                              </span>
                            )}
                          </div>
                        ))}
                        {gapData.dependency_context.dependencies.length > 10 && (
                          <p className="text-xs text-[var(--muted-foreground,#6b7280)] italic">
                            +{gapData.dependency_context.dependencies.length - 10} more...
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-[#22c55e]">✓ No dependent resources detected</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm " style={{ color: "var(--muted-foreground, #6b7280)" }}>
                    {gapData.dependency_context.status === 'neo4j_unavailable' 
                      ? 'Graph database not configured - dependency analysis skipped'
                      : gapData.dependency_context.status === 'not_found'
                      ? 'Resource not found in dependency graph'
                      : `Error: ${gapData.dependency_context.error || 'Unknown error'}`
                    }
                  </p>
                )}
              </div>
            )}
            </div>

          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t flex items-center justify-between" style={{ borderColor: "var(--border, #e5e7eb)", background: "var(--background, #f8f9fa)" }}>
            <button 
              onClick={() => setShowSimulation(false)}
              disabled={applying}
              className="px-4 py-2 border border-[var(--border,#d1d5db)] text-[var(--foreground,#374151)] rounded-lg hover:bg-gray-100 font-medium disabled:opacity-50"
            >
              ← BACK
            </button>
            <div className="flex items-center gap-4">
              {!applyDisabled && (<>
              <label className="flex items-center gap-2" title="Cyntro always creates and verifies a restore point before changing IAM">
                <input
                  type="checkbox"
                  checked={createSnapshot}
                  readOnly
                  disabled
                  className="rounded border-[var(--border,#d1d5db)] text-[#8b5cf6] focus:ring-[#8b5cf6]"
                />
                <span className="text-sm" style={{ color: "var(--muted-foreground, #6b7280)" }}>Restore point required</span>
              </label>
              <label
                className={`flex items-center gap-2 ${managedPolicyRewriteRequired ? '' : 'cursor-pointer'}`}
                title={managedPolicyRewriteRequired
                  ? 'The signed plan requires a lossless managed-policy rewrite to remove the selected actions.'
                  : 'Narrow managed policies that contain selected permissions.'}
              >
                <input
                  type="checkbox"
                  checked={detachManagedPolicies}
                  onChange={(e) => setDetachManagedPolicies(e.target.checked)}
                  disabled={applying || remediationAuthority.hardBlocked || remediationAuthority.evidenceUnavailable || managedPolicyRewriteRequired}
                  className="rounded border-[var(--border,#d1d5db)] text-orange-600 focus:ring-orange-500"
                />
                <span className="text-sm" style={{ color: "var(--muted-foreground, #6b7280)" }}>
                  {managedPolicyRewriteRequired ? 'Preserve kept actions during managed-policy rewrite' : 'Narrow overlapping managed policies'}
                </span>
              </label>
              </>)}
              {(() => {
                const blocked = shouldBlockRemediation()
                // Backend remediability gate (api/iam_gap_analysis.py). false ONLY
                // when there is no attached policy data OR usage was never measured
                // (data_confidence UNKNOWN / reason 'usage_not_computed'). Undefined
                // on older backends → not gated.
                const evidenceUnknown = remediationAuthority.evidenceUnavailable
                const canonicalBlocked = remediationAuthority.hardBlocked
                const lowConfidence = safetyScore == null || safetyScore < 50
                const pipelineBlocked = verdictBucket === 'blocked'
                // Honest counts: report what the user actually selected. Non-auto
                // selections are now passed under force_override (see handleApplyFix)
                // instead of being silently dropped at submit.
                const autoRemediableSet = getAutoRemediablePermissions()
                const selectedTotalCount = selectedPermissionsToRemove.size
                const hasExecutableSelection = hasExecutableIamSelection(
                  selectedTotalCount,
                  detachManagedPolicies,
                  managedPolicyRewriteRequired,
                ) && selectionMatchesSignedIamPlan(
                  selectedPermissionsToRemove,
                  planPermissions,
                  planToken,
                ) && detachManagedPolicies === managedPolicyRewriteRequired
                  && !detachAllManagedPolicies
                const selectedAutoRemediableCount = Array.from(selectedPermissionsToRemove)
                  .filter(p => autoRemediableSet.has(p)).length
                const selectedOverrideCount = selectedTotalCount - selectedAutoRemediableCount

                if (applyDisabled) {
                  return (
                    <div className="flex items-center gap-3">
                      <div className="max-w-sm text-right">
                        <div className="text-sm font-semibold text-slate-700">
                          {authorityHoldReason ? 'Approval and execution are held' : 'Apply unavailable in preview-only mode'}
                        </div>
                        <div className="text-xs text-slate-500">
                          {authorityHoldReason ?? 'You can finalize and review the plan, but this environment cannot change production.'}
                        </div>
                      </div>
                      <button
                        disabled
                        data-testid="iam-apply-disabled"
                        className="px-6 py-2.5 bg-gray-400 text-white rounded-lg font-bold cursor-not-allowed flex items-center gap-2"
                        title={authorityHoldReason ?? 'Production changes are not enabled in this environment'}
                      >
                        <XCircle className="w-4 h-4" />
                        Apply unavailable
                      </button>
                    </div>
                  )
                } else if (blocked) {
                  return (
                    <button
                      disabled
                      className="px-6 py-2.5 bg-gray-400 text-white rounded-lg font-bold cursor-not-allowed flex items-center gap-2"
                      title="Cannot modify AWS service roles"
                    >
                      <XCircle className="w-4 h-4" />
                      BLOCKED - Service Role
                    </button>
                  )
                } else if (canonicalBlocked) {
                  return (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-[#b91c1c] max-w-md text-right">
                        {remediationAuthority.effectiveReason}
                      </span>
                      <button
                        disabled
                        data-testid="iam-canonical-blocked"
                        className="px-6 py-2.5 bg-gray-400 text-white rounded-lg font-bold cursor-not-allowed flex items-center gap-2"
                        title={remediationAuthority.effectiveReason}
                      >
                        <XCircle className="w-4 h-4" />
                        BLOCKED
                      </button>
                    </div>
                  )
                } else if (evidenceUnknown) {
                  // Backend says this role is NOT remediable: no policy data, or
                  // usage was never measured (data_confidence UNKNOWN). Surface the
                  // honest reason and hard-disable Apply — no removal / detach /
                  // override path on evidence we don't have. This is the frontend
                  // half of the fail-closed contract from backend PR #519.
                  return (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-[#b45309] max-w-md text-right">
                        {remediationAuthority.effectiveReason
                          || 'Usage not computed — sync evidence before remediation.'}
                      </span>
                      <button
                        disabled
                        className="px-6 py-2.5 bg-gray-400 text-white rounded-lg font-bold cursor-not-allowed flex items-center gap-2"
                        title={remediationAuthority.effectiveReason
                          || 'Usage not computed — sync CloudTrail / behavioral usage before remediation.'}
                      >
                        <XCircle className="w-4 h-4" />
                        MORE DATA NEEDED
                      </button>
                    </div>
                  )
                } else if (pipelineBlocked) {
                  // Pipeline routed this to "review required". Two
                  // explicit choices:
                  //   1. (recommended) close + investigate the consumers
                  //      / wire the missing telemetry, then re-simulate.
                  //   2. (override) acknowledge the message and apply
                  //      anyway -- recorded in the audit log as a
                  //      deliberate operator override (force=true).
                  // Visual: amber/orange, NOT error red. Investigate-
                  // first gets standard secondary treatment; acknowledge-
                  // and-apply gets the amber primary so the user can
                  // tell it's not a "panic" button.
                  return (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleClose}
                        disabled={applying}
                        className="px-5 py-2.5 bg-white text-[var(--foreground,#111827)] border-2 border-[var(--border,#e5e7eb)] rounded-lg font-semibold hover:bg-[var(--muted,#f3f4f6)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        title="Close the modal and investigate before proceeding"
                      >
                        <Shield className="w-4 h-4" />
                        Investigate first
                      </button>
                      <button
                        // Open the override confirmation directly via
                        // setState (no async indirection, no
                        // handleApplyFix call). Going through the
                        // async function added a microtask hop +
                        // multiple early-returns in the function body
                        // that the React profiler showed as ~50-150ms
                        // perceived delay. Direct setState fires the
                        // re-render in the same task tick.
                        onClick={() => {
                          console.log('[IAM-Modal] Acknowledge & Apply clicked — opening override modal. selected=' + selectedPermissionsToRemove.size + ' detach=' + detachManagedPolicies + ' applying=' + applying)
                          setOverrideModal({ open: true, rationale: '', ackRollback: createSnapshot, phase: 'form', message: '' })
                        }}
                        disabled={applying || !hasExecutableSelection}
                        className="px-5 py-2.5 bg-[#f59e0b] text-white rounded-lg font-bold hover:bg-[#d97706] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        title={`Acknowledge the safety hold and apply ${selectedPermissionsToRemove.size > 0 ? `${selectedPermissionsToRemove.size} permission removals` : 'the policy detach'}. The override is recorded in the audit log under your operator id. ${safetyContext?.block_reason || ''}`}
                      >
                        <CheckSquare className="w-4 h-4" />
                        Acknowledge &amp; Apply ({selectedPermissionsToRemove.size > 0 ? `${selectedPermissionsToRemove.size} perms` : 'detach policies'})
                      </button>
                    </div>
                  )
                } else if (verdictBucket === 'human_approval') {
                  const approval = latestApprovalRequest
                  const sharedPath = safetyContext?.shared_resource?.ui_path || '/iam/shared-roles'
                  const sharedHref = `${sharedPath}?system_name=${encodeURIComponent(systemName)}&role_ref=${encodeURIComponent(safetyContext?.shared_resource?.resource_id || roleName)}`
                  const selectedPermissions = Array.from(selectedPermissionsToRemove)

                  if (approval?.status === 'APPROVED') {
                    return (
                      <div className="flex items-center gap-3">
                        <a href={sharedHref} className="text-sm font-semibold text-amber-800 hover:underline">
                          Review shared impact
                        </a>
                        <button
                          type="button"
                          onClick={() => void handleIAMLpExecuteApprovedRequest(approval.request_id)}
                          disabled={applying || approvalActionBusy}
                          data-testid="iam-execute-approved"
                          className="rounded-lg bg-[#2D51DA] px-5 py-2.5 font-bold text-white shadow-lg hover:bg-[#2446c0] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Execute approved change
                        </button>
                      </div>
                    )
                  }

                  if (approval?.status === 'PENDING_APPROVAL' || approval?.status === 'EXECUTING') {
                    return (
                      <div className="flex items-center gap-3">
                        <a href={sharedHref} className="text-sm font-semibold text-amber-800 hover:underline">
                          Review shared impact
                        </a>
                        <button
                          type="button"
                          disabled
                          data-testid="iam-approval-pending"
                          className="cursor-not-allowed rounded-lg bg-amber-200 px-5 py-2.5 font-bold text-amber-900 opacity-80"
                        >
                          {approval.status === 'EXECUTING' ? 'Approved change executing' : 'Approval pending'}
                        </button>
                      </div>
                    )
                  }

                  if (approval?.status === 'EXECUTED') {
                    return (
                      <button type="button" disabled className="cursor-not-allowed rounded-lg bg-emerald-100 px-5 py-2.5 font-bold text-emerald-800">
                        Approved change executed
                      </button>
                    )
                  }

                  return (
                    <div className="flex items-center gap-3">
                      <a href={sharedHref} className="text-sm font-semibold text-amber-800 hover:underline">
                        Review shared impact
                      </a>
                      <button
                        type="button"
                        onClick={() => void handleIAMLpRequestApproval(selectedPermissions)}
                        disabled={applying || approvalLoading || !hasExecutableSelection}
                        data-testid="iam-request-approval"
                        className="rounded-lg bg-amber-500 px-5 py-2.5 font-bold text-white shadow-lg hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {approvalLoading ? 'Checking approvals…' : `Request approval (${selectedTotalCount})`}
                      </button>
                    </div>
                  )
                } else if (lowConfidence) {
                  return (
                    <button
                      onClick={() => handleApplyFix(false)}
                      disabled={applying || !hasExecutableSelection}
                      className="px-6 py-2.5 bg-[#f97316] text-white rounded-lg font-bold hover:bg-[#ea580c] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      title="Low confidence - proceed with caution"
                    >
                      {applying ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Applying...
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4" />
                          APPLY ANYWAY ({selectedPermissionsToRemove.size > 0 ? `${selectedPermissionsToRemove.size} permissions` : 'detach policies'})
                        </>
                      )}
                    </button>
                  )
                } else {
                  return (
                    <button
                      onClick={() => handleApplyFix(false)}
                      disabled={applying || !hasExecutableSelection}
                      className="px-6 py-2.5 bg-[#8b5cf6] text-white rounded-lg font-bold hover:bg-[#7c3aed] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {applying ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Applying...
                        </>
                      ) : selectedTotalCount > 0 ? (
                        selectedOverrideCount > 0
                          ? `APPLY FIX (${selectedTotalCount} — ${selectedOverrideCount} via override)`
                          : `APPLY FIX (${selectedTotalCount} permissions)`
                      ) : detachManagedPolicies ? (
                        `APPLY FIX (narrow managed policies)`
                      ) : (
                        'Select permissions to remove'
                      )}
                    </button>
                  )
                }
              })()}
            </div>
          </div>
        </div>
      </div>
      </>
    )
  }

  // Main Permission Usage Analysis View
  // Render the override modal as a TOP-LEVEL SIBLING of the IAM modal
  // (not portaled, not nested as a child of the IAM modal's z-50 container).
  // Top-level sibling render with a higher z-index works in every React
  // version, every browser, every Next.js/Tailwind config — no portal,
  // no SSR mismatch, no purge-class concerns. After the portal approach
  // failed to render in production despite the click handler firing
  // correctly, falling back to the simplest possible rendering path.
  return (
    <>
    {renderOverrideModal()}
    {/* INLINE DUPLICATE BELOW IS DEAD CODE (kept temporarily as TS
        sentinel to avoid import-deletion via auto-cleanup; will be
        removed once the helper extraction proves out). The conditional
        means it never renders. */}
    {false && overrideModal.open && (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          padding: '12px 24px',
          backgroundColor: '#dc2626',
          color: '#ffffff',
          fontWeight: 700,
          fontSize: '14px',
          textAlign: 'center',
          zIndex: 999999,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
        data-testid="override-modal-diagnostic-ribbon"
      >
        ⚠ OVERRIDE MODAL STATE = OPEN (phase: {overrideModal.phase}). If you see this ribbon but no modal below, the modal subtree render is failing — screenshot DevTools and send to claude.
      </div>
    )}

    {renderApprovalActionModal()}

    {/* Original IAM modal — kept inside its z-50 wrapper so close-on-
        backdrop-click still works. The override modal above renders on
        top via inline z-index 99999. */}
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={REMEDIATION_MODAL_BACKDROP_STYLE}>
      <div className="absolute inset-0" onClick={handleClose} />

      <div
        className="relative w-[720px] max-h-[88vh] rounded-lg shadow-[0_10px_40px_rgba(15,23,42,0.12)] overflow-hidden flex flex-col my-4"
        style={{ background: "var(--card, #ffffff)" }}
        data-testid="iam-permission-analysis-modal"
      >
        {/* Header */}
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--border, #e5e7eb)" }}>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#2D51DA" }}>
              {viaInstanceProfile ? 'Wrapped role · Permission Usage' : 'Permission Usage'}
            </div>
            <div className="mt-0.5 text-sm font-semibold truncate flex items-center gap-2" style={{ color: "var(--foreground, #111827)" }}>
              <span className="truncate">
                {roleName} <span className="font-normal" style={{ color: "var(--muted-foreground, #6b7280)" }}>· {identityType || 'IAMRole'}{systemName ? ` · ${systemName}` : ''}</span>
              </span>
              <TerraformExecutionChip adapter={tfAdapter} />
            </div>
            {viaInstanceProfile && (
              <div className="mt-1 text-[11px]" style={{ color: "var(--muted-foreground, #6b7280)" }}>
                Reached via <span className="font-semibold text-amber-700">InstanceProfile</span>{': '}
                <span className="font-mono text-[10px]">{viaInstanceProfile.name}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => fetchGapAnalysis(true)}
              className="p-1.5 rounded-md hover:bg-slate-50"
              style={{ color: "var(--muted-foreground, #9ca3af)" }}
              title="Refresh data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={handleClose} className="p-1.5 rounded-md hover:bg-slate-50" style={{ color: "var(--muted-foreground, #9ca3af)" }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {viaInstanceProfile && (
          <div className="px-5 py-2 border-b bg-amber-50" style={{ borderColor: "var(--border, #e5e7eb)" }}>
            <div className="text-[11px] leading-snug" style={{ color: "#78350f" }}>
              InstanceProfile binds an EC2 to an IAM Role and carries no
              permissions of its own. Cyntro is showing the permission
              surface of the IAM Role this profile attaches to EC2.
            </div>
          </div>
        )}
        {provenance && (
          <div className="px-5 py-2 border-b" style={{ borderColor: "var(--border, #e5e7eb)" }}>
            <TrustEnvelopeBadge provenance={provenance} surface="light" />
          </div>
        )}
        {overrideHoldReason && (
          <div
            className="border-b border-orange-400 bg-orange-950 px-5 py-3"
            data-testid="iam-authority-hold"
          >
            <div className="flex items-start justify-between gap-4 text-orange-50">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
                <div>
                  <div className="text-xs font-bold">Operator override is available</div>
                  <p className="mt-0.5 text-xs leading-relaxed text-orange-100">{overrideHoldReason}</p>
                  <p className="mt-1 text-xs leading-relaxed text-orange-100">
                    Cyntro will not silently approve the change, but it will not lock you out. Remediate Anyway prepares an exact, reversible plan and then asks you to confirm the risk and audit details.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handlePrepareBreakGlass}
                disabled={breakGlassPreparing || applying}
                className="shrink-0 rounded-md border border-orange-200 bg-white px-3 py-1.5 text-xs font-bold text-orange-950 shadow-sm hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {breakGlassPreparing ? 'Preparing exact plan…' : 'Remediate Anyway'}
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-3 p-4">
          {/* Recording Period — compact single-row chip strip */}
          <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--foreground, #111827)" }}>
              <Calendar className="w-3.5 h-3.5" style={{ color: "#2D51DA" }} />
              <span className="font-semibold" data-testid="observation-window-headline">
                {gapData ? observationWindowCopy.headline : 'Observation window loading'}
              </span>
              <span className="text-slate-400">·</span>
              <span
                style={{ color: "var(--muted-foreground, #6b7280)" }}
                data-testid="observation-window-range"
                title={gapData?.observation_window?.limitation ?? undefined}
              >
                {observationWindowCopy.range}
                {observationWindowCopy.collected ? ` · ${observationWindowCopy.collected}` : ''}
              </span>
            </div>
            <span
              className="text-xs tabular-nums"
              style={{ color: "var(--muted-foreground, #6b7280)" }}
              title={eventCountCopy.detail ?? undefined}
              data-testid="event-count"
            >
              {eventCountCopy.label}
            </span>
          </div>

          <div className="flex items-center gap-1 border-b" style={{ borderColor: "var(--border, #e5e7eb)" }}>
            {([
              { id: 'summary' as const, label: 'Summary', icon: ShieldCheck },
              { id: 'permissions' as const, label: 'Permissions', icon: Activity },
              { id: 'context' as const, label: 'Context', icon: Sparkles },
            ]).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setAnalysisTab(tab.id)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border-b-2 transition-colors -mb-px"
                style={{
                  borderColor: analysisTab === tab.id ? '#2D51DA' : 'transparent',
                  color: analysisTab === tab.id ? '#2D51DA' : 'var(--muted-foreground, #6b7280)',
                }}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {(analysisTab === 'summary' || analysisTab === 'permissions') && safetyLoading && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5" data-testid="permission-snapshot-loading">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading one verified permission snapshot…
              </div>
            </div>
          )}

          {analysisTab === 'summary' && !safetyLoading && iamLpGap && (
            <div className="space-y-3">
              {removalSafety && <RemovalSafetyPanel bundle={removalSafety} />}
              {removalSafety && (
                <IamRemediationAvailability
                  bundle={removalSafety}
                  applyDisabled={applyDisabled}
                  disabledReason={authorityHoldReason}
                />
              )}
              {!removalSafety && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
                  <p className="font-semibold">Removal safety is temporarily unavailable</p>
                  <p className="mt-1 text-sm">
                    Cyntro will not recommend or enable a permission change until the verified
                    permission snapshot loads.
                  </p>
                  <button
                    type="button"
                    onClick={() => { void fetchSafetyContext() }}
                    className="mt-3 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-sm font-medium hover:bg-amber-100"
                  >
                    Retry verified snapshot
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Pipeline Decision banner (Summary tab) ────────────────────
              The unified pipeline is the AUTHORITATIVE decision source.
              We render it above the Agent 5 panel so the verdict order
              matches the source-of-truth order. Agent 5 is rendered
              below as the *explanation* of this decision.
              Fail-closed: if simulate-fix returned no safety object, we
              don't show a green "Safe to apply" — we surface the
              fail-closed warning so the user can investigate why. */}
          {showLegacySummaryScaffolding && safetyLoading && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500 flex items-center">
              <Loader2 className="w-3.5 h-3.5 inline animate-spin mr-2" />
              Reading unified pipeline decision…
            </div>
          )}
          {showLegacySummaryScaffolding && !safetyLoading && !safetyContext && (
            <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <XCircle className="w-6 h-6 text-[#ef4444] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-[#991b1b]">Cyntro could not verify safety for this role</p>
                  <p className="text-sm text-[#7f1d1d] mt-1">
                    Required system context is missing or invalid for{' '}
                    <span className="font-semibold">{roleName}</span>. Refresh the page
                    or contact support if this persists.
                  </p>
                </div>
              </div>
            </div>
          )}
          {showLegacySummaryScaffolding && safetyContext && renderSimpleDecisionSummary()}
          {showLegacySummaryScaffolding && safetyContext && (() => {
            // v5 verdict layout — replaces the old Pipeline Decision +
            // Agent 5 Confidence Scorer + Visibility Signals stack that
            // showed a 100/100 score next to a BLOCKED verdict
            // (operator-visible contradiction). Per
            // Cyntro_Architecture_v5_PR001_Transition.md §6, customer-
            // facing posture is a typed state, not a number.
            //
            // Generic source labels in the Evidence panel — demo-safe,
            // no AWS service names exposed.
            const d = safetyContext.decision_canonical ?? null
            const obs = safetyContext.observation_days ?? observationDays
            const tel = safetyContext.telemetry_coverage
            const consumers = safetyContext.consumer_count ?? 0
            const reasons = safetyContext.unsafe_reasons ?? []
            const coveragePct = typeof tel === 'number' ? Math.round(tel * 100) : 100

            type Tone = 'block' | 'review' | 'approve' | 'auto'
            const tone: Tone =
              d === 'BLOCK' || d === 'EXCLUDE' ? 'block'
              : d === 'MANUAL_REVIEW' ? 'review'
              : d === 'REQUIRE_APPROVAL' || d === 'CANARY_FIRST' ? 'approve'
              : d === 'AUTO_EXECUTE' ? 'auto'
              : 'review'

            const VERDICT: Record<Tone, {
              label: string
              border: string
              bg: string
              color: string
              IconClass: typeof Shield
              showReasons: boolean
            }> = {
              block:   { label: 'Paused — review required',  border: '#fde68a', bg: '#fffbeb', color: '#92400e', IconClass: Shield, showReasons: true },
              review:  { label: 'Manual review required',     border: '#fed7aa', bg: '#fff7ed', color: '#9a3412', IconClass: AlertTriangle, showReasons: true },
              approve: { label: 'Approval required',          border: '#bfdbfe', bg: '#eff6ff', color: '#1e40af', IconClass: Shield, showReasons: true },
              auto:    { label: 'Ready to apply',             border: '#bbf7d0', bg: '#f0fdf4', color: '#15803d', IconClass: CheckCircle, showReasons: false },
            }
            const v = VERDICT[tone]
            const primaryReason = reasons[0]
              ?? (tone === 'auto'
                ? 'All safety checks passed. Cyntro will create a rollback snapshot before mutation.'
                : 'Required evidence is incomplete in this account.')

            // Build why-we-paused gates (binary, fixable).
            const gates: Array<{ label: string; hint: string }> = []
            if (coveragePct < 100) {
              gates.push({
                label: `Telemetry coverage is ${coveragePct}%`,
                hint: 'Enable the missing sources in this account to reach 100%.',
              })
            }
            if (typeof obs === 'number' && obs < 21) {
              gates.push({
                label: `Observation window is ${obs} days`,
                hint: 'Cyntro needs ≥21 days of observation before automating production changes.',
              })
            }
            if (consumers > 0 && tone !== 'auto') {
              gates.push({
                label: `${consumers} system${consumers === 1 ? '' : 's'} depend on this role`,
                hint: 'Verify each consumer does not use the proposed-removed permissions.',
              })
            }
            // Tail of the unsafe_reasons (after the primary one shown in the verdict header).
            for (const r of reasons.slice(1)) gates.push({ label: r, hint: '' })

            // Generic vendor-neutral evidence labels — see
            // Cyntro_Architecture_v5 §8 for the canonical SafetyVector
            // dimensions this maps to. Demo-safe.
            const TOTAL_EVIDENCE_SOURCES = 6
            const sourcesActive = Math.max(
              0,
              Math.min(TOTAL_EVIDENCE_SOURCES, Math.round((coveragePct / 100) * TOTAL_EVIDENCE_SOURCES)),
            )
            const EVIDENCE_LABELS = [
              'Activity history',
              'Permission usage',
              'Identity graph',
              'Network behavior',
              'Configuration baseline',
              'Application traces',
            ]

            return (
              <div className="space-y-3">
                {/* v4.4 §11E confidence-score header — replaces typed-posture
                    verdict with numeric score + 4-state mapping. The legacy
                    typed-verdict block below is left as dead code via false
                    guard for diff readability. */}
                {!removalSafety && renderConfidenceCard()}
                {false && (
                <div className="p-4 rounded-xl border-2" style={{ backgroundColor: v.bg, borderColor: v.border }}>
                  <div className="flex items-start gap-3">
                    <v.IconClass className="w-7 h-7 shrink-0 mt-0.5" style={{ color: v.color }} />
                    <div className="min-w-0">
                      <div className="text-lg font-bold" style={{ color: v.color }}>{v.label}</div>
                      <div className="text-sm mt-1" style={{ color: v.color }}>{primaryReason}</div>
                    </div>
                  </div>
                </div>
                )}

                {/* Safety scoring breakdown — replaces the old "Why we paused"
                    + "Evidence used" pair with a single per-dimension panel
                    that shows EVERY safety dimension the engine evaluated,
                    its score, and which one drove the verdict. The legacy
                    inline render is left below as dead code via a false
                    guard (kept temporarily for diff-readability; will be
                    deleted next pass). */}
                {!removalSafety && renderSafetyBreakdown()}

                {false && v.showReasons && gates.length > 0 && (
                  <div className="p-4 rounded-xl border" style={{ backgroundColor: v.bg, borderColor: v.border }}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-2" style={{ color: v.color }}>Why we paused</div>
                    <ul className="space-y-2">
                      {gates.map((g, i) => (
                        <li key={`gate-${i}`} className="text-sm">
                          <div className="flex items-start gap-2">
                            <span className="shrink-0 mt-0.5" style={{ color: v.color }}>✗</span>
                            <div>
                              <div className="font-semibold" style={{ color: v.color }}>{g.label}</div>
                              {g.hint && (
                                <div className="text-xs mt-0.5" style={{ color: v.color, opacity: 0.85 }}>{g.hint}</div>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {false && (
                <div className="p-4 rounded-xl border bg-white" style={{ borderColor: 'var(--border, #e5e7eb)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--muted-foreground, #6b7280)' }}>Evidence used</div>
                    <div className="text-xs" style={{ color: 'var(--muted-foreground, #6b7280)' }}>
                      {obs} days · {eventCountCopy.label}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                    {EVIDENCE_LABELS.map((name, i) => {
                      const present = i < sourcesActive
                      return (
                        <div key={name} className="flex items-center gap-2">
                          <span className="shrink-0 font-bold" style={{ color: present ? '#15803d' : '#9ca3af' }}>{present ? '✓' : '✗'}</span>
                          <span style={{ color: present ? 'var(--foreground, #111827)' : 'var(--muted-foreground, #9ca3af)' }}>{name}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-2 text-xs" style={{ color: 'var(--muted-foreground, #6b7280)' }}>
                    {sourcesActive} of {TOTAL_EVIDENCE_SOURCES} sources active.
                  </div>
                </div>
                )}
              </div>
            )
          })()}

          {/* Removed: Agent 5 · Confidence Scorer panel + ConfidenceExplanation.
              The 100/100 score next to a BLOCKED verdict was the source of
              the operator-visible contradiction. The verdict above IS the
              safety signal; no second opinion needed. Re-add later if
              there's a v5-aligned way to show it without contradicting
              the verdict (e.g. only when AUTO_EXECUTE). */}

          {/* Service Role Warning - Only show for CRITICAL severity
              (destructive hard-block — DO NOT MODIFY). Medium/high
              severity warnings are suppressed because the top verdict
              header already covers "this needs review" and the
              backend prose leaks AWS service names ("EC2", "Lambda",
              "ec2.amazonaws.com") that violate the demo-safe vocabulary
              rule (see feedback_demo_safe_source_labels.md).

              Critical-severity service-role warnings are kept because
              they ARE a different kind of warning — destructive hard-
              block, not a noisy duplicate — and the trust-principal
              line is still suppressed below for demo safety. */}
          {showLegacySummaryScaffolding && (() => {
            if (!serviceAnalysis) return null
            const severity = serviceAnalysis.severity || 'medium'
            // Skip non-critical severity entirely — top verdict covers it
            if (severity !== 'critical') return null

            // Critical-only styling (red, DO NOT MODIFY).
            const style = {
              border: 'border-red-500',
              bg: 'bg-[#ef444410]',
              icon: 'text-[#ef4444]',
              title: 'text-red-900',
              text: 'text-[#ef4444]',
              badge: 'bg-red-600 text-white',
              badgeText: 'DO NOT MODIFY',
            }

            return (
              <div className={`rounded-md border ${style.border} ${style.bg} p-3`}>
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className={`w-4 h-4 ${style.icon} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    {/* Title with badge — service principal line removed
                        for demo safety (would leak AWS service principals
                        like ec2.amazonaws.com). The DO NOT MODIFY badge
                        + the title still tell the operator what they need
                        to know without naming the underlying service. */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className={`font-semibold ${style.title} text-sm`}>
                          {serviceAnalysis.title}
                        </h4>
                      </div>
                      <span className={`px-2 py-0.5 ${style.badge} text-[10px] rounded font-semibold whitespace-nowrap`}>
                        {style.badgeText}
                      </span>
                    </div>

                    {/* Description */}
                    <p className={`text-xs ${style.text} mt-1.5 leading-snug`}>
                      {serviceAnalysis.description}
                    </p>

                    {/* Why no CloudTrail */}
                    {serviceAnalysis.why_no_cloudtrail && (
                      <div className="mt-2 p-2 bg-white/60 rounded border border-current/10">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground,#4b5563)] mb-0.5">Why permissions appear unused</p>
                        <p className={`text-xs ${style.text}`}>
                          {serviceAnalysis.why_no_cloudtrail}
                        </p>
                      </div>
                    )}

                    {/* Affected Permissions */}
                    {serviceAnalysis.affected_permissions && serviceAnalysis.affected_permissions.length > 0 && (
                      <div className="mt-2">
                        <p className={`text-[10px] font-semibold uppercase tracking-wide ${style.title} mb-1`}>
                          Used by {serviceAnalysis.service_name} internally
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {serviceAnalysis.affected_permissions.slice(0, 6).map((perm, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-white/70 border border-current/20 rounded text-[10px] font-mono">
                              {perm}
                            </span>
                          ))}
                          {serviceAnalysis.affected_permissions.length > 6 && (
                            <span className="px-1.5 py-0.5 text-[10px]">
                              +{serviceAnalysis.affected_permissions.length - 6} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Recommendation */}
                    {serviceAnalysis.recommendation && (
                      <div className={`mt-2 p-2 rounded ${severity === 'critical' ? 'bg-[#ef444420]' : 'bg-white/60'}`}>
                        <p className={`text-xs font-medium ${severity === 'critical' ? 'text-[#ef4444]' : style.text}`}>
                          {serviceAnalysis.recommendation}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Remediated State Banner - Show when role has 0 permissions */}
          {showLegacySummaryScaffolding && totalPermissions === 0 && (
            <div className="rounded-md border border-[#86efac] bg-[#f0fdf4] p-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[#10b98120] rounded-full flex items-center justify-center shrink-0">
                  <CheckCircle className="w-5 h-5 text-[#10b981]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[#10b981]">Fully remediated</h3>
                  <p className="text-xs text-[#10b981] mt-0.5">
                    All unused permissions removed · AWS IAM policies detached.
                  </p>
                </div>
                <div className="text-center px-3 py-1.5 bg-[#10b98120] rounded-md shrink-0">
                  <div className="text-lg font-semibold tabular-nums text-[#10b981] leading-none">100%</div>
                  <div className="text-[10px] text-[#10b981] font-medium mt-0.5">LP score</div>
                </div>
              </div>
              {usedCount > 0 && (
                <div className="mt-2 pt-2 border-t border-[#10b98140]">
                  <p className="text-[11px]" style={{ color: "var(--muted-foreground, #6b7280)" }}>
                    <span className="font-medium">Historical:</span> {usedCount} actions used in the past {observationDays} days.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Over-Privileged Summary — single merged card (replaces banner + 3-card grid) */}
          {false && analysisTab === 'summary' && totalPermissions > 0 && (() => {
            const accent =
              unusedPercent >= 75 ? '#ef4444' :
              unusedPercent >= 50 ? '#f97316' :
              unusedPercent >= 25 ? '#eab308' : '#22c55e'
            const borderTint =
              unusedPercent >= 75 ? '#ef444440' :
              unusedPercent >= 50 ? '#f9731640' :
              unusedPercent >= 25 ? '#eab30840' : '#22c55e40'
            const bgTint =
              unusedPercent >= 75 ? '#ef444408' :
              unusedPercent >= 50 ? '#f9731608' :
              unusedPercent >= 25 ? '#eab30808' : '#22c55e08'
            return (
              <div className="rounded-md border p-3" style={{ borderColor: borderTint, background: bgTint }}>
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-center shrink-0 w-16">
                    <span className="text-2xl font-semibold tabular-nums leading-none" style={{ color: accent }}>
                      {unusedPercent}%
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide mt-1" style={{ color: accent }}>
                      Over-privileged
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-xs" style={{ color: "var(--foreground, #111827)" }}>
                        <span className="font-semibold tabular-nums">{unusedCount}</span> of <span className="font-semibold tabular-nums">{totalPermissions}</span> not observed · <span className="font-semibold tabular-nums" style={{ color: '#16a34a' }}>{usedCount}</span> observed in use
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ background: '#e5e7eb' }}>
                      <div className="h-full transition-all" style={{
                        width: `${usedPercent}%`, background: '#22c55e',
                        minWidth: usedCount > 0 ? '3px' : '0',
                      }} />
                      <div className="h-full transition-all" style={{
                        width: `${unusedPercent}%`, background: accent,
                      }} />
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px]">
                      <span className="flex items-center gap-1" style={{ color: '#16a34a' }}>
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="tabular-nums">{usedCount}</span> used ({usedPercent}%)
                      </span>
                      <span className="flex items-center gap-1" style={{ color: accent }}>
                        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
                        <span className="tabular-nums">{unusedCount}</span> not observed ({unusedPercent}%)
                      </span>
                      <span className="ml-auto text-slate-400 tabular-nums">{totalPermissions} total</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Removed: legacy "Least-privilege finding" amber card.
              The same fact ({unusedPercent}% over-privileged) is now in
              the verdict header + the over-privileged summary card
              above; rendering it three times was the source of the
              "modal looks like five things failed" complaint. Risk
              badge moved to the over-privileged summary card so the
              CRITICAL / HIGH / MEDIUM signal is preserved without
              the duplicate prose. */}

          {/* Permission Usage Breakdown - Only show if not remediated */}
          {analysisTab === 'permissions' && !safetyLoading && totalPermissions > 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-lg border border-[var(--border,#e5e7eb)] bg-white p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground,#6b7280)]">Selected</div>
                <div className="mt-2 text-3xl font-bold text-[var(--foreground,#111827)]">{selectedPermissionsToRemove.size}</div>
                <div className="mt-1 text-sm text-[var(--muted-foreground,#6b7280)]">permissions queued for removal</div>
              </div>
              <div className="rounded-lg border border-[#fecaca] bg-[#fff1f2] p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-[#b91c1c]">Verified candidates</div>
                <div className="mt-2 text-3xl font-bold text-[#ef4444]">{Math.max(0, removableCount)}</div>
                <div className="mt-1 text-sm text-[#b91c1c]">eligible to enter a change plan</div>
              </div>
              <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-[#b45309]">Awaiting evidence</div>
                <div className="mt-2 text-3xl font-bold text-[#d97706]">{warnPerms.length}</div>
                <div className="mt-1 text-sm text-[#92400e]">not safe to change yet</div>
              </div>
              <div className="rounded-lg border border-[#d1d5db] bg-[#f9fafb] p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-[#4b5563]">Protected / keep</div>
                <div className="mt-2 text-3xl font-bold text-[#4b5563]">{protectedPerms.length}</div>
                <div className="mt-1 text-sm text-[#6b7280]">excluded from removal</div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800" data-testid="permission-removal-answer">
              <strong>What can be removed now:</strong>{" "}
              {removableCount > 0
                ? `${removableCount} evidence-verified permission${removableCount === 1 ? "" : "s"}, listed below.`
                : "nothing. Every not-observed permission is either awaiting evidence or protected."}
            </div>
            <h3 className="text-lg font-bold text-[var(--foreground,#111827)]">Permission Usage Breakdown</h3>

            {/* Actually Used Permissions */}
            <div className="border border-[#22c55e40] rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-[#22c55e]" />
                  <span className="font-semibold" style={{ color: "var(--foreground, #111827)" }}>Actually Used Permissions ({usedCount})</span>
                </div>
                <span className="px-3 py-1 border border-[#22c55e40] text-[#22c55e] rounded-lg text-sm font-medium bg-[#22c55e10]">
                  Keep these
                </span>
              </div>
              <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                {usedPermissions.length > 0 ? usedPermissions.map((perm, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-[#22c55e]">✓</span>
                    <span className="font-mono text-[var(--foreground,#1f2937)]">{perm.permission}</span>
                    <span style={{ color: "var(--muted-foreground, #9ca3af)" }}>- {perm.usage_count && perm.usage_count > 1 ? `${perm.usage_count.toLocaleString()} API calls` : 'Active'}</span>
                  </div>
                )) : usedCount > 0 ? (
                  <div className="p-3 rounded-lg" style={{ background: "var(--background, #f8f9fa)" }}>
                    <p className="text-sm" style={{ color: "var(--foreground, #374151)" }}>
                      <strong>{usedCount} permission{usedCount !== 1 ? 's' : ''}</strong> observed in use via CloudTrail.
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--muted-foreground, #9ca3af)" }}>
                      Permission names not yet resolved — the role has managed policies whose individual actions were not expanded in the graph.
                    </p>
                  </div>
                ) : (
                  <p className="text-[var(--muted-foreground,#9ca3af)] text-sm italic">No permissions observed in use during the observation period</p>
                )}
              </div>
            </div>

            {/* Canonical action disposition — candidates vs evidence holds vs protected */}
            {(
                <>
                  {/* Removable permissions */}
                  <div className="border-2 border-[#ef444440] bg-[#ef444410] rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-[#ef4444]" />
                        <span className="font-semibold text-[#ef4444]">Verified Removal Candidates ({removableCount})</span>
                      </div>
                      <span className="px-3 py-1 bg-[#ef444420] text-[#ef4444] border border-[#ef444440] rounded-lg text-sm font-medium">
                        {removableCount > 0 ? "Eligible for plan" : "None verified"}
                      </span>
                    </div>
                    {removablePerms.length > 0 ? (
                      <div className="mt-3 grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                        {removablePerms.map((perm, i) => {
                          const tierColors: Record<string, string> = {
                            'CRITICAL': '#ef4444',
                            'HIGH': '#f97316',
                            'MEDIUM': '#eab308',
                            'LOW': '#6b7280',
                          }
                          const tierColor = tierColors[(perm as any).risk_level] || '#ef4444'
                          const damageTier = (perm as any).damage_tier || ''
                          const damageLabel = (perm as any).damage_label || ''
                          return (
                            <div key={i} className="flex items-center gap-2 text-sm" title={damageLabel}>
                              <X className="w-4 h-4 flex-shrink-0" style={{ color: tierColor }} />
                              <span className="font-mono text-[var(--foreground,#374151)] truncate">{perm.permission}</span>
                              {perm.removal_score !== null && perm.removal_score !== undefined && (
                                <span className="ml-auto shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[#b91c1c] border border-[#fecaca]">
                                  {perm.removal_score}/100
                                </span>
                              )}
                              {damageTier && damageTier !== 'READ' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0" style={{
                                  color: tierColor,
                                  background: `${tierColor}15`,
                                  border: `1px solid ${tierColor}30`
                                }}>
                                  {damageTier === 'IRREVERSIBLE' ? 'IRREVERSIBLE' :
                                   damageTier === 'ADMIN' ? 'ADMIN' :
                                   damageTier === 'DESTRUCTIVE' ? 'DELETE' :
                                   damageTier === 'WRITE' ? 'WRITE' : damageTier}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : removableCount > 0 ? (
                      <div className="mt-3 p-3 rounded-lg bg-[#ef444408]">
                        <p className="text-sm" style={{ color: "var(--foreground, #374151)" }}>
                          <strong>{removableCount} permission{removableCount !== 1 ? 's' : ''}</strong> are configured but were never used in {observationDays} days.
                        </p>
                        <p className="text-xs mt-1 text-[#ef4444]">
                          These permissions come from managed policies attached to this role. To remediate, detach the managed policies and replace with a minimal inline policy containing only the {usedCount} used permission{usedCount !== 1 ? 's' : ''}.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-lg border border-[#fecaca] bg-white/70 p-3 text-sm text-[#991b1b]">
                        No permission has passed the action-level evidence and dependency checks. The names and exact blockers are shown below.
                      </div>
                    )}
                  </div>

                  {/* Caution permissions (logging, SLR, ECS) — selectable but warned */}
                  {warnPerms.length > 0 && (
                    <div className="border-2 border-[#fde68a] bg-[#fefce8] rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-[#eab308]" />
                          <span className="font-semibold text-[#a16207]">Awaiting Evidence ({warnPerms.length})</span>
                        </div>
                        <span className="px-3 py-1 bg-[#eab30815] text-[#eab308] border border-[#fde68a] rounded-lg text-sm font-medium">
                          Do not change yet
                        </span>
                      </div>
                      <p className="text-xs mt-2 text-[#a16207]">
                        No use was observed, but Cyntro cannot yet prove these actions are safe to remove. Each action shows its current evidence blocker.
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                        {warnPerms.map((perm, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <AlertTriangle className="w-3 h-3 flex-shrink-0 text-[#eab308]" />
                            <div className="min-w-0">
                              <div className="font-mono text-[var(--foreground,#374151)] break-all">{perm.permission}</div>
                              <div className="mt-0.5 text-xs text-[#92400e]">{perm.removal_reason || perm.recommendation}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Protected permissions (SSM, iam:PassRole, KMS, STS) */}
                  {protectedPerms.length > 0 && (
                    <div className="border-2 border-[#d1d5db] bg-[#f9fafb] rounded-xl p-4 opacity-75">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Lock className="w-5 h-5 text-[#6b7280]" />
                          <span className="font-semibold text-[#6b7280]">Protected Permissions ({protectedPerms.length})</span>
                        </div>
                        <span className="px-3 py-1 bg-[#6b728015] text-[#6b7280] border border-[#d1d5db] rounded-lg text-sm font-medium">
                          Do not remove
                        </span>
                      </div>
                      <p className="text-xs mt-2 text-[#6b7280]">
                        These actions are explicitly excluded from removal because they are dependencies, control-plane primitives, or protected infrastructure behavior.
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                        {protectedPerms.map((perm, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <Lock className="w-3 h-3 flex-shrink-0 text-[#6b7280]" />
                            <div className="min-w-0">
                              <div className="font-mono text-[#4b5563] break-all">{perm.permission}</div>
                              <div className="mt-0.5 text-xs text-[#6b7280]">{perm.removal_reason || perm.recommendation}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
            )}
          </div>
          )}

          {analysisTab === 'context' && (
            <div className="space-y-4">
              {safetyContext && (
                <details className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                    Technical decision details
                  </summary>
                  <p className="mb-3 mt-2 text-xs text-slate-600">
                    Audit metadata and scoring factors for security engineers. These explain automation safety—not whether the role is over-permissioned.
                  </p>
                  <div className="space-y-3">
                    {renderSafetyVectorDecision()}
                    {renderSafetyBreakdown()}
                  </div>
                </details>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="rounded-lg border border-[var(--border,#e5e7eb)] bg-white p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground,#6b7280)]">Ready to remove</div>
                  <div className="mt-2 text-3xl font-bold text-[var(--foreground,#111827)]">{removalSafety?.scored_candidate_count ?? 0}</div>
                  <div className="mt-1 text-sm text-[var(--muted-foreground,#6b7280)]">permissions with an executable evidence assessment</div>
                </div>
                <div className="rounded-lg border border-[var(--border,#e5e7eb)] bg-white p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground,#6b7280)]">Needs evidence</div>
                  <div className="mt-2 text-3xl font-bold text-[var(--foreground,#111827)]">{removalSafety?.insufficient_evidence_count ?? 0}</div>
                  <div className="mt-1 text-sm text-[var(--muted-foreground,#6b7280)]">permissions Cyntro will not change yet</div>
                </div>
                <div className="rounded-lg border border-[var(--border,#e5e7eb)] bg-white p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground,#6b7280)]">Observed in use</div>
                  <div className="mt-2 text-3xl font-bold text-[var(--foreground,#111827)]">{removalSafety?.used_count ?? permissionView.usedCount}</div>
                  <div className="mt-1 text-sm text-[var(--muted-foreground,#6b7280)]">permissions that will be kept</div>
                </div>
                <div className="rounded-lg border border-[var(--border,#e5e7eb)] bg-white p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground,#6b7280)]">Protected</div>
                  <div className="mt-2 text-3xl font-bold text-[var(--foreground,#111827)]">{removalSafety?.protected_count ?? permissionView.protected.length}</div>
                  <div className="mt-1 text-sm text-[var(--muted-foreground,#6b7280)]">permissions excluded from removal</div>
                </div>
              </div>

              {removalSafety && (
                <div className="rounded-lg border border-[var(--border,#e5e7eb)] bg-white p-5">
                  <h3 className="text-lg font-bold text-[var(--foreground,#111827)]">Why remediation is unavailable</h3>
                  <p className="mt-2 text-sm text-[var(--muted-foreground,#6b7280)]">
                    This is removal evidence, not confidence in the finding. Cyntro requires current evidence for each action and its dependencies; missing or stale evidence stays unscored and cannot enter a change plan.
                  </p>
                  {applyDisabled && (
                    <p className="mt-2 text-sm font-medium text-amber-800">
                      {authorityHoldReason ?? "Production IAM execution is also disabled in this release; Preview remains read-only."}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="rounded-lg border border-[var(--border,#e5e7eb)] bg-white p-5">
                  <h3 className="text-lg font-bold text-[var(--foreground,#111827)]">Dependency Context</h3>
                  {dependencyContext?.status === 'ok' ? (
                    <>
                      <p className="mt-2 text-sm text-[var(--muted-foreground,#6b7280)]">
                        {dependencyContext.has_critical_dependencies
                          ? 'Critical dependencies were detected for this role. Review downstream impact before removing permissions.'
                          : 'No critical dependencies were detected from the current graph context.'}
                      </p>
                      {dependencyContext.system?.name && (
                        <div className="mt-4 text-sm text-[var(--foreground,#374151)]">
                          System: <span className="font-semibold">{dependencyContext.system.name}</span>
                        </div>
                      )}
                      <div className="mt-4 space-y-2 max-h-52 overflow-y-auto">
                        {(dependencyContext.dependencies || []).slice(0, 8).map((dep, i) => (
                          <div key={i} className="rounded-lg border border-[var(--border,#e5e7eb)] p-3 text-sm">
                            <div className="font-medium text-[var(--foreground,#111827)]">{dep.name || dep.arn || 'Unnamed dependency'}</div>
                            <div className="text-[var(--muted-foreground,#6b7280)]">{dep.type || 'Unknown type'}{dep.environment ? ` • ${dep.environment}` : ''}</div>
                          </div>
                        ))}
                        {(dependencyContext.dependencies?.length || 0) === 0 && (
                          <div className="text-sm text-amber-800">The dependency scan returned no measured result. Cyntro does not treat an empty response as proof that no dependencies exist.</div>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-[var(--muted-foreground,#6b7280)]">
                      {dependencyContext?.status === 'neo4j_unavailable'
                        ? 'Dependency evidence is currently unavailable.'
                        : dependencyContext?.status === 'not_found'
                          ? 'This role was not found in the current dependency view.'
                          : 'Dependency analysis has not been computed for this role. Cyntro will not infer that zero dependencies exist.'}
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-[var(--border,#e5e7eb)] bg-white p-5">
                  <h3 className="text-lg font-bold text-[var(--foreground,#111827)]">Role Context</h3>
                  {serviceAnalysis ? (
                    <>
                      <p className="mt-2 text-sm text-[var(--foreground,#374151)]">{serviceAnalysis.description}</p>
                      <div className="mt-4 rounded-lg bg-[var(--background,#f8f9fa)] p-4">
                        <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground,#6b7280)]">Recommendation</div>
                        <div className="mt-2 text-sm text-[var(--foreground,#111827)]">{serviceAnalysis.recommendation}</div>
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-[var(--muted-foreground,#6b7280)]">
                      No special service-role signals were detected for this identity.
                    </p>
                  )}
                  <div className="mt-4 rounded-lg bg-[var(--background,#f8f9fa)] p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground,#6b7280)]">Selection State</div>
                    <div className="mt-2 text-sm text-[var(--foreground,#111827)]">
                      {selectedPermissionsToRemove.size} permissions selected for removal
                      {detachManagedPolicies ? ' • managed policy detach enabled' : ''}
                      {detachAllManagedPolicies ? ' • detach all enabled' : ''}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recommended Action */}
          {analysisTab === 'summary' && (() => {
            // The plain-language Preview summary above is authoritative once
            // the state-bound SafetyVector response arrives. Do not append the
            // legacy score-derived recommendation: it can use an older gap
            // snapshot and previously contradicted the headline ("All 27"
            // below "22 of 27"), while also recreating the clutter this
            // summary was designed to remove.
            if (safetyContext) return null

            const noUsageData = cloudtrailEvents === 0 && unusedCount > 0
            const isServiceRole = backendAnalysis?.is_service_role && backendAnalysis?.analysis?.severity === 'critical'
            const isRemediated = totalPermissions === 0 || !!gapData?.remediated_at

            // Show success message for remediated roles
            if (isRemediated) {
              const remediatedDate = gapData?.remediated_at
                ? new Date(gapData.remediated_at).toLocaleDateString()
                : null
              return (
                  <div className="space-y-3">
                  <div className="rounded-lg border border-[#86efac] bg-[#f0fdf4] p-5">
                    <h3 className="font-bold text-emerald-800">Remediated{remediatedDate ? ` on ${remediatedDate}` : ''}</h3>
                    <p className="text-[#10b981] mt-1">
                      This role has been remediated. Managed policies were detached from AWS IAM.
                    </p>
                    <div className="flex items-center gap-2 mt-3 text-[#10b981]">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-medium">Least privilege achieved - Role is optimized</span>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/proxy/iam-roles/rollback`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ role_name: roleName })
                        })
                        const result = await res.json()
                        if (res.ok) {
                          toast({ title: "Rollback Successful", description: `Restored ${roleName} to pre-remediation state`, variant: "default" })
                          fetchGapAnalysis(true)
                          onRollbackSuccess?.(roleName)
                          dispatchRemediationChanged({
                            action: "rollback",
                            resource_type: "IAMRole",
                            resource_id: roleName,
                          })
                        } else if (res.status === 404) {
                          toast({ title: "No Snapshot Available", description: `No rollback snapshot found for ${roleName}. The remediation may have been done outside this system.`, variant: "destructive" })
                        } else {
                          toast({ title: "Rollback Failed", description: result.detail || 'Could not rollback', variant: "destructive" })
                        }
                      } catch (err: any) {
                        toast({ title: "Rollback Error", description: err.message, variant: "destructive" })
                      }
                    }}
                    className="w-full px-4 py-3 bg-amber-600 text-white rounded-md hover:bg-amber-700 text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Rollback to Pre-Remediation State
                  </button>
                </div>
              )
            } else if (isServiceRole) {
              return (
                <div className="rounded-lg border border-[#fecaca] bg-[#fff1f2] p-5">
                  <h3 className="font-bold text-[#ef4444]">Do Not Remediate</h3>
                  <p className="text-[#ef4444] mt-1">
                    This is an AWS service role used by {backendAnalysis?.analysis?.service_name}.
                    Removing permissions will break the service.
                  </p>
                  <div className="flex items-center gap-2 mt-3 text-[#ef4444]">
                    <XCircle className="w-5 h-5" />
                    <span className="font-medium">Remediation blocked - Service role detected</span>
                  </div>
                </div>
              )
            } else if (noUsageData || (usedCount === 0 && unusedCount > 0)) {
              return (
                <div className="rounded-lg border border-[#fdba74] bg-[#fff7ed] p-5">
                  <h3 className="font-bold text-[#f97316]">Investigation Required</h3>
                  <p className="text-[#f97316] mt-1">
                    {usedCount === 0
                      ? `All ${unusedCount} permissions show no observed usage. This could mean the role is truly unused, or that usage is not captured by current data sources.`
                      : `Cannot verify if permissions are truly unused. This role may be used by EC2 instances, Lambda functions, or other services that don't fully log to our data sources.`
                    }
                  </p>
                  <div className="flex items-center gap-2 mt-3 text-[#f97316]">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-medium">Low confidence — Enable data events and investigate before removing</span>
                  </div>
                </div>
              )
            } else if (verdictBucket === 'blocked') {
              // Suppressed: the top-of-Summary verdict header already
              // shows "Paused — review required" with the same
              // unsafe_reasons + consumer count + "Pipeline decision"
              // sentence. Rendering this card AGAIN at the bottom of
              // the tab made the modal look like five different
              // things failed when really one safety hold was being
              // shown twice. The verdict above is authoritative.
              return null
            } else {
              return (
                <div className="rounded-lg border border-[var(--border,#e5e7eb)] bg-white p-5">
                  <h3 className="font-bold" style={{ color: "var(--foreground, #111827)" }}>Recommended Action</h3>
                  <p className="text-[var(--muted-foreground,#4b5563)] mt-1">
                    Remove {unusedCount} unused permissions to achieve least privilege compliance.
                    This will reduce the attack surface by {unusedPercent}% while maintaining all current functionality.
                  </p>
                  <div className={`flex items-center gap-2 mt-3 ${planToken ? 'text-[#22c55e]' : 'text-[#b45309]'}`}>
                    {planToken ? <Shield className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                    <span className="font-medium">
                      {planToken
                        ? 'Verified change plan available; all safety gates run again at Apply.'
                        : 'Verified change plan unavailable — this IAM role cannot be changed.'}
                    </span>
                  </div>
                </div>
              )
            }
          })()}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 px-5 py-3 border-t flex items-center justify-between" style={{ borderColor: "var(--border, #e5e7eb)", background: "#f8fafc" }}>
          <button
            onClick={handleClose}
            className="px-3 py-1.5 text-xs border rounded-md font-medium hover:bg-white"
            style={{ borderColor: "var(--border, #e5e7eb)", color: "var(--muted-foreground, #6b7280)" }}
          >
            Close
          </button>
          {shouldOfferIamSimulation(Boolean(removalSafety), removableCount, gapData?.remediated_at) && <button
            onClick={async () => {
              const requestVersion = ++simulateFixRequestVersion.current
              setSimulating(true)
              try {
                const response = await fetch('/api/proxy/least-privilege/simulate-fix', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    resource_type: 'IAMRole',
                    resource_id: roleName,
                    system_name: systemName,
                    finding_id: findingId,
                  })
                })

                const result = await response.json()

                if (!response.ok) {
                  throw new Error(result.error || result.detail || `Simulation failed: ${response.status}`)
                }

                if (requestVersion !== simulateFixRequestVersion.current) return

                // The drawer must render the exact response that produced this
                // toast. Do not mix it with the background Preview snapshot.
                applySimulateFixSnapshot(result)

                const decision = result.safety?.decision
                // Match the modal's verdict labels exactly so the toast
                // and the verdict block tell the same story. Customer
                // was reading "Blocked" in the toast and "Safety hold"
                // in the modal and asking which is it.
                const decisionLabel =
                  decision === 'auto_eligible' ? 'Auto-eligible' :
                  decision === 'blocked'       ? 'Safety hold' :
                  'Approval required'
                const rollbackSummary = result.safety?.rollback_available
                  ? 'A restore point will be created and verified before Apply changes AWS.'
                  : 'Apply remains blocked because a restore point cannot be guaranteed.'
                const responseRemovalCount = Array.isArray(result.plan?.permissions_to_remove)
                  ? result.plan.permissions_to_remove.length
                  : selectedPermissionsToRemove.size
                const responsePlanCounts = simulationPlanCounts(
                  result.problem,
                  responseRemovalCount,
                  { usedCount, unusedCount, totalCount: totalPermissions },
                )
                toast({
                  title: `Simulation complete · ${decisionLabel}`,
                  description: `Plan: remove ${responsePlanCounts.removeCount}; ${responsePlanCounts.remainCount} remain unchanged, including all ${responsePlanCounts.observedUsedCount} observed in use. ${rollbackSummary}`,
                  variant: 'default',
                })

                setShowSimulation(true)
              } catch (error) {
                console.error('Simulation error:', error)
                toast({
                  title: 'Simulation Failed',
                  description: error instanceof Error ? error.message : 'Check console for details',
                  variant: 'destructive'
                })
              } finally {
                setSimulating(false)
              }
            }}
            disabled={simulating}
            className="px-3 py-1.5 text-xs text-white rounded-md font-semibold flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
            style={{ background: "#2D51DA" }}
          >
            {simulating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Simulating…
              </>
            ) : (
              'Simulate fix'
            )}
          </button>}
        </div>
      </div>
    </div>
    </>
  )
}
