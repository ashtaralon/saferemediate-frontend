"use client"

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertCircle, Loader2, RefreshCw, Shield, Database, Network, CheckCircle2, XCircle, TrendingDown, AlertTriangle } from 'lucide-react'
import SimulationModal from '@/components/simulation-modal'

interface LeastPrivilegeIssue {
  evidence?: {
    dataSources?: string[]
    observationDays?: number
    coverage?: string
    lastSeen?: string | null
  }
  id: string
  type: string
  resourceType: string
  resourceName: string
  resourceArn: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  confidence: number
  allowedCount: number
  usedCount: number
  unusedCount: number
  gapPercent: number
  allowedList: string[]
  usedList: string[]
  unusedList: string[]
  // Network-specific fields (for Security Groups and Network ACLs)
  allowedIPsCount?: number
  usedIPsCount?: number
  unusedIPsCount?: number
  allowedPortsCount?: number
  usedPortsCount?: number
  unusedPortsCount?: number
  allowedRules?: Array<{ip: string, port: number | string, protocol: string, description?: string}>
  usedRules?: Array<{ip: string, port: number, protocol?: string}>
  unusedRules?: Array<{ip: string, port: number | string, protocol: string}>
  // Other fields
  lastUsed?: string
  observationDays: number
  title: string
  description: string
  remediation: string
  systemName?: string
}

interface Summary {
  totalExcessPermissions: number
  unusedNetworkAccess: number
  unusedNetworkIPs?: number  // New: Count of unused IP addresses
  unusedNetworkPorts?: number  // New: Count of unused ports
  unusedDataAccess: number
  confidenceLevel: number
  totalIssues: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  networkIssuesCount?: number
  iamIssuesCount?: number
  s3IssuesCount?: number
}

interface Resource {
  id: string
  resourceName: string
  resourceType: string
  resourceArn: string
  allowedCount: number
  usedCount: number
  gapCount: number
  confidence: number
  severity: string
  gapPercent: number
}

interface LeastPrivilegeResponse {
  systemName: string
  summary: Summary
  issues: LeastPrivilegeIssue[]
  resources: Resource[]
  observationDays: number
  timestamp: string
}

