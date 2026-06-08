"use client"

/**
 * Simulation Results Modal - Redesigned to match ConfidenceExplanationPanel
 *
 * Visual language:
 * - Dark slate background (bg-slate-900)
 * - Compact confidence score header (single display)
 * - Routing badges inline with score
 * - ENV: PROD pill badge
 * - "Why this score" explanation section
 * - Signal chips for visibility
 * - Clear separation: confidence = behavioral data certainty, approval = policy rule
 *
 * Tabs: Summary | Permissions | Context
 */

import { useState, useEffect } from 'react'
import { X, Loader2, Shield, CheckCircle2, AlertTriangle, XCircle, Zap, FileDown, Send } from 'lucide-react'

// =============================================================================
// TYPES
// =============================================================================

type ConfidenceRouting = 'auto_execute' | 'human_approval' | 'manual_review' | 'blocked'
type LLMReviewVerdict = 'agree' | 'escalate' | 'block'

interface SimulationResult {
  status: 'EXECUTE' | 'CANARY' | 'REVIEW' | 'BLOCKED'
  timeout?: boolean
  confidence: number | { level: string; numeric?: number; summary?: string }
  blast_radius: number | { level: string; affected_resources_count: number }
  affected_resources_count?: number
  affected_resources?: Array<{ id: string; type: string; name: string; impact: string; reason?: string }>
  recommendation: string
  evidence?: {
    cloudtrail?: { total_events: number; matched_events: number; days_since_last_use?: number }
    flowlogs?: { total_flows: number; matched_flows: number }
  }
  human_readable_evidence?: string[]
  why_safe?: { summary: string; reasons: string[]; confidence_level: string; risk_level: string }
  timeout_status?: { timed_out: boolean; reason: string; message: string; partial_data: boolean; action_policy?: string }
  // Confidence scorer fields (from backend)
  routing?: ConfidenceRouting
  routing_deterministic?: ConfidenceRouting
  visibility_integrity?: number
  signals_available?: Record<string, boolean>
  llm_review?: { verdict: LLMReviewVerdict; reason: string }
  llm_explanation?: string
  gates_failed?: Array<{ gate: string; severity: 'hard_block' | 'warn'; detail: string }>
  resource_tags?: { environment?: string; system?: string; owner?: string; compliance?: string }
  timestamp: string
}

interface SimulationResultsModalProps {
  isOpen: boolean
  onClose: () => void
  resourceType: string
  resourceId: string
  resourceName: string
  proposedChange: { action: string; items: string[]; reason: string }
  systemName?: string
  result?: SimulationResult
  onExecute?: (dryRun: boolean) => Promise<void>
  isExecuting?: boolean
}

// =============================================================================
// STYLE CONSTANTS (matching ConfidenceExplanationPanel)
// =============================================================================

const ROUTING_STYLE: Record<ConfidenceRouting, { label: string; color: string; bg: string }> = {
  auto_execute:   { label: 'Safe to apply',   color: '#15803d', bg: '#dcfce7' },
  human_approval: { label: 'Needs approval',  color: '#a16207', bg: '#fef3c7' },
  manual_review:  { label: 'Review required', color: '#b91c1c', bg: '#fee2e2' },
  blocked:        { label: 'Blocked',         color: '#991b1b', bg: '#fecaca' },
}

