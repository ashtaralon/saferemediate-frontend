'use client'

/**
 * Security Group Inspector Template
 * ==================================
 *
 * Schema-driven template for Security Group inspection.
 * Follows the same style as RDS Inspector with:
 * - Plane chips + coverage + window + confidence at top
 * - Current Rules (Configured)
 * - Observed Traffic (Evidence)
 * - Rule Usage (Configured vs Observed)
 * - Suggestions (Read-only)
 * - What this means (Templated insights)
 */

import React, { useState } from 'react'
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Eye,
  Clock,
  Users,
  Copy,
  Download,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  RefreshCw,
} from 'lucide-react'

import type {
  SGInspectorResponse,
  Rule,
  RuleUsageItem,
  Suggestion,
  MetricValue,
  ChangeEvent,
} from '../../types/sg-inspector'

import {
  formatMetricValue,
  getConfidenceColor,
  getSeverityColor,
  getUsageColor,
  hasValue,
} from '../../types/sg-inspector'

import { useSGInspector, getInspectorStats } from '../../hooks/useSGInspector'

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

interface PlaneChipProps {
  name: string
  available: boolean
  coverage?: number
  confidence?: 'low' | 'medium' | 'high'
}

function PlaneChip({ name, available, coverage, confidence }: PlaneChipProps) {
  const confColors = confidence ? getConfidenceColor(confidence) : null

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '16px',
        fontSize: '12px',
        fontWeight: 500,
        backgroundColor: available ? '#dcfce7' : '#f3f4f6',
        color: available ? '#166534' : '#6b7280',
        border: `1px solid ${available ? '#86efac' : '#e5e7eb'}`,
      }}
    >
      {available ? (
        <CheckCircle size={12} />
      ) : (
        <HelpCircle size={12} />
      )}
      <span>{name}</span>
      {coverage !== undefined && (
        <span style={{ opacity: 0.7 }}>{coverage.toFixed(0)}%</span>
      )}
      {confidence && (
        <span
          style={{
            padding: '1px 6px',
            borderRadius: '8px',
            fontSize: '10px',
            backgroundColor: confColors?.bg,
            color: confColors?.text,
          }}
        >
          {confidence}
        </span>
      )}
    </div>
  )
}

interface MetricDisplayProps {
  label: string
  metric: MetricValue
}

function MetricDisplay({ label, metric }: MetricDisplayProps) {
  const isUnknown = metric.state === 'unknown'

  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontSize: '24px',
          fontWeight: 600,
          color: isUnknown ? '#9ca3af' : '#111827',
        }}
      >
        {isUnknown ? '?' : formatMetricValue(metric)}
      </div>
      <div style={{ fontSize: '12px', color: '#6b7280' }}>{label}</div>
      {isUnknown && metric.reason && (
        <div
          style={{
            fontSize: '10px',
            color: '#9ca3af',
            fontStyle: 'italic',
            marginTop: '2px',
          }}
        >
          {metric.reason}
        </div>
      )}
    </div>
  )
}

function formatPortRange(from: number | null | undefined, to: number | null | undefined): string {
  if (from === null || from === undefined) return 'All'
  if (from === to) return String(from)
  return `${from}-${to}`
}

function formatProtocol(proto: string): string {
  if (proto === '-1') return 'All'
  return proto.toUpperCase()
}

// =============================================================================
// SECTION COMPONENTS
// =============================================================================

interface HeaderSectionProps {
  data: SGInspectorResponse
  windowDays: number
  onWindowChange: (days: number) => void
  onRefresh: () => void
  loading: boolean
}

