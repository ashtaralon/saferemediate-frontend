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
import { deriveLPIntegrity, type LPIntegrityFields } from '@/lib/lp-integrity'

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
    expect((i as Record<string, unknown>).mutations_allowed).toBeUndefined()
    expect((i as Record<string, unknown>).mutationsAllowed).toBeUndefined()
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
