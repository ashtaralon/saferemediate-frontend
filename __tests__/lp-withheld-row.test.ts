/// <reference types="vitest/globals" />
/**
 * Withheld confidence and blast-radius band on an unverified IAM usage
 * generation (lib/lp-normalize, lib/lp-readiness-copy).
 *
 * Fixture: GET /api/proxy/least-privilege/issues?systemName=testbed-webshop,
 * captured 2026-09-28 (tenant testbed-webshop, account 416651950952), trimmed
 * to the IAM usage lane and one IAM row. That backend still sends confidence
 * MEDIUM, a LOW band and no evidence authority on a row whose usage generation
 * it reports as not verified, so the normalizer must withhold them itself —
 * and must leave a backend that already withheld them exactly as sent.
 */

import { describe, expect, it } from 'vitest'
import captured from '@/__tests__/fixtures/lp-issues-testbed-webshop-2026-09-28.json'
import { IAM_USAGE_BAND_WITHHELD_RATIONALE, normalizeLPResponse } from '@/lib/lp-normalize'
import {
  IAM_USAGE_BLOCKER_MEANINGS,
  IAM_USAGE_GENERATION_UNVERIFIED,
  IAM_USAGE_UNKNOWN_FALLBACK,
  iamUsageUnknownCopy,
  lpConfidenceWithheldCopy,
} from '@/lib/lp-readiness-copy'

type Row = Record<string, unknown> & {
  evidence: Record<string, unknown> & { violatedRules: Array<Record<string, unknown>> }
  blastRadius: Record<string, unknown>
}
type Payload = Record<string, unknown> & {
  resources: Row[]
  readiness_by_lane: { cloudtrail_iam_usage: { generation: Record<string, unknown> } }
}

const CAPTURED_BLOCKERS = [
  'ACTIVE_GENERATION_UNKNOWN',
  'TRAFFIC_INGEST_NOT_INCREMENTAL',
  'NEGATIVE_AUTHORITY_NOT_PERMITTED',
  'DECISION_READINESS_NOT_READY',
]

/** A fresh copy of the captured payload per test — the normalizer must not be handed a shared object. */
function capturedPayload(): Payload {
  return JSON.parse(JSON.stringify(captured)) as Payload
}

/** The same row under the contract's verified branch: only the lane flags differ. */
function verifiedPayload(): Payload {
  const payload = capturedPayload()
  payload.readiness_by_lane.cloudtrail_iam_usage.generation = {
    ...payload.readiness_by_lane.cloudtrail_iam_usage.generation,
    known: true,
    negative_authority_permitted: true,
    blockers: [],
  }
  return payload
}

/** The captured row as the in-flight backend change will send it: already withheld. */
function backendWithheldPayload(): Payload {
  const payload = capturedPayload()
  const row = payload.resources[0]
  row.confidence = null
  row.confidence_basis = null
  row.confidence_withheld_reason = IAM_USAGE_GENERATION_UNVERIFIED
  row.evidence.confidence = null
  row.evidence.confidence_basis = null
  row.evidence.confidence_withheld_reason = IAM_USAGE_GENERATION_UNVERIFIED
  row.evidence.escalation_evidence_authority = 'LEGACY_EDGES_UNVERIFIED'
  row.evidence.violatedRules[0].evidence_authority = 'LEGACY_EDGES_UNVERIFIED'
  row.blastRadius = {
    ...row.blastRadius,
    band: null,
    confidence: null,
    ips_basis: 'legacy_usage_unverified',
    rationale: [IAM_USAGE_BAND_WITHHELD_RATIONALE],
  }
  return payload
}

function violatedRules(resource: { evidence: { violatedRules?: unknown } }): Array<Record<string, unknown>> {
  return resource.evidence.violatedRules as Array<Record<string, unknown>>
}

function blastRadius(resource: { blastRadius?: unknown }): Record<string, unknown> {
  return resource.blastRadius as Record<string, unknown>
}

