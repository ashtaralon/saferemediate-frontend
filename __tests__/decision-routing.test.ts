/// <reference types="vitest/globals" />
/**
 * decision-routing tests
 * ======================
 *
 * Foundation for v4.4 §11E enum convergence. The 4-state canonical
 * (AUTO / STAGED_AUTO / SUGGEST / INSUFFICIENT_DATA) is the target;
 * the helper normalises four currently-coexisting vocabularies onto it.
 *
 * Tests cover every known input vocabulary plus the failure modes that
 * a future regression would silently re-introduce (defaulting unknown
 * input to AUTO, treating null as a state, etc).
 */

import {
  toRoutingDecision,
  routingLabel,
  routingRank,
  stricter,
  type RoutingDecision,
} from '../lib/decision-routing'

describe('toRoutingDecision', () => {
  test('canonical v4.4 §11E values pass through identity', () => {
    expect(toRoutingDecision('AUTO')).toBe('AUTO')
    expect(toRoutingDecision('STAGED_AUTO')).toBe('STAGED_AUTO')
    expect(toRoutingDecision('SUGGEST')).toBe('SUGGEST')
    expect(toRoutingDecision('INSUFFICIENT_DATA')).toBe('INSUFFICIENT_DATA')
  })

  test('6-state legacy DecisionOutcomeCanonical (backend wire format)', () => {
    expect(toRoutingDecision('AUTO_EXECUTE')).toBe('AUTO')
    expect(toRoutingDecision('CANARY_FIRST')).toBe('STAGED_AUTO')
    expect(toRoutingDecision('REQUIRE_APPROVAL')).toBe('STAGED_AUTO')
    expect(toRoutingDecision('MANUAL_REVIEW')).toBe('SUGGEST')
    expect(toRoutingDecision('BLOCK')).toBe('INSUFFICIENT_DATA')
    expect(toRoutingDecision('EXCLUDE')).toBe('INSUFFICIENT_DATA')
  })

  test('iam-permission-analysis-modal bucket vocabulary (lowercase-snake)', () => {
    expect(toRoutingDecision('auto_execute')).toBe('AUTO')
    expect(toRoutingDecision('human_approval')).toBe('STAGED_AUTO')
    expect(toRoutingDecision('manual_review')).toBe('SUGGEST')
    expect(toRoutingDecision('blocked')).toBe('INSUFFICIENT_DATA')
  })

  test('simulate-modal local enum (EXECUTE/CANARY/REVIEW/BLOCK)', () => {
    expect(toRoutingDecision('EXECUTE')).toBe('AUTO')
    expect(toRoutingDecision('CANARY')).toBe('STAGED_AUTO')
    expect(toRoutingDecision('REVIEW')).toBe('SUGGEST')
    expect(toRoutingDecision('BLOCK')).toBe('INSUFFICIENT_DATA')
  })

  test('AUTO_REMEDIATE (from simulate API decision.action switch) maps to AUTO', () => {
    // components/simulate-modal.tsx:201 switches on `simulation.decision.action === "AUTO_REMEDIATE"`
    expect(toRoutingDecision('AUTO_REMEDIATE')).toBe('AUTO')
  })

  test('input is case-insensitive', () => {
    expect(toRoutingDecision('auto_execute')).toBe('AUTO')
    expect(toRoutingDecision('Auto_Execute')).toBe('AUTO')
    expect(toRoutingDecision('AUTO_EXECUTE')).toBe('AUTO')
    expect(toRoutingDecision('block')).toBe('INSUFFICIENT_DATA')
    expect(toRoutingDecision('BLOCK')).toBe('INSUFFICIENT_DATA')
  })

  test('whitespace is trimmed', () => {
    expect(toRoutingDecision(' AUTO ')).toBe('AUTO')
    expect(toRoutingDecision('AUTO\t')).toBe('AUTO')
    expect(toRoutingDecision('\nBLOCK\n')).toBe('INSUFFICIENT_DATA')
  })

  test('returns null for unknown / nullish / non-string input — never defaults to AUTO', () => {
    // Regression: a fall-through default to AUTO would silently classify
    // unknown verdicts as safe-to-apply. Must stay null.
    expect(toRoutingDecision(null)).toBeNull()
    expect(toRoutingDecision(undefined)).toBeNull()
    expect(toRoutingDecision('')).toBeNull()
    expect(toRoutingDecision('   ')).toBeNull()
    expect(toRoutingDecision('NOT_A_KNOWN_VALUE')).toBeNull()
    expect(toRoutingDecision('AUTO_EXEC')).toBeNull() // partial match must not pass
    expect(toRoutingDecision({})).toBeNull()
    expect(toRoutingDecision([])).toBeNull()
    expect(toRoutingDecision(true)).toBeNull()
  })
})

