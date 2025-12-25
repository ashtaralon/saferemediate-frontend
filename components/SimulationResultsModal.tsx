"use client"

/**
 * Simulation Results Modal - Categorical Confidence Framework
 * 
 * Shows simulation results with:
 * - Categorical confidence (HIGH/MEDIUM/LOW/BLOCKED) instead of numeric
 * - Explicit policies (SG never auto-applies, etc.)
 * - Simulation steps with detailed criteria
 * - Edge case detection
 * - Proper timeout handling (REVIEW REQUIRED, not "50% SAFE")
 */

import { useState, useEffect } from 'react'
import { X, CheckCircle2, XCircle, AlertTriangle, Loader2, Shield, Clock, FileDown, Send, Zap, ChevronRight } from 'lucide-react'

interface ConfidenceCriteria {
  level: 'HIGH' | 'MEDIUM' | 'LOW' | 'BLOCKED'
  numeric?: number
  criteria_met: string[]
  criteria_failed: string[]
  disqualifiers_triggered: string[]
  summary: string
}

interface BlastRadius {
  level: 'ISOLATED' | 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN'
  numeric?: number
  affected_resources_count: number
  affected_resources: Array<{
    id: string
    type: string
    name: string
    impact: string
  }>
}

interface EdgeCase {
  case_id: string
  description: string
  detected: boolean
  action: string
  severity: string
}

interface SimulationStep {
  step_number: number
  name: string
  description: string
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'SKIPPED'
  duration_ms?: number
  result?: any
  error?: string
}

interface ActionPolicy {
  auto_apply: boolean
  allowed_actions: string[]
  reason: string
  issue_type?: string
}

interface SimulationResult {
  // Status
  status: 'EXECUTE' | 'CANARY' | 'REVIEW' | 'BLOCKED'
  timeout?: boolean
  
  // Categorical confidence
  confidence: ConfidenceCriteria | number  // Support both old (numeric) and new (categorical) format
  
  // Blast radius
  blast_radius: BlastRadius | number  // Support both formats
  
  // Evidence
  evidence?: {
    cloudtrail?: {
      total_events: number
      matched_events: number
      days_since_last_use?: number
      last_used?: string
    }
    flowlogs?: {
      total_flows: number
      matched_flows: number
    }
    summary?: {
      total_sources: number
      agreeing_sources: number
    }
  }
  
  // Simulation steps
  simulation_steps?: SimulationStep[]
  
  // Edge cases
  edge_cases?: EdgeCase[]
  
  // Action policy
  action_policy?: ActionPolicy
  
  // Other fields
  affected_resources_count?: number
  affected_resources?: Array<{
    id: string
    type: string
    name: string
    impact: string
    reason: string
  }>
  recommendation: string
  before_state_summary?: any
  after_state_summary?: any
  timestamp: string
  timeout_status?: {
    timed_out: boolean
    reason: string
    message: string
    partial_data: boolean
    action_policy?: string
  }
  human_readable_evidence?: string[]
  why_safe?: {
    summary: string
    reasons: string[]
    confidence_level: string
    risk_level: string
  }
}

interface SimulationResultsModalProps {
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
  result?: SimulationResult  // Optional: pass result directly (for testing)
}

