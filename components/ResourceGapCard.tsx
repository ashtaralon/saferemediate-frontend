'use client'

/**
 * ResourceGapCard - Generic Template-Driven Gap Analysis Card
 *
 * A flexible component that renders gap analysis for any resource type
 * based on template configuration from the registry.
 *
 * Usage:
 *   <ResourceGapCard
 *     resourceType="RDS"
 *     resourceId="sg-abc123"
 *     analysisData={data}
 *     onSimulate={handleSimulate}
 *     onRemediate={handleRemediate}
 *   />
 */

import React, { useState, useMemo } from 'react'
import {
  ResourceGapCardProps,
  ResourceGapTemplate,
  SectionConfig,
  StatusType,
  ActionType,
  RuleItem,
  StatusBadgeConfig,
  MetricConfig,
} from '@/types/resource-gap-template'
import {
  getResourceTemplate,
  mergeTemplateConfig,
  getNestedValue,
  formatValue,
} from '@/lib/resource-gap-templates'

// ============================================================================
// Sub-Components
// ============================================================================

interface StatusBadgeProps {
  status: StatusType
  config?: StatusBadgeConfig
  connections?: number
}

function StatusBadge({ status, config, connections }: StatusBadgeProps) {
  const defaultConfigs: Record<StatusType, StatusBadgeConfig> = {
    USED: { status: 'USED', label: 'ACTIVE', bgColor: '#dcfce7', textColor: '#166534', borderColor: '#86efac' },
    UNUSED: { status: 'UNUSED', label: 'UNUSED', bgColor: '#fee2e2', textColor: '#991b1b', borderColor: '#fecaca' },
    UNOBSERVED: { status: 'UNOBSERVED', label: '0 CONNECTIONS', bgColor: '#fef3c7', textColor: '#92400e', borderColor: '#fcd34d' },
    OVERLY_BROAD: { status: 'OVERLY_BROAD', label: 'OVERLY BROAD', bgColor: '#fed7aa', textColor: '#ea580c', borderColor: '#fdba74' },
    UNKNOWN: { status: 'UNKNOWN', label: 'UNKNOWN', bgColor: '#f3f4f6', textColor: '#6b7280', borderColor: '#d1d5db' },
  }

  const badgeConfig = config || defaultConfigs[status] || defaultConfigs.UNKNOWN
  const label = badgeConfig.sublabel && connections !== undefined
    ? badgeConfig.sublabel.replace('{connections}', String(connections))
    : badgeConfig.label

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: 600,
        backgroundColor: badgeConfig.bgColor,
        color: badgeConfig.textColor,
        border: badgeConfig.borderColor ? `1px solid ${badgeConfig.borderColor}` : undefined,
      }}
    >
      {label}
    </span>
  )
}

interface ActionButtonProps {
  action: ActionType
  onClick: () => void
  label?: string
  size?: 'small' | 'medium'
}

function ActionButton({ action, onClick, label, size = 'small' }: ActionButtonProps) {
  const actionColors: Record<ActionType, { bg: string; hover: string; text: string }> = {
    KEEP: { bg: '#10b981', hover: '#059669', text: 'white' },
    DELETE: { bg: '#ef4444', hover: '#dc2626', text: 'white' },
    TIGHTEN: { bg: '#f59e0b', hover: '#d97706', text: 'white' },
    REVIEW: { bg: '#6b7280', hover: '#4b5563', text: 'white' },
    REPLACE: { bg: '#dc2626', hover: '#b91c1c', text: 'white' },
  }

  const colors = actionColors[action] || actionColors.REVIEW
  const buttonLabel = label || action

  return (
    <button
      onClick={onClick}
      style={{
        padding: size === 'small' ? '4px 8px' : '6px 12px',
        fontSize: size === 'small' ? '11px' : '12px',
        fontWeight: 500,
        backgroundColor: colors.bg,
        color: colors.text,
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
      }}
      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = colors.hover)}
      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = colors.bg)}
    >
      {buttonLabel}
    </button>
  )
}

interface PlaneChipProps {
  label: string
  color: string
  active?: boolean
}

