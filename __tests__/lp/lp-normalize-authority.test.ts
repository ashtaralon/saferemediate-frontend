/// <reference types="vitest/globals" />
/**
 * P0 authority tests for lib/lp-normalize.ts
 *
 * Locks the honest Resource Risk / LP contract: integrity fields survive
 * normalization, missing evidence stays null/empty (never Identity Graph /
 * us-east-1 / 90 / complete=true), highRiskUnused is never FE-synthesized,
 * merge never preserves invented clean scores, and category absence does
 * not become 'removable'.
 */

import { describe, expect, it } from 'vitest'
import { deriveLPIntegrity } from '@/lib/lp-integrity'
import {
  normalizeLPSeverityBucket,
  normalizeGapResource,
  normalizeLPResponse,
  mergeLpResourcesAfterFetch,
  markResourceVerifying,
  type NormalizedGapResource,
} from '@/lib/lp-normalize'

function baseRole(overrides: Record<string, unknown> = {}) {
  return {
    id: 'role-1',
    resourceType: 'IAMRole',
    resourceName: 'demo-role',
    resourceArn: 'arn:aws:iam::123:role/demo-role',
    gapCount: 3,
    gapPercent: 30,
    allowedCount: 10,
    usedCount: 7,
    unusedList: ['iam:PassRole', 's3:DeleteBucket', 'ec2:DescribeInstances'],
    allowedList: [],
    usedList: [],
    ...overrides,
  }
}

describe('normalizeLPSeverityBucket', () => {
  it('returns lowercase buckets for known severities', () => {
    expect(normalizeLPSeverityBucket('CRITICAL')).toBe('critical')
    expect(normalizeLPSeverityBucket('High')).toBe('high')
    expect(normalizeLPSeverityBucket('medium')).toBe('medium')
    expect(normalizeLPSeverityBucket(' LOW ')).toBe('low')
  })

  it('returns null for missing/unknown — never invents low', () => {
    expect(normalizeLPSeverityBucket(undefined)).toBeNull()
    expect(normalizeLPSeverityBucket(null)).toBeNull()
    expect(normalizeLPSeverityBucket('')).toBeNull()
    expect(normalizeLPSeverityBucket('FATAL')).toBeNull()
  })

  it('returns null for INFO (known to lp-severity, not a count bucket)', () => {
    expect(normalizeLPSeverityBucket('INFO')).toBeNull()
  })
})