function HeaderSection({
  data,
  windowDays,
  onWindowChange,
  onRefresh,
  loading,
}: HeaderSectionProps) {
  const { security_group, planes } = data
  const stats = getInspectorStats(data)

  return (
    <div style={{ marginBottom: '24px' }}>
      {/* Title Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Shield size={24} style={{ color: '#3b82f6' }} />
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>
              {security_group.name}{' '}
              <span style={{ fontWeight: 400, color: '#6b7280' }}>
                ({security_group.id.slice(0, 12)})
              </span>
            </h2>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              VPC: {security_group.vpc_id} | Attached to{' '}
              {security_group.attached_to.length} resources
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Window Selector */}
          <select
            value={windowDays}
            onChange={(e) => onWindowChange(Number(e.target.value))}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid #e5e7eb',
              fontSize: '13px',
            }}
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>

          <button
            onClick={onRefresh}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid #e5e7eb',
              backgroundColor: 'white',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '13px',
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Plane Chips Row */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '16px',
        }}
      >
        <PlaneChip
          name="Configured"
          available={planes.configured.available}
          coverage={planes.configured.coverage_pct}
        />
        <PlaneChip
          name="Observed"
          available={planes.observed.available}
          coverage={planes.observed.coverage_pct}
          confidence={planes.observed.confidence}
        />
        <PlaneChip
          name="Changed"
          available={planes.changed.available}
          coverage={planes.changed.coverage_pct}
        />
        <PlaneChip
          name="Authorized"
          available={planes.authorized.available}
          coverage={planes.authorized.coverage_pct}
        />
      </div>

      {/* Stats Row */}
      {stats && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '16px',
            padding: '16px',
            backgroundColor: '#f9fafb',
            borderRadius: '8px',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 600 }}>{stats.totalRules}</div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Total Rules</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 600, color: '#dc2626' }}>
              {stats.publicRules}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Public Ingress</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 600, color: '#16a34a' }}>
              {stats.usedRules}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Used Rules</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 600, color: '#ea580c' }}>
              {stats.suggestions.total}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Suggestions</div>
          </div>
        </div>
      )}
    </div>
  )
}

interface RulesTableSectionProps {
  rules: Rule[]
  ruleUsage?: RuleUsageItem[]
  direction: 'ingress' | 'egress'
}

