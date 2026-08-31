/// <reference types="vitest/globals" />
/**
 * LP integrity contract.
 *
 * `mutationBlocked` is a VETO derived from analyzer serve state. It is not
 * permission to mutate. READY clears the veto; READY does not imply Apply
 * authorization. There is deliberately no `mutations_allowed` field — a field
 * that can say yes eventually gets set to yes. Apply authority lives at the
 * mutation/coverage gate on the apply endpoint.
 */

import { describe, expect, it } from 'vitest'
import {
  assertsAnalysisComplete,
  deriveLPIntegrity,
  hasInconsistentAnalysisState,
  isStaleAnalysisReason,
  lpEvidenceGapCopy,
  lpIntegrityCopy,
  lpIntegrityFooter,
  type LPIntegrityFields,
} from '@/lib/lp-integrity'
import { resourceRiskDecision } from '@/lib/resource-risk-decision'

describe('deriveLPIntegrity — mutationBlocked is veto only', () => {
  it('READY + analysis_complete clears the veto', () => {
    const payload: LPIntegrityFields = {
      serve_state: 'READY',
      analysis_complete: true,
      failedAnalyzers: [],
      counts_are_partial: false,
    }
    const i = deriveLPIntegrity(payload)
    expect(i.state).toBe('READY')
    expect(i.mutationBlocked).toBe(false)
  })

  it('READY does not imply Apply authorization — no mutations_allowed field exists', () => {
    const payload: LPIntegrityFields & Record<string, unknown> = {
      serve_state: 'READY',
      analysis_complete: true,
    }
    const i = deriveLPIntegrity(payload)

    // Clearing the veto is not a grant. The integrity payload has no
    // mutations_allowed (and must not grow one).
    expect(i.mutationBlocked).toBe(false)
    expect('mutations_allowed' in payload).toBe(false)
    expect((i as unknown as Record<string, unknown>).mutations_allowed).toBeUndefined()
    expect((i as unknown as Record<string, unknown>).mutationsAllowed).toBeUndefined()
  })

  it('INTEGRITY_HELD / NOT_READY / missing contract keep the veto', () => {
    expect(
      deriveLPIntegrity({
        serve_state: 'INTEGRITY_HELD',
        analysis_complete: false,
        failed_analyzers: ['iam_role'],
        counts_are_partial: true,
      }).mutationBlocked,
    ).toBe(true)

    expect(
      deriveLPIntegrity({
        serve_state: 'NOT_READY',
        analysis_complete: false,
        integrityReason: 'No graph connection',
      }).mutationBlocked,
    ).toBe(true)

    expect(deriveLPIntegrity({}).mutationBlocked).toBe(true)
    expect(deriveLPIntegrity(null).mutationBlocked).toBe(true)
    expect(deriveLPIntegrity(undefined).mutationBlocked).toBe(true)
  })

  it('serve_state READY without analysis_complete remains vetoed', () => {
    const i = deriveLPIntegrity({
      serve_state: 'READY',
      analysis_complete: false,
    })
    expect(i.state).toBe('NOT_READY')
    expect(i.mutationBlocked).toBe(true)
  })
})

describe('lpIntegrityCopy — stale vs never-ran', () => {
  it('stale/timeout reason does not claim Analysis did not run', () => {
    const reason =
      'Showing the last complete analysis (42s old) — the live analysis timed out. Remediation is unavailable until it succeeds.'
    expect(isStaleAnalysisReason(reason)).toBe(true)
    const copy = lpIntegrityCopy({
      state: 'NOT_READY',
      analysisComplete: false,
      mutationBlocked: true,
      countsArePartial: true,
      failedAnalyzers: [],
      reason,
    })
    expect(copy.title).toBe('Live analysis unavailable')
    expect(copy.body).toContain('timed out')
    expect(copy.title.toLowerCase()).not.toContain('did not run')
  })

  it('true never-ran keeps Analysis did not run', () => {
    const copy = lpIntegrityCopy({
      state: 'NOT_READY',
      analysisComplete: false,
      mutationBlocked: true,
      countsArePartial: true,
      failedAnalyzers: [],
      reason: null,
    })
    expect(copy.title).toBe('Analysis did not run')
    expect(lpIntegrityFooter({
      state: 'NOT_READY',
      analysisComplete: false,
      mutationBlocked: true,
      countsArePartial: true,
      failedAnalyzers: [],
      reason: null,
    })).toMatch(/until the analysis completes/)
  })

  it('complete analysis with unknown generation is not "did not run"', () => {
    const copy = lpIntegrityCopy({
      state: 'NOT_READY',
      analysisComplete: true,
      mutationBlocked: true,
      countsArePartial: true,
      failedAnalyzers: [],
      reason:
        'Analysis complete; remediation is not ready because the active generation is unknown.',
    })
    expect(copy.title).toBe('Remediation is not ready')
    expect(copy.body).toContain('active generation is unknown')
    expect(copy.title.toLowerCase()).not.toContain('did not run')
    expect(lpIntegrityFooter({
      state: 'NOT_READY',
      analysisComplete: true,
      mutationBlocked: true,
      countsArePartial: true,
      failedAnalyzers: [],
      reason: copy.body,
    })).toBe(
      'Analysis is complete, but remediation remains unavailable until the readiness blocker above is cleared.',
    )
    // The footer must not name a cause: a generation can be active while a
    // different readiness check is the blocker.
    expect(lpIntegrityFooter({
      state: 'NOT_READY',
      analysisComplete: true,
      mutationBlocked: true,
      countsArePartial: true,
      failedAnalyzers: [],
      reason: copy.body,
    })).not.toMatch(/generation is (unknown|active)/i)
    expect(lpIntegrityFooter({
      state: 'NOT_READY',
      analysisComplete: true,
      mutationBlocked: true,
      countsArePartial: true,
      failedAnalyzers: [],
      reason: copy.body,
    })).not.toMatch(/until the analysis completes/i)
  })
})

