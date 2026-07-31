/// <reference types="vitest/globals" />
/**
 * A role we could not read must never present as a role we fixed.
 *
 * Found by E2E QA against production, 2026-08-01. Four live IAM roles —
 * alon-prod-{web,app,lambda,report}-role — appeared under the Remediated tab
 * with a green check and the status "Least Privilege". Their permissions sync
 * had failed with NoSuchEntity from iam:GetRole. Cyntro was presenting its own
 * blind spots as its best possible outcome, which is the single worst
 * direction for this product to be wrong in.
 *
 * The mechanism was arithmetic, not intent. The remediated predicate is:
 *
 *     resourceType === 'IAMRole' && allowedCount === 0 && no violated rules
 *
 * and an unmeasured row arrived as allowedCount/usedCount/gapCount all 0.
 * Nothing in that shape distinguishes "this role has no permissions left"
 * from "we could not read this role's permissions".
 *
 * Two independent defences, because either alone can be defeated:
 *   1. the backend no longer emits zeros for an unmeasured row (counts null)
 *   2. the predicate consults `usageMeasured === false` directly, so it holds
 *      even for an analyzer that has not adopted the null contract
 *
 * These pin the predicates rather than the JSX, so they survive re-layouts.
 */

type Row = {
  resourceType?: string
  allowedCount?: number | null
  usedCount?: number | null
  gapCount?: number | null
  gapPercent?: number | null
  remediatedAt?: string | null
  usageMeasured?: boolean
  evidence?: { violatedRules?: unknown[] }
}

/** components/LeastPrivilegeTab.tsx — isRemediatedResource, post-fix. */
function isRemediated(r: Row) {
  return !!(
    r.remediatedAt ||
    (
      r.resourceType === 'IAMRole' &&
      r.usageMeasured !== false &&
      r.allowedCount === 0 &&
      (r.evidence?.violatedRules?.length ?? 0) === 0
    )
  )
}

/** The predicate as it shipped, for contrast. */
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
}

describe('the production defect', () => {
  it('shipped predicate marked an unreadable role as remediated', () => {
    expect(isRemediatedPreFix(SYNC_FAILED_AS_SHIPPED)).toBe(true)
  })

  it('fixed predicate does not, even with the old all-zero row', () => {
    expect(isRemediated(SYNC_FAILED_AS_SHIPPED)).toBe(false)
  })

  it('and does not with the nulled row either', () => {
    expect(isRemediated(SYNC_FAILED_NULLED)).toBe(false)
  })
})

describe('the guard does not over-reach', () => {
  it('a genuinely emptied role is still remediated', () => {
    expect(isRemediated({ resourceType: 'IAMRole', allowedCount: 0, usageMeasured: true })).toBe(true)
  })

  it('a row with no usageMeasured annotation is unaffected', () => {
    // undefined means "analyzer has not adopted the contract", NOT unmeasured.
    // This is why the check is `=== false` and never `!r.usageMeasured`.
    expect(isRemediated({ resourceType: 'IAMRole', allowedCount: 0 })).toBe(true)
  })

  it('an explicitly remediated role stays remediated regardless', () => {
    expect(isRemediated({ resourceType: 'IAMRole', remediatedAt: '2026-05-24', usageMeasured: false })).toBe(true)
  })

  it('open violated rules still keep a role out of remediated', () => {
    expect(isRemediated({
      resourceType: 'IAMRole', allowedCount: 0, evidence: { violatedRules: ['x'] },
    })).toBe(false)
  })
})

describe('usage metrics report unmeasured as its own state', () => {
  it('the all-zero row was reported as measured and clean', () => {
    // The second half of the same failure: 0/0 looked like a real measurement,
    // so these rows entered the fleet averages as perfect scores.
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
    // Pre-fix this averaged (15 + 100) / 2 = 57.5 — the unreadable role
    // pulling the estate score UP by 42.5 points.
    expect(avg(rows)).toBe(15)
  })

  it('reports null when every row is unmeasured', () => {
    expect(avg([SYNC_FAILED_AS_SHIPPED, SYNC_FAILED_NULLED])).toBeNull()
  })
})