describe('normalizeLPResponse — unverified IAM usage generation (captured testbed-webshop)', () => {
  it('carries the lane blockers on the response and on the flagged IAM row', () => {
    const normalized = normalizeLPResponse(capturedPayload())
    expect(normalized.usageGenerationBlockers).toEqual(CAPTURED_BLOCKERS)
    const role = normalized.resources[0]
    expect(role.usageGenerationUnverified).toBe(true)
    expect(role.usageGenerationBlockers).toEqual(CAPTURED_BLOCKERS)
  })

  it('withholds the usage, confidence and band the live backend still sends, keeping the rest', () => {
    const role = normalizeLPResponse(capturedPayload()).resources[0]
    expect(role).toMatchObject({
      usedCount: null, gapCount: null, gapPercent: null, lpScore: null,
      confidence: null, allowedCount: 29, severity: 'high',
    })
    expect(role.evidence.confidence).toBeNull()
    expect(role.evidence.dataSources).toEqual(['Neptune', 'CloudTrail'])
    expect(role.evidence.observationDays).toBe(44)
    expect(blastRadius(role)).toMatchObject({
      brs: 14.4, band: null, confidence: null,
      components: { doc: 0, ips: 37.4, nes: 20, lms: 0 },
      amplifier: 1, doc_floor_applied: false,
    })
    expect(blastRadius(role).rationale).toEqual([IAM_USAGE_BAND_WITHHELD_RATIONALE])
  })

  it('labels each iam.escalation.* rule LEGACY_EDGES_UNVERIFIED without touching the detection', () => {
    const role = normalizeLPResponse(capturedPayload()).resources[0]
    const [rule] = violatedRules(role)
    expect(rule.evidence_authority).toBe('LEGACY_EDGES_UNVERIFIED')
    expect(rule).toMatchObject({
      rule: 'iam.escalation.kms_decrypt_sensitive_data',
      severity: 'HIGH',
      primitive: 'kms_decrypt_sensitive_data',
      evidence_actions: ['kms:Decrypt', 's3:GetObject'],
      evidence_resources: ['s3', 'kms'],
      detector_version: '1.0.0',
    })
    expect(rule.message).toBe(captured.resources[0].evidence.violatedRules[0].message)
  })

  it('leaves a backend that already withheld as sent: no second rationale, no relabel, provenance carried', () => {
    const role = normalizeLPResponse(backendWithheldPayload()).resources[0]
    expect(role.confidence).toBeNull()
    expect(role.confidence_basis).toBeNull()
    expect(role.confidence_withheld_reason).toBe(IAM_USAGE_GENERATION_UNVERIFIED)
    expect(role.evidence.confidence).toBeNull()
    expect(role.evidence.confidence_basis).toBeNull()
    expect(role.evidence.confidence_withheld_reason).toBe(IAM_USAGE_GENERATION_UNVERIFIED)
    expect(role.evidence.escalation_evidence_authority).toBe('LEGACY_EDGES_UNVERIFIED')
    expect(violatedRules(role)[0].evidence_authority).toBe('LEGACY_EDGES_UNVERIFIED')
    expect(blastRadius(role)).toMatchObject({ band: null, confidence: null, ips_basis: 'legacy_usage_unverified' })
    expect(blastRadius(role).rationale).toEqual([IAM_USAGE_BAND_WITHHELD_RATIONALE])
  })
})

describe('normalizeLPResponse — verified generation leaves the captured row untouched', () => {
  it('keeps usage, confidence, band and the unlabelled escalation rule as sent', () => {
    const normalized = normalizeLPResponse(verifiedPayload())
    expect(normalized.usageGenerationBlockers).toEqual([])
    const role = normalized.resources[0]
    expect(role.usageGenerationUnverified).toBeUndefined()
    expect(role.usageGenerationBlockers).toBeUndefined()
    expect(role).toMatchObject({
      usedCount: 11, gapCount: 18, gapPercent: 62.1, lpScore: 37.9, allowedCount: 29,
    })
    expect(role.evidence.confidence).toBe('MEDIUM')
    expect(role.evidence.confidence_withheld_reason).toBeUndefined()
    expect(blastRadius(role)).toEqual(captured.resources[0].blastRadius)
    expect(violatedRules(role)[0].evidence_authority).toBeUndefined()
  })

  it('carries a VERIFIED_GENERATION label the backend sends, unchanged', () => {
    const payload = verifiedPayload()
    payload.resources[0].evidence.violatedRules[0].evidence_authority = 'VERIFIED_GENERATION'
    payload.resources[0].evidence.escalation_evidence_authority = 'VERIFIED_GENERATION'
    const role = normalizeLPResponse(payload).resources[0]
    expect(violatedRules(role)[0].evidence_authority).toBe('VERIFIED_GENERATION')
    expect(role.evidence.escalation_evidence_authority).toBe('VERIFIED_GENERATION')
  })
})

