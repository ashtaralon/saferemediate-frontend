"use client"

import { useState, useEffect } from 'react'
import { Shield, Database, Network, AlertTriangle, CheckCircle2, XCircle, TrendingDown, Clock, FileDown, Send, Zap, ChevronRight, ExternalLink, Loader2, RefreshCw, Search } from 'lucide-react'
import SimulationResultsModal from '@/components/SimulationResultsModal'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'

// Types
interface GapResource {
  id: string
  resourceType: 'IAMRole' | 'SecurityGroup' | 'S3Bucket' | 'NetworkACL'
  resourceName: string
  resourceArn: string
  systemName?: string
  lpScore: number | null  // null for Security Groups (use networkExposure instead)
  allowedCount: number
  usedCount: number | null  // null for Security Groups
  gapCount: number | null  // null for Security Groups
  gapPercent: number | null  // null for Security Groups
  networkExposure?: {
    score: number
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
    totalRules: number
    internetExposedRules: number
    highRiskPorts: number[]
    details: {
      totalIngressRules: number
      totalEgressRules: number
      findingsCount: number
      criticalFindings: number
      highFindings: number
    }
  }
  allowedList: string[]
  usedList: string[]
  unusedList: string[]
  highRiskUnused: Array<{
    permission: string
    riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM'
    reason: string
  }>
  evidence: {
    dataSources: string[]
    observationDays: number
    confidence: 'HIGH' | 'MEDIUM' | 'LOW'
    lastUsed?: string
    coverage: {
      regions: string[]
      complete: boolean
    }
    rule_states?: Array<{
      port: number | string
      protocol?: string
      cidr?: string
      exposed: boolean
      observed_usage?: boolean
      recommendation?: string
      note?: string
      data_source?: string
      confidence?: number
      connections?: number
      last_seen?: string
    }>
    flowlogs?: {
      total_flows?: number
      matched_flows?: number
      enis_checked?: number
      log_groups_checked?: number
      lookback_days?: number
    } | null
    resourcePolicies?: {
      total_resources_checked?: number
      matching_policies?: Array<{
        resource_type: string
        resource_name?: string
        resource_arn?: string
      }>
      s3_buckets_checked?: number
      kms_keys_checked?: number
      lambda_functions_checked?: number
    } | null
    confidence_breakdown?: Record<string, {
      contribution: number
      max: number
      available: boolean
      description: string
      events?: number
      flows?: number
      resources_checked?: number
    }> | null
  }
  severity: 'critical' | 'high' | 'medium' | 'low'
  confidence: number
  observationDays: number
  title: string
  description: string
  remediation: string
  region?: string  // For Security Groups
}

interface LeastPrivilegeSummary {
  totalResources: number
  totalExcessPermissions: number
  avgLPScore: number
  iamIssuesCount: number
  networkIssuesCount: number
  s3IssuesCount: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  confidenceLevel: number
  observationDays: number
  attackSurfaceReduction: number
}

interface LeastPrivilegeResponse {
  summary: LeastPrivilegeSummary
  resources: GapResource[]
  timestamp: string
}

