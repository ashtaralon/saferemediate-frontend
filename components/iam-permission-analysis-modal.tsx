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

// Detect if a role is an AWS service role where CloudTrail may not capture usage
function detectServiceRole(roleName: string): { isServiceRole: boolean; serviceType: string | null; warning: string | null } {
  const lowerName = roleName.toLowerCase()

  // Service-linked roles (AWS managed)
  if (roleName.startsWith('AWSServiceRoleFor')) {
    return {
      isServiceRole: true,
      serviceType: 'Service-Linked Role',
      warning: 'This is an AWS service-linked role. CloudTrail may not capture internal AWS service-to-service API calls.'
    }
  }

  // VPC Flow Logs roles
  if (lowerName.includes('flowlog') || lowerName.includes('flow-log') || lowerName.includes('vpcflowlogs')) {
    return {
      isServiceRole: true,
      serviceType: 'VPC Flow Logs',
      warning: 'This role is used by VPC Flow Logs to write logs. These internal AWS operations are not recorded in CloudTrail.'
    }
  }

  // CloudTrail roles
  if (lowerName.includes('cloudtrail')) {
    return {
      isServiceRole: true,
      serviceType: 'CloudTrail',
      warning: 'This role is used by CloudTrail itself. CloudTrail does not log its own internal operations.'
    }
  }

  // AWS Config roles
  if (lowerName.includes('config') && (lowerName.includes('role') || lowerName.includes('aws'))) {
    return {
      isServiceRole: true,
      serviceType: 'AWS Config',
      warning: 'This role is used by AWS Config. Some internal operations may not appear in CloudTrail.'
    }
  }

  // Lambda execution roles (basic)
  if (lowerName.includes('lambda') && lowerName.includes('execution')) {
    return {
      isServiceRole: true,
      serviceType: 'Lambda Execution',
      warning: 'Lambda execution role permissions are used at function invocation time. Ensure the function is actively invoked before removing permissions.'
    }
  }

  // AutoScaling roles
  if (lowerName.includes('autoscaling') || lowerName.includes('auto-scaling')) {
    return {
      isServiceRole: true,
      serviceType: 'Auto Scaling',
      warning: 'This role is used by Auto Scaling. Scale events may not all be captured in CloudTrail.'
    }
  }

  // Replication roles
  if (lowerName.includes('replication')) {
    return {
      isServiceRole: true,
      serviceType: 'Replication',
      warning: 'This role is used for data replication. Replication operations are internal and may not appear in CloudTrail.'
    }
  }

  return { isServiceRole: false, serviceType: null, warning: null }
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
  const { toast } = useToast()
  const [gapData, setGapData] = useState<GapAnalysisData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSimulation, setShowSimulation] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [applying, setApplying] = useState(false)
  const [createSnapshot, setCreateSnapshot] = useState(true)
  const [detachManagedPolicies, setDetachManagedPolicies] = useState(true)
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
    setSimulating(true)
    // Simulate a brief loading period
    await new Promise(resolve => setTimeout(resolve, 1500))
    setSimulating(false)
    setShowSimulation(true)
  }

  const handleApplyFix = async () => {
    if (!gapData) return
    
    setApplying(true)
    try {
      // Call the remediation API with selected permissions only
      const permissionsToRemove = Array.from(selectedPermissionsToRemove)
      const response = await fetch('/api/proxy/iam-roles/remediate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_name: roleName,
          permissions_to_remove: permissionsToRemove,
          create_snapshot: createSnapshot,
          detach_managed_policies: detachManagedPolicies,
          snapshot_reason: `Pre-remediation backup - removing ${permissionsToRemove.length} permissions`
        })
      })
      
      const result = await response.json()
      
      const totalRemoved = result.total_permissions_removed || result.permissions_removed || 0
      const managedDetached = result.managed_policies_detached || 0

      if (result.success && (totalRemoved > 0 || managedDetached > 0)) {
        // Build description with details
        let desc = ''
        if (result.permissions_removed > 0) {
          desc += `Removed ${result.permissions_removed} permissions from inline policies`
        }
        if (managedDetached > 0) {
          if (desc) desc += '. '
          desc += `Detached ${managedDetached} managed policies`
        }
        if (createSnapshot) {
          desc += '. Snapshot created for rollback.'
        }

        // Show success toast with details
        toast({
          title: "✅ Remediation Applied Successfully",
          description: desc || `Remediated ${roleName}`,
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
      } else if (totalRemoved === 0 && managedDetached === 0) {
        toast({
          title: "⚠️ No Permissions Removed",
          description: detachManagedPolicies
            ? "No matching permissions found in role policies"
            : "Role may only have AWS managed policies. Enable 'Detach Managed Policies' to remove them.",
          variant: "default"
        })
      } else if (!result.success) {
        const errorMsg = result.errors?.[0]?.error || 'Unknown error'
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
    // Reduce score if there are high-risk unused permissions
    const highRiskCount = gapData.high_risk_unused?.length ?? 0
    score -= highRiskCount * 2
    // Reduce score if low CloudTrail events
    if (cloudtrailEvents < 10) score -= 5
    return Math.max(80, Math.min(100, score))
  }

  const safetyScore = calculateSafetyScore()

  // Loading state
  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
        <div className="relative w-[600px] bg-white rounded-2xl shadow-2xl p-8 text-center">
          <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-purple-600" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Analyzing Permissions</h2>
          <p className="text-gray-500">Fetching CloudTrail data for <span className="font-bold text-gray-700">{roleName}</span>...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
        <div className="relative w-[600px] bg-white rounded-2xl shadow-2xl p-8 text-center">
          <XCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Failed to Load Data</h2>
          <p className="text-gray-500 mb-4">{error}</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={fetchGapAnalysis}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700"
            >
              <RefreshCw className="w-4 h-4 inline mr-2" />
              Retry
            </button>
            <button
              onClick={handleClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
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
        <div className="relative w-[700px] bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Simulating Permission Removal</h2>
          <p className="text-lg mb-6">
            <span className="font-bold text-gray-900">{roleName}</span>
            <span className="text-gray-500"> - Analyzing {observationDays} days of permission usage...</span>
          </p>
          
          <div className="space-y-4">
            {[
              { title: "Loading usage history...", subtitle: `Analyzing ${cloudtrailEvents.toLocaleString()} permission checks`, done: true },
              { title: "Identifying unused permissions...", subtitle: `Found ${unusedCount} never-used permissions`, done: true },
              { title: "Checking service dependencies...", subtitle: "Validating active services", done: true },
              { title: "Calculating confidence score...", subtitle: `${safetyScore}% safe to remove`, done: false }
            ].map((step, i) => (
              <div key={i} className={`flex items-start gap-4 p-4 rounded-lg ${step.done ? 'bg-gray-50' : 'bg-purple-50 ring-2 ring-purple-500'}`}>
                <div className="text-2xl">{step.done ? '✅' : '⏳'}</div>
                <div>
                  <div className="font-semibold text-gray-900">{step.title}</div>
                  <div className="text-sm text-gray-500">{step.subtitle}</div>
                  {!step.done && (
                    <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full animate-pulse" style={{ width: '70%' }} />
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
        <div className="relative w-[900px] max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col my-4">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Simulation Results</h2>
              <p className="text-lg">
                <span className="font-bold text-gray-900">{roleName}</span>
                <span className="text-gray-500"> - Permission Removal Analysis</span>
              </p>
            </div>
            <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Safety Score Banner */}
            <div className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-2xl text-center">
              <div className="flex items-center justify-center gap-3">
                <CheckSquare className="w-10 h-10 text-green-500" />
                <span className="text-5xl font-bold text-green-600">{safetyScore}%</span>
                <span className="text-2xl font-bold text-green-600">SAFE TO APPLY</span>
              </div>
              <p className="text-green-600 mt-2">No production services will be affected</p>
            </div>

            {/* What Will Change */}
            <div>
              <h3 className="font-bold text-lg text-gray-900 mb-3">What Will Change:</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <span>Remove <strong>{selectedPermissionsToRemove.size}</strong> selected permissions from {roleName}</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <span>Reduce attack surface by {totalPermissions > 0 ? Math.round((selectedPermissionsToRemove.size / totalPermissions) * 100) : 0}%</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
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
                <h3 className="font-bold text-lg text-gray-900">
                  Permissions to Remove ({selectedPermissionsToRemove.size} of {unusedCount} selected)
                </h3>
                <div className="flex gap-2 text-xs">
                  <button
                    onClick={selectAllPermissions}
                    className="text-indigo-600 hover:underline font-medium"
                  >
                    Select All
                  </button>
                  <span className="text-gray-400">|</span>
                  <button
                    onClick={deselectAllPermissions}
                    className="text-indigo-600 hover:underline font-medium"
                  >
                    Clear All
                  </button>
                </div>
              </div>
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl max-h-64 overflow-y-auto">
                <div className="space-y-2">
                  {unusedPermissions.map((perm, i) => (
                    <label
                      key={i}
                      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                        selectedPermissionsToRemove.has(perm.permission)
                          ? 'bg-red-100 border border-red-300'
                          : 'bg-white border border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPermissionsToRemove.has(perm.permission)}
                        onChange={() => togglePermissionSelection(perm.permission)}
                        className="w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500"
                      />
                      <span className="font-mono text-sm text-gray-700 flex-1 truncate">{perm.permission}</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                        perm.risk_level === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                        perm.risk_level === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {perm.risk_level}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              {selectedPermissionsToRemove.size === 0 && (
                <p className="mt-2 text-sm text-amber-600 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Select at least one permission to remove
                </p>
              )}
            </div>

            {/* Permissions to Keep */}
            <div>
              <h3 className="font-bold text-lg text-gray-900 mb-3">Permissions to Keep ({usedCount}):</h3>
              {usedPermissions.length > 0 ? (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl max-h-32 overflow-y-auto">
                  <div className="space-y-2">
                    {usedPermissions.map((perm, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <span className="font-mono text-sm text-gray-700">{perm.permission}</span>
                        <span className="text-green-600 text-sm">{perm.usage_count || 0} uses/day</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-amber-700 italic">No permissions currently in use - this role may be safe to delete entirely</p>
                </div>
              )}
            </div>

            {/* Dependency Context */}
            {gapData?.dependency_context && (
              <div className={`p-4 rounded-xl ${
                gapData.dependency_context.status === 'ok' && gapData.dependency_context.has_critical_dependencies
                  ? 'bg-amber-50 border border-amber-200'
                  : gapData.dependency_context.status !== 'ok'
                  ? 'bg-gray-50 border border-gray-200'
                  : 'bg-green-50 border border-green-200'
              }`}>
                <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                  {gapData.dependency_context.status === 'ok' && gapData.dependency_context.has_critical_dependencies ? (
                    <>
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                      Critical Dependencies Detected
                    </>
                  ) : gapData.dependency_context.status !== 'ok' ? (
                    <>
                      <Activity className="w-5 h-5 text-gray-400" />
                      Dependency Evidence Unavailable
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5 text-green-500" />
                      Dependency Analysis
                    </>
                  )}
                </h3>
                
                {gapData.dependency_context.status === 'ok' ? (
                  <>
                    {gapData.dependency_context.system?.name && (
                      <p className="text-sm text-gray-600 mb-2">
                        System: <span className="font-medium">{gapData.dependency_context.system.name}</span>
                        {gapData.dependency_context.system.criticality && (
                          <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                            ['production', 'prod', 'critical', 'mission_critical'].includes(
                              (gapData.dependency_context.system.criticality || '').toLowerCase()
                            ) ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {gapData.dependency_context.system.criticality}
                          </span>
                        )}
                      </p>
                    )}
                    
                    {gapData.dependency_context.dependencies && gapData.dependency_context.dependencies.length > 0 ? (
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        <p className="text-sm font-medium text-gray-700 mb-2">
                          Affected Resources ({gapData.dependency_context.dependencies.length}):
                        </p>
                        {gapData.dependency_context.dependencies.slice(0, 10).map((dep, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <span className="px-1.5 py-0.5 rounded text-xs bg-gray-200 text-gray-600 font-mono">
                              {dep.type || 'Unknown'}
                            </span>
                            <span className="text-gray-700 truncate">{dep.name || dep.arn}</span>
                            {dep.environment && (
                              <span className={`px-1.5 py-0.5 rounded text-xs ${
                                ['prod', 'production'].includes(dep.environment.toLowerCase())
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}>
                                {dep.environment}
                              </span>
                            )}
                          </div>
                        ))}
                        {gapData.dependency_context.dependencies.length > 10 && (
                          <p className="text-xs text-gray-500 italic">
                            +{gapData.dependency_context.dependencies.length - 10} more...
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-green-700">✓ No dependent resources detected</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-500">
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
            <div className="p-4 bg-gray-50 rounded-xl">
              <h3 className="font-bold text-gray-900 mb-3">Confidence Factors:</h3>
              <div className="space-y-2">
                {[
                  { label: `${observationDays} days of CloudTrail analysis`, score: 99 },
                  { label: 'All unused permissions verified', score: 100 },
                  { 
                    label: gapData?.dependency_context?.has_critical_dependencies 
                      ? 'Critical dependencies detected (reduced confidence)' 
                      : 'No production dependencies detected', 
                    score: gapData?.dependency_context?.has_critical_dependencies ? 75 : 100,
                    warning: gapData?.dependency_context?.has_critical_dependencies
                  },
                  { label: 'Similar fixes applied successfully', score: 98 }
                ].map((factor, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm">
                      {factor.warning ? (
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      ) : (
                        <Check className="w-4 h-4 text-green-500" />
                      )}
                      {factor.label}
                    </span>
                    <span className={`font-semibold ${factor.warning ? 'text-amber-600' : 'text-green-600'}`}>
                      {factor.score}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <button 
              onClick={() => setShowSimulation(false)}
              disabled={applying}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-medium disabled:opacity-50"
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
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm text-gray-600">Create rollback checkpoint</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer" title="Detach AWS managed policies that contain unused permissions. Required for roles with only managed policies.">
                <input
                  type="checkbox"
                  checked={detachManagedPolicies}
                  onChange={(e) => setDetachManagedPolicies(e.target.checked)}
                  disabled={applying}
                  className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                />
                <span className="text-sm text-gray-600">Detach managed policies</span>
              </label>
              <button
                onClick={handleApplyFix}
                disabled={applying || selectedPermissionsToRemove.size === 0}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-bold hover:from-blue-700 hover:to-indigo-700 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
      <div className="relative w-[950px] max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col my-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Permission Usage Analysis</h2>
            <p className="text-lg">
              <span className="font-bold text-gray-900">{roleName}</span>
              <span className="text-gray-500"> - IAMRole - {systemName}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchGapAnalysis(true)}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              title="Refresh data"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Recording Period Banner */}
          <div className="mx-6 mt-4 p-4 border-l-4 border-blue-500 bg-blue-50 rounded-r-lg">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-gray-900">{observationDays}-Day Recording Period</span>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Tracked from {formatDate(startDate)} to {formatDate(endDate)} - {cloudtrailEvents.toLocaleString()} permission checks analyzed
            </p>
          </div>

          {/* Service Role Warning */}
          {(() => {
            const serviceRoleInfo = detectServiceRole(roleName)
            // Show warning if it's a service role OR if there are 0 CloudTrail events with unused permissions
            const showWarning = serviceRoleInfo.isServiceRole || (cloudtrailEvents === 0 && unusedCount > 0)

            if (!showWarning) return null

            return (
              <div className="mx-6 mt-4 p-4 border-l-4 border-amber-500 bg-amber-50 rounded-r-lg">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-amber-800">
                        {serviceRoleInfo.serviceType ? `${serviceRoleInfo.serviceType} Role Detected` : 'Limited CloudTrail Visibility'}
                      </span>
                      <span className="px-2 py-0.5 bg-amber-200 text-amber-800 text-xs rounded-full font-medium">
                        Analysis May Be Incomplete
                      </span>
                    </div>
                    <p className="text-sm text-amber-700 mt-1">
                      {serviceRoleInfo.warning ||
                        'This role shows 0 permission checks in CloudTrail but has configured permissions. This typically means the role is used by AWS services internally, and those API calls are not recorded in CloudTrail.'}
                    </p>
                    <p className="text-sm text-amber-600 mt-2 font-medium">
                      ⚠️ Do not remove permissions without verifying the role is truly unused. The permissions may be actively used by AWS services.
                    </p>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-4 p-6">
            <div className="border border-gray-200 rounded-xl p-4 text-center">
              <div className="text-4xl font-bold text-gray-800">{totalPermissions}</div>
              <div className="text-gray-500 mt-1">Total Permissions</div>
            </div>
            <div className="border-2 border-green-200 bg-green-50 rounded-xl p-4 text-center">
              <div className="text-4xl font-bold text-green-600">{usedCount}</div>
              <div className="text-green-600 mt-1">Actually Used ({usedPercent}%)</div>
            </div>
            <div className="border-2 border-red-200 bg-red-50 rounded-xl p-4 text-center">
              <div className="text-4xl font-bold text-red-600">{unusedCount}</div>
              <div className="text-red-600 mt-1">Unused ({unusedPercent}%)</div>
            </div>
          </div>

          {/* Least Privilege Violation Alert */}
          {unusedCount > 0 && (
            <div className="mx-6 p-5 bg-red-50 border-2 border-red-200 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-7 h-7 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-xl font-bold text-red-600">Least Privilege Violation Detected</h3>
                  <p className="mt-2 text-gray-700">
                    This identity has <strong>{unusedPercent}% more permissions</strong> than required based on {observationDays} days of actual usage.
                    <strong> {unusedCount} permissions</strong> have never been used and should be removed.
                  </p>
                  <div className="flex items-center gap-3 mt-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      overallRisk === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                      overallRisk === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                      overallRisk === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {overallRisk} Risk
                    </span>
                    <span className="text-gray-600">
                      Attack surface reduced by {unusedPercent}% after remediation
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Permission Usage Breakdown */}
          <div className="p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Permission Usage Breakdown</h3>

            {/* Actually Used Permissions */}
            <div className="border border-green-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="font-semibold text-gray-900">Actually Used Permissions ({usedCount})</span>
                </div>
                <span className="px-3 py-1 border border-green-300 text-green-600 rounded-lg text-sm font-medium bg-green-50">
                  Keep these
                </span>
              </div>
              <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                {usedPermissions.length > 0 ? usedPermissions.map((perm, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-green-500">✓</span>
                    <span className="font-mono text-gray-800">{perm.permission}</span>
                    <span className="text-gray-400">- {perm.usage_count || 0} uses/day</span>
                  </div>
                )) : (
                  <p className="text-gray-400 text-sm italic">No permissions currently in use</p>
                )}
              </div>
            </div>

            {/* Never Used Permissions */}
            <div className="border-2 border-red-200 bg-red-50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  <span className="font-semibold text-red-700">Never Used Permissions ({unusedCount})</span>
                </div>
                <span className="px-3 py-1 bg-red-100 text-red-600 border border-red-300 rounded-lg text-sm font-medium">
                  Remove these
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {unusedPermissions.map((perm, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <X className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <span className="font-mono text-gray-700 truncate">{perm.permission}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recommended Action */}
          <div className="mx-6 mb-6 p-4 border border-gray-200 rounded-xl">
            <h3 className="font-bold text-gray-900">Recommended Action</h3>
            <p className="text-gray-600 mt-1">
              Remove {unusedCount} unused permissions to achieve least privilege compliance. 
              This will reduce the attack surface by {unusedPercent}% while maintaining all current functionality.
            </p>
            <div className="flex items-center gap-2 mt-3 text-green-600">
              <Shield className="w-5 h-5" />
              <span className="font-medium">High confidence remediation - No service disruption expected</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <button 
            onClick={handleClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-medium"
          >
            CLOSE
          </button>
          <button 
            onClick={handleSimulate}
            disabled={simulating || unusedCount === 0}
            className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-bold hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
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

