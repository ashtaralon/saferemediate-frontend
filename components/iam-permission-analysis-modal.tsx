"use client"

import { useState, useEffect } from "react"
import { 
  X, Calendar, CheckCircle, AlertTriangle, Shield, Check, 
  CheckSquare, Loader2, RefreshCw, XCircle, Activity
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface PermissionAnalysis {
  permission: string
  status: "USED" | "UNUSED"
  risk_level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  recommendation: string
  usage_count: number
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
  dependency_context?: DependencyContext
}

interface IAMPermissionAnalysisModalProps {
  isOpen: boolean
  onClose: () => void
  roleName: string
  systemName: string
  onApplyFix?: (data: any) => void
  onSuccess?: () => void
  onRemediationSuccess?: (roleName: string) => void
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
  onApplyFix,
  onSuccess,
  onRemediationSuccess
}: IAMPermissionAnalysisModalProps) {
  console.log('[IAMPermissionAnalysisModal] RENDER - isOpen:', isOpen, 'roleName:', roleName)
  const { toast } = useToast()
  const [gapData, setGapData] = useState<GapAnalysisData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSimulation, setShowSimulation] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [applying, setApplying] = useState(false)
  const [createSnapshot, setCreateSnapshot] = useState(true)
  const [detachManagedPolicies, setDetachManagedPolicies] = useState(true)
  const [detachAllManagedPolicies, setDetachAllManagedPolicies] = useState(false)  // Detach ALL regardless of overlap
  const [selectedPermissionsToRemove, setSelectedPermissionsToRemove] = useState<Set<string>>(new Set())

  // Fetch gap analysis data when modal opens
  useEffect(() => {
    if (isOpen && roleName) {
      fetchGapAnalysis()
    }
  }, [isOpen, roleName])

  const fetchGapAnalysis = async (forceRefresh = false) => {
    setLoading(true)
    setError(null)
    try {
      console.log('[IAM-Modal] Fetching gap analysis for:', roleName, forceRefresh ? '(force refresh)' : '')
      const refreshParam = forceRefresh ? '&refresh=true' : ''
      const response = await fetch(`/api/proxy/iam-roles/${encodeURIComponent(roleName)}/gap-analysis?days=90${refreshParam}`)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const rawData = await response.json()
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
      
      // CRITICAL FIX: Derive counts from actual list lengths to ensure UI consistency
      // The backend may return counts that don't match the lists (e.g., used_count is intersection
      // of allowed & observed, but used_actions_list contains all observed actions)
      const actualUsedPerms = Array.isArray(usedPerms) ? usedPerms : []
      const actualUnusedPerms = Array.isArray(unusedPerms) ? unusedPerms : []

      // Use list lengths as the source of truth for counts displayed in UI
      const derivedUsedCount = actualUsedPerms.length
      const derivedUnusedCount = actualUnusedPerms.length
      const derivedTotalCount = derivedUsedCount + derivedUnusedCount

      // Calculate LP score based on actual list data if not provided
      const derivedLpScore = rawData.summary?.lp_score ?? rawData.lp_score ??
        (derivedTotalCount > 0 ? Math.round((derivedUsedCount / derivedTotalCount) * 100) : 0)

      const mappedData: GapAnalysisData = {
        role_name: rawData.role_name || roleName,
        role_arn: rawData.role_arn,
        observation_days: rawData.observation_days || 90,
        summary: {
          // Use derived counts from actual lists to ensure consistency with displayed data
          total_permissions: derivedTotalCount > 0 ? derivedTotalCount : allowedCount,
          used_count: derivedUsedCount > 0 ? derivedUsedCount : usedCount,
          unused_count: derivedUnusedCount > 0 ? derivedUnusedCount : unusedCount,
          lp_score: derivedLpScore,
          overall_risk: rawData.summary?.overall_risk ?? rawData.overall_risk ?? 'MEDIUM',
          cloudtrail_events: rawData.summary?.cloudtrail_events ?? rawData.event_count ?? rawData.total_events ?? 0,
          high_risk_unused_count: rawData.summary?.high_risk_unused_count ?? rawData.high_risk_unused?.length ?? 0
        },
        // Build permissions_analysis from used_permissions and unused_permissions arrays
        permissions_analysis: [
          ...actualUsedPerms.map((p: string) => ({
            permission: p,
            status: 'USED' as const,
            risk_level: 'LOW' as const,
            recommendation: 'Keep this permission',
            usage_count: 1
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
        dependency_context: rawData.dependency_context
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
      // Initialize all unused permissions as selected by default
      const unusedPermsSet = new Set(mappedData.unused_permissions)
      setSelectedPermissionsToRemove(unusedPermsSet)
    } catch (err: any) {
      console.error('[IAM-Modal] Error:', err)
      setError(err.message || 'Failed to fetch gap analysis')
    } finally {
      setLoading(false)
    }
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
      setSelectedPermissionsToRemove(new Set(gapData.unused_permissions))
    }
  }

  const deselectAllPermissions = () => {
    setSelectedPermissionsToRemove(new Set())
  }

  const handleClose = () => {
    setShowSimulation(false)
    setGapData(null)
    setError(null)
    onClose()
  }

  const handleSimulate = async () => {
    alert('handleSimulate function called!')
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

  const handleApplyFix = async () => {
    if (!gapData) return

    setApplying(true)
    try {
      // Get the list of permissions selected for removal
      const permissionsToRemove = Array.from(selectedPermissionsToRemove)

      console.log('[IAM-Modal] Starting DIRECT MODIFY remediation for:', roleName)
      console.log('[IAM-Modal] Permissions to remove:', permissionsToRemove.length)
      console.log('[IAM-Modal] Create snapshot:', createSnapshot)
      console.log('[IAM-Modal] Detach managed policies:', detachManagedPolicies)
      console.log('[IAM-Modal] Detach ALL managed policies:', detachAllManagedPolicies)

      // Call the real remediation API (not dry run)
      // This will DIRECTLY MODIFY the IAM role in AWS:
      // 1. Create snapshot before changes (if createSnapshot=true)
      // 2. Modify inline policies to remove unused permissions
      // 3. Detach managed policies (if detachManagedPolicies=true)
      // 4. Detach ALL managed policies regardless of overlap (if detachAllManagedPolicies=true)
      const response = await fetch('/api/proxy/cyntro/remediate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_name: roleName,
          dry_run: false,  // Actually apply the changes
          create_snapshot: createSnapshot,
          detach_managed_policies: detachManagedPolicies,  // CRITICAL for managed policies
          detach_all_managed_policies: detachAllManagedPolicies,  // Detach ALL regardless of permission overlap
          permissions_to_remove: permissionsToRemove  // Only remove selected permissions
        })
      })

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
          await fetch(`/api/proxy/iam-roles/${encodeURIComponent(roleName)}/gap-analysis?days=90&force_refresh=true`)
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

        // Close modal
        handleClose()
      } else {
        // If not success, show appropriate error
        const errorMsg = result.error || result.message || 'Unknown error'
        throw new Error(`Remediation failed: ${errorMsg}`)
      }
    } catch (err: any) {
      console.error('[IAM-Modal] Apply fix error:', err)
      toast({
        title: "❌ Remediation Failed",
        description: err.message || 'Failed to apply remediation',
        variant: "destructive"
      })
    } finally {
      setApplying(false)
    }
  }

  if (!isOpen) return null

  // Calculate derived values
  const totalPermissions = gapData?.summary?.total_permissions ?? 0
  const usedCount = gapData?.summary?.used_count ?? 0
  const unusedCount = gapData?.summary?.unused_count ?? 0
  const lpScore = gapData?.summary?.lp_score ?? 0
  const observationDays = gapData?.observation_days ?? 90
  const overallRisk = gapData?.summary?.overall_risk ?? 'UNKNOWN'
  const cloudtrailEvents = gapData?.summary?.cloudtrail_events ?? 0
  
  const usedPercent = totalPermissions > 0 ? Math.round((usedCount / totalPermissions) * 100) : 0
  const unusedPercent = totalPermissions > 0 ? Math.round((unusedCount / totalPermissions) * 100) : 0
  
  const usedPermissions = (gapData?.permissions_analysis ?? []).filter(p => p.status === 'USED')
  const unusedPermissions = (gapData?.permissions_analysis ?? []).filter(p => p.status === 'UNUSED')
  
  // Calculate dates
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - observationDays)
  const formatDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  // Safety score calculation
  const calculateSafetyScore = () => {
    if (!gapData) return 95
    let score = 95

    // Check if this is a known service role from backend analysis
    const backendAnalysis = (gapData as any)?.service_role_analysis as BackendServiceRoleAnalysis | undefined
    const isKnownServiceRole = backendAnalysis?.is_service_role && backendAnalysis?.analysis?.cloudtrail_visible === false

    // CRITICAL: If NO CloudTrail events AND unused permissions exist, we have NO evidence
    // This is NOT safe - we don't know if the role is unused or just not logged
    if (cloudtrailEvents === 0 && unusedCount > 0) {
      if (isKnownServiceRole) {
        // Known AWS service role - severely reduce confidence
        score = 15 // Very low - this is a service role that won't log to CloudTrail
      } else {
        // Unknown role with no activity - needs investigation
        score = 35 // Low confidence - could be unused OR service role
      }
    } else {
      // We have CloudTrail data - base confidence on that
      // Reduce score if there are high-risk unused permissions
      const highRiskCount = gapData.high_risk_unused?.length ?? 0
      score -= highRiskCount * 2
      // Reduce score if low CloudTrail events (but not zero)
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

  const safetyScore = calculateSafetyScore()

  // Loading state
  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
        <div className="relative w-[600px] rounded-2xl shadow-2xl p-8 text-center" style={{ background: "var(--card, #ffffff)" }}>
          <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin" style={{ color: "#8b5cf6" }} />
          <h2 className="text-xl font-bold mb-2" style={{ color: "var(--foreground, #111827)" }}>Analyzing Permissions</h2>
          <p style={{ color: "var(--muted-foreground, #6b7280)" }}>Analyzing usage data for <span className="font-bold" style={{ color: "var(--foreground, #111827)" }}>{roleName}</span>...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
        <div className="relative w-[600px] rounded-2xl shadow-2xl p-8 text-center" style={{ background: "var(--card, #ffffff)" }}>
          <XCircle className="w-12 h-12 mx-auto mb-4" style={{ color: "#ef4444" }} />
          <h2 className="text-xl font-bold mb-2" style={{ color: "var(--foreground, #111827)" }}>Failed to Load Data</h2>
          <p className="mb-4" style={{ color: "var(--muted-foreground, #6b7280)" }}>{error}</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={fetchGapAnalysis}
              className="px-4 py-2 text-white rounded-lg font-medium hover:opacity-90"
              style={{ background: "#8b5cf6" }}
            >
              <RefreshCw className="w-4 h-4 inline mr-2" />
              Retry
            </button>
            <button
              onClick={handleClose}
              className="px-4 py-2 border border-[var(--border,#d1d5db)] text-[var(--foreground,#374151)] rounded-lg hover:bg-gray-50"
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative w-[700px] rounded-2xl shadow-2xl p-8" style={{ background: "var(--card, #ffffff)" }}>
          <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--foreground, #111827)" }}>Simulating Permission Removal</h2>
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
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
              } else if (noCloudTrailData) {
                // WARNING: Insufficient data - Investigation needed
                return (
                  <div className="p-6 bg-white border-2 border-[#f9731680] rounded-2xl text-center">
                    <div className="flex items-center justify-center gap-3">
                      <AlertTriangle className="w-10 h-10 text-[#f97316]" />
                      <span className="text-5xl font-bold text-[#f97316]">{safetyScore}%</span>
                      <span className="text-2xl font-bold text-[#f97316]">LOW CONFIDENCE</span>
                    </div>
                    <p className="text-[#f97316] mt-2 font-semibold">
                      Insufficient usage data collected. Cannot verify if permissions are truly unused.
                    </p>
                    <p className="text-[#f97316] text-sm mt-1">
                      This role may be used by an internal AWS service, or used infrequently outside the observation period.
                    </p>
                  </div>
                )
              } else {
                // SAFE: We have sufficient evidence
                return (
                  <div className="p-6 bg-white border-2 border-[#22c55e40] rounded-2xl text-center">
                    <div className="flex items-center justify-center gap-3">
                      <CheckSquare className="w-10 h-10 text-[#22c55e]" />
                      <span className="text-5xl font-bold text-[#22c55e]">{safetyScore}%</span>
                      <span className="text-2xl font-bold text-[#22c55e]">SAFE TO APPLY</span>
                    </div>
                    <p className="text-[#22c55e] mt-2">
                      {cloudtrailEvents.toLocaleString()} API events analyzed - No production services will be affected
                    </p>
                  </div>
                )
              }
            })()}

            {/* What Will Change */}
            <div>
              <h3 className="font-bold text-lg  mb-3" style={{ color: "var(--foreground, #111827)" }}>What Will Change:</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "var(--background, #f8f9fa)" }}>
                  <Check className="w-5 h-5 text-[#22c55e] flex-shrink-0" />
                  <span>Remove <strong>{selectedPermissionsToRemove.size}</strong> selected permissions from {roleName}</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "var(--background, #f8f9fa)" }}>
                  <Check className="w-5 h-5 text-[#22c55e] flex-shrink-0" />
                  <span>Reduce attack surface by {totalPermissions > 0 ? Math.round((selectedPermissionsToRemove.size / totalPermissions) * 100) : 0}%</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "var(--background, #f8f9fa)" }}>
                  <Check className="w-5 h-5 text-[#22c55e] flex-shrink-0" />
                  <span>Improve LP score from {lpScore}% to {(() => {
                    // LP score = (used / total) * 100
                    // After removing unused permissions: newTotal = total - removed, used stays same
                    const newTotal = totalPermissions - selectedPermissionsToRemove.size
                    return newTotal > 0 ? Math.round((usedCount / newTotal) * 100) : 100
                  })()}%</span>
                </div>
              </div>
            </div>

            {/* Permissions to Remove - With Selection */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-lg" style={{ color: "var(--foreground, #111827)" }}>
                  Permissions to Remove ({selectedPermissionsToRemove.size} of {unusedCount} selected)
                </h3>
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
              </div>
              <div className="p-4 bg-[#ef444410] border border-[#ef444440] rounded-xl max-h-64 overflow-y-auto">
                <div className="space-y-2">
                  {unusedPermissions.map((perm, i) => (
                    <label
                      key={i}
                      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                        selectedPermissionsToRemove.has(perm.permission)
                          ? 'bg-[#ef444420] border border-[#ef444440]'
                          : 'bg-white border border-[var(--border,#e5e7eb)] hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPermissionsToRemove.has(perm.permission)}
                        onChange={() => togglePermissionSelection(perm.permission)}
                        className="w-4 h-4 text-[#ef4444] rounded border-[var(--border,#d1d5db)] focus:ring-[#ef4444]"
                      />
                      <span className="font-mono text-sm text-[var(--foreground,#374151)] flex-1 truncate">{perm.permission}</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                        perm.risk_level === 'CRITICAL' ? 'bg-[#ef444420] text-[#ef4444]' :
                        perm.risk_level === 'HIGH' ? 'bg-[#f9731620] text-[#f97316]' :
                        'bg-gray-100 text-[var(--muted-foreground,#4b5563)]'
                      }`}>
                        {perm.risk_level}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              {selectedPermissionsToRemove.size === 0 && (
                <p className="mt-2 text-sm text-[#f97316] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Select at least one permission to remove
                </p>
              )}
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
                        <span className="text-[#22c55e] text-sm">{perm.usage_count || 0} uses/day</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-[#f9731610] border border-[#f9731640] rounded-xl">
                  <p className="text-[#f97316] italic">No permissions currently in use - this role may be safe to delete entirely</p>
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

            {/* Confidence Factors */}
            <div className="p-4 rounded-xl" style={{ background: "var(--background, #f8f9fa)" }}>
              <h3 className="font-bold mb-3" style={{ color: "var(--foreground, #111827)" }}>Confidence Factors:</h3>
              <div className="space-y-2">
                {(() => {
                  const noCloudTrailData = cloudtrailEvents === 0 && unusedCount > 0
                  const backendAnalysis = (gapData as any)?.service_role_analysis as BackendServiceRoleAnalysis | undefined
                  const isServiceRole = backendAnalysis?.is_service_role

                  const factors = noCloudTrailData ? [
                    {
                      label: `${observationDays} days analyzed - No usage data collected`,
                      score: 0,
                      warning: true,
                      critical: true
                    },
                    {
                      label: isServiceRole
                        ? `Role is used by AWS service (${backendAnalysis?.analysis?.service_name})`
                        : 'Permissions unverified - may be used by internal service',
                      score: isServiceRole ? 0 : 20,
                      warning: true,
                      critical: isServiceRole
                    },
                    {
                      label: gapData?.dependency_context?.has_critical_dependencies
                        ? 'Critical dependencies detected'
                        : 'No production dependencies in graph',
                      score: gapData?.dependency_context?.has_critical_dependencies ? 50 : 80,
                      warning: gapData?.dependency_context?.has_critical_dependencies
                    },
                    {
                      label: 'Investigation recommended before remediation',
                      score: 30,
                      warning: true
                    }
                  ] : [
                    { label: `${observationDays} days of usage analysis`, score: 99 },
                    { label: `${cloudtrailEvents.toLocaleString()} API events verified`, score: 100 },
                    {
                      label: gapData?.dependency_context?.has_critical_dependencies
                        ? 'Critical dependencies detected (reduced confidence)'
                        : 'No production dependencies detected',
                      score: gapData?.dependency_context?.has_critical_dependencies ? 75 : 100,
                      warning: gapData?.dependency_context?.has_critical_dependencies
                    },
                    { label: 'Similar fixes applied successfully', score: 98 }
                  ]

                  return factors.map((factor, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm">
                        {factor.critical ? (
                          <XCircle className="w-4 h-4 text-[#ef4444]" />
                        ) : factor.warning ? (
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                        ) : (
                          <Check className="w-4 h-4 text-[#22c55e]" />
                        )}
                        <span className={factor.critical ? 'text-[#ef4444] font-medium' : ''}>
                          {factor.label}
                        </span>
                      </span>
                      <span className={`font-semibold ${
                        factor.critical ? 'text-[#ef4444]' :
                        factor.warning ? 'text-[#f97316]' :
                        'text-[#22c55e]'
                      }`}>
                        {factor.score}%
                      </span>
                    </div>
                  ))
                })()}
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
                } else if (lowConfidence) {
                  return (
                    <button
                      onClick={handleApplyFix}
                      disabled={applying || selectedPermissionsToRemove.size === 0}
                      className="px-6 py-2.5 bg-white text-white rounded-lg font-bold hover:from-amber-600 hover:to-orange-600 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                          APPLY ANYWAY ({selectedPermissionsToRemove.size})
                        </>
                      )}
                    </button>
                  )
                } else {
                  return (
                    <button
                      onClick={handleApplyFix}
                      disabled={applying || selectedPermissionsToRemove.size === 0}
                      className="px-6 py-2.5 bg-white text-white rounded-lg font-bold hover:from-blue-700 hover:to-indigo-700 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {applying ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Applying...
                        </>
                      ) : (
                        `APPLY FIX (${selectedPermissionsToRemove.size} permissions)`
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
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
      <div className="relative w-[950px] max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col my-4" style={{ background: "var(--card, #ffffff)" }}>
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ background: "var(--background, #f8f9fa)", borderColor: "var(--border, #e5e7eb)" }}>
          <div>
            <h2 className="text-xl font-bold" style={{ color: "var(--foreground, #111827)" }}>Permission Usage Analysis</h2>
            <p className="text-sm">
              <span className="font-bold" style={{ color: "var(--foreground, #111827)" }}>{roleName}</span>
              <span style={{ color: "var(--muted-foreground, #6b7280)" }}> - IAMRole - {systemName}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchGapAnalysis(true)}
              className="p-2 rounded-lg hover:opacity-80"
              style={{ color: "var(--muted-foreground, #9ca3af)" }} title="Refresh data"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button onClick={handleClose} style={{ color: "var(--muted-foreground, #9ca3af)" }}>
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Recording Period Banner */}
          <div className="mx-6 mt-4 p-4 border-l-4 rounded-r-lg" style={{ borderColor: "#3b82f6", background: "#3b82f610" }}>
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5" style={{ color: "#3b82f6" }} />
              <span className="font-semibold" style={{ color: "var(--foreground, #111827)" }}>{observationDays}-Day Observation Period</span>
            </div>
            <p className="text-sm mt-1" style={{ color: "var(--muted-foreground, #6b7280)" }}>
              Tracked from {formatDate(startDate)} to {formatDate(endDate)} - {cloudtrailEvents.toLocaleString()} API events analyzed
            </p>
          </div>

          {/* Service Role Warning - Based on backend trust policy analysis */}
          {(() => {
            // Use backend analysis if available, otherwise fallback to client-side
            const backendAnalysis = (gapData as any)?.service_role_analysis as BackendServiceRoleAnalysis | undefined
            const analysis = backendAnalysis?.analysis || fallbackAnalyzeRole(roleName, cloudtrailEvents, unusedCount)?.analysis

            if (!analysis) return null

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

            const severity = analysis.severity || 'medium'
            const style = styles[severity] || styles.medium

            return (
              <div className={`mx-6 mt-4 p-5 border-l-4 ${style.border} ${style.bg} rounded-r-lg`}>
                <div className="flex items-start gap-3">
                  <AlertTriangle className={`w-6 h-6 ${style.icon} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1">
                    {/* Title with badge and service principal */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className={`font-bold ${style.title} text-base`}>
                          {analysis.title}
                        </h4>
                        {backendAnalysis?.service_principals && backendAnalysis.service_principals.length > 0 && (
                          <p className="text-xs text-[var(--muted-foreground,#6b7280)] mt-0.5 font-mono">
                            Trust Policy: {backendAnalysis.service_principals.join(', ')}
                          </p>
                        )}
                      </div>
                      <span className={`px-2.5 py-1 ${style.badge} text-xs rounded font-bold whitespace-nowrap`}>
                        {style.badgeText}
                      </span>
                    </div>

                    {/* Description */}
                    <p className={`text-sm ${style.text} mt-2 leading-relaxed`}>
                      {analysis.description}
                    </p>

                    {/* Why no CloudTrail */}
                    {analysis.why_no_cloudtrail && (
                      <div className="mt-3 p-3 bg-white/50 rounded border border-current/10">
                        <p className="text-xs font-semibold text-[var(--muted-foreground,#4b5563)] mb-1">Why permissions appear unused:</p>
                        <p className={`text-sm ${style.text}`}>
                          {analysis.why_no_cloudtrail}
                        </p>
                      </div>
                    )}

                    {/* Affected Permissions */}
                    {analysis.affected_permissions && analysis.affected_permissions.length > 0 && (
                      <div className="mt-3">
                        <p className={`text-xs font-semibold ${style.title} mb-1`}>
                          Permissions used by {analysis.service_name} internally:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {analysis.affected_permissions.slice(0, 6).map((perm, i) => (
                            <span key={i} className="px-2 py-0.5 bg-white/60 border border-current/20 rounded text-xs font-mono">
                              {perm}
                            </span>
                          ))}
                          {analysis.affected_permissions.length > 6 && (
                            <span className="px-2 py-0.5 text-xs">
                              +{analysis.affected_permissions.length - 6} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Recommendation */}
                    {analysis.recommendation && (
                      <div className={`mt-3 p-3 rounded ${severity === 'critical' ? 'bg-[#ef444420]' : 'bg-white/50'}`}>
                        <p className={`text-sm font-semibold ${severity === 'critical' ? 'text-[#ef4444]' : style.text}`}>
                          {severity === 'critical' ? '🛑 ' : '💡 '}
                          {analysis.recommendation}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Remediated State Banner - Show when role has 0 permissions */}
          {totalPermissions === 0 && (
            <div className="mx-6 mt-4 p-6 bg-white border-2 border-[#10b98140] rounded-xl">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-[#10b98120] rounded-full flex items-center justify-center">
                  <CheckCircle className="w-10 h-10 text-[#10b981]" />
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-[#10b981]">Fully Remediated</h3>
                  <p className="text-[#10b981] mt-1">
                    This role has been optimized - all unused permissions have been removed.
                  </p>
                  <p className="text-[var(--muted-foreground,#6b7280)] text-sm mt-2">
                    AWS IAM policies have been detached. The role now follows least privilege principles.
                  </p>
                </div>
                <div className="text-center px-6 py-3 bg-[#10b98120] rounded-xl">
                  <div className="text-4xl font-bold text-[#10b981]">100%</div>
                  <div className="text-[#10b981] text-sm font-medium">LP Score</div>
                </div>
              </div>
              {usedCount > 0 && (
                <div className="mt-4 pt-4 border-t border-[#10b98140]">
                  <p className="text-sm " style={{ color: "var(--muted-foreground, #6b7280)" }}>
                    <span className="font-medium">Historical Usage:</span> This role previously used {usedCount} S3 actions based on CloudTrail data from the past {observationDays} days.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Stats Grid - Only show if not remediated */}
          {totalPermissions > 0 && (
          <div className="grid grid-cols-3 gap-4 p-6">
            <div className="rounded-xl p-4 text-center border" style={{ background: "var(--background, #f8f9fa)", borderColor: "var(--border, #e5e7eb)" }}>
              <div className="text-4xl font-bold" style={{ color: "var(--foreground, #111827)" }}>{totalPermissions}</div>
              <div className="mt-1" style={{ color: "var(--muted-foreground, #9ca3af)" }}>Total Permissions</div>
            </div>
            <div className="rounded-xl p-4 text-center border-2" style={{ borderColor: "#22c55e40", background: "#22c55e10" }}>
              <div className="text-4xl font-bold" style={{ color: "#22c55e" }}>{usedCount}</div>
              <div className="mt-1" style={{ color: "#22c55e" }}>Actually Used ({usedPercent}%)</div>
            </div>
            <div className="rounded-xl p-4 text-center border-2" style={{ borderColor: "#ef444440", background: "#ef444410" }}>
              <div className="text-4xl font-bold" style={{ color: "#ef4444" }}>{unusedCount}</div>
              <div className="mt-1" style={{ color: "#ef4444" }}>Unused ({unusedPercent}%)</div>
            </div>
          </div>
          )}

          {/* Least Privilege Violation Alert - Only show if not remediated */}
          {unusedCount > 0 && totalPermissions > 0 && (
            <div className="mx-6 p-5 rounded-xl border-2" style={{ background: "#ef444410", borderColor: "#ef444440" }}>
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-7 h-7 flex-shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
                <div>
                  <h3 className="text-xl font-bold" style={{ color: "#ef4444" }}>Least Privilege Violation Detected</h3>
                  <p className="mt-2 " style={{ color: "var(--foreground, #111827)" }}>
                    This identity has <strong>{unusedPercent}% more permissions</strong> than required based on {observationDays} days of actual usage.
                    <strong> {unusedCount} permissions</strong> have never been used and should be removed.
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
          {totalPermissions > 0 && (
          <div className="p-6 space-y-4">
            <h3 className="text-lg font-bold" style={{ color: "var(--foreground, #111827)" }}>Permission Usage Breakdown</h3>

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
                    <span style={{ color: "var(--muted-foreground, #9ca3af)" }}>- {perm.usage_count || 0} uses/day</span>
                  </div>
                )) : (
                  <p className="text-[var(--muted-foreground,#9ca3af)] text-sm italic">No permissions currently in use</p>
                )}
              </div>
            </div>

            {/* Never Used Permissions */}
            <div className="border-2 border-[#ef444440] bg-[#ef444410] rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-[#ef4444]" />
                  <span className="font-semibold text-[#ef4444]">Never Used Permissions ({unusedCount})</span>
                </div>
                <span className="px-3 py-1 bg-[#ef444420] text-[#ef4444] border border-[#ef444440] rounded-lg text-sm font-medium">
                  Remove these
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {unusedPermissions.map((perm, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <X className="w-4 h-4 text-[#ef4444] flex-shrink-0" />
                    <span className="font-mono text-[var(--foreground,#374151)] truncate">{perm.permission}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          )}

          {/* Recommended Action */}
          {(() => {
            const noUsageData = cloudtrailEvents === 0 && unusedCount > 0
            const backendAnalysis = (gapData as any)?.service_role_analysis as BackendServiceRoleAnalysis | undefined
            const isServiceRole = backendAnalysis?.is_service_role && backendAnalysis?.analysis?.severity === 'critical'
            const isRemediated = totalPermissions === 0

            // Show success message for remediated roles
            if (isRemediated) {
              return (
                <div className="mx-6 mb-6 p-4 border-2 border-[#10b98140] bg-[#10b98110] rounded-xl">
                  <h3 className="font-bold text-emerald-800">No Action Required</h3>
                  <p className="text-[#10b981] mt-1">
                    This role has been fully remediated. All managed policies have been detached from AWS IAM.
                  </p>
                  <div className="flex items-center gap-2 mt-3 text-[#10b981]">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">Least privilege achieved - Role is optimized</span>
                  </div>
                </div>
              )
            } else if (isServiceRole) {
              return (
                <div className="mx-6 mb-6 p-4 border-2 border-[#ef444440] bg-[#ef444410] rounded-xl">
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
            } else if (noUsageData) {
              return (
                <div className="mx-6 mb-6 p-4 border-2 border-[#f9731640] bg-[#f9731610] rounded-xl">
                  <h3 className="font-bold text-[#f97316]">Investigation Required</h3>
                  <p className="text-[#f97316] mt-1">
                    Cannot verify if permissions are truly unused. This role may be used by EC2 instances,
                    Lambda functions, or other services that don't fully log to our data sources.
                  </p>
                  <div className="flex items-center gap-2 mt-3 text-[#f97316]">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-medium">Low confidence - Investigate before removing permissions</span>
                  </div>
                </div>
              )
            } else {
              return (
                <div className="mx-6 mb-6 p-4 border rounded-xl" style={{ borderColor: "var(--border, #e5e7eb)" }}>
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
        <div className="px-6 py-4 border-t flex items-center justify-between" style={{ borderColor: "var(--border, #e5e7eb)", background: "var(--background, #f8f9fa)" }}>
          <button
            onClick={handleClose}
            className="px-4 py-2 border rounded-lg font-medium"
            style={{ borderColor: "var(--border, #e5e7eb)", color: "var(--muted-foreground, #6b7280)" }}
          >
            CLOSE
          </button>
          <button
            onClick={async () => {
              setSimulating(true)
              try {
                const response = await fetch('/api/proxy/cyntro/remediate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    role_name: roleName,
                    dry_run: true
                  })
                })

                if (!response.ok) {
                  throw new Error(`Remediation failed: ${response.status}`)
                }

                const result = await response.json()

                toast({
                  title: 'Simulation Complete',
                  description: `Would reduce permissions from ${result.summary?.before_total || 0} to ${result.summary?.after_total || 0} (${Math.round((result.summary?.reduction || 0) * 100)}% reduction)`
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
            className="px-6 py-2.5 text-white rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
            style={{ background: "#8b5cf6" }}
          >
            {simulating ? (
              <>
                <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />
                Simulating...
              </>
            ) : (
              'SIMULATE FIX'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