const REVIEW_STYLE: Record<LLMReviewVerdict, { label: string; color: string; bg: string; border: string }> = {
  agree:    { label: 'AI reviewer agrees',    color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  escalate: { label: 'AI reviewer escalated', color: '#a16207', bg: '#fffbeb', border: '#fde68a' },
  block:    { label: 'AI reviewer blocked',   color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
}

const ENV_STYLE: Record<string, { color: string; bg: string }> = {
  prod:    { color: '#fef2f2', bg: '#991b1b' },  // Inverted for dark theme
  staging: { color: '#fef3c7', bg: '#a16207' },
  dev:     { color: '#dcfce7', bg: '#166534' },
  test:    { color: '#dbeafe', bg: '#1d4ed8' },
  unknown: { color: '#e2e8f0', bg: '#475569' },
}

const SIGNAL_LABELS: Record<string, string> = {
  control_plane_telemetry: 'Control-plane telemetry',
  data_plane_telemetry:    'Data-plane telemetry',
  usage_telemetry:         'Usage telemetry',
  runtime_telemetry:       'Runtime telemetry',
  execution_triggers:      'Execution triggers',
  trust_graph:             'Trust graph',
  resource_metadata:       'Resource metadata',
  resource_indexed:        'Resource indexed',
  attachment_graph:        'Attachment graph',
  policy_inventory:        'Policy inventory',
  network_flow_telemetry:  'Network flow telemetry',
  public_exposure_controls: 'Public exposure controls',
  access_policy_analyzed:   'Access policy analyzed',
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function scoreColor(n: number): string {
  if (n >= 95) return '#22c55e'  // green-500
  if (n >= 80) return '#eab308'  // yellow-500
  if (n >= 60) return '#f97316'  // orange-500
  return '#ef4444'               // red-500
}

function prettifySignalKey(key: string): string {
  return SIGNAL_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function getNumericConfidence(confidence: SimulationResult['confidence']): number {
  if (typeof confidence === 'number') {
    return confidence > 1 ? confidence : confidence * 100
  }
  if (typeof confidence === 'object' && confidence.numeric !== undefined) {
    return confidence.numeric > 1 ? confidence.numeric : confidence.numeric * 100
  }
  // Fallback based on categorical level
  if (typeof confidence === 'object' && confidence.level) {
    switch (confidence.level) {
      case 'HIGH': return 95
      case 'MEDIUM': return 75
      case 'LOW': return 50
      default: return 25
    }
  }
  return 50
}

function getRouting(result: SimulationResult): ConfidenceRouting {
  if (result.routing) return result.routing
  // Derive from status
  switch (result.status) {
    case 'EXECUTE': return 'auto_execute'
    case 'CANARY': return 'human_approval'
    case 'REVIEW': return 'manual_review'
    case 'BLOCKED': return 'blocked'
    default: return 'manual_review'
  }
}

function splitExplanation(text: string): { headline: string; details: string } {
  const trimmed = text.trim()
  const lineBreak = trimmed.indexOf('\n\n')
  if (lineBreak !== -1) {
    return { headline: trimmed.slice(0, lineBreak).trim(), details: trimmed.slice(lineBreak + 2).trim() }
  }
  const firstStop = trimmed.search(/\.\s/)
  if (firstStop !== -1) {
    return { headline: trimmed.slice(0, firstStop).trim(), details: trimmed.slice(firstStop + 1).trim() }
  }
  return { headline: trimmed, details: '' }
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function SimulationResultsModal({
  isOpen,
  onClose,
  resourceType,
  resourceId,
  resourceName,
  proposedChange,
  systemName,
  result: initialResult,
  onExecute,
  isExecuting = false
}: SimulationResultsModalProps) {
  const [result, setResult] = useState<SimulationResult | null>(initialResult || null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'summary' | 'permissions' | 'context'>('summary')

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
        signal: AbortSignal.timeout(60000)
      })
      if (!response.ok) throw new Error(`Simulation failed: ${response.status}`)
      const data = await response.json()
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  // Derived values
  const confidence = result ? getNumericConfidence(result.confidence) : 0
  const routing = result ? getRouting(result) : 'manual_review'
  const routingStyle = ROUTING_STYLE[routing]
  const visibilityInt = result?.visibility_integrity ?? 0.75
  const signals = result?.signals_available ?? {}
  const signalsOn = Object.entries(signals).filter(([, v]) => v).map(([k]) => k)
  const signalsOff = Object.entries(signals).filter(([, v]) => !v).map(([k]) => k)
  const gates = result?.gates_failed ?? []
  const hardBlocks = gates.filter(g => g.severity === 'hard_block')
  const warnings = gates.filter(g => g.severity === 'warn')
  const resourceTags = result?.resource_tags
  const env = (resourceTags?.environment || 'prod').toLowerCase()
  const envStyle = ENV_STYLE[env] ?? ENV_STYLE.unknown
  const explanation = result?.llm_explanation ? splitExplanation(result.llm_explanation) : null
  const isProd = env === 'prod'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-900 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden border border-slate-700">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1">
                Simulation Results
              </p>
              <h2 className="text-lg font-bold text-white">{resourceName}</h2>
              <p className="text-sm text-slate-400">
                {resourceId} · {resourceType} · {systemName || 'Unknown System'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-400 mb-4" />
              <p className="text-white font-medium">Running Simulation...</p>
              <p className="text-sm text-slate-400 mt-1">Analyzing behavioral data and computing blast radius</p>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4">
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-300">Simulation Error</p>
                  <p className="text-sm text-red-400 mt-1">{error}</p>
                  <button
                    onClick={runSimulation}
                    className="mt-3 px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                  >
                    Retry
                  </button>
                </div>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              {/* ============================================================= */}
              {/* CONFIDENCE SCORE PANEL (matching ConfidenceExplanationPanel)  */}
              {/* ============================================================= */}
              <div className="rounded-lg border border-slate-600 bg-slate-800 p-4 space-y-3">
                {/* Agent label + Routing badge */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    Agent 5 · Confidence Scorer
                  </span>
                  <span
                    className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase"
                    style={{ background: routingStyle.bg, color: routingStyle.color }}
                  >
                    {routingStyle.label}
                  </span>
                </div>

                {/* Score display */}
                <div className="flex items-baseline gap-3">
                  <span
                    className="text-3xl font-bold tabular-nums"
                    style={{ color: scoreColor(confidence) }}
                  >
                    {Math.round(confidence)}
                  </span>
                  <span className="text-xs text-slate-400">confidence / 100</span>
                  <span className="ml-auto text-xs text-slate-400">
                    Visibility {Math.round(visibilityInt * 100)}%
                  </span>
                </div>

                {/* ENV + System badges */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                    style={{ background: envStyle.bg, color: envStyle.color }}
                  >
                    env: {env}
                  </span>
                  {resourceTags?.system && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-700 text-slate-300">
                      system: {resourceTags.system}
                    </span>
                  )}
                  {resourceTags?.owner && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-700 text-slate-300">
                      owner: {resourceTags.owner}
                    </span>
                  )}
                </div>

                {/* Production approval policy notice */}
                {isProd && routing === 'human_approval' && (
                  <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3">
                    <div className="flex items-start gap-2">
                      <Shield className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                          Production Approval Required
                        </p>
                        <p className="text-xs text-amber-300/80 mt-1">
                          High confidence score indicates this fix is safe based on behavioral data.
                          Production changes require human approval as a policy safeguard, not due to uncertainty.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* AI Reviewer verdict */}
                {result.llm_review && (
                  <div
                    className="rounded border p-3"
                    style={{
                      borderColor: REVIEW_STYLE[result.llm_review.verdict].border,
                      background: REVIEW_STYLE[result.llm_review.verdict].bg
                    }}
                  >
                    <p
                      className="text-[11px] font-semibold uppercase tracking-wider mb-1"
                      style={{ color: REVIEW_STYLE[result.llm_review.verdict].color }}
                    >
                      {REVIEW_STYLE[result.llm_review.verdict].label}
                    </p>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: REVIEW_STYLE[result.llm_review.verdict].color }}
                    >
                      {result.llm_review.reason}
                    </p>
                  </div>
                )}

                {/* Why this score */}
                {explanation ? (
                  <div className="rounded border border-slate-600 bg-slate-700/50 p-3 space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Why this score
                    </p>
                    <p className="text-sm font-semibold text-white leading-snug">
                      {explanation.headline}
                    </p>
                    {explanation.details && (
                      <p className="text-sm text-slate-300 leading-relaxed">
                        {explanation.details}
                      </p>
                    )}
                  </div>
                ) : result.why_safe ? (
                  <div className="rounded border border-slate-600 bg-slate-700/50 p-3 space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Why this score
                    </p>
                    <p className="text-sm font-semibold text-white leading-snug">
                      {result.why_safe.summary}
                    </p>
                    {result.why_safe.reasons.length > 0 && (
                      <ul className="text-sm text-slate-300 mt-2 space-y-1">
                        {result.why_safe.reasons.map((r, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <CheckCircle2 className="w-3 h-3 text-green-400 mt-1 flex-shrink-0" />
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}

                {/* Hard blocks */}
                {hardBlocks.length > 0 && (
                  <div className="rounded border border-red-500/40 bg-red-500/10 p-3">
                    <p className="text-xs font-semibold text-red-400 mb-1">Hard Blocks</p>
                    <ul className="space-y-1">
                      {hardBlocks.map((g, i) => (
                        <li key={i} className="text-sm text-red-300 flex items-start gap-2">
                          <XCircle className="w-3 h-3 mt-1 flex-shrink-0" />
                          <span><strong>{g.gate}:</strong> {g.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Warnings */}
                {warnings.length > 0 && (
                  <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3">
                    <p className="text-xs font-semibold text-amber-400 mb-1">Warnings</p>
                    <ul className="space-y-1">
                      {warnings.map((g, i) => (
                        <li key={i} className="text-sm text-amber-300 flex items-start gap-2">
                          <AlertTriangle className="w-3 h-3 mt-1 flex-shrink-0" />
                          <span><strong>{g.gate}:</strong> {g.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Signal chips */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {signalsOn.map(s => (
                    <span
                      key={s}
                      className="px-2 py-0.5 rounded text-[10px] font-medium bg-green-500/20 text-green-400"
                    >
                      ✓ {prettifySignalKey(s)}
                    </span>
                  ))}
                  {signalsOff.map(s => (
                    <span
                      key={s}
                      className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-700 text-slate-500"
                    >
                      ✗ {prettifySignalKey(s)}
                    </span>
                  ))}
                </div>
              </div>

              {/* ============================================================= */}
              {/* TABS: Summary | Permissions | Context                         */}
              {/* ============================================================= */}
              <div className="border-b border-slate-700">
                <div className="flex gap-1">
                  {(['summary', 'permissions', 'context'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                        activeTab === tab
                          ? 'text-white border-b-2 border-indigo-400'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              {/* ============================================================= */}
              {/* TAB CONTENT                                                   */}
              {/* ============================================================= */}
              <div className="pt-2">
                {/* Summary Tab */}
                {activeTab === 'summary' && (
                  <div className="space-y-4">
                    {/* Timeout warning */}
                    {result.timeout && result.timeout_status && (
                      <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 p-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0" />
                          <div>
                            <p className="font-semibold text-orange-300">Review Required</p>
                            <p className="text-sm text-orange-400 mt-1">{result.timeout_status.message}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Proposed change */}
                    <div className="rounded-lg border border-slate-600 bg-slate-800 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                        Proposed Change
                      </p>
                      <p className="text-sm text-white font-medium">{proposedChange.action}</p>
                      <p className="text-xs text-slate-400 mt-1">{proposedChange.reason}</p>
                      {proposedChange.items.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {proposedChange.items.slice(0, 5).map((item, i) => (
                            <li key={i} className="text-xs text-slate-300 font-mono bg-slate-700/50 px-2 py-1 rounded">
                              {item}
                            </li>
                          ))}
                          {proposedChange.items.length > 5 && (
                            <li className="text-xs text-slate-500">
                              +{proposedChange.items.length - 5} more items
                            </li>
                          )}
                        </ul>
                      )}
                    </div>

                    {/* Blast radius */}
                    <div className="rounded-lg border border-slate-600 bg-slate-800 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                        Blast Radius
                      </p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-white">
                          {result.affected_resources_count ?? 0}
                        </span>
                        <span className="text-sm text-slate-400">resources affected</span>
                      </div>
                      {result.affected_resources && result.affected_resources.length > 0 && (
                        <ul className="mt-3 space-y-2">
                          {result.affected_resources.slice(0, 3).map((r, i) => (
                            <li key={i} className="text-xs text-slate-300 bg-slate-700/50 px-2 py-1.5 rounded">
                              <span className="font-medium">{r.name || r.id}</span>
                              <span className="text-slate-500 ml-2">({r.type})</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Recommendation */}
                    <div className="rounded-lg border border-slate-600 bg-slate-800 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                        Recommendation
                      </p>
                      <p className="text-sm text-slate-200">{result.recommendation}</p>
                    </div>
                  </div>
                )}

                {/* Permissions Tab */}
                {activeTab === 'permissions' && (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-slate-600 bg-slate-800 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
                        Items to Remove
                      </p>
                      {proposedChange.items.length > 0 ? (
                        <ul className="space-y-2">
                          {proposedChange.items.map((item, i) => (
                            <li key={i} className="flex items-center gap-3 text-sm">
                              <div className="w-5 h-5 rounded border border-red-500/40 bg-red-500/10 flex items-center justify-center">
                                <X className="w-3 h-3 text-red-400" />
                              </div>
                              <span className="font-mono text-slate-300">{item}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-slate-500">No specific items listed</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Context Tab */}
                {activeTab === 'context' && (
                  <div className="space-y-4">
                    {/* Evidence */}
                    {result.evidence && (
                      <div className="rounded-lg border border-slate-600 bg-slate-800 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
                          Behavioral Evidence
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                          {result.evidence.cloudtrail && (
                            <div>
                              <p className="text-xs text-slate-500 mb-1">CloudTrail Events</p>
                              <p className="text-lg font-bold text-white">
                                {result.evidence.cloudtrail.matched_events}
                                <span className="text-sm font-normal text-slate-400">
                                  {' '}/ {result.evidence.cloudtrail.total_events}
                                </span>
                              </p>
                            </div>
                          )}
                          {result.evidence.flowlogs && (
                            <div>
                              <p className="text-xs text-slate-500 mb-1">VPC Flow Logs</p>
                              <p className="text-lg font-bold text-white">
                                {result.evidence.flowlogs.matched_flows}
                                <span className="text-sm font-normal text-slate-400">
                                  {' '}/ {result.evidence.flowlogs.total_flows}
                                </span>
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Human-readable evidence */}
                    {result.human_readable_evidence && result.human_readable_evidence.length > 0 && (
                      <div className="rounded-lg border border-slate-600 bg-slate-800 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
                          Evidence Summary
                        </p>
                        <ul className="space-y-2">
                          {result.human_readable_evidence.map((e, i) => (
                            <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                              <span className="text-slate-500">•</span>
                              <span>{e}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Resource metadata */}
                    {resourceTags && (
                      <div className="rounded-lg border border-slate-600 bg-slate-800 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
                          Resource Metadata
                        </p>
                        <dl className="grid grid-cols-2 gap-3">
                          {Object.entries(resourceTags).map(([k, v]) => v && (
                            <div key={k}>
                              <dt className="text-xs text-slate-500 capitalize">{k}</dt>
                              <dd className="text-sm text-white">{v}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {result && (
          <div className="px-6 py-4 border-t border-slate-700 bg-slate-800/50 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              disabled={isExecuting}
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors disabled:opacity-50"
            >
              Close
            </button>

            {result.status !== 'BLOCKED' && onExecute && (
              <>
                <button
                  onClick={() => onExecute(true)}
                  disabled={isExecuting}
                  className="px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {isExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  Preview Changes
                </button>

                {(result.status === 'EXECUTE' || confidence >= 90) && (
                  <button
                    onClick={() => onExecute(false)}
                    disabled={isExecuting}
                    className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    Execute Live
                  </button>
                )}
              </>
            )}

            {result.status !== 'BLOCKED' && !onExecute && (
              <>
                <button
                  onClick={() => alert('Request Approval - Coming soon')}
                  className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Request Approval
                </button>
                <button
                  onClick={() => alert('Export Terraform - Coming soon')}
                  className="px-4 py-2 text-sm font-medium bg-slate-600 text-white rounded-lg hover:bg-slate-700 flex items-center gap-2"
                >
                  <FileDown className="w-4 h-4" />
                  Export Terraform
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
