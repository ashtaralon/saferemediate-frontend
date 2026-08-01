/// <reference types="vitest/globals" />

// Marks this file a MODULE. Without an import or export, TypeScript
// treats a .ts file as a SCRIPT and its top-level declarations become
// GLOBAL — so two test files that both declare a helper named `Row` or
// `isRemediated` collide, and tsc reports the error against BOTH. These
// replica-style tests deliberately re-declare small local types, so they
// must each be scoped.
export {}

/**
 * A role we could not read must never present as a role we fixed.
 *
 * Fully Remediated requires an explicit backend receipt (remediatedAt).
 * Never infer from zero counts or missing usageMeasured — allowedCount
 * null/0 must not go green.
 */

type Row = {
  resourceType?: string
  allowedCount?: number | null
  usedCount?: number | null
  gapCount?: number | null
  gapPercent?: number | null
  remediatedAt?: string | null
  usageMeasured?: boolean
  verificationState?: 'applied_verifying' | 'verify_failed' | null
  evidence?: { violatedRules?: unknown[] }
}

/** components/LeastPrivilegeTab.tsx — isRemediatedResource (receipt-only). */
function isRemediated(r: Row) {
  if (
    r.verificationState === 'applied_verifying' ||
    r.verificationState === 'verify_failed'
  ) {
    return false
  }
  return !!r.remediatedAt
}

/** The original count-based defect (no usageMeasured guard), for contrast. */
function isRemediatedPreFix(r: Row) {
  return !!(
    r.remediatedAt ||
    (
      r.resourceType === 'IAMRole' &&
      r.allowedCount === 0 &&
      (r.evidence?.violatedRules?.length ?? 0) === 0
    )
  )
}

/** components/LeastPrivilegeTab.tsx — getUsageMetricsForResource, post-fix. */
function usageMetrics(r: Row) {
  if (r.usageMeasured === false || (r.usedCount === null && r.gapCount === null)) {
    return { usedCount: null, unusedCount: null, gapPct: null, measured: false }
  }
  const used = r.usedCount ?? 0
  const unused = r.gapCount ?? 0
  const total = r.allowedCount || used + unused || 1
  return { usedCount: used, unusedCount: unused, gapPct: Math.round((unused / total) * 100), measured: true }
}

/** The exact production row, as served before the flip. */
const SYNC_FAILED_AS_SHIPPED: Row = {
  resourceType: 'IAMRole',
  allowedCount: 0,
  usedCount: 0,
  gapCount: 0,
  gapPercent: 0,
  remediatedAt: null,
  usageMeasured: false,
}

/** The same role after the backend flip. */
const SYNC_FAILED_NULLED: Row = {
  ...SYNC_FAILED_AS_SHIPPED,
  usedCount: null,
  gapCount: null,
  gapPercent: null,
  allowedCount: null,
}

describe('the production defect', () => {
  it('shipped predicate marked an unreadable role as remediated', () => {
    expect(isRemediatedPreFix(SYNC_FAILED_AS_SHIPPED)).toBe(true)
  })

  it('receipt-only predicate does not, even with the old all-zero row', () => {
    expect(isRemediated(SYNC_FAILED_AS_SHIPPED)).toBe(false)
  })

  it('and does not with the nulled row either', () => {
    expect(isRemediated(SYNC_FAILED_NULLED)).toBe(false)
  })

  it('missing allowedCount + missing usageMeasured is not Fully Remediated', () => {
    expect(isRemediated({ resourceType: 'IAMRole', allowedCount: null })).toBe(false)
    expect(isRemediated({ resourceType: 'IAMRole', allowedCount: 0 })).toBe(false)
  })
})

describe('the guard does not over-reach', () => {
  it('zero counts alone are never remediated without remediatedAt', () => {
    expect(isRemediated({ resourceType: 'IAMRole', allowedCount: 0, usageMeasured: true })).toBe(false)
  })

  it('an explicitly remediated role stays remediated regardless', () => {
    expect(isRemediated({ resourceType: 'IAMRole', remediatedAt: '2026-05-24', usageMeasured: false })).toBe(true)
  })

  it('VERIFYING is not remediated even if a stale local remediatedAt exists', () => {
    expect(isRemediated({
      resourceType: 'IAMRole',
      remediatedAt: '2026-05-24',
      verificationState: 'applied_verifying',
    })).toBe(false)
  })
})

describe('usage metrics report unmeasured as its own state', () => {
  it('the all-zero row was reported as measured and clean', () => {
    const preFix = (r: Row) =>
      r.usedCount === null && r.gapCount === null
        ? { measured: false, gapPct: null }
        : { measured: true, gapPct: 0 }
    expect(preFix(SYNC_FAILED_AS_SHIPPED).measured).toBe(true)
  })

  it('is now unmeasured on the explicit signal alone', () => {
    const m = usageMetrics(SYNC_FAILED_AS_SHIPPED)
    expect(m.measured).toBe(false)
    expect(m.gapPct).toBeNull()
  })

  it('is unmeasured on null counts alone, without the flag', () => {
    const m = usageMetrics({ resourceType: 'IAMRole', usedCount: null, gapCount: null, allowedCount: 27 })
    expect(m.measured).toBe(false)
  })

  it('a measured role is untouched', () => {
    const m = usageMetrics({ resourceType: 'IAMRole', allowedCount: 27, usedCount: 4, gapCount: 23 })
    expect(m.measured).toBe(true)
    expect(m.gapPct).toBe(85)
  })
})

describe('unmeasured rows stay out of the fleet averages', () => {
  const avg = (rows: Row[]) => {
    const measured = rows.filter((r) => usageMetrics(r).gapPct !== null)
    if (measured.length === 0) return null
    return measured.reduce((t, r) => t + (100 - (usageMetrics(r).gapPct as number)), 0) / measured.length
  }

  it('excludes the unmeasured role rather than scoring it 100', () => {
    const rows: Row[] = [
      { resourceType: 'IAMRole', allowedCount: 27, usedCount: 4, gapCount: 23 }, // gapPct 85 -> 15
      SYNC_FAILED_AS_SHIPPED,
    ]
    expect(avg(rows)).toBe(15)
  })

  it('reports null when every row is unmeasured', () => {
    expect(avg([SYNC_FAILED_AS_SHIPPED, SYNC_FAILED_NULLED])).toBeNull()
  })
})