export default function SimulationResultsModal({
  isOpen,
  onClose,
  resourceType,
  resourceId,
  resourceName,
  proposedChange,
  systemName,
  result: initialResult
}: SimulationResultsModalProps) {
  const [result, setResult] = useState<SimulationResult | null>(initialResult || null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'summary' | 'steps' | 'evidence' | 'edge-cases'>('summary')

  useEffect(() => {
    if (isOpen && !result && !initialResult) {
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
        signal: AbortSignal.timeout(60000) // 60s timeout
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

  // Helper: Normalize confidence to categorical format
  const getConfidence = (): ConfidenceCriteria => {
    if (!result) {
      return {
        level: 'BLOCKED',
        criteria_met: [],
        criteria_failed: ['no_simulation_data'],
        disqualifiers_triggered: [],
        summary: 'No simulation data available'
      }
    }
    
    // If already categorical
    if (typeof result.confidence === 'object' && 'level' in result.confidence) {
      return result.confidence as ConfidenceCriteria
    }
    
    // Convert numeric to categorical
    // Handle both 0-1 scale and 0-100 scale
    let numeric = typeof result.confidence === 'number' ? result.confidence : 0.5
    if (numeric > 1) {
      // Already in 0-100 scale, convert to 0-1
      numeric = numeric / 100
    }
    
    if (numeric >= 0.9) {
      return {
        level: 'HIGH',
        numeric,
        criteria_met: ['high_confidence_threshold'],
        criteria_failed: [],
        disqualifiers_triggered: [],
        summary: 'High confidence based on evidence'
      }
    } else if (numeric >= 0.7) {
      return {
        level: 'MEDIUM',
        numeric,
        criteria_met: ['medium_confidence_threshold'],
        criteria_failed: [],
        disqualifiers_triggered: [],
        summary: 'Medium confidence - some uncertainty'
      }
    } else if (numeric >= 0.5) {
      return {
        level: 'LOW',
        numeric,
        criteria_met: [],
        criteria_failed: ['low_confidence_threshold'],
        disqualifiers_triggered: [],
        summary: 'Low confidence - review required'
      }
    } else {
      return {
        level: 'BLOCKED',
        numeric,
        criteria_met: [],
        criteria_failed: ['insufficient_confidence'],
        disqualifiers_triggered: [],
        summary: 'Insufficient confidence - blocked'
      }
    }
  }

  // Helper: Normalize blast radius
  const getBlastRadius = (): BlastRadius => {
    if (!result) {
      return {
        level: 'UNKNOWN',
        affected_resources_count: 0,
        affected_resources: []
      }
    }
    
    if (typeof result.blast_radius === 'object' && 'level' in result.blast_radius) {
      return result.blast_radius as BlastRadius
    }
    
    const numeric = typeof result.blast_radius === 'number' ? result.blast_radius : 0.5
    const count = result.affected_resources_count || 0
    
    if (numeric < 0.05 && count === 0) {
      return { level: 'ISOLATED', numeric, affected_resources_count: count, affected_resources: result.affected_resources || [] }
    } else if (numeric < 0.1 && count < 5) {
      return { level: 'LOW', numeric, affected_resources_count: count, affected_resources: result.affected_resources || [] }
    } else if (numeric < 0.2 && count < 20) {
      return { level: 'MEDIUM', numeric, affected_resources_count: count, affected_resources: result.affected_resources || [] }
    } else {
      return { level: 'HIGH', numeric, affected_resources_count: count, affected_resources: result.affected_resources || [] }
    }
  }

  // Helper: Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'EXECUTE':
        return { bg: '#dcfce7', text: '#166534', border: '#86efac', icon: CheckCircle2 }
      case 'CANARY':
        return { bg: '#fef3c7', text: '#92400e', border: '#fde68a', icon: AlertTriangle }
      case 'REVIEW':
        return { bg: '#fed7aa', text: '#9a3412', border: '#fdba74', icon: AlertTriangle }
      case 'BLOCKED':
        return { bg: '#fee2e2', text: '#991b1b', border: '#fecaca', icon: XCircle }
      default:
        return { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb', icon: AlertTriangle }
    }
  }

  // Helper: Get confidence color
  const getConfidenceColor = (level: string) => {
    switch (level) {
      case 'HIGH':
        return { bg: '#dcfce7', text: '#166534', border: '#86efac' }
      case 'MEDIUM':
        return { bg: '#fef3c7', text: '#92400e', border: '#fde68a' }
      case 'LOW':
        return { bg: '#fed7aa', text: '#9a3412', border: '#fdba74' }
      case 'BLOCKED':
        return { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' }
      default:
        return { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' }
    }
  }

  if (!isOpen) return null

  const confidence = getConfidence()
  const blastRadius = getBlastRadius()
  const statusColors = result ? getStatusColor(result.status) : null
  const confidenceColors = getConfidenceColor(confidence.level)
  const StatusIcon = statusColors?.icon || AlertTriangle

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
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
              {/* Timeout Warning */}
              {result.timeout && result.timeout_status && (
                <div className="rounded-lg border-2 border-orange-300 bg-orange-50 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-orange-900 mb-1">⚠️ REVIEW REQUIRED</h3>
                      <p className="text-sm text-orange-800 mb-2">{result.timeout_status.message}</p>
                      <p className="text-xs text-orange-700">
                        Reason: {result.timeout_status.reason}
                      </p>
                      {result.timeout_status.action_policy && (
                        <p className="text-xs text-orange-700 mt-1">
                          Action Policy: <strong>{result.timeout_status.action_policy}</strong>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tabs */}
              <div className="border-b border-gray-200">
                <div className="flex gap-4">
                  {[
                    { id: 'summary', label: 'Summary' },
                    { id: 'steps', label: 'Simulation Steps' },
                    { id: 'evidence', label: 'Evidence' },
                    { id: 'edge-cases', label: 'Edge Cases' }
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

              {/* Summary Tab */}
              {activeTab === 'summary' && (
                <div className="space-y-6">
                  {/* Status Cards */}
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
                        {result.status === 'BLOCKED' && 'High risk - blocked'}
                      </div>
                    </div>

                    {/* Confidence (Categorical) */}
                    <div
                      className="rounded-lg p-4 border-2"
                      style={{
                        background: confidenceColors.bg,
                        borderColor: confidenceColors.border,
                        color: confidenceColors.text
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Shield className="w-5 h-5" />
                        <div className="text-sm font-medium">Confidence</div>
                      </div>
                      <div className="text-3xl font-bold">{confidence.level}</div>
                      {confidence.numeric !== undefined && (
                        <div className="text-xs mt-1 opacity-80">
                          {confidence.numeric > 1 
                            ? `${confidence.numeric.toFixed(0)}% numeric` 
                            : `${(confidence.numeric * 100).toFixed(0)}% numeric`}
                        </div>
                      )}
                      <div className="text-xs mt-1 opacity-80">
                        {confidence.summary}
                      </div>
                    </div>

                    {/* Blast Radius */}
                    <div className="rounded-lg p-4 border border-gray-200 bg-white">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-5 h-5 text-orange-600" />
                        <div className="text-sm text-gray-600">Blast Radius</div>
                      </div>
                      <div className="text-3xl font-bold text-gray-900">{blastRadius.level}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {blastRadius.affected_resources_count} resources affected
                      </div>
                    </div>
                  </div>

                  {/* Confidence Criteria */}
                  <div className="rounded-lg border border-gray-200 bg-white p-4">
                    <h3 className="font-semibold text-gray-900 mb-3">Confidence Criteria</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {confidence.criteria_met.length > 0 && (
                        <div>
                          <div className="text-sm font-medium text-green-700 mb-2">✓ Criteria Met</div>
                          <ul className="space-y-1">
                            {confidence.criteria_met.map((criterion, idx) => (
                              <li key={idx} className="text-xs text-gray-700 flex items-center gap-2">
                                <CheckCircle2 className="w-3 h-3 text-green-600" />
                                {criterion}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {confidence.criteria_failed.length > 0 && (
                        <div>
                          <div className="text-sm font-medium text-red-700 mb-2">✗ Criteria Failed</div>
                          <ul className="space-y-1">
                            {confidence.criteria_failed.map((criterion, idx) => (
                              <li key={idx} className="text-xs text-gray-700 flex items-center gap-2">
                                <XCircle className="w-3 h-3 text-red-600" />
                                {criterion}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    {confidence.disqualifiers_triggered.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="text-sm font-medium text-orange-700 mb-2">⚠️ Disqualifiers Triggered</div>
                        <ul className="space-y-1">
                          {confidence.disqualifiers_triggered.map((dq, idx) => (
                            <li key={idx} className="text-xs text-gray-700 flex items-center gap-2">
                              <AlertTriangle className="w-3 h-3 text-orange-600" />
                              {dq}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Action Policy */}
                  {result.action_policy && (
                    <div className="rounded-lg border border-gray-200 bg-white p-4">
                      <h3 className="font-semibold text-gray-900 mb-3">Action Policy</h3>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-700">Auto-Apply Allowed:</span>
                          <span className={`text-sm font-medium ${result.action_policy.auto_apply ? 'text-green-600' : 'text-red-600'}`}>
                            {result.action_policy.auto_apply ? 'Yes' : 'No'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-700">Allowed Actions:</span>
                          <div className="flex gap-2">
                            {result.action_policy.allowed_actions.map((action, idx) => (
                              <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                                {action}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="text-sm text-gray-600 mt-2">
                          <strong>Reason:</strong> {result.action_policy.reason}
                        </div>
                        {result.action_policy.issue_type && (
                          <div className="text-xs text-gray-500 mt-1">
                            Issue Type: {result.action_policy.issue_type}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Recommendation */}
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
                      {result.status === 'BLOCKED' && <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />}
                      <div>
                        <div className="font-semibold text-gray-900 mb-1">Recommendation</div>
                        <p className="text-sm text-gray-700">{result.recommendation}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Simulation Steps Tab */}
              {activeTab === 'steps' && (
                <div className="space-y-4">
                  {result.simulation_steps && result.simulation_steps.length > 0 ? (
                    result.simulation_steps.map((step, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                            step.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                            step.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                            step.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                            step.status === 'SKIPPED' ? 'bg-gray-100 text-gray-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {step.step_number}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900">{step.name}</div>
                            <div className="text-sm text-gray-600">{step.description}</div>
                          </div>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                          step.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                          step.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                          step.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                          step.status === 'SKIPPED' ? 'bg-gray-100 text-gray-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {step.status}
                        </div>
                      </div>
                      {step.duration_ms && (
                        <div className="text-xs text-gray-500 mt-2">
                          Duration: {step.duration_ms}ms
                        </div>
                      )}
                      {step.error && (
                        <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                          Error: {step.error}
                        </div>
                      )}
                    </div>
                  ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <AlertTriangle className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                      <p>No simulation steps available</p>
                      <p className="text-xs mt-1">Simulation steps will appear here once the analysis is complete</p>
                    </div>
                  )}
                </div>
              )}

              {/* Evidence Tab */}
              {activeTab === 'evidence' && (
                <div className="space-y-4">
                  {result.evidence && (
                    <>
                      {result.evidence.cloudtrail && (
                        <div className="border border-gray-200 rounded-lg p-4">
                          <h3 className="font-semibold text-gray-900 mb-3">CloudTrail Evidence</h3>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-sm text-gray-600">Total Events</div>
                              <div className="text-lg font-bold text-gray-900">{result.evidence.cloudtrail.total_events}</div>
                            </div>
                            <div>
                              <div className="text-sm text-gray-600">Matched Events</div>
                              <div className="text-lg font-bold text-gray-900">{result.evidence.cloudtrail.matched_events}</div>
                            </div>
                            {result.evidence.cloudtrail.days_since_last_use !== undefined && (
                              <div>
                                <div className="text-sm text-gray-600">Days Since Last Use</div>
                                <div className="text-lg font-bold text-gray-900">{result.evidence.cloudtrail.days_since_last_use}</div>
                              </div>
                            )}
                          </div>
                          {result.evidence.cloudtrail.matched_events === 0 && (
                            <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-800">
                              ✅ No usage detected - HIGH confidence this is safe to remove
                            </div>
                          )}
                        </div>
                      )}
                      {result.evidence.flowlogs && (
                        <div className="border border-gray-200 rounded-lg p-4">
                          <h3 className="font-semibold text-gray-900 mb-3">VPC Flow Logs Evidence</h3>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-sm text-gray-600">Total Flows</div>
                              <div className="text-lg font-bold text-gray-900">{result.evidence.flowlogs.total_flows}</div>
                            </div>
                            <div>
                              <div className="text-sm text-gray-600">Matched Flows</div>
                              <div className="text-lg font-bold text-gray-900">{result.evidence.flowlogs.matched_flows}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {!result.evidence && (
                    <div className="text-sm text-gray-500 text-center py-4">No evidence data available</div>
                  )}
                  {result.human_readable_evidence && result.human_readable_evidence.length > 0 && (
                    <div className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-900 mb-3">Human-Readable Evidence</h3>
                      <ul className="space-y-2">
                        {result.human_readable_evidence.map((evidence, idx) => (
                          <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                            <span className="mt-0.5">•</span>
                            <span>{evidence}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Edge Cases Tab */}
              {activeTab === 'edge-cases' && (
                <div className="space-y-4">
                  {result.edge_cases && result.edge_cases.length > 0 ? (
                    result.edge_cases.map((edgeCase, idx) => (
                      <div key={idx} className="border border-orange-200 rounded-lg p-4 bg-orange-50">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="font-semibold text-orange-900">{edgeCase.description}</div>
                            <div className="text-sm text-orange-700 mt-1">Case ID: {edgeCase.case_id}</div>
                          </div>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            edgeCase.severity === 'CRITICAL' ? 'bg-red-600 text-white' :
                            edgeCase.severity === 'HIGH' ? 'bg-orange-600 text-white' :
                            'bg-yellow-600 text-white'
                          }`}>
                            {edgeCase.severity}
                          </span>
                        </div>
                        {edgeCase.action && (
                          <div className="text-sm text-orange-800 mt-2">
                            <strong>Action:</strong> {edgeCase.action}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-500" />
                      <p>No edge cases detected</p>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 text-sm font-medium"
                >
                  Close
                </button>
                
                {result.status === 'EXECUTE' && result.action_policy?.auto_apply && (
                  <button
                    onClick={() => {
                      alert('Execute remediation - Coming soon')
                      onClose()
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium flex items-center gap-2"
                  >
                    <Zap className="w-4 h-4" />
                    Auto-Apply
                  </button>
                )}
                
                {result.status !== 'BLOCKED' && (
                  <>
                    <button
                      onClick={() => {
                        alert('Request Approval - Coming soon')
                      }}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium flex items-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                      Request Approval
                    </button>
                    <button
                      onClick={() => {
                        alert('Export Terraform - Coming soon')
                      }}
                      className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm font-medium flex items-center gap-2"
                    >
                      <FileDown className="w-4 h-4" />
                      Export Terraform
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