export default function LeastPrivilegeTab({ systemName = 'alon-prod' }: { systemName?: string }) {
  const [data, setData] = useState<LeastPrivilegeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedResource, setSelectedResource] = useState<GapResource | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [simulationResult, setSimulationResult] = useState<any>(null)
  const [simulationModalOpen, setSimulationModalOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [confirmationModalOpen, setConfirmationModalOpen] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchGaps()
  }, [systemName])

  const fetchGaps = async (showRefreshing = false) => {
    try {
      if (showRefreshing) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setError(null)
      
      const response = await fetch(`/api/proxy/least-privilege/issues?systemName=${systemName}&observationDays=365`)
      if (!response.ok) throw new Error(`Failed: ${response.status}`)
      
      const result = await response.json()
      
      // Log what we received for debugging
      console.log('[LeastPrivilegeTab] Received resources:', {
        total: result.resources?.length || 0,
        byType: {
          IAMRole: result.resources?.filter((r: any) => r.resourceType === 'IAMRole').length || 0,
          SecurityGroup: result.resources?.filter((r: any) => r.resourceType === 'SecurityGroup').length || 0,
          S3Bucket: result.resources?.filter((r: any) => r.resourceType === 'S3Bucket').length || 0
        },
        summary: result.summary
      })
      
      // Transform to new format
      const transformed: LeastPrivilegeResponse = {
        summary: {
          totalResources: result.resources?.length || 0,
          totalExcessPermissions: result.summary?.totalExcessPermissions || 0,
          avgLPScore: result.resources?.length > 0 
            ? result.resources.reduce((acc: number, r: any) => acc + (100 - r.gapPercent), 0) / result.resources.length
            : 100,
          iamIssuesCount: result.summary?.iamIssuesCount || 0,
          networkIssuesCount: result.summary?.networkIssuesCount || 0,
          s3IssuesCount: result.summary?.s3IssuesCount || 0,
          criticalCount: result.summary?.criticalCount || 0,
          highCount: result.summary?.highCount || 0,
          mediumCount: result.summary?.mediumCount || 0,
          lowCount: result.summary?.lowCount || 0,
          confidenceLevel: result.summary?.confidenceLevel || 0,
          observationDays: result.observationDays || 365,
          attackSurfaceReduction: result.resources?.length > 0
            ? result.resources.reduce((acc: number, r: any) => acc + r.gapPercent, 0) / result.resources.length
            : 0
        },
        resources: (result.resources || []).map((r: any) => {
          // For Security Groups, use networkExposure instead of lpScore
          const isSecurityGroup = r.resourceType === 'SecurityGroup'
          const networkExposure = r.networkExposure || null
          
          return {
            id: r.id,
            resourceType: r.resourceType,
            resourceName: r.resourceName,
            resourceArn: r.resourceArn,
            systemName: r.systemName,
            // For Security Groups: lpScore is null, use networkExposure instead
            lpScore: r.lpScore ?? (r.gapPercent !== undefined ? 100 - r.gapPercent : null),
            allowedCount: r.allowedCount || 0,
            usedCount: r.usedCount ?? 0,
            gapCount: r.gapCount ?? 0,
            gapPercent: r.gapPercent ?? 0,
            networkExposure: networkExposure ? {
              score: networkExposure.score || 0,
              severity: networkExposure.severity || 'MEDIUM',
              totalRules: networkExposure.totalRules || 0,
              internetExposedRules: networkExposure.internetExposedRules || 0,
              highRiskPorts: networkExposure.highRiskPorts || [],
              details: networkExposure.details || {
                totalIngressRules: networkExposure.totalRules || 0,
                totalEgressRules: 0,
                findingsCount: 0,
                criticalFindings: 0,
                highFindings: 0
              }
            } : undefined,
            allowedList: r.allowedList || [],
            usedList: r.usedList || [],
            unusedList: r.unusedList || [],
            highRiskUnused: (r.unusedList || []).slice(0, 5).map((perm: string) => ({
              permission: perm,
              riskLevel: perm.includes('PassRole') || perm.includes('Delete') || perm.includes('Admin') ? 'CRITICAL' as const : 'HIGH' as const,
              reason: perm.includes('PassRole') ? 'Privilege escalation risk' : 
                     perm.includes('Delete') ? 'Destructive action' : 'High-risk permission'
            })),
            evidence: {
              dataSources: r.evidence?.dataSources || ['CloudTrail'],
              observationDays: r.observationDays || r.evidence?.observationDays || 365,
              // Confidence levels: HIGH (85%+), MEDIUM (60-84%), LOW (<60%)
              confidence: r.confidence >= 85 ? 'HIGH' as const : r.confidence >= 60 ? 'MEDIUM' as const : 'LOW' as const,
              lastUsed: r.lastUsed,
              coverage: {
                regions: r.evidence?.coverage?.regions || ['us-east-1'],
                complete: r.evidence?.coverage?.complete !== false
              },
              flowlogs: r.evidence?.flowlogs || null,
              resourcePolicies: r.evidence?.resourcePolicies || null,
              confidence_breakdown: r.evidence?.confidence_breakdown || null,
              rule_states: r.evidence?.rule_states || null  // Security Group rule states
            },
            severity: r.severity || 'medium',
            confidence: r.confidence || 0,
            observationDays: r.observationDays || 365,
            title: r.title || (isSecurityGroup 
              ? `${r.resourceName} has network exposure risk`
              : `${r.resourceName} has ${r.gapCount || 0} unused permissions`),
            description: r.description || '',
            remediation: r.remediation || '',
            region: r.evidence?.coverage?.regions?.[0] || r.region || null  // Extract region
          }
        }),
        timestamp: result.timestamp || new Date().toISOString()
      }
      
      setData(transformed)
      
      // Log transformed data
      console.log('[LeastPrivilegeTab] Transformed resources:', {
        total: transformed.resources.length,
        byType: {
          IAMRole: transformed.resources.filter(r => r.resourceType === 'IAMRole').length,
          SecurityGroup: transformed.resources.filter(r => r.resourceType === 'SecurityGroup').length,
          S3Bucket: transformed.resources.filter(r => r.resourceType === 'S3Bucket').length
        }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }
  
  const handleRefresh = async () => {
    await fetchGaps(true)
  }

  // Get default region from resources or use default
  const getDefaultRegion = (): string => {
    if (data?.resources && data.resources.length > 0) {
      const firstRegion = data.resources.find(r => r.region)?.region
      if (firstRegion) return firstRegion
    }
    return 'eu-west-1' // Default region
  }

  const handleAnalyzeSecurityGroups = async () => {
    const region = getDefaultRegion()

    try {
      setAnalyzing(true)

      // Use proxy route for better error handling and timeout management
      const response = await fetch('/api/proxy/security-groups/scan-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          system_name: systemName,
          region: region,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))

        // Handle 404 - backend endpoint not yet implemented
        if (response.status === 404) {
          toast({
            title: 'Feature not available',
            description: 'Security Group deep analysis is not yet available on the backend. Refreshing current data instead.',
          })
          // Still refresh the existing data
          await fetchGaps(true)
          return
        }

        throw new Error(errorData.error || errorData.detail || errorData.message || `Analysis failed: ${response.status}`)
      }

      const result = await response.json()

      toast({
        title: 'Analysis completed',
        description: 'Security Group analysis finished successfully. New issues may be available.',
      })

      // Refresh issues list after analysis
      await fetchGaps(true)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Analysis failed'
      toast({
        title: 'Analysis failed',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setAnalyzing(false)
      setConfirmationModalOpen(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Analyzing least privilege gaps...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-900">Error Loading Data</h3>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!data || data.resources.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <p className="text-lg font-medium text-gray-900">No GAP issues found!</p>
        <p className="text-sm text-gray-500 mt-2">All permissions are being used. Your system follows least privilege! 🎉</p>
      </div>
    )
  }

  const { summary, resources } = data
  const defaultRegion = getDefaultRegion()

  return (
    <div className="space-y-6">
      {/* Confirmation Modal */}
      <Dialog open={confirmationModalOpen} onOpenChange={setConfirmationModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Analyze Security Groups</DialogTitle>
            <DialogDescription className="pt-2">
              This will analyze current Security Group configuration and recent network activity to identify least-privilege violations.
              <br />
              <br />
              <strong>No changes will be applied automatically.</strong>
              <br />
              <span className="text-xs text-gray-500">Note: If deep analysis is not available, existing data will be refreshed.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm font-medium text-gray-600">System:</span>
              <span className="text-sm text-gray-900">{systemName}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm font-medium text-gray-600">Region:</span>
              <span className="text-sm text-gray-900">{defaultRegion}</span>
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setConfirmationModalOpen(false)}
              disabled={analyzing}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAnalyzeSecurityGroups}
              disabled={analyzing}
              className="px-4 py-2 text-sm font-medium text-white bg-gray-700 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {analyzing && <Loader2 className="w-4 h-4 animate-spin" />}
              Start Analysis
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header with LP Score */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Least Privilege Analysis</h1>
          <p className="text-gray-600 mt-1">GAP between ALLOWED and ACTUAL permissions</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setConfirmationModalOpen(true)}
            disabled={analyzing || loading}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2 transition-colors"
            title="Analyze Security Groups configuration and traffic"
          >
            <Search className={`w-4 h-4 ${analyzing ? 'animate-pulse' : ''}`} />
            {analyzing ? 'Analyzing…' : 'Analyze Security Groups'}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2 transition-colors"
            title="Refresh data from backend"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
          <div className="text-right">
            <div className="text-sm text-gray-600">System LP Score</div>
            <div className="text-4xl font-bold" style={{ color: (summary.avgLPScore ?? 0) < 50 ? '#dc2626' : (summary.avgLPScore ?? 0) < 75 ? '#ea580c' : '#10b981' }}>
              {isNaN(summary.avgLPScore) || summary.avgLPScore === null ? (
                <span className="text-gray-500" title="LP Score not applicable for all resource types">—</span>
              ) : (
                <span>{summary.avgLPScore.toFixed(0)}%</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard
          icon={<Shield className="w-5 h-5" />}
          label="Total Resources"
          value={summary.totalResources}
          color="blue"
        />
        <SummaryCard
          icon={<TrendingDown className="w-5 h-5" />}
          label="Excess Permissions"
          value={summary.totalExcessPermissions}
          color="red"
        />
        <SummaryCard
          icon={<Network className="w-5 h-5" />}
          label="Network Issues"
          value={summary.networkIssuesCount}
          color="orange"
        />
        <SummaryCard
          icon={<Clock className="w-5 h-5" />}
          label="Observation Days"
          value={summary.observationDays}
          color="gray"
        />
      </div>

      {/* Resource Type Filter & Stats */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600">
            Showing <strong>{resources.length}</strong> resources:
            <span className="ml-2">
              {resources.filter(r => r.resourceType === 'IAMRole').length} IAM Roles,
              {' '}
              {resources.filter(r => r.resourceType === 'SecurityGroup').length} Security Groups,
              {' '}
              {resources.filter(r => r.resourceType === 'S3Bucket').length} S3 Buckets
            </span>
          </div>
        </div>
        {data.timestamp && (
          <div className="text-xs text-gray-500">
            Last updated: {new Date(data.timestamp).toLocaleString()}
          </div>
        )}
      </div>

      {/* Resources List */}
      <div className="space-y-4">
        {resources.length === 0 ? (
          <div className="text-center py-12 border border-gray-200 rounded-lg bg-gray-50">
            <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No resources found</p>
            <p className="text-sm text-gray-500 mt-2">Try clicking "Refresh Data" to reload from backend</p>
          </div>
        ) : (
          resources.map((resource) => (
            <GapResourceCard
              key={resource.id}
              resource={resource}
              onClick={() => {
                setSelectedResource(resource)
                setDrawerOpen(true)
              }}
            />
          ))
        )}
      </div>

      {/* Remediation Drawer */}
      {drawerOpen && selectedResource && (
        <RemediationDrawer
          resource={selectedResource}
          onClose={() => {
            setDrawerOpen(false)
            setSelectedResource(null)
            setSimulationResult(null)
          }}
          onSimulate={async () => {
            setSimulating(true)
            try {
              const response = await fetch('/api/proxy/simulate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  finding_id: selectedResource.id, // Use resource ARN as finding_id for LP
                  resource_type: selectedResource.resourceType,
                  resource_id: selectedResource.resourceArn || selectedResource.resourceName
                })
              })
              
              if (!response.ok) {
                throw new Error(`Simulation failed: ${response.status}`)
              }
              
              const backendData = await response.json()
              
              // Transform backend response to SimulationResultsModal format
              const simulationData = backendData.simulation || backendData
              const decision = backendData.decision || {}
              
              // Map backend confidence (0-100) to modal format
              const backendConfidence = simulationData.confidence || decision.confidence || 0
              const confidenceValue = typeof backendConfidence === 'number' 
                ? (backendConfidence > 1 ? backendConfidence / 100 : backendConfidence) 
                : 0.5
              
              // Determine status from decision action
              let status: 'EXECUTE' | 'CANARY' | 'REVIEW' | 'BLOCKED' = 'REVIEW'
              if (decision.action === 'AUTO_REMEDIATE' || decision.action === 'EXECUTE') {
                status = 'EXECUTE'
              } else if (decision.action === 'CANARY') {
                status = 'CANARY'
              } else if (decision.action === 'BLOCK' || decision.action === 'BLOCKED') {
                status = 'BLOCKED'
              }
              
              const transformedResult = {
                status,
                confidence: confidenceValue,
                blast_radius: {
                  level: decision.breakdown?.dependency < 0.5 ? 'ISOLATED' : 'LOW',
                  numeric: decision.breakdown?.dependency || 0.1,
                  affected_resources_count: simulationData.impacted_resources?.length || 0,
                  affected_resources: (simulationData.impacted_resources || []).map((id: string) => ({
                    id,
                    type: selectedResource.resourceType,
                    name: id.split('/').pop() || id,
                    impact: 'Low'
                  }))
                },
                evidence: {
                  cloudtrail: {
                    total_events: 0,
                    matched_events: 0,
                    days_since_last_use: selectedResource.evidence.observationDays
                  },
                  summary: {
                    total_sources: 2,
                    agreeing_sources: 2
                  }
                },
                simulation_steps: [
                  {
                    step_number: 1,
                    name: 'Fetch Role Details',
                    description: 'Retrieved IAM role information from AWS',
                    status: 'COMPLETED' as const
                  },
                  {
                    step_number: 2,
                    name: 'Collect Evidence',
                    description: 'Gathered CloudTrail and Access Advisor data',
                    status: 'COMPLETED' as const
                  },
                  {
                    step_number: 3,
                    name: 'Analyze Usage',
                    description: `Analyzed ${selectedResource.evidence.observationDays} days of usage data`,
                    status: 'COMPLETED' as const
                  },
                  {
                    step_number: 4,
                    name: 'Calculate Confidence',
                    description: `Confidence: ${((confidenceValue ?? 0) * 100).toFixed(0)}%`,
                    status: 'COMPLETED' as const
                  }
                ],
                edge_cases: [],
                action_policy: {
                  auto_apply: decision.auto_allowed || false,
                  allowed_actions: decision.action ? [decision.action] : [],
                  reason: decision.reasons?.join('; ') || 'Based on evidence analysis',
                  issue_type: selectedResource.resourceType
                },
                recommendation: decision.reasons?.join('. ') || simulationData.after_state || 'Review recommended',
                before_state_summary: simulationData.before_state,
                after_state_summary: simulationData.after_state,
                timestamp: new Date().toISOString(),
                human_readable_evidence: decision.reasons || [
                  `${selectedResource.gapCount ?? 0} unused permissions detected`,
                  `${selectedResource.evidence.observationDays ?? 0} days of observation`,
                  `Confidence: ${((confidenceValue ?? 0) * 100).toFixed(0)}%`
                ]
              }
              
              setSimulationResult(transformedResult)
              setSimulationModalOpen(true)
            } catch (err) {
              console.error('Simulation error:', err)
              alert('Failed to run simulation. Check console for details.')
            } finally {
              setSimulating(false)
            }
          }}
          simulating={simulating}
        />
      )}

      {/* Simulation Results Modal */}
      {simulationModalOpen && simulationResult && selectedResource && (
        <SimulationResultsModal
          isOpen={simulationModalOpen}
          onClose={() => {
            setSimulationModalOpen(false)
            setSimulationResult(null)
          }}
          resourceType={selectedResource.resourceType}
          resourceId={selectedResource.resourceArn || selectedResource.resourceName}
          resourceName={selectedResource.resourceName}
          proposedChange={{
            action: 'remove_permissions',
            items: selectedResource.unusedList,
            reason: `Unused permissions detected: ${selectedResource.gapCount} permissions unused for ${selectedResource.evidence.observationDays} days`
          }}
          systemName={systemName}
          result={simulationResult}
        />
      )}
    </div>
  )
}

// Summary Card Component
function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: number, color: string }) {
  const colorClasses = {
    blue: 'text-blue-600',
    red: 'text-red-600',
    orange: 'text-orange-600',
    gray: 'text-gray-600'
  }
  
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className={colorClasses[color as keyof typeof colorClasses]}>{icon}</div>
        <div className="text-sm text-gray-600">{label}</div>
      </div>
      <div className="text-3xl font-bold text-gray-900">{value}</div>
    </div>
  )
}

