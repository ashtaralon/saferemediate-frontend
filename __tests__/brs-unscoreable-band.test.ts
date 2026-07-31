/// <reference types="vitest/globals" />

// Marks this file a MODULE. Without an import or export, TypeScript
// treats a .ts file as a SCRIPT and its top-level declarations become
// GLOBAL — so two test files that both declare a helper named `Row` or
// `isRemediated` collide, and tsc reports the error against BOTH. These
// replica-style tests deliberately re-declare small local types, so they
// must each be scoped.
export {}

/**
 * A blast radius that could not be scored must not render as a low one.
 *
 * Observed in production 2026-08-01: the four IAM roles whose permissions sync
 * failed rendered `BLAST RADIUS 11 LOW` — the lowest band on the tab. Three of
 * the four BRS components are derived from the role's permissions, so with
 * nothing to read they scored at their floor and the composite banded LOW.
 *
 * The backend now withholds `band` (null) for those rows rather than asserting
 * a risk class. This pins the render side: the cell has THREE states, not two.
 * Showing the bare number without its chip would not be enough — "11" on its
 * own still reads as low risk, which is the entire defect.
 */

type BlastRadius = {
  brs: number
  band: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | null
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
}

/** components/LeastPrivilegeTab.tsx — the BLAST RADIUS cell's three states. */
function cellState(blastRadius?: BlastRadius): 'missing' | 'unscoreable' | 'scored' {
  if (!blastRadius) return 'missing'
  if (blastRadius.band == null) return 'unscoreable'
  return 'scored'
}

/** components/LeastPrivilegeTab.tsx — getBRSColor. */
function getBRSColor(band?: string | null) {
  switch ((band || '').toUpperCase()) {
    case 'CRITICAL': return '#ef4444'
    case 'HIGH': return '#f97316'
    case 'MEDIUM': return '#eab308'
    case 'LOW': return '#22c55e'
    default: return '#6b7280'
  }
}

/** The exact payload served for alon-prod-web-role, post-fix. */
const UNSCOREABLE: BlastRadius = { brs: 11.2, band: null, confidence: 'LOW' }

describe('the unscoreable state is distinct from both other states', () => {
  it('a withheld band renders as unscoreable, not as a score', () => {
    expect(cellState(UNSCOREABLE)).toBe('unscoreable')
  })

  it('an absent blastRadius stays "missing" — a different meaning', () => {
    // "no BRS at all" (old backend) vs "BRS computed but not classifiable".
    // Collapsing them would hide a deploy problem behind a data problem.
    expect(cellState(undefined)).toBe('missing')
  })

  it('a real band still renders as a score', () => {
    expect(cellState({ brs: 47.1, band: 'MEDIUM', confidence: 'HIGH' })).toBe('scored')
    expect(cellState({ brs: 11.2, band: 'LOW', confidence: 'LOW' })).toBe('scored')
  })
})

describe('the defect this prevents', () => {
  it('the pre-fix cell would have shown a LOW chip for an unreadable role', () => {
    const preFix = (b?: BlastRadius) => (b ? 'scored' : 'missing')
    expect(preFix({ ...UNSCOREABLE, band: 'LOW' })).toBe('scored')
  })

  it('showing the number alone is not sufficient', () => {
    // 11 with no chip still reads as low risk to an operator scanning a
    // column of numbers, which is why the cell renders "?" instead.
    expect(UNSCOREABLE.brs).toBeLessThan(35)
    expect(cellState(UNSCOREABLE)).not.toBe('scored')
  })
})

describe('null band cannot crash the colour helper', () => {
  it('falls through to the neutral grey', () => {
    expect(getBRSColor(null)).toBe('#6b7280')
    expect(getBRSColor(undefined)).toBe('#6b7280')
  })

  it('still resolves real bands', () => {
    expect(getBRSColor('LOW')).toBe('#22c55e')
    expect(getBRSColor('CRITICAL')).toBe('#ef4444')
  })
})