function PlaneChip({ label, color, active = true }: PlaneChipProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 500,
        backgroundColor: active ? color : '#e5e7eb',
        color: active ? 'white' : '#6b7280',
        opacity: active ? 1 : 0.6,
      }}
    >
      {label}
    </span>
  )
}

interface ConfidenceLabelProps {
  confidence: number
  thresholds: { high: number; medium: number }
}

function ConfidenceLabel({ confidence, thresholds }: ConfidenceLabelProps) {
  let color = '#ef4444' // red
  let label = 'Low'

  if (confidence >= thresholds.high) {
    color = '#10b981' // green
    label = 'High'
  } else if (confidence >= thresholds.medium) {
    color = '#f59e0b' // yellow
    label = 'Medium'
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ fontSize: '12px', color: '#6b7280' }}>Confidence:</span>
      <span
        style={{
          fontSize: '12px',
          fontWeight: 600,
          color,
        }}
      >
        {Math.round(confidence)}% ({label})
      </span>
    </div>
  )
}

// ============================================================================
// Section Components
// ============================================================================

interface RulesListSectionProps {
  config: SectionConfig
  rules: RuleItem[]
  template: ResourceGapTemplate
  onSimulate?: (ruleId: string, action: ActionType) => void
  onRemediate?: (ruleId: string, action: ActionType) => void
}