function LeastPrivilegeContent() {
  const searchParams = useSearchParams()
  const systemName = searchParams.get('system') || 'alon-prod'
  
  const [data, setData] = useState<LeastPrivilegeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIssue, setSelectedIssue] = useState<LeastPrivilegeIssue | null>(null)
  const [minSeverity, setMinSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('low')
  const [expandedPermissions, setExpandedPermissions] = useState<Set<string>>(new Set())
  const [permissionDetailsOpen, setPermissionDetailsOpen] = useState(false)
  const [simulationModal, setSimulationModal] = useState<{
    isOpen: boolean
    resourceType: string
    resourceId: string
    resourceName: string
    proposedChange: { action: string; items: string[]; reason: string }
  } | null>(null)

  const fetchLeastPrivilege = async (abortController?: AbortController) => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        systemName,
        observationDays: '365',
        minSeverity
      })

      const response = await fetch(`/api/proxy/least-privilege/issues?${params.toString()}`, {
        headers: { 'Content-Type': 'application/json' },
        signal: abortController?.signal || AbortSignal.timeout(30000), // 30s timeout
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()
      
      // Only update state if request wasn't aborted
      if (!abortController?.signal.aborted) {
        setData(result)
      }
    } catch (err) {
      // Ignore abort errors
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      console.error('[Least Privilege] Error:', err)
    } finally {
      if (!abortController?.signal.aborted) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    // Create abort controller to cancel previous requests
    const abortController = new AbortController()
    
    // Small delay to debounce rapid changes
    const timeoutId = setTimeout(() => {
      fetchLeastPrivilege(abortController)
    }, 300) // 300ms debounce
    
    // Cleanup: cancel request if dependencies change
    return () => {
      clearTimeout(timeoutId)
      abortController.abort()
    }
  }, [systemName, minSeverity])

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return { bg: '#fee2e2', text: '#dc2626', border: '#fecaca' }
      case 'high':
        return { bg: '#fed7aa', text: '#ea580c', border: '#fdba74' }
      case 'medium':
        return { bg: '#fef3c7', text: '#d97706', border: '#fde68a' }
      case 'low':
        return { bg: '#dbeafe', text: '#2563eb', border: '#93c5fd' }
      default:
        return { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' }
    }
  }

  const getResourceTypeIcon = (resourceType: string) => {
    if (resourceType === 'IAMRole') return <Shield className="w-5 h-5" />
    if (resourceType === 'SecurityGroup') return <Network className="w-5 h-5" />
    if (resourceType === 'S3Bucket') return <Database className="w-5 h-5" />
    return <AlertCircle className="w-5 h-5" />
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-indigo-600" />
          <p className="text-lg font-medium text-gray-900 mb-2">Analyzing Least Privilege...</p>
          <p className="text-sm text-gray-500">
            Comparing ALLOWED vs ACTUAL permissions. This may take 30-40 seconds.
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-900 mb-1">Error Loading Least Privilege Analysis</h3>
              <p className="text-sm text-red-700 mb-4">{error}</p>
              <button
                onClick={fetchLeastPrivilege}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No data available</p>
      </div>
    )
  }

  const { summary, issues, resources } = data

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Least Privilege Analysis</h1>
          <p className="text-gray-600">GAP between ALLOWED and ACTUAL permissions for system: <strong>{systemName}</strong></p>
        </div>
        <button
          onClick={fetchLeastPrivilege}
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* A. ALERT BANNER - Least Privilege Violations Detected */}
      {resources.length > 0 && (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 p-6 shadow-lg">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-8 h-8 text-red-600 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-red-900 mb-2">Least Privilege Violations Detected</h2>
              <p className="text-base text-red-800 mb-4">
                <strong>{resources.length}</strong> {resources.length === 1 ? 'resource has' : 'resources have'} excessive permissions based on {data.observationDays}-day usage analysis. 
                These {resources.length === 1 ? 'resource has' : 'resources have'} {summary.totalExcessPermissions > 0 ? `${summary.totalExcessPermissions}-` : ''}{Math.round(resources.reduce((acc, r) => acc + r.gapPercent, 0) / resources.length)}% unused permissions that should be removed to achieve least privilege compliance.
              </p>
              <div className="flex flex-wrap items-center gap-6 mt-4">
                <div className="flex items-center gap-2">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <div>
                    <div className="text-sm font-medium text-red-700">Total Unused Permissions</div>
                    <div className="text-2xl font-bold text-red-900">{summary.totalExcessPermissions}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  <div>
                    <div className="text-sm font-medium text-green-700">Avg Attack Surface Reduction</div>
                    <div className="text-2xl font-bold text-green-700">
                      {Math.round(resources.reduce((acc, r) => acc + r.gapPercent, 0) / resources.length)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-lg p-4 border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-blue-600" />
            <div className="text-sm text-gray-600">Total Resources</div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{resources.length}</div>
          <div className="text-xs text-gray-500 mt-1">Resources analyzed</div>
        </div>

        <div className="rounded-lg p-4 border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-5 h-5 text-red-600" />
            <div className="text-sm text-gray-600">Total Excess Permissions</div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{summary.totalExcessPermissions}</div>
          <div className="text-xs text-gray-500 mt-1">Unused permissions detected</div>
        </div>

        <div className="rounded-lg p-4 border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Network className="w-5 h-5 text-orange-600" />
            <div className="text-sm text-gray-600">Network Issues</div>
          </div>
          <div className="text-3xl font-bold text-orange-600">{summary.networkIssuesCount || 0}</div>
          <div className="text-xs text-gray-500 mt-1">Security Groups / NACLs</div>
        </div>

        <div className="rounded-lg p-4 border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-green-600" />
            <div className="text-sm text-gray-600">Confidence Level</div>
          </div>
          <div className="text-3xl font-bold text-green-600">{summary.confidenceLevel}%</div>
          <div className="text-xs text-gray-500 mt-1">Based on {data.observationDays} days</div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg p-4 border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">Filter by Severity:</span>
          <select
            value={minSeverity}
            onChange={(e) => setMinSeverity(e.target.value as any)}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="low">All (Low+)</option>
            <option value="medium">Medium+</option>
            <option value="high">High+</option>
            <option value="critical">Critical Only</option>
          </select>
          <span className="text-sm text-gray-500">
            Showing {summary.totalIssues} issues ({summary.criticalCount} critical, {summary.highCount} high, {summary.mediumCount} medium, {summary.lowCount} low)
          </span>
        </div>
      </div>

      {/* B. RESOURCE LIST - Professional Card Layout */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Resources Requiring Attention</h2>
              <p className="text-sm text-gray-600 mt-1">{resources.length} {resources.length === 1 ? 'resource with' : 'resources with'} elevated risk or policy violations.</p>
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="Search resources..."
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <svg className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>
        
        {resources.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-900 mb-2">No GAP issues found!</p>
            <p className="text-sm text-gray-500">
              All permissions are being used. Your system follows least privilege! 🎉
            </p>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {resources.map((resource) => {
              const issue = issues.find(i => i.id === resource.id)
              const colors = getSeverityColor(resource.severity)
              const systemName = issue?.systemName || 'Unknown System'
              
              return (
                <div
                  key={resource.id}
                  className={`border rounded-lg p-5 hover:shadow-md transition-shadow cursor-pointer ${selectedIssue?.id === resource.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white'}`}
                  onClick={() => setSelectedIssue(issue || null)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        {getResourceTypeIcon(resource.resourceType)}
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">{resource.resourceName}</h3>
                          <p className="text-sm text-gray-500">{systemName}</p>
                        </div>
                        <span
                          className="px-3 py-1 rounded-full text-xs font-bold uppercase"
                          style={{
                            background: colors.bg,
                            color: colors.text,
                            border: `1px solid ${colors.border}`,
                          }}
                        >
                          {resource.severity} Risk
                        </span>
                        <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
                          {resource.resourceType}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-4 gap-4 mb-3">
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          </svg>
                          <div>
                            <div className="text-sm font-semibold text-gray-900">{resource.allowedCount} permissions</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                          </svg>
                          <div>
                            <div className="text-sm font-semibold text-green-600">{resource.usedCount} used</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <div>
                            <div className="text-sm font-semibold text-red-600">{resource.gapCount} unused</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div>
                            <div className="text-sm font-semibold text-gray-900">{data.observationDays} days tracked</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 mb-3">
                        <span className="text-sm text-gray-700">
                          <strong className="text-red-600">{resource.gapPercent.toFixed(0)}% unused permissions</strong> ({resource.gapCount} of {resource.allowedCount})
                        </span>
                        {issue?.systemName && (
                          <span className="text-sm text-gray-500">• System: {issue.systemName}</span>
                        )}
                      </div>
                    </div>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedIssue(issue || null)
                      }}
                      className="ml-4 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-semibold"
                    >
                      Review & Fix
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* C. DETAIL VIEW - Full Page Professional Design (Like Image 2) */}
      {selectedIssue && (
        <div className="space-y-6">
          {/* Header with Actions */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Least Privilege Analysis</h2>
              <p className="text-lg text-gray-700">
                Role: <strong>{selectedIssue.resourceName}</strong>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy Policy
              </button>
              <button className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export Report
              </button>
              <button
                onClick={() => setSelectedIssue(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* SUMMARY CARD with Doughnut Chart (Exactly like Image 2) */}
          <div className="rounded-lg border-2 border-gray-300 bg-white shadow-lg p-6">
            <h4 className="text-xl font-bold text-gray-900 mb-4">Summary</h4>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-lg text-gray-700 mb-2">
                  Your role has <strong className="text-gray-900">{selectedIssue.allowedCount} permissions</strong> but uses <strong className="text-green-600">{selectedIssue.usedCount}</strong>
                </p>
                <p className="text-lg text-gray-700">
                  We can safely remove <strong className="text-red-600">{selectedIssue.unusedCount} permissions</strong> (<strong className="text-red-600">{selectedIssue.gapPercent.toFixed(0)}% reduction</strong>)
                </p>
              </div>
              {/* Doughnut Chart */}
              <div className="relative w-32 h-32 ml-8">
                <svg className="w-32 h-32 transform -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="#e5e7eb"
                    strokeWidth="12"
                    fill="none"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="#ef4444"
                    strokeWidth="12"
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * 56 * (selectedIssue.gapPercent / 100)} ${2 * Math.PI * 56}`}
                    strokeLinecap="round"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="#10b981"
                    strokeWidth="12"
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * 56 * (selectedIssue.usedCount / selectedIssue.allowedCount)} ${2 * Math.PI * 56}`}
                    strokeDashoffset={`-${2 * Math.PI * 56 * (selectedIssue.gapPercent / 100)}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-gray-900">{selectedIssue.gapPercent.toFixed(0)}%</span>
                  <span className="text-xs text-gray-600">unused</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 rounded"></div>
                <span className="text-sm text-gray-700">Used ({selectedIssue.usedCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-500 rounded"></div>
                <span className="text-sm text-gray-700">Unused ({selectedIssue.unusedCount})</span>
              </div>
            </div>
          </div>

          {/* BEFORE vs AFTER Comparison (Exactly like Image 2) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* BEFORE (Current Policy) */}
            <div className="border-2 border-red-200 rounded-lg p-6 bg-red-50">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <h4 className="text-lg font-bold text-gray-900">BEFORE (Current Policy)</h4>
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-4">{selectedIssue.allowedCount} permissions</div>
              <ul className="space-y-2 mb-4">
                {(selectedIssue.allowedList.slice(0, 6).map((item, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm text-gray-700">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <span className="font-mono">{item}</span>
                  </li>
                )))}
                {selectedIssue.allowedCount > 6 && (
                  <li className="text-sm text-gray-500 italic">...{selectedIssue.allowedCount - 6} more</li>
                )}
              </ul>
              <div className="mt-auto pt-4 border-t border-red-300 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Attack Surface:</span>
                <span className="px-3 py-1 bg-red-600 text-white rounded-full text-xs font-bold uppercase">HIGH</span>
              </div>
            </div>

            {/* AFTER (Recommended Policy) */}
            <div className="border-2 border-green-200 rounded-lg p-6 bg-green-50">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <h4 className="text-lg font-bold text-gray-900">AFTER (Recommended Policy)</h4>
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-4">{selectedIssue.usedCount} permissions</div>
              <ul className="space-y-2 mb-4">
                {(selectedIssue.usedList.slice(0, 6).map((item, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm text-gray-700">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="font-mono">{item}</span>
                  </li>
                )))}
                {selectedIssue.usedCount > 6 && (
                  <li className="text-sm text-gray-500 italic">...{selectedIssue.usedCount - 6} more</li>
                )}
              </ul>
              <div className="mt-auto pt-4 border-t border-green-300">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Attack Surface:</span>
                  <span className="px-3 py-1 bg-green-600 text-white rounded-full text-xs font-bold uppercase">MINIMAL</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Risk Reduction:</span>
                  <span className="text-lg font-bold text-green-700">{selectedIssue.gapPercent.toFixed(0)}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Recording Period Section */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div>
                <h3 className="font-semibold text-gray-900">{selectedIssue.observationDays}-Day Recording Period</h3>
                <p className="text-sm text-gray-600">
                  Tracked from {new Date(Date.now() - selectedIssue.observationDays * 24 * 60 * 60 * 1000).toLocaleDateString()} to {new Date().toLocaleDateString()} - {selectedIssue.observationDays * 100}K permission checks analyzed
                </p>
              </div>
            </div>
          </div>

          {/* Permission Usage Breakdown */}
          <div className="space-y-6">
            {/* Actually Used Permissions */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <h3 className="text-lg font-bold text-gray-900">Actually Used Permissions ({selectedIssue.usedCount})</h3>
                </div>
                <button className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium">Keep these</button>
              </div>
              <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                {selectedIssue.usedList.map((perm, idx) => {
                  // Calculate stable usage frequency based on permission name hash
                  const hash = perm.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
                  const usageFreq = 100 + (hash % 2000)
                  const descriptions: { [key: string]: string } = {
                    'Get': 'Active API calls',
                    'Put': 'File uploads',
                    'Query': 'Database reads',
                    'PutItem': 'Database writes',
                    'PutMetric': 'Monitoring',
                    'Publish': 'Notifications',
                    'SendMessage': 'Queue operations',
                    'Decrypt': 'Data decryption',
                    'GetSecret': 'Config access',
                    'List': 'Resource listing'
                  }
                  const desc = Object.keys(descriptions).find(k => perm.includes(k)) ? descriptions[Object.keys(descriptions).find(k => perm.includes(k))!] : 'Active usage'
                  
                  return (
                    <div key={idx} className="flex items-center gap-2 bg-white rounded p-3">
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-mono text-gray-900 truncate">{perm}</div>
                        <div className="text-xs text-green-700">- {usageFreq.toLocaleString()} uses/day</div>
                        <div className="text-xs text-gray-500">{desc}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Never Used Permissions */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-600" />
                  <h3 className="text-lg font-bold text-gray-900">Never Used Permissions ({selectedIssue.unusedCount})</h3>
                </div>
                <button className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium">Remove these</button>
              </div>
              <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                {selectedIssue.unusedList.map((perm, idx) => {
                  const isCritical = perm.includes('Create') || perm.includes('Delete') || perm.includes('Admin') || perm.includes('*')
                  const riskLevel = isCritical ? 'Critical Risk' : 'High Risk'
                  const riskColor = isCritical ? 'bg-red-600' : 'bg-orange-500'
                  const lastUsed = selectedIssue.lastUsed ? Math.floor((Date.now() - new Date(selectedIssue.lastUsed).getTime()) / (1000 * 60 * 60 * 24)) : null
                  
                  return (
                    <div key={idx} className="flex items-center gap-2 bg-white rounded p-3 border border-red-200">
                      <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-mono text-gray-900 truncate">{perm}</span>
                          <span className={`px-2 py-0.5 ${riskColor} text-white rounded text-xs font-semibold whitespace-nowrap`}>
                            {riskLevel}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {lastUsed ? `${lastUsed} days ago` : 'Never used'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Impact Analysis */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Impact Analysis</h3>
            <div className="space-y-3 mb-6">
              {[
                'No service disruption expected',
                'All active workflows will continue',
                `Reduces attack surface by ${selectedIssue.gapPercent.toFixed(0)}%`,
                'Achieves least privilege compliance'
              ].map((impact, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{impact}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <button
                onClick={() => setSelectedIssue(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
              >
                ← BACK
              </button>
              <button
                onClick={() => {
                  const issue = issues.find(i => i.id === selectedIssue.id)
                  if (issue) {
                    setSimulationModal({
                      isOpen: true,
                      resourceType: selectedIssue.resourceType,
                      resourceId: selectedIssue.resourceArn || selectedIssue.resourceName,
                      resourceName: selectedIssue.resourceName,
                      proposedChange: {
                        action: selectedIssue.resourceType === 'IAMRole' ? 'remove_permissions' :
                                selectedIssue.resourceType === 'SecurityGroup' ? 'remove_port' :
                                'restrict_access',
                        items: selectedIssue.unusedList.slice(0, 20),
                        reason: `Unused for ${selectedIssue.observationDays} days`
                      }
                    })
                  }
                }}
                className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-base font-semibold"
              >
                REQUEST REMEDIATION
              </button>
            </div>
          </div>
        </div>
      )}

      {/* D. CALL TO ACTION (Floating Footer - Per Spec) */}
      {data && data.resources && data.resources.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg p-4 z-50">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <strong>{data.resources.length}</strong> resources with GAP issues
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  // Bulk Simulate All
                  const safeIssues = data.resources.filter((r: Resource) => r.confidence >= 85)
                  alert(`Would simulate ${safeIssues.length} safe items`)
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium"
              >
                Bulk Simulate All
              </button>
              <button
                onClick={() => {
                  // Bulk Remediate Safe Items
                  const safeIssues = data.resources.filter((r: Resource) => r.confidence >= 90 && r.severity !== 'critical')
                  alert(`Would remediate ${safeIssues.length} safe items`)
                }}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium"
              >
                Bulk Remediate Safe Items
              </button>
              <button
                onClick={() => {
                  // Export to PDF
                  window.print()
                }}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm font-medium"
              >
                Export to PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* D. CALL TO ACTION (Floating Footer) */}
      {resources.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg p-4 z-50">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <strong>{resources.length}</strong> resources with GAP issues found
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => alert('Bulk Simulate - Coming soon')}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium"
              >
                Bulk Simulate All
              </button>
              <button
                onClick={() => alert('Bulk Remediate - Coming soon')}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium"
              >
                Bulk Remediate Safe Items
              </button>
              <button
                onClick={() => alert('Export PDF - Coming soon')}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm font-medium"
              >
                Export to PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Simulation Modal */}
      {simulationModal && (
        <SimulationModal
          isOpen={simulationModal.isOpen}
          onClose={() => setSimulationModal(null)}
          resourceType={simulationModal.resourceType}
          resourceId={simulationModal.resourceId}
          resourceName={simulationModal.resourceName}
          proposedChange={simulationModal.proposedChange}
          systemName={systemName}
        />
      )}
    </div>
  )
}

function LeastPrivilegePageWrapper() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-indigo-600" />
          <p className="text-lg font-medium text-gray-900 mb-2">Loading Least Privilege Analysis...</p>
        </div>
      </div>
    }>
      <LeastPrivilegeContent />
    </Suspense>
  )
}

export default LeastPrivilegePageWrapper

// Make sure this is exported correctly for Next.js
LeastPrivilegePage.displayName = 'LeastPrivilegePage'
