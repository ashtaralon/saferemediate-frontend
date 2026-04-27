"use client"

/**
 * IAM Simulate Fix Modal
 *
 * Displays simulation results from POST /api/least-privilege/simulate-fix
 * with the 6-block response structure:
 * - resource: identity and sharing info
 * - problem: gap analysis summary
 * - evidence: observation data and confidence
 * - simulation: proposed changes
 * - projected_effect: blast radius impact
 * - safety: remediation decision
 */

import { useState } from 'react'
import { X, Shield, AlertTriangle, CheckCircle2, XCircle, Clock, Eye, Users, TrendingDown, Info } from 'lucide-react'
import type {
  SimulateFixResponse,
  SimulateFixSafetyDecision,
  DecisionOutcomeCanonical,
} from '@/lib/types'
import { CANONICAL_SAFETY_DECISION_CONFIG } from '@/lib/types'

// =============================================================================
// STYLE CONSTANTS
// =============================================================================

// Resolve the canonical decision (preferred) and fall back to the legacy
// lowercase string when the backend hasn't populated decision_canonical
// yet. The legacy bucketing collapses MANUAL_REVIEW + CANARY_FIRST into
// "approval_required" and EXCLUDE into "blocked"; the canonical config
// renders all six outcomes distinctly so the operator can tell a hard
// fail-closed BLOCK from a DR/break-glass EXCLUDE.
function resolveDecision(safety: { decision: SimulateFixSafetyDecision; decision_canonical?: DecisionOutcomeCanonical | null }): DecisionOutcomeCanonical {
  if (safety.decision_canonical) return safety.decision_canonical
  switch (safety.decision) {
    case 'auto_eligible': return 'AUTO_EXECUTE'
    case 'approval_required': return 'REQUIRE_APPROVAL'
    case 'blocked': return 'BLOCK'
    default: return 'BLOCK'
  }
}

