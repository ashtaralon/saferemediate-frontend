/// <reference types="vitest/globals" />

// Marks this file a MODULE. Without an import or export, TypeScript
// treats a .ts file as a SCRIPT and its top-level declarations become
// GLOBAL — so two test files that both declare a helper named `Row` or
// `isRemediated` collide, and tsc reports the error against BOTH. These
// replica-style tests deliberately re-declare small local types, so they
// must each be scoped.
export {}

/**
 * A placeholder severity must not render as an assessment.
 *
 * A row whose usage was never computed carries `severity: 'LOW'` on the wire.
 * That LOW is a PLACEHOLDER, set upstream so escalation primitives have a
 * baseline to lift from — INFO floors them too low and makes the mapper drop
 * the row entirely — not because anything assessed the role as low risk.
 *
 * Rendering it as "Low" told the operator the opposite of the truth about four
 * production roles Cyntro could not read, sitting next to USED / UNUSED /
 * BLAST RADIUS all showing "?".
 *
 * Corrected in the frontend rather than on the wire, deliberately:
 *   - `Severity` is a closed enum (CRITICAL/HIGH/MEDIUM/LOW) that :LPFinding
 *     validates against, so a new value would fail Pydantic on the substrate.
 *   - `normalizeLpSeverity` falls back to 'low' for anything unrecognised, so
 *     a new value would render as Low regardless.
 *   - The placeholder is load-bearing upstream.
 * The honest signal is already on the wire: `usageMeasured`.
 */

type Row = {
  severity?: string
  usageMeasured?: boolean
  countsTowardSummary?: boolean
  remediatedAt?: string | null
  resourceType?: string
  allowedCount?: number | null
}

const isRemediated = (r: Row) => !!r.remediatedAt
const isUnassessed = (r: Row) => r.usageMeasured === false

/** components/LeastPrivilegeTab.tsx — getSeverityLabel branch selection. */
function severityLabel(r: Row): string {
  if (isRemediated(r)) return 'Remediated'
  if (isUnassessed(r)) return 'Not assessed'
  return String(r.severity ?? 'LOW').toLowerCase()
}

/** components/LeastPrivilegeTab.tsx — normalizeLpSeverity. */
const BUCKETS = ['critical', 'high', 'medium', 'low'] as const
function normalize(severity?: string | null) {
  const key = String(severity || 'low').toLowerCase()
  return (BUCKETS as readonly string[]).includes(key) ? key : 'low'
}

/** components/LeastPrivilegeTab.tsx — recalculateSummary severity counts. */
function severityCounts(rows: Row[], { honourVisibility = true } = {}) {
  const countable = honourVisibility
    ? rows.filter((r) => r.countsTowardSummary !== false)
    : rows
  return countable.reduce(
    (acc, r) => { acc[normalize(r.severity) as keyof typeof acc] += 1; return acc },
    { critical: 0, high: 0, medium: 0, low: 0 },
  )
}

/** The four production roles, exactly as served. */
const UNMEASURED: Row = { severity: 'LOW', usageMeasured: false, countsTowardSummary: false }
const MEASURED_LOW: Row = { severity: 'LOW', countsTowardSummary: true }

describe('the severity badge', () => {
  it('reads "Not assessed" for a row nobody could measure', () => {
    expect(severityLabel(UNMEASURED)).toBe('Not assessed')
  })

  it('pre-fix it read as a genuine Low', () => {
    const preFix = (r: Row) => (isRemediated(r) ? 'Remediated' : String(r.severity).toLowerCase())
    expect(preFix(UNMEASURED)).toBe('low')
  })

  it('leaves a genuinely low-severity row alone', () => {
    expect(severityLabel(MEASURED_LOW)).toBe('low')
  })

  it('does not fire on an un-annotated row', () => {
    // undefined means "analyzer has not adopted the contract", not unassessed.
    expect(severityLabel({ severity: 'HIGH' })).toBe('high')
  })

  it('remediated still wins — it is the more specific state', () => {
    expect(severityLabel({ ...UNMEASURED, remediatedAt: '2026-05-24' })).toBe('Remediated')
  })
})

describe('severity counts honour the aggregator visibility flag', () => {
  // Production shape: five rows carry LOW, four of them unmeasured.
  const estate: Row[] = [
    MEASURED_LOW,
    { ...UNMEASURED }, { ...UNMEASURED }, { ...UNMEASURED }, { ...UNMEASURED },
    { severity: 'CRITICAL', countsTowardSummary: true },
  ]

  it('counts only what was actually assessed', () => {
    // Matches the backend, which reports lowCount=1 for exactly this data.
    expect(severityCounts(estate).low).toBe(1)
  })

  it('pre-fix the recompute inflated it to five', () => {
    // The divergence was silent: the initial render used the backend summary
    // (1) and this recompute only runs after dismiss/remediate, so the number
    // changed on the user's first action.
    expect(severityCounts(estate, { honourVisibility: false }).low).toBe(5)
  })

  it('does not disturb the other buckets', () => {
    expect(severityCounts(estate).critical).toBe(1)
    expect(severityCounts(estate).high).toBe(0)
    expect(severityCounts(estate).medium).toBe(0)
  })
})

describe('why this was not fixed on the wire', () => {
  it('an invented severity value would render as Low anyway', () => {
    // normalizeLpSeverity falls back to 'low' for anything unrecognised, so
    // emitting "UNKNOWN" would have changed nothing the operator sees — while
    // also failing the closed Severity enum on the :LPFinding substrate.
    expect(normalize('UNKNOWN')).toBe('low')
    expect(normalize('UNMEASURED')).toBe('low')
    expect(normalize(null)).toBe('low')
  })
})