describe('routingLabel', () => {
  test('canonical labels', () => {
    expect(routingLabel('AUTO')).toBe('Safe to apply')
    expect(routingLabel('STAGED_AUTO')).toBe('Canary first')
    expect(routingLabel('SUGGEST')).toBe('Review required')
    expect(routingLabel('INSUFFICIENT_DATA')).toBe('Blocked — insufficient evidence')
  })

  test('null returns Pending (never a stale-looking string)', () => {
    expect(routingLabel(null)).toBe('Pending')
  })
})

describe('routingRank', () => {
  test('INSUFFICIENT_DATA is strictest, AUTO is most permissive', () => {
    expect(routingRank('INSUFFICIENT_DATA')).toBeLessThan(routingRank('SUGGEST'))
    expect(routingRank('SUGGEST')).toBeLessThan(routingRank('STAGED_AUTO'))
    expect(routingRank('STAGED_AUTO')).toBeLessThan(routingRank('AUTO'))
  })
})

describe('stricter', () => {
  test('returns the more conservative of two values', () => {
    expect(stricter('AUTO', 'SUGGEST')).toBe('SUGGEST')
    expect(stricter('STAGED_AUTO', 'AUTO')).toBe('STAGED_AUTO')
    expect(stricter('INSUFFICIENT_DATA', 'AUTO')).toBe('INSUFFICIENT_DATA')
  })

  test('null is treated as INSUFFICIENT_DATA (the strictest)', () => {
    expect(stricter(null, 'AUTO')).toBe('INSUFFICIENT_DATA')
    expect(stricter('AUTO', null)).toBe('INSUFFICIENT_DATA')
    expect(stricter(null, null)).toBe('INSUFFICIENT_DATA')
  })

  test('equal values return identity', () => {
    expect(stricter('AUTO', 'AUTO')).toBe('AUTO')
    expect(stricter('SUGGEST', 'SUGGEST')).toBe('SUGGEST')
  })
})

describe('convergence regression — every known vocabulary maps cleanly', () => {
  // If a future change makes any of these inputs silently null, the
  // codebase's vocabulary convergence has a gap. Keep this list in
  // sync with the four documented vocabularies in decision-routing.ts.
  const ALL_LEGACY_INPUTS = [
    // 6-state DecisionOutcomeCanonical (lib/types.ts)
    'AUTO_EXECUTE', 'REQUIRE_APPROVAL', 'CANARY_FIRST',
    'MANUAL_REVIEW', 'BLOCK', 'EXCLUDE',
    // 4-state IAM modal canonicalToBucket
    'auto_execute', 'human_approval', 'manual_review', 'blocked',
    // 4-state v4.4 §11E (already canonical)
    'AUTO', 'STAGED_AUTO', 'SUGGEST', 'INSUFFICIENT_DATA',
    // 4-state simulate-modal local Decision
    'EXECUTE', 'CANARY', 'REVIEW',
    // The shape returned by /api/proxy/simulate's decision.action field
    'AUTO_REMEDIATE',
  ]

  test('every known input maps to a canonical value (none silently null)', () => {
    for (const input of ALL_LEGACY_INPUTS) {
      expect(toRoutingDecision(input), `input "${input}" returned null`).not.toBeNull()
    }
  })

  test('every mapped output is one of the four canonical values', () => {
    const valid: Set<RoutingDecision> = new Set([
      'AUTO', 'STAGED_AUTO', 'SUGGEST', 'INSUFFICIENT_DATA',
    ])
    for (const input of ALL_LEGACY_INPUTS) {
      const out = toRoutingDecision(input)
      expect(out, `input "${input}"`).not.toBeNull()
      expect(
        valid.has(out as RoutingDecision),
        `input "${input}" mapped to "${out}" (not a canonical RoutingDecision)`,
      ).toBe(true)
    }
  })
})
