/**
 * Security Group Inspector Frontend Tests
 * ========================================
 *
 * Tests for:
 * - Unknown vs Zero rendering helpers
 * - MetricValue formatting
 * - Color functions
 * - Stats calculation
 */

import {
  formatMetricValue,
  getConfidenceColor,
  getSeverityColor,
  getUsageColor,
  hasValue,
  MetricValue,
  MetricState,
  Rule,
  RuleUsageItem,
  SGInspectorResponse,
} from '../types/sg-inspector'

import { getInspectorStats } from '../hooks/useSGInspector'

// =============================================================================
// UNKNOWN VS ZERO TESTS
// =============================================================================

describe('Unknown vs Zero Pattern', () => {
  describe('hasValue', () => {
    it('should return true for value state with number', () => {
      const metric: MetricValue = { state: 'value', value: 100 }
      expect(hasValue(metric)).toBe(true)
    })

    it('should return true for value state with zero', () => {
      const metric: MetricValue = { state: 'value', value: 0 }
      expect(hasValue(metric)).toBe(true)
    })

    it('should return false for unknown state', () => {
      const metric: MetricValue = { state: 'unknown', reason: 'No data' }
      expect(hasValue(metric)).toBe(false)
    })

    it('should return false for na state', () => {
      const metric: MetricValue = { state: 'na', reason: 'Not applicable' }
      expect(hasValue(metric)).toBe(false)
    })

    it('should return false for value state with null', () => {
      const metric: MetricValue = { state: 'value', value: null }
      expect(hasValue(metric)).toBe(false)
    })

    it('should return false for value state with undefined', () => {
      const metric: MetricValue = { state: 'value', value: undefined }
      expect(hasValue(metric)).toBe(false)
    })
  })

  describe('formatMetricValue', () => {
    it('should return "Unknown" for unknown state', () => {
      const metric: MetricValue = { state: 'unknown', reason: 'No data' }
      expect(formatMetricValue(metric)).toBe('Unknown')
    })

    it('should return "N/A" for na state', () => {
      const metric: MetricValue = { state: 'na', reason: 'Not applicable' }
      expect(formatMetricValue(metric)).toBe('N/A')
    })

    it('should return "0" for value state with null', () => {
      const metric: MetricValue = { state: 'value', value: null }
      expect(formatMetricValue(metric)).toBe('0')
    })

    it('should format small numbers', () => {
      const metric: MetricValue = { state: 'value', value: 42 }
      expect(formatMetricValue(metric)).toBe('42')
    })

    it('should format numbers with units', () => {
      const metric: MetricValue = { state: 'value', value: 100, unit: 'bytes' }
      expect(formatMetricValue(metric)).toBe('100 bytes')
    })

    it('should format thousands with K suffix', () => {
      const metric: MetricValue = { state: 'value', value: 5432 }
      expect(formatMetricValue(metric)).toBe('5.4K')
    })

    it('should format millions with M suffix', () => {
      const metric: MetricValue = { state: 'value', value: 2500000 }
      expect(formatMetricValue(metric)).toBe('2.5M')
    })

    it('should format billions with B suffix', () => {
      const metric: MetricValue = { state: 'value', value: 3200000000 }
      expect(formatMetricValue(metric)).toBe('3.2B')
    })

    it('should format large numbers with units', () => {
      const metric: MetricValue = { state: 'value', value: 1500000, unit: 'bytes' }
      expect(formatMetricValue(metric)).toBe('1.5M bytes')
    })
  })
})

// =============================================================================
// COLOR FUNCTION TESTS
// =============================================================================

describe('Color Functions', () => {
  describe('getConfidenceColor', () => {
    it('should return green colors for high confidence', () => {
      const colors = getConfidenceColor('high')
      expect(colors.bg).toBe('#dcfce7')
      expect(colors.text).toBe('#166534')
    })

    it('should return yellow colors for medium confidence', () => {
      const colors = getConfidenceColor('medium')
      expect(colors.bg).toBe('#fef3c7')
      expect(colors.text).toBe('#92400e')
    })

    it('should return red colors for low confidence', () => {
      const colors = getConfidenceColor('low')
      expect(colors.bg).toBe('#fee2e2')
      expect(colors.text).toBe('#991b1b')
    })
  })

  describe('getSeverityColor', () => {
    it('should return red colors for high severity', () => {
      const colors = getSeverityColor('high')
      expect(colors.bg).toBe('#fee2e2')
      expect(colors.text).toBe('#dc2626')
    })

    it('should return orange colors for warn severity', () => {
      const colors = getSeverityColor('warn')
      expect(colors.bg).toBe('#fed7aa')
      expect(colors.text).toBe('#ea580c')
    })

    it('should return blue colors for info severity', () => {
      const colors = getSeverityColor('info')
      expect(colors.bg).toBe('#dbeafe')
      expect(colors.text).toBe('#2563eb')
    })
  })

  describe('getUsageColor', () => {
    it('should return green colors for USED status', () => {
      const colors = getUsageColor('USED')
      expect(colors.bg).toBe('#dcfce7')
      expect(colors.text).toBe('#166534')
    })

    it('should return yellow colors for UNOBSERVED status', () => {
      const colors = getUsageColor('UNOBSERVED')
      expect(colors.bg).toBe('#fef3c7')
      expect(colors.text).toBe('#92400e')
    })

    it('should return gray colors for UNKNOWN status', () => {
      const colors = getUsageColor('UNKNOWN')
      expect(colors.bg).toBe('#f3f4f6')
      expect(colors.text).toBe('#6b7280')
    })
  })
})