function RulesTableSection({ rules, ruleUsage, direction }: RulesTableSectionProps) {
  const [expanded, setExpanded] = useState(true)

  const usageMap = new Map<string, RuleUsageItem>()
  if (ruleUsage) {
    for (const ru of ruleUsage) {
      usageMap.set(ru.rule_id, ru)
    }
  }

  return (
    <div style={{ marginBottom: '24px' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 0',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: 600,
        }}
      >
        {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        {direction === 'ingress' ? 'Ingress Rules' : 'Egress Rules'} ({rules.length})
      </button>

      {expanded && (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500 }}>
                  Peer
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500 }}>
                  Protocol
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500 }}>
                  Ports
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500 }}>
                  Flags
                </th>
                {direction === 'ingress' && (
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500 }}>
                    Usage
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const usage = usageMap.get(rule.rule_id)
                const usageColor = usage ? getUsageColor(usage.usage) : null

                return (
                  <tr
                    key={rule.rule_id}
                    style={{ borderTop: '1px solid #e5e7eb' }}
                  >
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            backgroundColor: '#f3f4f6',
                            color: '#6b7280',
                          }}
                        >
                          {rule.peer_type}
                        </span>
                        <code style={{ fontSize: '12px' }}>{rule.peer_value}</code>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {formatProtocol(rule.proto)}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {formatPortRange(rule.from_port, rule.to_port)}
                      {rule.port_label && (
                        <span style={{ color: '#6b7280', marginLeft: '4px' }}>
                          ({rule.port_label})
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {rule.broadness_flags.map((flag) => (
                          <span
                            key={flag}
                            style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              backgroundColor:
                                flag === 'public_world' ? '#fee2e2' : '#fef3c7',
                              color: flag === 'public_world' ? '#dc2626' : '#92400e',
                            }}
                          >
                            {flag.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    </td>
                    {direction === 'ingress' && (
                      <td style={{ padding: '10px 12px' }}>
                        {usage ? (
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 500,
                              backgroundColor: usageColor?.bg,
                              color: usageColor?.text,
                            }}
                            title={
                              usage.evidence?.matched_flows.state === 'value'
                                ? `${usage.evidence.matched_flows.value} flows${usage.evidence.last_seen ? `, last seen: ${usage.evidence.last_seen}` : ''}`
                                : usage.evidence?.matched_flows.reason
                            }
                          >
                            {usage.usage}
                          </span>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>-</span>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

interface ObservedTrafficSectionProps {
  observedUsage: SGInspectorResponse['observed_usage']
}

function ObservedTrafficSection({ observedUsage }: ObservedTrafficSectionProps) {
  if (observedUsage.state === 'unknown') {
    return (
      <div
        style={{
          padding: '24px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          textAlign: 'center',
          color: '#6b7280',
          marginBottom: '24px',
        }}
      >
        <HelpCircle size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
        <div style={{ fontWeight: 500, marginBottom: '4px' }}>
          Observed Traffic Unavailable
        </div>
        <div style={{ fontSize: '13px' }}>
          {observedUsage.reason || 'VPC Flow Logs data not available for this security group.'}
        </div>
      </div>
    )
  }

  if (observedUsage.confidence === 'low') {
    return (
      <div
        style={{
          padding: '24px',
          backgroundColor: '#fef3c7',
          borderRadius: '8px',
          marginBottom: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <AlertTriangle size={18} style={{ color: '#92400e' }} />
          <span style={{ fontWeight: 500, color: '#92400e' }}>Low Confidence Data</span>
        </div>
        <div style={{ fontSize: '13px', color: '#78350f' }}>
          Observed traffic data has low confidence. Results may not be representative of actual usage patterns.
          Consider enabling VPC Flow Logs for all attached network interfaces.
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '24px' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
        <Eye size={18} style={{ display: 'inline', marginRight: '8px' }} />
        Observed Traffic ({observedUsage.window_days}d)
      </h3>

      {/* Metrics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '16px',
          padding: '16px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          marginBottom: '16px',
        }}
      >
        <MetricDisplay label="Total Flows" metric={observedUsage.flows} />
        <MetricDisplay label="Bytes Transferred" metric={observedUsage.bytes} />
      </div>

      {/* Top Sources */}
      {observedUsage.top_sources && observedUsage.top_sources.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
            Top Sources
          </h4>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            {observedUsage.top_sources.slice(0, 5).map((source, idx) => (
              <div
                key={idx}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#f3f4f6',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
              >
                <code>{source.source_ip_or_cidr}</code>
                <span style={{ color: '#6b7280', marginLeft: '8px' }}>
                  {hasValue(source.count) ? formatMetricValue(source.count) : '?'} flows
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Ports */}
      {observedUsage.top_ports && observedUsage.top_ports.length > 0 && (
        <div>
          <h4 style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
            Top Ports
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {observedUsage.top_ports.slice(0, 5).map((port, idx) => (
              <div
                key={idx}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#f3f4f6',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
              >
                <span style={{ fontWeight: 500 }}>{port.port}</span>
                {port.label && (
                  <span style={{ color: '#6b7280', marginLeft: '4px' }}>({port.label})</span>
                )}
                <span style={{ color: '#6b7280', marginLeft: '8px' }}>
                  {hasValue(port.flows) ? formatMetricValue(port.flows) : '?'} flows
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface SuggestionsSectionProps {
  suggestions: SGInspectorResponse['suggestions']
}

function SuggestionsSection({ suggestions }: SuggestionsSectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (suggestions.state === 'unknown') {
    return (
      <div
        style={{
          padding: '24px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          textAlign: 'center',
          color: '#6b7280',
          marginBottom: '24px',
        }}
      >
        <HelpCircle size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
        <div style={{ fontWeight: 500, marginBottom: '4px' }}>
          Suggestions Unavailable
        </div>
        <div style={{ fontSize: '13px' }}>
          {suggestions.reason || 'Cannot generate suggestions without sufficient observed data.'}
        </div>
      </div>
    )
  }

  if (!suggestions.items || suggestions.items.length === 0) {
    return (
      <div
        style={{
          padding: '24px',
          backgroundColor: '#dcfce7',
          borderRadius: '8px',
          textAlign: 'center',
          marginBottom: '24px',
        }}
      >
        <CheckCircle size={32} style={{ marginBottom: '8px', color: '#16a34a' }} />
        <div style={{ fontWeight: 500, color: '#166534', marginBottom: '4px' }}>
          No Suggestions
        </div>
        <div style={{ fontSize: '13px', color: '#166534' }}>
          No security improvements identified based on current evidence.
        </div>
      </div>
    )
  }

  // Sort by severity
  const sortedSuggestions = [...suggestions.items].sort((a, b) => {
    const severityOrder = { high: 0, warn: 1, info: 2 }
    return severityOrder[a.severity] - severityOrder[b.severity]
  })

  return (
    <div style={{ marginBottom: '24px' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
        <AlertTriangle size={18} style={{ display: 'inline', marginRight: '8px' }} />
        Suggestions ({suggestions.items.length})
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {sortedSuggestions.map((suggestion) => {
          const colors = getSeverityColor(suggestion.severity)
          const isExpanded = expandedId === suggestion.id

          return (
            <div
              key={suggestion.id}
              style={{
                border: `1px solid ${colors.border}`,
                borderRadius: '8px',
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : suggestion.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: colors.bg,
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      backgroundColor: colors.text,
                      color: 'white',
                    }}
                  >
                    {suggestion.severity}
                  </span>
                  <span style={{ fontWeight: 500, color: '#111827' }}>
                    {suggestion.title}
                  </span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {suggestion.planes.map((plane) => (
                      <span
                        key={plane}
                        style={{
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          backgroundColor: 'rgba(0,0,0,0.1)',
                          color: '#6b7280',
                        }}
                      >
                        {plane}
                      </span>
                    ))}
                  </div>
                </div>
                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </button>

              {isExpanded && (
                <div style={{ padding: '16px', backgroundColor: 'white' }}>
                  <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#374151' }}>
                    {suggestion.summary}
                  </p>

                  {suggestion.suggested_change_preview && (
                    <div>
                      <h4
                        style={{
                          fontSize: '13px',
                          fontWeight: 500,
                          marginBottom: '8px',
                          color: '#6b7280',
                        }}
                      >
                        Suggested Change Preview (Read-Only)
                      </h4>

                      {/* Removes */}
                      {suggestion.suggested_change_preview.removes.length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                          {suggestion.suggested_change_preview.removes.map((rule, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 12px',
                                backgroundColor: '#fee2e2',
                                borderRadius: '4px',
                                fontSize: '12px',
                                marginBottom: '4px',
                              }}
                            >
                              <span style={{ color: '#dc2626', fontWeight: 600 }}>- REMOVE:</span>
                              <code>
                                {rule.direction} from {rule.peer_value} on{' '}
                                {formatProtocol(rule.proto)}/{formatPortRange(rule.from_port, rule.to_port)}
                              </code>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Adds */}
                      {suggestion.suggested_change_preview.adds.length > 0 && (
                        <div>
                          {suggestion.suggested_change_preview.adds.map((rule, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 12px',
                                backgroundColor: '#dcfce7',
                                borderRadius: '4px',
                                fontSize: '12px',
                                marginBottom: '4px',
                              }}
                            >
                              <span style={{ color: '#16a34a', fontWeight: 600 }}>+ ADD:</span>
                              <code>
                                {rule.direction} from {rule.peer_value} on{' '}
                                {formatProtocol(rule.proto)}/{formatPortRange(rule.from_port, rule.to_port)}
                              </code>
                            </div>
                          ))}
                        </div>
                      )}

                      <button
                        onClick={() => {
                          const preview = JSON.stringify(suggestion.suggested_change_preview, null, 2)
                          navigator.clipboard.writeText(preview)
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          marginTop: '12px',
                          borderRadius: '4px',
                          border: '1px solid #e5e7eb',
                          backgroundColor: 'white',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        <Copy size={12} />
                        Copy Recommendation
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface InsightsSectionProps {
  data: SGInspectorResponse
}

function InsightsSection({ data }: InsightsSectionProps) {
  const insights: string[] = []
  const { planes, configured_rules, observed_usage, recent_changes, suggestions } = data

  // Configured insights
  const publicRules = configured_rules.ingress.filter((r) =>
    r.broadness_flags.includes('public_world')
  )
  if (publicRules.length > 0) {
    const ports = publicRules.map((r) => r.port_label || formatPortRange(r.from_port, r.to_port)).join(', ')
    insights.push(`Ingress includes 0.0.0.0/0 on ${ports} (Configured).`)
  }

  // Observed insights
  if (observed_usage.state === 'value' && planes.observed.confidence !== 'low') {
    const sourceCount = observed_usage.top_sources?.length ?? 0
    if (sourceCount > 0) {
      insights.push(
        `Only ${sourceCount} source(s) were observed connecting in ${observed_usage.window_days}d (Observed, confidence: ${planes.observed.confidence}).`
      )
    }
  }

  // Changed insights
  if (recent_changes && recent_changes.length > 0) {
    const latest = recent_changes[0]
    const date = new Date(latest.timestamp).toLocaleDateString()
    insights.push(`Last rule change on ${date} by ${latest.actor || 'unknown'} (Changed).`)
  }

  // Suggestions insights
  if (suggestions.state === 'value' && suggestions.items && suggestions.items.length > 0) {
    const highCount = suggestions.items.filter((s) => s.severity === 'high').length
    if (highCount > 0) {
      insights.push(`${highCount} high-severity suggestion(s) identified.`)
    }
  }

  if (insights.length === 0) {
    return null
  }

  return (
    <div style={{ marginBottom: '24px' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
        What this means
      </h3>
      <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#374151' }}>
        {insights.map((insight, idx) => (
          <li key={idx} style={{ marginBottom: '6px' }}>
            {insight}
          </li>
        ))}
      </ul>
    </div>
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export interface SGInspectorTemplateProps {
  /** Security Group ID */
  sgId: string
  /** Initial window in days */
  initialWindow?: number
}

export function SGInspectorTemplate({ sgId, initialWindow = 30 }: SGInspectorTemplateProps) {
  const [windowDays, setWindowDays] = useState(initialWindow)

  const { data, loading, error, refetch } = useSGInspector({
    sgId,
    windowDays,
    autoRefresh: false,
  })

  // Handle window change
  const handleWindowChange = (days: number) => {
    setWindowDays(days)
  }

  // Loading state
  if (loading && !data) {
    return (
      <div
        style={{
          padding: '48px',
          textAlign: 'center',
          color: '#6b7280',
        }}
      >
        <RefreshCw size={32} className="animate-spin" style={{ marginBottom: '16px' }} />
        <div>Loading Security Group Inspector...</div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div
        style={{
          padding: '48px',
          textAlign: 'center',
          backgroundColor: '#fee2e2',
          borderRadius: '8px',
        }}
      >
        <AlertTriangle size={32} style={{ color: '#dc2626', marginBottom: '16px' }} />
        <div style={{ fontWeight: 500, color: '#dc2626', marginBottom: '8px' }}>
          Error Loading Inspector
        </div>
        <div style={{ fontSize: '13px', color: '#991b1b', marginBottom: '16px' }}>
          {error.message}
        </div>
        <button
          onClick={refetch}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid #dc2626',
            backgroundColor: 'white',
            color: '#dc2626',
            cursor: 'pointer',
          }}
        >
          Try Again
        </button>
      </div>
    )
  }

  if (!data) {
    return null
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '1000px', margin: '0 auto' }}>
      {/* 1) Header */}
      <HeaderSection
        data={data}
        windowDays={windowDays}
        onWindowChange={handleWindowChange}
        onRefresh={refetch}
        loading={loading}
      />

      {/* 2) Current Rules (Configured) */}
      <section style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
          Current Rules (Configured)
        </h3>
        <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
          Ingress: {data.configured_rules.ingress.length} rules | Egress:{' '}
          {data.configured_rules.egress.length} rules
        </div>

        <RulesTableSection
          rules={data.configured_rules.ingress}
          ruleUsage={data.rule_usage.rules ?? undefined}
          direction="ingress"
        />
        <RulesTableSection
          rules={data.configured_rules.egress}
          direction="egress"
        />
      </section>

      {/* 3) Observed Traffic (Evidence) */}
      <section style={{ marginBottom: '32px' }}>
        <ObservedTrafficSection observedUsage={data.observed_usage} />
      </section>

      {/* 4) Suggestions (Read-only) */}
      <section style={{ marginBottom: '32px' }}>
        <SuggestionsSection suggestions={data.suggestions} />
      </section>

      {/* 5) What this means (Templated insights) */}
      <section style={{ marginBottom: '32px' }}>
        <InsightsSection data={data} />
      </section>

      {/* Footer */}
      <div
        style={{
          padding: '16px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#6b7280',
          textAlign: 'center',
        }}
      >
        Generated at {new Date(data.generated_at).toLocaleString()} | Window: {windowDays} days
      </div>
    </div>
  )
}

export default SGInspectorTemplate