const SEVERITY_STYLE: Record<string, { color: string; bg: string }> = {
  CRITICAL: { color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)' },
  HIGH: { color: '#F97316', bg: 'rgba(249, 115, 22, 0.15)' },
  MEDIUM: { color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' },
  LOW: { color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' },
  INFO: { color: '#6B7280', bg: 'rgba(107, 114, 128, 0.15)' }
}

const CONFIDENCE_STYLE: Record<string, { color: string; label: string }> = {
  high: { color: '#10B981', label: 'High' },
  medium: { color: '#F59E0B', label: 'Medium' },
  low: { color: '#EF4444', label: 'Low' },
  unknown: { color: '#6B7280', label: 'Unknown' }
}

// =============================================================================
// TYPES
// =============================================================================

interface IAMSimulateFixModalProps {
  isOpen: boolean
  onClose: () => void
  result: SimulateFixResponse
  resourceName?: string
  onExecute?: (dryRun: boolean) => Promise<void>
  isExecuting?: boolean
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-600 bg-slate-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-sm font-semibold text-white uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div>
      <div className="text-xs text-slate-400 mb-0.5">{label}</div>
      <div className="text-sm font-semibold" style={{ color: color || 'white' }}>{value}</div>
    </div>
  )
}

function Chip({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ color, backgroundColor: bg }}
    >
      {children}
    </span>
  )
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="h-2 rounded-full overflow-hidden bg-slate-700">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${percent}%`, backgroundColor: color }}
      />
    </div>
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function IAMSimulateFixModal({
  isOpen,
  onClose,
  result,
  resourceName,
  onExecute,
  isExecuting = false
}: IAMSimulateFixModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'evidence' | 'impact'>('overview')
  const [dryRun, setDryRun] = useState(true) // Default to dry-run for safety

  if (!isOpen) return null

  const { resource, problem, evidence, simulation, projected_effect, safety } = result
  const canonicalDecision = resolveDecision(safety)
  const safetyStyle = {
    ...CANONICAL_SAFETY_DECISION_CONFIG[canonicalDecision],
    bg: CANONICAL_SAFETY_DECISION_CONFIG[canonicalDecision].bgColor,
  }
  const severityStyle = SEVERITY_STYLE[resource.severity] || SEVERITY_STYLE.INFO
  const confidenceStyle = CONFIDENCE_STYLE[evidence.confidence] || CONFIDENCE_STYLE.unknown

  const totalPermissions = simulation.kept_permissions + simulation.removed_permissions

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-900 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden border border-slate-700">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1">
                IAM Remediation Simulation
              </p>
              <h2 className="text-lg font-bold text-white">{resourceName || resource.id}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Chip color={severityStyle.color} bg={severityStyle.bg}>
                  {resource.severity}
                </Chip>
                <span className="text-sm text-slate-400">{resource.system}</span>
                {resource.shared && (
                  <Chip color="#F59E0B" bg="rgba(245, 158, 11, 0.15)">
                    Shared Resource
                  </Chip>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Safety Decision Banner */}
        <div
          className="px-6 py-3 flex items-center justify-between"
          style={{ backgroundColor: safetyStyle.bg }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">{safetyStyle.icon}</span>
            <div>
              <div className="font-bold" style={{ color: safetyStyle.color }}>
                {safetyStyle.label}
              </div>
              <div className="text-xs text-slate-400">
                {safety.unsafe_reasons.length > 0 ? safety.unsafe_reasons[0] : safetyStyle.description}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-slate-400">Rollback:</span>
              <span style={{ color: safety.rollback_available ? '#10B981' : '#EF4444' }}>
                {safety.rollback_available ? 'Available' : 'Not Available'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-slate-400">Snapshot:</span>
              <span className="text-white">{safety.snapshot_required ? 'Required' : 'Optional'}</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-700 px-6">
          {(['overview', 'evidence', 'impact'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium transition-colors relative ${
                activeTab === tab ? 'text-indigo-400' : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-400" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-280px)] space-y-4">
          {activeTab === 'overview' && (
            <>
              {/* Problem Summary */}
              <Section title="Problem" icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}>
                <p className="text-sm text-slate-300 mb-3">{problem.summary}</p>
                <div className="grid grid-cols-3 gap-4 mb-3">
                  <Metric
                    label="Gap %"
                    value={`${problem.gap_percent}%`}
                    color={problem.gap_percent > 50 ? '#EF4444' : problem.gap_percent > 20 ? '#F59E0B' : '#10B981'}
                  />
                  <Metric label="Unused Permissions" value={problem.unused_count} color="#EF4444" />
                  <Metric label="Used Permissions" value={problem.used_count} color="#10B981" />
                </div>
                {problem.top_risk_reasons.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-700">
                    <div className="text-xs text-slate-400 mb-2">Risk Reasons:</div>
                    <ul className="space-y-1">
                      {problem.top_risk_reasons.slice(0, 3).map((reason, i) => (
                        <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                          <span className="text-amber-400">•</span>
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Section>

              {/* Simulation - What Will Change */}
              <Section title="Proposed Changes" icon={<Shield className="w-4 h-4 text-indigo-400" />}>
                <p className="text-sm text-slate-300 mb-3">{simulation.summary}</p>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div className="rounded-lg bg-slate-700/50 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-400">Kept</span>
                      <span className="text-sm font-bold text-green-400">{simulation.kept_permissions}</span>
                    </div>
                    <ProgressBar value={simulation.kept_permissions} max={totalPermissions} color="#10B981" />
                    {simulation.kept_examples.length > 0 && (
                      <div className="mt-2 text-[10px] text-slate-500 truncate">
                        e.g. {simulation.kept_examples.slice(0, 2).join(', ')}
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg bg-slate-700/50 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-400">Removed</span>
                      <span className="text-sm font-bold text-red-400">{simulation.removed_permissions}</span>
                    </div>
                    <ProgressBar value={simulation.removed_permissions} max={totalPermissions} color="#EF4444" />
                    {simulation.removed_examples.length > 0 && (
                      <div className="mt-2 text-[10px] text-slate-500 truncate">
                        e.g. {simulation.removed_examples.slice(0, 2).join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              </Section>

              {/* Consumers (if shared) */}
              {resource.shared && resource.consumers.length > 0 && (
                <Section title="Consumers" icon={<Users className="w-4 h-4 text-blue-400" />}>
                  <div className="text-xs text-slate-400 mb-2">
                    This role is used by {resource.consumers.length} consumer{resource.consumers.length > 1 ? 's' : ''}
                  </div>
                  <div className="space-y-1">
                    {resource.consumers.slice(0, 5).map((consumer, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500">{consumer.type}:</span>
                        <span className="text-slate-300 font-mono">{consumer.id}</span>
                      </div>
                    ))}
                    {resource.consumers.length > 5 && (
                      <div className="text-xs text-slate-500">
                        +{resource.consumers.length - 5} more
                      </div>
                    )}
                  </div>
                </Section>
              )}
            </>
          )}

          {activeTab === 'evidence' && (
            <>
              {/* Evidence Quality */}
              <Section title="Evidence Quality" icon={<Eye className="w-4 h-4 text-cyan-400" />}>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <Metric
                    label="Confidence"
                    value={confidenceStyle.label}
                    color={confidenceStyle.color}
                  />
                  <Metric
                    label="Completeness"
                    value={evidence.completeness.charAt(0).toUpperCase() + evidence.completeness.slice(1)}
                    color={evidence.completeness === 'complete' ? '#10B981' : '#F59E0B'}
                  />
                  <Metric
                    label="Observation Window"
                    value={`${evidence.observation_window_days} days`}
                  />
                  <Metric
                    label="Evidence Sources"
                    value={evidence.evidence_sources.length}
                  />
                </div>

                {/* Visibility Signals — render the actual value per signal.
                    Backend sends a heterogeneous dict (numbers, strings,
                    string lists) NOT booleans; the previous ✓/✗ rendering
                    treated every truthy string as "available", so a
                    "partial" coverage rendered as green ✓ — directly
                    contradicting the BLOCK that came from completeness
                    being "partial". Display the label and the value, with
                    color keyed to the value semantics where known. */}
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <div className="text-xs text-slate-400 mb-2">Visibility Signals:</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(evidence.visibility_signals).map(([key, raw]) => {
                      // Tier-based colors: complete/high → green, partial/medium → amber,
                      // unknown/low → red, otherwise neutral.
                      const tone = (() => {
                        if (typeof raw === 'string') {
                          if (raw === 'complete' || raw === 'high') return { color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' }
                          if (raw === 'partial' || raw === 'medium') return { color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' }
                          if (raw === 'unknown' || raw === 'low') return { color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)' }
                        }
                        if (typeof raw === 'boolean') {
                          return raw
                            ? { color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' }
                            : { color: '#6B7280', bg: 'rgba(107, 114, 128, 0.15)' }
                        }
                        return { color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.15)' }
                      })()
                      const display = Array.isArray(raw)
                        ? (raw.length > 0 ? raw.join(', ') : 'none')
                        : (raw === undefined || raw === null ? '—' : String(raw))
                      return (
                        <Chip key={key} color={tone.color} bg={tone.bg}>
                          {key.replace(/_/g, ' ')}: <span className="font-semibold">{display}</span>
                        </Chip>
                      )
                    })}
                  </div>
                </div>

                {/* Evidence Sources */}
                {evidence.evidence_sources.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-700">
                    <div className="text-xs text-slate-400 mb-2">Data Sources:</div>
                    <div className="flex flex-wrap gap-2">
                      {evidence.evidence_sources.map((source, i) => (
                        <Chip key={i} color="#94A3B8" bg="rgba(148, 163, 184, 0.15)">
                          {source}
                        </Chip>
                      ))}
                    </div>
                  </div>
                )}

                {/* Caveats */}
                {evidence.caveats.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-700">
                    <div className="text-xs text-amber-400 mb-2 flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      Caveats:
                    </div>
                    <ul className="space-y-1">
                      {evidence.caveats.map((caveat, i) => (
                        <li key={i} className="text-xs text-slate-400 flex items-start gap-2">
                          <span className="text-amber-400">•</span>
                          {caveat}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Section>
            </>
          )}

          {activeTab === 'impact' && (
            <>
              {/* Blast Radius Impact
                  _before fields come from the real BRS v1.1 scorer. They
                  are nullable: when `current_state_available === false`
                  the scorer was unavailable and we render "Current score
                  unavailable" rather than 0. _after / _delta require
                  rescoring against a hypothetical post-mutation graph
                  (not implemented), so `projection_available === false`
                  and those cells always show "Projection unavailable".
                  resource_risk_contribution is now always null — was a
                  hardcoded multiplier the no-hardcoded-multipliers rule
                  rejected. */}
              <Section title="Blast Radius Impact" icon={<TrendingDown className="w-4 h-4 text-green-400" />}>
                {projected_effect.current_state_confidence && projected_effect.current_state_available && (
                  <div className="text-xs text-slate-400 mb-3">
                    BRS confidence: <span className="font-semibold text-slate-200">{projected_effect.current_state_confidence}</span>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center p-3 rounded-lg bg-slate-700/50">
                    {projected_effect.blast_radius_score_before != null ? (
                      <div className="text-2xl font-bold text-slate-300">{projected_effect.blast_radius_score_before}</div>
                    ) : (
                      <div className="text-sm text-slate-500 italic">Current score unavailable</div>
                    )}
                    <div className="text-xs text-slate-400">Before</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-slate-700/50">
                    {projected_effect.blast_radius_score_after != null ? (
                      <div className="text-2xl font-bold text-green-400">{projected_effect.blast_radius_score_after}</div>
                    ) : (
                      <div className="text-sm text-slate-500 italic">Projection unavailable</div>
                    )}
                    <div className="text-xs text-slate-400">After</div>
                  </div>
                  {(() => {
                    const d = projected_effect.blast_radius_score_delta
                    if (d == null) {
                      return (
                        <div className="text-center p-3 rounded-lg bg-slate-700/50">
                          <div className="text-sm text-slate-500 italic">Projection unavailable</div>
                          <div className="text-xs text-slate-400">Delta</div>
                        </div>
                      )
                    }
                    const deltaBg = d > 0 ? 'bg-red-900/30 border border-red-500/30' : d < 0 ? 'bg-green-900/30 border border-green-500/30' : 'bg-slate-700/50'
                    const deltaText = d > 0 ? 'text-red-400' : d < 0 ? 'text-green-400' : 'text-slate-300'
                    return (
                      <div className={`text-center p-3 rounded-lg ${deltaBg}`}>
                        <div className={`text-2xl font-bold ${deltaText}`}>
                          {d > 0 ? '+' : ''}{d}
                        </div>
                        <div className={`text-xs ${deltaText}`}>Delta</div>
                      </div>
                    )
                  })()}
                </div>

                {/* Risk Contribution — both before and after are null today
                    (was a hardcoded multiplier we removed). Shown only as
                    a placeholder note so operators don't expect a number. */}
                {(projected_effect.resource_risk_contribution_before != null ||
                  projected_effect.resource_risk_contribution_after != null) && (
                  <div className="mt-4 pt-4 border-t border-slate-700">
                    <div className="text-xs text-slate-400 mb-3">Resource Risk Contribution:</div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        {projected_effect.resource_risk_contribution_before != null ? (
                          <>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-slate-400">Before</span>
                              <span className="text-slate-300">{(projected_effect.resource_risk_contribution_before * 100).toFixed(1)}%</span>
                            </div>
                            <ProgressBar
                              value={projected_effect.resource_risk_contribution_before * 100}
                              max={100}
                              color="#EF4444"
                            />
                          </>
                        ) : (
                          <div className="text-xs text-slate-500 italic pt-1">Contribution unavailable</div>
                        )}
                      </div>
                      <div className="text-slate-500">→</div>
                      <div className="flex-1">
                        {projected_effect.resource_risk_contribution_after != null ? (
                          <>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-slate-400">After</span>
                              <span className="text-green-400">{(projected_effect.resource_risk_contribution_after * 100).toFixed(1)}%</span>
                            </div>
                            <ProgressBar
                              value={projected_effect.resource_risk_contribution_after * 100}
                              max={100}
                              color="#10B981"
                            />
                          </>
                        ) : (
                          <div className="text-xs text-slate-500 italic pt-1">Projection unavailable</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Family Scores — BRS components (doc, ips, nes, lms). */}
                {projected_effect.family_scores_before && Object.keys(projected_effect.family_scores_before).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-700">
                    <div className="text-xs text-slate-400 mb-2">Blast radius components (BRS v1.1):</div>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(projected_effect.family_scores_before).map(([family, before]) => {
                        const after = projected_effect.family_scores_after?.[family]
                        const delta = after != null ? after - before : null
                        return (
                          <div key={family} className="flex items-center justify-between text-xs p-2 rounded bg-slate-700/50">
                            <span className="text-slate-400 uppercase">{family}</span>
                            {delta != null && after != null ? (
                              <span className={delta < 0 ? 'text-green-400' : delta > 0 ? 'text-red-400' : 'text-slate-300'}>
                                {before} → {after}
                              </span>
                            ) : (
                              <span className="text-slate-300">{before} <span className="text-slate-500 italic">→ projection unavailable</span></span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Caveats from the projected_effect block. */}
                {projected_effect.caveats && projected_effect.caveats.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-700">
                    <div className="text-xs text-amber-400 mb-2 flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      Caveats:
                    </div>
                    <ul className="space-y-1">
                      {projected_effect.caveats.map((c, i) => (
                        <li key={i} className="text-xs text-slate-400 flex items-start gap-2">
                          <span className="text-amber-400">•</span>
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Section>

              {/* Safety Details */}
              <Section title="Safety Assessment" icon={<Shield className="w-4 h-4 text-purple-400" />}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    {safety.rollback_available ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                    <span className="text-sm text-slate-300">Rollback Available</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {safety.snapshot_required ? (
                      <CheckCircle2 className="w-4 h-4 text-amber-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-slate-500" />
                    )}
                    <span className="text-sm text-slate-300">Snapshot Required</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {safety.preflight_required ? (
                      <CheckCircle2 className="w-4 h-4 text-amber-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-slate-500" />
                    )}
                    <span className="text-sm text-slate-300">Preflight Required</span>
                  </div>
                </div>

                {safety.unsafe_reasons.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-700">
                    <div className="text-xs text-amber-400 mb-2">Caution Flags:</div>
                    <ul className="space-y-1">
                      {safety.unsafe_reasons.map((reason, i) => (
                        <li key={i} className="text-xs text-slate-400 flex items-start gap-2">
                          <span className="text-amber-400">⚠</span>
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700">
          {/* Dry-run toggle */}
          <div className="flex items-center justify-between mb-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setDryRun(!dryRun)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  dryRun ? 'bg-blue-600' : 'bg-slate-600'
                }`}
              >
                <div
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    dryRun ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </div>
              <div>
                <span className="text-sm font-medium text-white">
                  {dryRun ? 'Preview Mode' : 'Live Mode'}
                </span>
                <span className="block text-xs text-slate-400">
                  {dryRun ? 'No changes will be made' : 'Changes will be applied to AWS'}
                </span>
              </div>
            </label>
            {!dryRun && (
              <span className="text-xs text-amber-400 flex items-center gap-1">
                <span>⚠</span> Live changes enabled
              </span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>

            {/* Action button is gated by the CANONICAL decision (6 outcomes),
                not the legacy 3-bucket field. BLOCK / EXCLUDE disable the
                button entirely (with distinct copy so an operator can tell
                a fail-closed safety BLOCK from a DR/break-glass EXCLUDE).
                MANUAL_REVIEW also disables — by definition needs deeper
                analysis before any action. AUTO_EXECUTE / REQUIRE_APPROVAL
                / CANARY_FIRST allow the button with tier-specific copy. */}
            {(() => {
              const cd = canonicalDecision
              if (cd === 'BLOCK') {
                return (
                  <button disabled className="px-6 py-2 rounded-lg text-sm font-bold bg-red-900/50 text-red-400 cursor-not-allowed">
                    Blocked — Manual Review Required
                  </button>
                )
              }
              if (cd === 'EXCLUDE') {
                return (
                  <button disabled className="px-6 py-2 rounded-lg text-sm font-bold bg-red-950/60 text-red-300 cursor-not-allowed">
                    Excluded — Cannot Auto-Remediate
                  </button>
                )
              }
              if (cd === 'MANUAL_REVIEW') {
                return (
                  <button disabled className="px-6 py-2 rounded-lg text-sm font-bold bg-blue-900/50 text-blue-300 cursor-not-allowed">
                    Manual Review Required
                  </button>
                )
              }
              const tierColor =
                cd === 'AUTO_EXECUTE' ? 'bg-green-600 hover:bg-green-700'
                : cd === 'REQUIRE_APPROVAL' ? 'bg-amber-600 hover:bg-amber-700'
                : cd === 'CANARY_FIRST' ? 'bg-cyan-600 hover:bg-cyan-700'
                : 'bg-blue-600 hover:bg-blue-700'
              const liveLabel =
                cd === 'AUTO_EXECUTE' ? 'Apply Fix'
                : cd === 'REQUIRE_APPROVAL' ? 'Request Approval'
                : cd === 'CANARY_FIRST' ? 'Apply Canary First'
                : 'Apply Fix'
              return (
                <button
                  onClick={() => onExecute?.(dryRun)}
                  disabled={isExecuting}
                  className={`px-6 py-2 rounded-lg text-sm font-bold text-white transition-colors disabled:opacity-50 ${
                    dryRun ? 'bg-blue-600 hover:bg-blue-700' : tierColor
                  }`}
                >
                  {isExecuting
                    ? (dryRun ? 'Previewing...' : 'Applying...')
                    : (dryRun ? 'Preview Changes' : liveLabel)}
                </button>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
