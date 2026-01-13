/**
 * Security Group Inspector Types
 * ===============================
 *
 * TypeScript types matching the backend SGInspectorResponse schema.
 * Implements Unknown vs Zero pattern with MetricValue.
 */

// =============================================================================
// METRIC VALUE (Unknown vs Zero pattern)
// =============================================================================

export type MetricState = 'value' | 'unknown' | 'na'

export interface MetricValue {
  state: MetricState
  value?: number | null
  unit?: string
  reason?: string
}

// =============================================================================
// PLANE TYPES
// =============================================================================

export interface PlaneAvailability {
  available: boolean
  coverage_pct: number
  last_updated?: string
  reason?: string
}

export interface ConfiguredPlane extends PlaneAvailability {}

export interface ObservedPlane extends PlaneAvailability {
  window_days: number
  confidence: 'low' | 'medium' | 'high'
}

export interface ChangedPlane extends PlaneAvailability {
  window_days: number
}

export interface AuthorizedPlane extends PlaneAvailability {}

export interface Planes {
  configured: ConfiguredPlane
  observed: ObservedPlane
  changed: ChangedPlane
  authorized: AuthorizedPlane
}

// =============================================================================
// SECURITY GROUP IDENTITY
// =============================================================================

export interface AttachedResource {
  resource_id: string
  resource_name: string
  resource_type: string
}

export interface SecurityGroupIdentity {
  id: string
  name: string
  vpc_id: string
  description?: string
  attached_to: AttachedResource[]
}

// =============================================================================
// RULES
// =============================================================================

export type RuleDirection = 'ingress' | 'egress'
export type PeerType = 'cidr4' | 'cidr6' | 'sg' | 'prefix_list' | 'self'

export interface Rule {
  rule_id: string
  direction: RuleDirection
  proto: string
  from_port?: number | null
  to_port?: number | null
  peer_type: PeerType
  peer_value: string
  port_label?: string
  broadness_flags: string[]
}

export interface ConfiguredRules {
  ingress: Rule[]
  egress: Rule[]
}

// =============================================================================
// OBSERVED USAGE
// =============================================================================

export interface TopSource {
  source_id?: string
  source_name?: string
  source_ip_or_cidr: string
  count: MetricValue
  last_seen?: string
}

export interface TopPort {
  port: number
  label?: string
  flows: MetricValue
  last_seen?: string
}

export interface ObservedUsage {
  state: 'value' | 'unknown'
  reason?: string
  window_days: number
  confidence: 'low' | 'medium' | 'high'
  flows: MetricValue
  bytes: MetricValue
  top_sources?: TopSource[]
  top_ports?: TopPort[]
}

// =============================================================================
// RULE USAGE
// =============================================================================

export interface RuleEvidence {
  matched_flows: MetricValue
  last_seen?: string
  top_sources?: string[]
}

export type RuleUsageStatus = 'USED' | 'UNOBSERVED' | 'UNKNOWN'

export interface RuleUsageItem {
  rule_id: string
  usage: RuleUsageStatus
  evidence?: RuleEvidence
}

export interface RuleUsage {
  state: 'value' | 'unknown'
  reason?: string
  window_days: number
  rules?: RuleUsageItem[]
}

// =============================================================================
// SUGGESTIONS
// =============================================================================

export interface SuggestedChangePreview {
  removes: Rule[]
  adds: Rule[]
}

export type SuggestionSeverity = 'info' | 'warn' | 'high'

export interface Suggestion {
  id: string
  severity: SuggestionSeverity
  title: string
  summary: string
  planes: string[]
  suggested_change_preview?: SuggestedChangePreview
}

export interface Suggestions {
  state: 'value' | 'unknown'
  reason?: string
  items?: Suggestion[]
}

// =============================================================================
// CHANGE EVENTS
// =============================================================================

export interface ChangeEvent {
  timestamp: string
  actor?: string
  action: string
  details?: string
}

// =============================================================================
// FULL RESPONSE
// =============================================================================

export interface SGInspectorResponse {
  planes: Planes
  security_group: SecurityGroupIdentity
  configured_rules: ConfiguredRules
  observed_usage: ObservedUsage
  rule_usage: RuleUsage
  suggestions: Suggestions
  recent_changes?: ChangeEvent[]
  generated_at: string
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Check if a metric value has actual data
 */
export function hasValue(metric: MetricValue): boolean {
  return metric.state === 'value' && metric.value !== null && metric.value !== undefined
}

/**
 * Format a metric value for display
 */
export function formatMetricValue(metric: MetricValue): string {
  if (metric.state === 'unknown') {
    return 'Unknown'
  }
  if (metric.state === 'na') {
    return 'N/A'
  }
  if (metric.value === null || metric.value === undefined) {
    return '0'
  }

  const val = metric.value
  const unit = metric.unit

  // Format large numbers
  if (val >= 1_000_000_000) {
    return `${(val / 1_000_000_000).toFixed(1)}B${unit ? ` ${unit}` : ''}`
  }
  if (val >= 1_000_000) {
    return `${(val / 1_000_000).toFixed(1)}M${unit ? ` ${unit}` : ''}`
  }
  if (val >= 1_000) {
    return `${(val / 1_000).toFixed(1)}K${unit ? ` ${unit}` : ''}`
  }

  return `${val}${unit ? ` ${unit}` : ''}`
}

/**
 * Get color for confidence level
 */
export function getConfidenceColor(confidence: 'low' | 'medium' | 'high'): {
  bg: string
  text: string
  border: string
} {
  switch (confidence) {
    case 'high':
      return { bg: '#dcfce7', text: '#166534', border: '#86efac' }
    case 'medium':
      return { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' }
    case 'low':
      return { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' }
  }
}

/**
 * Get color for suggestion severity
 */
export function getSeverityColor(severity: SuggestionSeverity): {
  bg: string
  text: string
  border: string
} {
  switch (severity) {
    case 'high':
      return { bg: '#fee2e2', text: '#dc2626', border: '#fecaca' }
    case 'warn':
      return { bg: '#fed7aa', text: '#ea580c', border: '#fdba74' }
    case 'info':
      return { bg: '#dbeafe', text: '#2563eb', border: '#93c5fd' }
  }
}

/**
 * Get color for rule usage status
 */
export function getUsageColor(usage: RuleUsageStatus): {
  bg: string
  text: string
} {
  switch (usage) {
    case 'USED':
      return { bg: '#dcfce7', text: '#166534' }
    case 'UNOBSERVED':
      return { bg: '#fef3c7', text: '#92400e' }
    case 'UNKNOWN':
      return { bg: '#f3f4f6', text: '#6b7280' }
  }
}