describe('normalizeLPResponse — integrity fields preserved', () => {
  it('READY: copies serve_state / analysis_complete / failedAnalyzers / integrityReason / counts_are_partial', () => {
    const normalized = normalizeLPResponse({
      serve_state: 'READY',
      analysis_complete: true,
      failedAnalyzers: [],
      integrityReason: null,
      counts_are_partial: false,
      resources: [baseRole()],
      summary: { totalExcessPermissions: 3 },
    })

    expect(normalized.serve_state).toBe('READY')
    expect(normalized.analysis_complete).toBe(true)
    expect(normalized.failedAnalyzers).toEqual([])
    expect(normalized.integrityReason).toBeNull()
    expect(normalized.counts_are_partial).toBe(false)

    const integrity = deriveLPIntegrity(normalized)
    expect(integrity.state).toBe('READY')
    expect(integrity.mutationBlocked).toBe(false)
  })

  it('HELD: preserves fields; deriveLPIntegrity stays INTEGRITY_HELD', () => {
    const normalized = normalizeLPResponse({
      serve_state: 'INTEGRITY_HELD',
      analysis_complete: false,
      failed_analyzers: ['iam_role'],
      integrityReason: 'iam_role analyzer raised',
      counts_are_partial: true,
      resources: [baseRole()],
    })

    expect(normalized.serve_state).toBe('INTEGRITY_HELD')
    expect(normalized.analysis_complete).toBe(false)
    expect(normalized.failed_analyzers).toEqual(['iam_role'])
    expect(normalized.integrityReason).toBe('iam_role analyzer raised')
    expect(normalized.counts_are_partial).toBe(true)

    const integrity = deriveLPIntegrity(normalized)
    expect(integrity.state).toBe('INTEGRITY_HELD')
    expect(integrity.mutationBlocked).toBe(true)
    expect(integrity.countsArePartial).toBe(true)
  })

  it('NOT_READY: preserves fields; deriveLPIntegrity stays NOT_READY', () => {
    const normalized = normalizeLPResponse({
      serve_state: 'NOT_READY',
      analysis_complete: false,
      failedAnalyzers: ['graph_unavailable'],
      integrityReason: 'No graph connection — no analyzer ran.',
      counts_are_partial: true,
      resources: [],
    })

    expect(normalized.serve_state).toBe('NOT_READY')
    expect(normalized.failedAnalyzers).toEqual(['graph_unavailable'])
    expect(deriveLPIntegrity(normalized).state).toBe('NOT_READY')
    expect(deriveLPIntegrity(normalized).mutationBlocked).toBe(true)
  })

  it('missing integrity contract → fields absent/undefined; deriveLPIntegrity fails closed', () => {
    const normalized = normalizeLPResponse({
      resources: [baseRole()],
      summary: {},
    })

    expect(normalized.serve_state).toBeUndefined()
    expect(normalized.analysis_complete).toBeUndefined()
    expect(normalized.failedAnalyzers).toBeUndefined()
    expect(normalized.failed_analyzers).toBeUndefined()
    expect(normalized.integrityReason).toBeUndefined()
    expect(normalized.counts_are_partial).toBeUndefined()

    const integrity = deriveLPIntegrity(normalized)
    expect(integrity.state).toBe('NOT_READY')
    expect(integrity.mutationBlocked).toBe(true)
  })

  it('copies both failedAnalyzers and failed_analyzers when both present', () => {
    const normalized = normalizeLPResponse({
      serve_state: 'INTEGRITY_HELD',
      analysis_complete: false,
      failedAnalyzers: ['a'],
      failed_analyzers: ['b'],
      resources: [],
    })
    expect(normalized.failedAnalyzers).toEqual(['a'])
    expect(normalized.failed_analyzers).toEqual(['b'])
  })

  it('summary.observationDays is null when missing — not 90', () => {
    const normalized = normalizeLPResponse({
      serve_state: 'READY',
      analysis_complete: true,
      resources: [],
      summary: {},
    })
    expect(normalized.summary.observationDays).toBeNull()
  })
})

describe('normalizeGapResource — evidence honesty', () => {
  it('missing evidence → null/empty, not Identity Graph / us-east-1 / 90 / complete=true', () => {
    const r = normalizeGapResource(baseRole({ evidence: undefined, observationDays: undefined }))

    expect(r.evidence.dataSources).toEqual([])
    expect(r.evidence.dataSources).not.toContain('Identity Graph')
    expect(r.evidence.observationDays).toBeNull()
    expect(r.evidence.confidence).toBeNull()
    expect(r.evidence.coverage.regions).toEqual([])
    expect(r.evidence.coverage.regions).not.toContain('us-east-1')
    expect(r.evidence.coverage.complete).toBeNull()
    expect(r.observationDays).toBeNull()
  })

  it('does not treat coverage.complete !== false as true', () => {
    const r = normalizeGapResource(
      baseRole({
        evidence: { coverage: { regions: ['eu-west-1'] } },
      }),
    )
    expect(r.evidence.coverage.complete).toBeNull()
    expect(r.evidence.coverage.regions).toEqual(['eu-west-1'])
  })

  it('accepts explicit boolean complete and HIGH|MEDIUM|LOW confidence only', () => {
    const ok = normalizeGapResource(
      baseRole({
        evidence: {
          dataSources: ['CloudTrail'],
          observationDays: 30,
          confidence: 'HIGH',
          coverage: { regions: ['us-west-2'], complete: false },
        },
        observationDays: 30,
      }),
    )
    expect(ok.evidence.dataSources).toEqual(['CloudTrail'])
    expect(ok.evidence.observationDays).toBe(30)
    expect(ok.evidence.confidence).toBe('HIGH')
    expect(ok.evidence.coverage.complete).toBe(false)
    expect(ok.observationDays).toBe(30)

    const badConf = normalizeGapResource(
      baseRole({ evidence: { confidence: 'LIKELY' }, confidence: 90 }),
    )
    expect(badConf.evidence.confidence).toBeNull()
  })

  it('never invents confidence from numeric thresholds', () => {
    const r = normalizeGapResource(
      baseRole({
        confidence: 95,
        usedCount: 5,
        evidence: {},
      }),
    )
    expect(r.evidence.confidence).toBeNull()
  })

  it('networkExposure.severity is null when missing — not MEDIUM', () => {
    const r = normalizeGapResource(
      baseRole({
        resourceType: 'SecurityGroup',
        networkExposure: { score: 40, totalRules: 2 },
      }),
    )
    expect(r.networkExposure?.severity).toBeNull()
  })

  it('severity is null when unknown — not low', () => {
    expect(normalizeGapResource(baseRole({ severity: undefined })).severity).toBeNull()
    expect(normalizeGapResource(baseRole({ severity: 'WEIRD' })).severity).toBeNull()
    expect(normalizeGapResource(baseRole({ severity: 'CRITICAL' })).severity).toBe('critical')
    expect(normalizeGapResource(baseRole({ severity: 'INFO' })).severity).toBe('INFO')
  })

  it('category missing does not become removable', () => {
    const r = normalizeGapResource(baseRole({ category: undefined }))
    expect(r.category).toBeUndefined()

    const junk = normalizeGapResource(baseRole({ category: 'important' }))
    expect(junk.category).toBeUndefined()

    expect(normalizeGapResource(baseRole({ category: 'coverage' })).category).toBe('coverage')
  })

  it('title falls back to resourceName only — no invented unused-permission copy', () => {
    const r = normalizeGapResource(baseRole({ title: undefined, gapCount: 12 }))
    expect(r.title).toBe('demo-role')
    expect(r.title).not.toMatch(/unused/i)
  })

  it('isRemediable / usageMeasured stay undefined when absent (fail-closed)', () => {
    const r = normalizeGapResource(baseRole())
    expect(r.isRemediable).toBeUndefined()
    expect(r.usageMeasured).toBeUndefined()
  })
})

