"use client"

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import {
  X, Calendar, CheckCircle, AlertTriangle, Shield, ShieldCheck, Sparkles, Check,
  CheckSquare, Loader2, RefreshCw, XCircle, Activity, Lock
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { ConfidenceExplanationPanel } from "@/components/ConfidenceExplanationPanel"
import { fetchWithEnvelope } from "@/components/trust/use-trust-envelope"
import { TrustEnvelopeBadge, type Provenance } from "@/components/trust/trust-envelope-badge"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import type { ConfidenceScore, SimulateFixSafety, DecisionOutcomeCanonical } from "@/lib/types"

interface PermissionAnalysis {
  permission: string
  status: "USED" | "UNUSED"
  risk_level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  recommendation: string
  usage_count: number | null
  last_used?: string
}

interface DependencyInfo {
  arn?: string
  type?: string
  name?: string
  environment?: string
}

interface DependencyContext {
  status: 'ok' | 'not_found' | 'neo4j_unavailable' | 'error'
  system?: { name?: string; criticality?: string }
  dependencies?: DependencyInfo[]
  has_critical_dependencies?: boolean
  error?: string
}

interface GapAnalysisData {
  role_name: string
  role_arn?: string
  observation_days: number
  summary: {
    total_permissions: number
    used_count: number
    unused_count: number
    lp_score: number
    overall_risk: string
    cloudtrail_events: number
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
      permissions: Array<{
        permission: string
        status: string
        risk_level: string
        damage_tier?: string
        confidence_score: number
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
  systemName?: string
  identityType?: string
  onApplyFix?: (data: any) => void
  onSuccess?: () => void
  onRemediationSuccess?: (roleName: string) => void
  onRollbackSuccess?: (roleName: string) => void
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
function fallbackAnalyzeRole(roleName: string, cloudtrailEvents: number, unusedCount: number): BackendServiceRoleAnalysis | null {
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

export function IAMPermissionAnalysisModal({
  isOpen,
  onClose,
  roleName,
  systemName,
  identityType,
  onApplyFix,
  onSuccess,
  onRemediationSuccess,
  onRollbackSuccess
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
  const [showSimulation, setShowSimulation] = useState(false)
  const [analysisTab, setAnalysisTab] = useState<'summary' | 'permissions' | 'context'>('summary')
  const [simulating, setSimulating] = useState(false)
  const [applying, setApplying] = useState(false)
  const [createSnapshot, setCreateSnapshot] = useState(true)
  const [detachManagedPolicies, setDetachManagedPolicies] = useState(true)
  const [detachAllManagedPolicies, setDetachAllManagedPolicies] = useState(false)  // Detach ALL regardless of overlap
  const [selectedPermissionsToRemove, setSelectedPermissionsToRemove] = useState<Set<string>>(new Set())
  // In-app override confirmation modal. Replaces the old window.confirm
  // + window.prompt flow with a clean dialog that captures the rationale
  // + rollback acknowledgement. On submit -> handleApplyFix(true, lineage)
  // bypasses the native dialogs and proceeds straight to the API call.
  // The modal stays OPEN through the API call and shows result inline
  // (spinner -> ✓ success or ✗ error) so the operator sees explicit
  // feedback even if the toast component is hidden/missed.
  const [overrideModal, setOverrideModal] = useState<{
    open: boolean
    rationale: string
    ackRollback: boolean
    phase: 'form' | 'applying' | 'success' | 'error'
    message: string
  }>({ open: false, rationale: '', ackRollback: true, phase: 'form', message: '' })
  const [confidenceScore, setConfidenceScore] = useState<ConfidenceScore | null>(null)
  const [confidenceLoading, setConfidenceLoading] = useState(false)
  const [provenance, setProvenance] = useState<Provenance | null>(null)
  // Pipeline safety context from simulate-fix. When populated this is the
  // AUTHORITATIVE decision source — Agent 5 (confidenceScore) is merely
  // an explainer subordinate to it. See Layer 1/2 in backend.
  const [safetyContext, setSafetyContext] = useState<SimulateFixSafety | null>(null)
  // Default to `true` so the FIRST render shows the loading skeleton,
  // not the "Cyntro could not verify safety" red fallback below
  // (which only fires correctly once the fetch has actually completed
  // without producing a safety context). The useEffect that drives
  // fetchSafetyContext fires AFTER the first render -- without this
  // default, users see a brief red flash before the loading state
  // kicks in. Bug surfaced 2026-05-07 ("its appear and than gone").
  const [safetyLoading, setSafetyLoading] = useState(true)

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
  }, [isOpen, roleName])

  const fetchSafetyContext = async (): Promise<SimulateFixSafety | null> => {
    setSafetyLoading(true)
    setSafetyContext(null)
    try {
      const res = await fetch('/api/proxy/least-privilege/simulate-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_type: 'IAMRole',
          resource_id: roleName,
          system_name: systemName,
        }),
      })
      if (!res.ok) {
        console.warn('[IAM-Modal] simulate-fix fetch non-200:', res.status)
        return null
      }
      const data = await res.json()
      const safety = data?.safety as SimulateFixSafety | undefined
      if (safety) {
        setSafetyContext(safety)
        return safety
      }
      return null
    } catch (e) {
      console.warn('[IAM-Modal] simulate-fix fetch failed:', e)
      return null
    } finally {
      setSafetyLoading(false)
    }
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
        observation_days: rawData.observation_days || 365,
        summary: {
          // Always use backend counts — they come from Neo4j pre-computed data
          total_permissions: finalTotalCount,
          used_count: finalUsedCount,
          unused_count: finalUnusedCount,
          lp_score: derivedLpScore,
          overall_risk: rawData.summary?.overall_risk ?? rawData.overall_risk ?? 'MEDIUM',
          cloudtrail_events: rawData.summary?.cloudtrail_events ?? rawData.event_count ?? rawData.total_events ?? 0,
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
      // Initialize all unused permissions as selected by default, excluding protected, warn, and reserved ones
      const excludedPerms = new Set(
        (mappedData.confidence_groups?.groups ?? [])
          .filter(g => g.protected || g.action === 'protected' || g.action === 'warn_before_removing' || g.action === 'reserved')
          .flatMap(g => g.permissions.map(p => p.permission))
      )
      const unusedPermsSet = new Set(mappedData.unused_permissions.filter(p => !excludedPerms.has(p)))
      setSelectedPermissionsToRemove(unusedPermsSet)

      // Auto-enable "Detach managed policies" when permission lists are empty
      // (managed policies can't be remediated by removing individual permissions)
      if (mappedData.unused_permissions.length === 0 && mappedData.summary.unused_count > 0) {
        setDetachManagedPolicies(true)
        setDetachAllManagedPolicies(true)
      }
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
    onClose()
  }

  const handleSimulate = async () => {
    console.log('[IAM-Modal] handleSimulate called! roleName:', roleName, 'unusedCount:', gapData?.summary?.unused_count)
    setSimulating(true)

    try {
      // Create a pre-simulation snapshot for rollback safety
      console.log('[IAM-Modal] Creating pre-simulation snapshot for:', roleName)
      const snapshotResponse = await fetch(`/api/proxy/iam-roles/${encodeURIComponent(roleName)}/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (snapshotResponse.ok) {
        const snapshotResult = await snapshotResponse.json()
        console.log('[IAM-Modal] Snapshot created:', snapshotResult.snapshot_id)
        toast({
          title: "📸 Snapshot Created",
          description: `Rollback point saved: ${snapshotResult.snapshot_id}`,
          variant: "default"
        })
      } else {
        console.warn('[IAM-Modal] Failed to create snapshot, continuing with simulation')
      }
    } catch (error) {
      console.warn('[IAM-Modal] Snapshot creation failed:', error)
    }

    setSimulating(false)
    setShowSimulation(true)
  }

  const handleApplyFix = async (
    force: boolean = false,
    prebuiltLineage?: Record<string, any>,
    skipAutoClose: boolean = false,
  ): Promise<string | undefined> => {
    if (!gapData) return undefined

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
    const allSelected = Array.from(selectedPermissionsToRemove)
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
      overrideLineage = {
        rationale: 'Operator clicked Acknowledge & Apply on the safety hold modal.',
        acknowledged: Array.from(ackSet),
        rollback_plan_acknowledged: createSnapshot,
        overridden_by: 'operator',
        overridden_at: new Date().toISOString(),
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
          onRemediationSuccess(roleName)
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

  if (!isOpen) return null

  // Calculate derived values
  const observationDays = gapData?.observation_days ?? 365
  const overallRisk = gapData?.summary?.overall_risk ?? 'UNKNOWN'
  const cloudtrailEvents = gapData?.summary?.cloudtrail_events ?? 0

  const usedPermissions = (gapData?.permissions_analysis ?? []).filter(p => p.status === 'USED')
  const unusedPermissions = (gapData?.permissions_analysis ?? []).filter(p => p.status === 'UNUSED')

  // Backend summary counts are authoritative — permission lists are supplementary detail
  const usedCount = gapData?.summary?.used_count ?? usedPermissions.length
  const unusedCount = gapData?.summary?.unused_count ?? unusedPermissions.length
  const totalPermissions = gapData?.summary?.total_permissions ?? (usedCount + unusedCount)
  const lpScore = gapData?.summary?.lp_score ?? (totalPermissions > 0 ? Math.round((usedCount / totalPermissions) * 100) : 0)
  const hasPermissionLists = usedPermissions.length > 0 || unusedPermissions.length > 0

  const usedPercent = totalPermissions > 0 ? Math.round((usedCount / totalPermissions) * 100) : 0
  const unusedPercent = totalPermissions > 0 ? Math.round((unusedCount / totalPermissions) * 100) : 0
  const backendAnalysis = (gapData as any)?.service_role_analysis as BackendServiceRoleAnalysis | undefined
  const serviceAnalysis = backendAnalysis?.analysis || fallbackAnalyzeRole(roleName, cloudtrailEvents, unusedCount)?.analysis
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
  const removablePerms = unusedPermissions.filter(p => !protectedSet.has(p.permission) && !warnSet.has(p.permission))
  const warnPerms = unusedPermissions.filter(p => warnSet.has(p.permission))
  const protectedPerms = unusedPermissions.filter(p => protectedSet.has(p.permission))
  const removableCount = unusedCount - protectedPerms.length - warnPerms.length
  
  // Calculate dates
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - observationDays)
  const formatDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  // Safety score — uses backend-computed confidence when available
  const calculateSafetyScore = () => {
    if (!gapData) return 95

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
        if (cloudtrailEvents > 100000) highRiskPenalty = Math.min(3, highRiskCount)
        else if (cloudtrailEvents > 10000) highRiskPenalty = Math.min(5, Math.ceil(highRiskCount * 0.5))
        else if (cloudtrailEvents > 1000) highRiskPenalty = Math.min(8, highRiskCount)
        else highRiskPenalty = Math.min(12, highRiskCount * 2)
      }
      score -= highRiskPenalty
      if (cloudtrailEvents > 0 && cloudtrailEvents < 10) score -= 5
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
  const safetyScore = confidenceScore?.confidence ?? legacySafetyScore

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
  const canonicalToBucket = (d?: DecisionOutcomeCanonical | null):
    'blocked' | 'manual_review' | 'human_approval' | 'auto_execute' | null => {
    if (!d) return null
    if (d === 'BLOCK' || d === 'EXCLUDE') return 'blocked'
    if (d === 'MANUAL_REVIEW') return 'manual_review'
    if (d === 'REQUIRE_APPROVAL' || d === 'CANARY_FIRST') return 'human_approval'
    if (d === 'AUTO_EXECUTE') return 'auto_execute'
    return null
  }
  // Cap the non-pipeline fallback below auto_execute. The UI must never
  // render "SAFE TO APPLY" unless the unified pipeline explicitly said so.
  // If only Agent 5 (confidenceScore.routing) or the legacy score thresholds
  // are speaking, the highest the badge can go is "Human Approval" — the
  // operator decides, not the AI alone.
  const _pipelineBucket = canonicalToBucket(safetyContext?.decision_canonical ?? null)
  const _agentRouting = confidenceScore?.routing
  const _legacyFallback: 'blocked' | 'manual_review' | 'human_approval' =
    safetyScore < 50 ? 'manual_review'
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

  // Loading state
  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-8 text-center">
          <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-[#8b5cf6]" />
          <h2 className="text-2xl font-bold mb-2 text-[var(--foreground,#111827)]">Analyzing Permissions</h2>
          <p style={{ color: "var(--muted-foreground, #6b7280)" }}>Analyzing usage data for <span className="font-bold" style={{ color: "var(--foreground, #111827)" }}>{roleName}</span>...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full p-8">
          <h2 className="text-2xl font-bold mb-2 text-[var(--foreground,#111827)]">Simulating Permission Removal</h2>
          <p className="text-lg mb-6">
            <span className="font-bold" style={{ color: "var(--foreground, #111827)" }}>{roleName}</span>
            <span style={{ color: "var(--muted-foreground, #6b7280)" }}> - Analyzing {observationDays} days of permission usage...</span>
          </p>
          
          <div className="space-y-4">
            {[
              { title: "Loading usage history...", subtitle: `Analyzing ${cloudtrailEvents.toLocaleString()} permission checks`, done: true },
              { title: "Identifying unused permissions...", subtitle: `Found ${unusedCount} never-used permissions`, done: true },
              { title: "Checking service dependencies...", subtitle: "Validating active services", done: true },
              { title: "Calculating confidence score...", subtitle: `${safetyScore}% safe to remove`, done: false }
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 overflow-y-auto">
        <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
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
            {/* Safety Score Banner - Dynamic based on confidence */}
            {(() => {
              const backendAnalysis = (gapData as any)?.service_role_analysis as BackendServiceRoleAnalysis | undefined
              const isServiceRole = backendAnalysis?.is_service_role && backendAnalysis?.analysis?.severity === 'critical'
              const noCloudTrailData = cloudtrailEvents === 0 && unusedCount > 0

              if (isServiceRole) {
                // CRITICAL: Service role - DO NOT MODIFY
                return (
                  <div className="p-6 bg-white border-2 border-red-400 rounded-2xl text-center">
                    <div className="flex items-center justify-center gap-3">
                      <XCircle className="w-10 h-10 text-[#ef4444]" />
                      <span className="text-5xl font-bold text-[#ef4444]">{safetyScore}%</span>
                      <span className="text-2xl font-bold text-[#ef4444]">DO NOT APPLY</span>
                    </div>
                    <p className="text-[#ef4444] mt-2 font-semibold">
                      This is an AWS service role. Removing permissions will break {backendAnalysis?.analysis?.service_name}.
                    </p>
                  </div>
                )
              } else if (verdictBucket === 'blocked') {
                // Pipeline routed this to "review required". This is NOT a
                // system error -- the safety contract worked. Visual
                // treatment: amber safety-hold (not error red), so users
                // don't mistake a deliberate safety decision for a bug.
                // Service-role "DO NOT APPLY" stays red because that's
                // truly destructive; this branch is one tier softer.
                //
                // Reason precedence:
                //   1. Pipeline safety.unsafe_reasons[0]   (why pipeline held)
                //   2. Agent 5 gates_failed[0].detail      (why reviewer held)
                //   3. Generic copy
                const pipelineReason = safetyContext?.unsafe_reasons?.[0]
                const agent5Reason = confidenceScore?.gates_failed?.[0]?.detail
                const primaryReason = pipelineReason
                  ?? agent5Reason
                  ?? "Telemetry coverage is incomplete; we'd like a closer look before changing this role."
                const coveragePct = typeof safetyContext?.telemetry_coverage === 'number'
                  ? Math.round(safetyContext.telemetry_coverage * 100)
                  : null
                return (
                  <div className="p-6 bg-white border-2 border-[#f59e0b80] rounded-2xl">
                    <div className="flex items-center justify-center gap-3">
                      <Shield className="w-10 h-10 text-[#f59e0b]" />
                      <span className="text-2xl font-bold text-[#b45309]">SAFETY HOLD — REVIEW REQUIRED</span>
                    </div>
                    <p className="text-[#92400e] mt-2 font-semibold text-center">
                      Cyntro paused this change. {primaryReason}
                    </p>
                    {safetyContext && (
                      <div className="mt-4 p-3 rounded-lg text-left" style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
                        <p className="text-sm font-bold text-[#92400e] mb-2">Why we paused:</p>
                        <ul className="text-xs text-[#78350f] space-y-1 list-disc list-inside">
                          {typeof safetyContext.observation_days === 'number' && (
                            <li>
                              Effective observation: <strong>{safetyContext.observation_days} days</strong>
                              {' '}
                              {safetyContext.observation_days >= 21
                                ? <span className="text-[#15803d]">✓ enough history</span>
                                : <span className="text-[#b45309]">(needs ≥ 21)</span>}
                            </li>
                          )}
                          {coveragePct !== null && (
                            <li>
                              Telemetry coverage: <strong>{coveragePct}%</strong>
                              {' — '}
                              {coveragePct < 75
                                ? <span>enable VPC Flow Logs + AWS Config in this account to reach 100%</span>
                                : <span className="text-[#15803d]">good</span>}
                            </li>
                          )}
                          {typeof safetyContext.consumer_count === 'number' && safetyContext.consumer_count > 0 && (
                            <li>
                              <strong>{safetyContext.consumer_count}</strong> system{safetyContext.consumer_count === 1 ? '' : 's'} currently depend{safetyContext.consumer_count === 1 ? 's' : ''} on this role — narrowing could affect them
                            </li>
                          )}
                          {(safetyContext.unsafe_reasons ?? []).slice(1).map((reason, i) => (
                            <li key={`rsn-${i}`}>{reason}</li>
                          ))}
                        </ul>
                        <div className="mt-3 pt-3 border-t border-[#fde68a]">
                          <p className="text-xs text-[#92400e] font-semibold mb-1">What to do next:</p>
                          <ol className="text-xs text-[#78350f] space-y-1 list-decimal list-inside">
                            <li><strong>Investigate first</strong> — open the consumer list and confirm none use the {selectedPermissionsToRemove.size > 0 ? `${selectedPermissionsToRemove.size} ` : ''}permissions you're removing.</li>
                            <li><strong>Improve coverage</strong> — wire the missing telemetry planes; the same simulation will then route to APPROVAL instead of HOLD.</li>
                            <li><strong>Acknowledge &amp; apply</strong> — only after you've done one of the above; the action is recorded in the audit log with your operator id.</li>
                          </ol>
                        </div>
                      </div>
                    )}
                    {aiReviewerCopy && (
                      <p className="text-xs text-[#92400e] mt-3 text-center">{aiReviewerCopy}</p>
                    )}
                  </div>
                )
              } else if (verdictBucket === 'manual_review') {
                // LOW CONFIDENCE / MANUAL REVIEW
                const cg = gapData?.confidence_groups
                return (
                  <div className="p-6 bg-white border-2 border-[#f9731680] rounded-2xl text-center">
                    <div className="flex items-center justify-center gap-3">
                      <AlertTriangle className="w-10 h-10 text-[#f97316]" />
                      <span className="text-5xl font-bold text-[#f97316]">{safetyScore}{confidenceScore ? '' : '%'}</span>
                      <span className="text-2xl font-bold text-[#f97316]">{confidenceScore ? 'REVIEW REQUIRED' : 'LOW CONFIDENCE'}</span>
                    </div>
                    <p className="text-[#f97316] mt-2 font-semibold">
                      {cg ? `${cg.summary.investigate_first} permissions lack sufficient data to verify.` : 'Insufficient usage data collected.'}
                    </p>
                    {cg && (
                      <div className="mt-4 p-3 rounded-lg text-left" style={{ background: "#fff7ed", border: "1px solid #fed7aa" }}>
                        <p className="text-sm font-bold text-[#9a3412] mb-2">Data Source Gaps:</p>
                        <ul className="text-xs text-[#9a3412] space-y-1 list-disc list-inside">
                          {!cg.account_signals.s3_data_events && cg.groups.some(g => g.service_label === 'S3' && g.data_source_type === 'data_event') && (
                            <li>S3 data events not enabled — cannot verify object-level operations (GetObject, PutObject)</li>
                          )}
                          {!cg.account_signals.lambda_data_events && cg.groups.some(g => g.service_label === 'Lambda' && g.data_source_type === 'data_event') && (
                            <li>Lambda data events not enabled — cannot verify function invocations</li>
                          )}
                          {cg.groups.some(g => g.data_source_type === 'internal_service') && (
                            <li>Internal AWS service calls detected — these are never logged in CloudTrail</li>
                          )}
                          {noCloudTrailData && (
                            <li>No CloudTrail events found for this role — role may be inactive or used by internal service</li>
                          )}
                        </ul>
                        <p className="text-xs text-[#9a3412] mt-2 font-semibold">
                          {cg.summary.safe_to_remove > 0
                            ? `${cg.summary.safe_to_remove} permissions are safe to remove. Review groups individually.`
                            : 'Enable CloudTrail data events before remediating this role.'}
                        </p>
                      </div>
                    )}
                  </div>
                )
              } else if (verdictBucket === 'human_approval') {
                // Pipeline allows remediation but requires human approval —
                // typically because the role is shared, or partial telemetry.
                const cg = gapData?.confidence_groups
                return (
                  <div className="p-6 bg-white border-2 border-[#f9731640] rounded-2xl">
                    <div className="flex items-center justify-center gap-3">
                      <AlertTriangle className="w-10 h-10 text-[#f97316]" />
                      <span className="text-2xl font-bold text-[#f97316]">APPROVAL REQUIRED</span>
                    </div>
                    <p className="text-[#f97316] mt-2 text-center">
                      {cg ? `${cg.summary.safe_to_remove} permissions safe to remove, ${cg.summary.verify_first + cg.summary.investigate_first} need verification.`
                           : `${cloudtrailEvents.toLocaleString()} events analyzed — some permissions need verification.`}
                    </p>
                    {safetyContext && (
                      <div className="mt-4 p-3 rounded-lg text-left" style={{ background: "#fff7ed", border: "1px solid #fed7aa" }}>
                        <p className="text-sm font-bold text-[#9a3412] mb-2">Pipeline signals:</p>
                        <ul className="text-xs text-[#7c2d12] space-y-1 list-disc list-inside">
                          {typeof safetyContext.observation_days === 'number' && (
                            <li>Observation window: <strong>{safetyContext.observation_days} days</strong></li>
                          )}
                          {typeof safetyContext.telemetry_coverage === 'number' && (
                            <li>Telemetry coverage: <strong>{Math.round((safetyContext.telemetry_coverage || 0) * 100)}%</strong> ({safetyContext.completeness ?? 'unknown'})</li>
                          )}
                          {typeof safetyContext.consumer_count === 'number' && safetyContext.consumer_count > 0 && (
                            <li>{safetyContext.consumer_count} consumer{safetyContext.consumer_count === 1 ? '' : 's'} depend on this role</li>
                          )}
                          {(safetyContext.unsafe_reasons ?? []).map((reason, i) => (
                            <li key={`ur-${i}`}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {aiReviewerCopy && (
                      <p className="text-xs text-[#9a3412] mt-3 text-center italic">{aiReviewerCopy}</p>
                    )}
                  </div>
                )
              } else {
                // auto_execute — pipeline cleared this for auto-remediation.
                // We only reach this branch when safetyContext.decision_canonical
                // == "AUTO_EXECUTE" (or the fallback score path agrees).
                return (
                  <div className="p-6 bg-white border-2 border-[#22c55e40] rounded-2xl text-center">
                    <div className="flex items-center justify-center gap-3">
                      <CheckSquare className="w-10 h-10 text-[#22c55e]" />
                      <span className="text-2xl font-bold text-[#22c55e]">SAFE TO APPLY</span>
                    </div>
                    <p className="text-[#22c55e] mt-2">
                      {cloudtrailEvents.toLocaleString()} API events analyzed — pipeline approved.
                    </p>
                    {aiReviewerCopy && (
                      <p className="text-xs text-[#15803d] mt-3 italic">{aiReviewerCopy}</p>
                    )}
                  </div>
                )
              }
            })()}

            {/* What Will Change */}
            <div>
              <h3 className="font-bold text-lg  mb-3" style={{ color: "var(--foreground, #111827)" }}>
                {verdictBucket === 'blocked' ? 'What the Investigation Is About:' : 'What Will Change:'}
              </h3>
              {(() => {
                // When we have individual permission names, use selection count
                // When we only have counts (managed policies), use total unused count
                const removalCount = selectedPermissionsToRemove.size > 0
                  ? selectedPermissionsToRemove.size
                  : unusedCount
                const reductionPct = totalPermissions > 0 ? Math.round((removalCount / totalPermissions) * 100) : 0
                const newTotal = totalPermissions - removalCount
                const remediableUnusedBefore = Math.max(0, removableCount)
                const remediableUnusedAfter = Math.max(0, remediableUnusedBefore - removalCount)
                const remediableOverprivBefore = totalPermissions > 0
                  ? Math.round((remediableUnusedBefore / totalPermissions) * 100)
                  : 0
                const remediableOverprivAfter = newTotal > 0
                  ? Math.round((remediableUnusedAfter / newTotal) * 100)
                  : 0

                // On a pipeline block the "reduce attack surface by X%" /
                // "reduce remediable over-priv" lines are a lie — no
                // remediation is going to happen. Show only the inventory
                // line ("Remove N unused permissions") and flag it as
                // pending investigation, not as a done-deal.
                const isBlocked = verdictBucket === 'blocked'

                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "var(--background, #f8f9fa)" }}>
                      <Check className="w-5 h-5 text-[#22c55e] flex-shrink-0" />
                      <span>
                        {isBlocked ? (
                          <>Would remove <strong>{removalCount}</strong> unused permissions from {roleName} <em>(pending investigation)</em></>
                        ) : (
                          <>Remove <strong>{removalCount}</strong> unused permissions from {roleName}</>
                        )}
                      </span>
                    </div>
                    {!isBlocked && (
                      <>
                        <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "var(--background, #f8f9fa)" }}>
                          <Check className="w-5 h-5 text-[#22c55e] flex-shrink-0" />
                          <span>Reduce attack surface by <strong>{reductionPct}%</strong> ({totalPermissions} → {newTotal} permissions)</span>
                        </div>
                        <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "var(--background, #f8f9fa)" }}>
                          <Check className="w-5 h-5 text-[#22c55e] flex-shrink-0" />
                          <span>Reduce remediable over-privileged from <strong>{remediableOverprivBefore}%</strong> to <strong>{remediableOverprivAfter}%</strong></span>
                        </div>
                      </>
                    )}
                    {!hasPermissionLists && unusedCount > 0 && (
                      <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-300" style={{ background: "#fef3c710" }}>
                        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium" style={{ color: "var(--foreground, #111827)" }}>
                            This role uses AWS managed policies
                          </p>
                          <p className="text-xs mt-1" style={{ color: "var(--muted-foreground, #6b7280)" }}>
                            Individual permission names are not available. Remediation will detach managed policies and create a minimal inline policy with only the {usedCount} used permission{usedCount !== 1 ? 's' : ''}.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

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

              {/* Breakdown — tile grid + safety vector pills */}
              {gapData?.confidence_groups && (
                <div className="mb-4 p-5 rounded-xl" style={{ background: "var(--background, #f8f9fa)" }}>
                  <div className="text-xs uppercase tracking-wider font-semibold mb-3" style={{ color: "var(--muted-foreground, #6b7280)" }}>
                    Breakdown
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {gapData.confidence_groups.summary.safe_to_remove > 0 && (
                      <div className="flex flex-col p-3 rounded-lg bg-white border" style={{ borderColor: '#bbf7d0' }}>
                        <span className="text-3xl font-bold text-[#22c55e] leading-none">{gapData.confidence_groups.summary.safe_to_remove}</span>
                        <span className="text-[11px] uppercase tracking-wide text-slate-500 mt-2">Safe to remove</span>
                      </div>
                    )}
                    {gapData.confidence_groups.summary.verify_first > 0 && (
                      <div className="flex flex-col p-3 rounded-lg bg-white border" style={{ borderColor: '#fed7aa' }}>
                        <span className="text-3xl font-bold text-[#f97316] leading-none">{gapData.confidence_groups.summary.verify_first}</span>
                        <span className="text-[11px] uppercase tracking-wide text-slate-500 mt-2">Verify first</span>
                      </div>
                    )}
                    {gapData.confidence_groups.summary.investigate_first > 0 && (
                      <div className="flex flex-col p-3 rounded-lg bg-white border" style={{ borderColor: '#fecaca' }}>
                        <span className="text-3xl font-bold text-[#ef4444] leading-none">{gapData.confidence_groups.summary.investigate_first}</span>
                        <span className="text-[11px] uppercase tracking-wide text-slate-500 mt-2">Investigate first</span>
                      </div>
                    )}
                    {(gapData.confidence_groups.summary.reserved ?? 0) > 0 && (
                      <div className="flex flex-col p-3 rounded-lg bg-white border" style={{ borderColor: '#bfdbfe' }}>
                        <span className="text-3xl font-bold text-[#3b82f6] leading-none">{gapData.confidence_groups.summary.reserved}</span>
                        <span className="text-[11px] uppercase tracking-wide text-slate-500 mt-2">Reserved</span>
                      </div>
                    )}
                    {(gapData.confidence_groups.summary.warn_before_removing ?? 0) > 0 && (
                      <div className="flex flex-col p-3 rounded-lg bg-white border" style={{ borderColor: '#fde68a' }}>
                        <span className="text-3xl font-bold text-[#eab308] leading-none">{gapData.confidence_groups.summary.warn_before_removing}</span>
                        <span className="text-[11px] uppercase tracking-wide text-slate-500 mt-2">Caution</span>
                      </div>
                    )}
                    {(gapData.confidence_groups.summary.protected ?? 0) > 0 && (
                      <div className="flex flex-col p-3 rounded-lg bg-white border" style={{ borderColor: '#d1d5db' }}>
                        <span className="text-3xl font-bold text-[#6b7280] leading-none">{gapData.confidence_groups.summary.protected}</span>
                        <span className="text-[11px] uppercase tracking-wide text-slate-500 mt-2">Protected</span>
                      </div>
                    )}
                  </div>
                  {/* Safety vector — patent-A3 dimensions from unified scorer */}
                  {gapData.safety_vector && (
                    <div className="mt-4 pt-4 border-t flex flex-wrap gap-x-6 gap-y-2 text-xs" style={{ borderColor: 'var(--border, #e5e7eb)' }}>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-bold text-sm" style={{ color: gapData.safety_vector.source_coverage >= 0.75 ? '#16a34a' : gapData.safety_vector.source_coverage >= 0.5 ? '#d97706' : '#dc2626' }}>
                          {Math.round(gapData.safety_vector.source_coverage * 100)}%
                        </span>
                        <span className="uppercase tracking-wide text-slate-500 text-[10px]">Coverage</span>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-bold text-sm" style={{ color: gapData.safety_vector.signal_strength >= 0.75 ? '#16a34a' : gapData.safety_vector.signal_strength >= 0.5 ? '#d97706' : '#dc2626' }}>
                          {Math.round(gapData.safety_vector.signal_strength * 100)}%
                        </span>
                        <span className="uppercase tracking-wide text-slate-500 text-[10px]">Signal strength</span>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-bold text-sm text-slate-700">{gapData.safety_vector.signal_count}</span>
                        <span className="uppercase tracking-wide text-slate-500 text-[10px]">CloudTrail events</span>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-bold text-sm text-slate-700">{gapData.safety_vector.observation_days}d</span>
                        <span className="uppercase tracking-wide text-slate-500 text-[10px]">Observation</span>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-bold text-sm text-slate-700">{gapData.safety_vector.planes_active.join(' · ') || '—'}</span>
                        <span className="uppercase tracking-wide text-slate-500 text-[10px]">Planes active</span>
                      </div>
                      {gapData.safety_vector.health && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-bold text-sm" style={{ color: gapData.safety_vector.health.historical_success >= 0.9 ? '#16a34a' : gapData.safety_vector.health.historical_success >= 0.7 ? '#d97706' : '#dc2626' }}>
                            {Math.round(gapData.safety_vector.health.historical_success * 100)}%
                          </span>
                          <span className="uppercase tracking-wide text-slate-500 text-[10px]">Historical success</span>
                        </div>
                      )}
                      {gapData.safety_vector.rollback && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-bold text-sm" style={{ color: gapData.safety_vector.rollback.value >= 0.9 ? '#16a34a' : gapData.safety_vector.rollback.value >= 0.7 ? '#d97706' : '#dc2626' }}>
                            {Math.round(gapData.safety_vector.rollback.value * 100)}%
                          </span>
                          <span className="uppercase tracking-wide text-slate-500 text-[10px]">
                            Rollback ready{gapData.safety_vector.rollback.snapshot_capable ? '' : ' (no snap)'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

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
                            <span className="font-semibold text-sm" style={{ color: "var(--foreground, #111827)" }}>{group.label}</span>
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
                            ) : !group.logged_by_default && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: colors.border, color: colors.text }}>
                                {group.data_source_type === 'data_event' ? 'DATA EVENT' :
                                 group.data_source_type === 'internal_service' ? 'INTERNAL' : 'PARTIAL'}
                              </span>
                            )}
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
                        <div className="px-4 py-1.5 text-xs border-b" style={{ color: "var(--muted-foreground, #6b7280)", borderColor: colors.border, background: colors.bg + '80' }}>
                          {group.explanation}
                        </div>
                        {/* Decision Contract operator_context (Sprint 1 CP1) — preferred when present */}
                        {isInferredOrTelemetryBlocked && group.decision_contract?.operator_context ? (() => {
                          const oc = group.decision_contract!.operator_context!
                          const checks = oc.what_to_check || []
                          const saferRaw = oc.suggested_safer_actions
                          const saferList = Array.isArray(saferRaw) ? saferRaw : []
                          const saferAbsent = !Array.isArray(saferRaw) && saferRaw && (saferRaw as any).no_safer_action_known
                          const ackList = oc.override_requirements?.required_acknowledgements || []
                          const reasonCode = group.decision_contract!.reason_code
                          return (
                            <div className="px-4 py-3 text-xs border-b" style={{ borderColor: colors.border, background: '#fffbeb', color: '#78350f' }}>
                              <div className="flex items-start gap-2">
                                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[#92400e]" />
                                <div className="flex-1 space-y-2">
                                  {/* Reason code badge + summary */}
                                  <div>
                                    {reasonCode && (
                                      <span className="inline-block text-[9px] uppercase tracking-wider font-bold mr-2 px-1.5 py-0.5 rounded bg-[#92400e20] text-[#92400e]">
                                        {reasonCode.replace(/_/g, ' ')}
                                      </span>
                                    )}
                                    <span className="font-semibold text-[#92400e]">{oc.summary || group.block_reason_human}</span>
                                  </div>
                                  {/* What to check — actionable steps */}
                                  {checks.length > 0 && (
                                    <div>
                                      <div className="text-[10px] uppercase tracking-wider font-semibold mb-1 text-[#78350f]">What to check</div>
                                      <ul className="list-disc ml-4 space-y-1">
                                        {checks.map((c, ci) => (
                                          <li key={ci}>
                                            {c.check}
                                            {c.command_or_link && (
                                              <> · <a href={c.command_or_link} target="_blank" rel="noopener noreferrer" className="underline text-[#92400e]">link ↗</a></>
                                            )}
                                            {c.expected_result && (
                                              <span className="text-[#78350f] opacity-75"> — expect: {c.expected_result}</span>
                                            )}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {/* Safer alternatives */}
                                  {saferList.length > 0 && (
                                    <div>
                                      <div className="text-[10px] uppercase tracking-wider font-semibold mb-1 text-[#78350f]">Safer alternatives</div>
                                      <ul className="list-disc ml-4 space-y-1">
                                        {saferList.map((a, ai) => (
                                          <li key={ai}>
                                            <span className="font-semibold">{a.action}</span>
                                            {a.explanation && <span className="opacity-90"> — {a.explanation}</span>}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {saferAbsent && (
                                    <div className="text-[#78350f] italic">No safer action known — operator must acknowledge override.</div>
                                  )}
                                  {/* Override requirements */}
                                  {ackList.length > 0 && (
                                    <div className="text-[10px] text-[#78350f]">
                                      <span className="uppercase tracking-wider font-semibold">Override requires: </span>
                                      {ackList.map(a => a.replace(/_/g, ' ')).join(', ')}
                                    </div>
                                  )}
                                  {/* Escalation target — spec §8 explicit-absence sentinel */}
                                  {oc.escalation_target && (() => {
                                    const et = oc.escalation_target!
                                    const isUnknown = et.target_type === 'unknown_no_default_configured'
                                    return (
                                      <div className="text-[10px] text-[#78350f]">
                                        <span className="uppercase tracking-wider font-semibold">Escalate to: </span>
                                        {isUnknown ? (
                                          <span className="italic">no default escalation team configured — set one in onboarding to enable AUTO_APPLY mode</span>
                                        ) : (
                                          <>
                                            {et.display_name || et.target_type?.replace(/_/g, ' ')}
                                            {et.source && et.source !== 'unknown' ? <span className="opacity-75"> (via {et.source.replace(/_/g, ' ')})</span> : null}
                                          </>
                                        )}
                                      </div>
                                    )
                                  })()}
                                </div>
                              </div>
                            </div>
                          )
                        })() : isInferredOrTelemetryBlocked && group.block_reason_human ? (
                          <div className="px-4 py-2 text-xs border-b flex items-start gap-2" style={{ borderColor: colors.border, background: '#fffbeb', color: '#92400e' }}>
                            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                            <div>
                              <p>{group.block_reason_human}</p>
                              {group.block_reason_code === 'needs_telemetry' && group.telemetry_enablement_action && (
                                <p className="mt-1 text-[11px]" style={{ color: '#78350f' }}>
                                  <a
                                    href="https://docs.aws.amazon.com/awscloudtrail/latest/userguide/logging-data-events-with-cloudtrail.html"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline"
                                  >
                                    AWS docs: CloudTrail data events ↗
                                  </a>
                                  <span> · AWS CloudTrail data events pricing applies — varies by workload.</span>
                                </p>
                              )}
                            </div>
                          </div>
                        ) : null}
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
                              {/* Per-permission confidence score with 70/40 threshold colors. */}
                              {!isLocked && typeof perm.confidence_score === 'number' && (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${
                                    perm.confidence_score >= 70 ? 'bg-[#22c55e20] text-[#16a34a]' :
                                    perm.confidence_score >= 40 ? 'bg-[#f9731620] text-[#d97706]' :
                                    'bg-[#ef444420] text-[#dc2626]'
                                  }`}
                                  title={
                                    perm.confidence_score >= 70 ? 'Safe to remove (≥70 — auto-eligible)' :
                                    perm.confidence_score >= 40 ? 'Verify first (40-69 — needs override)' :
                                    'Investigate first (<40 — high risk)'
                                  }
                                >
                                  {perm.confidence_score}%
                                </span>
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
                      <p className="font-semibold text-[#ef4444]">{unusedCount} permissions to remove via managed policy detachment</p>
                      <p className="text-sm mt-1" style={{ color: "var(--foreground, #374151)" }}>
                        These permissions come from AWS managed policies attached to this role. Individual permission names are not expanded in the graph.
                        To remediate, enable <strong>"Detach managed policies"</strong> below — this will detach the managed policies and the role will only retain the {usedCount} used permission{usedCount !== 1 ? 's' : ''}.
                      </p>
                      <div className="mt-3 p-3 bg-white rounded-lg border" style={{ borderColor: "var(--border, #e5e7eb)" }}>
                        <p className="text-xs font-semibold" style={{ color: "var(--muted-foreground, #4b5563)" }}>Remediation approach:</p>
                        <ol className="text-xs mt-1 space-y-1 list-decimal list-inside" style={{ color: "var(--foreground, #374151)" }}>
                          <li>Create rollback snapshot (automatic)</li>
                          <li>Detach all AWS managed policies from the role</li>
                          <li>Create minimal inline policy with only the {usedCount} observed permission{usedCount !== 1 ? 's' : ''}</li>
                          <li>Attack surface reduced from {totalPermissions} → {usedCount} permissions ({totalPermissions > 0 ? Math.round(((totalPermissions - usedCount) / totalPermissions) * 100) : 0}% reduction)</li>
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

            {/* Confidence Factors — driven by backend confidence engine */}
            <div className="p-4 rounded-xl" style={{ background: "var(--background, #f8f9fa)" }}>
              <h3 className="font-bold mb-3" style={{ color: "var(--foreground, #111827)" }}>Confidence Factors:</h3>
              <div className="space-y-2">
                {gapData?.confidence_groups?.groups ? (
                  <>
                    {/* Per-group confidence from backend */}
                    {gapData.confidence_groups.groups.map((group, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-sm">
                          {group.confidence_score >= 70 ? (
                            <Check className="w-4 h-4 text-[#22c55e]" />
                          ) : group.confidence_score >= 40 ? (
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-[#ef4444]" />
                          )}
                          <span>{group.label} — {group.data_source_type === 'management_event' ? 'management event' : group.data_source_type === 'data_event' ? 'data event (not default)' : group.data_source_type === 'internal_service' ? 'internal service call' : 'partial logging'}</span>
                        </span>
                        <span className={`font-semibold ${
                          group.confidence_score >= 70 ? 'text-[#22c55e]' :
                          group.confidence_score >= 40 ? 'text-[#f97316]' :
                          'text-[#ef4444]'
                        }`}>
                          {group.confidence_score}%
                        </span>
                      </div>
                    ))}
                    {/* Observation window */}
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-[#22c55e]" />
                        <span>{observationDays}-day observation window</span>
                      </span>
                      <span className="font-semibold text-[#22c55e]">
                        {cloudtrailEvents.toLocaleString()} events
                      </span>
                    </div>
                    {/* Dependencies */}
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm">
                        {gapData?.dependency_context?.has_critical_dependencies ? (
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                        ) : (
                          <Check className="w-4 h-4 text-[#22c55e]" />
                        )}
                        <span>{gapData?.dependency_context?.has_critical_dependencies
                          ? 'Critical dependencies detected'
                          : 'No critical dependencies'}</span>
                      </span>
                    </div>
                    {/* Account data event status */}
                    {gapData.confidence_groups.account_signals && (
                      <div className="mt-2 pt-2 border-t text-xs" style={{ borderColor: "var(--border, #e5e7eb)" }}>
                        <span style={{ color: "var(--muted-foreground, #6b7280)" }}>
                          Account data events:
                          {' '}S3 {gapData.confidence_groups.account_signals.s3_data_events ? '✓ enabled' : '✗ not enabled'}
                          {' · '}Lambda {gapData.confidence_groups.account_signals.lambda_data_events ? '✓ enabled' : '✗ not enabled'}
                          {' · '}DynamoDB {gapData.confidence_groups.account_signals.dynamodb_data_events ? '✓ enabled' : '✗ not enabled'}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Fallback when no confidence groups from backend */}
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-[#22c55e]" />
                        <span>{observationDays} days of usage analysis</span>
                      </span>
                      <span className="font-semibold text-[#22c55e]">
                        {cloudtrailEvents.toLocaleString()} events
                      </span>
                    </div>
                  </>
                )}
              </div>
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
              <label className="flex items-center gap-2 cursor-pointer" title="Create a snapshot before making changes so you can rollback if needed">
                <input
                  type="checkbox"
                  checked={createSnapshot}
                  onChange={(e) => setCreateSnapshot(e.target.checked)}
                  disabled={applying}
                  className="rounded border-[var(--border,#d1d5db)] text-[#8b5cf6] focus:ring-[#8b5cf6]"
                />
                <span className="text-sm " style={{ color: "var(--muted-foreground, #6b7280)" }}>Create rollback checkpoint</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer" title="Detach AWS managed policies that contain unused permissions. Required for roles with only managed policies.">
                <input
                  type="checkbox"
                  checked={detachManagedPolicies}
                  onChange={(e) => setDetachManagedPolicies(e.target.checked)}
                  disabled={applying}
                  className="rounded border-[var(--border,#d1d5db)] text-orange-600 focus:ring-orange-500"
                />
                <span className="text-sm " style={{ color: "var(--muted-foreground, #6b7280)" }}>Detach managed policies</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer" title="Detach ALL AWS managed policies from this role, regardless of permission overlap. Use when Neo4j data doesn't match actual AWS policies.">
                <input
                  type="checkbox"
                  checked={detachAllManagedPolicies}
                  onChange={(e) => setDetachAllManagedPolicies(e.target.checked)}
                  disabled={applying || !detachManagedPolicies}
                  className="rounded border-[var(--border,#d1d5db)] text-[#ef4444] focus:ring-[#ef4444]"
                />
                <span className={`text-sm ${detachManagedPolicies ? 'text-[#ef4444] font-medium' : 'text-[var(--muted-foreground,#9ca3af)]'}`}>Detach ALL</span>
              </label>
              {(() => {
                const blocked = shouldBlockRemediation()
                const lowConfidence = safetyScore < 50
                const pipelineBlocked = verdictBucket === 'blocked'
                // Honest counts: report what the user actually selected. Non-auto
                // selections are now passed under force_override (see handleApplyFix)
                // instead of being silently dropped at submit.
                const autoRemediableSet = getAutoRemediablePermissions()
                const selectedTotalCount = selectedPermissionsToRemove.size
                const selectedAutoRemediableCount = Array.from(selectedPermissionsToRemove)
                  .filter(p => autoRemediableSet.has(p)).length
                const selectedOverrideCount = selectedTotalCount - selectedAutoRemediableCount

                if (blocked) {
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
                        disabled={applying || (selectedPermissionsToRemove.size === 0 && !detachManagedPolicies)}
                        className="px-5 py-2.5 bg-[#f59e0b] text-white rounded-lg font-bold hover:bg-[#d97706] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        title={`Acknowledge the safety hold and apply ${selectedPermissionsToRemove.size > 0 ? `${selectedPermissionsToRemove.size} permission removals` : 'the policy detach'}. The override is recorded in the audit log under your operator id. ${safetyContext?.block_reason || ''}`}
                      >
                        <CheckSquare className="w-4 h-4" />
                        Acknowledge &amp; Apply ({selectedPermissionsToRemove.size > 0 ? `${selectedPermissionsToRemove.size} perms` : 'detach policies'})
                      </button>
                    </div>
                  )
                } else if (lowConfidence) {
                  return (
                    <button
                      onClick={() => handleApplyFix(false)}
                      disabled={applying || (selectedPermissionsToRemove.size === 0 && !detachManagedPolicies)}
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
                      disabled={applying || (selectedPermissionsToRemove.size === 0 && !detachManagedPolicies)}
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
                        `APPLY FIX (detach managed policies)`
                      ) : (
                        'Select permissions or enable "Detach managed policies"'
                      )}
                    </button>
                  )
                }
              })()}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Main Permission Usage Analysis View
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* In-app override confirmation modal. PORTALED to document.body so
          it lives in its own stacking context — escapes the parent IAM
          modal's z-50 container, eliminating any chance that a sibling
          element (toast, tooltip, another portal) renders on top of it.
          Previously rendered in-tree as a child of the parent z-50
          container; multiple operators reported "Acknowledge & Apply
          does nothing" because the override modal opened correctly but
          was visually obscured / consumed clicks weirdly. Portal at
          document.body fixes both at once.

          Conditionally rendered (only when isOpen) instead of always-
          mounted-with-opacity. The portal wrap is essentially free; the
          opacity-toggle pattern was an SSR/hydration optimization that
          doesn't apply once we're portaling client-side anyway. Guard
          for `typeof document` so the portal call is a no-op during
          SSR. */}
      {typeof document !== 'undefined' && overrideModal.open && createPortal(
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
        aria-modal="true"
        role="dialog"
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
                  Cyntro paused this change because telemetry coverage is incomplete and {safetyContext?.consumer_count ?? 'multiple'} system{(safetyContext?.consumer_count ?? 0) === 1 ? '' : 's'} depend on this role. You can override and proceed -- the change runs immediately, with a rollback snapshot if you have it enabled. The override is recorded in the audit log.
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
                    I understand a rollback snapshot will{createSnapshot ? ' ' : ' NOT '}be created and I am responsible for verifying the change does not break dependent systems.
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
                      // Aggregate required acknowledgements from the
                      // selected groups (audit record names exactly which
                      // gates the operator implicitly confirmed).
                      const ackSet = new Set<string>()
                      const groups = gapData?.confidence_groups?.groups ?? []
                      const selectedSet = new Set(Array.from(selectedPermissionsToRemove))
                      for (const g of groups) {
                        const overlap = (g.permissions || []).some((p: any) => selectedSet.has(p.permission))
                        if (!overlap) continue
                        const acks = g.decision_contract?.operator_context?.override_requirements?.required_acknowledgements || []
                        for (const a of acks) ackSet.add(a)
                      }
                      const lineage = {
                        rationale: trimmed,
                        acknowledged: Array.from(ackSet),
                        rollback_plan_acknowledged: overrideModal.ackRollback,
                        overridden_by: 'operator',
                        overridden_at: new Date().toISOString(),
                      }
                      // Stay open and switch to the applying phase. The
                      // success / error phase is set by handleApplyFix
                      // via setOverrideModal at the end of the API
                      // call. skipAutoClose=true keeps the parent modal
                      // open so the override modal can render its own
                      // success state; the operator clicks "Done" on
                      // that surface to dismiss everything.
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
        </div>,
        document.body
      )}

      <div className="relative w-[720px] max-h-[88vh] rounded-lg shadow-[0_10px_40px_rgba(15,23,42,0.12)] overflow-hidden flex flex-col my-4" style={{ background: "var(--card, #ffffff)" }}>
        {/* Header */}
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--border, #e5e7eb)" }}>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#2D51DA" }}>Permission Usage</div>
            <div className="mt-0.5 text-sm font-semibold truncate" style={{ color: "var(--foreground, #111827)" }}>
              {roleName} <span className="font-normal" style={{ color: "var(--muted-foreground, #6b7280)" }}>· {identityType || 'IAMRole'}{systemName ? ` · ${systemName}` : ''}</span>
            </div>
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

        {provenance && (
          <div className="px-5 py-2 border-b" style={{ borderColor: "var(--border, #e5e7eb)" }}>
            <TrustEnvelopeBadge provenance={provenance} />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-3 p-4">
          {/* Recording Period — compact single-row chip strip */}
          <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--foreground, #111827)" }}>
              <Calendar className="w-3.5 h-3.5" style={{ color: "#2D51DA" }} />
              <span className="font-semibold">{observationDays}-day observation</span>
              <span className="text-slate-400">·</span>
              <span style={{ color: "var(--muted-foreground, #6b7280)" }}>{formatDate(startDate)} → {formatDate(endDate)}</span>
            </div>
            <span className="text-xs tabular-nums" style={{ color: "var(--muted-foreground, #6b7280)" }}>
              {cloudtrailEvents.toLocaleString()} API events
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

          {/* ── Pipeline Decision banner (Summary tab) ────────────────────
              The unified pipeline is the AUTHORITATIVE decision source.
              We render it above the Agent 5 panel so the verdict order
              matches the source-of-truth order. Agent 5 is rendered
              below as the *explanation* of this decision.
              Fail-closed: if simulate-fix returned no safety object, we
              don't show a green "Safe to apply" — we surface the
              fail-closed warning so the user can investigate why. */}
          {analysisTab === 'summary' && safetyLoading && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500 flex items-center">
              <Loader2 className="w-3.5 h-3.5 inline animate-spin mr-2" />
              Reading unified pipeline decision…
            </div>
          )}
          {analysisTab === 'summary' && !safetyLoading && !safetyContext && (
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
          {analysisTab === 'summary' && safetyContext && (() => {
            const d = safetyContext.decision_canonical ?? null
            const obs = safetyContext.observation_days
            const tel = safetyContext.telemetry_coverage
            const consumers = safetyContext.consumer_count ?? 0
            const reasons = safetyContext.unsafe_reasons ?? []
            const completeness = safetyContext.completeness ?? 'unknown'

            type Tone = 'block' | 'review' | 'approve' | 'auto'
            const tone: Tone =
              d === 'BLOCK' || d === 'EXCLUDE' ? 'block'
              : d === 'MANUAL_REVIEW' ? 'review'
              : d === 'REQUIRE_APPROVAL' || d === 'CANARY_FIRST' ? 'approve'
              : d === 'AUTO_EXECUTE' ? 'auto'
              : 'review'

            // Visual hierarchy:
            //   block   -> amber safety-hold (NOT error red; this is a
            //              deliberate deferral, the product working as
            //              designed). Red is reserved for truly
            //              destructive verdicts (service-role DO NOT
            //              APPLY).
            //   review  -> orange (one tier softer than block)
            //   approve -> warm amber (lighter)
            //   auto    -> green
            const styles: Record<Tone, { border: string; bg: string; title: string; sub: string; chip: string; chipText: string }> = {
              block:   { border: '#fcd34d', bg: '#fffbeb', title: '#92400e', sub: '#78350f', chip: '#f59e0b', chipText: '#ffffff' },
              review:  { border: '#fdba74', bg: '#fff7ed', title: '#9a3412', sub: '#7c2d12', chip: '#ea580c', chipText: '#ffffff' },
              approve: { border: '#fcd34d', bg: '#fffbeb', title: '#92400e', sub: '#78350f', chip: '#d97706', chipText: '#ffffff' },
              auto:    { border: '#86efac', bg: '#f0fdf4', title: '#166534', sub: '#14532d', chip: '#16a34a', chipText: '#ffffff' },
            }
            const s = styles[tone]
            const headline =
              tone === 'block'   ? 'Safety hold — review required'
              : tone === 'review' ? 'Manual review'
              : tone === 'approve' ? 'Approval required'
              : 'Pipeline approved'
            const Icon = tone === 'auto' ? CheckCircle : tone === 'block' ? Shield : AlertTriangle

            return (
              <div className="rounded-lg border-2 p-4" style={{ borderColor: s.border, background: s.bg }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Icon className="w-5 h-5" style={{ color: s.chip }} />
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: s.title }}>
                      Pipeline Decision
                    </span>
                  </div>
                  <span
                    className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase"
                    style={{ background: s.chip, color: s.chipText }}
                  >
                    {d ?? 'UNKNOWN'}
                  </span>
                </div>
                <p className="mt-2 font-bold text-base" style={{ color: s.title }}>{headline}</p>
                {reasons[0] && (
                  <p className="mt-1 text-sm" style={{ color: s.sub }}>{reasons[0]}</p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs" style={{ color: s.sub }}>
                  {typeof obs === 'number' && (
                    <div>
                      <span className="opacity-70">Observation:</span>{' '}
                      <span className="font-semibold">{obs} days</span>
                      {tone === 'block' && obs < 21 && (
                        <span className="opacity-70"> (≥ 21 needed)</span>
                      )}
                    </div>
                  )}
                  {typeof tel === 'number' && (
                    <div>
                      <span className="opacity-70">Telemetry:</span>{' '}
                      <span className="font-semibold">{Math.round(tel * 100)}%</span>
                      <span className="opacity-70"> ({completeness})</span>
                    </div>
                  )}
                  {consumers > 0 && (
                    <div className="col-span-2">
                      <span className="opacity-70">Consumers:</span>{' '}
                      <span className="font-semibold">{consumers}</span>
                      <span className="opacity-70"> active — other systems depend on this role</span>
                    </div>
                  )}
                </div>
                {reasons.length > 1 && (
                  <ul className="mt-2 text-xs list-disc list-inside space-y-0.5" style={{ color: s.sub }}>
                    {reasons.slice(1).map((r, i) => <li key={`pdr-${i}`}>{r}</li>)}
                  </ul>
                )}
              </div>
            )
          })()}

          {/* Agent 5 · Confidence Scorer — explainer beneath the pipeline
              verdict. Once the confidence/check proxy forwards
              pipeline_decision (Layer-2-aware), score.routing here is the
              SUBORDINATED routing, so the pill in the panel header reads
              "Blocked" / "Needs approval" rather than "Safe to apply" on
              roles the pipeline blocked. */}
          {analysisTab === 'summary' && confidenceLoading && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500 flex items-center">
              <Loader2 className="w-3.5 h-3.5 inline animate-spin mr-2" />
              Agent 5 scoring remediation safety…
            </div>
          )}
          {analysisTab === 'summary' && confidenceScore && (
            <ConfidenceExplanationPanel score={confidenceScore} />
          )}

          {/* Service Role Warning - Based on backend trust policy analysis */}
          {analysisTab === 'summary' && (() => {
            if (!serviceAnalysis) return null

            // Severity-based styling
            const styles = {
              critical: {
                border: 'border-red-500',
                bg: 'bg-[#ef444410]',
                icon: 'text-[#ef4444]',
                title: 'text-red-900',
                text: 'text-[#ef4444]',
                badge: 'bg-red-600 text-white',
                badgeText: 'DO NOT MODIFY'
              },
              high: {
                border: 'border-orange-500',
                bg: 'bg-[#f9731610]',
                icon: 'text-orange-600',
                title: 'text-orange-900',
                text: 'text-[#f97316]',
                badge: 'bg-[#f9731610]0 text-white',
                badgeText: 'VERIFY FIRST'
              },
              medium: {
                border: 'border-amber-500',
                bg: 'bg-[#f9731610]',
                icon: 'text-[#f97316]',
                title: 'text-amber-900',
                text: 'text-[#f97316]',
                badge: 'bg-[#f9731610]0 text-white',
                badgeText: 'INVESTIGATION NEEDED'
              }
            }

            const severity = serviceAnalysis.severity || 'medium'
            const style = styles[severity] || styles.medium

            return (
              <div className={`rounded-md border ${style.border} ${style.bg} p-3`}>
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className={`w-4 h-4 ${style.icon} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    {/* Title with badge and service principal */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className={`font-semibold ${style.title} text-sm`}>
                          {serviceAnalysis.title}
                        </h4>
                        {backendAnalysis?.service_principals && backendAnalysis.service_principals.length > 0 && (
                          <p className="text-[11px] text-[var(--muted-foreground,#6b7280)] mt-0.5 font-mono truncate">
                            Trust: {backendAnalysis.service_principals.join(', ')}
                          </p>
                        )}
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
          {analysisTab === 'summary' && totalPermissions === 0 && (
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
          {analysisTab === 'summary' && totalPermissions > 0 && (() => {
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
                        <span className="font-semibold tabular-nums">{unusedCount}</span> of <span className="font-semibold tabular-nums">{totalPermissions}</span> never used · <span className="font-semibold tabular-nums" style={{ color: '#16a34a' }}>{usedCount}</span> needed
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
                        <span className="tabular-nums">{unusedCount}</span> to remove ({unusedPercent}%)
                      </span>
                      <span className="ml-auto text-slate-400 tabular-nums">{totalPermissions} total</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Least Privilege Finding - informational, not an error.
              Renders whenever unusedCount > 0 on the summary tab. The
              over-privileged-role IS a real finding, but it isn't a
              system error -- amber/finding-tone (not error red) so the
              modal stops looking like five different things failed
              when the customer is actually just seeing one finding plus
              one safety hold. The risk badge stays semantic (CRITICAL
              = red badge inside the amber card; HIGH = orange; etc.). */}
          {analysisTab === 'summary' && unusedCount > 0 && totalPermissions > 0 && (
            <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-7 h-7 flex-shrink-0 mt-0.5" style={{ color: "#d97706" }} />
                <div>
                  <h3 className="text-xl font-bold" style={{ color: "#b45309" }}>Least-privilege finding</h3>
                  <p className="mt-2" style={{ color: "var(--foreground, #111827)" }}>
                    This identity has <strong>{unusedPercent}% more permissions</strong> than required based on {observationDays} days of actual usage.
                    <strong> {unusedCount} permissions</strong> have never been used and could be removed.
                  </p>
                  <div className="flex items-center gap-3 mt-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      overallRisk === 'CRITICAL' ? 'bg-[#ef444420] text-[#ef4444]' :
                      overallRisk === 'HIGH' ? 'bg-[#f9731620] text-[#f97316]' :
                      overallRisk === 'MEDIUM' ? 'bg-[#eab30820] text-[#eab308]' :
                      'bg-gray-100 text-[var(--foreground,#374151)]'
                    }`}>
                      {overallRisk} Risk
                    </span>
                    <span style={{ color: "var(--muted-foreground, #6b7280)" }}>
                      Attack surface reduced by {unusedPercent}% after remediation
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Permission Usage Breakdown - Only show if not remediated */}
          {analysisTab === 'permissions' && totalPermissions > 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg border border-[var(--border,#e5e7eb)] bg-white p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground,#6b7280)]">Selected</div>
                <div className="mt-2 text-3xl font-bold text-[var(--foreground,#111827)]">{selectedPermissionsToRemove.size}</div>
                <div className="mt-1 text-sm text-[var(--muted-foreground,#6b7280)]">permissions queued for removal</div>
              </div>
              <div className="rounded-lg border border-[#fecaca] bg-[#fff1f2] p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-[#b91c1c]">Removable</div>
                <div className="mt-2 text-3xl font-bold text-[#ef4444]">{Math.max(0, removableCount)}</div>
                <div className="mt-1 text-sm text-[#b91c1c]">permissions with direct removal path</div>
              </div>
              <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-[#b45309]">Needs Review</div>
                <div className="mt-2 text-3xl font-bold text-[#d97706]">{warnPerms.length + protectedPerms.length}</div>
                <div className="mt-1 text-sm text-[#92400e]">warned or protected permissions</div>
              </div>
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

            {/* Never Used Permissions — split into removable vs warn vs protected */}
            {(
                <>
                  {/* Removable permissions */}
                  <div className="border-2 border-[#ef444440] bg-[#ef444410] rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-[#ef4444]" />
                        <span className="font-semibold text-[#ef4444]">Never Used Permissions ({removableCount})</span>
                      </div>
                      <span className="px-3 py-1 bg-[#ef444420] text-[#ef4444] border border-[#ef444440] rounded-lg text-sm font-medium">
                        Remove these
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
                    ) : null}
                  </div>

                  {/* Caution permissions (logging, SLR, ECS) — selectable but warned */}
                  {warnPerms.length > 0 && (
                    <div className="border-2 border-[#fde68a] bg-[#fefce8] rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-[#eab308]" />
                          <span className="font-semibold text-[#eab308]">Caution — Review Before Removing ({warnPerms.length})</span>
                        </div>
                        <span className="px-3 py-1 bg-[#eab30815] text-[#eab308] border border-[#fde68a] rounded-lg text-sm font-medium">
                          May break services
                        </span>
                      </div>
                      <p className="text-xs mt-2 text-[#a16207]">
                        These permissions are partially logged or called by AWS services internally. They may appear unused but could be actively required. Review each before removing.
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                        {warnPerms.map((perm, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <AlertTriangle className="w-3 h-3 flex-shrink-0 text-[#eab308]" />
                            <span className="font-mono text-[var(--foreground,#374151)] truncate">{perm.permission}</span>
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
                        Includes SSM Agent internals, iam:PassRole, KMS encryption, and STS assume-role permissions. These are invisible or excluded from CloudTrail and critical to AWS infrastructure.
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                        {protectedPerms.map((perm, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm opacity-60">
                            <Lock className="w-3 h-3 flex-shrink-0 text-[#6b7280]" />
                            <span className="font-mono text-[#6b7280] truncate">{perm.permission}</span>
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
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="rounded-lg border border-[var(--border,#e5e7eb)] bg-white p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground,#6b7280)]">Safety Score</div>
                  <div className="mt-2 text-3xl font-bold text-[var(--foreground,#111827)]">{safetyScore}%</div>
                  <div className="mt-1 text-sm text-[var(--muted-foreground,#6b7280)]">current remediation confidence</div>
                </div>
                <div className="rounded-lg border border-[var(--border,#e5e7eb)] bg-white p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground,#6b7280)]">Observation</div>
                  <div className="mt-2 text-3xl font-bold text-[var(--foreground,#111827)]">{observationDays}</div>
                  <div className="mt-1 text-sm text-[var(--muted-foreground,#6b7280)]">days of behavior in scope</div>
                </div>
                <div className="rounded-lg border border-[var(--border,#e5e7eb)] bg-white p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground,#6b7280)]">CloudTrail</div>
                  <div className="mt-2 text-3xl font-bold text-[var(--foreground,#111827)]">{cloudtrailEvents.toLocaleString()}</div>
                  <div className="mt-1 text-sm text-[var(--muted-foreground,#6b7280)]">events analyzed for this role</div>
                </div>
                <div className="rounded-lg border border-[var(--border,#e5e7eb)] bg-white p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground,#6b7280)]">Dependencies</div>
                  <div className="mt-2 text-3xl font-bold text-[var(--foreground,#111827)]">{dependencyContext?.dependencies?.length || 0}</div>
                  <div className="mt-1 text-sm text-[var(--muted-foreground,#6b7280)]">
                    {dependencyContext?.has_critical_dependencies ? 'critical edges detected' : 'linked resources in view'}
                  </div>
                </div>
              </div>

              {confidenceGroups && (
                <div className="rounded-lg border border-[var(--border,#e5e7eb)] bg-white p-5">
                  <h3 className="text-lg font-bold text-[var(--foreground,#111827)]">Confidence Breakdown</h3>
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="rounded-lg bg-[#f0fdf4] border border-[#86efac] p-3 text-sm">
                      <div className="font-semibold text-[#166534]">{confidenceGroups.summary.safe_to_remove}</div>
                      <div className="text-[#166534]">safe to remove</div>
                    </div>
                    <div className="rounded-lg bg-[#fff7ed] border border-[#fdba74] p-3 text-sm">
                      <div className="font-semibold text-[#9a3412]">{confidenceGroups.summary.verify_first}</div>
                      <div className="text-[#9a3412]">verify first</div>
                    </div>
                    <div className="rounded-lg bg-[#fff1f2] border border-[#fecaca] p-3 text-sm">
                      <div className="font-semibold text-[#b91c1c]">{confidenceGroups.summary.investigate_first}</div>
                      <div className="text-[#b91c1c]">investigate first</div>
                    </div>
                    <div className="rounded-lg bg-[#fefce8] border border-[#fde68a] p-3 text-sm">
                      <div className="font-semibold text-[#a16207]">{confidenceGroups.summary.warn_before_removing ?? 0}</div>
                      <div className="text-[#a16207]">warn before removing</div>
                    </div>
                    <div className="rounded-lg bg-[#eff6ff] border border-[#bfdbfe] p-3 text-sm">
                      <div className="font-semibold text-[#1d4ed8]">{confidenceGroups.summary.reserved ?? 0}</div>
                      <div className="text-[#1d4ed8]">reserved</div>
                    </div>
                    <div className="rounded-lg bg-[#f9fafb] border border-[#d1d5db] p-3 text-sm">
                      <div className="font-semibold text-[#4b5563]">{confidenceGroups.summary.protected ?? 0}</div>
                      <div className="text-[#4b5563]">protected</div>
                    </div>
                  </div>
                  {confidenceGroups.account_signals && (
                    <div className="mt-4 text-sm text-[var(--muted-foreground,#6b7280)]">
                      Account data events:
                      {' '}S3 {confidenceGroups.account_signals.s3_data_events ? 'enabled' : 'missing'}
                      {' • '}Lambda {confidenceGroups.account_signals.lambda_data_events ? 'enabled' : 'missing'}
                      {' • '}DynamoDB {confidenceGroups.account_signals.dynamodb_data_events ? 'enabled' : 'missing'}
                    </div>
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
                          <div className="text-sm text-[var(--muted-foreground,#6b7280)]">No linked resources were returned for this role.</div>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-[var(--muted-foreground,#6b7280)]">
                      {dependencyContext?.status === 'neo4j_unavailable'
                        ? 'Dependency graph is currently unavailable.'
                        : dependencyContext?.status === 'not_found'
                          ? 'This role was not found in the dependency graph.'
                          : dependencyContext?.error || 'Dependency context is not available yet.'}
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
              // Pipeline routed this to "review required" for reasons
              // OTHER than the no-usage branch above -- partial
              // telemetry, short observation window, active consumers.
              // Visual: amber safety-hold (matches the top verdict
              // block + Summary tab banner). Red is reserved for
              // truly destructive verdicts (service-role DO NOT APPLY).
              const reasons = safetyContext?.unsafe_reasons ?? []
              return (
                <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] p-5">
                  <h3 className="font-bold text-[#b45309]">Safety hold — review required</h3>
                  <p className="text-[#92400e] mt-1">
                    {reasons[0] ?? "Cyntro paused this change. Review the evidence above before proceeding."}
                  </p>
                  {reasons.length > 1 && (
                    <ul className="mt-2 text-sm text-[#78350f] list-disc list-inside space-y-1">
                      {reasons.slice(1).map((reason, i) => (
                        <li key={`rec-${i}`}>{reason}</li>
                      ))}
                    </ul>
                  )}
                  {typeof safetyContext?.consumer_count === 'number' && safetyContext.consumer_count > 0 && (
                    <p className="text-xs text-[#92400e] mt-3">
                      Note: {safetyContext.consumer_count} consumer{safetyContext.consumer_count === 1 ? '' : 's'}{' '}
                      currently depend on this role — verify impact before touching permissions.
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-3 text-[#b45309]">
                    <Shield className="w-5 h-5" />
                    <span className="font-medium">Pipeline decision: review required — auto-remediation paused</span>
                  </div>
                </div>
              )
            } else {
              return (
                <div className="rounded-lg border border-[var(--border,#e5e7eb)] bg-white p-5">
                  <h3 className="font-bold" style={{ color: "var(--foreground, #111827)" }}>Recommended Action</h3>
                  <p className="text-[var(--muted-foreground,#4b5563)] mt-1">
                    Remove {unusedCount} unused permissions to achieve least privilege compliance.
                    This will reduce the attack surface by {unusedPercent}% while maintaining all current functionality.
                  </p>
                  <div className="flex items-center gap-2 mt-3 text-[#22c55e]">
                    <Shield className="w-5 h-5" />
                    <span className="font-medium">High confidence remediation - No service disruption expected</span>
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
          {!gapData?.remediated_at && <button
            onClick={async () => {
              setSimulating(true)
              try {
                const response = await fetch('/api/proxy/least-privilege/simulate-fix', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    resource_type: 'IAMRole',
                    resource_id: roleName,
                    system_name: systemName
                  })
                })

                const result = await response.json()

                if (!response.ok) {
                  throw new Error(result.error || result.detail || `Simulation failed: ${response.status}`)
                }

                const decision = result.safety?.decision
                // Match the modal's verdict labels exactly so the toast
                // and the verdict block tell the same story. Customer
                // was reading "Blocked" in the toast and "Safety hold"
                // in the modal and asking which is it.
                const decisionLabel =
                  decision === 'auto_eligible' ? 'Auto-eligible' :
                  decision === 'blocked'       ? 'Safety hold' :
                  'Approval required'
                const rollback = result.safety?.rollback_available ? 'available' : 'unavailable'
                // Use the SAME counts the verdict block above shows
                // (gapData-derived). The simulate-fix response carries
                // its own removed/kept tallies but they're computed
                // against a different filter and produce a different
                // number for the same role -- which makes the customer
                // ask "wait, is it 18 or 25?". Pin the toast to the
                // modal's authoritative counts so they always match.
                toast({
                  title: `Simulation complete · ${decisionLabel}`,
                  description: `Would remove ${unusedCount} of ${totalPermissions} permissions (${unusedPercent}% unused). Rollback: ${rollback}.`,
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
  )
}
