"use client"

import { useState, useEffect } from 'react'
import { X, CheckCircle2, XCircle, AlertTriangle, Loader2, TrendingUp, Users, Shield, Database, Network } from 'lucide-react'

interface SimulationResult {
  status: 'EXECUTE' | 'CANARY' | 'REVIEW' | 'BLOCK'
  confidence: number
  safety_score: number
  blast_radius: number
  affected_resources_count: number
  affected_resources: Array<{
    id: string
    arn?: string
    type: string
    name: string
    impact: string
    reason: string
  }>
  evidence: {
    cloudtrail: {
      total_events: number
      matched_events: number
      last_used?: string
      days_since_last_use?: number
    }
    flowlogs: {
      total_flows: number
      matched_flows: number
    }
    triggers: {
      has_dependencies: boolean
    }
    summary: {
      total_sources: number
      agreeing_sources: number
    }
  }
  recommendation: string
  health_validation: number
  rollback_readiness: number
  timestamp: string
}

interface SimulationModalProps {
  isOpen: boolean
  onClose: () => void
  resourceType: string
  resourceId: string
  resourceName: string
  proposedChange: {
    action: string
    items: string[]
    reason: string
  }
  systemName?: string
}

export default function SimulationModal({
  isOpen,
  onClose,
  resourceType,
  resourceId,
  resourceName,
  proposedChange,
  systemName
}: SimulationModalProps) {
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && !result) {
      runSimulation()
    }
  }, [isOpen])

  const runSimulation = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/proxy/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_type: resourceType,
          resource_id: resourceId,
          proposed_change: proposedChange,
          system_name: systemName
        }),
        signal: AbortSignal.timeout(60000) // 60s timeout for simulation
      })

      if (!response.ok) {
        throw new Error(`Simulation failed: ${response.status}`)
      }

      const data = await response.json()
      setResult(data)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      console.error('[Simulation] Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'EXECUTE':
        return { bg: '#dcfce7', text: '#166534', border: '#86efac', icon: CheckCircle2 }
      case 'CANARY':
        return { bg: '#fef3c7', text: '#92400e', border: '#fde68a', icon: AlertTriangle }
      case 'REVIEW':
        return { bg: '#fed7aa', text: '#9a3412', border: '#fdba74', icon: AlertTriangle }
      case 'BLOCK':
        return { bg: '#fee2e2', text: '#991b1b', border: '#fecaca', icon: XCircle }
      default:
        return { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb', icon: AlertTriangle }
    }
  }

  const getResourceTypeIcon = (type: string) => {
    if (type.includes('IAM') || type.includes('Role')) return <Shield className="w-4 h-4" />
    if (type.includes('Security') || type.includes('Group')) return <Network className="w-4 h-4" />
    if (type.includes('S3') || type.includes('Bucket')) return <Database className="w-4 h-4" />
    return <Users className="w-4 h-4" />
  }

  if (!isOpen) return null

  const statusColors = result ? getStatusColor(result.status) : null
  const StatusIcon = statusColors?.icon || AlertTriangle

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Simulation Results</h2>
            <p className="text-sm text-gray-600 mt-1">
              Analyzing: <strong>{resourceName}</strong> ({resourceType})
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-indigo-600" />
                <p className="text-lg font-medium text-gray-900 mb-2">Running Simulation...</p>
                <p className="text-sm text-gray-500">
                  Building virtual infrastructure replica and computing blast radius...
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-900 mb-1">Simulation Error</h3>
                  <p className="text-sm text-red-700">{error}</p>
                  <button
                    onClick={runSimulation}
                    className="mt-3 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
                  >
                    Retry Simulation
                  </button>
                </div>
              </div>
            </div>
          )}

          {result && (
            <>
              {/* A. Top Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Status */}
                <div
                  className="rounded-lg p-4 border-2"
                  style={{
                    background: statusColors.bg,
                    borderColor: statusColors.border,
                    color: statusColors.text
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <StatusIcon className="w-5 h-5" />
                    <div className="text-sm font-medium uppercase">Status</div>
                  </div>
                  <div className="text-3xl font-bold">{result.status}</div>
                  <div className="text-xs mt-1 opacity-80">
                    {result.status === 'EXECUTE' && 'Safe to proceed'}
                    {result.status === 'CANARY' && 'Run canary first'}
                    {result.status === 'REVIEW' && 'Manual review needed'}
                    {result.status === 'BLOCK' && 'High risk - blocked'}
                  </div>
                </div>

                {/* Confidence */}
                <div className="rounded-lg p-4 border border-gray-200 bg-white">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-5 h-5 text-indigo-600" />
                    <div className="text-sm text-gray-600">Confidence</div>
                  </div>
                  <div className="text-3xl font-bold text-gray-900">
                    {(result.confidence * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Based on multi-source evidence
                  </div>
                </div>

                {/* Blast Radius */}
                <div className="rounded-lg p-4 border border-gray-200 bg-white">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-5 h-5 text-orange-600" />
                    <div className="text-sm text-gray-600">Blast Radius</div>
                  </div>
                  <div className="text-3xl font-bold text-gray-900">
                    {(result.blast_radius * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {result.affected_resources_count} resources affected
                  </div>
                </div>
              </div>

              {/* Safety Score */}
              <div className="rounded-lg p-4 border border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-1">Safety Score</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {(result.safety_score * 100).toFixed(0)}%
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Health: {(result.health_validation * 100).toFixed(0)}% • 
                      Rollback Ready: {(result.rollback_readiness * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-600">Formula</div>
                    <div className="text-xs font-mono text-gray-500 mt-1">
                      Confidence × Health × Rollback × (1 - BlastRadius)
                    </div>
                  </div>
                </div>
              </div>

              {/* B. Affected Resources */}
              {result.affected_resources.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-white">
                  <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                    <h3 className="font-semibold text-gray-900">Affected Resources</h3>
                    <p className="text-xs text-gray-600 mt-1">
                      {result.affected_resources.length} resources will be impacted by this change
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Resource</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Impact</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {result.affected_resources.map((resource, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {getResourceTypeIcon(resource.type)}
                                <div>
                                  <div className="text-sm font-medium text-gray-900">{resource.name}</div>
                                  {resource.arn && (
                                    <div className="text-xs text-gray-500 truncate max-w-xs">{resource.arn}</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-600">{resource.type}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-sm font-medium ${
                                resource.impact.includes('❌') ? 'text-red-600' :
                                resource.impact.includes('⚠️') ? 'text-yellow-600' :
                                'text-green-600'
                              }`}>
                                {resource.impact}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-600">{resource.reason}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* C. Evidence */}
              <div className="rounded-lg border border-gray-200 bg-white">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <h3 className="font-semibold text-gray-900">Evidence</h3>
                  <p className="text-xs text-gray-600 mt-1">
                    Multi-source validation from {result.evidence.summary.total_sources} sources
                  </p>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* CloudTrail */}
                  <div className="p-3 bg-blue-50 rounded border border-blue-200">
                    <div className="text-sm font-medium text-blue-900 mb-2">CloudTrail</div>
                    <div className="text-xs text-blue-700 space-y-1">
                      <div>Total Events: {result.evidence.cloudtrail.total_events}</div>
                      <div>Matched: {result.evidence.cloudtrail.matched_events}</div>
                      {result.evidence.cloudtrail.days_since_last_use !== undefined && (
                        <div>Last Used: {result.evidence.cloudtrail.days_since_last_use} days ago</div>
                      )}
                    </div>
                  </div>

                  {/* VPC Flow Logs */}
                  <div className="p-3 bg-green-50 rounded border border-green-200">
                    <div className="text-sm font-medium text-green-900 mb-2">VPC Flow Logs</div>
                    <div className="text-xs text-green-700 space-y-1">
                      <div>Total Flows: {result.evidence.flowlogs.total_flows}</div>
                      <div>Matched: {result.evidence.flowlogs.matched_flows}</div>
                    </div>
                  </div>

                  {/* Triggers */}
                  <div className="p-3 bg-yellow-50 rounded border border-yellow-200">
                    <div className="text-sm font-medium text-yellow-900 mb-2">Dependencies</div>
                    <div className="text-xs text-yellow-700 space-y-1">
                      <div>Has Dependencies: {result.evidence.triggers.has_dependencies ? 'Yes' : 'No'}</div>
                      <div>Agreeing Sources: {result.evidence.summary.agreeing_sources}/{result.evidence.summary.total_sources}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* D. Recommendation */}
              <div className={`rounded-lg p-4 border-2 ${
                result.status === 'EXECUTE' ? 'bg-green-50 border-green-200' :
                result.status === 'CANARY' ? 'bg-yellow-50 border-yellow-200' :
                result.status === 'REVIEW' ? 'bg-orange-50 border-orange-200' :
                'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-start gap-3">
                  {result.status === 'EXECUTE' && <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />}
                  {result.status === 'CANARY' && <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />}
                  {result.status === 'REVIEW' && <AlertTriangle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5" />}
                  {result.status === 'BLOCK' && <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />}
                  <div>
                    <div className="font-semibold text-gray-900 mb-1">Recommendation</div>
                    <p className="text-sm text-gray-700">{result.recommendation}</p>
                  </div>
                </div>
              </div>

              {/* E. Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 text-sm font-medium"
                >
                  Cancel
                </button>
                
                {result.status === 'EXECUTE' && (
                  <button
                    onClick={() => {
                      alert('Execute remediation - Coming soon')
                      onClose()
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium"
                  >
                    Proceed (Execute)
                  </button>
                )}
                
                {(result.status === 'CANARY' || result.status === 'REVIEW') && (
                  <button
                    onClick={() => {
                      alert('Run Canary Deployment - Coming soon')
                      onClose()
                    }}
                    className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 text-sm font-medium"
                  >
                    Run Canary Deployment
                  </button>
                )}
                
                {result.status !== 'BLOCK' && (
                  <button
                    onClick={() => {
                      alert('Proceed with caution - Coming soon')
                      onClose()
                    }}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium"
                  >
                    Proceed Anyway
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