function RulesListSection({ config, rules, template, onSimulate, onRemediate }: RulesListSectionProps) {
  const [collapsed, setCollapsed] = useState(config.defaultCollapsed ?? false)

  // Filter rules based on section config
  const filteredRules = useMemo(() => {
    if (!rules) return []
    let result = rules

    if (config.statusFilter && config.statusFilter.length > 0) {
      result = result.filter((rule) => config.statusFilter!.includes(rule.status as StatusType))
    }

    if (config.filterFn) {
      result = result.filter(config.filterFn)
    }

    return result
  }, [rules, config])

  const ruleDisplay = config.ruleDisplay || template.sections[0]?.ruleDisplay

  // Find the appropriate status badge config for a rule
  const getStatusBadge = (status: StatusType) => {
    return config.statusBadges?.find((b) => b.status === status)
  }

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* Section Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          backgroundColor: '#f9fafb',
          borderRadius: '6px 6px 0 0',
          borderBottom: '1px solid #e5e7eb',
          cursor: config.collapsible ? 'pointer' : 'default',
        }}
        onClick={() => config.collapsible && setCollapsed(!collapsed)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {config.collapsible && (
            <span style={{ fontSize: '12px', color: '#6b7280' }}>
              {collapsed ? '▶' : '▼'}
            </span>
          )}
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#374151' }}>
            {config.title}
          </span>
          {config.showCount && (
            <span
              style={{
                fontSize: '11px',
                padding: '1px 6px',
                backgroundColor: '#e5e7eb',
                borderRadius: '10px',
                color: '#6b7280',
              }}
            >
              {filteredRules.length}
            </span>
          )}
        </div>
      </div>

      {/* Section Content */}
      {!collapsed && (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderTop: 'none',
            borderRadius: '0 0 6px 6px',
          }}
        >
          {filteredRules.length === 0 ? (
            <div
              style={{
                padding: '16px',
                textAlign: 'center',
                color: '#9ca3af',
                fontSize: '13px',
              }}
            >
              {config.emptyMessage || 'No items'}
            </div>
          ) : (
            filteredRules.map((rule, index) => (
              <div
                key={rule.id || index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderBottom:
                    index < filteredRules.length - 1 ? '1px solid #f3f4f6' : undefined,
                }}
              >
                {/* Rule Info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                  {/* Status Badge */}
                  <StatusBadge
                    status={rule.status as StatusType}
                    config={getStatusBadge(rule.status as StatusType)}
                    connections={rule.connections}
                  />

                  {/* Port/Protocol */}
                  {ruleDisplay?.showPort && (
                    <div style={{ minWidth: '80px' }}>
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                        {ruleDisplay.portLabel || 'Port'}
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>
                        {rule.port || '-'}
                        {ruleDisplay.showProtocol && rule.protocol && (
                          <span style={{ color: '#9ca3af' }}> / {rule.protocol}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Source */}
                  {ruleDisplay?.showSource && (
                    <div style={{ minWidth: '140px', flex: 1 }}>
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                        {ruleDisplay.sourceLabel || 'Source'}
                      </div>
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: 500,
                          color: '#374151',
                          fontFamily: 'monospace',
                        }}
                      >
                        {rule.source || '-'}
                      </div>
                    </div>
                  )}

                  {/* Connections */}
                  {ruleDisplay?.showConnections && (
                    <div style={{ minWidth: '100px' }}>
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                        {ruleDisplay.connectionLabel || 'Connections'}
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>
                        {rule.connections?.toLocaleString() ?? 0}
                      </div>
                    </div>
                  )}

                  {/* Last Used */}
                  {ruleDisplay?.showLastUsed && rule.lastUsed && (
                    <div style={{ minWidth: '80px' }}>
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>Last Used</div>
                      <div style={{ fontSize: '13px', color: '#6b7280' }}>{rule.lastUsed}</div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                {rule.recommendation && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {onSimulate && (
                      <ActionButton
                        action={rule.recommendation.action}
                        onClick={() => onSimulate(rule.id, rule.recommendation!.action)}
                        label="Simulate"
                        size="small"
                      />
                    )}
                    {onRemediate && (
                      <ActionButton
                        action={rule.recommendation.action}
                        onClick={() => onRemediate(rule.id, rule.recommendation!.action)}
                        label={rule.recommendation.action}
                        size="small"
                      />
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

interface MetricsBannerSectionProps {
  config: {
    title: string
    bgColor?: string
    showObservationPeriod?: boolean
    metrics: MetricConfig[]
  }
  data: any
  observationDays?: number
}

function MetricsBannerSection({ config, data, observationDays }: MetricsBannerSectionProps) {
  return (
    <div
      style={{
        padding: '12px 16px',
        backgroundColor: config.bgColor || '#eff6ff',
        borderRadius: '8px',
        marginBottom: '16px',
        border: '1px solid #e5e7eb',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
          {config.title}
        </span>
        {config.showObservationPeriod && observationDays && (
          <span style={{ fontSize: '11px', color: '#6b7280' }}>
            Based on {observationDays} days of observation
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '24px' }}>
        {config.metrics.map((metric) => {
          const value = getNestedValue(data, metric.valueKey)
          return (
            <div key={metric.id}>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>{metric.label}</div>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: metric.highlight ? '#dc2626' : '#374151',
                }}
              >
                {formatValue(value, metric.format)}
                {metric.suffix && <span style={{ fontSize: '12px' }}>{metric.suffix}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface BlastRadiusSectionProps {
  config: {
    title: string
    trackNeighborTypes: string[]
    impactMessageTemplate: string
    showVisualization?: boolean
  }
  data: any
}

function BlastRadiusSection({ config, data }: BlastRadiusSectionProps) {
  const impactedCount = data?.impacted_neighbors?.length || data?.neighbor_count || 0
  const impactMessage = config.impactMessageTemplate.replace('{count}', String(impactedCount))

  return (
    <div
      style={{
        padding: '12px 16px',
        backgroundColor: '#f0fdf4',
        borderRadius: '8px',
        marginBottom: '16px',
        border: '1px solid #bbf7d0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#166534' }}>
          {config.title}
        </span>
        <span style={{ fontSize: '12px', color: '#15803d' }}>{impactMessage}</span>
      </div>

      {config.showVisualization && data?.impacted_neighbors && (
        <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {data.impacted_neighbors.slice(0, 5).map((neighbor: any, idx: number) => (
            <span
              key={idx}
              style={{
                padding: '2px 8px',
                backgroundColor: '#dcfce7',
                borderRadius: '4px',
                fontSize: '11px',
                color: '#166534',
              }}
            >
              {neighbor.id || neighbor}
            </span>
          ))}
          {data.impacted_neighbors.length > 5 && (
            <span style={{ fontSize: '11px', color: '#6b7280' }}>
              +{data.impacted_neighbors.length - 5} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function ResourceGapCard({
  resourceType,
  resourceId,
  analysisData,
  onSimulate,
  onRemediate,
  onRefresh,
  customTemplate,
}: ResourceGapCardProps) {
  // Get and merge template configuration
  const template = useMemo(() => {
    const baseTemplate = getResourceTemplate(resourceType)
    return customTemplate ? mergeTemplateConfig(baseTemplate, customTemplate) : baseTemplate
  }, [resourceType, customTemplate])

  // Extract data using template mappings
  const rules = useMemo(() => {
    return getNestedValue(analysisData, template.dataMapping.rulesPath) || []
  }, [analysisData, template])

  const summary = useMemo(() => {
    return getNestedValue(analysisData, template.dataMapping.summaryPath) || {}
  }, [analysisData, template])

  const recommendations = useMemo(() => {
    return getNestedValue(analysisData, template.dataMapping.recommendationsPath) || []
  }, [analysisData, template])

  // Merge recommendations into rules
  const rulesWithRecommendations = useMemo(() => {
    return rules.map((rule: RuleItem) => {
      const rec = recommendations.find((r: any) => r.rule_id === rule.id)
      return rec ? { ...rule, recommendation: rec } : rule
    })
  }, [rules, recommendations])

  // Sort sections by priority
  const sortedSections = useMemo(() => {
    return [...template.sections].sort((a, b) => (a.priority || 999) - (b.priority || 999))
  }, [template])

  // Handler wrappers
  const handleSimulate = (ruleId: string, action: ActionType) => {
    onSimulate?.(resourceId, ruleId, action)
  }

  const handleRemediate = (ruleId: string, action: ActionType) => {
    onRemediate?.(resourceId, ruleId, action)
  }

  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#fafafa',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1f2937' }}>
              {template.displayName} Gap Analysis
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#6b7280' }}>
              {resourceId}
            </p>
          </div>

          {template.header.showConfidenceLabel && (
            <ConfidenceLabel
              confidence={summary.average_confidence || 0}
              thresholds={template.header.confidenceThresholds}
            />
          )}
        </div>

        {/* Plane Chips */}
        {template.header.showPlaneChips && (
          <div style={{ display: 'flex', gap: '8px' }}>
            {template.header.planes.map((plane) => (
              <PlaneChip key={plane.id} label={plane.label} color={plane.color} />
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '16px' }}>
        {/* Summary Boxes */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${template.summary.boxes.length}, 1fr)`,
            gap: '12px',
            marginBottom: '16px',
          }}
        >
          {template.summary.boxes.map((box) => {
            const value = getNestedValue(analysisData, box.valueKey)
            const colorMap: Record<string, { bg: string; text: string }> = {
              green: { bg: '#dcfce7', text: '#166534' },
              red: { bg: '#fee2e2', text: '#991b1b' },
              yellow: { bg: '#fef3c7', text: '#92400e' },
              blue: { bg: '#dbeafe', text: '#1e40af' },
              gray: { bg: '#f3f4f6', text: '#374151' },
            }
            const colors = colorMap[box.color] || colorMap.gray

            return (
              <div
                key={box.id}
                style={{
                  padding: '12px',
                  backgroundColor: colors.bg,
                  borderRadius: '8px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>
                  {box.label}
                </div>
                <div style={{ fontSize: '20px', fontWeight: 600, color: colors.text }}>
                  {formatValue(value, box.format)}
                </div>
              </div>
            )
          })}
        </div>

        {/* Metrics Banner */}
        {template.metricsBanner && (
          <MetricsBannerSection
            config={template.metricsBanner}
            data={summary}
            observationDays={summary.observation_days || template.specificConfig?.observationDays}
          />
        )}

        {/* Blast Radius */}
        {template.blastRadius?.enabled && analysisData?.blast_radius && (
          <BlastRadiusSection
            config={template.blastRadius}
            data={analysisData.blast_radius}
          />
        )}

        {/* Rule Sections */}
        {sortedSections.map((section) => (
          <RulesListSection
            key={section.id}
            config={section}
            rules={rulesWithRecommendations}
            template={template}
            onSimulate={handleSimulate}
            onRemediate={handleRemediate}
          />
        ))}
      </div>

      {/* Footer with Refresh */}
      {onRefresh && (
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid #e5e7eb',
            backgroundColor: '#fafafa',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onRefresh}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              backgroundColor: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              color: '#374151',
            }}
          >
            Refresh Analysis
          </button>
        </div>
      )}
    </div>
  )
}

export default ResourceGapCard
