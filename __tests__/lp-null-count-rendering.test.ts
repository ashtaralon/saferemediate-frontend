/// <reference types="vitest/globals" />
/**
 * Null usage counts must never be coerced into a flattering number.
 *
 * `usedCount` / `gapCount` / `gapPercent` are nullable: a resource whose usage
 * was never computed has no honest integer to show. A backend audit found the
 * frontend turned those nulls into confident-looking values in five places —
 * the worst being `100 - null === 100`, which rendered a role nobody measured
 * as a PERFECT least-privilege score.
 *
 * These pin the coercions themselves rather than the components, so they stay
 * meaningful regardless of how the JSX moves around.
 */

/** components/LeastPrivilegeTab.tsx — per-row lpScore derivation. */
function deriveLpScore(r: { lpScore?: number | null; gapPercent?: number | null }) {
  return r.lpScore ?? (typeof r.gapPercent === 'number' ? 100 - r.gapPercent : null)
}

/** components/LeastPrivilegeTab.tsx — fleet averages over MEASURED rows only. */
function avgLpScore(resources: Array<{ gapPercent?: number | null }>) {
  const measured = resources.filter((r) => typeof r.gapPercent === 'number')
  // null, not 100 (changed 2026-08-01): with nothing measured there is no
  // average, and 100 asserts a perfect estate on zero evidence.
  if (measured.length === 0) return null
  return measured.reduce((acc, r) => acc + (100 - (r.gapPercent as number)), 0) / measured.length
}

/** components/system-map-preview.tsx — column ordering. */
function gapOf(n: { gapCount?: number | null }) {
  return typeof n.gapCount === 'number' ? n.gapCount : -1
}

describe('lpScore never rewards a resource for being unmeasured', () => {
  it('returns null when gapPercent was never computed', () => {
    expect(deriveLpScore({ gapPercent: null })).toBeNull()
  })

  it('the pre-fix guard let null through and produced a perfect score', () => {
    // Documents the exact defect: `!== undefined` is true for null.
    const buggy = (r: { gapPercent: number | null }) =>
      r.gapPercent !== undefined ? 100 - (r.gapPercent as number) : null
    expect(buggy({ gapPercent: null })).toBe(100)
    expect(deriveLpScore({ gapPercent: null })).toBeNull()
  })

  it('still derives a real score from a real gap', () => {
    expect(deriveLpScore({ gapPercent: 85 })).toBe(15)
    expect(deriveLpScore({ gapPercent: 0 })).toBe(100)
  })

  it('an explicit lpScore always wins', () => {
    expect(deriveLpScore({ lpScore: 42, gapPercent: null })).toBe(42)
  })
})

describe('fleet averages exclude unmeasured rows', () => {
  it('unmeasured rows do not drag the average toward perfect', () => {
    const rows = [{ gapPercent: 80 }, { gapPercent: null }, { gapPercent: null }]
    // Pre-fix: (20 + 100 + 100) / 3 = 73.3 — the more we failed to measure,
    // the healthier the estate looked.
    expect(avgLpScore(rows)).toBe(20)
  })

  it('reports no average at all when nothing was measured', () => {
    // Previously 100. An estate where every row failed to measure is not a
    // perfect estate — it is an unknown one, and the card must say so.
    expect(avgLpScore([{ gapPercent: null }])).toBeNull()
    expect(avgLpScore([])).toBeNull()
  })
})

describe('sorting does not treat unmeasured as clean', () => {
  it('unmeasured sorts apart from a genuine zero gap', () => {
    expect(gapOf({ gapCount: null })).toBe(-1)
    expect(gapOf({ gapCount: 0 })).toBe(0)
    expect(gapOf({ gapCount: 12 })).toBe(12)
  })

  it('descending order puts real gaps first and unmeasured last within a tier', () => {
    const nodes = [{ gapCount: null }, { gapCount: 5 }, { gapCount: 0 }]
    const sorted = [...nodes].sort((a, b) => gapOf(b) - gapOf(a))
    expect(sorted.map(gapOf)).toEqual([5, 0, -1])
  })
})

describe('null never reaches a template string', () => {
  it('interpolating a raw null yields the literal word', () => {
    const gapCount: number | null = null
    expect(`has ${gapCount} unused permissions`).toBe('has null unused permissions')
    expect(`has ${gapCount ?? 0} unused permissions`).toBe('has 0 unused permissions')
  })
})

describe('presence guards use loose null checks', () => {
  it('!== undefined lets null through; != null does not', () => {
    const usedCount: number | null = null
    expect(usedCount !== undefined).toBe(true) // renders a blank value
    expect(usedCount != null).toBe(false) // omits the row — correct
  })

  it('a real zero is still shown', () => {
    const usedCount = 0
    expect(usedCount != null).toBe(true)
  })
})