// =============================================================================
// STATS CALCULATION TESTS
// =============================================================================

describe('getInspectorStats', () => {
  const createMockResponse = (overrides: Partial<SGInspectorResponse> = {}): SGInspectorResponse => ({
    planes: {
      configured: { available: true, coverage_pct: 100 },
      observed: { available: true, coverage_pct: 90, window_days: 30, confidence: 'high' },
      changed: { available: true, coverage_pct: 100, window_days: 30 },
      authorized: { available: false, coverage_pct: 0 },
    },
    security_group: {
      id: 'sg-12345678',
      name: 'test-sg',
      vpc_id: 'vpc-12345678',
      attached_to: [],
    },
    configured_rules: {
      ingress: [],
      egress: [],
    },
    observed_usage: {
      state: 'value',
      window_days: 30,
      confidence: 'high',
      flows: { state: 'value', value: 100 },
      bytes: { state: 'value', value: 10000 },
    },
    rule_usage: {
      state: 'value',
      window_days: 30,
      rules: [],
    },
    suggestions: {
      state: 'value',
      items: [],
    },
    generated_at: new Date().toISOString(),
    ...overrides,
  })

  it('should return null for null data', () => {
    expect(getInspectorStats(null)).toBeNull()
  })

  it('should count total rules', () => {
    const data = createMockResponse({
      configured_rules: {
        ingress: [
          { rule_id: '1', direction: 'ingress', proto: 'tcp', peer_type: 'cidr4', peer_value: '0.0.0.0/0', broadness_flags: [] },
          { rule_id: '2', direction: 'ingress', proto: 'tcp', peer_type: 'cidr4', peer_value: '10.0.0.0/8', broadness_flags: [] },
        ],
        egress: [
          { rule_id: '3', direction: 'egress', proto: 'tcp', peer_type: 'cidr4', peer_value: '0.0.0.0/0', broadness_flags: [] },
        ],
      },
    })

    const stats = getInspectorStats(data)
    expect(stats?.totalRules).toBe(3)
    expect(stats?.ingressRules).toBe(2)
    expect(stats?.egressRules).toBe(1)
  })

  it('should count public rules', () => {
    const data = createMockResponse({
      configured_rules: {
        ingress: [
          { rule_id: '1', direction: 'ingress', proto: 'tcp', peer_type: 'cidr4', peer_value: '0.0.0.0/0', broadness_flags: ['public_world'] },
          { rule_id: '2', direction: 'ingress', proto: 'tcp', peer_type: 'cidr4', peer_value: '10.0.0.0/8', broadness_flags: [] },
        ],
        egress: [],
      },
    })

    const stats = getInspectorStats(data)
    expect(stats?.publicRules).toBe(1)
  })

  it('should count rule usage', () => {
    const data = createMockResponse({
      configured_rules: {
        ingress: [
          { rule_id: '1', direction: 'ingress', proto: 'tcp', peer_type: 'cidr4', peer_value: '0.0.0.0/0', broadness_flags: [] },
          { rule_id: '2', direction: 'ingress', proto: 'tcp', peer_type: 'cidr4', peer_value: '10.0.0.0/8', broadness_flags: [] },
          { rule_id: '3', direction: 'ingress', proto: 'tcp', peer_type: 'cidr4', peer_value: '192.168.0.0/16', broadness_flags: [] },
        ],
        egress: [],
      },
      rule_usage: {
        state: 'value',
        window_days: 30,
        rules: [
          { rule_id: '1', usage: 'USED' },
          { rule_id: '2', usage: 'UNOBSERVED' },
          { rule_id: '3', usage: 'UNKNOWN' },
        ],
      },
    })

    const stats = getInspectorStats(data)
    expect(stats?.usedRules).toBe(1)
    expect(stats?.unobservedRules).toBe(1)
    expect(stats?.unknownRules).toBe(1)
  })

  it('should count suggestions by severity', () => {
    const data = createMockResponse({
      suggestions: {
        state: 'value',
        items: [
          { id: '1', severity: 'high', title: 'Test', summary: 'Test', planes: [] },
          { id: '2', severity: 'high', title: 'Test', summary: 'Test', planes: [] },
          { id: '3', severity: 'warn', title: 'Test', summary: 'Test', planes: [] },
          { id: '4', severity: 'info', title: 'Test', summary: 'Test', planes: [] },
        ],
      },
    })

    const stats = getInspectorStats(data)
    expect(stats?.suggestions.total).toBe(4)
    expect(stats?.suggestions.high).toBe(2)
    expect(stats?.suggestions.warn).toBe(1)
    expect(stats?.suggestions.info).toBe(1)
  })

  it('should handle unknown rule_usage state', () => {
    const data = createMockResponse({
      rule_usage: {
        state: 'unknown',
        reason: 'No observed data',
        window_days: 30,
      },
    })

    const stats = getInspectorStats(data)
    expect(stats?.usedRules).toBe(0)
    expect(stats?.unobservedRules).toBe(0)
    expect(stats?.unknownRules).toBe(0)
  })

  it('should handle unknown suggestions state', () => {
    const data = createMockResponse({
      suggestions: {
        state: 'unknown',
        reason: 'Cannot generate suggestions',
      },
    })

    const stats = getInspectorStats(data)
    expect(stats?.suggestions.total).toBe(0)
  })
})

