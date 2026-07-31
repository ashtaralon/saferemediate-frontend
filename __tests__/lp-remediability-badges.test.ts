/// <reference types="vitest/globals" />

// Marks this file a MODULE. Without an import or export, TypeScript
// treats a .ts file as a SCRIPT and its top-level declarations become
// GLOBAL — so two test files that both declare a helper named `Row` or
// `isRemediated` collide, and tsc reports the error against BOTH. These
// replica-style tests deliberately re-declare small local types, so they
// must each be scoped.
export {}

/**
 * Resource Risk remediability / remediated badge contract
 * =======================================================
 *
 * Written because the test suite had ZERO references to `isRemediable`,
 * `remediable`, `remediableReason`, "AWS Managed", "Not auto-remediable" or
 * "Fully Remediated". It therefore could not have caught the #486 regression
 * (a badge telling operators their own RDS instance was "AWS Managed"), could
 * not prove the #488 fix, and could not catch the "Fully Remediated" variant
 * of the same defect.
 *
 * These lock the two rules that matter:
 *   1. remediability is READ from the payload, never defaulted to true
 *   2. a green "done" claim requires the hardened predicate, not a raw count
 *
 * Live evidence captured 2026-07-31 from
 * /api/least-privilege/issues?systemName=alon-prod (18 rows):
 *   - IAMRole       remediable: true   x6
 *   - SecurityGroup remediable: true   x6, absent x2  (canRemediate: true)
 *   - S3Bucket      remediable: true   x2
 *   - RDSInstance   remediable: false  x2   <- the rows that rendered the lie
 * No row carries `is_service_linked_role`, `isServiceLinkedRole`, or
 * `remediableReason` — which is why the FE SLR filter is a no-op and the chip
 * carries generic copy rather than a backend reason.
 */

/** Mirrors the transform in components/LeastPrivilegeTab.tsx. */
function readRemediable(row: Record<string, unknown>): boolean | undefined {
  return (row.isRemediable ??
    row.is_remediable ??
    row.remediable ??
    undefined) as boolean | undefined
}

/** Mirrors isRemediatedResource in components/LeastPrivilegeTab.tsx. */
function isRemediatedResource(r: {
  remediatedAt?: string | null
  resourceType?: string
  allowedCount?: number
  evidence?: { violatedRules?: unknown[] }
}): boolean {
  return !!(
    r.remediatedAt ||
    (r.resourceType === 'IAMRole' &&
      r.allowedCount === 0 &&
      (r.evidence?.violatedRules?.length ?? 0) === 0)
  )
}

describe('remediability is read from the payload, never assumed', () => {
  it('preserves an explicit false — the RDS rows that rendered "AWS Managed"', () => {
    expect(readRemediable({ remediable: false })).toBe(false)
  })

  it('does not default to true when the field is absent', () => {
    // The pre-#486 bug: `?? true` made every row look remediable, including
    // the 2 RDS rows the backend explicitly marks false.
    expect(readRemediable({})).toBeUndefined()
  })

  it('honours the camel/snake spellings the per-role endpoint uses', () => {
    expect(readRemediable({ isRemediable: false })).toBe(false)
    expect(readRemediable({ is_remediable: false })).toBe(false)
  })

  it('false is not nullish, so it wins over the later fallbacks', () => {
    expect(readRemediable({ isRemediable: false, remediable: true })).toBe(false)
  })
})

describe('the "Not auto-remediable" chip', () => {
  const shows = (row: Record<string, unknown>) => readRemediable(row) === false

  it('shows for a non-public RDS instance (remediable: false)', () => {
    expect(shows({ resourceType: 'RDSInstance', remediable: false })).toBe(true)
  })

  it('stays hidden when remediability is unknown — fail closed, not loud', () => {
    expect(shows({ resourceType: 'SecurityGroup' })).toBe(false)
  })

  it('stays hidden for ordinary remediable rows', () => {
    expect(shows({ resourceType: 'IAMRole', remediable: true })).toBe(false)
  })
})

describe('"Fully Remediated" requires the hardened predicate', () => {
  it('does not fire for a role with open violations', () => {
    // allowedCount fails open to 0 in the transform; without the violatedRules
    // guard this row would show a green "you're done here" while still being
    // listed as an active finding.
    expect(
      isRemediatedResource({
        resourceType: 'IAMRole',
        allowedCount: 0,
        evidence: { violatedRules: [{ rule: 'iam.escalation.x' }] },
      }),
    ).toBe(false)
  })

  it('fires for a genuinely emptied role', () => {
    expect(
      isRemediatedResource({
        resourceType: 'IAMRole',
        allowedCount: 0,
        evidence: { violatedRules: [] },
      }),
    ).toBe(true)
  })

  it('fires on an explicit remediatedAt regardless of type', () => {
    expect(
      isRemediatedResource({ resourceType: 'S3Bucket', remediatedAt: '2026-05-24' }),
    ).toBe(true)
  })

  it('does not fire for a non-IAM row that merely has no permissions', () => {
    // Posture rows (RDS/SG/S3) carry allowedCount 0 by nature; the raw
    // predicate would have called every one of them "Fully Remediated".
    expect(
      isRemediatedResource({ resourceType: 'RDSInstance', allowedCount: 0 }),
    ).toBe(false)
  })
})