describe('a payload that contradicts itself is not rendered as fact', () => {
  // Regression, 2026-08-31 (C1). While the backend was restarting, the proxy
  // served a stale fallback carrying integrityReason but no analysis_complete.
  // The banner then showed three mutually exclusive claims at once:
  //   title  "Analysis did not run"
  //   body   "Analysis complete; remediation is not ready because ..."
  //   footer "Remediation is unavailable until the analysis completes."
  // lpIntegrityFooter's own docstring says it must not contradict the body.
  const inconsistent = {
    state: 'NOT_READY' as const,
    analysisComplete: false,
    mutationBlocked: true,
    countsArePartial: true,
    failedAnalyzers: [],
    reason:
      'Analysis complete; remediation is not ready because the active generation is unknown.',
  }

  it('detects the inconsistency', () => {
    expect(assertsAnalysisComplete(inconsistent.reason)).toBe(true)
    expect(hasInconsistentAnalysisState(inconsistent)).toBe(true)
  })

  it('never claims the analysis did not run while echoing that it completed', () => {
    const copy = lpIntegrityCopy(inconsistent)
    expect(copy.title).not.toMatch(/did not run/i)
    expect(copy.body).not.toMatch(/analysis complete/i)
    expect(copy.title).toBe('Analysis state unavailable')
  })

  it('footer does not claim we are waiting on a sweep that reported completion', () => {
    const footer = lpIntegrityFooter(inconsistent)
    expect(footer).not.toMatch(/until the analysis completes/i)
    expect(footer).toMatch(/partial/i)
  })

  it('leaves the consistent cases alone', () => {
    const complete = { ...inconsistent, analysisComplete: true }
    expect(hasInconsistentAnalysisState(complete)).toBe(false)
    expect(lpIntegrityCopy(complete).title).toBe('Remediation is not ready')

    const neverRan = { ...inconsistent, reason: null }
    expect(hasInconsistentAnalysisState(neverRan)).toBe(false)
    expect(lpIntegrityCopy(neverRan).title).toBe('Analysis did not run')
  })
})

describe('lpEvidenceGapCopy — analysis vs observation', () => {
  const ownershipBlockedRow = {
    resourceName: 'cyntro-tb-prod-web-role',
    decisionCanonical: 'BLOCK' as const,
    remediableReason:
      'Ownership is unknown; execution adapter cannot be selected safely',
    coverageState: 'COMPLETE',
    category: 'audit' as const,
  }

  it('does not invent an observation explanation for an ownership-blocked row', () => {
    expect(resourceRiskDecision(ownershipBlockedRow)).toBe('BLOCK')
    const copy = lpEvidenceGapCopy({
      state: 'NOT_READY',
      analysisComplete: true,
      mutationBlocked: true,
      countsArePartial: true,
      failedAnalyzers: [],
      reason: 'Analysis complete; remediation is not ready because the active generation is unknown.',
    })
    expect(copy.title).toBe('Some resources are also blocked')
    expect(copy.body).toContain('review the reason shown on each row')
    expect(copy.body).not.toMatch(/observation data|VPC Flow Logs|CloudTrail|S3 Data Events/i)
    expect(copy.title.toLowerCase()).not.toContain('observation')
  })

  it('does not claim analysis did not run when the sweep completed', () => {
    const copy = lpEvidenceGapCopy({
      state: 'NOT_READY',
      analysisComplete: true,
      mutationBlocked: true,
      countsArePartial: true,
      failedAnalyzers: [],
      reason: 'Analysis complete; remediation is not ready because the active generation is unknown.',
    })
    expect(copy.title).toBe('Some resources are also blocked')
    expect(copy.body).toContain('Analysis already ran')
    expect(copy.body.toLowerCase()).not.toContain("don't have enough observation data to analyse")
  })

  it('keeps the observation-gap title when analysis never completed', () => {
    const copy = lpEvidenceGapCopy({
      state: 'NOT_READY',
      analysisComplete: false,
      mutationBlocked: true,
      countsArePartial: true,
      failedAnalyzers: [],
      reason: null,
    })
    expect(copy.title).toBe("These resources don't have enough observation data to analyse")
  })
})