describe('normalizeGapResource — no FE high-risk unused synthesis', () => {
  it('does not invent highRiskUnused from unusedList', () => {
    const r = normalizeGapResource(
      baseRole({
        unusedList: ['iam:PassRole', 's3:DeleteBucket', 'ec2:TerminateInstances'],
        highRiskUnused: undefined,
      }),
    )
    expect(r.highRiskUnused).toEqual([])
  })

  it('keeps backend structured highRiskUnused with riskLevel', () => {
    const r = normalizeGapResource(
      baseRole({
        highRiskUnused: [
          { permission: 'iam:PassRole', riskLevel: 'CRITICAL', reason: 'escalation' },
          { permission: 's3:GetObject' }, // missing riskLevel — dropped
        ],
      }),
    )
    expect(r.highRiskUnused).toEqual([
      { permission: 'iam:PassRole', riskLevel: 'CRITICAL', reason: 'escalation' },
    ])
  })
})

describe('normalizeLPResponse — service-linked filter', () => {
  it('filters isServiceLinkedRole rows', () => {
    const normalized = normalizeLPResponse({
      resources: [
        baseRole({ id: 'a', resourceName: 'normal' }),
        baseRole({
          id: 'b',
          resourceName: 'AWSServiceRoleForFoo',
          isServiceLinkedRole: true,
        }),
        baseRole({
          id: 'c',
          resourceName: 'slr-snake',
          is_service_linked_role: true,
        }),
      ],
    })
    expect(normalized.resources.map((r) => r.id)).toEqual(['a'])
  })
})