describe('iamUsageUnknownCopy — names the first blocker and its meaning', () => {
  it('maps each of the four lane codes', () => {
    expect(iamUsageUnknownCopy(['ACTIVE_GENERATION_UNKNOWN']))
      .toBe('Usage unknown — ACTIVE_GENERATION_UNKNOWN: no active IAM usage generation')
    expect(iamUsageUnknownCopy(['TRAFFIC_INGEST_NOT_INCREMENTAL']))
      .toBe('Usage unknown — TRAFFIC_INGEST_NOT_INCREMENTAL: this tenant is on the legacy engine; usage cannot be verified')
    expect(iamUsageUnknownCopy(['NEGATIVE_AUTHORITY_NOT_PERMITTED']))
      .toBe('Usage unknown — NEGATIVE_AUTHORITY_NOT_PERMITTED: the generation does not permit removal decisions')
    expect(iamUsageUnknownCopy(['DECISION_READINESS_NOT_READY']))
      .toBe('Usage unknown — DECISION_READINESS_NOT_READY: decision readiness is not ready')
    expect(Object.keys(IAM_USAGE_BLOCKER_MEANINGS)).toHaveLength(4)
  })

  it('uses the FIRST blocker of the captured lane', () => {
    expect(iamUsageUnknownCopy(CAPTURED_BLOCKERS))
      .toBe('Usage unknown — ACTIVE_GENERATION_UNKNOWN: no active IAM usage generation')
  })

  it('prints a code it does not know as itself, never a guessed meaning', () => {
    // A real readiness code from the same capture that is not a lane blocker.
    expect(iamUsageUnknownCopy(['IAP_INVENTORY_ABSENT'])).toBe('Usage unknown — IAP_INVENTORY_ABSENT')
    // An Object.prototype key is not a meaning either.
    expect(iamUsageUnknownCopy(['constructor'])).toBe('Usage unknown — constructor')
  })

  it('keeps the surface sentence when there are no blockers', () => {
    expect(iamUsageUnknownCopy([])).toBe(IAM_USAGE_UNKNOWN_FALLBACK)
    expect(iamUsageUnknownCopy(undefined)).toBe(IAM_USAGE_UNKNOWN_FALLBACK)
    expect(iamUsageUnknownCopy(null)).toBe(IAM_USAGE_UNKNOWN_FALLBACK)
    expect(iamUsageUnknownCopy([], 'Usage unknown — IAM usage generation is not verified; review required'))
      .toBe('Usage unknown — IAM usage generation is not verified; review required')
  })
})

describe('lpConfidenceWithheldCopy', () => {
  it('names the unverified generation for the backend code and for a client-side hold', () => {
    expect(lpConfidenceWithheldCopy(IAM_USAGE_GENERATION_UNVERIFIED))
      .toBe('Confidence withheld: IAM usage generation not verified')
    expect(lpConfidenceWithheldCopy(null)).toBe('Confidence withheld: IAM usage generation not verified')
    expect(lpConfidenceWithheldCopy(undefined)).toBe('Confidence withheld: IAM usage generation not verified')
  })

  it('prints any other reason code as itself', () => {
    expect(lpConfidenceWithheldCopy('IAP_INVENTORY_ABSENT')).toBe('Confidence withheld: IAP_INVENTORY_ABSENT')
  })
})
