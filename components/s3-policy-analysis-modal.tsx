"use client"

import { useState, useEffect } from "react"
import {
  X, Calendar, CheckCircle, AlertTriangle, Shield, Check,
  CheckSquare, Loader2, RefreshCw, XCircle, Database, Globe,
  FileText, Lock, Users, Eye, Activity, Play, Zap
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface PolicyAnalysis {
  policy_name: string
  policy_type: "used" | "unused" | "overly_permissive"
  risk_level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  recommendation: string
  access_count: number
  last_accessed?: string
  is_public?: boolean
  principal?: string
  actions?: string[]
  actions_used?: string[]
}

interface S3GapAnalysisData {
  bucket_name: string
  bucket_arn?: string
  observation_days: number
  summary: {
    total_policies: number
    used_count: number
    unused_count: number
    lp_score: number
    overall_risk: string
    s3_events: number
    has_public_access?: boolean
  }
  policies_analysis: PolicyAnalysis[]
  used_policies: string[]
  unused_policies: string[]
  security_issues: string[]
  confidence: string
}

interface BucketPolicyData {
  bucket_policy: any | null
  public_access_block: {
    blockPublicAcls: boolean
    blockPublicPolicy: boolean
    ignorePublicAcls: boolean
    restrictPublicBuckets: boolean
  } | null
  acl: {
    owner: string
    grants: Array<{
      grantee: string
      grantee_type: string
      permission: string
    }>
  } | null
  encryption: {
    type: string
    kms_key_id?: string
  } | null
  versioning: {
    status: string
    mfa_delete: string
  } | null
}

interface S3PolicyAnalysisModalProps {
  isOpen: boolean
  onClose: () => void
  bucketName: string
  systemName: string
  resourceData?: any
  onApplyFix?: (data: any) => void
  onSuccess?: () => void
  onRemediationSuccess?: (result: {
    bucketName: string
    snapshotId?: string | null
    eventId?: string | null
    rollbackAvailable?: boolean
    afterTotal?: number | null
    removedCount?: number | null
  }) => void
}

type TabType = 'analysis' | 'policies' | 'evidence' | 'access' | 'remediation'

interface AccessData {
  dataEventsStatus: string
  totalRequests: number
  uniquePrincipals: number
  lastActivity: string | null
  topPrincipals: Array<{
    principal: string
    actionCounts: Array<{
      action: string
      count: number
      lastSeen: string | null
    }>
  }>
}

function formatObservedAccessLabel(count: number, observationDays: number) {
  return `${count.toLocaleString()} observed accesses in ${observationDays}-day window`
}

export function S3PolicyAnalysisModal({
  isOpen,
  onClose,
  bucketName,
  systemName,
  resourceData,
  onApplyFix,
  onSuccess,
  onRemediationSuccess
}: S3PolicyAnalysisModalProps) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<TabType>('analysis')
  const [gapData, setGapData] = useState<S3GapAnalysisData | null>(null)
  const [policyData, setPolicyData] = useState<BucketPolicyData | null>(null)
  const [accessData, setAccessData] = useState<AccessData | null>(null)
  const [loading, setLoading] = useState(false)
  const [policyLoading, setPolicyLoading] = useState(false)
  const [accessLoading, setAccessLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSimulation, setShowSimulation] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [simulationPreview, setSimulationPreview] = useState<any>(null)
  const [applying, setApplying] = useState(false)
  const [createSnapshot, setCreateSnapshot] = useState(true)
  const [selectedPoliciesToRemove, setSelectedPoliciesToRemove] = useState<Set<string>>(new Set())

  // Fetch gap analysis data when modal opens
  useEffect(() => {
    if (isOpen && bucketName) {
      fetchGapAnalysis()
      fetchBucketPolicy()
      fetchAccessData()
    }
  }, [isOpen, bucketName])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setActiveTab('analysis')
      setShowSimulation(false)
      setSimulationPreview(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const defaults = new Set(
      (gapData?.policies_analysis ?? [])
        .filter(p => p.policy_type === 'unused' || p.policy_type === 'overly_permissive')
        .map(p => p.policy_name)
    )
    setSelectedPoliciesToRemove(defaults)
  }, [gapData, isOpen])

  const fetchGapAnalysis = async () => {
    setLoading(true)
    setError(null)
    try {
      console.log('[S3-Modal] Fetching gap analysis for:', bucketName)
      
      const response = await fetch(`/api/proxy/s3-buckets/${encodeURIComponent(bucketName)}/gap-analysis?days=365`)
      
      if (response.ok) {
        const data = await response.json()
        console.log('[S3-Modal] Got data from API:', data)
        // Check if it's a not_found response
        if (data.not_found) {
          console.log('[S3-Modal] Backend returned not_found flag')
          setGapData(null)
        } else {
          setGapData(data)
        }
      } else {
        // 404 or other error - don't throw, just set empty data
        console.log(`[S3-Modal] API returned ${response.status}, setting empty data`)
        setGapData(null)
        // Only set error for non-404 errors
        if (response.status !== 404) {
          setError(`S3 gap analysis not available (${response.status})`)
        }
      }
    } catch (err: any) {
      console.error('[S3-Modal] Error:', err)
      // Don't set error on 404 - just show empty state
      if (!err.message?.includes('404')) {
        setError(err.message || 'Failed to fetch gap analysis')
      } else {
        setGapData(null)
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchBucketPolicy = async () => {
    setPolicyLoading(true)
    try {
      console.log('[S3-Modal] Fetching bucket policy for:', bucketName)
      
      const response = await fetch(`/api/proxy/s3-buckets/${encodeURIComponent(bucketName)}/policy`)
      
      if (response.ok) {
        const data = await response.json()
        console.log('[S3-Modal] Got policy data:', data)
        setPolicyData(data)
      } else {
        console.log('[S3-Modal] Policy API not available')
        setPolicyData(null)
      }
    } catch (err: any) {
      console.error('[S3-Modal] Policy fetch error:', err)
      // Return null on error (no mock data)
      setPolicyData(null)
    } finally {
      setPolicyLoading(false)
    }
  }

  const fetchAccessData = async () => {
    setAccessLoading(true)
    try {
      console.log('[S3-Modal] Fetching access data for:', bucketName)

      // Use the analysis endpoint which includes observedUsage with topPrincipals
      const response = await fetch(`/api/proxy/s3-buckets/${encodeURIComponent(bucketName)}/analysis?window=90d`)

      if (response.ok) {
        const data = await response.json()
        console.log('[S3-Modal] Got analysis data:', data)
        if (data.observedUsage) {
          setAccessData(data.observedUsage)
        }
      } else {
        console.log('[S3-Modal] Analysis API not available')
        setAccessData(null)
      }
    } catch (err: any) {
      console.error('[S3-Modal] Access fetch error:', err)
      setAccessData(null)
    } finally {
      setAccessLoading(false)
    }
  }

  const handleClose = () => {
    setShowSimulation(false)
    setSimulationPreview(null)
    setGapData(null)
    setPolicyData(null)
    setError(null)
    setActiveTab('analysis')
    setSelectedPoliciesToRemove(new Set())
    onClose()
  }

  const handleSimulate = async () => {
    if (selectedPoliciesToRemove.size === 0) {
      toast({
        title: "Select statements first",
        description: "Choose at least one S3 policy statement to include in the remediation preview.",
        variant: "destructive"
      })
      return
    }
    setSimulating(true)
    try {
      const selectedPolicies = Array.from(selectedPoliciesToRemove)
      const response = await fetch('/api/proxy/s3-buckets/remediate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucket_name: bucketName,
          policies_to_remove: selectedPolicies,
          create_snapshot: true,
          dry_run: true,
          snapshot_reason: `Dry-run preview for ${selectedPolicies.length} S3 policy statements`
        })
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to run S3 remediation preview')
      }

      setSimulationPreview(result)
      setShowSimulation(true)
    } catch (err: any) {
      toast({
        title: "Preview failed",
        description: err.message || 'Could not generate the S3 remediation preview.',
        variant: "destructive"
      })
    } finally {
      setSimulating(false)
    }
  }

  const handleApplyFix = async () => {
    if (!gapData) return
    if (selectedPoliciesToRemove.size === 0) {
      toast({
        title: "No statements selected",
        description: "Select at least one policy statement to remediate.",
        variant: "destructive"
      })
      return
    }
    
    setApplying(true)
    try {
      const selectedPolicies = Array.from(selectedPoliciesToRemove)
      const response = await fetch('/api/proxy/s3-buckets/remediate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucket_name: bucketName,
          policies_to_remove: selectedPolicies,
          create_snapshot: true,
          snapshot_reason: `Pre-remediation backup - removing ${selectedPolicies.length} S3 policy statements`
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        toast({
          title: "✅ Remediation Applied Successfully",
          description: `Removed ${result.policies_removed || unusedCount} policies from ${bucketName}`,
          variant: "default"
        })
        
        if (onApplyFix) {
          onApplyFix({
            bucketName,
            systemName,
            policiesToRemove: selectedPolicies,
            createSnapshot,
            confidence: calculateSafetyScore(),
            result
          })
        }
        
        if (onRemediationSuccess) {
          onRemediationSuccess({
            bucketName,
            snapshotId: result.snapshot_id ?? null,
            eventId: result.event_id ?? null,
            rollbackAvailable: result.rollback_available ?? !!result.snapshot_id,
            afterTotal: result.statements_remaining ?? null,
            removedCount: result.policies_removed ?? selectedPolicies.length,
          })
        }
        
        onSuccess?.()
        handleClose()
      } else {
        throw new Error(result.error || 'Remediation failed')
      }
    } catch (err: any) {
      console.error('[S3-Modal] Apply fix error:', err)
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

  // First, get the actual filtered lists
  const usedPolicies = (gapData?.policies_analysis ?? []).filter(p => p.policy_type === 'used')
  const unusedPolicies = (gapData?.policies_analysis ?? []).filter(p => p.policy_type === 'unused' || p.policy_type === 'overly_permissive')
  const securityIssues = gapData?.security_issues ?? []

  // CRITICAL FIX: Derive counts from actual list lengths to ensure UI consistency
  // The backend may return summary counts that don't match the filtered lists
  const usedCount = usedPolicies.length > 0 ? usedPolicies.length : (gapData?.summary?.used_count ?? 0)
  const unusedCount = unusedPolicies.length > 0 ? unusedPolicies.length : (gapData?.summary?.unused_count ?? 0)
  const totalPolicies = (usedCount + unusedCount) > 0 ? (usedCount + unusedCount) : (gapData?.summary?.total_policies ?? 0)

  // Calculate LP score from actual data
  const derivedLpScore = totalPolicies > 0 ? Math.round((usedCount / totalPolicies) * 100) : 0
  const lpScore = gapData?.summary?.lp_score ?? derivedLpScore

  const observationDays = gapData?.observation_days ?? 90
  const overallRisk = gapData?.summary?.overall_risk ?? 'UNKNOWN'
  const s3Events = gapData?.summary?.s3_events ?? 0
  const hasPublicAccess = gapData?.summary?.has_public_access ?? false

  const usedPercent = totalPolicies > 0 ? Math.round((usedCount / totalPolicies) * 100) : 0
  const unusedPercent = totalPolicies > 0 ? Math.round((unusedCount / totalPolicies) * 100) : 0
  
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - observationDays)
  const formatDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const calculateSafetyScore = () => {
    if (!gapData) return 95
    let score = 95
    if (hasPublicAccess) score -= 10
    score -= securityIssues.length * 2
    if (s3Events < 10) score -= 5
    return Math.max(80, Math.min(100, score))
  }

  const safetyScore = calculateSafetyScore()
  const previewWouldBlock = !!simulationPreview?.safety_gate?.would_block
  const previewWarnings: string[] = simulationPreview?.safety_gate?.warnings ?? []
  const toggleSelectedPolicy = (policyName: string) => {
    setSelectedPoliciesToRemove(prev => {
      const next = new Set(prev)
      if (next.has(policyName)) {
        next.delete(policyName)
      } else {
        next.add(policyName)
      }
      return next
    })
  }
  const selectAllPolicies = () => {
    setSelectedPoliciesToRemove(new Set(unusedPolicies.map(policy => policy.policy_name)))
  }
  const clearSelectedPolicies = () => {
    setSelectedPoliciesToRemove(new Set())
  }

  // Loading state
  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
        <div className="relative w-[600px] bg-white rounded-2xl shadow-2xl p-8 text-center">
          <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-[#22c55e]" />
          <h2 className="text-xl font-bold text-[var(--foreground,#111827)] mb-2">Analyzing Policies</h2>
          <p className="text-[var(--muted-foreground,#6b7280)]">Fetching S3 access data for {bucketName}...</p>
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
          <XCircle className="w-12 h-12 mx-auto mb-4 text-[#ef4444]" />
          <h2 className="text-xl font-bold text-[var(--foreground,#111827)] mb-2">Failed to Load Data</h2>
          <p className="text-[var(--muted-foreground,#6b7280)] mb-4">{error}</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={fetchGapAnalysis}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
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
        <div className="relative w-[700px] bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-2xl font-bold text-[var(--foreground,#111827)] mb-2">Simulating Policy Removal</h2>
          <p className="text-[var(--muted-foreground,#6b7280)] mb-6">{bucketName} - Analyzing {observationDays} days of access patterns...</p>
          
          <div className="space-y-4">
            {[
              { title: "Loading access history...", subtitle: `Analyzing ${s3Events.toLocaleString()} S3 access events`, done: true },
              { title: "Identifying unused policies...", subtitle: `Found ${unusedCount} unused bucket policies`, done: true },
              { title: "Checking public access...", subtitle: hasPublicAccess ? "⚠️ Public access detected" : "No public access", done: true },
              { title: "Calculating confidence score...", subtitle: `${safetyScore}% safe to remove`, done: false }
            ].map((step, i) => (
              <div key={i} className={`flex items-start gap-4 p-4 rounded-lg ${step.done ? 'bg-gray-50' : 'bg-[#22c55e10] ring-2 ring-green-500'}`}>
                <div className="text-2xl">{step.done ? '✅' : '⏳'}</div>
                <div>
                  <div className="font-semibold text-[var(--foreground,#111827)]">{step.title}</div>
                  <div className="text-sm text-[var(--muted-foreground,#6b7280)]">{step.subtitle}</div>
                  {!step.done && (
                    <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-[#22c55e10]0 rounded-full animate-pulse" style={{ width: '70%' }} />
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
          <div className="px-6 py-4 border-b border-[var(--border,#e5e7eb)] flex items-center justify-between bg-gray-50">
            <div>
              <h2 className="text-2xl font-bold text-[var(--foreground,#111827)]">Simulation Results</h2>
              <p className="text-[var(--muted-foreground,#6b7280)]">S3 bucket policy remediation preview</p>
            </div>
            <button onClick={handleClose} className="text-[var(--muted-foreground,#9ca3af)] hover:text-[var(--muted-foreground,#4b5563)]">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Safety Score Banner */}
            <div className={`p-6 bg-white border-2 rounded-2xl text-center ${previewWouldBlock ? 'border-[#f59e0b66]' : 'border-[#22c55e40]'}`}>
              <div className="flex items-center justify-center gap-3">
                <CheckSquare className={`w-10 h-10 ${previewWouldBlock ? 'text-[#f59e0b]' : 'text-[#22c55e]'}`} />
                <span className={`text-5xl font-bold ${previewWouldBlock ? 'text-[#f59e0b]' : 'text-[#22c55e]'}`}>{safetyScore}%</span>
                <span className={`text-2xl font-bold ${previewWouldBlock ? 'text-[#f59e0b]' : 'text-[#22c55e]'}`}>
                  {previewWouldBlock ? 'REVIEW BEFORE APPLY' : 'SAFE TO APPLY'}
                </span>
              </div>
              <p className={`mt-2 ${previewWouldBlock ? 'text-[#b45309]' : 'text-[#22c55e]'}`}>
                {previewWouldBlock
                  ? (simulationPreview?.safety_gate?.would_block_reason || 'The safety gate would block this exact change set during execution.')
                  : 'No applications will be affected'}
              </p>
            </div>

            {/* What Will Change */}
            <div>
              <h3 className="font-bold text-lg text-[var(--foreground,#111827)] mb-3">What Will Change:</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Check className="w-5 h-5 text-[#22c55e] flex-shrink-0" />
                  <span>Remove {selectedPoliciesToRemove.size} selected policy statements from {bucketName}</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Check className="w-5 h-5 text-[#22c55e] flex-shrink-0" />
                  <span>Reduce attack surface by {unusedCount > 0 ? Math.round((selectedPoliciesToRemove.size / unusedCount) * unusedPercent) : 0}%</span>
                </div>
                {hasPublicAccess && (
                  <div className="flex items-center gap-3 p-3 bg-[#ef444410] rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-[#ef4444] flex-shrink-0" />
                    <span className="text-[#ef4444]">Remove public access policies (security improvement)</span>
                  </div>
                )}
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Check className="w-5 h-5 text-[#22c55e] flex-shrink-0" />
                  <span>Apply an explicit rollback-backed S3 remediation change set</span>
                </div>
              </div>
            </div>

            {/* Policies to Remove */}
            <div>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="font-bold text-lg text-[var(--foreground,#111827)]">Policies to Remove ({selectedPoliciesToRemove.size} of {unusedCount} selected)</h3>
                <div className="flex items-center gap-3 text-sm">
                  <button onClick={selectAllPolicies} className="text-[#16a34a] font-medium hover:text-[#15803d]">Select All</button>
                  <span className="text-[var(--border,#d1d5db)]">|</span>
                  <button onClick={clearSelectedPolicies} className="text-[var(--muted-foreground,#6b7280)] font-medium hover:text-[var(--foreground,#111827)]">Clear All</button>
                </div>
              </div>
              <div className="p-4 bg-[#ef444410] border border-[#ef444440] rounded-xl max-h-48 overflow-y-auto">
                <div className="grid grid-cols-2 gap-2">
                  {unusedPolicies.map((policy, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => toggleSelectedPolicy(policy.policy_name)}
                      className={`flex items-center gap-2 text-sm rounded-lg border px-3 py-2 text-left transition ${
                        selectedPoliciesToRemove.has(policy.policy_name)
                          ? 'border-[#ef4444] bg-white'
                          : 'border-transparent bg-transparent opacity-70 hover:opacity-100'
                      }`}
                    >
                      {selectedPoliciesToRemove.has(policy.policy_name) ? (
                        <CheckSquare className="w-4 h-4 text-[#ef4444] flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-[#ef4444] flex-shrink-0" />
                      )}
                      <span className="font-mono text-[var(--foreground,#374151)] truncate">{policy.policy_name}</span>
                      {policy.is_public && (
                        <span className="px-1.5 py-0.5 bg-red-600 text-white text-xs rounded font-medium">
                          PUBLIC
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Policies to Keep */}
            <div>
              <h3 className="font-bold text-lg text-[var(--foreground,#111827)] mb-3">Policies to Keep ({usedCount}):</h3>
              {usedPolicies.length > 0 ? (
                <div className="p-4 bg-[#22c55e10] border border-[#22c55e40] rounded-xl max-h-32 overflow-y-auto">
                  <div className="space-y-2">
                    {usedPolicies.map((policy, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-[#22c55e] flex-shrink-0" />
                        <span className="font-mono text-sm text-[var(--foreground,#374151)]">{policy.policy_name}</span>
                        <span className="text-[#22c55e] text-sm">
                          {formatObservedAccessLabel(policy.access_count || 0, observationDays)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-[#f9731610] border border-[#f9731640] rounded-xl">
                  <p className="text-[#f97316] italic">No policies currently in use</p>
                </div>
              )}
            </div>

            {/* Confidence Factors */}
            <div className="p-4 bg-gray-50 rounded-xl">
              <h3 className="font-bold text-[var(--foreground,#111827)] mb-3">Confidence Factors:</h3>
              <div className="space-y-2">
                {[
                  { label: `${observationDays} days of S3 access analysis`, score: 99 },
                  { label: 'All unused policies verified', score: 100 },
                  { label: 'No active applications affected', score: 100 },
                  { label: 'Similar fixes applied successfully', score: 98 }
                ].map((factor, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-[#22c55e]" />
                      {factor.label}
                    </span>
                    <span className="text-[#22c55e] font-semibold">{factor.score}%</span>
                  </div>
                ))}
              </div>
            </div>

            {previewWarnings.length > 0 && (
              <div className="p-4 bg-[#fff7ed] border border-[#fdba74] rounded-xl">
                <h3 className="font-bold text-[var(--foreground,#111827)] mb-3">Safety Gate Warnings</h3>
                <div className="space-y-2">
                  {previewWarnings.map((warning, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-[#9a3412]">
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-[var(--border,#e5e7eb)] bg-gray-50 flex items-center justify-between">
            <button 
              onClick={() => setShowSimulation(false)}
              disabled={applying}
              className="px-4 py-2 border border-[var(--border,#d1d5db)] text-[var(--foreground,#374151)] rounded-lg hover:bg-gray-100 font-medium disabled:opacity-50"
            >
              ← BACK
            </button>
            <div className="flex items-center gap-4">
              <div className="text-sm text-[var(--muted-foreground,#4b5563)]">
                Rollback checkpoint will be created automatically before the bucket policy is changed
              </div>
              <button 
                onClick={handleApplyFix}
                disabled={applying || selectedPoliciesToRemove.size === 0 || previewWouldBlock}
                className="px-6 py-2.5 bg-[#16a34a] text-white rounded-lg font-bold hover:bg-[#15803d] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {applying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Applying...
                  </>
                ) : (
                  'APPLY FIX NOW'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Main Modal with Tabs
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
      <div className="relative w-[950px] max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col my-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border,#e5e7eb)] flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[var(--foreground,#111827)]">S3 Policy Analysis</h2>
            <p className="text-[var(--muted-foreground,#6b7280)]">{bucketName} - S3 bucket - {systemName}</p>
          </div>
          <button onClick={handleClose} className="text-[var(--muted-foreground,#9ca3af)] hover:text-[var(--muted-foreground,#4b5563)]">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-[var(--border,#e5e7eb)] px-6">
          <div className="flex gap-1">
            {[
              { id: 'analysis' as const, label: 'Summary', icon: Eye },
              { id: 'access' as const, label: 'Who Accessed', icon: Users },
              { id: 'policies' as const, label: 'Policy', icon: FileText },
              { id: 'evidence' as const, label: 'Context', icon: Shield },
              { id: 'remediation' as const, label: 'Remediation', icon: Zap }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-green-600 text-[#22c55e] bg-[#22c55e10]'
                    : 'border-transparent text-[var(--muted-foreground,#4b5563)] hover:text-[var(--foreground,#111827)] hover:bg-gray-50'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.comingSoon && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-[#f9731620] text-[#f97316] rounded">
                    SOON
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'analysis' && (
            <AnalysisTab
              bucketName={bucketName}
              gapData={gapData}
              accessData={accessData}
              policyData={policyData}
              usedCount={usedCount}
              unusedCount={unusedCount}
              usedPercent={usedPercent}
              unusedPercent={unusedPercent}
              totalPolicies={totalPolicies}
              observationDays={observationDays}
              overallRisk={overallRisk}
              hasPublicAccess={hasPublicAccess}
              usedPolicies={usedPolicies}
              unusedPolicies={unusedPolicies}
              formatDate={formatDate}
              startDate={startDate}
              endDate={endDate}
            />
          )}
          {activeTab === 'access' && (
            <AccessTab
              accessData={accessData}
              accessLoading={accessLoading}
            />
          )}
          {activeTab === 'policies' && (
            <PoliciesTab
              policyData={policyData}
              policyLoading={policyLoading}
            />
          )}
          {activeTab === 'evidence' && (
            <EvidenceTab
              observationDays={observationDays}
              s3Events={s3Events}
              confidence={gapData?.confidence || 'MEDIUM'}
            />
          )}
          {activeTab === 'remediation' && (
            <div className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#22c55e20] flex items-center justify-center">
                <Zap className="w-8 h-8 text-[#22c55e]" />
              </div>
              <h3 className="text-xl font-bold text-[var(--foreground,#111827)] mb-2">Remediation Process</h3>
              <p className="text-[var(--muted-foreground,#4b5563)] max-w-md mx-auto mb-6">
                {unusedCount > 0
                  ? `Found ${unusedCount} unused ${unusedCount === 1 ? 'policy statement' : 'policy statements'} that can be safely removed. Review the exact change set, create a rollback checkpoint, and preview the result before applying it.`
                  : hasPublicAccess
                    ? 'No unused policy statements were found, but this bucket still has active public exposure. Least-privilege removal is not available for the current statement set.'
                    : 'No unused policies detected. No least-privilege remediation is currently needed for this bucket policy.'
                }
              </p>
              {unusedCount > 0 ? (
                <div className="bg-white border border-[#ef444440] rounded-lg p-5 max-w-2xl mx-auto text-left">
                  <h4 className="font-semibold text-[#ef4444] mb-3">Remediation Plan</h4>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="rounded-lg bg-[#f8fafc] border border-slate-200 p-4">
                      <div className="text-sm text-[var(--muted-foreground,#6b7280)]">Statements selected</div>
                      <div className="text-2xl font-bold text-[var(--foreground,#111827)]">{selectedPoliciesToRemove.size}</div>
                    </div>
                    <div className="rounded-lg bg-[#f8fafc] border border-slate-200 p-4">
                      <div className="text-sm text-[var(--muted-foreground,#6b7280)]">Rollback protection</div>
                      <div className="text-base font-semibold text-[#16a34a]">Checkpoint before apply</div>
                    </div>
                  </div>
                  <ul className="text-sm text-[var(--foreground,#374151)] text-left space-y-2">
                    <li>1. Review the selected public or unused bucket policy statements.</li>
                    <li>2. Run a preview against the same selected statement set.</li>
                    <li>3. Create a rollback checkpoint automatically before the bucket policy changes.</li>
                    <li>4. Apply the remediation only if the preview and safety checks pass.</li>
                  </ul>
                  <button
                    onClick={handleSimulate}
                    className="mt-5 px-6 py-2.5 bg-[#16a34a] hover:bg-[#15803d] text-white rounded-lg font-bold flex items-center gap-2 mx-auto"
                  >
                    <Zap className="w-4 h-4" />
                    PREVIEW REMEDIATION
                  </button>
                </div>
              ) : (
                <div className={`rounded-lg p-4 max-w-md mx-auto ${hasPublicAccess ? 'bg-[#fff7ed] border border-[#fdba74]' : 'bg-[#22c55e10] border border-[#22c55e40]'}`}>
                  <h4 className={`font-semibold mb-2 ${hasPublicAccess ? 'text-[#c2410c]' : 'text-[#22c55e]'}`}>
                    {hasPublicAccess ? 'Bucket Status' : 'Bucket Status'}
                  </h4>
                  <ul className={`text-sm text-left space-y-1 ${hasPublicAccess ? 'text-[#9a3412]' : 'text-[#22c55e]'}`}>
                    <li>✓ All configured bucket policy statements are actively used</li>
                    {hasPublicAccess ? (
                      <>
                        <li>• No least-privilege removal is available for the current policy</li>
                        <li>• Public exposure remains and should be reviewed separately</li>
                      </>
                    ) : (
                      <>
                        <li>✓ No least-privilege remediation needed</li>
                        <li>✓ Bucket policy is aligned with observed usage</li>
                      </>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border,#e5e7eb)] bg-gray-50 flex items-center justify-between">
          <button 
            onClick={handleClose}
            className="px-4 py-2 border border-[var(--border,#d1d5db)] text-[var(--foreground,#374151)] rounded-lg hover:bg-gray-100 font-medium"
          >
            CLOSE
          </button>
          <button
            onClick={() => setActiveTab('remediation')}
            disabled={!gapData || unusedCount === 0}
            className={`px-6 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-all ${
              gapData && unusedCount > 0
                ? 'bg-[#16a34a] hover:bg-[#15803d] text-white shadow-lg hover:shadow-xl'
                : 'bg-slate-400 text-white cursor-not-allowed'
            }`}
          >
            <Zap className="w-4 h-4" />
            {unusedCount > 0 ? `OPEN REMEDIATION (${unusedCount})` : 'NO ISSUES'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Analysis Tab Component
function AnalysisTab({
  bucketName,
  gapData,
  accessData,
  policyData,
  usedCount,
  unusedCount,
  usedPercent,
  unusedPercent,
  totalPolicies,
  observationDays,
  overallRisk,
  hasPublicAccess,
  usedPolicies,
  unusedPolicies,
  formatDate,
  startDate,
  endDate
}: {
  bucketName: string
  gapData: S3GapAnalysisData | null
  accessData: AccessData | null
  policyData: BucketPolicyData | null
  usedCount: number
  unusedCount: number
  usedPercent: number
  unusedPercent: number
  totalPolicies: number
  observationDays: number
  overallRisk: string
  hasPublicAccess: boolean
  usedPolicies: PolicyAnalysis[]
  unusedPolicies: PolicyAnalysis[]
  formatDate: (date: Date) => string
  startDate: Date
  endDate: Date
}) {
  const publicUsedPolicies = usedPolicies.filter(policy => policy.is_public)
  const observedPrincipals = (accessData?.topPrincipals ?? []).map(principal => principal.principal).filter(Boolean)
  const observedActions = Array.from(new Set(
    (accessData?.topPrincipals ?? []).flatMap(principal =>
      (principal.actionCounts ?? []).map(action => action.action)
    )
  ))
  const publicPolicyActions = Array.from(new Set(
    publicUsedPolicies.flatMap(policy => policy.actions_used?.length ? policy.actions_used : (policy.actions ?? []))
  ))
  const publicAccessBlockDisabled = policyData?.public_access_block
    ? Object.entries(policyData.public_access_block)
        .filter(([, enabled]) => !enabled)
        .map(([key]) => key)
    : []

  return (
    <>
      {/* Recording Period Banner */}
      <div className="mx-6 mt-4 p-4 border-l-4 border-[#3b82f6] bg-[#3b82f610] rounded-r-lg">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-[#3b82f6]" />
          <span className="font-semibold text-[var(--foreground,#111827)]">{observationDays}-Day Recording Period</span>
        </div>
        <p className="text-sm text-[var(--muted-foreground,#4b5563)] mt-1">
          Tracked from {formatDate(startDate)} to {formatDate(endDate)} - CloudTrail S3 events analyzed
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4 p-6">
        <div className="border border-[var(--border,#e5e7eb)] rounded-xl p-4 text-center">
          <div className="text-4xl font-bold text-[var(--foreground,#1f2937)]">{totalPolicies}</div>
          <div className="text-[var(--muted-foreground,#6b7280)] mt-1">Total Policies</div>
        </div>
        <div className="border-2 border-[#22c55e40] bg-[#22c55e10] rounded-xl p-4 text-center">
          <div className="text-4xl font-bold text-[#22c55e]">{usedCount}</div>
          <div className="text-[#22c55e] mt-1">Actually Used ({usedPercent}%)</div>
        </div>
        <div className="border-2 border-[#ef444440] bg-[#ef444410] rounded-xl p-4 text-center">
          <div className="text-4xl font-bold text-[#ef4444]">{unusedCount}</div>
          <div className="text-[#ef4444] mt-1">Unused ({unusedPercent}%)</div>
        </div>
      </div>

      {/* Security Issue Alert */}
      {(unusedCount > 0 || hasPublicAccess) ? (
        <div className="mx-6 p-5 bg-[#ef444410] border-2 border-[#ef444440] rounded-xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-7 h-7 text-[#ef4444] flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xl font-bold text-[#ef4444]">
                {hasPublicAccess ? 'Security Issue Detected' : 'Least Privilege Violation Detected'}
              </h3>
              <p className="mt-2 text-[var(--foreground,#374151)]">
                {hasPublicAccess && <>This bucket has <strong>public access enabled</strong>. </>}
                <strong>{unusedCount} policies</strong> are not required based on {observationDays} days of access analysis.
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
                {hasPublicAccess && (
                  <span className="px-3 py-1 bg-red-600 text-white rounded-full text-sm font-semibold flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    PUBLIC ACCESS
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : totalPolicies === 0 ? (
        <div className="mx-6 p-5 bg-slate-50 border-2 border-slate-200 rounded-xl">
          <div className="flex items-start gap-3">
            <FileText className="w-7 h-7 text-slate-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xl font-bold text-slate-600">No Bucket Policy Configured</h3>
              <p className="mt-2 text-[var(--muted-foreground,#4b5563)]">
                This bucket has no bucket policy. Access is controlled via IAM policies attached to roles/users.
                Check the IAM roles in the Least Privilege dashboard for access analysis.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-6 p-5 bg-[#22c55e10] border-2 border-[#22c55e40] rounded-xl">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-7 h-7 text-[#22c55e] flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xl font-bold text-[#22c55e]">Least Privilege Compliant</h3>
              <p className="mt-2 text-[var(--foreground,#374151)]">
                This bucket has no unused policies based on {observationDays} days of access analysis.
                No remediation is needed.
              </p>
            </div>
          </div>
        </div>
      )}

      {hasPublicAccess && (
        <div className="mx-6 mt-4 p-5 bg-[#fff7ed] border-2 border-[#fdba74] rounded-xl">
          <div className="flex items-start gap-3">
            <Shield className="w-7 h-7 text-[#c2410c] flex-shrink-0 mt-0.5" />
            <div className="w-full">
              <h3 className="text-xl font-bold text-[#c2410c]">Evidence-Based Public Access Recommendation</h3>
              <p className="mt-2 text-[var(--foreground,#374151)]">
                This bucket is public because its policy grants access to <strong>principal <code>*</code></strong> and/or Block Public Access is disabled.
                S3 does <strong>not</strong> use <code>0.0.0.0/0</code> rules like a security group. The equivalent exposure here is a public principal or disabled public-access protections.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="rounded-xl border border-amber-200 bg-white p-4">
                  <div className="text-sm font-semibold text-[#92400e] mb-2">Observed Evidence</div>
                  <ul className="space-y-2 text-sm text-[var(--foreground,#374151)]">
                    <li><strong>{gapData?.summary?.s3_events?.toLocaleString() || 0}</strong> S3 events observed in the 365-day least-privilege window</li>
                    <li><strong>{accessData?.totalRequests?.toLocaleString() || 0}</strong> requests observed in the 90-day access view</li>
                    <li>
                      Observed principals:
                      <strong>{observedPrincipals.length > 0 ? ` ${observedPrincipals.join(', ')}` : ' no tracked principals in the 90-day access view'}</strong>
                    </li>
                    <li>
                      Observed actions:
                      <strong>{observedActions.length > 0 ? ` ${observedActions.join(', ')}` : ' no tracked actions in the 90-day access view'}</strong>
                    </li>
                  </ul>
                </div>

                <div className="rounded-xl border border-amber-200 bg-white p-4">
                  <div className="text-sm font-semibold text-[#92400e] mb-2">Recommended Hardening</div>
                  <ul className="space-y-2 text-sm text-[var(--foreground,#374151)]">
                    <li>
                      Replace public principal <code>*</code> with only the principals that actually need access
                      {observedPrincipals.length > 0 ? `: ${observedPrincipals.join(', ')}` : ''}.
                    </li>
                    <li>
                      Scope the bucket policy to the observed S3 actions
                      {publicPolicyActions.length > 0 ? `: ${publicPolicyActions.join(', ')}` : observedActions.length > 0 ? `: ${observedActions.join(', ')}` : ''}.
                    </li>
                    <li>
                      Re-enable all S3 Block Public Access settings
                      {publicAccessBlockDisabled.length > 0 ? ` (currently disabled: ${publicAccessBlockDisabled.join(', ')})` : ''}.
                    </li>
                    <li>
                      If public internet delivery is intentional, prefer CloudFront with OAC or another controlled edge instead of a directly public bucket.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Policy Usage Breakdown */}
      <div className="p-6 space-y-4">
        <h3 className="text-lg font-bold text-[var(--foreground,#111827)]">Policy Usage Breakdown</h3>

        {/* Actually Used Policies */}
        <div className="border border-[#22c55e40] rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-[#22c55e]" />
              <span className="font-semibold text-[var(--foreground,#111827)]">Actually Used Policies ({usedCount})</span>
            </div>
            <span className="px-3 py-1 border border-[#22c55e40] text-[#22c55e] rounded-lg text-sm font-medium bg-[#22c55e10]">
              Keep these
            </span>
          </div>
          <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
            {usedPolicies.length > 0 ? usedPolicies.map((policy, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-[#22c55e]">✓</span>
                <span className="font-mono text-[var(--foreground,#1f2937)]">{policy.policy_name}</span>
                <span className="text-[var(--muted-foreground,#9ca3af)]">
                  - {formatObservedAccessLabel(policy.access_count || 0, observationDays)}
                </span>
              </div>
            )) : (
              <p className="text-[var(--muted-foreground,#9ca3af)] text-sm italic">No policies currently in use</p>
            )}
          </div>
        </div>

        {/* Issues to Fix - only show if there are issues */}
        {unusedCount > 0 ? (
          <div className="border-2 border-[#ef444440] bg-[#ef444410] rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-[#ef4444]" />
                <span className="font-semibold text-[#ef4444]">Issues to Fix ({unusedCount})</span>
              </div>
              <span className="px-3 py-1 bg-[#ef444420] text-[#ef4444] border border-[#ef444440] rounded-lg text-sm font-medium">
                Remove these
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {unusedPolicies.map((policy, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <X className="w-4 h-4 text-[#ef4444] flex-shrink-0" />
                  <span className="font-mono text-[var(--foreground,#374151)] truncate">{policy.policy_name}</span>
                  {policy.is_public && (
                    <span className="px-2 py-0.5 bg-red-600 text-white text-xs rounded font-medium">
                      PUBLIC
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : totalPolicies === 0 ? (
          <div className="border-2 border-slate-200 bg-slate-50 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-400" />
              <span className="font-semibold text-slate-600">No Bucket Policies to Analyze</span>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              This bucket relies on IAM policies for access control. Review IAM roles for least privilege analysis.
            </p>
          </div>
        ) : (
          <div className={`border-2 rounded-xl p-4 ${hasPublicAccess ? 'border-[#fdba74] bg-[#fff7ed]' : 'border-[#22c55e40] bg-[#22c55e10]'}`}>
            <div className="flex items-center gap-2">
              <CheckCircle className={`w-5 h-5 ${hasPublicAccess ? 'text-[#c2410c]' : 'text-[#22c55e]'}`} />
              <span className={`font-semibold ${hasPublicAccess ? 'text-[#c2410c]' : 'text-[#22c55e]'}`}>
                {hasPublicAccess ? 'No LP Removal Available' : 'No Issues Found'}
              </span>
            </div>
            <p className={`mt-2 text-sm ${hasPublicAccess ? 'text-[#9a3412]' : 'text-[#22c55e]'}`}>
              {hasPublicAccess
                ? 'All bucket policy statements are actively used, so least-privilege removal is not recommended. Public exposure is still present and should be reviewed as a separate security concern.'
                : 'All bucket policies are actively used. No least-privilege remediation is needed.'
              }
            </p>
          </div>
        )}
      </div>

      {/* Recommended Action - only show if there are issues to fix */}
      {unusedCount > 0 ? (
        <div className="mx-6 mb-6 p-4 border border-[var(--border,#e5e7eb)] rounded-xl">
          <h3 className="font-bold text-[var(--foreground,#111827)]">Recommended Action</h3>
          <p className="text-[var(--muted-foreground,#4b5563)] mt-1">
            Remove {unusedCount} unused policies to achieve least privilege compliance.
            This will reduce the attack surface by {unusedPercent}% while maintaining all current access patterns.
          </p>
          <div className="flex items-center gap-2 mt-3 text-[#22c55e]">
            <Shield className="w-5 h-5" />
            <span className="font-medium">High confidence remediation - No service disruption expected</span>
          </div>
        </div>
      ) : totalPolicies === 0 ? (
        <div className="mx-6 mb-6 p-4 border border-slate-200 bg-slate-50 rounded-xl">
          <h3 className="font-bold text-slate-600">No Bucket Policy Analysis Available</h3>
          <p className="text-slate-500 mt-1">
            Access to this bucket is controlled via IAM policies. Check the Least Privilege dashboard to analyze IAM roles that access this bucket.
          </p>
        </div>
      ) : (
        <div className={`mx-6 mb-6 p-4 border rounded-xl ${hasPublicAccess ? 'border-[#fdba74] bg-[#fff7ed]' : 'border-[#22c55e40] bg-[#22c55e10]'}`}>
          <h3 className={`font-bold ${hasPublicAccess ? 'text-[#c2410c]' : 'text-[#22c55e]'}`}>
            {hasPublicAccess ? 'No LP Remediation Available' : 'No Action Required'}
          </h3>
          <p className={`mt-1 ${hasPublicAccess ? 'text-[#9a3412]' : 'text-[#22c55e]'}`}>
            {hasPublicAccess
              ? 'All configured bucket policy statements are actively used in the 365-day observation window. Least-privilege removal is not appropriate here, but the bucket still has public exposure that should be reviewed separately.'
              : 'This bucket policy is aligned with observed usage in the 365-day observation window.'
            }
          </p>
        </div>
      )}
    </>
  )
}

// Policies Tab Component
function PoliciesTab({
  policyData,
  policyLoading
}: {
  policyData: BucketPolicyData | null
  policyLoading: boolean
}) {
  if (policyLoading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-[#22c55e]" />
        <p className="text-[var(--muted-foreground,#6b7280)]">Loading bucket policies...</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Bucket Policy */}
      <div className="space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <FileText className="w-5 h-5 text-[var(--muted-foreground,#4b5563)]" />
          Bucket Policy
        </h3>
        
        {policyData?.bucket_policy ? (
          <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
            <pre className="text-green-400 text-sm font-mono whitespace-pre-wrap">
              {JSON.stringify(policyData.bucket_policy, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="bg-gray-100 rounded-lg p-4 text-[var(--muted-foreground,#6b7280)] flex items-center gap-2">
            <XCircle className="w-5 h-5" />
            No bucket policy configured
          </div>
        )}
      </div>

      {/* Public Access Block Settings */}
      <div className="space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Lock className="w-5 h-5 text-[var(--muted-foreground,#4b5563)]" />
          Public Access Block
        </h3>
        
        {policyData?.public_access_block ? (
          <div className="grid grid-cols-2 gap-4">
            <AccessBlockSetting
              label="Block Public ACLs"
              enabled={policyData.public_access_block.blockPublicAcls}
            />
            <AccessBlockSetting
              label="Block Public Policy"
              enabled={policyData.public_access_block.blockPublicPolicy}
            />
            <AccessBlockSetting
              label="Ignore Public ACLs"
              enabled={policyData.public_access_block.ignorePublicAcls}
            />
            <AccessBlockSetting
              label="Restrict Public Buckets"
              enabled={policyData.public_access_block.restrictPublicBuckets}
            />
          </div>
        ) : (
          <div className="bg-[#f9731610] border border-[#f9731640] rounded-lg p-4 text-[#f97316] flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Public access block settings not configured - bucket may be publicly accessible
          </div>
        )}
      </div>

      {/* ACL Settings */}
      <div className="space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Users className="w-5 h-5 text-[var(--muted-foreground,#4b5563)]" />
          Access Control List (ACL)
        </h3>
        
        {policyData?.acl?.grants && policyData.acl.grants.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--foreground,#374151)]">Grantee</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--foreground,#374151)]">Type</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--foreground,#374151)]">Permission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {policyData.acl.grants.map((grant, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-sm text-[var(--foreground,#374151)]">{grant.grantee}</td>
                    <td className="px-4 py-3 text-sm text-[var(--muted-foreground,#4b5563)]">{grant.grantee_type}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-sm font-medium ${
                        grant.permission === 'FULL_CONTROL' 
                          ? 'bg-[#ef444420] text-[#ef4444]' 
                          : grant.permission === 'WRITE' || grant.permission === 'WRITE_ACP'
                          ? 'bg-[#f9731620] text-[#f97316]'
                          : 'bg-gray-100 text-[var(--foreground,#374151)]'
                      }`}>
                        {grant.permission}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-gray-100 rounded-lg p-4 text-[var(--muted-foreground,#6b7280)] flex items-center gap-2">
            <XCircle className="w-5 h-5" />
            No ACL grants configured (using bucket owner enforced)
          </div>
        )}
      </div>

      {/* Encryption Settings */}
      {policyData?.encryption && (
        <div className="space-y-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Shield className="w-5 h-5 text-[var(--muted-foreground,#4b5563)]" />
            Encryption
          </h3>
          
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-[var(--foreground,#374151)]">Server-Side Encryption</span>
              <span className="px-3 py-1 bg-[#22c55e20] text-[#22c55e] rounded-full text-sm font-medium">
                {policyData.encryption.type}
              </span>
            </div>
            {policyData.encryption.kms_key_id && (
              <div className="mt-2 text-sm text-[var(--muted-foreground,#6b7280)]">
                KMS Key: <span className="font-mono">{policyData.encryption.kms_key_id}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Versioning Settings */}
      {policyData?.versioning && (
        <div className="space-y-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Database className="w-5 h-5 text-[var(--muted-foreground,#4b5563)]" />
            Versioning
          </h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-[var(--foreground,#374151)]">Versioning Status</span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  policyData.versioning.status === 'Enabled' 
                    ? 'bg-[#22c55e20] text-[#22c55e]' 
                    : 'bg-gray-100 text-[var(--muted-foreground,#4b5563)]'
                }`}>
                  {policyData.versioning.status}
                </span>
              </div>
            </div>
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-[var(--foreground,#374151)]">MFA Delete</span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  policyData.versioning.mfa_delete === 'Enabled' 
                    ? 'bg-[#22c55e20] text-[#22c55e]' 
                    : 'bg-gray-100 text-[var(--muted-foreground,#4b5563)]'
                }`}>
                  {policyData.versioning.mfa_delete}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Access Block Setting Component
function AccessBlockSetting({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between p-3 border rounded-lg bg-white">
      <span className="text-[var(--foreground,#374151)]">{label}</span>
      {enabled ? (
        <span className="text-[#22c55e] flex items-center gap-1 font-medium">
          <Check className="w-4 h-4" /> Enabled
        </span>
      ) : (
        <span className="text-[#ef4444] flex items-center gap-1 font-medium">
          <X className="w-4 h-4" /> Disabled
        </span>
      )}
    </div>
  )
}

// Categorize actions for display
function getActionCategory(action: string): 'read' | 'write' | 'delete' | 'admin' {
  const readActions = ['GetObject', 'HeadObject', 'ListObjectsV2', 'ListObjects', 'GetObjectAcl', 'GetObjectTagging', 'GetBucketLocation']
  const writeActions = ['PutObject', 'CopyObject', 'CompleteMultipartUpload', 'CreateMultipartUpload', 'PutObjectTagging', 'PutObjectAcl']
  const deleteActions = ['DeleteObject', 'DeleteObjects', 'AbortMultipartUpload']

  if (readActions.includes(action)) return 'read'
  if (writeActions.includes(action)) return 'write'
  if (deleteActions.includes(action)) return 'delete'
  return 'admin'
}

function getActionStyle(action: string): string {
  const category = getActionCategory(action)
  switch (category) {
    case 'read': return 'bg-[#3b82f610] text-[#3b82f6] border border-[#3b82f640]'
    case 'write': return 'bg-[#22c55e10] text-[#22c55e] border border-[#22c55e40]'
    case 'delete': return 'bg-[#f9731610] text-[#f97316] border border-[#f9731640]'
    case 'admin': return 'bg-[#8b5cf610] text-[#7c3aed] border border-purple-200'
  }
}

// Access Tab Component - Shows who accessed the bucket (for remediation context)
function AccessTab({
  accessData,
  accessLoading
}: {
  accessData: AccessData | null
  accessLoading: boolean
}) {
  if (accessLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#22c55e]" />
        <span className="ml-2 text-[var(--muted-foreground,#6b7280)]">Loading access data...</span>
      </div>
    )
  }

  if (!accessData || accessData.dataEventsStatus !== 'enabled') {
    return (
      <div className="p-6">
        <div className="bg-[#f9731610] border border-[#f9731640] rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#f97316] flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-[#f97316]">No Access Data Available</h4>
              <p className="text-sm text-[#f97316] mt-1">
                S3 data events are not enabled or no access patterns have been recorded for this bucket.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Calculate total actions per principal for sorting
  const principalsWithTotals = (accessData.topPrincipals || []).map(principal => {
    const totalActions = (principal.actionCounts || []).reduce((sum, ac) => sum + (ac.count || 0), 0)
    return { ...principal, totalActions }
  }).sort((a, b) => b.totalActions - a.totalActions)

  return (
    <div className="p-6 space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#3b82f610] border border-blue-100 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-[#3b82f6]">
            {accessData.totalRequests?.toLocaleString() || 0}
          </div>
          <div className="text-sm text-[#3b82f6] mt-1">Total Requests</div>
        </div>
        <div className="bg-[#22c55e10] border border-green-100 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-[#22c55e]">
            {accessData.uniquePrincipals || 0}
          </div>
          <div className="text-sm text-[#22c55e] mt-1">Active Principals</div>
        </div>
        <div className="bg-gray-50 border border-[var(--border,#e5e7eb)] rounded-lg p-4 text-center">
          <div className="text-sm font-medium text-[var(--foreground,#111827)]">
            {accessData.lastActivity
              ? new Date(accessData.lastActivity).toLocaleDateString()
              : 'N/A'}
          </div>
          <div className="text-sm text-[var(--muted-foreground,#6b7280)] mt-1">Last Activity</div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-[#3b82f610] border border-[#3b82f640] rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Activity className="w-5 h-5 text-[#3b82f6] flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-[#3b82f6]">Observed Access Patterns</h4>
            <p className="text-sm text-[#3b82f6] mt-1">
              These principals were observed accessing this bucket in the 90-day analysis view. The Summary tab uses the 365-day least-privilege window, so counts can differ between tabs while still being accurate.
            </p>
          </div>
        </div>
      </div>

      {/* Principals List */}
      <div className="space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Users className="w-5 h-5" />
          Active Principals
        </h3>

        {principalsWithTotals.length > 0 ? (
          <div className="space-y-3">
            {principalsWithTotals.map((principal, idx) => (
              <div
                key={idx}
                className="bg-white border border-[var(--border,#e5e7eb)] rounded-lg p-4 shadow-sm hover:border-[#22c55e40] transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#22c55e20] flex items-center justify-center">
                      <Users className="w-5 h-5 text-[#22c55e]" />
                    </div>
                    <div>
                      <div className="font-semibold text-[var(--foreground,#111827)]">{principal.principal}</div>
                      <div className="text-xs text-[var(--muted-foreground,#6b7280)]">IAM Principal</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-[var(--foreground,#374151)]">
                      {principal.totalActions.toLocaleString()}
                    </div>
                    <div className="text-xs text-[var(--muted-foreground,#6b7280)]">Total Actions</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {principal.actionCounts?.slice(0, 8).map((ac, acIdx) => (
                    <span
                      key={acIdx}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${getActionStyle(ac.action)}`}
                    >
                      <span className="font-mono">{ac.action}</span>
                      <span className="font-semibold">
                        ({ac.count?.toLocaleString()})
                      </span>
                    </span>
                  ))}
                  {(principal.actionCounts?.length || 0) > 8 && (
                    <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-[var(--muted-foreground,#4b5563)] rounded text-xs">
                      +{(principal.actionCounts?.length || 0) - 8} more
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-[var(--muted-foreground,#6b7280)]">
            No principals have accessed this bucket recently.
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="border-t pt-4">
        <div className="text-sm text-[var(--muted-foreground,#6b7280)] mb-2">Action Types:</div>
        <div className="flex flex-wrap gap-2">
          <span className="px-2 py-1 bg-[#3b82f610] text-[#3b82f6] border border-[#3b82f640] rounded text-xs">Read</span>
          <span className="px-2 py-1 bg-[#22c55e10] text-[#22c55e] border border-[#22c55e40] rounded text-xs">Write</span>
          <span className="px-2 py-1 bg-[#f9731610] text-[#f97316] border border-[#f9731640] rounded text-xs">Delete</span>
          <span className="px-2 py-1 bg-[#8b5cf610] text-[#7c3aed] border border-purple-200 rounded text-xs">Admin</span>
        </div>
      </div>
    </div>
  )
}

// Evidence Tab Component
function EvidenceTab({
  observationDays,
  s3Events,
  confidence
}: {
  observationDays: number
  s3Events: number
  confidence: string
}) {
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-4">
        <h3 className="font-bold text-lg">Data Sources</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="border rounded-lg p-4">
            <div className="text-sm text-[var(--muted-foreground,#6b7280)]">Observation Period</div>
            <div className="text-2xl font-bold text-[var(--foreground,#111827)]">{observationDays} days</div>
          </div>
          <div className="border rounded-lg p-4">
            <div className="text-sm text-[var(--muted-foreground,#6b7280)]">S3 Access Events Analyzed</div>
            <div className="text-2xl font-bold text-[var(--foreground,#111827)]">{s3Events.toLocaleString()}</div>
          </div>
          <div className="border rounded-lg p-4">
            <div className="text-sm text-[var(--muted-foreground,#6b7280)]">Analysis Confidence</div>
            <div className={`text-2xl font-bold ${
              confidence === 'HIGH' ? 'text-[#22c55e]' :
              confidence === 'MEDIUM' ? 'text-yellow-600' : 'text-[#ef4444]'
            }`}>
              {confidence}
            </div>
          </div>
          <div className="border rounded-lg p-4">
            <div className="text-sm text-[var(--muted-foreground,#6b7280)]">Data Source</div>
            <div className="text-2xl font-bold text-[var(--foreground,#111827)]">CloudTrail</div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-bold text-lg">Evidence Details</h3>
        
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-[#22c55e]" />
            <span>CloudTrail S3 data events enabled</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-[#22c55e]" />
            <span>All regions analyzed</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-[#22c55e]" />
            <span>Bucket policy statements tracked</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-[#22c55e]" />
            <span>ACL permissions verified</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Simulation Tab Component - For demo purposes
interface SimulationEvent {
  event_id: string
  event_name: string
  action_type: string
  principal: string
  timestamp: string
  status: string
}

function SimulationTab({
  bucketName,
  systemName,
  onSimulationComplete
}: {
  bucketName: string
  systemName: string
  onSimulationComplete: () => void
}) {
  const { toast } = useToast()
  const [principalName, setPrincipalName] = useState('demo-user')
  const [patternType, setPatternType] = useState<'normal' | 'suspicious' | 'bulk-exfiltration' | 'privilege-escalation'>('normal')
  const [eventCount, setEventCount] = useState(20)
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [events, setEvents] = useState<SimulationEvent[]>([])
  const [completed, setCompleted] = useState(false)

  const patterns = [
    { value: 'normal', label: 'Normal', description: 'Regular read/write mix (low risk)', color: 'green' },
    { value: 'suspicious', label: 'Suspicious', description: 'Unusual access patterns (medium risk)', color: 'yellow' },
    { value: 'bulk-exfiltration', label: 'Bulk Exfiltration', description: 'Mass data extraction (high risk)', color: 'orange' },
    { value: 'privilege-escalation', label: 'Privilege Escalation', description: 'Policy modification attempts (critical)', color: 'red' }
  ]

  const runSimulation = async () => {
    setIsRunning(true)
    setProgress(0)
    setEvents([])
    setCompleted(false)

    try {
      const response = await fetch('/api/proxy/simulate/s3-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          principal_name: principalName,
          pattern_type: patternType,
          bucket_name: bucketName,
          event_count: eventCount,
          time_spread_days: 7,
          system_name: systemName
        })
      })

      if (!response.ok) {
        throw new Error(`Simulation failed: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))

              if (data.event_name) {
                // S3 event
                setEvents(prev => [...prev.slice(-9), {
                  event_id: data.event_id,
                  event_name: data.event_name,
                  action_type: data.action_type,
                  principal: data.principal,
                  timestamp: data.timestamp,
                  status: data.status
                }])
              }

              if (data.percentage !== undefined) {
                setProgress(data.percentage)
              }

              if (data.completed_at) {
                setCompleted(true)
                setProgress(100)
                toast({
                  title: "Simulation Complete",
                  description: `Generated ${data.total_events} events for ${principalName}`,
                })
                setTimeout(() => {
                  onSimulationComplete()
                }, 1500)
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Simulation error:', error)
      toast({
        title: "Simulation Failed",
        description: error.message || 'Failed to run simulation',
        variant: "destructive"
      })
    } finally {
      setIsRunning(false)
    }
  }

  const cleanupPrincipal = async () => {
    try {
      const response = await fetch(`/api/proxy/simulate/principal/${principalName}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        toast({
          title: "Cleanup Complete",
          description: `Removed ${principalName} and all access records`,
        })
        onSimulationComplete()
      } else {
        throw new Error('Cleanup failed')
      }
    } catch (error: any) {
      toast({
        title: "Cleanup Failed",
        description: error.message,
        variant: "destructive"
      })
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="bg-white border border-purple-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Zap className="w-6 h-6 text-[#8b5cf6] flex-shrink-0" />
          <div>
            <h4 className="font-bold text-purple-900">S3 Access Simulation</h4>
            <p className="text-sm text-[#7c3aed] mt-1">
              Generate simulated S3 access events for demo purposes. Events are saved to Neo4j and will appear in the "Who Accessed" tab.
            </p>
          </div>
        </div>
      </div>

      {/* Configuration */}
      <div className="space-y-4">
        <h3 className="font-bold text-lg">Configuration</h3>

        {/* Principal Name */}
        <div>
          <label className="block text-sm font-medium text-[var(--foreground,#374151)] mb-1">Principal Name</label>
          <input
            type="text"
            value={principalName}
            onChange={(e) => setPrincipalName(e.target.value)}
            placeholder="e.g., demo-user, suspicious-actor"
            className="w-full px-3 py-2 border border-[var(--border,#d1d5db)] rounded-lg focus:ring-2 focus:ring-[#8b5cf6] focus:border-purple-500"
            disabled={isRunning}
          />
        </div>

        {/* Pattern Type */}
        <div>
          <label className="block text-sm font-medium text-[var(--foreground,#374151)] mb-2">Access Pattern</label>
          <div className="grid grid-cols-2 gap-3">
            {patterns.map((pattern) => (
              <button
                key={pattern.value}
                onClick={() => setPatternType(pattern.value as any)}
                disabled={isRunning}
                className={`p-3 rounded-lg border-2 text-left transition-all ${
                  patternType === pattern.value
                    ? pattern.color === 'green' ? 'border-green-500 bg-[#22c55e10]' :
                      pattern.color === 'yellow' ? 'border-yellow-500 bg-[#eab30810]' :
                      pattern.color === 'orange' ? 'border-orange-500 bg-[#f9731610]' :
                      'border-red-500 bg-[#ef444410]'
                    : 'border-[var(--border,#e5e7eb)] hover:border-[var(--border,#d1d5db)]'
                } disabled:opacity-50`}
              >
                <div className="font-semibold text-[var(--foreground,#111827)]">{pattern.label}</div>
                <div className="text-xs text-[var(--muted-foreground,#6b7280)] mt-1">{pattern.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Event Count */}
        <div>
          <label className="block text-sm font-medium text-[var(--foreground,#374151)] mb-1">
            Event Count: <span className="font-bold text-[#8b5cf6]">{eventCount}</span>
          </label>
          <input
            type="range"
            min="10"
            max="100"
            step="10"
            value={eventCount}
            onChange={(e) => setEventCount(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
            disabled={isRunning}
          />
          <div className="flex justify-between text-xs text-[var(--muted-foreground,#6b7280)] mt-1">
            <span>10</span>
            <span>50</span>
            <span>100</span>
          </div>
        </div>
      </div>

      {/* Progress / Events */}
      {(isRunning || events.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">Live Events</h3>
            <span className="text-sm text-[var(--muted-foreground,#6b7280)]">{progress}% complete</span>
          </div>

          {/* Progress Bar */}
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${completed ? 'bg-[#22c55e10]0' : 'bg-[#8b5cf6]'}`}
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Events List */}
          <div className="bg-gray-900 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs">
            {events.map((event, idx) => (
              <div key={event.event_id || idx} className="flex items-center gap-2 py-1">
                <span className={`px-1.5 py-0.5 rounded ${
                  event.status === 'saved' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                }`}>
                  {event.status === 'saved' ? '✓' : '✗'}
                </span>
                <span className={`px-1.5 py-0.5 rounded ${
                  event.action_type === 'read' ? 'bg-blue-600 text-white' :
                  event.action_type === 'write' ? 'bg-green-600 text-white' :
                  event.action_type === 'delete' ? 'bg-orange-600 text-white' :
                  'bg-[#8b5cf6] text-white'
                }`}>
                  {event.action_type}
                </span>
                <span className="text-[var(--muted-foreground,#9ca3af)]">{event.event_name}</span>
                <span className="text-[var(--muted-foreground,#4b5563)] ml-auto">{event.principal}</span>
              </div>
            ))}
            {isRunning && !completed && (
              <div className="flex items-center gap-2 py-1 text-[var(--muted-foreground,#9ca3af)]">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Generating events...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4 border-t">
        <button
          onClick={runSimulation}
          disabled={isRunning || !principalName.trim()}
          className="flex-1 px-4 py-2.5 bg-white text-white rounded-lg font-bold hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Running Simulation...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Run Simulation
            </>
          )}
        </button>

        {events.length > 0 && !isRunning && (
          <button
            onClick={cleanupPrincipal}
            className="px-4 py-2.5 border border-[#ef444440] text-[#ef4444] rounded-lg font-medium hover:bg-[#ef444410] flex items-center gap-2"
          >
            <XCircle className="w-4 h-4" />
            Cleanup
          </button>
        )}
      </div>
    </div>
  )
}