describe('markResourceVerifying', () => {
  it('sets verificationState + receipt metadata without changing scores/lists/severity', () => {
    const before = normalizeGapResource(
      baseRole({
        severity: 'HIGH',
        gapCount: 5,
        gapPercent: 50,
        lpScore: 50,
        unusedList: ['iam:PassRole'],
        highRiskUnused: [
          { permission: 'iam:PassRole', riskLevel: 'CRITICAL', reason: 'esc' },
        ],
      }),
    )

    const after = markResourceVerifying(before, {
      remediatedAt: '2026-08-01T12:00:00.000Z',
      remediatedBy: 'alon@cyntro.io',
      snapshotId: 'snap-1',
      eventId: 'evt-1',
      rollbackAvailable: true,
    })

    expect(after.verificationState).toBe('applied_verifying')
    expect(after.remediatedAt).toBe('2026-08-01T12:00:00.000Z')
    expect(after.remediatedBy).toBe('alon@cyntro.io')
    expect(after.snapshotId).toBe('snap-1')
    expect(after.eventId).toBe('evt-1')
    expect(after.rollbackAvailable).toBe(true)

    // Scores / lists / severity untouched — no invented lpScore 100.
    expect(after.lpScore).toBe(50)
    expect(after.lpScore).not.toBe(100)
    expect(after.gapCount).toBe(5)
    expect(after.gapPercent).toBe(50)
    expect(after.severity).toBe('high')
    expect(after.unusedList).toEqual(['iam:PassRole'])
    expect(after.highRiskUnused).toHaveLength(1)
  })
})

describe('mergeLpResourcesAfterFetch', () => {
  it('does not preserve invented clean scores over backend gaps', () => {
    const backend = normalizeGapResource(
      baseRole({
        gapCount: 4,
        gapPercent: 40,
        lpScore: 60,
        severity: 'HIGH',
        unusedList: ['iam:PassRole'],
        highRiskUnused: [
          { permission: 'iam:PassRole', riskLevel: 'CRITICAL', reason: 'esc' },
        ],
      }),
    )

    // Simulates the old dishonest optimistic overlay that zeroed gaps.
    const prevOptimistic: NormalizedGapResource = {
      ...backend,
      verificationState: 'applied_verifying',
      remediatedAt: '2026-08-01T12:00:00.000Z',
      remediatedBy: 'alon@cyntro.io',
      snapshotId: 'snap-1',
      eventId: 'evt-1',
      rollbackAvailable: true,
      gapCount: 0,
      gapPercent: 0,
      lpScore: 100,
      severity: 'low',
      unusedList: [],
      highRiskUnused: [],
    }

    const backendStillGappy = normalizeGapResource(
      baseRole({
        gapCount: 4,
        gapPercent: 40,
        lpScore: 60,
        severity: 'HIGH',
        unusedList: ['iam:PassRole'],
        highRiskUnused: [
          { permission: 'iam:PassRole', riskLevel: 'CRITICAL', reason: 'esc' },
        ],
        remediatedAt: null,
      }),
    )

    const merged = mergeLpResourcesAfterFetch([prevOptimistic], [backendStillGappy])
    expect(merged).toHaveLength(1)
    expect(merged[0].gapCount).toBe(4)
    expect(merged[0].gapPercent).toBe(40)
    expect(merged[0].lpScore).toBe(60)
    expect(merged[0].severity).toBe('high')
    expect(merged[0].unusedList).toEqual(['iam:PassRole'])
    expect(merged[0].highRiskUnused).toHaveLength(1)

    // Receipt / verifying state may be kept while backend lacks remediatedAt.
    expect(merged[0].verificationState).toBe('applied_verifying')
    expect(merged[0].remediatedAt).toBe('2026-08-01T12:00:00.000Z')
    expect(merged[0].snapshotId).toBe('snap-1')
  })

  it('prefers backend when it returns contradictory remediation state', () => {
    const prev: NormalizedGapResource = {
      ...normalizeGapResource(baseRole({ gapCount: 0, gapPercent: 0, lpScore: 100 })),
      verificationState: 'applied_verifying',
      remediatedAt: '2026-08-01T12:00:00.000Z',
      snapshotId: 'snap-old',
    }

    const backend = normalizeGapResource(
      baseRole({
        gapCount: 2,
        gapPercent: 20,
        lpScore: 80,
        severity: 'MEDIUM',
        remediatedAt: '2026-08-01T13:00:00.000Z',
        snapshotId: 'snap-backend',
      }),
    )

    const merged = mergeLpResourcesAfterFetch([prev], [backend])
    expect(merged[0].remediatedAt).toBe('2026-08-01T13:00:00.000Z')
    expect(merged[0].snapshotId).toBe('snap-backend')
    expect(merged[0].gapCount).toBe(2)
    expect(merged[0].lpScore).toBe(80)
    // Backend won — do not keep applied_verifying over a confirmed receipt.
    expect(merged[0].verificationState).not.toBe('applied_verifying')
  })
})