// Gap Resource Card Component
function GapResourceCard({ resource, onClick }: { resource: GapResource, onClick: () => void }) {
  const getResourceIcon = () => {
    if (resource.resourceType === 'IAMRole') return <Shield className="w-5 h-5 text-blue-600" />
    if (resource.resourceType === 'SecurityGroup') return <Network className="w-5 h-5 text-orange-600" />
    if (resource.resourceType === 'S3Bucket') return <Database className="w-5 h-5 text-green-600" />
    return <AlertTriangle className="w-5 h-5 text-gray-600" />
  }

  const getLPScoreColor = (score: number | null) => {
    if (score === null) return 'text-gray-600 bg-gray-50 border-gray-200'
    if (score < 50) return 'text-red-600 bg-red-50 border-red-200'
    if (score < 75) return 'text-orange-600 bg-orange-50 border-orange-200'
    return 'text-green-600 bg-green-50 border-green-200'
  }

  const getNetworkExposureColor = (score: number) => {
    // For network exposure, higher score = more exposed = worse
    if (score >= 70) return 'text-red-600 bg-red-50 border-red-200'
    if (score >= 50) return 'text-orange-600 bg-orange-50 border-orange-200'
    if (score >= 30) return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    return 'text-green-600 bg-green-50 border-green-200'
  }

  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-6 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            {getResourceIcon()}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-gray-900">{resource.resourceName}</h3>
                {resource.region && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium flex items-center gap-1">
                    🌍 {resource.region}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">{resource.systemName || 'Unknown System'}</p>
            </div>
            {resource.resourceType === 'SecurityGroup' && resource.networkExposure ? (
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${getNetworkExposureColor(resource.networkExposure.score)}`}>
                Exposure: {resource.networkExposure.score}/100
              </span>
            ) : resource.resourceType === 'SecurityGroup' || resource.resourceType === 'S3Bucket' ? (
              <span className="px-3 py-1 rounded-full text-xs font-bold text-gray-400" title="Requires traffic/access analysis">
                LP Score: —
              </span>
            ) : (
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${getLPScoreColor(resource.lpScore)}`}>
                LP Score: {resource.lpScore !== null && !isNaN(resource.lpScore) ? `${resource.lpScore.toFixed(0)}%` : 'N/A'}
              </span>
            )}
            <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
              {resource.resourceType}
            </span>
          </div>

          {/* Gap Bar / Network Exposure Info */}
          {resource.resourceType === 'SecurityGroup' && resource.networkExposure ? (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Network Exposure</span>
                <span className="text-sm text-gray-600">
                  {resource.networkExposure.internetExposedRules} internet-exposed rules • {resource.networkExposure.totalRules} total rules
                </span>
              </div>
              <div className="w-full h-8 bg-gray-200 rounded-lg overflow-hidden flex">
                <div
                  className="bg-red-500 h-full flex items-center justify-center text-white text-xs font-medium"
                  style={{ width: `${(resource.networkExposure.internetExposedRules / Math.max(1, resource.networkExposure.totalRules)) * 100}%` }}
                >
                  {resource.networkExposure.internetExposedRules > 0 && `${resource.networkExposure.internetExposedRules} exposed`}
                </div>
                <div
                  className="bg-green-500 h-full flex items-center justify-center text-white text-xs font-medium"
                  style={{ width: `${((resource.networkExposure.totalRules - resource.networkExposure.internetExposedRules) / Math.max(1, resource.networkExposure.totalRules)) * 100}%` }}
                >
                  {resource.networkExposure.totalRules - resource.networkExposure.internetExposedRules > 0 && `${resource.networkExposure.totalRules - resource.networkExposure.internetExposedRules} secure`}
                </div>
              </div>
              {resource.networkExposure.highRiskPorts.length > 0 && (
                <div className="mt-2 text-xs text-red-600">
                  ⚠️ High-risk ports: {resource.networkExposure.highRiskPorts.join(', ')}
                </div>
              )}
            </div>
          ) : (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Permission Usage</span>
                <span className="text-sm text-gray-600">
                  {resource.usedCount ?? 0} used • {resource.gapCount ?? 0} unused ({resource.gapPercent !== null ? `${resource.gapPercent.toFixed(0)}%` : 'N/A'})
                </span>
              </div>
              <div className="w-full h-8 bg-gray-200 rounded-lg overflow-hidden flex">
                <div
                  className="bg-green-500 h-full flex items-center justify-center text-white text-xs font-medium"
                  style={{ width: `${((resource.usedCount ?? 0) / Math.max(1, resource.allowedCount)) * 100}%` }}
                >
                  {(resource.usedCount ?? 0) > 0 && resource.usedCount}
                </div>
                <div
                  className="bg-red-500 h-full flex items-center justify-center text-white text-xs font-medium"
                  style={{ width: `${((resource.gapCount ?? 0) / Math.max(1, resource.allowedCount)) * 100}%` }}
                >
                  {(resource.gapCount ?? 0) > 0 && resource.gapCount}
                </div>
              </div>
            </div>
          )}

          {/* High-Risk Unused */}
          {resource.highRiskUnused.length > 0 && (
            <div className="mb-4">
              <div className="text-sm font-medium text-gray-700 mb-2">High-Risk Unused Permissions:</div>
              <div className="flex flex-wrap gap-2">
                {resource.highRiskUnused.slice(0, 3).map((perm, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-medium"
                  >
                    ⚠️ {perm.permission} ({perm.riskLevel})
                  </span>
                ))}
                {resource.highRiskUnused.length > 3 && (
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                    +{resource.highRiskUnused.length - 3} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Evidence Badge */}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Clock className="w-4 h-4" />
            <span>
              {resource.evidence.observationDays} days of {resource.evidence.dataSources.join(', ')}, {resource.evidence.confidence} confidence
            </span>
          </div>
        </div>

        <button
          className="ml-4 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold flex items-center gap-2"
          onClick={(e) => {
            e.stopPropagation()
            onClick()
          }}
        >
          View Remediation
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// Remediation Drawer Component
function RemediationDrawer({ 
  resource, 
  onClose, 
  onSimulate,
  simulating = false
}: { 
  resource: GapResource
  onClose: () => void
  onSimulate?: () => void
  simulating?: boolean
}) {
  const [activeTab, setActiveTab] = useState<'summary' | 'before-after' | 'evidence' | 'impact'>('summary')

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center sm:justify-center">
      <div className="bg-white rounded-t-lg sm:rounded-lg w-full sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-gray-900">{resource.resourceName}</h2>
              {resource.region && (
                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium flex items-center gap-1">
                  🌍 {resource.region}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600">{resource.resourceType} • {resource.systemName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6">
          <div className="flex gap-4">
            {[
              { id: 'summary', label: 'Summary' },
              { id: 'before-after', label: 'Before/After' },
              { id: 'evidence', label: 'Evidence' },
              { id: 'impact', label: 'Impact' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'summary' && <SummaryTab resource={resource} />}
          {activeTab === 'before-after' && <BeforeAfterTab resource={resource} />}
          {activeTab === 'evidence' && <EvidenceTab resource={resource} />}
          {activeTab === 'impact' && <ImpactTab resource={resource} />}
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
          >
            Cancel
          </button>
          <button 
            onClick={onSimulate}
            disabled={simulating}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium flex items-center gap-2"
          >
            {simulating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Simulating...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Simulate
              </>
            )}
          </button>
          <button className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm font-medium flex items-center gap-2">
            <FileDown className="w-4 h-4" />
            Export Terraform
          </button>
          <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium flex items-center gap-2">
            <Send className="w-4 h-4" />
            Request Approval
          </button>
          {resource.evidence.confidence === 'HIGH' && (
            <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Auto-Apply
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Tab Components
function SummaryTab({ resource }: { resource: GapResource }) {
  // For Security Groups, show Network Exposure instead of LP Score
  const isSecurityGroup = resource.resourceType === 'SecurityGroup'
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        {isSecurityGroup && resource.networkExposure ? (
          <>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">Network Exposure Score</div>
              <div className="text-3xl font-bold text-gray-900">{resource.networkExposure.score}/100</div>
              <div className="text-xs text-gray-500 mt-1">
                {resource.networkExposure.internetExposedRules} internet-exposed rules
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">Total Rules</div>
              <div className="text-3xl font-bold text-blue-600">{resource.networkExposure.totalRules}</div>
              <div className="text-xs text-gray-500 mt-1">
                {resource.networkExposure.highRiskPorts.length > 0 
                  ? `${resource.networkExposure.highRiskPorts.length} high-risk ports`
                  : 'No high-risk ports'}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">LP Score</div>
              <div className="text-3xl font-bold text-gray-900">
                {resource.resourceType === 'SecurityGroup' || resource.resourceType === 'S3Bucket' ? (
                  <span className="text-gray-400" title="Requires traffic/access analysis">
                    —
                  </span>
                ) : resource.lpScore !== null && !isNaN(resource.lpScore) ? (
                  `${resource.lpScore.toFixed(0)}%`
                ) : (
                  'N/A'
                )}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {resource.resourceType === 'SecurityGroup' || resource.resourceType === 'S3Bucket' ? (
                  'Requires traffic/access analysis'
                ) : resource.lpScore !== null && !isNaN(resource.lpScore) ? (
                  `${(100 - resource.lpScore).toFixed(0)}% unused`
                ) : (
                  'Not applicable'
                )}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">Attack Surface Reduction</div>
              <div className="text-3xl font-bold text-red-600">
                {resource.gapPercent !== null ? `${resource.gapPercent.toFixed(0)}%` : 'N/A'}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {resource.gapCount ?? 0} permissions
              </div>
            </div>
          </>
        )}
      </div>

      <div className="rounded-lg border-2 border-gray-300 bg-white p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">
          {isSecurityGroup ? 'Network Exposure Visualization' : 'Gap Visualization'}
        </h3>
        {isSecurityGroup && resource.networkExposure ? (
          <div className="w-full h-12 bg-gray-200 rounded-lg overflow-hidden flex mb-4">
            <div
              className="bg-red-500 h-full flex items-center justify-center text-white text-xs font-medium"
              style={{ width: `${(resource.networkExposure.internetExposedRules / Math.max(1, resource.networkExposure.totalRules)) * 100}%` }}
            >
              Internet Exposed ({resource.networkExposure.internetExposedRules})
            </div>
            <div
              className="bg-green-500 h-full flex items-center justify-center text-white text-xs font-medium"
              style={{ width: `${((resource.networkExposure.totalRules - resource.networkExposure.internetExposedRules) / Math.max(1, resource.networkExposure.totalRules)) * 100}%` }}
            >
              Secure ({resource.networkExposure.totalRules - resource.networkExposure.internetExposedRules})
            </div>
          </div>
        ) : (
          <div className="w-full h-12 bg-gray-200 rounded-lg overflow-hidden flex mb-4">
            <div
              className="bg-green-500 h-full flex items-center justify-center text-white text-xs font-medium"
              style={{ width: `${((resource.usedCount ?? 0) / Math.max(1, resource.allowedCount)) * 100}%` }}
            >
              Used ({(resource.usedCount ?? 0)})
            </div>
            <div
              className="bg-red-500 h-full flex items-center justify-center text-white text-xs font-medium"
              style={{ width: `${((resource.gapCount ?? 0) / Math.max(1, resource.allowedCount)) * 100}%` }}
            >
              Unused ({(resource.gapCount ?? 0)})
            </div>
          </div>
        )}
        <p className="text-sm text-gray-700">
          <strong>{resource.resourceName}</strong> has <strong>{resource.allowedCount} allowed permissions</strong>.
          In <strong>{resource.evidence.observationDays} days</strong> of observation, only <strong>{resource.usedCount} were used</strong>.
          The other <strong>{resource.gapCount ?? 0} ({(resource.gapPercent ?? 0).toFixed(0)}%)</strong> are your attack surface.
        </p>
      </div>

      {resource.highRiskUnused.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h3 className="text-lg font-bold text-red-900 mb-3">High-Risk Unused Permissions</h3>
          <div className="space-y-2">
            {resource.highRiskUnused.map((perm, idx) => (
              <div key={idx} className="flex items-center justify-between bg-white rounded p-3">
                <div>
                  <div className="font-mono text-sm font-medium text-gray-900">{perm.permission}</div>
                  <div className="text-xs text-gray-600">{perm.reason}</div>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-bold ${
                  perm.riskLevel === 'CRITICAL' ? 'bg-red-600 text-white' : 'bg-orange-500 text-white'
                }`}>
                  {perm.riskLevel}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function BeforeAfterTab({ resource }: { resource: GapResource }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* BEFORE */}
      <div className="border-2 border-red-200 rounded-lg p-6 bg-red-50">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <h4 className="text-lg font-bold text-gray-900">BEFORE (Current)</h4>
        </div>
        <div className="text-3xl font-bold text-gray-900 mb-4">{resource.allowedCount} permissions</div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {resource.allowedList.slice(0, 10).map((perm, idx) => (
            <div key={idx} className="flex items-center gap-2 text-sm">
              <div className={`w-2 h-2 rounded-full ${
                resource.usedList.includes(perm) ? 'bg-green-500' : 'bg-red-500'
              }`}></div>
              <span className="font-mono text-gray-700">{perm}</span>
            </div>
          ))}
          {resource.allowedCount > 10 && (
            <div className="text-sm text-gray-500 italic">...{resource.allowedCount - 10} more</div>
          )}
        </div>
      </div>

      {/* AFTER */}
      <div className="border-2 border-green-200 rounded-lg p-6 bg-green-50">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <h4 className="text-lg font-bold text-gray-900">AFTER (Recommended)</h4>
        </div>
        <div className="text-3xl font-bold text-gray-900 mb-4">{resource.usedCount} permissions</div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {resource.usedList.slice(0, 10).map((perm, idx) => (
            <div key={idx} className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="font-mono text-gray-700">{perm}</span>
            </div>
          ))}
          {(resource.usedCount ?? 0) > 10 && (
            <div className="text-sm text-gray-500 italic">...{(resource.usedCount ?? 0) - 10} more</div>
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-green-300">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Removed:</span>
            <span className="text-lg font-bold text-red-600">{resource.gapCount} permissions</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function EvidenceTab({ resource }: { resource: GapResource }) {
  // Check if this is a Security Group with rule_states
  const hasRuleStates = resource.resourceType === 'SecurityGroup' && resource.evidence.rule_states && resource.evidence.rule_states.length > 0
  
  return (
    <div className="space-y-6">
      {/* Rule States for Security Groups */}
      {hasRuleStates && (
        <div className="rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Security Group Rules ({resource.evidence.rule_states?.length || 0})</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {resource.evidence.rule_states?.map((rule, idx) => {
              const port = typeof rule.port === 'number' ? rule.port : rule.port
              const isAllTraffic = rule.protocol === '-1' || port === -1 || port === 'ALL'
              const isIPv6 = rule.cidr?.includes('::/0') || false
              const isRisky = rule.cidr?.includes('0.0.0.0/0') || isIPv6
              
              return (
                <div 
                  key={idx} 
                  className={`rounded-lg border p-4 ${
                    isRisky ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`px-3 py-1 rounded font-mono text-sm font-bold ${
                        isAllTraffic 
                          ? 'bg-orange-100 text-orange-700' 
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {isAllTraffic ? 'All Traffic' : `Port ${port}`}
                      </div>
                      {rule.protocol && rule.protocol !== '-1' && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                          {rule.protocol.toUpperCase()}
                        </span>
                      )}
                      {isIPv6 && (
                        <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                          IPv6
                        </span>
                      )}
                      {rule.cidr && rule.cidr !== 'N/A' && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-mono">
                          {rule.cidr}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {rule.observed_usage ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Used
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                          Not Used
                        </span>
                      )}
                      {rule.recommendation && (
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          rule.recommendation === 'REVIEW_OR_DELETE' || rule.recommendation === 'DELETE'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {rule.recommendation === 'REVIEW_OR_DELETE' ? '⚠️ Delete' : rule.recommendation}
                        </span>
                      )}
                    </div>
                  </div>
                  {rule.note && (
                    <p className="text-xs text-gray-600 mt-2">{rule.note}</p>
                  )}
                  {rule.last_seen && (
                    <p className="text-xs text-gray-500 mt-1">Last seen: {new Date(rule.last_seen).toLocaleDateString()}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      
      <div className="rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Evidence Sources</h3>
        <div className="space-y-3">
          {resource.evidence.dataSources.map((source, idx) => {
            const getSourceDescription = (src: string) => {
              switch (src) {
                case 'CloudTrail':
                  return `${resource.evidence.observationDays} days of API call history`;
                case 'IAM Access Advisor':
                  return 'Service-level last accessed information (up to 400 days)';
                case 'VPC Flow Logs':
                  return `${resource.evidence.flowlogs?.lookback_days || 30} days of network traffic analysis`;
                case 'Resource Policies':
                  return 'Cross-account access patterns (S3, KMS, Lambda)';
                case 'IAM API':
                  return 'Real-time permission extraction from policies';
                default:
                  return 'Evidence source';
              }
            };
            
            return (
              <div key={idx} className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <div>
                  <div className="font-medium text-gray-900">{source}</div>
                  <div className="text-sm text-gray-600">
                    {getSourceDescription(source)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Observation Period</h3>
        <div className="flex items-center gap-4">
          <Clock className="w-6 h-6 text-gray-600" />
          <div>
            <div className="font-medium text-gray-900">{resource.evidence.observationDays} days</div>
            <div className="text-sm text-gray-600">
              From {new Date(Date.now() - resource.evidence.observationDays * 24 * 60 * 60 * 1000).toLocaleDateString()} to {new Date().toLocaleDateString()}
            </div>
          </div>
        </div>
      </div>

      {/* Confidence Scoring Breakdown */}
      {resource.evidence.confidence_breakdown && (
        <div className="rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Confidence Score Breakdown</h3>
          <div className="space-y-4">
            {Object.entries(resource.evidence.confidence_breakdown).map(([source, data]: [string, any]) => (
              <div key={source} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 capitalize">
                      {source.replace(/_/g, ' ')}
                    </span>
                    {data.available === false && (
                      <span className="text-xs text-gray-500">(Not available)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {(data.contribution ?? 0).toFixed(1)} / {(data.max ?? 0).toFixed(1)}
                    </span>
                    <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all"
                        style={{ width: `${(data.contribution / data.max) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="text-xs text-gray-600 ml-7">
                  {data.description}
                  {data.events !== undefined && ` • ${data.events} events`}
                  {data.flows !== undefined && ` • ${data.flows} flows`}
                  {data.resources_checked !== undefined && ` • ${data.resources_checked} resources checked`}
                </div>
              </div>
            ))}
            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900">Total Confidence</span>
                <span className="text-lg font-bold text-blue-600">
                  {(resource.confidence ?? 0).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VPC Flow Logs Details */}
      {resource.evidence.flowlogs && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Network className="w-5 h-5 text-blue-600" />
            VPC Flow Logs Analysis
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-600">Total Flows Analyzed</div>
              <div className="text-2xl font-bold text-gray-900">
                {(resource.evidence.flowlogs?.total_flows ?? 0) || 0}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Matched Flows</div>
              <div className="text-2xl font-bold text-blue-600">
                {resource.evidence.flowlogs.matched_flows || 0}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">ENIs Checked</div>
              <div className="text-lg font-semibold text-gray-700">
                {resource.evidence.flowlogs.enis_checked || 0}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Log Groups Checked</div>
              <div className="text-lg font-semibold text-gray-700">
                {resource.evidence.flowlogs.log_groups_checked || 0}
              </div>
            </div>
          </div>
          {((resource.evidence.flowlogs?.total_flows ?? 0) > 0) && (
            <div className="mt-4 pt-4 border-t border-blue-200">
              <div className="text-sm text-gray-600">
                Network traffic analysis validates that permissions are actively used at the network level.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Resource Policies Details */}
      {resource.evidence.resourcePolicies && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-600" />
            Resource Policies Analysis
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-600">Total Resources Checked</div>
              <div className="text-2xl font-bold text-gray-900">
                {resource.evidence.resourcePolicies.total_resources_checked || 0}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Matching Policies</div>
              <div className="text-2xl font-bold text-purple-600">
                {resource.evidence.resourcePolicies.matching_policies?.length || 0}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">S3 Buckets</div>
              <div className="text-lg font-semibold text-gray-700">
                {resource.evidence.resourcePolicies.s3_buckets_checked || 0}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">KMS Keys</div>
              <div className="text-lg font-semibold text-gray-700">
                {resource.evidence.resourcePolicies.kms_keys_checked || 0}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Lambda Functions</div>
              <div className="text-lg font-semibold text-gray-700">
                {resource.evidence.resourcePolicies.lambda_functions_checked || 0}
              </div>
            </div>
          </div>
          {resource.evidence.resourcePolicies.matching_policies && resource.evidence.resourcePolicies.matching_policies.length > 0 && (
            <div className="mt-4 pt-4 border-t border-purple-200">
              <div className="text-sm font-medium text-gray-700 mb-2">Resources with Access:</div>
              <div className="space-y-1">
                {resource.evidence.resourcePolicies.matching_policies.slice(0, 5).map((policy: any, idx: number) => (
                  <div key={idx} className="text-xs text-gray-600 bg-white px-2 py-1 rounded">
                    {policy.resource_type}: {policy.resource_name || policy.resource_arn}
                  </div>
                ))}
                {resource.evidence.resourcePolicies.matching_policies.length > 5 && (
                  <div className="text-xs text-gray-500">
                    +{resource.evidence.resourcePolicies.matching_policies.length - 5} more resources
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Confidence</h3>
        <div className="flex items-center gap-4">
          <div className={`px-4 py-2 rounded-lg font-bold ${
            resource.evidence.confidence === 'HIGH' ? 'bg-green-100 text-green-800' :
            resource.evidence.confidence === 'MEDIUM' ? 'bg-orange-100 text-orange-800' :
            'bg-yellow-100 text-yellow-800'
          }`}>
            {resource.evidence.confidence}
          </div>
          <div className="text-sm text-gray-600">
            Based on {resource.evidence.dataSources.length} data source(s) and {resource.evidence.observationDays} days of observation
          </div>
        </div>
      </div>
    </div>
  )
}

function ImpactTab({ resource }: { resource: GapResource }) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-green-200 bg-green-50 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Impact Analysis</h3>
        <div className="space-y-3">
          {[
            'No service disruption expected',
            'All active workflows will continue',
            `Reduces attack surface by ${(resource.gapPercent ?? 0).toFixed(0)}%`,
            'Achieves least privilege compliance'
          ].map((impact, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <span className="text-sm text-gray-700">{impact}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">What Will Continue Working</h3>
        <div className="space-y-2">
          {resource.usedList.slice(0, 5).map((perm, idx) => (
            <div key={idx} className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="font-mono text-gray-700">{perm}</span>
            </div>
          ))}
          {resource.usedList.length > 5 && (
            <div className="text-sm text-gray-500">...and {resource.usedList.length - 5} more used permissions</div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">What Will Be Removed</h3>
        <div className="space-y-2">
          {resource.unusedList.slice(0, 5).map((perm, idx) => (
            <div key={idx} className="flex items-center gap-2 text-sm">
              <XCircle className="w-4 h-4 text-red-600" />
              <span className="font-mono text-gray-700">{perm}</span>
            </div>
          ))}
          {resource.unusedList.length > 5 && (
            <div className="text-sm text-gray-500">...and {resource.unusedList.length - 5} more unused permissions</div>
          )}
        </div>
      </div>
    </div>
  )
}