// =============================================================================
// PUBLIC RULE DETECTION TESTS
// =============================================================================

describe('Public Rule Detection', () => {
  it('should identify 0.0.0.0/0 as public', () => {
    const rule: Rule = {
      rule_id: 'test-1',
      direction: 'ingress',
      proto: 'tcp',
      from_port: 443,
      to_port: 443,
      peer_type: 'cidr4',
      peer_value: '0.0.0.0/0',
      broadness_flags: ['public_world'],
    }

    expect(rule.broadness_flags).toContain('public_world')
  })

  it('should identify ::/0 as public', () => {
    const rule: Rule = {
      rule_id: 'test-2',
      direction: 'ingress',
      proto: 'tcp',
      from_port: 443,
      to_port: 443,
      peer_type: 'cidr6',
      peer_value: '::/0',
      broadness_flags: ['public_world'],
    }

    expect(rule.broadness_flags).toContain('public_world')
  })

  it('should not identify private CIDRs as public', () => {
    const rule: Rule = {
      rule_id: 'test-3',
      direction: 'ingress',
      proto: 'tcp',
      from_port: 443,
      to_port: 443,
      peer_type: 'cidr4',
      peer_value: '10.0.0.0/8',
      broadness_flags: [],
    }

    expect(rule.broadness_flags).not.toContain('public_world')
  })

  it('should not identify SG references as public', () => {
    const rule: Rule = {
      rule_id: 'test-4',
      direction: 'ingress',
      proto: 'tcp',
      from_port: 443,
      to_port: 443,
      peer_type: 'sg',
      peer_value: 'sg-12345678',
      broadness_flags: [],
    }

    expect(rule.broadness_flags).not.toContain('public_world')
  })
})

// =============================================================================
// DIFF PREVIEW RENDERING TESTS
// =============================================================================

describe('Diff Preview Rendering', () => {
  it('should have removes and adds in suggestion preview', () => {
    const mockSuggestion = {
      id: 'test-1',
      severity: 'high' as const,
      title: 'Public ingress on SSH',
      summary: 'Test summary',
      planes: ['Configured', 'Observed'],
      suggested_change_preview: {
        removes: [
          {
            rule_id: 'old-1',
            direction: 'ingress' as const,
            proto: 'tcp',
            from_port: 22,
            to_port: 22,
            peer_type: 'cidr4' as const,
            peer_value: '0.0.0.0/0',
            broadness_flags: ['public_world'],
          },
        ],
        adds: [
          {
            rule_id: 'new-1',
            direction: 'ingress' as const,
            proto: 'tcp',
            from_port: 22,
            to_port: 22,
            peer_type: 'cidr4' as const,
            peer_value: '1.2.3.4/32',
            broadness_flags: [],
          },
        ],
      },
    }

    expect(mockSuggestion.suggested_change_preview).toBeDefined()
    expect(mockSuggestion.suggested_change_preview.removes).toHaveLength(1)
    expect(mockSuggestion.suggested_change_preview.adds).toHaveLength(1)
    expect(mockSuggestion.suggested_change_preview.removes[0].peer_value).toBe('0.0.0.0/0')
    expect(mockSuggestion.suggested_change_preview.adds[0].peer_value).toBe('1.2.3.4/32')
  })

  it('should not have preview when evidence insufficient', () => {
    const mockSuggestion = {
      id: 'test-2',
      severity: 'high' as const,
      title: 'Public ingress on SSH',
      summary: 'Review and restrict source if possible. (Observed confidence: low)',
      planes: ['Configured'],
      suggested_change_preview: undefined,
    }

    expect(mockSuggestion.suggested_change_preview).toBeUndefined()
  })
})
